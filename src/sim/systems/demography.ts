/**
 * Demography (placeholder).
 *
 * Phase 1 grows each nation's population once a year at its historical rate.
 * Phase 3 replaces this with the cohort-component model and pops described in
 * the GDD (age bands, fertility, mortality, migration between states).
 */

import type { SimSystem } from './system';

export const demography: SimSystem = {
  id: 'demography',
  label: 'Demography',
  frequency: 'yearly',
  run({ state }) {
    for (const nation of Object.values(state.nations)) {
      const population = nation.stats.population;
      const growth = nation.params.population_growth_annual;
      if (population === undefined || growth === undefined) continue;
      nation.stats.population = Math.round(population * (1 + growth));
    }
  },
};
