/**
 * Pops: groups of people who share every tracked attribute, each with a size.
 *
 * Every nation's pops use the same structure (GDD: one universal schema). What
 * differs is data: which attributes a nation tracks, their categories, and the
 * census tables its starting population is fitted to. The engine finds the
 * attributes it needs by their `role` (age, sex, region…), never by name.
 *
 * See docs/models/pops.md for the reasoning in plain English.
 */

import type { Provenance, SourceRef } from '../schema';

/** What the engine uses an attribute for. Each role appears at most once per nation. */
export const POP_ROLES = ['region', 'ethnicity', 'sex', 'class', 'religion', 'age', 'settlement'] as const;
export type PopRole = (typeof POP_ROLES)[number];

export interface PopCategory {
  id: string;
  label: string;
  /** Region attribute: the larger division the region belongs to (e.g. a census division). */
  group?: string;
  /** Age attribute: first year of age in the band, and the band's width in years (omit for the open top band). */
  ageFrom?: number;
  ageWidth?: number;
  /** Sex attribute: 'female' marks the sex that gives birth. */
  female?: boolean;
  /** Class attribute: households that farm (they can only live in the countryside). */
  farm?: boolean;
  /** Class attribute: households outside the labour force (retired). */
  retired?: boolean;
}

export interface PopAttributeDef {
  id: string;
  label: string;
  role: PopRole;
  categories: PopCategory[];
}

/**
 * A census table the starting population must match.
 *
 * `given` names the attributes the shares are conditional on: each row (one
 * combination of the given attributes) holds shares that sum to 1 over the
 * remaining attributes. With no `given`, the table is absolute counts.
 * Rows are nested objects keyed by category id, in the order of `dims`.
 */
export interface PopMarginData {
  id: string;
  label: string;
  dims: string[];
  given: string[];
  values: Record<string, unknown>;
  provenance: Provenance;
  note: string;
}

/**
 * How much more (or less) likely two categories are to go together than chance,
 * before the census tables are applied. 0 means "never" (a structural zero, e.g.
 * farm households in a city). The fitting keeps these patterns wherever the
 * census tables do not pin them down.
 */
export interface PopAssociationData {
  id: string;
  dims: [string, string];
  /** odds[categoryOfFirst][categoryOfSecond] = multiplier; unlisted pairs are 1. */
  odds: Record<string, Record<string, number>>;
  provenance: Provenance;
  note: string;
}

/** A per-category multiplier table: rates[attributeId][categoryId] = multiplier (unlisted = 1). */
export type CategoryMultipliers = Record<string, Record<string, number>>;

export interface PopDemographyData {
  /** Births per woman per year by age band id, in the base year. Calibrated so the base year matches crudeBirthRate. */
  fertility: Record<string, number>;
  /** Deaths per person per year by age band id, in the base year. Calibrated so the base year matches crudeDeathRate. */
  mortality: Record<string, number>;
  fertilityMultipliers: CategoryMultipliers;
  mortalityMultipliers: CategoryMultipliers;
  /**
   * People by single year of age in the base year (any scale; only the shape
   * matters), from age 0 up, the last entry open-ended. It tracks each birth
   * cohort's size, so a big generation leaves childhood as a wave rather than
   * leaking out of a 15-year band evenly.
   */
  ageProfile: number[];
  /** Base-year births and deaths per 1,000 people a year. */
  crudeBirthRate: number;
  crudeDeathRate: number;
  /** Share of births that are boys. */
  maleBirthShare: number;
  /** Yearly fall in death rates from better medicine and sanitation. */
  mortalityImprovement: number;
  /** How fast that improvement fades, per year (0 = it never fades). The Soviet gains stalled after the mid-1960s. */
  mortalityImprovementDecay?: number;
  /** Easterlin effect: elasticity of fertility to income relative to what young adults grew up expecting. */
  fertilityIncomeElasticity: number;
  /** Expected living standard in the base year, as a share of the actual one (below 1: raised in harder times). */
  initialExpectation: number;
  /** Share of the gap between expected and actual living standards closed each year. */
  expectationAdjustment: number;
  /**
   * Easterlin's relative cohort size: elasticity of fertility to the young
   * adults' share of the working-age population (big generations compete for
   * jobs and have fewer children).
   */
  cohortSizeElasticity: number;
  /** Elasticity of fertility to women's labour force participation. */
  womenWorkElasticity: number;
  provenance: Provenance;
  note: string;
}

