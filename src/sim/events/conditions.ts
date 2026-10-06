/**
 * Conditions: the small language events and meters use to ask about the
 * world ("after 1950-Q2", "the Soviet bomb has fired", "inflation above 6").
 */

import type { GameState } from '../schema';
import { compareDates, quartersBetween, type GameDate, type Quarter } from '../time';
import type { Condition, EventsState } from './types';

/** "1949-Q3" → { year: 1949, quarter: 3 }; null if malformed. */
export function parseQuarter(text: string): GameDate | null {
  const m = /^(\d{4})-Q([1-4])$/.exec(text);
  return m ? { year: Number(m[1]), quarter: Number(m[2]) as Quarter } : null;
}

export function quarterOf(text: string): GameDate {
  const d = parseQuarter(text);
  if (!d) throw new Error(`Bad quarter "${text}" (expected e.g. "1949-Q3")`);
  return d;
}

/** What a condition is asked against. */
export interface ConditionScope {
  state: Pick<GameState, 'nations' | 'playerNation' | 'startDate'>;
  events: EventsState;
  /** The quarter in question and its turn number. */
  date: GameDate;
  turn: number;
  /** The nation the event or meter belongs to (default for `stat` and `leaderParty`). */
  nation: string;
}

/** Turn number of the most recent firing of an event, or undefined. */
export function lastFired(events: EventsState, eventId: string): number | undefined {
  for (let i = events.record.length - 1; i >= 0; i--) {
    if (events.record[i]!.event === eventId) return events.record[i]!.turn;
  }
  return undefined;
}

function inRange(value: number, above?: number, below?: number): boolean {
  return (above === undefined || value > above) && (below === undefined || value < below);
}

export function holds(c: Condition, s: ConditionScope): boolean {
  if ('all' in c) return c.all.every((x) => holds(x, s));
  if ('any' in c) return c.any.some((x) => holds(x, s));
  if ('not' in c) return !holds(c.not, s);
  if ('after' in c) return compareDates(s.date, quarterOf(c.after)) >= 0;
  if ('before' in c) return compareDates(s.date, quarterOf(c.before)) <= 0;
  if ('flag' in c) return c.flag in s.events.flags;
  if ('notFlag' in c) return !(c.notFlag in s.events.flags);
  if ('fired' in c) return lastFired(s.events, c.fired) !== undefined;
  if ('notFired' in c) return lastFired(s.events, c.notFired) === undefined;
  if ('chose' in c) return s.events.record.some((r) => r.event === c.chose && r.option === c.option);
  if ('quartersSince' in c) {
    const t = lastFired(s.events, c.quartersSince);
    if (t === undefined) return false;
    return inRange(s.turn - t, c.atLeast === undefined ? undefined : c.atLeast - 1, c.atMost === undefined ? undefined : c.atMost + 1);
  }
  if ('stat' in c) {
    const value = s.state.nations[c.nation ?? s.nation]?.stats[c.stat];
    return value !== undefined && inRange(value, c.above, c.below);
  }
  if ('meter' in c) return inRange(s.events.meters[c.meter] ?? 0, c.above, c.below);
  if ('leaderParty' in c) return s.state.nations[s.nation]?.politics?.leader.party === c.leaderParty;
  if ('monetaryRegime' in c) {
    const e = s.state.nations[s.nation]?.economy;
    return e?.engine === 'keynesian' && e.monetaryRegime === c.monetaryRegime;
  }
  if ('priceControls' in c) {
    const e = s.state.nations[s.nation]?.economy;
    return e?.engine === 'keynesian' && e.priceControls === c.priceControls;
  }
  return false;
}

export const allHold = (cs: readonly Condition[] | undefined, s: ConditionScope) => (cs ?? []).every((c) => holds(c, s));

/** Quarters from the start date to `date` plus one: the turn number of that quarter. */
export function turnOf(state: Pick<GameState, 'startDate'>, date: GameDate): number {
  return quartersBetween(state.startDate, date) + 1;
}
