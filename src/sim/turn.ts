/**
 * The turn loop.
 *
 * advanceTurn() is the heart of the engine: it takes this quarter's state and
 * the player's orders and returns next quarter's state. It never changes the
 * state it was given, never reads the clock, and never uses Math.random(), so
 * the same inputs always give the same output.
 */

import { checksum } from './checksum';
import type { GameState, PlayerOrders } from './schema';
import { SYSTEMS, isDue, makeContext } from './systems';
import { compareDates, nextQuarter, quartersBetween } from './time';
import { snapshot } from './world';

export function totalTurns(state: Pick<GameState, 'startDate' | 'endDate'>): number {
  return quartersBetween(state.startDate, state.endDate) + 1;
}

export function canAdvance(state: GameState): boolean {
  return compareDates(state.date, state.endDate) < 0;
}

/** Fingerprint of the world (everything except the turn log, which stores these fingerprints). */
export function stateChecksum(state: GameState): string {
  const { log: _log, ...world } = state;
  return checksum(world);
}

export function advanceTurn(previous: GameState, _orders: PlayerOrders = {}): GameState {
  if (!canAdvance(previous)) {
    throw new Error('The simulation has reached its end date; no further turns can be played.');
  }

  const next = structuredClone(previous);
  const resolving = previous.date;
  const systemsRun: string[] = [];

  for (const system of SYSTEMS) {
    if (!isDue(system, resolving)) continue;
    system.run(makeContext(system, next, resolving));
    systemsRun.push(system.id);
  }

  next.turn = previous.turn + 1;
  next.date = nextQuarter(previous.date);
  next.history.push(snapshot(next));
  next.log.push({ resolved: { ...resolving }, systemsRun, checksum: stateChecksum(next) });
  return next;
}
