/**
 * Demography: births, deaths and ageing, every quarter (the cohort-component
 * method from the GDD).
 *
 * - Deaths: an age-specific rate, times multipliers by attribute (race, sex,
 *   class…), falling each year as medicine improves.
 * - Ageing: a quarter-year's share of each age band moves up to the next.
 * - Births: women in the fertile bands have children at an age-specific rate
 *   times multipliers. Children are born into their mother's household, so
 *   they inherit her region, race, class, religion and settlement.
 * - The Easterlin effect: fertility rises when young adults live better than
 *   they grew up expecting, and falls as expectations catch up.
 *
 * Base rates are rescaled at game start so the first year's crude birth and
 * death rates match history exactly.
 */

import { roundSize } from './build';
import { codecFor, type PopCodec } from './codec';
import type { CategoryMultipliers, PopModelData, PopsState } from './types';

const QUARTER = 0.25;
/** Pops that shrink below this are dropped. */
const MIN_POP = 1;

interface Rates {
  /** Base death rate (per year) of every attribute combination, before scaling and improvement. */
  mortality: Float64Array;
  /** Base birth rate (per year) of every combination, before scaling and the Easterlin effect; 0 for men and children. */
  fertility: Float64Array;
  /** Scratch table over every combination, reused each quarter. */
  scratch: Float64Array;
}

function multiplierTables(codec: PopCodec, table: CategoryMultipliers): Float64Array[] {
  return codec.attributes.map((attr) => Float64Array.from(attr.categories.map((c) => table[attr.id]?.[c.id] ?? 1)));
}

const ratesCache = new WeakMap<PopModelData, Rates>();

/** Base rates for every attribute combination, worked out once per model. */
function ratesFor(model: PopModelData): Rates {
  const cached = ratesCache.get(model);
  if (cached) return cached;
  const codec = codecFor(model);
  const d = model.demography;
  const age = codec.role.age!;
  const sex = codec.role.sex!;
  const ageCats = codec.attributes[age]!.categories;
  const female = codec.attributes[sex]!.categories.findIndex((c) => c.female);
  const baseMortality = ageCats.map((c) => d.mortality[c.id] ?? 0);
  const baseFertility = ageCats.map((c) => d.fertility[c.id] ?? 0);
  const mMult = multiplierTables(codec, d.mortalityMultipliers);
  const fMult = multiplierTables(codec, d.fertilityMultipliers);
  const mortality = new Float64Array(codec.cells);
  const fertility = new Float64Array(codec.cells);
  for (let key = 0; key < codec.cells; key++) {
    const a = codec.get(key, age);
    let m = baseMortality[a]!;
    for (let k = 0; k < mMult.length; k++) m *= mMult[k]![codec.get(key, k)]!;
    mortality[key] = m;
    if (codec.get(key, sex) === female && baseFertility[a]! > 0) {
      let f = baseFertility[a]!;
      for (let k = 0; k < fMult.length; k++) if (k !== sex) f *= fMult[k]![codec.get(key, k)]!;
      fertility[key] = f;
    }
  }
  const rates = { mortality, fertility, scratch: new Float64Array(codec.cells) };
  ratesCache.set(model, rates);
  return rates;
}

/** Band index of each single year of age in the profile. */
function bandOfAge(model: PopModelData, length: number): number[] {
  const codec = codecFor(model);
  const bands = codec.attributes[codec.role.age!]!.categories;
  return Array.from({ length }, (_, age) => {
    let b = 0;
    bands.forEach((c, i) => {
      if (age >= (c.ageFrom ?? 0)) b = i;
    });
    return b;
  });
}

/** People in each age band, from the pops. */
function bandTotals(model: PopModelData, pops: Pick<PopsState, 'keys' | 'size'>): number[] {
  const codec = codecFor(model);
  const age = codec.role.age!;
  const out = new Array<number>(codec.sizes[age]!).fill(0);
  for (let i = 0; i < pops.keys.length; i++) out[codec.get(pops.keys[i]!, age)]! += pops.size[i]!;
  return out;
}

