/**
 * Mobility, once a year: households change class as the jobs on offer change,
 * old workers retire, city families move to the suburbs, and people move
 * between regions towards places where people like them live better.
 *
 * - Class: each class's target size comes from the jobs its sectors offer
 *   (economy.ts). Classes with too many households send a share of the gap
 *   along allowed paths (farm → factory, factory → office…) to classes with
 *   too few. Households leaving farming also leave the farm, to a city, a
 *   suburb or a non-farm home in the countryside.
 * - Retirement: a share of working households in the oldest age band retire.
 * - Suburbs: a share of city households moves out each year, rising with
 *   living standards and varying by group (redlining kept most Black families
 *   out).
 * - Migration: movers weigh every region by its size and by how well people
 *   like them live there (regional income, minus barriers such as Jim Crow).
 *   Farm households do not move between regions; they leave farming first.
 *
 * Settlement categories with the ids "city", "suburb" and "rural" have these
 * meanings; a nation without them simply skips suburbanisation.
 */

import { roundSize } from './build';
import { codecFor } from './codec';
import { classTargets, peopleByClass } from './economy';
import type { PopModelData, PopsState } from './types';

const MIN_POP = 1;
/**
 * Movers can always join a pop that already exists, however few they are; to
 * found a new combination they must number at least this many (otherwise they
 * stay put). This stops movers trickling into thousands of tiny new pops,
 * which would slow the game and bloat saves, without skewing where they go.
 */
const MIN_NEW_POP = 25;


export interface MobilityResult {
  /** People who changed class this year (including farm families leaving farming). */
  changedClass: number;
  leftFarming: number;
  retired: number;
  movedToSuburbs: number;
  /** People who moved to another region. */
  migrated: number;
  /** People who arrived from abroad. */
  immigrants: number;
}

const scratchCache = new WeakMap<PopModelData, Float64Array>();

export interface MobilityContext {
  /** National living standard (real consumption per head) now. */
  living: number;
  /** Real gross output by sector now (economy order), or null without an economy. */
  output: number[] | null;
  /** Years since the base year. */
  years: number;
}