/** How pops earn, work, change jobs and move. All optional parts are skipped when absent. */
export interface PopEconomyData {
  /** Log-point income differences by attribute category (0 = average); averaged out so the population mean is the national figure. */
  income: CategoryMultipliers;
  /** Extra log points by region group (e.g. census division). */
  regionIncome: Record<string, number>;
  participation: {
    /** Share in the labour force by sex and age band (missing bands are 0). */
    rates: Record<string, Record<string, number>>;
    multipliers: CategoryMultipliers;
    /** Extra multipliers for women only. */
    femaleMultipliers: CategoryMultipliers;
    /** Yearly rise in women's participation rates, as a share (0.005 = half a percentage point), capped at men's rates. */
    femaleTrend: number;
  };
  /** Where each class's workers work: employment[class][sector] = share (classes absent here do not work). */
  employment: Record<string, Record<string, number>>;
  /** Yearly labour productivity growth by sector. */
  productivityGrowth: Record<string, number>;
  mobility: {
    /** Share of the gap between the jobs on offer and the households in each class closed per year. */
    rate: number;
    /** Which classes households can move to, with relative ease: paths[from][to]. */
    paths: Record<string, Record<string, number>>;
    /** Where households leaving farming go: settlement category → share. */
    leavingFarms: Record<string, number>;
    /** How mobile households in the oldest age band are, relative to everyone else. */
    oldAgeMobility: number;
  };
  /** Share of working-class households in the oldest age band who retire each year. */
  retirement: { rate: number };
  suburbanisation: {
    /** Share of city households moving to the suburbs each year at base-year living standards. */
    rate: number;
    incomeElasticity: number;
    odds: CategoryMultipliers;
  };
  migration: {
    /** Share of each age band thinking about a move between regions each year. */
    rate: Record<string, number>;
    /** How strongly movers favour regions where people like them live better (per log point). */
    sensitivity: number;
    /** Log-point penalties for some groups in some regions: barriers[attribute][category][region] (e.g. Jim Crow). */
    barriers: Record<string, Record<string, Record<string, number>>>;
    /** Log-point pull of each region for everyone (climate and land: the Sun Belt), by region category id. */
    amenity: Record<string, number>;
    /** How much a destination's size draws movers: weight ∝ population share ^ exponent (below 1 dampens big regions). */
    sizeExponent: number;
    /**
     * Log points lost per unit of a region's farm-household share: where many
     * still farm, there are too few town jobs for those leaving the land, so
     * people move away. Fades as the region modernises.
     */
    farmSurplusPenalty: number;
  };
  /**
   * Immigration, once a year: `rate` × population arrive, split by the shares
   * given for any attributes (e.g. race and age), and settle among existing pops
   * of their group in proportion to size, times `odds` (e.g. cities preferred).
   */
  immigration?: {
    rate: number;
    shares: Record<string, Record<string, number>>;
    odds: CategoryMultipliers;
  };
  /** Engel's law: income elasticity of household spending on each sector's goods. */
  engel: Record<string, number>;
  provenance: Provenance;
  note: string;
}

export interface PopModelData {
  id: string;
  nation: string;
  label: string;
  /** Census year the tables describe. */
  censusYear: number;
  /** The fitted population is scaled to this nation stat (usually "population"). */
  scaleToStat: string;
  /** Combinations smaller than this many people are dropped and their people spread over the rest. */
  threshold: number;
  attributes: PopAttributeDef[];
  margins: PopMarginData[];
  associations: PopAssociationData[];
  demography: PopDemographyData;
  economy?: PopEconomyData;
  /** Generations to mark on the age pyramid: born from `from` to `to` (years). Display only. */
  cohorts?: { label: string; from: number; to: number }[];
  verification: 'unchecked' | 'checked';
  sources: SourceRef[];
}

/** A nation's pops as the game state carries them. Plain arrays so they save as JSON. */
export interface PopsState {
  /** Id of the pop model (data/pops/…) that defines the attributes. */
  model: string;
  /**
   * One number per pop encoding all its categories (mixed radix in attribute
   * order: see codec.ts). Sorted ascending, no duplicates.
   */
  keys: number[];
  /** People in each pop, parallel to keys. */
  size: number[];
  /** Base-year calibration factors for births and deaths. */
  fertilityScale: number;
  mortalityScale: number;
  /** Quarters since the base year, for mortality improvement. */
  quarters: number;
  /** Living standard young adults expect (real consumption per head, 1949 dollars), for the Easterlin effect. */
  expectedLiving: number;
  /** Real consumption per head in the base year, so fertility starts at its calibrated level. */
  baseLiving: number;
  baseRatio: number;
  /** National people by single year of age (the shape within each band), advanced once a year. */
  ageProfile: number[];
  /** Births so far this year, for the age profile. */
  birthsThisYear: number;
  /** Base-year young adults' share of the working-age population, and women's participation rate. */
  youngShare0: number;
  womenWork0: number;
  /** Labour force now and last quarter (people), so the economy can grow its labour input with it. */
  labourForce: number;
  previousLabourForce: number;
  /** The link to the economy, set at game start; absent for nations without a simulated economy. */
  link?: PopEconomyLink;
}

export interface PopEconomyLink {
  /** Sector ids, in the economy's order. */
  sectors: string[];
  /** Real gross output by sector in the base year. */
  output0: number[];
  /** People in each class in the base year who work in each sector: base employment by sector. */
  employment0: number[];
  /** share[sector][class]: each class's share of each sector's base-year workforce. */
  sectorClassShare: number[][];
  /** Engel's law: base-year budget shares and slopes per log point of income. */
  engelBase: number[];
  engelSlope: number[];
  /** Spending mix last quarter (shares of household consumption by sector). */
  consumptionMix: number[];
}
