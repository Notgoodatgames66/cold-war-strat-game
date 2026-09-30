/**
 * Calibration: building a nation's economy at the start of the game.
 *
 * The data files give observed 1949 flows (investment, exports, tax receipts,
 * outlays) and model parameters. Calibration derives the few hidden constants
 * (autonomous consumption, tax bases, the input–output structure…) so that the model's
 * first quarter reproduces the 1949 figures exactly. Nothing here is tuned by
 * hand: change a data figure and the constants follow.
 */

import type { NationData } from '../schema';
import { PURCHASE_KINDS, createIndustry } from './industry';
import {
  MODEL_PARAM_KEYS,
  TAX_IDS,
  type BudgetLineDef,
  type Calibration,
  type EconomyModelData,
  type EconomyState,
  type FiscalAccounts,
  type IndustryTableData,
  type KeynesianEconomyData,
  type ModelParamKey,
  type PlanData,
  type SectorDef,
  type TaxId,
  type TaxLineDef,
} from './types';

export const REQUIRED_STATS = [
  'gdp_nominal',
  'real_growth',
  'inflation',
  'unemployment',
  'public_debt',
  'gold_reserves',
  'population',
] as const;

export interface EconomyDefs {
  models: Record<string, EconomyModelData>;
  budgetLines: BudgetLineDef[];
  taxLines: TaxLineDef[];
  sectors: SectorDef[];
  industryTables: Record<string, IndustryTableData>;
  plans: Record<string, PlanData>;
}

export function sumByKind(
  lines: { id: string; kind?: string }[],
  values: Record<string, number>,
  kinds: readonly string[],
): number {
  return lines.filter((l) => l.kind && kinds.includes(l.kind)).reduce((sum, l) => sum + (values[l.id] ?? 0), 0);
}

export { PURCHASE_KINDS };

/** Reads a model's parameters from its data file. */
export function modelParams(model: EconomyModelData): Record<ModelParamKey, number> {
  return Object.fromEntries(MODEL_PARAM_KEYS.map((k) => [k, model.params[k]!.value])) as Record<ModelParamKey, number>;
}

/** Long-horizon inflation expectations used by investors: mostly the anchor, partly recent experience. */
export function investorInflation(expected: number, params: Pick<Record<ModelParamKey, number>, 'inflation_anchor' | 'long_expectations_weight'>): number {
  return params.inflation_anchor + params.long_expectations_weight * (expected - params.inflation_anchor);
}

