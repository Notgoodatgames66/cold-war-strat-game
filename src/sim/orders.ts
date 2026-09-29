/**
 * Applying the player's orders at the start of turn resolution.
 *
 * Orders are clamped to each lever's allowed range, so a bad or tampered
 * order can never push the model outside the space it was designed for.
 */

import { TAX_IDS, type TaxId } from './economy/types';
import type { GameState, PlayerOrders } from './schema';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function applyOrders(state: GameState, orders: PlayerOrders): void {
  const economy = state.nations[state.playerNation]?.economy;
  if (!economy) return;

  if (typeof orders.budgetIndexed === 'boolean') economy.budgetIndexed = orders.budgetIndexed;

  for (const [id, value] of Object.entries(orders.budget ?? {})) {
    const line = economy.budgetLines.find((l) => l.id === id);
    if (!line || !Number.isFinite(value)) continue;
    economy.budgetTargets[id] = clamp(value, line.min, line.max);
  }

  for (const [id, value] of Object.entries(orders.taxes ?? {})) {
    if (!TAX_IDS.includes(id as TaxId) || !Number.isFinite(value)) continue;
    const line = economy.taxLines.find((l) => l.id === id);
    if (!line) continue;
    economy.taxRates[id as TaxId] = clamp(value, line.min, line.max);
  }
}
