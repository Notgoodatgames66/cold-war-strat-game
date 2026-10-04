/**
 * Pops and the economy.
 *
 * - Income: each pop's living standard is the national one (real household
 *   consumption per head) times its relative income, built additively in log
 *   points from its class, race, place and region, averaged so the population
 *   mean is exactly the national figure.
 * - Labour force: people of working age times participation rates by sex and
 *   age (and a few multipliers), with women's participation rising over time.
 * - Engel's law: each pop splits its spending between the seven sectors
 *   according to its income; richer households spend a smaller share on food
 *   and a larger share on services and technology. Calibrated so the base year
 *   reproduces the input–output table's household spending exactly.
 * - Jobs: each sector needs workers in proportion to its output divided by its
 *   labour productivity; that sets how many households each class "should"
 *   have, which drives mobility between classes (see mobility.ts).
 */

import type { IndustryState } from '../economy/types';
import { codecFor } from './codec';
import type { PopEconomyData, PopEconomyLink, PopModelData, PopsState } from './types';

interface Tables {
  /** Log-point relative income of every combination (before averaging). */
  logIncome: Float64Array;
  /** Base-year labour force participation of every combination, and whether it is female. */
  participation: Float64Array;
  female: Uint8Array;
  /** Participation cap for women (men's rate in the same band). */
  cap: Float64Array;
}

const tablesCache = new WeakMap<PopModelData, Tables>();

function tablesFor(model: PopModelData, econ: PopEconomyData): Tables {
  const cached = tablesCache.get(model);
  if (cached) return cached;
  const codec = codecFor(model);
  const region = codec.role.region;
  const age = codec.role.age!;
  const sex = codec.role.sex!;
  const sexCats = codec.attributes[sex]!.categories;
  const ageCats = codec.attributes[age]!.categories;
  const femaleIndex = sexCats.findIndex((c) => c.female);
  const maleIndex = sexCats.findIndex((c) => !c.female);
  const incomeTables = codec.attributes.map((attr, a) =>
    Float64Array.from(attr.categories.map((c) => (econ.income[attr.id]?.[c.id] ?? 0) + (a === region ? econ.regionIncome[c.group ?? ''] ?? 0 : 0))),
  );
  const mult = (table: Record<string, Record<string, number>>) =>
    codec.attributes.map((attr) => Float64Array.from(attr.categories.map((c) => table[attr.id]?.[c.id] ?? 1)));
  const pMult = mult(econ.participation.multipliers);
  const fMult = mult(econ.participation.femaleMultipliers);
  const baseRate = sexCats.map((s) => ageCats.map((a) => econ.participation.rates[s.id]?.[a.id] ?? 0));

  const logIncome = new Float64Array(codec.cells);
  const participation = new Float64Array(codec.cells);
  const female = new Uint8Array(codec.cells);
  const cap = new Float64Array(codec.cells);
  for (let key = 0; key < codec.cells; key++) {
    let li = 0;
    for (let a = 0; a < incomeTables.length; a++) li += incomeTables[a]![codec.get(key, a)]!;
    logIncome[key] = li;
    const s = codec.get(key, sex);
    const g = codec.get(key, age);
    let p = baseRate[s]![g]!;
    for (let a = 0; a < pMult.length; a++) p *= pMult[a]![codec.get(key, a)]!;
    if (s === femaleIndex) {
      for (let a = 0; a < fMult.length; a++) p *= fMult[a]![codec.get(key, a)]!;
      female[key] = 1;
      cap[key] = baseRate[maleIndex]![g]!;
    }
    participation[key] = Math.min(1, p);
  }
  const tables = { logIncome, participation, female, cap };
  tablesCache.set(model, tables);
  return tables;
}

