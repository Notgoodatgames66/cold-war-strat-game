import { describe, expect, it } from 'vitest';
import sectorsData from '../data/economy/sectors.json';
import { buildContent, validatePlan } from '../src/sim/content';
import { createPlannedEconomy, planAt, stepPlanned } from '../src/sim/economy/planned';
import type { EconomyState, PlanKeyframe, PlannedEconomyState } from '../src/sim/economy/types';
import { content } from '../src/sim/loadContent';
import { deserializeGame, serializeGame } from '../src/sim/save';
import type { GameState, PlayerOrders } from '../src/sim/schema';
import { advanceTurn, stateChecksum } from '../src/sim/turn';
import { createGame } from '../src/sim/world';

const newGame = (seed = 'planned-test') => createGame(content, 'usa-1949', seed);
const soviet = (g: GameState) => g.nations.ussr!.economy as PlannedEconomyState;
const us = (g: GameState) => g.nations.usa!.economy as EconomyState;
const stat = (g: GameState, nation: string, id: string) => g.nations[nation]!.stats[id]!;

/** Plays quarters, calling `each` after every one. `orders(i)` gives the orders for quarter i. */
function play(turns: number, orders: (i: number) => PlayerOrders = () => ({}), each?: (g: GameState, i: number) => void): GameState {
  let g = newGame();
  for (let i = 0; i < turns; i++) {
    g = advanceTurn(g, orders(i));
    each?.(g, i);
  }
  return g;
}

/** Korea-scale US rearmament: defence to $22bn in Q3 1950 and $45bn from Q1 1951. */
const korea = (i: number): PlayerOrders => (i === 6 ? { budget: { defence: 22 } } : i === 8 ? { budget: { defence: 45 } } : {});

const plan = content.economy.plans['ussr-five-year-plans']!;
const sectorIds = content.economy.sectors.map((s) => s.id);

describe('the Soviet economy in 1949', () => {
  const e = soviet(newGame());

  it('runs on the planned engine', () => {
    expect(e.engine).toBe('planned');
    expect(e.rival).toBe('usa');
  });

  it('spending adds up to GDP: C + I + defence + civil + X − M = Y', () => {
    const total = e.consumption + e.fixedInvestment + e.inventoryInvestment + e.defence + e.civilGovernment + e.exports - e.imports;
    expect(total).toBeCloseTo(90, 9);
  });

  it('the 1949 Plan shares come from the first keyframe', () => {
    expect(e.fixedInvestment / e.gdpReal).toBeCloseTo(plan.keyframes[0]!.investment, 9);
    expect(e.defence / e.gdpReal).toBeCloseTo(plan.keyframes[0]!.defence, 9);
  });

  it('is about a third the size of the American economy (Maddison: 0.35)', () => {
    const g = newGame();
    const ratio = stat(g, 'ussr', 'gdp_real') / stat(g, 'usa', 'gdp_real');
    expect(ratio).toBeGreaterThan(0.3);
    expect(ratio).toBeLessThan(0.4);
  });

  it('households find some of their demand unmet: the calibrated 1949 shortage', () => {
    expect(e.shortageRate).toBeCloseTo(5, 9);
    expect(e.consumptionDemand).toBeGreaterThan(e.consumption);
  });
});

