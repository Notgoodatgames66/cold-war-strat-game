/**
 * Types for the macroeconomic model.
 *
 * Units: money is $bn at an annual rate. "Real" means constant 1949 dollars;
 * "nominal" means current dollars. Rates are in percent unless noted.
 */

import type { Provenance, SourceRef, SourcedValue } from '../schema';

// ---------------------------------------------------------------------------
// Data-file shapes
// ---------------------------------------------------------------------------

export const BUDGET_KINDS = ['defence', 'purchase', 'public_investment', 'transfer', 'foreign_aid'] as const;
/**
 * How the engine treats a budget line:
 *  defence           government purchase; part is spent abroad
 *  purchase          government purchase
 *  public_investment government purchase that also builds public capital
 *  transfer          paid to households (raises disposable income)
 *  foreign_aid       paid abroad; part comes back as exports
 */
export type BudgetKind = (typeof BUDGET_KINDS)[number];

export interface BudgetLineDef {
  id: string;
  label: string;
  kind: BudgetKind;
  min: number;
  max: number;
  step: number;
  description: string;
}

/** Tax ids are fixed because each has its own tax base in the engine. */
export const TAX_IDS = ['income', 'corporate', 'excise', 'payroll', 'tariff'] as const;
export type TaxId = (typeof TAX_IDS)[number];

export interface TaxLineDef {
  id: TaxId;
  label: string;
  min: number;
  max: number;
  step: number;
  description: string;
}

export interface EconomyModelData {
  id: string;
  label: string;
  description: string;
  params: Record<string, SourcedValue>;
}

export const MONETARY_REGIMES = ['treasury_peg'] as const;
export type MonetaryRegime = (typeof MONETARY_REGIMES)[number];

/** Starting figures a nation's economy block must provide. */
export const ECONOMY_START_KEYS = [
  'fixed_investment',
  'inventory_investment',
  'government',
  'exports',
  'imports',
  'output_gap',
  'inventory_overhang',
  'net_factor_income',
  'private_capital_outflow',
  'unemployment_insurance',
  'debt_interest',
  'other_receipts',
  'short_rate',
  'short_rate_ceiling',
  'long_rate',
  'defence_abroad_share',
  'aid_tied_share',
] as const;
export type EconomyStartKey = (typeof ECONOMY_START_KEYS)[number];

/** Parameters every economy model file must define. */
export const MODEL_PARAM_KEYS = [
  'mpc',
  'consumption_adjustment',
  'current_income_weight',
  'business_saving_share',
  'investment_adjustment',
  'accelerator',
  'investment_rate_sensitivity',
  'long_expectations_weight',
  'investment_corporate_tax_sensitivity',
  'inventory_ratio',
  'inventory_adjustment',
  'capital_share',
  'tfp_growth',
  'labour_force_growth',
  'public_capital_depreciation',
  'public_capital_elasticity',
  'natural_unemployment',
  'minimum_unemployment',
  'okun_coefficient',
  'unemployment_adjustment',
  'phillips_slope',
  'expectations_persistence',
  'inflation_anchor',
  'overheating_threshold',
  'overheating_slope',
  'capacity_ceiling',
  'sector_capacity_ceiling',
  'investment_allocation_sensitivity',
  'utilisation_smoothing',
  'surge_import_share',
  'surge_import_cap',
  'ration_weight_consumption',
  'ration_weight_investment',
  'ration_weight_inventories',
  'ration_weight_government',
  'ration_weight_exports',
  'budget_phase_in',
  'world_demand_growth',
  'import_tariff_elasticity',
  'import_propensity_trend',
  'neutral_real_rate',
  'policy_inflation_response',
  'policy_gap_response',
  'policy_rate_smoothing',
  'policy_rate_floor',
  'profit_cyclicality',
  'income_tax_progressivity',
  'gold_settlement_share',
  'debt_rate_adjustment',
] as const;
export type ModelParamKey = (typeof MODEL_PARAM_KEYS)[number];

