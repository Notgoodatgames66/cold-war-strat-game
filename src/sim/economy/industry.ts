/**
 * Industry: the seven-sector input–output model.
 *
 * Three jobs:
 *  1. createIndustry: calibrate the sectors from the base-year table so the
 *     national accounts close exactly (household spending by product is the
 *     residual, as consumption is in the macro calibration).
 *  2. solveProduction: given final demand by product, find gross output by
 *     sector (Leontief), then respect each sector's capacity and the economy's
 *     overall capacity by rationing demand and drawing in emergency imports.
 *  3. accumulateCapital: new investment builds each sector's capital, with
 *     more flowing to sectors that are running hot.
 *
 * See docs/models/industry.md for the reasoning in plain English.
 */

import type { NationData } from '../schema';
import { dot, leontiefInverse, matVec, sum, vecMat, zeros, type Matrix, type Vector } from './linalg';
import {
  DEMAND_COMPONENTS,
  WORKFORCE,
  type BudgetLineDef,
  type DemandComponent,
  type IndustryState,
  type IndustryTableData,
  type SectorDef,
  type SourcedShares,
} from './types';

const QUARTER = 0.25;
/** No product can be more than this share imported, however low tariffs go. */
const MAX_IMPORT_SHARE = 0.95;
const TOLERANCE = 1e-7;
const MAX_ITERATIONS = 60;

/** Government-purchase budget kinds: these lines buy goods and pay a workforce. */
export const PURCHASE_KINDS = ['defence', 'purchase', 'public_investment'] as const;

const emptyUnmet = (): Record<DemandComponent, number> => ({
  consumption: 0,
  fixed_investment: 0,
  inventories: 0,
  government: 0,
  exports: 0,
});

