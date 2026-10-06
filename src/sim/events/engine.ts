/**
 * The events engine.
 *
 * At the end of each turn's resolution, the engine looks ahead to the quarter
 * about to begin:
 *
 *  1. Meters (pressure gauges) fade and drift.
 *  2. Modifiers that have run their course are dropped.
 *  3. Events queued by earlier events fall due and fire if their triggers
 *     still hold.
 *  4. Every other eligible event (inside its window, triggers met, not yet
 *     fired or off cooldown) rolls its chance on its own seeded stream, so
 *     adding an event never shifts another's dice. If more events of a tier
 *     succeed than the tier allows in one quarter, the most decisive rolls win.
 *
 * A fired event applies its immediate effects. If it has options, the
 * player's nation sees it in the next briefing and chooses; the choice takes
 * effect when that turn resolves (orders.ts), and an unanswered event takes
 * its default, the historical choice. AI nations choose at once by weight.
 */

import type { Rng } from '../rng';
import type { GameState } from '../schema';
import { nextQuarter, type GameDate } from '../time';
import { allHold, lastFired, quarterOf, type ConditionScope } from './conditions';
import { applyEffects, type EffectScope } from './effects';
import { expired } from './modifiers';
import { TIER_CAP, type EventContent, type EventData, type EventOption, type EventsState } from './types';

export function createEventsState(content: Pick<EventContent, 'meters'>): EventsState {
  return {
    enabled: true,
    flags: {},
    meters: Object.fromEntries(content.meters.map((m) => [m.id, m.start])),
    modifiers: [],
    pending: [],
    queued: [],
    record: [],
  };
}

function scope(state: GameState, events: EventsState, nation: string, date: GameDate, turn: number): ConditionScope {
  return { state, events, nation, date, turn };
}

function effectScope(state: GameState, events: EventsState, content: EventContent, nation: string, turn: number, source: string, capitalMax?: number): EffectScope {
  return { state, events, content, nation, turn, source, ...(capitalMax !== undefined ? { capitalMax } : {}) };
}

/** Whether `date` lies inside the event's window. */
export function inWindow(event: Pick<EventData, 'window'>, date: GameDate): boolean {
  const w = event.window;
  if (!w) return true;
  const after = !w.from || quarterOf(w.from).year * 4 + quarterOf(w.from).quarter <= date.year * 4 + date.quarter;
  const before = !w.to || date.year * 4 + date.quarter <= quarterOf(w.to).year * 4 + quarterOf(w.to).quarter;
  return after && before;
}

/** Chance of firing this quarter: base × each modifier whose conditions hold, capped at 1. */
export function eventChance(event: EventData, s: ConditionScope): number {
  let chance = event.chance.base;
  for (const m of event.chance.modifiers ?? []) if (allHold(m.if, s)) chance *= m.multiply;
  return Math.min(1, Math.max(0, chance));
}

/** Whether an event may fire in the quarter `s` describes (ignoring its chance). */
export function eligible(event: EventData, s: ConditionScope): boolean {
  if (!(event.nation in s.state.nations)) return false;
  if (s.events.pending.some((p) => p.event === event.id)) return false;
  const last = lastFired(s.events, event.id);
  if (last !== undefined && (!event.repeatable || s.turn - last < (event.cooldown ?? 1))) return false;
  return inWindow(event, s.date) && allHold(event.triggers, s);
}

/** The options a nation may take, given the world now. */
export function availableOptions(event: EventData, s: ConditionScope): EventOption[] {
  return (event.options ?? []).filter((o) => allHold(o.requires, s));
}

/** The option taken when nobody chooses: the default if available, else the first available. */
export function defaultOption(options: EventOption[]): EventOption | undefined {
  return options.find((o) => o.default) ?? options[0];
}

function capitalMax(state: GameState, nation: string, content: { capitalMax?: (n: string) => number | undefined }): number | undefined {
  return content.capitalMax?.(nation) ?? (state.nations[nation]?.politics ? 100 : undefined);
}

export interface EngineContent extends EventContent {
  /** Political capital cap of a nation's politics model. */
  capitalMax?(nation: string): number | undefined;
}

