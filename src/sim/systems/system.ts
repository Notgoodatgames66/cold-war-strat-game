/**
 * Systems: the parts of the simulation that run when a turn resolves.
 *
 * Each system declares how often it runs (GDD: "staggered updates"). Slow
 * processes such as ageing and migration run yearly; the economy will run
 * every quarter. A system receives the new state to update, plus its own
 * seeded random stream.
 */

import { createRng, type Rng } from '../rng';
import type { GameState } from '../schema';
import type { GameDate } from '../time';

export type Frequency = 'quarterly' | 'yearly';

export interface SystemContext {
  /** The state being built for the next quarter. Systems update it in place. */
  state: GameState;
  /** The quarter being resolved. */
  resolving: GameDate;
  /** A seeded random stream private to this system, e.g. rng('strikes'). */
  rng(stream: string): Rng;
}

export interface SimSystem {
  id: string;
  label: string;
  frequency: Frequency;
  run(ctx: SystemContext): void;
}

/** Yearly systems run when the fourth quarter resolves. */
export function isDue(system: SimSystem, resolving: GameDate): boolean {
  return system.frequency === 'quarterly' || resolving.quarter === 4;
}

export function makeContext(system: SimSystem, state: GameState, resolving: GameDate): SystemContext {
  return {
    state,
    resolving,
    rng: (stream) => createRng(state.seed, state.turn, `${system.id}:${stream}`),
  };
}
