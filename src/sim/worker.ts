/**
 * The simulation worker.
 *
 * Turn resolution runs here, on a separate thread, so the interface never
 * freezes while the engine calculates. Phase 1 turns take milliseconds; this
 * matters once the full pop and production models arrive.
 */

import type { GameState, PlayerOrders } from './schema';
import { advanceTurn } from './turn';

export interface WorkerRequest {
  id: number;
  state: GameState;
  orders: PlayerOrders;
}

export type WorkerResponse =
  | { id: number; ok: true; state: GameState }
  | { id: number; ok: false; error: string };

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse): void;
};

scope.onmessage = (event) => {
  const { id, state, orders } = event.data;
  try {
    scope.postMessage({ id, ok: true, state: advanceTurn(state, orders) });
  } catch (err) {
    scope.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