/** Each pop's relative income (population-weighted mean 1). */
export function relativeIncomes(model: PopModelData, pops: Pick<PopsState, 'keys' | 'size'>): Float64Array {
  const econ = model.economy;
  const out = new Float64Array(pops.keys.length);
  if (!econ) return out.fill(1);
  const { logIncome } = tablesFor(model, econ);
  let people = 0;
  let weighted = 0;
  for (let i = 0; i < pops.keys.length; i++) {
    const r = Math.exp(logIncome[pops.keys[i]!]!);
    out[i] = r;
    people += pops.size[i]!;
    weighted += pops.size[i]! * r;
  }
  const mean = weighted / people;
  for (let i = 0; i < out.length; i++) out[i]! /= mean;
  return out;
}

/** People in the labour force, `years` after the base year. */
export function labourForce(model: PopModelData, pops: Pick<PopsState, 'keys' | 'size'>, years: number): number {
  const econ = model.economy;
  if (!econ) return 0;
  const { participation, female, cap } = tablesFor(model, econ);
  const rise = econ.participation.femaleTrend * Math.max(0, years);
  let lf = 0;
  for (let i = 0; i < pops.keys.length; i++) {
    const k = pops.keys[i]!;
    const p = female[k] ? Math.min(cap[k]!, participation[k]! > 0 ? participation[k]! + rise : 0) : participation[k]!;
    lf += pops.size[i]! * p;
  }
  return lf;
}

/** Women's labour force participation: women in the labour force ÷ women of working age (bands with any participation). */
export function womenWork(model: PopModelData, pops: Pick<PopsState, 'keys' | 'size'>, years: number): number {
  const econ = model.economy;
  if (!econ) return 0;
  const { participation, female, cap } = tablesFor(model, econ);
  const rise = econ.participation.femaleTrend * Math.max(0, years);
  let inForce = 0;
  let women = 0;
  for (let i = 0; i < pops.keys.length; i++) {
    const k = pops.keys[i]!;
    if (!female[k] || participation[k]! <= 0) continue;
    women += pops.size[i]!;
    inForce += pops.size[i]! * Math.min(cap[k]!, participation[k]! + rise);
  }
  return women > 0 ? inForce / women : 0;
}

/** People in each class (category order of the class attribute). */
function peopleByClass(model: PopModelData, pops: Pick<PopsState, 'keys' | 'size'>): number[] {
  const codec = codecFor(model);
  const c = codec.role.class!;
  const out = new Array<number>(codec.sizes[c]!).fill(0);
  for (let i = 0; i < pops.keys.length; i++) out[codec.get(pops.keys[i]!, c)]! += pops.size[i]!;
  return out;
}

/** Household spending shares by sector, given each pop's income. */
function engelShares(link: PopEconomyLink, logIncome: number): number[] {
  const w = link.engelBase.map((b, j) => Math.max(0.002, b + link.engelSlope[j]! * logIncome));
  const t = w.reduce((s, x) => s + x, 0);
  return w.map((x) => x / t);
}

/** The household spending mix across sectors (shares summing to 1). */
export function consumptionMix(model: PopModelData, pops: PopsState, living: number): number[] | null {
  const link = pops.link;
  if (!link) return null;
  const rel = relativeIncomes(model, pops);
  const n = link.sectors.length;
  const spend = new Array<number>(n).fill(0);
  const levelLog = Math.log(Math.max(living, 1e-9) / pops.baseLiving);
  // Pops with the same relative income behave alike: bucket incomes to keep this fast.
  const buckets = new Map<number, number>();
  for (let i = 0; i < pops.keys.length; i++) {
    const r = Math.round(Math.log(rel[i]!) * 50) / 50;
    buckets.set(r, (buckets.get(r) ?? 0) + pops.size[i]! * rel[i]!);
  }
  for (const [logRel, income] of buckets) {
    const shares = engelShares(link, logRel + levelLog);
    for (let j = 0; j < n; j++) spend[j]! += income * shares[j]!;
  }
  const total = spend.reduce((s, x) => s + x, 0);
  return spend.map((x) => x / total);
}

/**
 * Sets up the link between a nation's pops and its economy at game start:
 * base-year employment by sector and Engel's law calibrated to the
 * input–output table's household spending.
 */
