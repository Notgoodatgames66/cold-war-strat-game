import { describe, expect, it } from 'vitest';
import { content } from '../src/sim/loadContent';
import type { GameState, PlayerOrders } from '../src/sim/schema';
import { advanceTurn } from '../src/sim/turn';
import { createGame } from '../src/sim/world';

const newGame = () => createGame(content, 'usa-1949', 'economy-test');
const usa = (g: GameState) => g.nations.usa!;
const econ = (g: GameState) => usa(g).economy!;

/** Plays `turns` quarters, sending `orders` on the first one only. */
function play(turns: number, orders: PlayerOrders = {}, start = newGame()): GameState {
  let g = start;
  for (let i = 0; i < turns; i++) g = advanceTurn(g, i === 0 ? orders : {});
  return g;
}

/** Collects one stat for every quarter played. */
function series(turns: number, stat: string, orders: PlayerOrders = {}): number[] {
  let g = newGame();
  const out: number[] = [];
  for (let i = 0; i < turns; i++) {
    g = advanceTurn(g, i === 0 ? orders : {});
    out.push(usa(g).stats[stat]!);
  }
  return out;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('calibration reproduces 1949', () => {
  const e = econ(newGame());

  it('spending adds up to GDP: C + I + G + (X − M) = Y', () => {
    const total = e.consumption + e.fixedInvestment + e.inventoryInvestment + e.government + e.exports - e.imports;
    expect(total).toBeCloseTo(272.5, 9);
  });

  it('the federal budget matches fiscal 1949: receipts $39.4bn, outlays $38.8bn', () => {
    expect(e.fiscal.totalReceipts).toBeCloseTo(39.4, 6);
    expect(e.fiscal.totalOutlays).toBeCloseTo(38.8, 6);
    expect(e.fiscal.balance).toBeCloseTo(0.6, 6);
  });

  it('derived household figures are plausible', () => {
    expect(e.consumption).toBeGreaterThan(165);
    expect(e.consumption).toBeLessThan(185);
    expect(e.disposableIncomeReal).toBeGreaterThan(175);
    expect(e.disposableIncomeReal).toBeLessThan(200);
    expect(e.calib.autonomousConsumption).toBeGreaterThan(0);
  });

  it('nominal GDP always equals real GDP times the price level', () => {
    const g = play(12, { budget: { defence: 30 } });
    expect(usa(g).stats.gdp_nominal).toBeCloseTo(usa(g).stats.gdp_real! * econ(g).priceLevel, 6);
  });
});

describe('orders', () => {
  it('budget changes phase in over several quarters', () => {
    const g1 = play(1, { budget: { defence: 21 } });
    expect(econ(g1).budgetTargets.defence).toBe(21);
    expect(econ(g1).budgetEffective.defence).toBeCloseTo(17, 9);
    const g2 = advanceTurn(g1);
    expect(econ(g2).budgetEffective.defence).toBeCloseTo(19, 9);
  });

  it('tax changes take effect immediately', () => {
    const g = play(1, { taxes: { income: 10 } });
    expect(econ(g).taxRates.income).toBe(10);
  });

  it('orders are clamped to each lever’s range', () => {
    const g = play(1, { budget: { defence: 9999, research: -5 }, taxes: { corporate: 500, tariff: -1 } });
    const defence = content.economy.budgetLines.find((l) => l.id === 'defence')!;
    expect(econ(g).budgetTargets.defence).toBe(defence.max);
    expect(econ(g).budgetTargets.research).toBe(0);
    expect(econ(g).taxRates.corporate).toBe(80);
    expect(econ(g).taxRates.tariff).toBe(0);
  });

  it('ignores unknown levers and non-numbers', () => {
    const before = econ(newGame());
    const g = play(1, { budget: { moon_base: 50, defence: Number.NaN }, taxes: { wealth: 10 } });
    expect(econ(g).budgetTargets).not.toHaveProperty('moon_base');
    expect(econ(g).budgetTargets.defence).toBe(before.budgetTargets.defence);
    expect(econ(g).taxRates).not.toHaveProperty('wealth');
  });

  it('indexation is off by default (Ryan’s decision)', () => {
    expect(econ(newGame()).budgetIndexed).toBe(false);
  });

  it('indexation raises budget targets with the economy’s nominal growth', () => {
    const g = play(8, { budgetIndexed: true });
    const e = econ(g);
    expect(e.budgetIndexed).toBe(true);
    expect(e.budgetTargets.welfare!).toBeGreaterThan(8);
    const growth = e.budgetTargets.welfare! / 8;
    expect(growth).toBeGreaterThan(1.03);
    expect(growth).toBeLessThan(1.12);
  });
});

describe('Keynesian behaviour', () => {
  it('extra defence spending raises output and cuts unemployment (multiplier roughly 1–2.5)', () => {
    const base = play(6);
    const boost = play(6, { budget: { defence: 23 } });
    const extraReal = usa(boost).stats.gdp_real! - usa(base).stats.gdp_real!;
    expect(extraReal).toBeGreaterThan(10);
    expect(extraReal).toBeLessThan(25);
    expect(usa(boost).stats.unemployment!).toBeLessThan(usa(base).stats.unemployment!);
  });

  it('an income tax cut lifts consumption and widens the deficit', () => {
    const base = play(6);
    const cut = play(6, { taxes: { income: 6.3 } });
    expect(econ(cut).consumption).toBeGreaterThan(econ(base).consumption);
    expect(usa(cut).stats.budget_balance!).toBeLessThan(usa(base).stats.budget_balance!);
  });

  it('higher tariffs cut imports', () => {
    const base = play(4);
    const tariffs = play(4, { taxes: { tariff: 20 } });
    expect(econ(tariffs).imports).toBeLessThan(econ(base).imports * 0.9);
  });

  it('a higher corporate tax discourages investment', () => {
    const base = play(8);
    const hike = play(8, { taxes: { corporate: 60 } });
    expect(econ(hike).fixedInvestment).toBeLessThan(econ(base).fixedInvestment);
  });

  it('public investment builds capacity over the long run', () => {
    const base = play(80);
    const build = play(80, { budget: { infrastructure: 12 } });
    expect(econ(build).potential).toBeGreaterThan(econ(base).potential * 1.01);
  });

  it('demand beyond capacity becomes inflation, not output', () => {
    const g = play(12, { budget: { defence: 150 } });
    const e = econ(g);
    expect(e.gdpReal).toBeLessThanOrEqual(e.potential * (1 + e.params.capacity_ceiling / 100) * (1 + 1e-6));
    expect(usa(g).stats.inflation!).toBeGreaterThan(8);
  });

  it('under the Treasury peg, rates can fall in a slump but never rise above the ceiling', () => {
    let g = newGame();
    let lowest = Infinity;
    for (let i = 0; i < 40; i++) {
      g = advanceTurn(g, i === 0 ? { budget: { defence: 60 } } : {});
      expect(econ(g).shortRate).toBeLessThanOrEqual(econ(g).shortRateCeiling + 1e-9);
    }
    let slump = newGame();
    for (let i = 0; i < 12; i++) {
      slump = advanceTurn(slump, i === 0 ? { budget: { defence: 3, welfare: 2 } } : {});
      lowest = Math.min(lowest, econ(slump).shortRate);
    }
    expect(lowest).toBeLessThan(0.9);
  });

  it('even a war boom cannot push unemployment below the frictional floor', () => {
    let g = newGame();
    for (let i = 0; i < 16; i++) {
      g = advanceTurn(g, i === 0 ? { budget: { defence: 60 } } : {});
      expect(usa(g).stats.unemployment!).toBeGreaterThanOrEqual(econ(g).params.minimum_unemployment - 1e-9);
    }
  });

  it('a budget deficit adds to the debt', () => {
    const g = play(8, { budget: { defence: 40 } });
    expect(usa(g).stats.public_debt!).toBeGreaterThan(214.3);
  });
});

describe('1949–55 with no policy changes stays historically plausible', () => {
  const unemployment = series(27, 'unemployment');
  const growth = series(27, 'real_growth');
  const inflation = series(27, 'inflation');
  const final = play(27);

  it('the 1949 inventory recession lifts unemployment, but not to crisis levels', () => {
    const peak = Math.max(...unemployment.slice(0, 8));
    expect(peak).toBeGreaterThan(5);
    expect(peak).toBeLessThan(8.5);
  });

  it('the economy recovers: average growth 1950–55 between 2% and 5%', () => {
    const avg = mean(growth.slice(4, 27));
    expect(avg).toBeGreaterThan(2);
    expect(avg).toBeLessThan(5);
  });

  it('inflation stays between −4% and 6%', () => {
    for (const x of inflation) {
      expect(x).toBeGreaterThan(-4);
      expect(x).toBeLessThan(6);
    }
  });

  it('debt and gold stay in sensible ranges', () => {
    expect(usa(final).stats.debt_to_gdp!).toBeGreaterThan(35);
    expect(usa(final).stats.debt_to_gdp!).toBeLessThan(100);
    expect(usa(final).stats.gold_reserves!).toBeGreaterThan(15);
    expect(usa(final).stats.gold_reserves!).toBeLessThan(35);
  });

  it('with indexed budgets, the mid-1950s look like the real post-war boom', () => {
    const u = series(36, 'unemployment', { budgetIndexed: true }).slice(16);
    const pi = series(36, 'inflation', { budgetIndexed: true }).slice(16);
    expect(Math.max(...u)).toBeLessThan(6);
    expect(Math.min(...u)).toBeGreaterThan(3);
    expect(Math.min(...pi)).toBeGreaterThan(0);
    expect(Math.max(...pi)).toBeLessThan(5);
  });
});

describe('robustness', () => {
  const extremes: [string, PlayerOrders][] = [
    ['everything at maximum, taxes at zero', {
      budget: Object.fromEntries(content.economy.budgetLines.map((l) => [l.id, l.max])),
      taxes: { income: 0, corporate: 0, excise: 0, payroll: 0, tariff: 0 },
    }],
    ['everything at minimum, taxes at maximum', {
      budget: Object.fromEntries(content.economy.budgetLines.map((l) => [l.id, l.min])),
      taxes: { income: 40, corporate: 80, excise: 20, payroll: 20, tariff: 60 },
    }],
  ];

  for (const [label, orders] of extremes) {
    it(`never produces impossible numbers over 52 years: ${label}`, () => {
      let g = newGame();
      for (let i = 0; i < 207; i++) {
        g = advanceTurn(g, i === 0 ? orders : {});
        for (const [id, value] of Object.entries(usa(g).stats)) {
          expect(Number.isFinite(value), `${id} at turn ${g.turn}`).toBe(true);
        }
        expect(usa(g).stats.unemployment!).toBeGreaterThanOrEqual(1);
        expect(usa(g).stats.gdp_real!).toBeGreaterThan(0);
      }
    });
  }
});
