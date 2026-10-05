/**
 * Policy levers as politics sees them: "budget:<line>" (budget target, $bn),
 * "tax:<line>" (rate, %) and "indexation" (1 on, 0 off).
 *
 * A change is measured in comparable units: log points for budgets (+0.1 ≈
 * +10%), tenths of the rate for taxes (+1 = 10 points), and 0.5 for switching
 * indexation on: about what indexation adds to every budget line over seven
 * or eight years of growth and inflation (e^0.5 ≈ +65%).
 */

/** The size of switching budget indexation on, in the comparable unit. */
export const INDEXATION_UNIT = 0.5;

import type { NationEconomy } from '../economy/types';

export function leverValues(economy: NationEconomy | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (!economy || economy.engine !== 'keynesian') return out;
  for (const [id, v] of Object.entries(economy.budgetTargets)) out[`budget:${id}`] = v;
  for (const [id, v] of Object.entries(economy.taxRates)) out[`tax:${id}`] = v;
  out.indexation = economy.budgetIndexed ? 1 : 0;
  return out;
}

/** The size of a change from `from` to `to` in the lever's comparable unit. */
export function leverChange(lever: string, from: number, to: number): number {
  if (lever.startsWith('budget:')) return Math.log(Math.max(to, 0.01) / Math.max(from, 0.01));
  if (lever.startsWith('tax:')) return (to - from) / 10;
  return (to - from) * INDEXATION_UNIT;
}

/** Every lever id the politics data may name, from the economy's budget and tax lines. */
export function leverIds(budgetLines: { id: string }[], taxLines: { id: string }[]): Set<string> {
  return new Set([...budgetLines.map((l) => `budget:${l.id}`), ...taxLines.map((l) => `tax:${l.id}`), 'indexation']);
}