/** Rescales the age profile so each band's single years add up to the pops' band total. */
function fitProfile(model: PopModelData, pops: PopsState): void {
  const band = bandOfAge(model, pops.ageProfile.length);
  const totals = bandTotals(model, pops);
  const inProfile = totals.map(() => 0);
  pops.ageProfile.forEach((p, a) => (inProfile[band[a]!]! += p));
  pops.ageProfile = pops.ageProfile.map((p, a) => (inProfile[band[a]!]! > 0 ? (p * totals[band[a]!]!) / inProfile[band[a]!]! : 0));
}

/**
 * Yearly share of each age band that moves up to the next: the size of the
 * band's oldest single-year cohort over the band's total. Without a profile,
 * an even spread (1 ÷ width).
 */
function ageingShares(model: PopModelData, pops: PopsState): number[] {
  const codec = codecFor(model);
  const bands = codec.attributes[codec.role.age!]!.categories;
  const last = bands.length - 1;
  if (pops.ageProfile.length === 0) return bands.map((c, b) => (b < last && c.ageWidth ? 1 / c.ageWidth : 0));
  const band = bandOfAge(model, pops.ageProfile.length);
  const total = bands.map(() => 0);
  pops.ageProfile.forEach((p, a) => (total[band[a]!]! += p));
  return bands.map((c, b) => {
    if (b === last || !c.ageWidth) return 0;
    const top = (c.ageFrom ?? 0) + c.ageWidth - 1;
    return total[b]! > 0 ? Math.min(1, (pops.ageProfile[top] ?? 0) / total[b]!) : 0;
  });
}

/**
 * Advances the age profile by a year: every cohort moves up a year, losing its
 * band's deaths; this year's births become age 0; then the profile is
 * refitted to the pops' band totals so the two never drift apart.
 */
function advanceProfile(model: PopModelData, pops: PopsState, deathScale: number): void {
  if (pops.ageProfile.length === 0) return;
  const codec = codecFor(model);
  const bands = codec.attributes[codec.role.age!]!.categories;
  const band = bandOfAge(model, pops.ageProfile.length);
  const rate = bands.map((c) => Math.min(0.9, (model.demography.mortality[c.id] ?? 0) * deathScale));
  const old = pops.ageProfile;
  const n = old.length;
  const next = new Array<number>(n).fill(0);
  next[0] = pops.birthsThisYear;
  for (let a = 0; a < n; a++) {
    const survivors = old[a]! * (1 - rate[band[a]!]!);
    next[Math.min(n - 1, a + 1)]! += survivors;
  }
  pops.ageProfile = next;
  pops.birthsThisYear = 0;
  fitProfile(model, pops);
}

/** Young adults (the second age band) as a share of working-age people (all bands but the first and last). */
export function youngShare(model: PopModelData, pops: Pick<PopsState, 'keys' | 'size'>): number {
  const codec = codecFor(model);
  const age = codec.role.age!;
  const last = codec.sizes[age]! - 1;
  let young = 0;
  let working = 0;
  for (let i = 0; i < pops.keys.length; i++) {
    const a = codec.get(pops.keys[i]!, age);
    if (a === 0 || a === last) continue;
    working += pops.size[i]!;
    if (a === 1) young += pops.size[i]!;
  }
  return working > 0 ? young / working : 0;
}

/**
 * Sets the birth and death scales so the base year matches the crude rates in
 * the data, and starts the Easterlin expectation. `living` is real household
 * consumption per head (any unit, as long as it stays the same).
 */
export function calibrateDemography(model: PopModelData, pops: PopsState, living: number, womenWork = 0): void {
  const { mortality, fertility } = ratesFor(model);
  let people = 0;
  let deaths = 0;
  let births = 0;
  pops.size.forEach((s, i) => {
    const key = pops.keys[i]!;
    people += s;
    deaths += s * mortality[key]!;
    births += s * fertility[key]!;
  });
  const d = model.demography;
  pops.mortalityScale = deaths > 0 ? ((d.crudeDeathRate / 1000) * people) / deaths : 1;
  pops.fertilityScale = births > 0 ? ((d.crudeBirthRate / 1000) * people) / births : 1;
  pops.baseLiving = living;
  pops.expectedLiving = living * d.initialExpectation;
  pops.baseRatio = 1 / d.initialExpectation;
  pops.youngShare0 = youngShare(model, pops);
  pops.womenWork0 = womenWork;
  pops.ageProfile = [...d.ageProfile];
  pops.birthsThisYear = 0;
  fitProfile(model, pops);
  pops.quarters = 0;
}

