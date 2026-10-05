import { describe, expect, it } from 'vitest';
import { solveProduction, type ProductionInput } from '../src/sim/economy/industry';
import { leontiefInverse, matVec, sum } from '../src/sim/economy/linalg';
import { DEMAND_COMPONENTS, type DemandComponent } from '../src/sim/economy/types';
import { validateIndustryTable } from '../src/sim/content';
import type { EconomyState } from '../src/sim/economy/types';
import { content } from '../src/sim/loadContent';
import type { GameState, PlayerOrders } from '../src/sim/schema';
import { advanceTurn } from '../src/sim/turn';
import { sandboxGame } from './helpers';

const newGame = () => sandboxGame('usa-1949', 'industry-test');
const econ = (g: GameState) => g.nations.usa!.economy as EconomyState;
const ind = (g: GameState) => econ(g).industry;
const stats = (g: GameState) => g.nations.usa!.stats;
const sector = (g: GameState, id: string) => ind(g).sectors.indexOf(id);

function play(turns: number, orders: (turn: number) => PlayerOrders = () => ({}), start = newGame()): GameState {
  let g = start;
  for (let i = 0; i < turns; i++) g = advanceTurn(g, orders(i));
  return g;
}

/** Defence to $45bn from the second quarter: a Korea-scale rearmament. */
const rearm = (i: number): PlayerOrders => (i === 1 ? { budget: { defence: 45 } } : {});

describe('the 1949 input–output table', () => {
  const g = newGame();
  const I = ind(g);

  it('has the seven sectors from the design document', () => {
    expect(I.sectors).toEqual([
      'agriculture',
      'heavy_industry',
      'energy',
      'consumer_goods',
      'technology',
      'services',
      'shipping_trade',
    ]);
  });

  it('every column adds up: inputs plus value added = 1 per dollar of output', () => {
    I.sectors.forEach((_, j) => {
      const inputs = I.A.reduce((s, row) => s + row[j]!, 0);
      expect(inputs + I.valueAdded[j]!).toBeCloseTo(1, 12);
    });
  });

  it('business value added plus government’s own workforce equals 1949 GDP', () => {
    const businessVA = I.output.reduce((s, x, j) => s + x * I.valueAdded[j]!, 0);
    expect(businessVA + I.governmentWorkforce).toBeCloseTo(272.5, 9);
  });

  it('gross output is about twice GDP, as in the 1947 benchmark table', () => {
    const ratio = sum(I.output) / 272.5;
    expect(ratio).toBeGreaterThan(1.7);
    expect(ratio).toBeLessThan(2.1);
  });

  it('household spending by product is non-negative and led by consumer goods', () => {
    const c = I.bridges.consumption;
    expect(sum(c)).toBeCloseTo(1, 12);
    for (const share of c) expect(share).toBeGreaterThanOrEqual(0);
    expect(Math.max(...c)).toBe(c[sector(g, 'consumer_goods')]);
    expect(c[sector(g, 'services')]!).toBeGreaterThan(0.15);
  });

  it('derived depreciation rates are plausible: housing slow, equipment fast', () => {
    for (const d of I.depreciation) {
      expect(d).toBeGreaterThan(0);
      expect(d).toBeLessThan(0.15);
    }
    expect(I.depreciation[sector(g, 'services')]!).toBeLessThan(I.depreciation[sector(g, 'consumer_goods')]!);
  });

  it('the Leontief inverse reproduces 1949 output from 1949 final demand', () => {
    const d = I.importShare0.map((m) => 1 - m);
    const e = econ(g);
    const exports = I.bridges.exports.map((b, i) => b * e.exportBase + I.bridges.aid_exports[i]! * (e.exports - e.exportBase));
    // Final demand for each product = output + imports − what other industries use.
    const Ax = matVec(I.A, I.output);
    const final = I.output.map((x, i) => x + I.imports[i]! - Ax[i]!);
    const homeMade = final.map((f, i) => d[i]! * (f - exports[i]!) + exports[i]!);
    const x = matVec(leontiefInverse(I.A, d), homeMade);
    x.forEach((xi, i) => expect(xi).toBeCloseTo(I.output[i]!, 8));
  });

  it('starts industrial production at 100', () => {
    expect(stats(g).industrial_output).toBe(100);
  });
});

