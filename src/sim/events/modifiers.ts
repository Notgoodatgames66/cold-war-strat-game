/**
 * Modifiers (GDD: "every buff and debuff has a source, target, value,
 * duration and curve") and meters, the pressure gauges events feed.
 *
 * Systems ask for the total on a target for a nation in the quarter being
 * resolved: every live modifier's current value plus each meter's level ×
 * its per-point effect.
 */

import type { GameState } from '../schema';
import type { EventContent, EventsState, Modifier } from './types';

/** The value of a modifier `elapsed` quarters after it began (0 = its first quarter). */
export function modifierValue(m: Pick<Modifier, 'value' | 'duration' | 'curve'>, elapsed: number): number {
  if (elapsed < 0) return 0;
  const d = m.duration;
  switch (m.curve) {
    case 'flat':
      return d === undefined || elapsed < d ? m.value : 0;
    case 'decay':
      return d && elapsed < d ? m.value * (1 - elapsed / d) : 0;
    case 'ramp':
      return d ? m.value * Math.min(1, (elapsed + 1) / d) : m.value;
  }
}

/** Whether a modifier has run its course (ramps never do). */
export function expired(m: Modifier, turn: number): boolean {
  if (m.duration === undefined || m.curve === 'ramp') return false;
  return turn - m.start >= m.duration;
}

/** One line of a breakdown: where part of a total comes from. */
export interface ModifierPart {
  source: string;
  value: number;
}

/** Each live contribution to a target for a nation at a turn: modifiers first, then meters. */
export function modifierParts(
  events: EventsState | undefined,
  content: Pick<EventContent, 'meters'>,
  nation: string,
  target: string,
  turn: number,
): ModifierPart[] {
  if (!events) return [];
  const parts: ModifierPart[] = [];
  for (const m of events.modifiers) {
    if (m.nation !== nation || m.target !== target) continue;
    const v = modifierValue(m, turn - m.start);
    if (v !== 0) parts.push({ source: m.source, value: v });
  }
  for (const meter of content.meters) {
    const level = events.meters[meter.id] ?? 0;
    for (const e of meter.effects ?? []) {
      if (e.nation === nation && e.target === target && level !== 0) parts.push({ source: `meter:${meter.id}`, value: level * e.perPoint });
    }
  }
  return parts;
}

export function modifierTotal(
  events: EventsState | undefined,
  content: Pick<EventContent, 'meters'>,
  nation: string,
  target: string,
  turn: number,
): number {
  return modifierParts(events, content, nation, target, turn).reduce((s, p) => s + p.value, 0);
}

/** Convenience for systems: the total on a target in the quarter `state` is resolving. */
export function stateModifier(state: Pick<GameState, 'events' | 'turn'>, content: Pick<EventContent, 'meters'>, nation: string, target: string): number {
  return modifierTotal(state.events, content, nation, target, state.turn);
}