describe('planAt: the plan in force at a date', () => {
  const kf = (year: number, investment: number, heavy: number): PlanKeyframe => ({
    year,
    label: `Plan ${year}`,
    investment,
    defence: 0.1,
    civil: 0.1,
    exports: 0.02,
    rivalDefenceShare: 0.05,
    priority: Object.fromEntries(sectorIds.map((id) => [id, id === 'heavy_industry' ? heavy : 1])),
    provenance: 'estimate',
    note: 'test',
  });
  const frames = [kf(1950, 0.2, 1), kf(1960, 0.3, 2)];
  const heavy = sectorIds.indexOf('heavy_industry');

  it('at a keyframe, gives that keyframe', () => {
    expect(planAt(frames, sectorIds, 1950).investment).toBeCloseTo(0.2, 12);
    expect(planAt(frames, sectorIds, 1960).label).toBe('Plan 1960');
  });

  it('between keyframes, shares move smoothly while priorities stay with the plan in force', () => {
    const mid = planAt(frames, sectorIds, 1955);
    expect(mid.investment).toBeCloseTo(0.25, 12);
    expect(mid.label).toBe('Plan 1950');
    expect(mid.priority[heavy]).toBe(1);
  });

  it('before the first and after the last keyframe, holds the nearest one', () => {
    expect(planAt(frames, sectorIds, 1940).investment).toBeCloseTo(0.2, 12);
    expect(planAt(frames, sectorIds, 1990).investment).toBeCloseTo(0.3, 12);
    expect(planAt(frames, sectorIds, 1990).priority[heavy]).toBe(2);
  });
});

describe('the planned economy over time', () => {
  it('the accounts close every quarter, and output never exceeds the Plan', () => {
    play(40, korea, (g) => {
      const e = soviet(g);
      const total = e.consumption + e.fixedInvestment + e.defence + e.civilGovernment + e.exports - e.imports;
      expect(Math.abs(total - e.gdpReal) / e.gdpReal).toBeLessThan(1e-6);
      expect(e.gdpReal).toBeLessThanOrEqual(e.potential * (1 + e.tension) * (1 + 1e-6));
    });
  });

  it('grows at 4–7% a year in the early 1950s (Western estimates: about 5–6%)', () => {
    play(28, undefined, (g, i) => {
      if (i >= 8) {
        const growth = stat(g, 'ussr', 'real_growth');
        expect(growth).toBeGreaterThan(4);
        expect(growth).toBeLessThan(7);
      }
    });
  });

  it('growth slows over the decades as productivity growth fades', () => {
    const growth: number[] = [];
    play(160, undefined, (g, i) => {
      if (i % 4 === 3) growth.push(stat(g, 'ussr', 'real_growth'));
    });
    const decade = (from: number) => growth.slice(from, from + 10).reduce((a, b) => a + b, 0) / 10;
    expect(decade(2)).toBeGreaterThan(decade(12));
    expect(decade(12)).toBeGreaterThan(decade(26));
    expect(decade(26)).toBeGreaterThan(1.5);
  });

  it('closes on America through the 1960s, then falls behind again (Maddison: 0.35 → 0.44 → 0.36)', () => {
    const ratio: Record<number, number> = {};
    play(164, (i) => (i === 0 ? { budgetIndexed: true } : {}), (g) => {
      if (g.date.quarter === 1) ratio[g.date.year] = stat(g, 'ussr', 'gdp_real') / stat(g, 'usa', 'gdp_real');
    });
    expect(ratio[1970]!).toBeGreaterThan(ratio[1950]! + 0.04);
    expect(ratio[1970]!).toBeLessThan(0.47);
    expect(ratio[1989]!).toBeLessThan(ratio[1970]!);
  });

  it('steel and industrial production rise every year', () => {
    let steel = stat(newGame(), 'ussr', 'steel_output');
    let ip = 100;
    play(40, undefined, (g, i) => {
      if (i % 4 !== 3) return;
      expect(stat(g, 'ussr', 'steel_output')).toBeGreaterThan(steel);
      expect(stat(g, 'ussr', 'industrial_output')).toBeGreaterThan(ip);
      steel = stat(g, 'ussr', 'steel_output');
      ip = stat(g, 'ussr', 'industrial_output');
    });
  });

  it('is valued at American prices: its price level is the United States’', () => {
    const g = play(12, korea);
    const sovietPrice = stat(g, 'ussr', 'gdp_nominal') / stat(g, 'ussr', 'gdp_real');
    expect(sovietPrice).toBeCloseTo(us(g).priceLevel, 9);
  });
});

