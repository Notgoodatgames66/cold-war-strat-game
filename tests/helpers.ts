import { content } from '../src/sim/loadContent';
import type { GameState } from '../src/sim/schema';
import { createGame } from '../src/sim/world';

/**
 * A new game with the player's legislature removed, so orders take effect
 * without a vote, and with events switched off, so nothing happens that the
 * test did not order. For testing the economic models on their own; Congress
 * and its odds are tested in bills.test.ts, events in events.test.ts.
 */
export function sandboxGame(scenarioId: string, seed?: string): GameState {
  const game = createGame(content, scenarioId, seed);
  delete game.nations[game.playerNation]!.politics;
  game.events.enabled = false;
  return game;
}
