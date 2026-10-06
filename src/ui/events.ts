/**
 * Presentation helpers for events: what the player has to decide, what this
 * quarter brought, and each option's effects in plain words. Display only;
 * the rules live in src/sim/events/.
 */

import { availableOptions } from '../sim/events/engine';
import type { Effect, EventData, EventOption, EventRecord, ModifierSpec, PendingEvent } from '../sim/events/types';
import { content } from '../sim/loadContent';
import type { GameState } from '../sim/schema';

export const TIER_ORDER = { super: 0, major: 1, minor: 2, news: 3 } as const;

export const TIER_LABEL = { super: 'Crisis', major: 'Decision', minor: 'Cable', news: 'Wire' } as const;

export function eventData(id: string): EventData | undefined {
  return content.events.events.find((e) => e.id === id);
}

/** Events waiting for the player's answer, biggest first. */
export function pendingEvents(game: GameState): { pending: PendingEvent; event: EventData }[] {
  return game.events.pending
    .map((pending) => ({ pending, event: eventData(pending.event)! }))
    .filter((x) => x.event)
    .sort((a, b) => TIER_ORDER[a.event.tier] - TIER_ORDER[b.event.tier]);
}

/** What happened this quarter: every event that fired for the quarter now beginning. */
export function eventsThisQuarter(game: GameState): { record: EventRecord; event: EventData }[] {
  return game.events.record
    .filter((r) => r.turn === game.turn)
    .map((record) => ({ record, event: eventData(record.event)! }))
    .filter((x) => x.event)
    .sort((a, b) => TIER_ORDER[a.event.tier] - TIER_ORDER[b.event.tier]);
}

/** The options the player may take now. */
export function optionsFor(game: GameState, event: EventData): EventOption[] {
  return availableOptions(event, { state: game, events: game.events, nation: event.nation, date: game.date, turn: game.turn });
}

const fmt = (n: number, d = 1) => new Intl.NumberFormat('en-GB', { maximumFractionDigits: d, minimumFractionDigits: d }).format(Math.abs(n));
const signed = (n: number, d = 1) => `${n < 0 ? '−' : '+'}${fmt(n, d)}`;

function timing(m: ModifierSpec): string {
  const q = m.duration ?? 0;
  const quarters = `${q} quarter${q === 1 ? '' : 's'}`;
  if (m.curve === 'decay') return `, fading over ${quarters}`;
  if (m.curve === 'ramp') return `, building over ${quarters}`;
  return m.duration ? ` for ${quarters}` : '';
}

/** Log-odds as approximate points of approval at the current level. */
function points(logOdds: number, level: number): string {
  const p = Math.min(0.97, Math.max(0.03, level));
  return `${signed(logOdds * p * (1 - p) * 100, 0)} pts`;
}

function leverLabel(lever: string): string {
  if (lever === 'indexation') return 'budget indexation';
  const [kind, id] = lever.split(':');
  if (kind === 'budget') return `the ${content.economy.budgetLines.find((l) => l.id === id)?.label.toLowerCase() ?? id} budget`;
  if (kind === 'tax') return `${content.economy.taxLines.find((l) => l.id === id)?.label.toLowerCase() ?? id}`;
  return lever;
}

function describeModifier(m: ModifierSpec, game: GameState, nation: string): string | null {
  const n = game.nations[nation];
  const t = m.target;
  if (t === 'approval') return `Approval ${points(m.value, n?.politics?.approval ?? 0.5)}${timing(m)}`;
  if (t.startsWith('group:')) {
    const id = t.slice(6);
    const model = Object.values(content.politics).find((p) => p.nation === nation);
    const label = model?.interestGroups.find((g) => g.id === id)?.label ?? id;
    const level = n?.politics?.groups.find((g) => g.id === id)?.approval ?? 0.5;
    return `${label} ${points(m.value, level)}${timing(m)}`;
  }
  if (t.startsWith('bill:')) return `Bills on ${leverLabel(t.slice(5))} ${m.value > 0 ? 'easier' : 'harder'} to pass${timing(m)}`;
  if (t === 'consumption') return `Household spending ${signed(m.value * 100, 0)}%${timing(m)}`;
  if (t === 'investment') return `Business investment ${signed(m.value * 100, 0)}%${timing(m)}`;
  if (t === 'exports') return `Export demand ${signed(m.value * 100, 0)}%${timing(m)}`;
  if (t === 'inflation') return `Inflation ${signed(m.value)} pts${timing(m)}`;
  return null;
}

/** One effect in a line, or null for bookkeeping the player need not see (flags). */
export function describeEffect(effect: Effect, game: GameState, nation: string): string | null {
  if ('flag' in effect || 'clearFlag' in effect) return null;
  if ('meter' in effect) {
    const label = content.events.meters.find((m) => m.id === effect.meter)?.label ?? effect.meter;
    return `${label} ${signed(effect.add, 0)}`;
  }
  if ('modifier' in effect) return describeModifier(effect.modifier, game, nation);
  if ('capital' in effect) return `Political capital ${signed(effect.capital, 0)}`;
  if ('budget' in effect) {
    const e = game.nations[nation]?.economy;
    const now = e?.engine === 'keynesian' ? (e.budgetTargets[effect.budget] ?? 0) : 0;
    const to = now * (effect.multiply ?? 1) + (effect.add ?? 0);
    const label = content.economy.budgetLines.find((l) => l.id === effect.budget)?.label ?? effect.budget;
    return `${label} budget to $${fmt(to)} bn at once (now $${fmt(now)} bn), without a vote`;
  }
  if ('stat' in effect) {
    const def = content.stats.find((s) => s.id === effect.stat);
    const who = effect.nation && effect.nation !== nation ? `${game.nations[effect.nation]?.shortName ?? effect.nation} ` : '';
    const label = `${who}${def?.label.toLowerCase() ?? effect.stat}`;
    const text = label.charAt(0).toUpperCase() + label.slice(1);
    if (effect.set !== undefined) return `${text} set to ${effect.set.toLocaleString('en-GB')}`;
    const add = effect.add ?? 0;
    return `${text} ${add < 0 ? '−' : '+'}${Math.abs(add).toLocaleString('en-GB')}`;
  }
  if ('monetaryRegime' in effect) {
    return effect.monetaryRegime === 'independent'
      ? 'Ends the Treasury peg: the Fed may raise rates against inflation'
      : 'Restores the Treasury peg on interest rates';
  }
  if ('priceControls' in effect) {
    return effect.priceControls ? 'Freezes prices and wages: most inflation is held back while controls last' : 'Ends price controls: held-back price rises come out';
  }
  if ('queue' in effect) return 'Sets further events in motion';
  return null;
}

export function describeEffects(effects: readonly Effect[] | undefined, game: GameState, nation: string): string[] {
  const lines = (effects ?? []).map((e) => describeEffect(e, game, nation)).filter((x): x is string => x !== null);
  return [...new Set(lines)];
}
