/**
 * One quarter of the Keynesian economy.
 *
 * Order within the quarter:
 *  1. Capacity grows: potential output from productivity, private capital,
 *     labour and public capital. Budget changes phase in.
 *  2. Spending decisions, based on last quarter's income and output:
 *     consumption, fixed investment, inventories, government, exports.
 *  3. Industry: spending is split into products and run through the
 *     input–output model. Sectors short of capacity draw in extra imports and
 *     ration what is left. Output (GDP) and imports come out of this step.
 *  4. Unemployment (Okun's law) and inflation (Phillips curve, with sector
 *     bottlenecks and shortages) respond.
 *  5. The federal budget, the debt, disposable income and the balance of
 *     payments (gold) are settled in current dollars.
 *  6. Investment is added to each sector's capital.
 *
 * See docs/models/economy.md and docs/models/industry.md.
 */

import { investorInflation, sumByKind, PURCHASE_KINDS } from './calibrate';
import { accumulateCapital, importShares, normalCapacities, solveProduction, totalCapital } from './industry';
import { sum, zeros, type Vector } from './linalg';
import { DEMAND_COMPONENTS, type DemandComponent, type EconomyState, type TaxId } from './types';

const QUARTER = 0.25;
/** Annualised inflation is kept within these bounds so extreme policies stay finite. */
const INFLATION_FLOOR = -30;
const INFLATION_CEILING = 1000;

/** Moves budget spending towards the player's targets. */
function phaseInBudget(e: EconomyState) {
  for (const line of e.budgetLines) {
    const target = e.budgetTargets[line.id] ?? 0;
    const current = e.budgetEffective[line.id] ?? 0;
    e.budgetEffective[line.id] = current + e.params.budget_phase_in * (target - current);
  }
}

/**
 * Grows productive capacity. Potential output follows a Cobb–Douglas
 * production function in private capital and labour, scaled by total factor
 * productivity and the public capital stock.
 */
function growSupply(e: EconomyState) {
  const p = e.params;
  const ind = e.industry;
  e.productivity *= Math.pow(1 + p.tfp_growth, QUARTER);
  ind.labourIndex *= Math.pow(1 + p.labour_force_growth, QUARTER);
  const publicInvestmentReal = sumByKind(e.budgetLines, e.budgetEffective, ['public_investment']) / e.priceLevel;
  e.publicCapital = e.publicCapital * (1 - p.public_capital_depreciation * QUARTER) + publicInvestmentReal * QUARTER;
  const capitalIndex = totalCapital(ind) / ind.base.privateCapital;
  e.potential =
    e.productivity *
    Math.pow(capitalIndex, p.capital_share) *
    Math.pow(ind.labourIndex / ind.base.labourIndex, 1 - p.capital_share) *
    Math.pow(e.publicCapital / e.calib.publicCapital0, p.public_capital_elasticity);
}

/**
 * With indexation on, the Treasury raises every budget target in line with
 * the economy's nominal growth (capacity growth plus last quarter's
 * inflation), so spending keeps its share of the economy without the player
 * re-voting it each year. With it off, targets stay fixed in dollars:
 * inflation erodes them and growth shrinks them as a share of GDP.
 */
function indexBudget(e: EconomyState, potentialBefore: number) {
  if (!e.budgetIndexed) return;
  const factor = (e.potential / potentialBefore) * Math.pow(1 + e.inflation / 100, QUARTER);
  for (const line of e.budgetLines) {
    const target = e.budgetTargets[line.id] ?? 0;
    e.budgetTargets[line.id] = Math.min(line.max, target * factor);
  }
}

const scaled = (shares: Vector, amount: number): Vector => shares.map((s) => s * amount);
const add = (a: Vector, b: Vector): Vector => a.map((x, i) => x + b[i]!);

