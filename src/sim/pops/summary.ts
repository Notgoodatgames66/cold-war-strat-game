/**
 * Adding pops up: totals by attribute and the headline figures the nation's
 * stats show. Used by the engine (stats) and the interface (breakdowns).
 */

import type { NationState } from '../schema';
import { codecFor } from './codec';
import type { DemographyResult } from './demography';
import type { PopModelData, PopsState } from './types';

export function totalPeople(pops: Pick<PopsState, 'size'>): number {
  let t = 0;
  for (const s of pops.size) t += s;
  return t;
}

/** People in each category of one attribute, in category order. */
export function peopleBy(model: PopModelData, pops: Pick<PopsState, 'keys' | 'size'>, attributeId: string): number[] {
  const codec = codecFor(model);
  const a = codec.index[attributeId];
  if (a === undefined) throw new Error(`pop model ${model.id} has no attribute "${attributeId}"`);
  const out = new Array<number>(codec.sizes[a]!).fill(0);
  pops.keys.forEach((k, i) => (out[codec.get(k, a)]! += pops.size[i]!));
  return out;
}

/** People by two attributes: result[i][j] for category i of the first and j of the second. */
export function peopleBy2(
  model: PopModelData,
  pops: Pick<PopsState, 'keys' | 'size'>,
  first: string,
  second: string,
): number[][] {
  const codec = codecFor(model);
  const a = codec.index[first]!;
  const b = codec.index[second]!;
  const out = Array.from({ length: codec.sizes[a]! }, () => new Array<number>(codec.sizes[b]!).fill(0));
  pops.keys.forEach((k, i) => (out[codec.get(k, a)]![codec.get(k, b)]! += pops.size[i]!));
  return out;
}

/** The stats pops provide. Each is written only if the nation tracks it. */
export const POP_STATS = ['population', 'urban_share', 'farm_population', 'labour_force', 'birth_rate', 'death_rate'] as const;

export function popStats(model: PopModelData, pops: PopsState, quarter?: DemographyResult): Record<string, number> {
  const codec = codecFor(model);
  const people = totalPeople(pops);
  const stats: Record<string, number> = { population: people };

  const settlement = codec.role.settlement;
  if (settlement !== undefined) {
    const rural = codec.attributes[settlement]!.categories.findIndex((c) => c.id === 'rural');
    const by = peopleBy(model, pops, codec.attributes[settlement]!.id);
    if (rural >= 0) stats.urban_share = ((people - by[rural]!) / people) * 100;
  }
  const cls = codec.role.class;
  if (cls !== undefined) {
    const by = peopleBy(model, pops, codec.attributes[cls]!.id);
    stats.farm_population = codec.attributes[cls]!.categories.reduce((s, c, i) => s + (c.farm ? by[i]! : 0), 0);
  }
  if (model.economy && pops.labourForce > 0) stats.labour_force = pops.labourForce;
  if (quarter) {
    // Quarterly flows at an annual rate per 1,000 people.
    stats.birth_rate = ((quarter.births * 4) / people) * 1000;
    stats.death_rate = ((quarter.deaths * 4) / people) * 1000;
  } else {
    stats.birth_rate = model.demography.crudeBirthRate;
    stats.death_rate = model.demography.crudeDeathRate;
  }
  return stats;
}

/** Real household consumption per head (1949 dollars a year): the living standard pops respond to. */
export function livingStandard(nation: NationState): number {
  const e = nation.economy;
  const people = nation.stats.population;
  if (!e || !people) return 1;
  return (e.consumption * 1e9) / people;
}