export function stepMobility(model: PopModelData, pops: PopsState, ctx: MobilityContext): MobilityResult {
  const result: MobilityResult = { changedClass: 0, leftFarming: 0, retired: 0, movedToSuburbs: 0, migrated: 0, immigrants: 0 };
  const econ = model.economy;
  if (!econ) return result;
  const codec = codecFor(model);
  const cls = codec.role.class;
  const age = codec.role.age!;
  const settlement = codec.role.settlement;
  const region = codec.role.region;
  if (cls === undefined) return result;

  let scratch = scratchCache.get(model);
  if (!scratch) {
    scratch = new Float64Array(codec.cells);
    scratchCache.set(model, scratch);
  }
  const table = scratch;
  const exists = new Uint8Array(codec.cells);
  for (const k of pops.keys) exists[k] = 1;
  let lo = Infinity;
  let hi = -1;
  const put = (key: number, people: number) => {
    table[key]! += people;
    if (key < lo) lo = key;
    if (key > hi) hi = key;
  };
  /** Moves people to `key` if allowed (see MIN_NEW_POP); returns how many moved. */
  const move = (key: number, people: number): number => {
    if (people <= 0 || (!exists[key] && people < MIN_NEW_POP)) return 0;
    put(key, people);
    return people;
  };

  const classCats = codec.attributes[cls]!.categories;
  const oldest = codec.sizes[age]! - 1;
  const working = classCats.map((c) => Object.keys(econ.employment[c.id] ?? {}).length > 0);
  const retiredClass = classCats.findIndex((c) => c.retired);
  const settleCats = settlement === undefined ? [] : codec.attributes[settlement]!.categories;
  const cityIdx = settleCats.findIndex((c) => c.id === 'city');
  const suburbIdx = settleCats.findIndex((c) => c.id === 'suburb');
  const leaving = settleCats.map((c) => econ.mobility.leavingFarms[c.id] ?? 0);

  // --- Class: shares of each class moving, and where they go ---------------------
  const current = peopleByClass(model, pops);
  const targets = ctx.output ? classTargets(model, pops, ctx.output, ctx.years) : null;
  const outShare = classCats.map(() => 0);
  const destinations: number[][] = classCats.map(() => classCats.map(() => 0));
  if (targets) {
    const deficit = classCats.map((_, ci) => Math.max(0, targets[ci]! - current[ci]!));
    classCats.forEach((from, ci) => {
      const surplus = current[ci]! - targets[ci]!;
      if (!working[ci] || surplus <= 0 || current[ci]! <= 0) return;
      const weights = classCats.map((to, cj) => (econ.mobility.paths[from.id]?.[to.id] ?? 0) * deficit[cj]!);
      const total = weights.reduce((s, x) => s + x, 0);
      if (total <= 0) return;
      outShare[ci] = Math.min(0.5, (econ.mobility.rate * surplus) / current[ci]!);
      destinations[ci] = weights.map((w) => w / total);
    });
  }

  // --- Suburbs: yearly share of city households moving out ------------------------
  const suburbRate =
    cityIdx >= 0 && suburbIdx >= 0
      ? econ.suburbanisation.rate * Math.pow(Math.max(ctx.living, 1e-9) / pops.baseLiving, econ.suburbanisation.incomeElasticity)
      : 0;
  const suburbOdds = codec.attributes.map((attr) =>
    Float64Array.from(attr.categories.map((c) => econ.suburbanisation.odds[attr.id]?.[c.id] ?? 1)),
  );

  // --- Migration: destination weights by barrier profile ------------------------------
  const regionCats = region === undefined ? [] : codec.attributes[region]!.categories;
  const regionPeople = new Array<number>(regionCats.length).fill(0);
  if (region !== undefined) for (let i = 0; i < pops.keys.length; i++) regionPeople[codec.get(pops.keys[i]!, region)]! += pops.size[i]!;
  const totalPeople = regionPeople.reduce((s, x) => s + x, 0);
  const barrierAttrs = Object.keys(econ.migration.barriers).map((id) => codec.index[id]!);
  // Each region's farm-household share, for the surplus-labour push.
  const regionFarm = new Array<number>(regionCats.length).fill(0);
  if (region !== undefined)
    for (let i = 0; i < pops.keys.length; i++)
      if (classCats[codec.get(pops.keys[i]!, cls)]!.farm) regionFarm[codec.get(pops.keys[i]!, region)]! += pops.size[i]!;
  const regionIncome = regionCats.map(
    (c, r) =>
      (econ.regionIncome[c.group ?? ''] ?? 0) +
      (econ.migration.amenity[c.id] ?? 0) -
      econ.migration.farmSurplusPenalty * (regionPeople[r]! > 0 ? regionFarm[r]! / regionPeople[r]! : 0),
  );
  const sizeExponent = econ.migration.sizeExponent;
  const ageRate = codec.attributes[age]!.categories.map((c) => econ.migration.rate[c.id] ?? 0);
  const beta = econ.migration.sensitivity;
  const profileCache = new Map<string, { utility: number[]; weight: number[] }>();
  const profileFor = (key: number) => {
    const id = barrierAttrs.map((a) => codec.get(key, a)).join(',');
    let p = profileCache.get(id);
    if (!p) {
      const utility = regionCats.map((rc, r) => {
        let u = regionIncome[r]!;
        for (const a of barrierAttrs) {
          const attr = codec.attributes[a]!;
          u += econ.migration.barriers[attr.id]?.[attr.categories[codec.get(key, a)]!.id]?.[rc.id] ?? 0;
        }
        return u;
      });
      const weight = utility.map((u, r) => Math.pow(regionPeople[r]! / totalPeople, sizeExponent) * Math.exp(beta * u));
      p = { utility, weight };
      profileCache.set(id, p);
    }
    return p;
  };

  for (let i = 0; i < pops.keys.length; i++) {
    const key = pops.keys[i]!;
    let size = pops.size[i]!;
    const c = codec.get(key, cls);
    const a = codec.get(key, age);
    const mobility = a === oldest ? econ.mobility.oldAgeMobility : 1;

    // Class change.
    const out = size * outShare[c]! * mobility;
    if (out > 0) {
      const farm = classCats[c]!.farm;
      destinations[c]!.forEach((share, cj) => {
        if (share <= 0) return;
        const toKey = codec.with(key, cls, cj);
        let moved = 0;
        if (farm && !classCats[cj]!.farm && settlement !== undefined) {
          leaving.forEach((ls, si) => (moved += move(codec.with(toKey, settlement, si), out * share * ls)));
          result.leftFarming += moved;
        } else moved = move(toKey, out * share);
        result.changedClass += moved;
        size -= moved;
      });
    }

    // Retirement.
    if (a === oldest && working[c] && retiredClass >= 0) {
      const retiring = move(codec.with(key, cls, retiredClass), size * econ.retirement.rate);
      result.retired += retiring;
      size -= retiring;
    }

    // Suburbs.
    if (suburbRate > 0 && settlement !== undefined && codec.get(key, settlement) === cityIdx) {
      let odds = 1;
      for (let k = 0; k < suburbOdds.length; k++) odds *= suburbOdds[k]![codec.get(key, k)]!;
      const moving = move(codec.with(key, settlement, suburbIdx), size * Math.min(0.2, suburbRate * odds));
      result.movedToSuburbs += moving;
      size -= moving;
    }

    // Migration between regions.
    if (region !== undefined && !classCats[c]!.farm && ageRate[a]! > 0) {
      const home = codec.get(key, region);
      const p = profileFor(key);
      const homeWeight = Math.exp(beta * p.utility[home]!);
      let odds = 0;
      for (let r = 0; r < regionCats.length; r++) if (r !== home) odds += p.weight[r]! / homeWeight;
      const movers = (size * ageRate[a]! * odds) / (1 + odds);
      if (movers > 0) {
        let moved = 0;
        for (let r = 0; r < regionCats.length; r++) {
          if (r !== home) moved += move(codec.with(key, region, r), movers * (p.weight[r]! / homeWeight / odds));
        }
        result.migrated += moved;
        size -= moved;
      }
    }
    put(key, size);
  }

  const keys: number[] = [];
  const size: number[] = [];
  for (let k = lo; k <= hi; k++) {
    const v = table[k]!;
    if (v === 0) continue;
    table[k] = 0;
    if (v < MIN_POP) continue;
    keys.push(k);
    size.push(roundSize(v));
  }
  pops.keys = keys;
  pops.size = size;
  result.immigrants = immigrate(model, pops);
  return result;
}

