/**
 * The politics system, every quarter after the economy: opinion catches up
 * with the economy, interest groups and approval are worked out, political
 * capital regenerates, and in election quarters the voters have their say.
 */

import { stateModifier } from '../events/modifiers';
import { content } from '../loadContent';
import { holdElections } from '../politics/elections';
import { politicsStats, stepPolitics } from '../politics/step';
import type { SimSystem } from './system';

export const politics: SimSystem = {
  id: 'politics',
  label: 'Politics',
  frequency: 'quarterly',
  run({ state, resolving, rng }) {
    for (const nation of Object.values(state.nations)) {
      const p = nation.politics;
      if (!p || !nation.pops) continue;
      const model = content.politics[p.model];
      const popModel = content.pops[nation.pops.model];
      if (!model || !popModel) throw new Error(`${nation.id}: unknown politics or pop model`);
      const mod = (target: string) => stateModifier(state, content.events, nation.id, target);
      p.eventEffects = {
        approval: mod('approval'),
        groups: Object.fromEntries(model.interestGroups.map((g) => [g.id, mod(`group:${g.id}`)])),
      };
      stepPolitics(model, popModel, p, nation);
      holdElections(model, popModel, p, nation, resolving, rng(`elections:${nation.id}`));
      for (const [id, value] of Object.entries(politicsStats(model, p))) {
        if (id in nation.stats) nation.stats[id] = value;
      }
    }
  },
};
