/**
 * Demography placeholder for nations without pops.
 *
 * Grows the population once a year at its historical rate. Nations with a pop
 * model (data/pops/) get the full cohort-component model instead: see
 * systems/population.ts.
 */

import type { SimSystem } from './system';

export const demography: SimSystem = {
  id: 'demography',
  label: 'Demography',
  frequency: 'yearly',
  run({ state }) {
    for (const nation of Object.values(state.nations)) {
      if (nation.pops) continue;
      const population = nation.stats.population;
      const growth = nation.params.population_growth_annual;
      if (population === undefined || growth === undefined) continue;
      nation.stats.population = Math.round(population * (1 + growth));
    }
  },
};