describe('solveProduction (a two-sector test economy)', () => {
  // Sector 0 = "steel", sector 1 = "services". Steel uses steel; services use a little steel.
  const base = (): ProductionInput => ({
    A: [
      [0.3, 0.1],
      [0.1, 0.2],
    ],
    valueAdded: [0.6, 0.7],
    importShare: [0.1, 0],
    tradable: [true, false],
    sectorCeiling: [1e9, 1e9],
    businessCeiling: 1e9,
    demand: {
      consumption: [20, 60],
      fixed_investment: [30, 5],
      inventories: [2, 0],
      government: [20, 10],
      exports: [5, 1],
    },
    weights: { consumption: 1, fixed_investment: 1, inventories: 1.5, government: 0.25, exports: 0.75 },
    surgeShare: 0.35,
    surgeCap: 0.25,
  });

  it('with spare capacity, output is plain Leontief and nothing is rationed', () => {
    const input = base();
    const r = solveProduction(input);
    const d = input.importShare.map((m) => 1 - m);
    const g = [0, 1].map((j) =>
      DEMAND_COMPONENTS.reduce((s, k) => s + (k === 'exports' ? 1 : d[j]!) * input.demand[k][j]!, 0),
    );
    const x = matVec(leontiefInverse(input.A, d), g);
    r.output.forEach((xi, i) => expect(xi).toBeCloseTo(x[i]!, 10));
    expect(DEMAND_COMPONENTS.reduce((s, k) => s + r.unmet[k], 0)).toBe(0);
    expect(sum(r.surgeImports)).toBe(0);
  });

  it('output never exceeds a sector’s ceiling, and rationing stops close to it', () => {
    const free = solveProduction(base()).output;
    const input = { ...base(), sectorCeiling: [free[0]! * 0.85, 1e9] };
    const r = solveProduction(input);
    expect(r.output[0]!).toBeLessThanOrEqual(input.sectorCeiling[0]! * (1 + 1e-6));
    expect(r.output[0]!).toBeGreaterThan(input.sectorCeiling[0]! * 0.97);
  });

  it('a shortage of a tradable good draws in emergency imports; a non-tradable one cannot', () => {
    const free = solveProduction(base()).output;
    const steelShort = solveProduction({ ...base(), sectorCeiling: [free[0]! * 0.85, 1e9] });
    expect(steelShort.surgeImports[0]!).toBeGreaterThan(0);
    const servicesShort = solveProduction({ ...base(), sectorCeiling: [1e9, free[1]! * 0.85] });
    expect(servicesShort.surgeImports[1]!).toBe(0);
    expect(servicesShort.unmet.consumption).toBeGreaterThan(0);
  });

  it('defence orders are protected: cut proportionally less than household purchases', () => {
    const free = solveProduction(base()).output;
    const input = { ...base(), sectorCeiling: [free[0]! * 0.8, 1e9] };
    const r = solveProduction(input);
    const cutShare = (k: DemandComponent) => 1 - r.delivered[k][0]! / input.demand[k][0]!;
    expect(cutShare('government')).toBeLessThan(cutShare('consumption'));
    expect(cutShare('inventories')).toBeGreaterThan(cutShare('consumption'));
  });

  it('a steel shortage cuts steel-heavy purchases harder than services', () => {
    const free = solveProduction(base()).output;
    const input = { ...base(), sectorCeiling: [free[0]! * 0.8, 1e9] };
    const r = solveProduction(input);
    const steelCut = 1 - r.delivered.consumption[0]! / input.demand.consumption[0]!;
    const servicesCut = 1 - r.delivered.consumption[1]! / input.demand.consumption[1]!;
    expect(steelCut).toBeGreaterThan(servicesCut * 3);
  });

  it('no over-rationing when a sector limit and the economy-wide limit bind together', () => {
    const free = solveProduction(base());
    const input = {
      ...base(),
      sectorCeiling: [free.output[0]! * 0.9, 1e9],
      businessCeiling: free.businessValueAdded * 0.93,
    };
    const r = solveProduction(input);
    const sectorSlack = 1 - r.output[0]! / input.sectorCeiling[0]!;
    const aggregateSlack = 1 - r.businessValueAdded / input.businessCeiling;
    expect(Math.min(sectorSlack, aggregateSlack)).toBeLessThan(0.001);
    expect(sectorSlack).toBeGreaterThan(-1e-6);
    expect(aggregateSlack).toBeGreaterThan(-1e-6);
  });

  it('respects the economy-wide ceiling on value added', () => {
    const free = solveProduction(base());
    const input = { ...base(), businessCeiling: free.businessValueAdded * 0.9 };
    const r = solveProduction(input);
    expect(r.businessValueAdded).toBeLessThanOrEqual(input.businessCeiling * (1 + 1e-6));
    expect(r.businessValueAdded).toBeGreaterThan(input.businessCeiling * 0.97);
  });

  it('the accounts always close: delivered demand − imports = value added', () => {
    const free = solveProduction(base()).output;
    for (const input of [base(), { ...base(), sectorCeiling: [free[0]! * 0.8, free[1]! * 0.9] }]) {
      const r = solveProduction(input);
      const delivered = DEMAND_COMPONENTS.reduce((s, k) => s + sum(r.delivered[k]), 0);
      expect(delivered - sum(r.imports) - sum(r.surgeImports)).toBeCloseTo(r.businessValueAdded, 9);
    }
  });

  it('stays finite and feasible even when demand is a hundred times capacity', () => {
    const input = base();
    const huge = Object.fromEntries(DEMAND_COMPONENTS.map((k) => [k, input.demand[k].map((v) => v * 100)])) as Record<
      DemandComponent,
      number[]
    >;
    const r = solveProduction({ ...input, demand: huge, sectorCeiling: [60, 90], businessCeiling: 100 });
    r.output.forEach((x) => expect(Number.isFinite(x)).toBe(true));
    expect(r.output[0]!).toBeLessThanOrEqual(60 * (1 + 1e-6));
    expect(r.output[1]!).toBeLessThanOrEqual(90 * (1 + 1e-6));
  });
});