/** Splits a bridge into a sector vector (in `order`) and the workforce share. */
export function splitBridge(bridge: SourcedShares, order: string[]): { shares: Vector; workforce: number } {
  return {
    shares: order.map((id) => bridge.value[id] ?? 0),
    workforce: bridge.value[WORKFORCE] ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Calibration
// ---------------------------------------------------------------------------

export interface IndustryBase {
  gdp: number;
  outputGap: number;
  potential: number;
  fixedInvestment: number;
  inventoryInvestment: number;
  consumption: number;
  exports: number;
  imports: number;
  aidTiedExports: number;
  stateLocal: number;
  /** Starting outlay per budget line (base year: nominal = real). */
  budget: Record<string, number>;
}

export function createIndustry(
  nation: NationData,
  table: IndustryTableData,
  sectorDefs: SectorDef[],
  budgetLines: BudgetLineDef[],
  base: IndustryBase,
): IndustryState {
  const order = sectorDefs.map((s) => s.id);
  const n = order.length;
  const sector = (id: string) => table.sectors[id]!;
  const problems: string[] = [];

  const purchaseLines = budgetLines.filter((l) => (PURCHASE_KINDS as readonly string[]).includes(l.kind));
  const budgetBridges: Record<string, Vector> = {};
  const budgetWorkforce: Record<string, number> = {};
  for (const line of purchaseLines) {
    const bridge = table.bridges.budget[line.id];
    if (!bridge) {
      problems.push(`no bridge for budget line "${line.id}"`);
      continue;
    }
    const split = splitBridge(bridge, order);
    budgetBridges[line.id] = split.shares;
    budgetWorkforce[line.id] = split.workforce;
  }
  const stateLocal = splitBridge(table.bridges.state_local, order);

  // Government's own workforce is value added produced by government, not bought from a sector.
  const workforce0 =
    stateLocal.workforce * base.stateLocal +
    purchaseLines.reduce((s, l) => s + (budgetWorkforce[l.id] ?? 0) * (base.budget[l.id] ?? 0), 0);
  const businessGdp = base.gdp - workforce0;

  const v = order.map((id) => sector(id).valueAddedRatio.value);
  const x = order.map((id, j) => (sector(id).valueAddedShare.value * businessGdp) / v[j]!);
  const A: Matrix = order.map((supplier) =>
    order.map((user, j) => (sector(user).inputs.value[supplier] ?? 0) * (1 - v[j]!)),
  );
  const imports = order.map((id) => sector(id).imports.value);
  if (Math.abs(sum(imports) - base.imports) > 0.05) {
    problems.push(`imports by product sum to ${sum(imports).toFixed(2)} but the accounts say ${base.imports}`);
  }

  const Ax = matVec(A, x);
  const finalTotal = x.map((xi, i) => xi + imports[i]! - Ax[i]!);

  const bI = splitBridge(table.bridges.fixed_investment, order).shares;
  const bInv = splitBridge(table.bridges.inventory_investment, order).shares;
  const bX = splitBridge(table.bridges.exports, order).shares;
  const bXa = splitBridge(table.bridges.aid_exports, order).shares;
  const commercialExports = base.exports - base.aidTiedExports;

  const fI = bI.map((b) => b * base.fixedInvestment);
  const fInv = bInv.map((b) => b * base.inventoryInvestment);
  const fX = bX.map((b, i) => b * commercialExports + bXa[i]! * base.aidTiedExports);
  const fG = order.map(
    (_, i) =>
      stateLocal.shares[i]! * base.stateLocal +
      purchaseLines.reduce((s, l) => s + (budgetBridges[l.id]?.[i] ?? 0) * (base.budget[l.id] ?? 0), 0),
  );

  // Household spending by product is whatever is left once every other use is accounted for.
  const consumption = finalTotal.map((f, i) => f - fI[i]! - fInv[i]! - fG[i]! - fX[i]!);
  consumption.forEach((c, i) => {
    if (c < 0) problems.push(`households would have to buy ${c.toFixed(2)} of ${order[i]}; the table does not close`);
  });
  if (Math.abs(sum(consumption) - base.consumption) > 0.05) {
    problems.push(`derived consumption ${sum(consumption).toFixed(2)} differs from the accounts (${base.consumption.toFixed(2)})`);
  }

  const domesticUse = order.map((_, i) => Ax[i]! + finalTotal[i]! - fX[i]!);
  const importShare0 = imports.map((m, i) => m / domesticUse[i]!);
  importShare0.forEach((mu, i) => {
    if (!(mu >= 0 && mu < MAX_IMPORT_SHARE)) problems.push(`import share of ${order[i]} is ${mu.toFixed(3)}`);
  });

  // Capital: derive each sector's depreciation so that every sector's capital grows at the same base-year rate.
  const K0 = table.capital.capitalOutputRatio.value * base.gdp;
  const capital = order.map((id) => sector(id).capitalShare.value * K0);
  const investmentShare = order.map((id) => sector(id).investmentShare.value);
  const baseGrowth = base.fixedInvestment / K0 - table.capital.depreciation.value;
  const depreciation = order.map((_, j) => (investmentShare[j]! * base.fixedInvestment) / capital[j]! - baseGrowth);
  depreciation.forEach((d, j) => {
    if (!(d > 0 && d < 0.5)) problems.push(`derived depreciation for ${order[j]} is ${d.toFixed(3)}`);
  });

  if (problems.length) throw new Error(`${nation.id} industry table "${table.id}" is inconsistent: ${problems.join('; ')}`);

  const normalCapacity = x.map((xi) => xi / (1 + base.outputGap));
  const capacityCoef = normalCapacity.map((cap, j) => cap / ((capital[j]! / K0) * base.potential));

  const physical = table.physicalIndicators.map((ind) => {
    const j = order.indexOf(ind.sector);
    const statValue = nation.stats[ind.stat]?.value ?? 0;
    return { stat: ind.stat, sector: j, perUnit: statValue / x[j]! };
  });
  const industrial = sectorDefs.map((s) => s.industrial);

  return {
    table: table.id,
    sectors: order,
    tradable: sectorDefs.map((s) => s.tradable),
    industrial,
    A,
    valueAdded: v,
    importShare0,
    importIndex: 1,
    bridges: {
      consumption: consumption.map((c) => c / sum(consumption)),
      fixed_investment: bI,
      inventory_investment: bInv,
      state_local: stateLocal.shares,
      exports: bX,
      aid_exports: bXa,
      budget: budgetBridges,
    },
    workforceShare: { state_local: stateLocal.workforce, budget: budgetWorkforce },
    capital,
    depreciation,
    investmentShare,
    capacityCoef,
    utilisationSmoothed: x.map(() => 1 + base.outputGap),
    output: [...x],
    normalCapacity,
    imports,
    surgeImports: zeros(n),
    unmet: emptyUnmet(),
    unmetByProduct: zeros(n),
    governmentWorkforce: workforce0,
    base: {
      output: [...x],
      privateCapital: K0,
      labourIndex: 1,
      industrialValueAdded: x.reduce((s, xi, j) => s + (industrial[j] ? v[j]! * xi : 0), 0),
      physical,
    },
    labourIndex: 1,
  };
}

// ---------------------------------------------------------------------------
// Capacity and imports
// ---------------------------------------------------------------------------

export const totalCapital = (ind: IndustryState): number => sum(ind.capital);

/** Normal capacity of each sector: its coefficient × its share of capital × potential GDP. */
export function normalCapacities(ind: IndustryState, potential: number): Vector {
  const K = totalCapital(ind);
  return ind.capital.map((k, j) => ind.capacityCoef[j]! * (k / K) * potential);
}

/** Current import share of each product's home use, after the trend and tariffs. */
export function importShares(ind: IndustryState, tariffFactor: number): Vector {
  return ind.importShare0.map((mu) => Math.min(MAX_IMPORT_SHARE, mu * ind.importIndex * tariffFactor));
}

// ---------------------------------------------------------------------------
// Production with rationing
// ---------------------------------------------------------------------------

export interface ProductionInput {
  A: Matrix;
  valueAdded: Vector;
  importShare: Vector;
  tradable: boolean[];
  /** Hard ceiling on each sector's gross output. */
  sectorCeiling: Vector;
  /** Ceiling on business value added (the economy-wide labour limit, net of government's workforce). */
  businessCeiling: number;
  /** Final demand for each product by component (includes the imported part; exports are all home-made). */
  demand: Record<DemandComponent, Vector>;
  /** Higher weight = cut first when goods are short. */
  weights: Record<DemandComponent, number>;
  surgeShare: number;
  surgeCap: number;
}

export interface ProductionResult {
  output: Vector;
  imports: Vector;
  surgeImports: Vector;
  delivered: Record<DemandComponent, Vector>;
  unmet: Record<DemandComponent, number>;
  unmetByProduct: Vector;
  businessValueAdded: number;
  iterations: number;
}

interface Constraint {
  row: Vector;
  cap: number;
  /** Index of the sector, or -1 for the economy-wide limit. */
  sector: number;
}

/**
 * Finds gross output by sector for the given final demand, then enforces
 * capacity.
 *
 * When a sector is over its ceiling, part of the excess is met by extra
 * imports (tradable products only), and the rest by cutting final demand.
 * Cuts fall hardest on the final products that use the scarce good most
 * intensively (a steel shortage cuts cars before haircuts), and on the
 * components with the highest rationing weight (stockbuilding before defence
 * orders). Each round removes the excess to first order; a few rounds settle
 * interactions between several scarce goods.
 */
export function solveProduction(input: ProductionInput): ProductionResult {
  const { A, valueAdded: v, importShare: mu, demand, weights } = input;
  const n = A.length;
  const d = mu.map((m) => 1 - m);
  const L = leontiefInverse(A, d);
  const homeShare = (k: DemandComponent, j: number) => (k === 'exports' ? 1 : d[j]!);

  const keep = Object.fromEntries(DEMAND_COMPONENTS.map((k) => [k, new Array<number>(n).fill(1)])) as Record<
    DemandComponent,
    Vector
  >;
  const surge = zeros(n);

  const homeDemand = (): Vector =>
    zeros(n).map((_, j) => DEMAND_COMPONENTS.reduce((s, k) => s + homeShare(k, j) * demand[k][j]! * keep[k][j]!, 0));
  const solve = (): Vector => matVec(L, homeDemand().map((g, j) => g - surge[j]!));

  const constraints: Constraint[] = [
    ...input.sectorCeiling.map((cap, i) => ({ row: zeros(n).map((_, j) => (j === i ? 1 : 0)), cap, sector: i })),
    { row: v, cap: Math.max(0, input.businessCeiling), sector: -1 },
  ];
  // Content of each final product in each constrained quantity: R[c][j] = row_c · L[:, j].
  const content = constraints.map((c) => vecMat(c.row, L));

  // Room for emergency imports, from the unconstrained home use of each product.
  const x0 = solve();
  const Ax0 = matVec(A, x0);
  const room = zeros(n).map((_, i) => {
    if (!input.tradable[i]) return 0;
    const homeUse = Ax0[i]! + DEMAND_COMPONENTS.filter((k) => k !== 'exports').reduce((s, k) => s + demand[k][i]!, 0);
    return input.surgeCap * Math.max(0, homeUse);
  });

  const overloads = (x: Vector) =>
    constraints
      .map((c, index) => ({ c, index, excess: dot(c.row, x) - c.cap }))
      .filter(({ c, excess }) => excess > TOLERANCE * Math.max(1, c.cap));

  let x = x0;
  let iterations = 0;
  for (; iterations < MAX_ITERATIONS; iterations++) {
    let over = overloads(x);
    if (over.length === 0) break;

    // 1. Emergency imports for scarce tradable goods.
    let surged = false;
    for (const { c, excess } of over) {
      if (c.sector < 0) continue;
      const i = c.sector;
      const add = Math.min((input.surgeShare * excess) / L[i]![i]!, room[i]! - surge[i]!);
      if (add > 1e-12) {
        surge[i]! += add;
        surged = true;
      }
    }
    if (surged) {
      x = solve();
      over = overloads(x);
      if (over.length === 0) break;
    }

    // 2. Ration final demand for what is still short, one limit at a time
    //    (tightest first), so a cut made for one limit is counted before the
    //    next is sized. Output is linear in demand, so each cut is exact.
    over.sort((a, b) => b.excess / Math.max(1e-9, b.c.cap) - a.excess / Math.max(1e-9, a.c.cap));
    for (const { c, index } of over) {
      x = solve();
      const excess = dot(c.row, x) - c.cap;
      if (excess <= TOLERANCE * Math.max(1, c.cap)) continue;
      const R = content[index]!;
      const denom = R.reduce(
        (s, r, j) =>
          s + r * r * DEMAND_COMPONENTS.reduce((t, k) => t + weights[k] * Math.max(0, homeShare(k, j) * demand[k][j]! * keep[k][j]!), 0),
        0,
      );
      if (denom <= 0) continue;
      const kappa = excess / denom;
      for (const k of DEMAND_COMPONENTS) {
        for (let j = 0; j < n; j++) {
          if (demand[k][j]! > 0) keep[k][j]! *= Math.max(0, 1 - Math.min(1, kappa * R[j]! * weights[k]));
        }
      }
    }
    x = solve();
  }

  // Safety net: if rounds ran out, scale all positive demand down uniformly until everything fits.
  for (let tries = 0; tries < 20; tries++) {
    const worst = Math.max(...constraints.map((c) => (c.cap > 0 ? dot(c.row, x) / c.cap : dot(c.row, x) > 0 ? Infinity : 0)));
    if (!(worst > 1 + 1e-6)) break;
    const scale = Number.isFinite(worst) ? 1 / worst : 0;
    for (const k of DEMAND_COMPONENTS) {
      for (let j = 0; j < n; j++) if (demand[k][j]! > 0) keep[k][j]! *= scale;
    }
    x = solve();
  }

  // Restoration: when several limits interact, the cuts can overshoot. Hand
  // back the same fraction of every cut, as much as still fits, so that at
  // least one limit is binding whenever anything was rationed.
  const cutBack = Object.fromEntries(DEMAND_COMPONENTS.map((k) => [k, [...keep[k]]])) as Record<DemandComponent, Vector>;
  const setRestored = (theta: number) => {
    for (const k of DEMAND_COMPONENTS) {
      for (let j = 0; j < n; j++) keep[k][j] = cutBack[k][j]! + theta * (1 - cutBack[k][j]!);
    }
    return solve();
  };
  const fits = (y: Vector) => constraints.every((c) => dot(c.row, y) <= c.cap * (1 + 1e-9) + 1e-9);
  const anyCut = DEMAND_COMPONENTS.some((k) => cutBack[k].some((v) => v < 1));
  if (anyCut && fits(x)) {
    let lo = 0;
    let hi = 1;
    if (fits(setRestored(1))) lo = 1;
    else {
      for (let step = 0; step < 40; step++) {
        const mid = (lo + hi) / 2;
        if (fits(setRestored(mid))) lo = mid;
        else hi = mid;
      }
    }
    x = setRestored(lo);
  }

  const delivered = Object.fromEntries(
    DEMAND_COMPONENTS.map((k) => [k, demand[k].map((f, j) => f * keep[k][j]!)]),
  ) as Record<DemandComponent, Vector>;
  const unmet = emptyUnmet();
  const unmetByProduct = zeros(n);
  for (const k of DEMAND_COMPONENTS) {
    for (let j = 0; j < n; j++) {
      const lost = Math.max(0, demand[k][j]! - delivered[k][j]!);
      unmet[k] += lost;
      unmetByProduct[j]! += lost;
    }
  }

  const Ax = matVec(A, x);
  const imports = zeros(n).map(
    (_, i) =>
      mu[i]! * (Ax[i]! + DEMAND_COMPONENTS.filter((k) => k !== 'exports').reduce((s, k) => s + delivered[k][i]!, 0)),
  );

  return {
    output: x,
    imports,
    surgeImports: surge,
    delivered,
    unmet,
    unmetByProduct,
    businessValueAdded: dot(v, x),
    iterations,
  };
}

// ---------------------------------------------------------------------------
// Investment and capital
// ---------------------------------------------------------------------------

/**
 * Adds a quarter's real fixed investment to sector capital. Sectors running
 * hotter than average attract more than their usual share.
 */
export function accumulateCapital(
  ind: IndustryState,
  investment: number,
  utilisation: Vector,
  params: { investment_allocation_sensitivity: number; utilisation_smoothing: number },
): void {
  const lambda = params.utilisation_smoothing;
  ind.utilisationSmoothed = ind.utilisationSmoothed.map((u, j) => (1 - lambda) * u + lambda * utilisation[j]!);

  const va = ind.output.map((x, j) => ind.valueAdded[j]! * x);
  const vaTotal = sum(va);
  const average = ind.utilisationSmoothed.reduce((s, u, j) => s + (u * va[j]!) / vaTotal, 0);
  const raw = ind.investmentShare.map(
    (share, j) =>
      share * Math.max(0.1, 1 + params.investment_allocation_sensitivity * (ind.utilisationSmoothed[j]! - average)),
  );
  const rawTotal = sum(raw);
  ind.capital = ind.capital.map(
    (k, j) => k * (1 - ind.depreciation[j]! * QUARTER) + (investment * raw[j]! * QUARTER) / rawTotal,
  );
}