/** Fires an event in quarter `turn`: records it, applies its effects, and queues or takes its choice. */
export function fireEvent(state: GameState, content: EngineContent, event: EventData, turn: number, date: GameDate, rng: (stream: string) => Rng): void {
  const events = state.events;
  const key = `${event.id}@${turn}`;
  const record = { key, event: event.id, nation: event.nation, turn };
  events.record.push(record);
  const max = capitalMax(state, event.nation, content);
  applyEffects(event.effects, effectScope(state, events, content, event.nation, turn, event.id, max));
  if (!event.options?.length) return;

  if (event.nation === state.playerNation) {
    events.pending.push({ key, event: event.id, turn });
    return;
  }
  // AI nations choose at once, by weight.
  const options = availableOptions(event, scope(state, events, event.nation, date, turn));
  if (options.length === 0) return;
  const total = options.reduce((s, o) => s + (o.aiWeight ?? 1), 0);
  let u = rng(`${event.id}:ai`).next() * total;
  let pick = options[options.length - 1]!;
  for (const o of options) {
    u -= o.aiWeight ?? 1;
    if (u < 0) {
      pick = o;
      break;
    }
  }
  Object.assign(record, { option: pick.id });
  applyEffects(pick.effects, effectScope(state, events, content, event.nation, turn, `${event.id}:${pick.id}`, max));
}

/** Meters fade towards zero and drift while their conditions hold, in the quarter being resolved. */
export function updateMeters(state: GameState, content: EventContent): void {
  const events = state.events;
  if (!events.enabled) return;
  for (const m of content.meters) {
    const s = scope(state, events, state.playerNation, state.date, state.turn);
    let level = (events.meters[m.id] ?? m.start) * (1 - m.decay);
    for (const d of m.drift ?? []) if (allHold(d.if, s)) level += d.add;
    events.meters[m.id] = Math.min(m.max, Math.max(m.min, level));
  }
}

/**
 * Looks ahead to the quarter after the one being resolved and fires its
 * events. `rng(stream)` is the events system's seeded stream factory.
 */
export function rollEvents(state: GameState, content: EngineContent, rng: (stream: string) => Rng): void {
  const events = state.events;
  if (!events.enabled) return;
  const date = nextQuarter(state.date);
  const turn = state.turn + 1;
  events.modifiers = events.modifiers.filter((m) => !expired(m, turn));

  const byId = new Map(content.events.map((e) => [e.id, e]));
  const fired = new Set<string>();

  // Consequences first: queued events fire whatever the tier caps, if their triggers still hold.
  const due = events.queued.filter((q) => q.turn <= turn);
  events.queued = events.queued.filter((q) => q.turn > turn);
  for (const q of due) {
    const event = byId.get(q.event);
    if (!event || fired.has(event.id)) continue;
    const s = scope(state, events, event.nation, date, turn);
    const last = lastFired(events, event.id);
    if (last !== undefined && !event.repeatable) continue;
    if (!(event.nation in state.nations) || !allHold(event.triggers, s)) continue;
    fireEvent(state, content, event, turn, date, rng);
    fired.add(event.id);
  }

  // Then every eligible event rolls its chance.
  const hits: { event: EventData; strength: number }[] = [];
  for (const event of content.events) {
    if (fired.has(event.id)) continue;
    const s = scope(state, events, event.nation, date, turn);
    if (!eligible(event, s)) continue;
    const chance = eventChance(event, s);
    if (chance <= 0) continue;
    const u = rng(event.id).next();
    if (u < chance) hits.push({ event, strength: u / chance });
  }
  hits.sort((a, b) => a.strength - b.strength || (a.event.id < b.event.id ? -1 : 1));
  const used: Record<string, number> = {};
  for (const { event } of hits) {
    const n = used[event.tier] ?? 0;
    if (n >= TIER_CAP[event.tier]) continue;
    used[event.tier] = n + 1;
    fireEvent(state, content, event, turn, date, rng);
  }
}

/**
 * The player's answers to pending events, applied when the turn resolves.
 * `choices` maps an event key ("korean_war@7") to an option id; an event left
 * unanswered, or answered with an option that is not available, takes its default.
 */
export function resolveChoices(state: GameState, content: EngineContent, choices: Record<string, string> = {}): void {
  const events = state.events;
  if (!events || events.pending.length === 0) return;
  const pending = events.pending;
  events.pending = [];
  for (const p of pending) {
    const event = content.events.find((e) => e.id === p.event);
    const record = events.record.find((r) => r.key === p.key);
    if (!event || !record) continue;
    const options = availableOptions(event, scope(state, events, event.nation, state.date, state.turn));
    const asked = options.find((o) => o.id === choices[p.key]);
    const pick = asked ?? defaultOption(options);
    if (!pick) continue;
    record.option = pick.id;
    if (!asked) record.defaulted = true;
    applyEffects(pick.effects, effectScope(state, events, content, event.nation, state.turn, `${event.id}:${pick.id}`, capitalMax(state, event.nation, content)));
  }
}
