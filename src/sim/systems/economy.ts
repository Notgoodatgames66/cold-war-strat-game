/**
 * The economy system: runs each nation's economy every quarter on its own
 * engine (Keynesian or planned), then writes the headline figures into the
 * nation's stats (the numbers the dossiers and charts show).
 *
 * Nations run in scenario order, so a planned economy sees its rival's
 * figures for the same quarter when the rival comes first.
 */

import { stepPlanned } from '../economy/planned';
import { stepEconomy } from '../economy/step';
import type { GameState } from '../schema';
import type { SimSystem } from './system';

/** A nation's defence spending as a share of its GDP, from its current stats. */
export function defenceShare(state: GameState, nationId: string): number | null {
  const stats = state.nations[nationId]?.stats;
  const defence = stats?.defence_spending;
  const gdp = stats?.gdp_nominal;
  return defence !== undefined && gdp !== undefined && gdp > 0 ? defence / gdp : null;
}

/** The price level used to value a planned economy's output in current dollars. */
export function valuationPrice(state: GameState, nationId: string): number {
  const economy = state.nations[nationId]?.economy;
  return economy?.engine === 'keynesian' ? economy.priceLevel : 1;
}

export const economy: SimSystem = {
  id: 'economy',
  label: 'Economy',
  frequency: 'quarterly',
  run({ state, resolving }) {
    for (const nation of Object.values(state.nations)) {
      const e = nation.economy;
      if (!e) continue;
      const headline =
        e.engine === 'keynesian'
          ? stepEconomy(e, nation.stats.population ?? 1)
          : stepPlanned(e, {
              date: resolving,
              rivalDefenceShare: defenceShare(state, e.rival),
              valuationPrice: valuationPrice(state, e.valuation),
            });
      for (const [id, value] of Object.entries(headline)) {
        if (id in nation.stats) nation.stats[id] = value;
      }
    }
  },
};
