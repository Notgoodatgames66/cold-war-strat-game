import { describe, expect, it } from 'vitest';
import { content } from '../src/sim/loadContent';
import { applyOrders, proposedBills, proposedLevers } from '../src/sim/orders';
import { billPreview, capitalAfterBills, factionUtility, majorityNeeded, normalCdf, rollBill } from '../src/sim/politics/bills';
import { leverChange } from '../src/sim/politics/levers';
import { createRng } from '../src/sim/rng';
import type { BillResult } from '../src/sim/politics/types';
import type { GameState } from '../src/sim/schema';
import { advanceTurn } from '../src/sim/turn';
import { createGame } from '../src/sim/world';

const model = content.politics['usa-1949']!;
const base = createGame(content, 'usa-1949');
const fresh = (): GameState => structuredClone(base);
const keynes = (s: GameState) => {
  const e = s.nations.usa!.economy;
  if (e?.engine !== 'keynesian') throw new Error('expected a Keynesian economy');
  return e;
};
const odds = (s: GameState, orders: Parameters<typeof proposedBills>[1]) => proposedBills(s, orders)![0]!.odds;

describe('the arithmetic', () => {
  it('has a standard normal distribution accurate to 1e-6', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 7);
    expect(normalCdf(1.959964)).toBeCloseTo(0.975, 6);
    expect(normalCdf(-1)).toBeCloseTo(0.158655, 6);
    expect(normalCdf(3) + normalCdf(-3)).toBeCloseTo(1, 9);
  });

  it('needs the share of seats that rounds to a strict majority', () => {
    expect(majorityNeeded(435) * 435).toBe(217.5); // 218 votes
    expect(majorityNeeded(96) * 96).toBe(48.5); // 49 votes: no tie-break yet
  });
});

describe('factions weigh a bill', () => {
  const p = base.nations.usa!.politics!;
  const b = model.legislature.bills;

  it('with no change, follow party, leader, approval and their groups’ mood', () => {
    const u = (id: string) => factionUtility(model, p, id, 'budget:welfare', 0, 0);
    const pull = b.approvalPull * (p.approval * 100 - 50);
    const mood = (id: string) => {
      const f = model.legislature.factions.find((x) => x.id === id)!;
      return Object.entries(f.groups).reduce((s, [g, w]) => s + w * (p.groups.find((x) => x.id === g)!.approval * 100 - 50), 0);
    };
    expect(u('northern_democrats')).toBeCloseTo(b.loyalty + b.ownFaction + pull + b.groupPull * mood('northern_democrats'), 10);
    expect(u('southern_democrats')).toBeCloseTo(b.loyalty + pull + b.groupPull * mood('southern_democrats'), 10);
    expect(u('taft_republicans')).toBeCloseTo(-b.opposition + pull + b.groupPull * mood('taft_republicans'), 10);
  });

  it('weigh content by their groups and stances, and resist any change', () => {
    const d = 0.2;
    const f = model.legislature.factions.find((x) => x.id === 'taft_republicans')!;
    const want = (f.stances['budget:welfare'] ?? 0) + Object.entries(f.groups).reduce((s, [g, w]) => s + w * (model.interestGroups.find((x) => x.id === g)!.preferences['budget:welfare'] ?? 0), 0);
    const diff = factionUtility(model, p, f.id, 'budget:welfare', d, 0) - factionUtility(model, p, f.id, 'budget:welfare', 0, 0);
    expect(diff).toBeCloseTo(b.salience * d * want - b.statusQuo * d, 10);
  });

  it('are moved by political capital', () => {
    const diff = factionUtility(model, p, 'taft_republicans', 'budget:welfare', 0.2, 25) - factionUtility(model, p, 'taft_republicans', 'budget:welfare', 0.2, 0);
    expect(diff).toBeCloseTo(25 * b.capitalPerPoint, 10);
  });
});

