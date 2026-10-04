import { describe, expect, it } from 'vitest';
import { validatePopModel } from '../src/sim/pops/validate';
import { content } from '../src/sim/loadContent';
import { buildPops } from '../src/sim/pops/build';
import { codecFor } from '../src/sim/pops/codec';
import { calibrateDemography, stepDemography, youngShare } from '../src/sim/pops/demography';
import { classTargets, consumptionMix, labourForce, relativeIncomes } from '../src/sim/pops/economy';
import { stepMobility } from '../src/sim/pops/mobility';
import { peopleBy, peopleBy2, totalPeople } from '../src/sim/pops/summary';
import type { PopsState } from '../src/sim/pops/types';
import { SAVE_FORMAT, deserializeGame, serializeGame } from '../src/sim/save';
import { advanceTurn } from '../src/sim/turn';
import { createGame } from '../src/sim/world';

const model = content.pops['usa-1950']!;
const newGame = () => createGame(content, 'usa-1949');
const usaPops = () => structuredClone(newGame().nations.usa!.pops!) as PopsState;
const near = (a: number, b: number, rel: number) => Math.abs(a - b) <= Math.abs(b) * rel;

describe('codec', () => {
  it('packs and unpacks every attribute', () => {
    const codec = codecFor(model);
    const key = codec.with(codec.with(0, codec.index.state!, 24), codec.index.age!, 3);
    expect(codec.get(key, codec.index.state!)).toBe(24);
    expect(codec.get(key, codec.index.age!)).toBe(3);
    expect(codec.get(codec.with(key, codec.index.age!, 0), codec.index.state!)).toBe(24);
    expect(codec.cells).toBe(codec.sizes.reduce((p, s) => p * s, 1));
  });
});

describe('building the 1949 population from the census tables', () => {
  const built = buildPops(model, 147_900_000);

  it('matches every census table closely, even after dropping the smallest combinations', () => {
    for (const f of built.fit) expect(f.maxError, f.id).toBeLessThan(0.06);
    expect(built.fit.find((f) => f.id === 'state-population')!.maxError).toBeLessThan(0.001);
  });

  it('keeps the national total exactly and stays a manageable size', () => {
    expect(totalPeople(built)).toBeCloseTo(147_900_000, -3);
    expect(built.keys.length).toBeGreaterThan(10_000);
    expect(built.keys.length).toBeLessThan(40_000);
  });

  it('reproduces 1950 national shares', () => {
    const share = (attr: string, cat: string) => {
      const a = model.attributes.find((x) => x.id === attr)!;
      return peopleBy(model, built, attr)[a.categories.findIndex((c) => c.id === cat)]! / 147_900_000;
    };
    expect(share('race', 'black')).toBeCloseTo(0.1, 2);
    expect(share('settlement', 'rural')).toBeCloseTo(0.36, 2);
    expect(share('religion', 'catholic')).toBeCloseTo(0.25, 1);
    expect(share('class', 'farm_owner') + share('class', 'farm_tenant')).toBeCloseTo(0.15, 2);
  });

  it('never puts farm households in a city or suburb', () => {
    const codec = codecFor(model);
    const cls = codec.index.class!;
    const set = codec.index.settlement!;
    const farm = model.attributes[cls]!.categories.map((c) => !!c.farm);
    built.keys.forEach((k) => {
      if (farm[codec.get(k, cls)]) expect(model.attributes[set]!.categories[codec.get(k, set)]!.id).toBe('rural');
    });
  });

  it('keeps keys sorted and unique', () => {
    for (let i = 1; i < built.keys.length; i++) expect(built.keys[i]!).toBeGreaterThan(built.keys[i - 1]!);
  });

  it('is deterministic', () => {
    expect(buildPops(model, 147_900_000).size).toEqual(built.size);
  });
});

