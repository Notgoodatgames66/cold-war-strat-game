/**
 * The planned economy (the Soviet Union).
 *
 * Output is set by capacity, not demand. Each quarter the Plan in force
 * divides planned output between investment, defence, civil government and
 * exports; households receive a wage fund meant to buy what is left. The
 * same seven-sector input–output model and capacity limits as the Keynesian
 * engine decide what can actually be produced, but here households are
 * rationed first and state orders last. Prices are fixed, so money that
 * finds nothing to buy piles up as a savings overhang (repressed inflation)
 * and shows as shortages.
 *
 * Until the rival AI arrives, the Plan reacts to one thing: the rival's
 * defence spending compared with what the planners expected.
 *
 * See docs/models/planned.md.
 */

import type { NationData } from '../schema';
import type { GameDate } from '../time';
import type { EconomyDefs } from './calibrate';
import { accumulateCapital, createIndustry, importShares, normalCapacities, solveProduction, totalCapital } from './industry';
import { sum, zeros, type Vector } from './linalg';
import {
  PLANNED_PARAM_KEYS,
  type DemandComponent,
  type EconomyModelData,
  type PlanKeyframe,
  type PlannedEconomyData,
  type PlannedEconomyState,
  type PlannedParamKey,
} from './types';

const QUARTER = 0.25;

export function plannedParams(model: EconomyModelData): Record<PlannedParamKey, number> {
  return Object.fromEntries(PLANNED_PARAM_KEYS.map((k) => [k, model.params[k]!.value])) as Record<PlannedParamKey, number>;
}

const yearOf = (date: GameDate) => date.year + (date.quarter - 1) / 4;

/**
 * The plan in force at a date. Shares move smoothly from one keyframe to the
 * next (a new plan phases in); investment priorities switch when a new plan
 * starts.
 */
export function planAt(keyframes: PlanKeyframe[], sectors: string[], at: number) {
  const first = keyframes[0]!;
  let current = first;
  for (const k of keyframes) if (k.year <= at) current = k;
  const next = keyframes.find((k) => k.year > at);
  const f = next && current !== next ? Math.min(1, Math.max(0, (at - current.year) / (next.year - current.year))) : 0;
  const lerp = (key: 'investment' | 'defence' | 'civil' | 'exports' | 'rivalDefenceShare') =>
    next ? current[key] + f * (next[key] - current[key]) : current[key];
  return {
    label: current.label,
    investment: lerp('investment'),
    defence: lerp('defence'),
    civil: lerp('civil'),
    exports: lerp('exports'),
    rivalDefenceShare: lerp('rivalDefenceShare'),
    priority: sectors.map((id) => current.priority[id] ?? 1),
  };
}

