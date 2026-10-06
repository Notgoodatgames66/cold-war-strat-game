/**
 * Applying an event's effects to the world.
 */

import type { MonetaryRegime } from '../economy/types';
import type { GameState } from '../schema';
import type { Effect, EventContent, EventsState } from './types';

export interface EffectScope {
  state: GameState;
  events: EventsState;
  content: EventContent;
  /** The nation the event belongs to. */
  nation: string;
  /** Turn of the quarter in which the effects happen (modifiers begin then). */
  turn: number;
  /** "<event>" or "<event>:<option>", recorded on modifiers. */
  source: string;
  /** Political capital cap of the nation's politics model, if any. */
  capitalMax?: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function applyEffect(effect: Effect, s: EffectScope): void {
  const ev = s.events;
  const nation = s.state.nations[s.nation];
  if ('flag' in effect) {
    ev.flags[effect.flag] ??= s.turn;
  } else if ('clearFlag' in effect) {
    delete ev.flags[effect.clearFlag];
  } else if ('meter' in effect) {
    const def = s.content.meters.find((m) => m.id === effect.meter);
    if (!def) return;
    ev.meters[def.id] = clamp((ev.meters[def.id] ?? def.start) + effect.add, def.min, def.max);
  } else if ('modifier' in effect) {
    const m = effect.modifier;
    ev.modifiers.push({
      source: s.source,
      nation: s.nation,
      target: m.target,
      value: m.value,
      start: s.turn,
      curve: m.curve ?? 'flat',
      ...(m.duration !== undefined ? { duration: m.duration } : {}),
    });
  } else if ('capital' in effect) {
    const p = nation?.politics;
    if (p) p.capital = clamp(p.capital + effect.capital, 0, s.capitalMax ?? Infinity);
  } else if ('budget' in effect) {
    const e = nation?.economy;
    if (e?.engine !== 'keynesian') return;
    const line = e.budgetLines.find((l) => l.id === effect.budget);
    if (!line) return;
    const now = e.budgetTargets[line.id] ?? 0;
    e.budgetTargets[line.id] = clamp(now * (effect.multiply ?? 1) + (effect.add ?? 0), line.min, line.max);
  } else if ('stat' in effect) {
    const target = s.state.nations[effect.nation ?? s.nation];
    if (!target || !(effect.stat in target.stats)) return;
    const now = target.stats[effect.stat]!;
    target.stats[effect.stat] = Math.max(0, effect.set ?? now + (effect.add ?? 0));
  } else if ('monetaryRegime' in effect) {
    const e = nation?.economy;
    if (e?.engine === 'keynesian') e.monetaryRegime = effect.monetaryRegime as MonetaryRegime;
  } else if ('priceControls' in effect) {
    const e = nation?.economy;
    if (e?.engine === 'keynesian') e.priceControls = effect.priceControls;
  } else if ('queue' in effect) {
    ev.queued.push({ event: effect.queue, turn: s.turn + Math.max(1, effect.delay), source: s.source });
  }
}

export function applyEffects(effects: readonly Effect[] | undefined, s: EffectScope): void {
  for (const e of effects ?? []) applyEffect(e, s);
}
