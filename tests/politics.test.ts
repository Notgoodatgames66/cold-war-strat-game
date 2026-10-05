import { describe, expect, it } from 'vitest';
import { content } from '../src/sim/loadContent';
import { codecFor } from '../src/sim/pops/codec';
import { blocSeats, blocVotes, firstPartySeatsByBloc } from '../src/sim/politics/create';
import { cloutShares, groupStates, groupStrength } from '../src/sim/politics/groups';
import { leverChange, leverIds, leverValues } from '../src/sim/politics/levers';
import { approvalBy, approvalInputs, cellTables, logistic, logit, nationalApproval, votesByRegion } from '../src/sim/politics/opinion';
import { capitalRegeneration, legislativeSupport, stepPolitics } from '../src/sim/politics/step';
import { validatePoliticsModel } from '../src/sim/politics/validate';
import { SAVE_FORMAT, deserializeGame } from '../src/sim/save';
import { advanceTurn } from '../src/sim/turn';
import { createGame } from '../src/sim/world';

const model = content.politics['usa-1949']!;
const popModel = content.pops['usa-1950']!;
const newGame = () => createGame(content, 'usa-1949');
const usa = () => newGame().nations.usa!;

describe('levers', () => {
  it('measures budget changes in log points, taxes per 10 points and indexation as a switch worth 0.5', () => {
    expect(leverChange('budget:defence', 10, 20)).toBeCloseTo(Math.log(2), 10);
    expect(leverChange('tax:income', 8, 18)).toBeCloseTo(1, 10);
    expect(leverChange('indexation', 0, 1)).toBe(0.5);
  });

  it('reads every budget line, tax and indexation from a Keynesian economy', () => {
    const levers = leverValues(usa().economy);
    expect(levers['budget:defence']).toBe(13);
    expect(levers['tax:income']).toBe(8.3);
    expect(levers.indexation).toBe(0);
    expect(Object.keys(levers).length).toBe(leverIds(content.economy.budgetLines, content.economy.taxLines).size);
  });
});

describe('starting calibration', () => {
  const nation = usa();
  const p = nation.politics!;

  it('reproduces Truman’s 69% approval among those who may vote', () => {
    expect(p.approval).toBeCloseTo(0.69, 6);
    const recomputed = nationalApproval(model, popModel, nation.pops!, approvalInputs(model, p, leverValues(nation.economy)));
    expect(recomputed).toBeCloseTo(0.69, 4);
  });

  it('reproduces the normal vote, with the Solid South far more Democratic', () => {
    const v = blocVotes(model, popModel, votesByRegion(model, popModel, nation.pops!, p.calib.voteIntercept, 0));
    expect(v.all).toBeCloseTo(model.elections!.normalVote, 4);
    expect(v.core).toBeGreaterThan(0.7);
    expect(v.rest).toBeLessThan(v.core);
  });

  it('reproduces the 81st Congress seats from the votes through the seats–votes curve', () => {
    const v = blocVotes(model, popModel, votesByRegion(model, popModel, nation.pops!, p.calib.voteIntercept, 0));
    const seats = blocSeats(model, popModel, p.apportionment.house!);
    const dem = firstPartySeatsByBloc(model, p.seats.house!);
    for (const bloc of ['core', 'rest'] as const) {
      const share = logistic(model.elections!.swingRatio * logit(v[bloc]) + p.calib.seatBias[bloc]!);
      expect(share * seats[bloc]).toBeCloseTo(dem[bloc], 6);
    }
    expect(seats.core).toBe(105);
  });

  it('starts every interest group at its historical mood', () => {
    for (const g of model.interestGroups) {
      expect(p.groups.find((x) => x.id === g.id)!.approval).toBeCloseTo(g.startApproval / 100, 6);
    }
  });

  it('starts with a Democratic majority in both chambers', () => {
    expect(legislativeSupport(model, p)).toBeCloseTo((264 / 435) * 100, 6);
  });
});

describe('who may vote', () => {
  const tables = cellTables(model, popModel);
  const codec = codecFor(popModel);
  const key = (state: string, race: string, age: string) => {
    let k = 0;
    k = codec.with(k, codec.index.state!, codec.category('state', state));
    k = codec.with(k, codec.index.race!, codec.category('race', race));
    return codec.with(k, codec.index.age!, codec.category('age', age));
  };

  it('keeps children off the rolls and most young adults under 21', () => {
    expect(tables.eligible[key('NY', 'white', '0-14')]).toBe(0);
    expect(tables.eligible[key('NY', 'white', '15-29')]).toBeCloseTo(0.6, 10);
    expect(tables.eligible[key('NY', 'white', '30-44')]).toBe(1);
  });

  it('disenfranchises most Black Southerners, but not Black Northerners', () => {
    expect(tables.eligible[key('MS', 'black', '30-44')]).toBeCloseTo(0.02, 10);
    expect(tables.eligible[key('IL', 'black', '30-44')]).toBe(1);
  });

  it('makes white Southerners solidly Democratic', () => {
    expect(tables.lean[key('MS', 'white', '30-44')]!).toBeGreaterThan(tables.lean[key('OH', 'white', '30-44')]! + 1);
  });
});

