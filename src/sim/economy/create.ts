/**
 * Builds a nation's economy on whichever engine its model file names.
 * Switching a nation to another engine is a data change, not a code change.
 */

import type { NationData } from '../schema';
import { createEconomy, type EconomyDefs } from './calibrate';
import { createPlannedEconomy } from './planned';
import type { NationEconomy } from './types';

export function createNationEconomy(nation: NationData, defs: EconomyDefs): NationEconomy {
  if (!nation.economy) throw new Error(`${nation.id} has no economy block`);
  const model = defs.models[nation.economy.model];
  if (!model) throw new Error(`${nation.id}: unknown economy model "${nation.economy.model}"`);
  switch (model.engine) {
    case 'keynesian':
      return createEconomy(nation, defs);
    case 'planned':
      return createPlannedEconomy(nation, defs);
  }
}