describe('the arms race', () => {
  const shares = (orders: (i: number) => PlayerOrders) => {
    const out: { soviet: number; american: number; consumption: number; investment: number }[] = [];
    play(24, orders, (g) => {
      const e = soviet(g);
      out.push({
        soviet: e.targets.defence,
        american: stat(g, 'usa', 'defence_spending') / stat(g, 'usa', 'gdp_nominal'),
        consumption: e.consumption / e.gdpReal,
        investment: e.fixedInvestment / e.gdpReal,
      });
    });
    return out;
  };
  const calm = shares(() => ({}));
  const war = shares(korea);

  it('American rearmament makes Moscow rearm too, by the reaction set in the data', () => {
    const q = 11; // Q4 1951
    const reaction = content.economy.models.planned!.params.arms_race_reaction!.value;
    expect(war[q]!.soviet).toBeGreaterThan(calm[q]!.soviet + 0.02);
    const expected = reaction * (war[q]!.american - calm[q]!.american);
    expect(war[q]!.soviet - calm[q]!.soviet).toBeCloseTo(expected, 6);
  });

  it('Soviet rearmament comes out of households, not the Plan’s investment', () => {
    const q = 11;
    expect(war[q]!.consumption).toBeLessThan(calm[q]!.consumption - 0.01);
    expect(Math.abs(war[q]!.investment - calm[q]!.investment)).toBeLessThan(0.005);
  });

  it('when America demobilises, Moscow eases off', () => {
    const peace = shares((i) => (i === 0 ? { budget: { defence: 5 } } : {}));
    expect(peace[11]!.soviet).toBeLessThan(calm[11]!.soviet);
  });

  it('defence stays within the planners’ limits however much America spends', () => {
    const p = content.economy.models.planned!.params;
    const all = shares(() => ({ budget: { defence: 500 } }));
    for (const s of all) {
      expect(s.soviet).toBeLessThanOrEqual(p.max_defence_share!.value + 1e-12);
      expect(s.soviet).toBeGreaterThanOrEqual(p.min_defence_share!.value - 1e-12);
    }
  });
});

describe('shortages and the savings overhang', () => {
  const fresh = () => createPlannedEconomy(content.nations.ussr!, content.economy);
  const ctx = { date: { year: 1949, quarter: 1 as const }, rivalDefenceShare: 0.048, valuationPrice: 1 };

  it('the planners slowly balance incomes with goods: the 1949 shortage eases through the 1950s', () => {
    const g = play(28);
    expect(soviet(g).shortageRate).toBeLessThan(4);
    expect(soviet(g).shortageRate).toBeGreaterThan(0);
  });

  it('money that finds nothing to buy piles up as savings', () => {
    const g = play(8);
    expect(stat(g, 'ussr', 'savings_overhang')).toBeGreaterThan(3);
  });

  it('a bottleneck on the farms empties the shops and swells the overhang', () => {
    const normal = fresh();
    const blighted = fresh();
    const farms = blighted.industry.sectors.indexOf('agriculture');
    blighted.industry.capital[farms]! *= 0.6;
    stepPlanned(normal, ctx);
    stepPlanned(blighted, ctx);
    expect(blighted.shortageRate).toBeGreaterThan(normal.shortageRate + 2);
    expect(blighted.savingsOverhang).toBeGreaterThan(normal.savingsOverhang);
    expect(blighted.industry.unmet.consumption).toBeGreaterThan(blighted.industry.unmet.government);
  });

  it('households are cut first: the Plan’s own orders are protected', () => {
    const blighted = fresh();
    blighted.industry.capital = blighted.industry.capital.map((k) => k * 0.8);
    stepPlanned(blighted, ctx);
    const u = blighted.industry.unmet;
    expect(u.consumption).toBeGreaterThan(0);
    expect(u.consumption).toBeGreaterThan(u.fixed_investment);
    expect(u.consumption).toBeGreaterThan(u.government);
  });
});

