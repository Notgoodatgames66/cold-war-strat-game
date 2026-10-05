/**
 * The politics system, every quarter after the economy: opinion catches up
 * with the economy, interest groups and approval are worked out, political
 * capital regenerates, and (from the elections step) votes are held.
 */

import { content } from '../loadContent';
import { politicsStats, stepPolitics } from '../politics/step';
import type { SimSystem } from './system';

export const politics: SimSystem = {
  id: 'politics',
  label: 'Politics',
  frequency: 'quarterly',
  run({ state }) {
    for (const nation of Object.values(state.nations)) {
      const p = nation.politics;
      if (!p || !nation.pops) continue;
      const model = content.politics[p.model];
      const popModel = content.pops[nation.pops.model];
      if (!model || !popModel) throw new Error(`${nation.id}: unknown politics or pop model`);
      stepPolitics(model, popModel, p, nation);
      for (const [id, value] of Object.entries(politicsStats(model, p))) {
        if (id in nation.stats) nation.stats[id] = value;
      }
    }
  },
};