/** Builds a planned economy (the Soviet Union) from its data, calibrated so 1949 reproduces the data. */
export function createPlannedEconomy(nation: NationData, defs: EconomyDefs): PlannedEconomyState {
  if (!nation.economy) throw new Error(`${nation.id} has no economy block`);
  const model = defs.models[nation.economy.model];
  if (!model || model.engine !== 'planned') throw new Error(`${nation.id}: "${nation.economy.model}" is not a planned-economy model`);
  const data = nation.economy as PlannedEconomyData;
  const table = defs.industryTables[data.industry];
  if (!table) throw new Error(`${nation.id}: unknown industry table "${data.industry}"`);
  const plan = defs.plans[data.plan];
  if (!plan) throw new Error(`${nation.id}: unknown plan "${data.plan}"`);
  const params = plannedParams(model);

  const stat = (id: string) => {
    const value = nation.stats[id]?.value;
    if (value === undefined) throw new Error(`${nation.id}: a planned economy needs the "${id}" stat`);
    return value;
  };
  const Y0 = stat('gdp_nominal');
  const growth0 = stat('real_growth');
  const shortage0 = stat('consumer_shortage') / 100;
  const overhang0 = stat('savings_overhang');
  const gap0 = data.start.output_gap.value / 100;
  const potential0 = Y0 / (1 + gap0);

  const k0 = plan.keyframes[0]!;
  const I0 = k0.investment * Y0;
  const D0 = k0.defence * Y0;
  const Civ0 = k0.civil * Y0;
  const X0 = k0.exports * Y0;
  const inv0 = data.start.inventory_investment.value;
  const M0 = Object.values(table.sectors).reduce((s, sec) => s + sec.imports.value, 0);
  const C0 = Y0 - I0 - inv0 - D0 - Civ0 - X0 + M0;
  if (C0 <= 0) throw new Error(`${nation.id}: the 1949 plan leaves nothing for households`);

  const industry = createIndustry(nation, table, defs.sectors, defs.budgetLines, {
    gdp: Y0,
    outputGap: gap0,
    potential: potential0,
    fixedInvestment: I0,
    inventoryInvestment: inv0,
    consumption: C0,
    exports: X0,
    imports: M0,
    aidTiedExports: 0,
    stateLocal: Civ0,
    budget: { defence: D0 },
  });

  // Households' money demand in 1949: what they bought, grossed up for what they could not find.
  const demand0 = C0 / (1 - shortage0);
  const wageFund0 = demand0 - params.overhang_spend_rate * overhang0;
  if (wageFund0 <= 0) throw new Error(`${nation.id}: the savings overhang is too large for 1949 household demand`);

  const quarterlyGrowth = Math.pow(1 + growth0 / 100, 0.25);
  const p0 = planAt(plan.keyframes, industry.sectors, k0.year);

  return {
    engine: 'planned',
    model: model.id,
    plan: plan.id,
    params,
    keyframes: structuredClone(plan.keyframes),
    rival: plan.rival,
    valuation: plan.valuation,
    industry,
    productivity: potential0,
    potential: potential0,
    potential0,
    quartersElapsed: 0,
    tension: gap0,
    wageDrift: wageFund0 / C0 - 1,
    gdpReal: Y0,
    consumption: C0,
    consumptionDemand: demand0,
    fixedInvestment: I0,
    inventoryInvestment: inv0,
    defence: D0,
    civilGovernment: Civ0,
    exports: X0,
    imports: M0,
    savingsOverhang: overhang0,
    shortageRate: shortage0 * 100,
    targets: {
      label: p0.label,
      investment: p0.investment,
      defence: p0.defence,
      civil: p0.civil,
      exports: p0.exports,
      priority: p0.priority,
      rivalExpected: p0.rivalDefenceShare,
      rivalActual: null,
    },
    recentGdpReal: [4, 3, 2, 1].map((k) => Y0 / Math.pow(quarterlyGrowth, k)),
  };
}

export interface PlannedContext {
  /** The quarter being resolved. */
  date: GameDate;
  /** The rival's defence spending as a share of its GDP this quarter, if known. */
  rivalDefenceShare: number | null;
  /** Price level used to value output in current dollars (the US price level). */
  valuationPrice: number;
}

const scaled = (shares: Vector, amount: number): Vector => shares.map((s) => s * amount);
const add = (a: Vector, b: Vector): Vector => a.map((x, i) => x + b[i]!);