describe('plan files are checked', () => {
  const sectors = content.economy.sectors;

  it('the shipped Five-Year Plans are valid', () => {
    expect(validatePlan(plan, 'plans/ussr.json', sectors)).toEqual([]);
  });

  it('rejects keyframes out of order', () => {
    const bad = { ...plan, keyframes: [plan.keyframes[1], plan.keyframes[0]] };
    expect(validatePlan(bad, 'bad.json', sectors).join(' ')).toMatch(/increasing year order/);
  });

  it('rejects a plan that leaves households almost nothing', () => {
    const bad = { ...plan, keyframes: [{ ...plan.keyframes[0]!, investment: 0.5, defence: 0.4 }] };
    expect(validatePlan(bad, 'bad.json', sectors).join(' ')).toMatch(/leave households almost nothing/);
  });

  it('rejects a keyframe missing a sector’s priority', () => {
    const priority = { ...plan.keyframes[0]!.priority };
    delete priority.energy;
    const bad = { ...plan, keyframes: [{ ...plan.keyframes[0]!, priority }] };
    expect(validatePlan(bad, 'bad.json', sectors).join(' ')).toMatch(/missing "energy"/);
  });

  it('rejects a keyframe with no source note', () => {
    const bad = { ...plan, keyframes: [{ ...plan.keyframes[0]!, note: undefined }] };
    expect(validatePlan(bad, 'bad.json', sectors).join(' ')).toMatch(/needs a note/);
  });

  it('rejects a plan whose rival has no nation file', () => {
    expect(() =>
      buildContent({
        stats: [],
        nations: {},
        scenarios: {},
        economyModels: {},
        budgetLines: [],
        taxLines: [],
        sectors: sectorsData,
        industryTables: {},
        plans: { 'data/economy/plans/p.json': { ...plan, rival: 'atlantis' } },
      }),
    ).toThrow(/rival "atlantis" has no file in data\/nations/);
  });
});

describe('PHASE 2 GATE: 1949–55 is playable', () => {
  it('both superpowers play through 1949–55 with plausible figures, and the game saves and reloads mid-way', () => {
    let g = newGame('phase-2-gate');
    for (let i = 0; i < 28; i++) {
      g = advanceTurn(g, korea(i));
      if (i === 13) {
        const reloaded = deserializeGame(serializeGame(g), content);
        expect(stateChecksum(reloaded)).toBe(stateChecksum(g));
      }
      for (const nation of ['usa', 'ussr']) {
        for (const [id, value] of Object.entries(g.nations[nation]!.stats)) {
          expect(Number.isFinite(value), `${nation}.${id} in ${g.date.year} Q${g.date.quarter}`).toBe(true);
        }
      }
      expect(stat(g, 'usa', 'unemployment')).toBeGreaterThan(1.5);
      expect(stat(g, 'usa', 'unemployment')).toBeLessThan(9);
      expect(Math.abs(stat(g, 'usa', 'inflation'))).toBeLessThan(15);
      const ratio = stat(g, 'ussr', 'gdp_real') / stat(g, 'usa', 'gdp_real');
      expect(ratio).toBeGreaterThan(0.28);
      expect(ratio).toBeLessThan(0.45);
      expect(stat(g, 'ussr', 'consumer_shortage')).toBeGreaterThanOrEqual(0);
      expect(stat(g, 'ussr', 'consumer_shortage')).toBeLessThan(10);
    }
    expect(g.date).toEqual({ year: 1956, quarter: 1 });
    expect(stat(g, 'ussr', 'steel_output')).toBeGreaterThan(30);
    expect(stat(g, 'usa', 'steel_output')).toBeGreaterThan(70.7);
  });

  it('the same seed and orders give the same Cold War, quarter for quarter', () => {
    const a = play(20, korea);
    const b = play(20, korea);
    expect(stateChecksum(a)).toBe(stateChecksum(b));
    expect(soviet(a)).toEqual(soviet(b));
  });
});