describe('opinion', () => {
  it('falls with unemployment, and most among industrial workers', () => {
    const nation = usa();
    const p = nation.politics!;
    const levers = leverValues(nation.economy);
    const base = approvalInputs(model, p, levers);
    const slump = approvalInputs(model, { ...p, mood: { ...p.mood, unemployment: p.mood.unemployment + 4 } }, levers);
    expect(nationalApproval(model, popModel, nation.pops!, slump)).toBeLessThan(nationalApproval(model, popModel, nation.pops!, base) - 0.05);
    const byClass = (i: typeof base) => approvalBy(model, popModel, nation.pops!, i, 'class');
    const cls = popModel.attributes.find((a) => a.id === 'class')!.categories;
    const ind = cls.findIndex((c) => c.id === 'industrial');
    const prof = cls.findIndex((c) => c.id === 'professional');
    const dropInd = byClass(base)[ind]! - byClass(slump)[ind]!;
    const dropProf = byClass(base)[prof]! - byClass(slump)[prof]!;
    expect(dropInd).toBeGreaterThan(dropProf);
  });

  it('wears down over a term with nothing else changing (the cost of governing)', () => {
    const nation = usa();
    const p = nation.politics!;
    const levers = leverValues(nation.economy);
    const early = nationalApproval(model, popModel, nation.pops!, approvalInputs(model, p, levers));
    const late = nationalApproval(model, popModel, nation.pops!, approvalInputs(model, { ...p, leader: { ...p.leader, quartersInOffice: 12, honeymoon: 0 } }, levers));
    expect(late).toBeLessThan(early - 0.1);
  });

  it('turns party loyalties around when the other party holds the White House', () => {
    const nation = usa();
    const p = nation.politics!;
    const levers = leverValues(nation.economy);
    const race = popModel.attributes.find((a) => a.id === 'race')!.categories.map((c) => c.id);
    const dem = approvalBy(model, popModel, nation.pops!, approvalInputs(model, p, levers), 'race');
    const rep = approvalBy(model, popModel, nation.pops!, approvalInputs(model, { ...p, leader: { ...p.leader, party: 'republican' } }, levers), 'race');
    const black = race.indexOf('black');
    const white = race.indexOf('white');
    expect(dem[black]! - dem[white]!).toBeGreaterThan(0);
    expect(rep[black]! - rep[white]!).toBeLessThan(0);
  });

  it('responds to policy: a welfare increase pleases the retired and costs among managers', () => {
    const nation = usa();
    const p = nation.politics!;
    const levers = leverValues(nation.economy);
    const more = { ...levers, 'budget:welfare': levers['budget:welfare']! * 2 };
    const cls = popModel.attributes.find((a) => a.id === 'class')!.categories.map((c) => c.id);
    const before = approvalBy(model, popModel, nation.pops!, approvalInputs(model, p, levers), 'class');
    const after = approvalBy(model, popModel, nation.pops!, approvalInputs(model, p, more), 'class');
    expect(after[cls.indexOf('retired')]!).toBeGreaterThan(before[cls.indexOf('retired')]!);
    expect(after[cls.indexOf('business')]!).toBeLessThan(before[cls.indexOf('business')]!);
  });
});

