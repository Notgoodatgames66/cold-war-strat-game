import { content } from '../src/sim/loadContent';
import type { GameState } from '../src/sim/schema';
import { createGame } from '../src/sim/world';

/**
 * A new game with the player's legislature removed, so orders take effect
 * without a vote. For testing the economic models on their own; Congress and
 * its odds are tested in bills.test.ts.
 */
export function sandboxGame(scenarioId: string, seed?: string): GameState {
  const game = createGame(content, scenarioId, seed);
  delete game.nations[game.playerNation]!.politics;
  return game;
}