export function stepPlanned(e: PlannedEconomyState, ctx: PlannedContext): Record<string, number> {
  const p = e.params;
  const ind = e.industry;
  const n = ind.sectors.length;

  // --- Capacity: productivity growth fades over the decades ------------------------
  e.quartersElapsed += 1;
  const tfpGrowth = p.tfp_growth * Math.exp(-p.tfp_growth_decay * (e.quartersElapsed / 4));
  e.productivity *= Math.pow(1 + tfpGrowth, QUARTER);
  ind.labourIndex *= Math.pow(1 + p.labour_force_growth, QUARTER);
  e.potential =
    e.productivity *
    Math.pow(totalCapital(ind) / ind.base.privateCapital, p.capital_share) *
    Math.pow(ind.labourIndex / ind.base.labourIndex, 1 - p.capital_share);

  // --- The Plan, and the reaction to the rival's defence spending ------------------
  const plan = planAt(e.keyframes, ind.sectors, yearOf(ctx.date));
  let defenceShare = plan.defence;
  if (ctx.rivalDefenceShare !== null) {
    defenceShare += p.arms_race_reaction * (ctx.rivalDefenceShare - plan.rivalDefenceShare);
  }
  defenceShare = Math.min(p.max_defence_share, Math.max(p.min_defence_share, defenceShare));
  e.targets = {
    label: plan.label,
    investment: plan.investment,
    defence: defenceShare,
    civil: plan.civil,
    exports: plan.exports,
    priority: plan.priority,
    rivalExpected: plan.rivalDefenceShare,
    rivalActual: ctx.rivalDefenceShare,
  };

  // A taut plan: output is set at the plan's target, which already claims every
  // available resource. Households cannot pull more out of the factories by
  // wanting more; money that finds nothing to buy is simply left over.
  const plannedOutput = e.potential * (1 + e.tension);
  const investment = plan.investment * plannedOutput;
  const defence = defenceShare * plannedOutput;
  const civil = plan.civil * plannedOutput;
  const exportsTarget = plan.exports * plannedOutput;
  const plannedConsumption = Math.max(0, plannedOutput - investment - defence - civil - exportsTarget + e.imports);
  // Planners gradually close any gap between money wages and the goods on offer.
  e.wageDrift *= Math.exp(-p.income_balancing * QUARTER);
  const wageFund = plannedConsumption * (1 + e.wageDrift);
  const consumptionDemand = wageFund + p.overhang_spend_rate * e.savingsOverhang;

  // --- Production -----------------------------------------------------------------
  const defenceBridge = ind.bridges.budget.defence ?? zeros(n);
  const defenceWorkforce = (ind.workforceShare.budget.defence ?? 0) * defence;
  const workforce = ind.workforceShare.state_local * civil + defenceWorkforce;
  const demand: Record<DemandComponent, Vector> = {
    consumption: scaled(ind.bridges.consumption, consumptionDemand),
    fixed_investment: scaled(ind.bridges.fixed_investment, investment),
    inventories: zeros(n),
    government: add(scaled(ind.bridges.state_local, civil), scaled(defenceBridge, defence)),
    exports: scaled(ind.bridges.exports, exportsTarget),
  };
  const normalCapacity = normalCapacities(ind, e.potential);
  const production = solveProduction({
    A: ind.A,
    valueAdded: ind.valueAdded,
    importShare: importShares(ind, 1),
    tradable: ind.tradable,
    sectorCeiling: normalCapacity.map((cap) => cap * (1 + p.sector_capacity_ceiling / 100)),
    businessCeiling: plannedOutput - workforce,
    demand,
    weights: {
      consumption: p.ration_weight_consumption,
      fixed_investment: p.ration_weight_investment,
      inventories: p.ration_weight_inventories,
      government: p.ration_weight_government,
      exports: p.ration_weight_exports,
    },
    surgeShare: p.surge_import_share,
    surgeCap: p.surge_import_cap,
  });

  const delivered = (k: DemandComponent) => sum(production.delivered[k]);
  const governmentOrdered = sum(demand.government);
  const governmentFill = governmentOrdered > 0 ? delivered('government') / governmentOrdered : 1;
  e.consumption = delivered('consumption');
  e.consumptionDemand = consumptionDemand;
  e.fixedInvestment = delivered('fixed_investment');
  e.inventoryInvestment = 0;
  e.defence = defenceWorkforce + sum(defenceBridge) * defence * governmentFill;
  e.civilGovernment = delivered('government') + workforce - e.defence;
  e.exports = delivered('exports');
  e.imports = sum(production.imports) + sum(production.surgeImports);
  const output = production.businessValueAdded + workforce;
  e.gdpReal = output;

  ind.output = production.output;
  ind.normalCapacity = normalCapacity;
  ind.imports = production.imports;
  ind.surgeImports = production.surgeImports;
  ind.unmet = production.unmet;
  ind.unmetByProduct = production.unmetByProduct;
  ind.governmentWorkforce = workforce;

  // --- Households: money that finds nothing to buy is saved, like it or not ----------
  e.savingsOverhang = Math.max(0, e.savingsOverhang + QUARTER * (wageFund - e.consumption));
  e.shortageRate = consumptionDemand > 0 ? (production.unmet.consumption / consumptionDemand) * 100 : 0;

  // --- Investment builds capacity, where the Plan directs it -------------------------
  // The 1949 investment shares already reflect the first plan's priorities, so
  // later plans shift investment relative to them.
  const utilisation = production.output.map((x, j) => x / normalCapacity[j]!);
  const basePriority = planAt(e.keyframes, ind.sectors, e.keyframes[0]!.year).priority;
  const shares = ind.investmentShare.map((s, j) => (s * plan.priority[j]!) / basePriority[j]!);
  accumulateCapital(ind, e.fixedInvestment, utilisation, p, shares);

  const gdpYearAgo = e.recentGdpReal[0]!;
  e.recentGdpReal = [...e.recentGdpReal.slice(1), output];

  const headline: Record<string, number> = {
    gdp_real: output,
    gdp_nominal: output * ctx.valuationPrice,
    real_growth: (output / gdpYearAgo - 1) * 100,
    defence_spending: e.defence * ctx.valuationPrice,
    consumer_shortage: e.shortageRate,
    savings_overhang: e.savingsOverhang,
    industrial_output:
      (100 * production.output.reduce((s, x, j) => s + (ind.industrial[j] ? ind.valueAdded[j]! * x : 0), 0)) /
      ind.base.industrialValueAdded,
  };
  for (const indicator of ind.base.physical) {
    headline[indicator.stat] = indicator.perUnit * production.output[indicator.sector]!;
  }
  return headline;
}