export function stepEconomy(e: EconomyState, population: number): Record<string, number> {
  const p = e.params;
  const c = e.calib;
  const ind = e.industry;
  const n = ind.sectors.length;

  const previousGap = e.gdpReal / e.potential - 1;
  const previousPrice = e.priceLevel;
  const previousFinalSales = e.gdpReal - e.inventoryInvestment;
  const potentialBefore = e.potential;

  growSupply(e);
  indexBudget(e, potentialBefore);
  phaseInBudget(e);
  const scale = e.potential / c.potential0;
  ind.importIndex *= Math.pow(1 + p.import_propensity_trend, QUARTER);

  // --- Expectations and the real interest rate ---------------------------
  e.expectedInflation = p.expectations_persistence * e.inflation + (1 - p.expectations_persistence) * p.inflation_anchor;
  // Investors look through short-run price swings to long-horizon expectations.
  const realRate = e.shortRate - investorInflation(e.expectedInflation, p);

  // --- Desired spending (real) --------------------------------------------------
  // Households spend out of a blend of current income and expected long-run
  // income (which follows the economy's potential).
  const permanentIncome = c.disposableIncome0 * scale;
  const perceivedIncome =
    p.current_income_weight * e.disposableIncomeReal + (1 - p.current_income_weight) * permanentIncome;
  const desiredConsumption = c.autonomousConsumption * scale + p.mpc * perceivedIncome;
  const consumptionDemand = e.consumption + p.consumption_adjustment * (desiredConsumption - e.consumption);

  const desiredInvestment =
    c.investmentShare *
    e.potential *
    (1 + p.accelerator * previousGap) *
    Math.exp(-p.investment_rate_sensitivity * (realRate - c.realRate0)) *
    (1 - (p.investment_corporate_tax_sensitivity * (e.taxRates.corporate - c.corporateRate0)) / 100);
  const investmentDemand = e.fixedInvestment + p.investment_adjustment * (Math.max(0, desiredInvestment) - e.fixedInvestment);

  const desiredStock = p.inventory_ratio * previousFinalSales;
  const inventoryDemand = 4 * p.inventory_adjustment * (desiredStock - e.inventoryStock);

  // Government: each budget line's purchases, plus state and local government.
  const stateLocal = c.stateLocal0 * scale;
  let workforce = ind.workforceShare.state_local * stateLocal;
  let governmentProducts = scaled(ind.bridges.state_local, stateLocal);
  for (const line of e.budgetLines) {
    if (!line.kind || !(PURCHASE_KINDS as readonly string[]).includes(line.kind)) continue;
    const real = (e.budgetEffective[line.id] ?? 0) / previousPrice;
    workforce += (ind.workforceShare.budget[line.id] ?? 0) * real;
    governmentProducts = add(governmentProducts, scaled(ind.bridges.budget[line.id] ?? zeros(n), real));
  }

  const aid = sumByKind(e.budgetLines, e.budgetEffective, ['foreign_aid']);
  e.exportBase *= Math.pow(1 + p.world_demand_growth, QUARTER);
  const aidExports = (c.aidTiedShare * aid) / previousPrice;

  // --- Industry: products, capacity, rationing --------------------------------------
  const demand: Record<DemandComponent, Vector> = {
    consumption: scaled(ind.bridges.consumption, consumptionDemand),
    fixed_investment: scaled(ind.bridges.fixed_investment, investmentDemand),
    inventories: scaled(ind.bridges.inventory_investment, inventoryDemand),
    government: governmentProducts,
    exports: add(scaled(ind.bridges.exports, e.exportBase), scaled(ind.bridges.aid_exports, aidExports)),
  };
  const tariffFactor = Math.pow((1 + c.tariffRate0 / 100) / (1 + e.taxRates.tariff / 100), p.import_tariff_elasticity);
  const normalCapacity = normalCapacities(ind, e.potential);
  const production = solveProduction({
    A: ind.A,
    valueAdded: ind.valueAdded,
    importShare: importShares(ind, tariffFactor),
    tradable: ind.tradable,
    sectorCeiling: normalCapacity.map((cap) => cap * (1 + p.sector_capacity_ceiling / 100)),
    businessCeiling: e.potential * (1 + p.capacity_ceiling / 100) - workforce,
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
  e.consumption = delivered('consumption');
  e.fixedInvestment = delivered('fixed_investment');
  e.inventoryInvestment = delivered('inventories');
  e.government = delivered('government') + workforce;
  e.exports = delivered('exports');
  e.imports = sum(production.imports) + sum(production.surgeImports);
  const output = production.businessValueAdded + workforce;
  e.gdpReal = output;
  e.inventoryStock += e.inventoryInvestment * QUARTER;
  const gapPct = (output / e.potential - 1) * 100;

  ind.output = production.output;
  ind.normalCapacity = normalCapacity;
  ind.imports = production.imports;
  ind.surgeImports = production.surgeImports;
  ind.unmet = production.unmet;
  ind.unmetByProduct = production.unmetByProduct;
  ind.governmentWorkforce = workforce;
  const utilisation = production.output.map((x, j) => x / normalCapacity[j]!);

  // --- Jobs (Okun's law) ------------------------------------------------------
  const okunRaw = p.natural_unemployment - p.okun_coefficient * gapPct;
  const okunTarget = Math.max(p.minimum_unemployment, okunRaw);
  const previousUnemployment = e.unemployment;
  e.unemployment = Math.max(1, previousUnemployment + p.unemployment_adjustment * (okunTarget - previousUnemployment));
  e.breakdown.unemployment = [
    { label: 'Natural rate', value: p.natural_unemployment },
    { label: 'Output gap (Okun)', value: -p.okun_coefficient * gapPct },
    { label: 'Frictional floor', value: okunTarget - okunRaw },
    { label: 'Hiring lag', value: e.unemployment - okunTarget },
  ];

  // --- Prices (Phillips curve) -----------------------------------------------
  // Bottlenecks: each sector running well above normal capacity pushes up
  // prices, weighted by its share of value added. Shortages: demand that could
  // not be met at all bids prices up further.
  const valueAdded = production.output.map((x, j) => ind.valueAdded[j]! * x);
  const valueAddedTotal = sum(valueAdded);
  const gapPressure = p.phillips_slope * gapPct;
  const bottlenecks =
    p.overheating_slope *
    utilisation.reduce(
      (s, u, j) => s + (valueAdded[j]! / valueAddedTotal) * Math.max(0, (u - 1) * 100 - p.overheating_threshold),
      0,
    );
  const unmetTotal = DEMAND_COMPONENTS.reduce((s, k) => s + production.unmet[k], 0);
  const shortages = (unmetTotal / e.potential) * 100;
  const rawInflation = e.expectedInflation + gapPressure + bottlenecks + shortages;
  e.inflation = Math.min(INFLATION_CEILING, Math.max(INFLATION_FLOOR, rawInflation));
  e.breakdown.inflation = [
    { label: 'Expected inflation', value: e.expectedInflation },
    { label: 'Output gap', value: gapPressure },
    { label: 'Industry bottlenecks', value: bottlenecks },
    { label: 'Shortages', value: shortages },
  ];
  e.priceLevel *= Math.pow(1 + e.inflation / 100, QUARTER);
  const P = e.priceLevel;
  const gdpNominal = output * P;

  // --- Interest rates ---------------------------------------------------------------
  // The central bank leans against inflation and the output gap. Under the
  // Treasury peg it may ease in a slump but cannot raise rates above the ceiling.
  const desiredRate =
    p.neutral_real_rate +
    e.expectedInflation +
    p.policy_inflation_response * (e.inflation - p.inflation_anchor) +
    p.policy_gap_response * gapPct;
  const rateCeiling = e.monetaryRegime === 'treasury_peg' ? e.shortRateCeiling : Infinity;
  const targetRate = Math.min(rateCeiling, Math.max(p.policy_rate_floor, desiredRate));
  e.shortRate += p.policy_rate_smoothing * (targetRate - e.shortRate);

  // --- Federal budget (nominal) -------------------------------------------------
  const rate = (t: TaxId) => e.taxRates[t] / 100;
  const bracketCreep = Math.pow(gdpNominal / population / c.nominalIncomePerHead0, p.income_tax_progressivity);
  const profitCycle = Math.max(0, 1 + (p.profit_cyclicality * gapPct) / 100);
  const receipts: Record<string, number> = {
    income: rate('income') * c.incomeTaxBase * gdpNominal * bracketCreep,
    corporate: rate('corporate') * c.corporateTaxBase * gdpNominal * profitCycle,
    excise: rate('excise') * c.exciseScale * e.consumption * P,
    payroll: rate('payroll') * c.payrollBase * gdpNominal,
    tariff: rate('tariff') * c.tariffScale * e.imports * P,
    other: c.otherReceiptsShare * gdpNominal,
  };
  const unemploymentInsurance = c.uiPerPoint * e.unemployment * P * scale;
  const interest = e.debtRate * e.debt;
  const outlays: Record<string, number> = {
    ...e.budgetEffective,
    unemployment_insurance: unemploymentInsurance,
    interest,
  };
  const totalReceipts = Object.values(receipts).reduce((a, b) => a + b, 0);
  const totalOutlays = Object.values(outlays).reduce((a, b) => a + b, 0);
  const balance = totalReceipts - totalOutlays;
  e.fiscal = { receipts, outlays, totalReceipts, totalOutlays, balance };

  e.debt -= balance * QUARTER; // negative debt = the government is a net lender
  e.debtRate += p.debt_rate_adjustment * (e.longRate / 100 - e.debtRate);

  // --- Household income for next quarter's spending --------------------------------
  const transfers = sumByKind(e.budgetLines, e.budgetEffective, ['transfer']) + unemploymentInsurance;
  const householdTaxes = receipts.income! + receipts.excise! + receipts.payroll!;
  const stateLocalTaxes = stateLocal * P;
  const disposableNominal =
    gdpNominal * (1 - p.business_saving_share) - householdTaxes - stateLocalTaxes + transfers + interest;
  e.disposableIncomeReal = disposableNominal / P;

  // --- Balance of payments and gold (Bretton Woods) --------------------------------
  const defence = sumByKind(e.budgetLines, e.budgetEffective, ['defence']);
  e.balanceOfPayments =
    (e.exports - e.imports) * P +
    c.netFactorIncomeShare * gdpNominal -
    aid -
    c.defenceAbroadShare * defence -
    c.privateOutflowShare * gdpNominal;
  const goldFlow = p.gold_settlement_share * e.balanceOfPayments * QUARTER;
  e.gold = Math.max(0, e.gold + goldFlow);
  if (e.balanceOfPayments < 0) {
    e.foreignDollarClaims += (1 - p.gold_settlement_share) * -e.balanceOfPayments * QUARTER;
  }

  // --- Capital: this quarter's investment builds next quarter's capacity ------------
  accumulateCapital(ind, e.fixedInvestment, utilisation, p);

  // --- Year-on-year rates ---------------------------------------------------------
  const gdpYearAgo = e.recentGdpReal[0]!;
  const priceYearAgo = e.recentPrice[0]!;
  e.recentGdpReal = [...e.recentGdpReal.slice(1), output];
  e.recentPrice = [...e.recentPrice.slice(1), P];

  const headline: Record<string, number> = {
    gdp_nominal: gdpNominal,
    gdp_real: output,
    real_growth: (output / gdpYearAgo - 1) * 100,
    inflation: (P / priceYearAgo - 1) * 100,
    unemployment: e.unemployment,
    interest_rate: e.shortRate,
    budget_balance: balance,
    public_debt: e.debt,
    debt_to_gdp: (e.debt / gdpNominal) * 100,
    gold_reserves: e.gold,
    defence_spending: defence,
    industrial_output:
      (100 * production.output.reduce((s, x, j) => s + (ind.industrial[j] ? ind.valueAdded[j]! * x : 0), 0)) /
      ind.base.industrialValueAdded,
  };
  for (const indicator of ind.base.physical) {
    headline[indicator.stat] = indicator.perUnit * production.output[indicator.sector]!;
  }
  return headline;
}