export interface NationEconomyData {
  model: string;
  monetaryRegime: MonetaryRegime;
  /** Id of the input–output table in data/economy/industry/. */
  industry: string;
  start: Record<EconomyStartKey, SourcedValue>;
  /** Starting outlay per budget line, nominal $bn a year. */
  budget: Record<string, SourcedValue>;
  /** Starting rate per tax, percent. */
  taxRates: Record<TaxId, SourcedValue>;
  /** Starting receipts per tax, nominal $bn a year (used to calibrate each tax base). */
  taxReceipts: Record<TaxId, SourcedValue>;
}

// ---------------------------------------------------------------------------
// Industry data (data/economy/sectors.json, data/economy/industry/*.json)
// ---------------------------------------------------------------------------

export interface SectorDef {
  id: string;
  label: string;
  description: string;
  /** Can shortages be met by extra imports? */
  tradable: boolean;
  /** Counts towards the industrial production index. */
  industrial: boolean;
}

/** A set of shares that sum to 1, keyed by sector id (and `workforce` where allowed). */
export interface SourcedShares {
  value: Record<string, number>;
  provenance: Provenance;
  note: string;
}

/** Bridge key for the part of government spending that pays its own workforce. */
export const WORKFORCE = 'workforce';

export interface IndustrySectorData {
  /** Share of business (non-government) value added. */
  valueAddedShare: SourcedValue;
  /** Value added per dollar of gross output. */
  valueAddedRatio: SourcedValue;
  /** Where this sector's intermediate inputs come from (shares, sum to 1). */
  inputs: SourcedShares;
  /** Imports of this sector's product, $bn in the base year. */
  imports: SourcedValue;
  /** Share of private fixed capital. */
  capitalShare: SourcedValue;
  /** Share of private fixed investment in the base year. */
  investmentShare: SourcedValue;
}

export interface IndustryTableData {
  id: string;
  description: string;
  verification: 'unchecked' | 'checked';
  sources: SourceRef[];
  sectors: Record<string, IndustrySectorData>;
  capital: { capitalOutputRatio: SourcedValue; depreciation: SourcedValue };
  bridges: {
    fixed_investment: SourcedShares;
    inventory_investment: SourcedShares;
    state_local: SourcedShares;
    exports: SourcedShares;
    aid_exports: SourcedShares;
    /** One bridge per government-purchase budget line (defence, purchase, public investment). */
    budget: Record<string, SourcedShares>;
  };
  physicalIndicators: { stat: string; sector: string; note: string }[];
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** Final demand is split into these components for rationing and reporting. */
export const DEMAND_COMPONENTS = ['consumption', 'fixed_investment', 'inventories', 'government', 'exports'] as const;
export type DemandComponent = (typeof DEMAND_COMPONENTS)[number];

export interface IndustryState {
  table: string;
  /** Sector ids, in matrix order. */
  sectors: string[];
  tradable: boolean[];
  industrial: boolean[];
  /** A[i][j]: input from sector i per unit of sector j's gross output (all sources). */
  A: number[][];
  /** Value added per unit of gross output. */
  valueAdded: number[];
  /** Base-year share of each product's home use that is imported. */
  importShare0: number[];
  /** Trend multiplier on import shares (foreign recovery and integration). */
  importIndex: number;
  /** How each demand component is split across products (shares). */
  bridges: {
    consumption: number[];
    fixed_investment: number[];
    inventory_investment: number[];
    state_local: number[];
    exports: number[];
    aid_exports: number[];
    budget: Record<string, number[]>;
  };
  /** Share of each government spending stream that pays government's own workforce. */
  workforceShare: { state_local: number; budget: Record<string, number> };

  // Capital and capacity (real, 1949 dollars)
  capital: number[];
  depreciation: number[];
  investmentShare: number[];
  /** Normal capacity of sector j = capacityCoef[j] × (its share of capital) × potential GDP. */
  capacityCoef: number[];
  /** Recent capacity use per sector (1 = normal), smoothed; steers new investment. */
  utilisationSmoothed: number[];

