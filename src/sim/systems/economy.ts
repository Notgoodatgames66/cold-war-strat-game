/**
 * The economy system: runs the macroeconomic model every quarter for every
 * nation that has one, then writes its headline figures into the nation's
 * stats (the numbers the dossiers and charts show).
 */

import { stepEconomy } from '../economy/step';
import type { SimSystem } from './system';

export const economy: SimSystem = {
  id: 'economy',
  label: 'Economy',
  frequency: 'quarterly',
  run({ state }) {
    for (const nation of Object.values(state.nations)) {
      if (!nation.economy) continue;
      const population = nation.stats.population ?? 1;
      const headline = stepEconomy(nation.economy, population);
      for (const [id, value] of Object.entries(headline)) {
        if (id in nation.stats) nation.stats[id] = value;
      }
    }
  },
};
