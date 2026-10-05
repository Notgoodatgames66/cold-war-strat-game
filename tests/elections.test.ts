import { describe, expect, it } from 'vitest';
import { content } from '../src/sim/loadContent';
import {
  apportionFromPops,
  censusFor,
  electionsDue,
  electoralVotes,
  factionSeats,
  holdElections,
  huntingtonHill,
  nationalTide,
  nominees,
  shareOut,
  termsWon,
} from '../src/sim/politics/elections';
import type { PoliticsModelData } from '../src/sim/politics/types';
import { createRng } from '../src/sim/rng';
import type { GameState } from '../src/sim/schema';
import { advanceTurn } from '../src/sim/turn';
import { createGame } from '../src/sim/world';

const model = content.politics['usa-1949']!;
const popModel = content.pops['usa-1950']!;
const base = createGame(content, 'usa-1949');
const fresh = (): GameState => structuredClone(base);
const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
/** The model with every swing switched off: no approval, midterm, appeal or random effects. */
const still: PoliticsModelData = {
  ...model,
  elections: { ...model.elections!, approvalEffect: 0, midtermPenalty: 0, incumbency: 0, noise: 0, regionNoise: 0, nominees: {} },
};

describe('the calendar', () => {
  it('holds congressional elections every other November and presidential ones every four years', () => {
    expect(electionsDue(model, { year: 1950, quarter: 4 })).toEqual({ legislative: true, executive: false });
    expect(electionsDue(model, { year: 1952, quarter: 4 })).toEqual({ legislative: true, executive: true });
    expect(electionsDue(model, { year: 1952, quarter: 3 })).toEqual({ legislative: false, executive: false });
    expect(electionsDue(model, { year: 1951, quarter: 4 })).toEqual({ legislative: false, executive: false });
    expect(electionsDue(model, { year: 1949, quarter: 4 })).toEqual({ legislative: false, executive: false });
  });

  it('applies each census at the first election after it', () => {
    expect(censusFor(model, 1950)).toBeUndefined();
    expect(censusFor(model, 1952)).toBe(1950);
    expect(censusFor(model, 1954)).toBeUndefined();
    expect(censusFor(model, 1962)).toBe(1960);
  });
});

describe('reapportionment', () => {
  it('shares seats by equal proportions, one at least each', () => {
    const seats = huntingtonHill([100, 200, 700, 0], 10);
    expect(seats).toEqual([1, 2, 7, 0]);
    expect(sum(Object.fromEntries(huntingtonHill([5, 1, 1, 1, 1], 9).map((v, i) => [i, v])))).toBe(9);
    // Priority P / √(n(n+1)): a state of 1,000 with one seat (707) outranks a state of 1,400 with two (572).
    expect(huntingtonHill([1000, 1400], 4)).toEqual([2, 2]);
  });

  it('reproduces the House as apportioned after the 1950 census, from the 1950 pops', () => {
    const seats = apportionFromPops(model, popModel, base.nations.usa!.pops!);
    expect(sum(seats)).toBe(435);
    expect(seats.DC).toBe(0);
    // The 1950 apportionment (Alaska and Hawaii were not yet states).
    const actual: Record<string, number> = { CA: 30, NY: 43, PA: 30, TX: 22, IL: 25, OH: 23, MI: 18, NJ: 14, MA: 14, NC: 12, GA: 10, MS: 6, NV: 1 };
    for (const [state, n] of Object.entries(actual)) expect(Math.abs(seats[state]! - n), state).toBeLessThanOrEqual(1);
  });

  it('gives the electoral college 531 votes, and 534 once DC votes', () => {
    const p = base.nations.usa!.politics!;
    expect(electoralVotes(model, popModel, p, 1952).reduce((a, b) => a + b, 0)).toBe(531);
    expect(electoralVotes(model, popModel, p, 1964).reduce((a, b) => a + b, 0)).toBe(534);
  });
});