describe('the odds', () => {
  const s = base;
  const p = s.nations.usa!.politics!;

  it('are the product of each chamber’s chance of a majority', () => {
    const bill = billPreview(model, p, 'budget:welfare', 8, 9.6, 0);
    const sd = model.legislature.bills.whipUncertainty;
    for (const ch of model.legislature.chambers) expect(bill.chambers[ch.id]).toBeCloseTo(normalCdf((bill.votes[ch.id]! - bill.needed[ch.id]!) / sd), 12);
    expect(bill.odds).toBeCloseTo(bill.chambers.house! * bill.chambers.senate!, 12);
    // The House's expected yes share is the seat-weighted mean of its factions.
    const seats = p.seats.house!;
    const yes = Object.entries(seats).reduce((a, [f, n]) => a + n * bill.factions[f]!, 0) / 435;
    expect(bill.votes.house).toBeCloseTo(yes, 12);
  });

  it('fall as a change grows, and rise with capital', () => {
    const small = odds(s, { budget: { welfare: 8.4 } });
    const modest = odds(s, { budget: { welfare: 9.6 } });
    const big = odds(s, { budget: { welfare: 12 } });
    expect(small).toBeGreaterThan(modest);
    expect(modest).toBeGreaterThan(big);
    expect(odds(s, { budget: { welfare: 12 }, capital: { 'budget:welfare': 30 } })).toBeGreaterThan(big + 0.2);
  });

  it('match the 81st Congress: the Conservative Coalition blocks the Fair Deal but loves tax cuts and air power', () => {
    expect(odds(s, { budget: { welfare: 8.4 } })).toBeGreaterThan(0.85); // a small rise sails through
    const fairDealHealth = odds(s, { budget: { education_health: 0.8 } });
    expect(fairDealHealth).toBeLessThan(0.15); // national health insurance stalls…
    expect(odds(s, { budget: { education_health: 0.8 }, capital: { 'budget:education_health': 40 } })).toBeGreaterThan(fairDealHealth + 0.2); // …unless you spend for it
    expect(odds(s, { taxes: { income: 6.3 } })).toBeGreaterThan(0.95);
    expect(odds(s, { taxes: { income: 10.3 } })).toBeLessThan(0.2);
    expect(odds(s, { budget: { defence: 16.5 } })).toBeGreaterThan(0.9);
    expect(odds(s, { budget: { defence: 10 } })).toBeLessThan(0.2);
    expect(odds(s, { budgetIndexed: true })).toBeLessThan(0.1);
  });

  it('turn against a president whose approval has collapsed', () => {
    const low = fresh();
    low.nations.usa!.politics!.approval = 0.3;
    expect(odds(low, { budget: { welfare: 9.6 } })).toBeLessThan(odds(s, { budget: { welfare: 9.6 } }) - 0.2);
  });
});