/** Builds a Keynesian economy (the United States) from its data. */
export function createEconomy(nation: NationData, defs: EconomyDefs): EconomyState {
  if (!nation.economy) throw new Error(`${nation.id} has no economy block`);
  const model = defs.models[nation.economy.model];
  if (!model) throw new Error(`${nation.id}: unknown economy model "${nation.economy.model}"`);
  if (model.engine !== 'keynesian') throw new Error(`${nation.id}: model "${model.id}" is not a Keynesian model`);
  const data = nation.economy as KeynesianEconomyData;

  const stat = (id: (typeof REQUIRED_STATS)[number]) => {
    const value = nation.stats[id]?.value;
    if (value === undefined) throw new Error(`${nation.id}: an economy needs the "${id}" stat`);
    return value;
  };
  const s = Object.fromEntries(Object.entries(data.start).map(([k, v]) => [k, v.value])) as Record<
    keyof typeof data.start,
    number
  >;
  const params = modelParams(model);
  const table = defs.industryTables[data.industry];
  if (!table) throw new Error(`${nation.id}: unknown industry table "${data.industry}"`);

  const budget: Record<string, number> = {};
  for (const line of defs.budgetLines) budget[line.id] = data.budget[line.id]?.value ?? 0;
  const taxRates = Object.fromEntries(TAX_IDS.map((t) => [t, data.taxRates[t].value])) as Record<TaxId, number>;
  const receipts0 = Object.fromEntries(TAX_IDS.map((t) => [t, data.taxReceipts[t].value])) as Record<TaxId, number>;

  const Y0 = stat('gdp_nominal');
  const growth0 = stat('real_growth');
  const inflation0 = stat('inflation');
  const u0 = stat('unemployment');
  const debt0 = stat('public_debt');
  const population0 = stat('population');

  const gap0 = s.output_gap / 100;
  const potential0 = Y0 / (1 + gap0);

  // Demand side
  const fedPurchases0 = sumByKind(defs.budgetLines, budget, PURCHASE_KINDS);
  const stateLocal0 = s.government - fedPurchases0;
  const aid0 = sumByKind(defs.budgetLines, budget, ['foreign_aid']);
  const exportBase0 = s.exports - s.aid_tied_share * aid0;
  const consumption0 = Y0 - s.fixed_investment - s.inventory_investment - s.government - (s.exports - s.imports);
  const finalSales0 = Y0 - s.inventory_investment;
  const inventoryStock0 = params.inventory_ratio * finalSales0 + s.inventory_overhang;
  const investmentShare = s.fixed_investment / (potential0 * (1 + params.accelerator * gap0));

  const problems: string[] = [];
  if (stateLocal0 <= 0) problems.push(`federal purchases (${fedPurchases0}) exceed total government (${s.government})`);
  if (exportBase0 <= 0) problems.push(`aid-financed exports exceed total exports`);
  if (consumption0 <= 0) problems.push(`investment, government and net exports exceed GDP`);
  if (problems.length) throw new Error(`${nation.id} economy data is inconsistent: ${problems.join('; ')}`);

  // Taxes: derive each base so that 1949 rates reproduce 1949 receipts.
  const pct = (rate: number) => rate / 100;
  const incomeTaxBase = receipts0.income / (pct(taxRates.income) * Y0);
  const corporateTaxBase = receipts0.corporate / (pct(taxRates.corporate) * Y0 * (1 + params.profit_cyclicality * gap0));
  const exciseScale = receipts0.excise / (pct(taxRates.excise) * consumption0);
  const payrollBase = receipts0.payroll / (pct(taxRates.payroll) * Y0);
  const tariffScale = receipts0.tariff / (pct(taxRates.tariff) * s.imports);

  // Outlays and disposable income
  const transfers0 = sumByKind(defs.budgetLines, budget, ['transfer']);
  const householdTaxes0 = receipts0.income + receipts0.excise + receipts0.payroll;
  const disposable0 =
    Y0 * (1 - params.business_saving_share) -
    householdTaxes0 -
    stateLocal0 +
    transfers0 +
    s.unemployment_insurance +
    s.debt_interest;
  const autonomousConsumption = consumption0 - params.mpc * disposable0;
  if (autonomousConsumption < 0) {
    throw new Error(`${nation.id}: consumption is below what disposable income implies; check mpc and the accounts`);
  }

  const expected0 = params.expectations_persistence * inflation0 + (1 - params.expectations_persistence) * params.inflation_anchor;
  const publicInvestment0 = sumByKind(defs.budgetLines, budget, ['public_investment']);
  const publicCapital0 = publicInvestment0 / params.public_capital_depreciation;

  const industry = createIndustry(nation, table, defs.sectors, defs.budgetLines, {
    gdp: Y0,
    outputGap: gap0,
    potential: potential0,
    fixedInvestment: s.fixed_investment,
    inventoryInvestment: s.inventory_investment,
    consumption: consumption0,
    exports: s.exports,
    imports: s.imports,
    aidTiedExports: s.aid_tied_share * aid0,
    stateLocal: stateLocal0,
    budget,
  });

  const calib: Calibration = {
    potential0,
    autonomousConsumption,
    disposableIncome0: disposable0,
    investmentShare,
    stateLocal0,
    publicCapital0,
    realRate0: s.short_rate - investorInflation(expected0, params),
    corporateRate0: taxRates.corporate,
    tariffRate0: taxRates.tariff,
    incomeTaxBase,
    corporateTaxBase,
    exciseScale,
    payrollBase,
    tariffScale,
    otherReceiptsShare: s.other_receipts / Y0,
    uiPerPoint: s.unemployment_insurance / u0,
    nominalIncomePerHead0: Y0 / population0,
    netFactorIncomeShare: s.net_factor_income / Y0,
    privateOutflowShare: s.private_capital_outflow / Y0,
    defenceAbroadShare: s.defence_abroad_share,
    aidTiedShare: s.aid_tied_share,
  };

  const outlays: Record<string, number> = { ...budget, unemployment_insurance: s.unemployment_insurance, interest: s.debt_interest };
  const receipts: Record<string, number> = { ...receipts0, other: s.other_receipts };
  const totalReceipts = Object.values(receipts).reduce((a, b) => a + b, 0);
  const totalOutlays = Object.values(outlays).reduce((a, b) => a + b, 0);
  const fiscal: FiscalAccounts = { receipts, outlays, totalReceipts, totalOutlays, balance: totalReceipts - totalOutlays };

  // Back-cast the previous four quarters so year-on-year rates start at the 1949 figures.
  const quarterlyGrowth = Math.pow(1 + growth0 / 100, 0.25);
  const quarterlyInflation = Math.pow(1 + inflation0 / 100, 0.25);
  const recentGdpReal = [4, 3, 2, 1].map((k) => Y0 / Math.pow(quarterlyGrowth, k));
  const recentPrice = [4, 3, 2, 1].map((k) => 1 / Math.pow(quarterlyInflation, k));

  return {
    engine: 'keynesian',
    model: data.model,
    monetaryRegime: data.monetaryRegime,
    params,
    calib,
    budgetLines: defs.budgetLines.map(({ id, kind, min, max }) => ({ id, kind, min, max })),
    taxLines: defs.taxLines.map(({ id, min, max }) => ({ id, min, max })),
    budgetTargets: { ...budget },
    budgetEffective: { ...budget },
    budgetIndexed: false,
    taxRates,

    productivity: potential0,
    publicCapital: publicCapital0,
    potential: potential0,

    consumption: consumption0,
    fixedInvestment: s.fixed_investment,
    inventoryInvestment: s.inventory_investment,
    inventoryStock: inventoryStock0,
    government: s.government,
    exports: s.exports,
    imports: s.imports,
    gdpReal: Y0,
    exportBase: exportBase0,
    disposableIncomeReal: disposable0,

    priceLevel: 1,
    inflation: inflation0,
    expectedInflation: expected0,
    unemployment: u0,
    shortRate: s.short_rate,
    shortRateCeiling: s.short_rate_ceiling,
    longRate: s.long_rate,
    debtRate: s.debt_interest / debt0,

    debt: debt0,
    gold: stat('gold_reserves'),
    foreignDollarClaims: 0,
    balanceOfPayments: 0,

    recentGdpReal,
    recentPrice,

    industry,

    fiscal,
    breakdown: { inflation: [], unemployment: [] },
  };
}
