/**
 * The population system. Every quarter, for each nation with pops:
 *  1. births, deaths and ageing (pops/demography.ts);
 *  2. once a year (when Q4 resolves) class changes, retirement, suburbs and
 *     migration between regions (pops/mobility.ts);
 *  3. the labour force and the household spending mix (Engel's law) are
 *     worked out and handed to the economy (pops/economy.ts);
 *  4. the population stats are refreshed.
 *
 * It runs before the economy, using last quarter's living standard and
 * output, so the economy sees this quarter's people.
 */

import { content } from '../loadContent';
import { stepDemography } from '../pops/demography';
import { consumptionMix, labourForce, womenWork } from '../pops/economy';
import { stepMobility } from '../pops/mobility';
import { livingStandard, popStats } from '../pops/summary';
import type { SimSystem } from './system';

export const population: SimSystem = {
  id: 'population',
  label: 'Population',
  frequency: 'quarterly',
  run({ state, resolving }) {
    for (const nation of Object.values(state.nations)) {
      const pops = nation.pops;
      if (!pops) continue;
      const model = content.pops[pops.model];
      if (!model) throw new Error(`${nation.id}: unknown pop model "${pops.model}"`);
      const living = livingStandard(nation);
      const work = model.economy ? womenWork(model, pops, pops.quarters / 4) : 0;
      const quarter = stepDemography(model, pops, living, work);
      const years = pops.quarters / 4;
      if (resolving.quarter === 4) {
        stepMobility(model, pops, { living, output: nation.economy?.industry.output ?? null, years });
      }
      if (model.economy) {
        pops.previousLabourForce = pops.labourForce;
        pops.labourForce = labourForce(model, pops, years);
      }
      const mix = consumptionMix(model, pops, living);
      if (mix && pops.link && nation.economy) {
        pops.link.consumptionMix = mix;
        nation.economy.industry.bridges.consumption = mix;
      }
      for (const [id, value] of Object.entries(popStats(model, pops, quarter))) {
        if (id in nation.stats) nation.stats[id] = value;
      }
    }
  },
};