describe('industry in the running game', () => {
  it('the national accounts close every quarter, rationing or not', () => {
    let g = newGame();
    for (let i = 0; i < 20; i++) {
      g = advanceTurn(g, rearm(i));
      const e = econ(g);
      const identity = e.consumption + e.fixedInvestment + e.inventoryInvestment + e.government + e.exports - e.imports;
      expect(identity).toBeCloseTo(e.gdpReal, 8);
    }
  });

  it('Korea-scale rearmament strains technology and heavy industry first', () => {
    const base = play(12);
    const war = play(12, rearm);
    const util = (g: GameState, id: string) => ind(g).output[sector(g, id)]! / ind(g).normalCapacity[sector(g, id)]!;
    expect(util(war, 'technology')).toBeGreaterThan(util(war, 'consumer_goods') + 0.03);
    expect(util(war, 'technology')).toBeGreaterThan(util(base, 'technology') + 0.05);
    expect(stats(war).steel_output!).toBeGreaterThan(stats(base).steel_output!);
    expect(stats(war).industrial_output!).toBeGreaterThan(stats(base).industrial_output!);
  });

  it('shortages appear: unmet orders and emergency imports', () => {
    let g = newGame();
    let unmet = 0;
    let surge = 0;
    for (let i = 0; i < 16; i++) {
      g = advanceTurn(g, rearm(i));
      unmet = Math.max(unmet, ...DEMAND_COMPONENTS.map((k) => ind(g).unmet[k]));
      surge = Math.max(surge, sum(ind(g).surgeImports));
    }
    expect(unmet).toBeGreaterThan(0.5);
    expect(surge).toBeGreaterThan(0.1);
  });

  it('orders only go unfilled when some limit is actually binding', () => {
    let g = newGame();
    let checked = 0;
    for (let i = 0; i < 24; i++) {
      g = advanceTurn(g, rearm(i));
      const e = econ(g);
      const unmet = DEMAND_COMPONENTS.reduce((s, k) => s + ind(g).unmet[k], 0);
      if (unmet < 0.05) continue;
      checked++;
      const gapPct = (e.gdpReal / e.potential - 1) * 100;
      const aggregateBinds = gapPct > e.params.capacity_ceiling - 0.05;
      const ceiling = 1 + e.params.sector_capacity_ceiling / 100;
      const sectorBinds = ind(g).output.some((x, j) => x / ind(g).normalCapacity[j]! > ceiling - 0.005);
      expect(aggregateBinds || sectorBinds, `turn ${g.turn}: $${unmet.toFixed(1)}bn unmet but no limit binds`).toBe(true);
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('investment flows to the industries running hot', () => {
    const share = (g: GameState, id: string) => ind(g).capital[sector(g, id)]! / sum(ind(g).capital);
    const base = play(32);
    const war = play(32, rearm);
    expect(share(war, 'technology')).toBeGreaterThan(share(base, 'technology') * 1.05);
  });

  it('investment builds capacity: a corporate tax cut raises potential output over a decade', () => {
    const base = play(40);
    const cut = play(40, (i) => (i === 0 ? { taxes: { corporate: 20 } } : {}));
    expect(econ(cut).fixedInvestment).toBeGreaterThan(econ(base).fixedInvestment);
    expect(econ(cut).potential).toBeGreaterThan(econ(base).potential);
  });

  it('capital deepening: capital per unit of output rises through the golden age', () => {
    const start = newGame();
    const later = play(60, (i) => (i === 0 ? { budgetIndexed: true } : {}));
    const kOverY = (g: GameState) => sum(ind(g).capital) / econ(g).gdpReal;
    expect(kOverY(later)).toBeGreaterThan(kOverY(start));
  });

  it('high tariffs cut imports and shift production home', () => {
    const base = play(8);
    const walls = play(8, (i) => (i === 0 ? { taxes: { tariff: 40 } } : {}));
    const agri = (g: GameState) => ind(g).output[sector(g, 'agriculture')]!;
    expect(econ(walls).imports).toBeLessThan(econ(base).imports * 0.8);
    expect(agri(walls)).toBeGreaterThan(agri(base));
  });

  it('records sector output and capacity use in the history', () => {
    const g = play(3);
    const last = g.history.at(-1)!;
    expect(last.sectors?.usa?.technology?.output).toBeGreaterThan(0);
    expect(last.sectors?.usa?.technology?.utilisation).toBeGreaterThan(0.8);
  });
});

describe('industry table validation', () => {
  const table = content.economy.industryTables['usa-1949']!;
  const statIds = new Set(content.stats.map((s) => s.id));
  const check = (t: unknown) =>
    validateIndustryTable(t, 'bad.json', content.economy.sectors, content.economy.budgetLines, statIds).join(' ');

  it('the shipped table is valid', () => {
    expect(check(table)).toBe('');
  });

  it('rejects input shares that do not sum to 1', () => {
    const bad = structuredClone(table);
    bad.sectors.energy!.inputs.value.energy = 0.9;
    expect(check(bad)).toMatch(/energy.inputs: shares sum to/);
  });

  it('rejects an unknown sector in a bridge', () => {
    const bad = structuredClone(table);
    bad.bridges.exports.value = { moon_rocks: 1 };
    expect(check(bad)).toMatch(/"moon_rocks" is not allowed/);
  });

  it('rejects a workforce share where no workforce exists', () => {
    const bad = structuredClone(table);
    bad.bridges.fixed_investment.value = { workforce: 0.5, heavy_industry: 0.5 };
    expect(check(bad)).toMatch(/"workforce" is not allowed/);
  });

  it('requires a bridge for every government-purchase budget line', () => {
    const bad = structuredClone(table);
    delete bad.bridges.budget.research;
    expect(check(bad)).toMatch(/missing "research"/);
  });
});