export interface DemographyResult {
  /** Births and deaths this quarter, in people. */
  births: number;
  deaths: number;
  /** The fertility multiplier applied this quarter from living standards, cohort size and women's work (1 = base year). */
  fertilityMultiplier: number;
}

/**
 * One quarter of births, deaths and ageing. Updates `pops` in place.
 * `womenWork` is women's labour force participation now (0 to skip that effect).
 */
export function stepDemography(model: PopModelData, pops: PopsState, living: number, womenWork = 0): DemographyResult {
  const codec = codecFor(model);
  const d = model.demography;
  const age = codec.role.age!;
  const sex = codec.role.sex!;
  const ageCats = codec.attributes[age]!.categories;
  const male = codec.attributes[sex]!.categories.findIndex((c) => !c.female);
  const female = codec.attributes[sex]!.categories.findIndex((c) => c.female);
  const { mortality, fertility, scratch } = ratesFor(model);
  const ageStride = codec.strides[age]!;
  const sexStride = codec.strides[sex]!;

  // The Easterlin effect: young adults' living standard against what they expect.
  // Bounded, so an economic collapse or boom cannot drive fertility to absurd levels.
  const safeLiving = Math.max(living, 1e-9);
  const ratio = pops.expectedLiving > 0 ? safeLiving / pops.expectedLiving : pops.baseRatio;
  const cohort = pops.youngShare0 > 0 ? Math.pow(youngShare(model, pops) / pops.youngShare0, -d.cohortSizeElasticity) : 1;
  const work = pops.womenWork0 > 0 && womenWork > 0 ? Math.pow(womenWork / pops.womenWork0, -d.womenWorkElasticity) : 1;
  const easterlin = Math.min(2, Math.max(0.3, Math.pow(ratio / pops.baseRatio, d.fertilityIncomeElasticity) * cohort * work));
  const improvement = Math.pow(1 - d.mortalityImprovement, pops.quarters * QUARTER);
  const deathScale = pops.mortalityScale * improvement;
  const birthScale = pops.fertilityScale * easterlin * QUARTER;
  const ageShare = ageingShares(model, pops).map((s) => s * QUARTER);

  let births = 0;
  let deaths = 0;
  let lo = Infinity;
  let hi = -1;
  const touch = (k: number) => {
    if (k < lo) lo = k;
    if (k > hi) hi = k;
  };

  for (let i = 0; i < pops.keys.length; i++) {
    const key = pops.keys[i]!;
    const size = pops.size[i]!;
    const died = size * Math.min(0.9, mortality[key]! * deathScale) * QUARTER;
    deaths += died;
    const alive = size - died;
    const a = Math.floor(key / ageStride) % ageCats.length;
    const ageing = alive * ageShare[a]!;
    scratch[key]! += alive - ageing;
    touch(key);
    if (ageing > 0) {
      scratch[key + ageStride]! += ageing;
      touch(key + ageStride);
    }
    const f = fertility[key]!;
    if (f > 0) {
      const born = size * f * birthScale;
      births += born;
      const baby = key - a * ageStride;
      const s = Math.floor(key / sexStride) % codec.sizes[sex]!;
      const boy = baby + (male - s) * sexStride;
      const girl = baby + (female - s) * sexStride;
      scratch[boy]! += born * d.maleBirthShare;
      scratch[girl]! += born * (1 - d.maleBirthShare);
      touch(boy);
      touch(girl);
    }
  }

  // Read the scratch table back into sorted pops, clearing it for next time.
  const keys: number[] = [];
  const size: number[] = [];
  for (let k = lo; k <= hi; k++) {
    const v = scratch[k]!;
    if (v === 0) continue;
    scratch[k] = 0;
    if (v < MIN_POP) continue;
    keys.push(k);
    size.push(roundSize(v));
  }
  pops.keys = keys;
  pops.size = size;

  pops.expectedLiving += d.expectationAdjustment * QUARTER * (living - pops.expectedLiving);
  pops.birthsThisYear += births;
  pops.quarters += 1;
  if (pops.quarters % 4 === 0) advanceProfile(model, pops, deathScale);
  return { births, deaths, fertilityMultiplier: easterlin };
}