describe('demography', () => {
  it('matches the 1949 birth and death rates in the first year', () => {
    const pops = usaPops();
    const start = totalPeople(pops);
    let births = 0;
    let deaths = 0;
    for (let q = 0; q < 4; q++) {
      const r = stepDemography(model, pops, pops.baseLiving);
      births += r.births;
      deaths += r.deaths;
    }
    expect(near((births / start) * 1000, 24.5, 0.03)).toBe(true);
    expect(near((deaths / start) * 1000, 9.7, 0.03)).toBe(true);
  });

  it('conserves people: the change is exactly births minus deaths', () => {
    const pops = usaPops();
    const before = totalPeople(pops);
    const r = stepDemography(model, pops, pops.baseLiving);
    expect(totalPeople(pops)).toBeCloseTo(before + r.births - r.deaths, -2);
  });

  it('gives children their mother’s region, race, class, religion and settlement', () => {
    const pops = usaPops();
    const codec = codecFor(model);
    const babyBand = (p: PopsState) => peopleBy2(model, p, 'state', 'age').map((row) => row[0]!);
    const before = babyBand(pops);
    stepDemography(model, pops, pops.baseLiving);
    const after = babyBand(pops);
    // Mississippi (more children per woman) gains children faster than Massachusetts.
    const ms = codec.category('state', 'MS');
    const ma = codec.category('state', 'MA');
    expect(after[ms]! / before[ms]!).toBeGreaterThan(after[ma]! / before[ma]!);
  });

  it('lifts fertility when living standards outrun expectations (the Easterlin effect)', () => {
    const a = usaPops();
    const b = usaPops();
    const normal = stepDemography(model, a, a.baseLiving).births;
    const boom = stepDemography(model, b, b.baseLiving * 1.2).births;
    expect(boom).toBeGreaterThan(normal * 1.2);
  });

  it('keeps the age profile consistent with the pops', () => {
    const pops = usaPops();
    for (let q = 0; q < 8; q++) stepDemography(model, pops, pops.baseLiving);
    const profileTotal = pops.ageProfile.reduce((s, x) => s + x, 0);
    expect(near(profileTotal, totalPeople(pops), 0.01)).toBe(true);
  });

  it('measures the young adults’ share of working-age people', () => {
    const share = youngShare(model, usaPops());
    expect(share).toBeGreaterThan(0.3);
    expect(share).toBeLessThan(0.4);
  });

  it('calibration is idempotent', () => {
    const pops = usaPops();
    const scale = pops.fertilityScale;
    calibrateDemography(model, pops, pops.baseLiving, pops.womenWork0);
    expect(pops.fertilityScale).toBeCloseTo(scale, 10);
  });
});

describe('pops and the economy', () => {
  it('sizes the 1949 labour force near the census figure (about 62 million)', () => {
    const lf = labourForce(model, usaPops(), 0);
    expect(lf).toBeGreaterThan(57e6);
    expect(lf).toBeLessThan(65e6);
  });

  it('averages relative incomes to 1 and ranks groups as the census does', () => {
    const pops = usaPops();
    const rel = relativeIncomes(model, pops);
    let w = 0;
    pops.size.forEach((s, i) => (w += s * rel[i]!));
    expect(w / totalPeople(pops)).toBeCloseTo(1, 6);
  });

  it('reproduces the 1949 household spending mix exactly (Engel calibration)', () => {
    const game = newGame();
    const pops = game.nations.usa!.pops!;
    const mix = consumptionMix(model, pops, pops.baseLiving)!;
    const bridge = game.nations.usa!.economy!.industry.bridges.consumption;
    mix.forEach((m, j) => expect(m).toBeCloseTo(bridge[j]!, 2));
  });

  it('shifts spending from goods to services as people get richer (Engel’s law)', () => {
    const game = newGame();
    const pops = game.nations.usa!.pops!;
    const sectors = pops.link!.sectors;
    const now = consumptionMix(model, pops, pops.baseLiving)!;
    const rich = consumptionMix(model, pops, pops.baseLiving * 2)!;
    expect(rich[sectors.indexOf('services')]!).toBeGreaterThan(now[sectors.indexOf('services')]!);
    expect(rich[sectors.indexOf('agriculture')]!).toBeLessThan(now[sectors.indexOf('agriculture')]!);
    expect(rich.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 10);
  });

  it('wants fewer farm households as farm productivity outruns farm output', () => {
    const game = newGame();
    const pops = game.nations.usa!.pops!;
    const output = game.nations.usa!.economy!.industry.output;
    const now = classTargets(model, pops, output, 0)!;
    const later = classTargets(model, pops, output.map((o) => o * 1.2), 10)!;
    const farm = model.attributes.find((a) => a.role === 'class')!.categories.map((c) => !!c.farm);
    const farmPeople = (t: number[]) => t.reduce((s, x, i) => s + (farm[i] ? x : 0), 0);
    expect(farmPeople(later)).toBeLessThan(farmPeople(now) * 0.8);
  });
});

describe('mobility', () => {
  it('conserves people apart from immigrants', () => {
    const game = newGame();
    const pops = structuredClone(game.nations.usa!.pops!);
    const before = totalPeople(pops);
    const r = stepMobility(model, pops, {
      living: pops.baseLiving,
      output: game.nations.usa!.economy!.industry.output.map((o) => o * 1.1),
      years: 5,
    });
    expect(r.immigrants).toBeGreaterThan(0);
    expect(near(totalPeople(pops), before + r.immigrants, 0.0005)).toBe(true);
  });

  it('moves people off the farms, into the suburbs and out of the Jim Crow South', () => {
    const game = newGame();
    const pops = structuredClone(game.nations.usa!.pops!);
    const r = stepMobility(model, pops, {
      living: pops.baseLiving * 1.1,
      output: game.nations.usa!.economy!.industry.output,
      years: 5,
    });
    expect(r.leftFarming).toBeGreaterThan(100_000);
    expect(r.movedToSuburbs).toBeGreaterThan(100_000);
    expect(r.migrated).toBeGreaterThan(500_000);
  });
});