describe('interest groups', () => {
  it('share out clout summing to one, from wealth, numbers and organisation', () => {
    const nation = usa();
    const p = nation.politics!;
    const clout = p.groups.reduce((s, g) => s + g.clout, 0);
    expect(clout).toBeCloseTo(1, 10);
    const strength = groupStrength(model, popModel, nation.pops!, leverValues(nation.economy), p.calib.levers0);
    const big = model.interestGroups.findIndex((g) => g.id === 'big_business');
    expect(strength[big]!.wealth).toBeGreaterThan(strength[big]!.numbers * 2);
    // The radical left is a fringe; organised labour is the largest bloc.
    const byId = Object.fromEntries(p.groups.map((g) => [g.id, g]));
    expect(byId.radical_left!.clout).toBeLessThan(0.02);
    expect(byId.labour!.clout).toBe(Math.max(...p.groups.map((g) => g.clout)));
    expect(cloutShares(model, strength).every((c) => c >= 0)).toBe(true);
  });

  it('lock in: more defence money grows the military-industrial complex', () => {
    const nation = usa();
    const p = nation.politics!;
    const levers = leverValues(nation.economy);
    const before = groupStates(model, popModel, nation.pops!, p, levers, nation.stats).find((g) => g.id === 'mic')!;
    const after = groupStates(model, popModel, nation.pops!, p, { ...levers, 'budget:defence': levers['budget:defence']! * 2 }, nation.stats).find((g) => g.id === 'mic')!;
    expect(after.members).toBeGreaterThan(before.members * 1.5);
    expect(after.clout).toBeGreaterThan(before.clout);
    expect(after.approval).toBeGreaterThan(before.approval);
  });

  it('react to policy, conditions and which party governs', () => {
    const nation = usa();
    const p = nation.politics!;
    const levers = leverValues(nation.economy);
    const labour = (pp: typeof p, lv: typeof levers, stats = nation.stats) => groupStates(model, popModel, nation.pops!, pp, lv, stats).find((g) => g.id === 'labour')!.approval;
    const start = labour(p, levers);
    expect(labour(p, { ...levers, 'budget:welfare': levers['budget:welfare']! * 1.5 })).toBeGreaterThan(start);
    expect(labour(p, levers, { ...nation.stats, unemployment: nation.stats.unemployment! + 3 })).toBeLessThan(start);
    expect(labour({ ...p, leader: { ...p.leader, party: 'republican' } }, levers)).toBeLessThan(start - 0.2);
  });
});

describe('political capital', () => {
  it('regenerates with approval', () => {
    expect(capitalRegeneration(model, 0.5)).toBeCloseTo(model.capital.base, 10);
    expect(capitalRegeneration(model, 0.7)).toBeGreaterThan(capitalRegeneration(model, 0.4));
  });

  it('never exceeds its cap', () => {
    const nation = usa();
    const p = structuredClone(nation.politics!);
    p.capital = model.capital.max - 1;
    stepPolitics(model, popModel, p, nation);
    expect(p.capital).toBeLessThanOrEqual(model.capital.max);
  });
});

describe('over the turns', () => {
  it('records approval, capital and congressional support each quarter, deterministically', () => {
    let a = newGame();
    let b = newGame();
    for (let i = 0; i < 4; i++) {
      a = advanceTurn(a);
      b = advanceTurn(b);
    }
    expect(a.nations.usa!.stats.approval).toBe(b.nations.usa!.stats.approval);
    expect(a.history.at(-1)!.stats.usa!.political_capital).toBeGreaterThan(model.capital.start);
    expect(a.log.at(-1)!.systemsRun).toContain('politics');
  });

  it('upgrades a schema 5 save by starting its politics', () => {
    const game = advanceTurn(newGame());
    const old = structuredClone(game) as unknown as Record<string, any>;
    for (const n of Object.values(old.nations as Record<string, any>)) {
      delete n.politics;
      for (const id of ['approval', 'political_capital', 'congress_support']) delete n.stats[id];
    }
    const text = JSON.stringify({ format: SAVE_FORMAT, schemaVersion: 5, state: { ...old, schemaVersion: 5 } });
    const loaded = deserializeGame(text, content);
    expect(loaded.nations.usa!.politics?.groups).toHaveLength(model.interestGroups.length);
    expect(loaded.nations.usa!.stats.approval).toBeCloseTo(model.opinion.startApproval, 6);
    expect(() => advanceTurn(loaded)).not.toThrow();
  });
});

describe('validation', () => {
  const nations = new Set(Object.keys(content.nations));
  const levers = leverIds(content.economy.budgetLines, content.economy.taxLines);
  const stats = new Set(content.stats.map((s) => s.id));

  it('accepts the shipped model', () => {
    expect(validatePoliticsModel(model, 'usa', nations, content.pops, levers, stats)).toEqual([]);
  });

  it('catches unknown levers, categories, groups and seat totals that do not add up', () => {
    const bad = structuredClone(model) as unknown as Record<string, any>;
    bad.interestGroups[0].preferences['budget:moon_landing'] = 1;
    bad.opinion.partisan.race.martian = 1;
    bad.legislature.factions[0].groups.ghosts = 1;
    bad.legislature.factions[0].seats.house += 1;
    const errors = validatePoliticsModel(bad, 'bad.json', nations, content.pops, levers, stats);
    expect(errors.some((e) => e.includes('budget:moon_landing'))).toBe(true);
    expect(errors.some((e) => e.includes('martian'))).toBe(true);
    expect(errors.some((e) => e.includes('ghosts'))).toBe(true);
    expect(errors.some((e) => e.includes('436'))).toBe(true);
  });
});
