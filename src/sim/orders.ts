/**
 * Applying the player's orders at the start of turn resolution.
 *
 * Orders are clamped to each lever's allowed range, so a bad or tampered
 * order can never push the model outside the space it was designed for.
 *
 * Where the nation has a legislature, every change is a bill: it goes to the
 * vote with the political capital the player spends on it, and takes effect
 * only if it passes (politics/bills.ts). The roll uses the 'orders:congress'
 * stream, bill by bill in lever order, so the odds the player saw are the
 * odds that were rolled.
 */

import { TAX_IDS, type NationEconomy, type TaxId } from './economy/types';
import { content } from './loadContent';
import { billPreview, capitalAfterBills, rollBill, type BillPreview } from './politics/bills';
import { leverValues } from './politics/levers';
import { createRng } from './rng';
import type { GameState, PlayerOrders } from './schema';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** The lever values the orders ask for, clamped, keeping only real changes. */
export function proposedLevers(economy: NationEconomy | undefined, orders: PlayerOrders): Record<string, number> {
  const out: Record<string, number> = {};
  if (economy?.engine !== 'keynesian') return out;

  if (typeof orders.budgetIndexed === 'boolean' && orders.budgetIndexed !== economy.budgetIndexed) {
    out.indexation = orders.budgetIndexed ? 1 : 0;
  }
  for (const [id, value] of Object.entries(orders.budget ?? {})) {
    const line = economy.budgetLines.find((l) => l.id === id);
    if (!line || !Number.isFinite(value)) continue;
    const to = clamp(value, line.min, line.max);
    if (Math.abs(to - (economy.budgetTargets[id] ?? 0)) > 1e-9) out[`budget:${id}`] = to;
  }
  for (const [id, value] of Object.entries(orders.taxes ?? {})) {
    if (!TAX_IDS.includes(id as TaxId) || !Number.isFinite(value)) continue;
    const line = economy.taxLines.find((l) => l.id === id);
    if (!line) continue;
    const to = clamp(value, line.min, line.max);
    if (Math.abs(to - economy.taxRates[id as TaxId]) > 1e-9) out[`tax:${id}`] = to;
  }
  return out;
}

function setLever(economy: NationEconomy, lever: string, value: number): void {
  if (economy.engine !== 'keynesian') return;
  if (lever === 'indexation') economy.budgetIndexed = value >= 0.5;
  else if (lever.startsWith('budget:')) economy.budgetTargets[lever.slice(7)] = value;
  else if (lever.startsWith('tax:')) economy.taxRates[lever.slice(4) as TaxId] = value;
}

/**
 * The bills the orders would send to the player's legislature, with their
 * odds, in the order they are voted on. Capital is granted in that order
 * until it runs out. Null when the player's nation has no legislature.
 */
export function proposedBills(state: GameState, orders: PlayerOrders): BillPreview[] | null {
  const nation = state.nations[state.playerNation];
  const politics = nation?.politics;
  const model = politics ? content.politics[politics.model] : undefined;
  if (!nation || !politics || !model) return null;
  const levers = leverValues(nation.economy);
  const proposals = proposedLevers(nation.economy, orders);
  let available = Math.floor(politics.capital);
  return Object.keys(proposals)
    .sort()
    .map((lever) => {
      const asked = orders.capital?.[lever];
      const capital = clamp(Number.isFinite(asked) ? Math.floor(asked!) : 0, 0, available);
      available -= capital;
      return billPreview(model, politics, lever, levers[lever] ?? 0, proposals[lever]!, capital);
    });
}

export function applyOrders(state: GameState, orders: PlayerOrders): void {
  const nation = state.nations[state.playerNation];
  const economy = nation?.economy;
  // The Treasury desk exists only for Keynesian economies; a planned economy runs on its Plan.
  if (!nation || economy?.engine !== 'keynesian') return;

  const politics = nation.politics;
  const model = politics ? content.politics[politics.model] : undefined;
  const bills = proposedBills(state, orders);
  if (!politics || !model || !bills) {
    for (const [lever, value] of Object.entries(proposedLevers(economy, orders))) setLever(economy, lever, value);
    return;
  }

  const rng = createRng(state.seed, state.turn, 'orders:congress');
  const results = bills.map((bill) => rollBill(model, bill, rng));
  for (const r of results) if (r.passed) setLever(economy, r.lever, r.to);
  politics.capital = capitalAfterBills(model, politics.capital, results);
  politics.lastBills = results;
}