describe('orders become bills', () => {
  it('only for real changes, clamped to each lever’s range', () => {
    const e = keynes(base);
    const levers = proposedLevers(e, { budget: { welfare: 8, defence: 999 }, taxes: { income: -5 }, budgetIndexed: false });
    expect(levers).toEqual({ 'budget:defence': 150, 'tax:income': 0 });
  });

  it('grants capital in voting order until it runs out', () => {
    const s = fresh();
    s.nations.usa!.politics!.capital = 30;
    const bills = proposedBills(s, {
      budget: { welfare: 9, defence: 15 },
      capital: { 'budget:welfare': 25, 'budget:defence': 25 },
    })!;
    expect(bills.map((b) => b.lever)).toEqual(['budget:defence', 'budget:welfare']);
    expect(bills.map((b) => b.capital)).toEqual([25, 5]);
  });

  it('pass or fail at turn end, spending capital either way', () => {
    const s = fresh();
    const p = s.nations.usa!.politics!;
    p.capital = 50;
    applyOrders(s, {
      budget: { welfare: 8.2, education_health: 2.0 }, // a sure thing and a hopeless one
      capital: { 'budget:education_health': 10 },
    });
    const e = keynes(s);
    const [ed, welfare] = p.lastBills;
    expect(welfare!.passed).toBe(true);
    expect(e.budgetTargets.welfare).toBe(8.2);
    expect(ed!.passed).toBe(false);
    expect(e.budgetTargets.education_health).toBe(0.4);
    expect(p.capital).toBeCloseTo(50 - 10 - model.capital.failurePenalty + model.capital.victoryBonus * (1 - welfare!.odds), 10);
  });

  it('record tallies that agree with the result', () => {
    for (let seed = 0; seed < 40; seed++) {
      const s = fresh();
      s.seed = `tally-${seed}`;
      applyOrders(s, { budget: { welfare: 9.6 } });
      const r = s.nations.usa!.politics!.lastBills[0]!;
      const majorities = model.legislature.chambers.every((ch) => r.tally[ch.id]!.yes > ch.seats / 2);
      expect(majorities).toBe(r.passed);
      for (const ch of model.legislature.chambers) expect(r.tally[ch.id]!.yes + r.tally[ch.id]!.no).toBe(ch.seats);
    }
  });

  it('pass as often as their odds say', () => {
    const bill = proposedBills(base, { budget: { welfare: 9.6 } })![0]!;
    expect(bill.odds).toBeGreaterThan(0.3);
    expect(bill.odds).toBeLessThan(0.8);
    let passed = 0;
    const n = 2000;
    for (let i = 0; i < n; i++) if (rollBill(model, bill, createRng('odds', i, 'orders:congress')).passed) passed++;
    // Within four standard errors.
    expect(Math.abs(passed / n - bill.odds)).toBeLessThan(4 * Math.sqrt((bill.odds * (1 - bill.odds)) / n));
  });

  it('are rolled deterministically from the seed', () => {
    const orders = { budget: { welfare: 9.6, foreign_aid: 7 }, taxes: { tariff: 8 } };
    const a = advanceTurn(base, orders).nations.usa!.politics!.lastBills;
    const b = advanceTurn(base, orders).nations.usa!.politics!.lastBills;
    expect(a).toEqual(b);
    expect(a).toHaveLength(3);
  });

  it('clear from one turn to the next', () => {
    const one = advanceTurn(base, { budget: { welfare: 8.2 } });
    expect(one.nations.usa!.politics!.lastBills).toHaveLength(1);
    expect(advanceTurn(one, {}).nations.usa!.politics!.lastBills).toHaveLength(0);
  });

  it('apply directly in a nation without a legislature', () => {
    const s = fresh();
    delete s.nations.usa!.politics;
    applyOrders(s, { budget: { education_health: 2 }, budgetIndexed: true });
    expect(keynes(s).budgetTargets.education_health).toBe(2);
    expect(keynes(s).budgetIndexed).toBe(true);
  });
});

describe('capital after the votes', () => {
  const result = (passed: boolean, odds: number, capital: number): BillResult => ({
    lever: 'budget:welfare',
    from: 8,
    to: 9,
    odds,
    capital,
    passed,
    votes: {},
    tally: {},
  });

  it('pays most for long shots, charges for failures, and stays within bounds', () => {
    const c = model.capital;
    expect(capitalAfterBills(model, 40, [result(true, 0.25, 10)])).toBeCloseTo(40 - 10 + c.victoryBonus * 0.75, 10);
    expect(capitalAfterBills(model, 40, [result(true, 0.999, 0)])).toBeCloseTo(40 + c.victoryBonus * 0.001, 10);
    expect(capitalAfterBills(model, 40, [result(false, 0.4, 10)])).toBe(40 - 10 - c.failurePenalty);
    expect(capitalAfterBills(model, 2, [result(false, 0.4, 2)])).toBe(0);
    expect(capitalAfterBills(model, c.max, [result(true, 0.1, 0)])).toBe(c.max);
  });

  it('cannot be farmed: trying a bill never pays on average', () => {
    const c = model.capital;
    for (let q = 0.01; q < 1; q += 0.01) {
      const expected = q * c.victoryBonus * (1 - q) - (1 - q) * c.failurePenalty;
      expect(expected).toBeLessThan(0.5);
    }
  });
});

it('measures the change a bill makes in the comparable unit', () => {
  const bill = proposedBills(base, { budget: { defence: 26 } })![0]!;
  expect(bill.change).toBeCloseTo(leverChange('budget:defence', 13, 26), 12);
});