describe('seats', () => {
  it('round by largest remainder and keep the total', () => {
    expect(shareOut(10, [1, 1, 1])).toEqual([4, 3, 3]);
    expect(shareOut(7, [0, 0])).toEqual([4, 3]);
    expect(shareOut(100, [62.5, 37.5])).toEqual([63, 37]);
  });

  it('go to each party’s factions in its blocs, in proportion to what they held', () => {
    const p = base.nations.usa!.politics!;
    const seats = factionSeats(model, p.seats.house!, { core: 100, rest: 150 }, { core: 105, rest: 330 });
    expect(seats.southern_democrats).toBe(100);
    expect(seats.northern_democrats).toBe(150);
    expect(seats.taft_republicans! + seats.internationalist_republicans!).toBe(185);
    expect(seats.taft_republicans! / seats.internationalist_republicans!).toBeCloseTo(100 / 71, 1);
  });

  it('with no swing at all, return the Congress the voters elected in 1948', () => {
    const s = fresh();
    const nation = s.nations.usa!;
    const p = nation.politics!;
    const before = structuredClone(p.seats);
    holdElections(still, popModel, p, nation, { year: 1950, quarter: 4 }, createRng('x', 0, 'elections'));
    for (const ch of model.legislature.chambers)
      for (const f of model.legislature.factions) expect(Math.abs(p.seats[ch.id]![f.id]! - before[ch.id]![f.id]!), `${ch.id} ${f.id}`).toBeLessThanOrEqual(1);
    expect(p.elections).toHaveLength(1);
    expect(p.elections[0]!.vote).toBeCloseTo(model.elections!.normalVote, 3);
  });

  it('punish the president’s party when he is unpopular, and more in the House than the Senate', () => {
    const s = fresh();
    const nation = s.nations.usa!;
    const p = nation.politics!;
    p.approval = 0.3;
    const unpopular: PoliticsModelData = { ...model, elections: { ...model.elections!, noise: 0, regionNoise: 0 } };
    const r = holdElections(unpopular, popModel, p, nation, { year: 1950, quarter: 4 }, createRng('x', 0, 'elections'))!;
    const dem = (ch: string) => r.change[ch]!.southern_democrats! + r.change[ch]!.northern_democrats!;
    expect(dem('house')).toBeLessThan(-20);
    expect(dem('senate')).toBeLessThan(0);
    expect(dem('senate') / 96).toBeGreaterThan(dem('house') / 435);
    for (const ch of model.legislature.chambers) expect(sum(p.seats[ch.id]!)).toBe(ch.seats);
  });
});

describe('the presidency', () => {
  it('lets an eligible, popular incumbent run again, and otherwise takes the historical nominee', () => {
    const p = structuredClone(base.nations.usa!.politics!);
    p.approval = 0.5;
    expect(nominees(model, p, 1952).map((n) => [n.name, n.incumbent])).toEqual([
      ['Harry S. Truman', true],
      ['Dwight D. Eisenhower', false],
    ]);
    p.approval = 0.3;
    expect(nominees(model, p, 1952)[0]!.name).toBe('Adlai Stevenson');
  });

  it('bars a third elected term', () => {
    const p = structuredClone(base.nations.usa!.politics!);
    p.approval = 0.6;
    p.elections.push({ year: 1952, kind: 'executive', seats: {}, change: {}, vote: 0.5, winner: 'Harry S. Truman' });
    expect(termsWon(model, p, 'Harry S. Truman')).toBe(2);
    expect(nominees(model, p, 1956)[0]!.name).toBe('Adlai Stevenson');
  });

  it('pulls the vote towards a popular president’s party, and away in midterms', () => {
    const p = structuredClone(base.nations.usa!.politics!);
    const el = model.elections!;
    p.approval = 0.6;
    expect(nationalTide(model, p, { legislative: true, executive: true })).toBeCloseTo(el.approvalEffect * 10, 12);
    expect(nationalTide(model, p, { legislative: true, executive: false })).toBeCloseTo(el.approvalEffect * 10 - el.midtermPenalty, 12);
    p.leader = { ...p.leader, party: 'republican' };
    expect(nationalTide(model, p, { legislative: true, executive: false })).toBeCloseTo(-(el.approvalEffect * 10 - el.midtermPenalty), 12);
  });

  it('elects a president through the electoral college and swears in the winner', () => {
    const s = fresh();
    const nation = s.nations.usa!;
    const p = nation.politics!;
    p.approval = 0.3; // Truman retires; Stevenson faces Eisenhower
    p.capital = 5;
    const r = holdElections(model, popModel, p, nation, { year: 1952, quarter: 4 }, createRng('ike', 0, 'elections'))!;
    expect(r.kind).toBe('executive');
    expect(r.candidates!.map((c) => c.name)).toEqual(['Adlai Stevenson', 'Dwight D. Eisenhower']);
    expect(r.candidates!.reduce((a, c) => a + c.electoral, 0)).toBe(531);
    expect(r.regionVote).toHaveLength(popModel.attributes.find((a) => a.role === 'region')!.categories.length);
    expect(p.leader.name).toBe(r.winner);
    expect(nation.government.leader.name).toBe(r.winner);
    expect(p.leader.quartersInOffice).toBe(0);
    expect(p.capital).toBe(model.capital.newTerm);
    // The census of 1950 has been applied.
    expect(p.apportionment.house).toEqual(apportionFromPops(model, popModel, nation.pops!));
  });
});

describe('over the turns', () => {
  it('holds the 1950 midterms and the 1952 election, deterministically', () => {
    let a = base;
    for (let i = 0; i < 16; i++) a = advanceTurn(a);
    const results = a.nations.usa!.politics!.elections;
    expect(results.map((e) => [e.year, e.kind])).toEqual([
      [1950, 'legislative'],
      [1952, 'executive'],
    ]);
    let b = base;
    for (let i = 0; i < 16; i++) b = advanceTurn(b);
    expect(b.nations.usa!.politics!.elections).toEqual(results);
    expect(a.nations.usa!.stats.congress_support).toBeCloseTo(
      (100 * model.legislature.factions.filter((f) => f.party === a.nations.usa!.politics!.leader.party).reduce((s, f) => s + a.nations.usa!.politics!.seats.house![f.id]!, 0)) / 435,
      10,
    );
  }, 60000);
});
