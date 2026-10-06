/**
 * The events system, every quarter after everything else: meters fade and
 * drift, then the engine looks ahead to the quarter about to begin and fires
 * its events (events/engine.ts). Events that need the player's choice wait
 * in the next briefing; the choice resolves with the next turn's orders.
 */

import { rollEvents, updateMeters } from '../events/engine';
import { eventEngineContent } from '../orders';
import type { SimSystem } from './system';

export const events: SimSystem = {
  id: 'events',
  label: 'Events',
  frequency: 'quarterly',
  run({ state, rng }) {
    const engine = eventEngineContent();
    updateMeters(state, engine);
    rollEvents(state, engine, rng);
  },
};