export function linkEconomy(model: PopModelData, pops: PopsState, industry: IndustryState): void {
  const econ = model.economy;
  if (!econ) return;
  const codec = codecFor(model);
  const classAttr = codec.attributes[codec.role.class!]!;
  const sectors = industry.sectors;
  const byClass = peopleByClass(model, pops);
  const employment0 = sectors.map((sector) =>
    classAttr.categories.reduce((s, c, ci) => s + byClass[ci]! * (econ.employment[c.id]?.[sector] ?? 0), 0),
  );
  const sectorClassShare = sectors.map((sector, j) =>
    classAttr.categories.map((c, ci) => (employment0[j]! > 0 ? (byClass[ci]! * (econ.employment[c.id]?.[sector] ?? 0)) / employment0[j]! : 0)),
  );

  // Engel's law. Slopes from income elasticities: dw/dln(y) = w (e − 1), adjusted to sum to zero.
  const bridge = industry.bridges.consumption;
  let slope = sectors.map((sector, j) => bridge[j]! * ((econ.engel[sector] ?? 1) - 1));
  const excess = slope.reduce((s, x) => s + x, 0);
  const positive = slope.reduce((s, x) => s + Math.max(0, x), 0);
  if (positive > 0) slope = slope.map((x) => (x > 0 ? x - (excess * x) / positive : x));
  // Base shares chosen so that, with the base-year income spread, the mix is exactly the table's.
  const rel = relativeIncomes(model, pops);
  let income = 0;
  let incomeLog = 0;
  for (let i = 0; i < pops.keys.length; i++) {
    income += pops.size[i]! * rel[i]!;
    incomeLog += pops.size[i]! * rel[i]! * Math.log(rel[i]!);
  }
  const meanLog = incomeLog / income;
  const engelBase = sectors.map((_, j) => bridge[j]! - slope[j]! * meanLog);

  pops.link = {
    sectors: [...sectors],
    output0: [...industry.output],
    employment0,
    sectorClassShare,
    engelBase,
    engelSlope: slope,
    consumptionMix: [...bridge],
  };
}

/**
 * How many people each class should have, given the jobs on offer: each
 * sector's workforce grows with its output and shrinks with its productivity.
 *
 * Farm classes get exactly the people farming needs. The other working
 * classes share everyone else in proportion to their sectors' demand: surplus
 * labour ends up in the towns, not on the farms (the Lewis model of
 * development). Returned in class order.
 */
export function classTargets(model: PopModelData, pops: PopsState, output: number[], years: number): number[] | null {
  const econ = model.economy;
  const link = pops.link;
  if (!econ || !link) return null;
  const codec = codecFor(model);
  const classAttr = codec.attributes[codec.role.class!]!;
  const demand = link.sectors.map(
    (sector, j) => (link.employment0[j]! * (output[j]! / link.output0[j]!)) / Math.pow(1 + (econ.productivityGrowth[sector] ?? 0), years),
  );
  const desired = classAttr.categories.map((_, ci) => demand.reduce((s, d, j) => s + d * link.sectorClassShare[j]![ci]!, 0));
  const current = peopleByClass(model, pops);
  const cats = classAttr.categories;
  const working = cats.map((c) => Object.keys(econ.employment[c.id] ?? {}).length > 0);
  const town = cats.map((c, ci) => working[ci] && !c.farm);
  const currentWorking = current.reduce((s, x, ci) => s + (working[ci] ? x : 0), 0);
  const farmTarget = desired.reduce((s, x, ci) => s + (cats[ci]!.farm ? x : 0), 0);
  const townDesired = desired.reduce((s, x, ci) => s + (town[ci] ? x : 0), 0);
  const townPeople = Math.max(0, currentWorking - farmTarget);
  return desired.map((d, ci) => (cats[ci]!.farm ? d : town[ci] ? (d * townPeople) / townDesired : current[ci]!));
}

export { peopleByClass };
