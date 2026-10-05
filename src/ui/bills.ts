/**
 * Words for bills: lever names, amounts and vote counts. Formatting only; the
 * odds and results come from the engine (sim/politics/bills.ts).
 */

import { content } from '../sim/loadContent';
import type { BillResult, PoliticsModelData } from '../sim/politics/types';

export function leverName(lever: string): string {
  const [kind, id] = lever.split(':');
  if (kind === 'budget') return content.economy.budgetLines.find((l) => l.id === id)?.label ?? id!;
  if (kind === 'tax') return content.economy.taxLines.find((l) => l.id === id)?.label ?? id!;
  return 'Budget indexation';
}

export function leverAmount(lever: string, v: number): string {
  if (lever.startsWith('budget:')) return `$${v.toFixed(1)} bn`;
  if (lever.startsWith('tax:')) return `${v.toFixed(1)}%`;
  return v >= 0.5 ? 'on' : 'off';
}

/** "Welfare and veterans $8.0 bn → $9.6 bn". */
export function billHeadline(b: Pick<BillResult, 'lever' | 'from' | 'to'>): string {
  return `${leverName(b.lever)} ${leverAmount(b.lever, b.from)} → ${leverAmount(b.lever, b.to)}`;
}

/** "House 251–184 · Senate 52–44". */
export function tallyText(model: PoliticsModelData, r: BillResult): string {
  return model.legislature.chambers
    .map((ch) => {
      const t = r.tally[ch.id];
      return t ? `${ch.label} ${t.yes}–${t.no}` : null;
    })
    .filter(Boolean)
    .join(' · ');
}

/** One sentence for the wire: what Congress did with last quarter's bills. */
export function billsStatus(bills: BillResult[]): string {
  if (bills.length === 0) return '';
  const passed = bills.filter((b) => b.passed).length;
  const failed = bills.filter((b) => !b.passed).map((b) => leverName(b.lever).toLowerCase());
  const head = bills.length === 1 ? (passed ? 'Congress passed your bill.' : `Congress voted down your ${failed[0]} bill.`) : `Congress passed ${passed} of ${bills.length} bills.`;
  return bills.length > 1 && failed.length > 0 ? `${head} Voted down: ${failed.join(', ')}.` : head;
}

export const oddsText = (odds: number): string => (odds > 0.995 ? '>99%' : odds < 0.005 ? '<1%' : `${Math.round(odds * 100)}%`);

/** Party colours: blues for the first party, reds for the second; factions shade by order. */
const PARTY_SHADES = [
  ['#5e94bd', '#9cc4e2', '#3d6c99'],
  ['#c0574b', '#e39a8c', '#8f3a31'],
  ['#c9a35c', '#e2c58f', '#8f7744'],
];

export function factionColours(model: PoliticsModelData): Record<string, string> {
  const out: Record<string, string> = {};
  model.legislature.parties.forEach((party, pi) => {
    model.legislature.factions
      .filter((f) => f.party === party.id)
      .forEach((f, fi) => (out[f.id] = PARTY_SHADES[pi % PARTY_SHADES.length]![fi % 3]!));
  });
  return out;
}