  // Last quarter's results
  output: number[];
  normalCapacity: number[];
  imports: number[];
  surgeImports: number[];
  /** Final demand that went unmet, by component, real $bn (annual rate). */
  unmet: Record<DemandComponent, number>;
  /** Final demand that went unmet, by product. */
  unmetByProduct: number[];
  /** Government's own workforce (value added), real. */
  governmentWorkforce: number;

  base: {
    output: number[];
    privateCapital: number;
    labourIndex: number;
    industrialValueAdded: number;
    /** Physical indicators, e.g. steel tonnes per unit of heavy-industry output. */
    physical: { stat: string; sector: number; perUnit: number }[];
  };
  /** Labour input index (1 in the base year). */
  labourIndex: number;
}

/** A policy lever the engine needs to know about (copied into the save so old games keep their rules). */
export interface LeverBounds {
  id: string;
  kind?: BudgetKind;
  min: number;
  max: number;
}

/** One term of a tooltip breakdown: "Output gap +0.4". */
export interface Contribution {
  label: string;
  value: number;
}

/** Constants fixed at the start of the game so that 1949 reproduces the data exactly. */
export interface Calibration {
  potential0: number;
  autonomousConsumption: number;
  /** Real disposable income in the first quarter; scaled by potential to give expected long-run income. */
  disposableIncome0: number;
  investmentShare: number;
  stateLocal0: number;
  publicCapital0: number;
  realRate0: number;
  corporateRate0: number;
  tariffRate0: number;
  incomeTaxBase: number;
  corporateTaxBase: number;
  exciseScale: number;
  payrollBase: number;
  tariffScale: number;
  otherReceiptsShare: number;
  uiPerPoint: number;
  nominalIncomePerHead0: number;
  netFactorIncomeShare: number;
  privateOutflowShare: number;
  defenceAbroadShare: number;
  aidTiedShare: number;
}

export interface FiscalAccounts {
  receipts: Record<string, number>;
  outlays: Record<string, number>;
  totalReceipts: number;
  totalOutlays: number;
  balance: number;
}

export interface EconomyState {
  model: string;
  monetaryRegime: MonetaryRegime;
  params: Record<ModelParamKey, number>;
  calib: Calibration;
  budgetLines: LeverBounds[];
  taxLines: LeverBounds[];

  /** Budget the player has set (nominal $bn a year). */
  budgetTargets: Record<string, number>;
  /** Budget actually being spent this quarter; moves towards the targets. */
  budgetEffective: Record<string, number>;
  /** When true, budget targets rise automatically with the economy's nominal growth. */
  budgetIndexed: boolean;
  taxRates: Record<TaxId, number>;

  // Supply side (real)
  /** Total factor productivity level (potential output at base-year capital, labour and public capital). */
  productivity: number;
  publicCapital: number;
  potential: number;

  // Demand components (real, annual rate)
  consumption: number;
  fixedInvestment: number;
  inventoryInvestment: number;
  inventoryStock: number;
  government: number;
  exports: number;
  imports: number;
  gdpReal: number;
  exportBase: number;
  disposableIncomeReal: number;

  // Prices, jobs, money
  priceLevel: number;
  inflation: number;
  expectedInflation: number;
  unemployment: number;
  shortRate: number;
  /** Highest short rate the Treasury allows while the peg lasts. */
  shortRateCeiling: number;
  longRate: number;
  debtRate: number;

  // Balances
  debt: number;
  gold: number;
  foreignDollarClaims: number;
  balanceOfPayments: number;

  /** Real GDP and price level for the previous four quarters, oldest first (for year-on-year rates). */
  recentGdpReal: number[];
  recentPrice: number[];

  industry: IndustryState;

  fiscal: FiscalAccounts;
  breakdown: {
    inflation: Contribution[];
    unemployment: Contribution[];
  };
}