/**
 * Immigration: arrivals are split into groups by the attributes the data gives
 * shares for, then spread over the existing pops of each group in proportion
 * to their size times the settlement odds. No new combinations are created.
 */
function immigrate(model: PopModelData, pops: PopsState): number {
  const imm = model.economy?.immigration;
  if (!imm || imm.rate <= 0) return 0;
  const codec = codecFor(model);
  const dims = Object.keys(imm.shares).map((id) => codec.index[id]!);
  const groupOf = (key: number) => dims.reduce((g, a) => g * codec.sizes[a]! + codec.get(key, a), 0);
  const groupShare = (key: number) =>
    dims.reduce((s, a) => {
      const attr = codec.attributes[a]!;
      return s * (imm.shares[attr.id]?.[attr.categories[codec.get(key, a)]!.id] ?? 0);
    }, 1);
  const odds = codec.attributes.map((attr) => Float64Array.from(attr.categories.map((c) => imm.odds[attr.id]?.[c.id] ?? 1)));
  const weight = pops.keys.map((key) => odds.reduce((w, t, a) => w * t[codec.get(key, a)]!, 1));
  let people = 0;
  const groupWeight = new Map<number, number>();
  pops.keys.forEach((key, i) => {
    people += pops.size[i]!;
    const g = groupOf(key);
    groupWeight.set(g, (groupWeight.get(g) ?? 0) + pops.size[i]! * weight[i]!);
  });
  const arrivals = people * imm.rate;
  let added = 0;
  pops.keys.forEach((key, i) => {
    const gw = groupWeight.get(groupOf(key))!;
    if (gw <= 0) return;
    const extra = (arrivals * groupShare(key) * pops.size[i]! * weight[i]!) / gw;
    pops.size[i] = roundSize(pops.size[i]! + extra);
    added += extra;
  });
  return added;
}