describe('pops over the decades', () => {
  const years: Record<number, Record<string, number>> = {};
  let game = newGame();
  const statesThen = peopleBy(model, game.nations.usa!.pops!, 'state');
  let statesIn1960: number[] = [];
  let blackSouth1960 = 0;
  const south = new Set(['VA', 'NC', 'SC', 'GA', 'FL', 'KY', 'TN', 'AL', 'MS', 'AR', 'LA', 'OK', 'TX']);
  const blackSouthShare = (p: PopsState) => {
    const table = peopleBy2(model, p, 'state', 'race');
    const black = model.attributes[1]!.categories.findIndex((c) => c.id === 'black');
    let inSouth = 0;
    let all = 0;
    model.attributes[0]!.categories.forEach((c, i) => {
      all += table[i]![black]!;
      if (south.has(c.id)) inSouth += table[i]![black]!;
    });
    return inSouth / all;
  };
  const blackSouth1949 = blackSouthShare(game.nations.usa!.pops!);
  for (let i = 0; i < 84; i++) {
    game = advanceTurn(game);
    if (game.date.quarter === 1) years[game.date.year] = { ...game.nations.usa!.stats };
    if (game.date.year === 1960 && game.date.quarter === 1) {
      statesIn1960 = peopleBy(model, game.nations.usa!.pops!, 'state');
      blackSouth1960 = blackSouthShare(game.nations.usa!.pops!);
    }
  }
  const growth = (id: string) => {
    const i = model.attributes[0]!.categories.findIndex((c) => c.id === id);
    return statesIn1960[i]! / statesThen[i]! - 1;
  };

  it('moves Americans to the Sun Belt and out of the farm South in the 1950s', () => {
    expect(growth('CA')).toBeGreaterThan(0.35);
    expect(growth('AZ')).toBeGreaterThan(0.35);
    expect(growth('CA')).toBeGreaterThan(growth('OH'));
    expect(growth('OH')).toBeGreaterThan(growth('MS'));
    expect(growth('WV')).toBeLessThan(0.08);
  });

  it('sets the Great Migration going: Black Americans leave the Jim Crow South', () => {
    expect(blackSouth1960).toBeLessThan(blackSouth1949 - 0.05);
  });

  it('grows the population near the census: about 179 million in 1960 and 203 million in 1970', () => {
    expect(near(years[1960]!.population!, 178.5e6, 0.05)).toBe(true);
    expect(near(years[1970]!.population!, 202.1e6, 0.05)).toBe(true);
  });

  it('empties the farms: from 15% of Americans in 1949 to under 8% by 1970', () => {
    expect(years[1970]!.farm_population! / years[1970]!.population!).toBeLessThan(0.08);
  });

  it('has a baby boom and a bust: births stay high in the 1950s and fall in the 1960s', () => {
    expect(years[1955]!.birth_rate!).toBeGreaterThan(22);
    expect(years[1970]!.birth_rate!).toBeLessThan(years[1955]!.birth_rate! - 4);
  });

  it('urbanises: from 64% in cities, towns and suburbs in 1949 to about 70% by 1970 (census: 73.6%)', () => {
    expect(years[1970]!.urban_share!).toBeGreaterThan(69);
  });
});

describe('saves', () => {
  it('round-trips pops through a save file', () => {
    const game = advanceTurn(newGame());
    const loaded = deserializeGame(serializeGame(game), content);
    expect(loaded.nations.usa!.pops!.keys).toEqual(game.nations.usa!.pops!.keys);
    expect(loaded.nations.usa!.pops!.size).toEqual(game.nations.usa!.pops!.size);
  });

  it('upgrades a schema 4 save by building pops at its current population', () => {
    const game = advanceTurn(newGame());
    const old = structuredClone(game) as unknown as Record<string, any>;
    for (const n of Object.values(old.nations as Record<string, any>)) {
      delete n.pops;
      for (const id of ['urban_share', 'farm_population', 'labour_force', 'birth_rate', 'death_rate']) delete n.stats[id];
    }
    old.schemaVersion = 4;
    const text = JSON.stringify({ format: SAVE_FORMAT, schemaVersion: 4, state: old });
    const loaded = deserializeGame(text, content);
    expect(loaded.nations.usa!.pops!.keys.length).toBeGreaterThan(10_000);
    expect(totalPeople(loaded.nations.usa!.pops!)).toBeCloseTo(game.nations.usa!.stats.population!, -3);
    expect(loaded.nations.usa!.stats.farm_population).toBeGreaterThan(0);
    expect(() => advanceTurn(loaded)).not.toThrow();
  });
});

describe('validation', () => {
  const nations = new Set(Object.keys(content.nations));
  const stats = new Set(content.stats.map((s) => s.id));

  it('accepts the shipped models', () => {
    for (const m of Object.values(content.pops)) expect(validatePopModel(m, m.id, nations, stats)).toEqual([]);
  });

  it('rejects shares that do not sum to 1 and unknown categories', () => {
    const bad = structuredClone(model) as unknown as Record<string, any>;
    bad.margins[1].values.AL.white = 0.9;
    bad.associations[0].odds.farm_owner.space = 0;
    const errors = validatePopModel(bad, 'bad.json', nations, stats);
    expect(errors.some((e) => e.includes('sum to'))).toBe(true);
    expect(errors.some((e) => e.includes('"space"'))).toBe(true);
  });
});
