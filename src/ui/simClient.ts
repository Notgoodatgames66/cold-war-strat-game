/**
 * Talks to the simulation worker. Falls back to resolving on the main thread
 * if the browser cannot start a worker.
 */

import type { GameState, PlayerOrders } from '../sim/schema';
import { advanceTurn } from '../sim/turn';
import type { WorkerRequest, WorkerResponse } from '../sim/worker';

type Pending = { resolve: (state: GameState) => void; reject: (error: Error) => void };

let worker: Worker | null = null;
let workerFailed = false;
let nextId = 1;
const pending = new Map<number, Pending>();

function failAll(message: string) {
  for (const { reject } of pending.values()) reject(new Error(message));
  pending.clear();
}

function getWorker(): Worker | null {
  if (workerFailed || typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('../sim/worker.ts', import.meta.url), { type: 'module' });
  } catch {
    workerFailed = true;
    return null;
  }
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const response = event.data;
    const entry = pending.get(response.id);
    if (!entry) return;
    pending.delete(response.id);
    if (response.ok) entry.resolve(response.state);
    else entry.reject(new Error(response.error));
  };
  worker.onerror = (event) => {
    workerFailed = true;
    worker?.terminate();
    worker = null;
    failAll(`The simulation worker crashed: ${event.message || 'unknown error'}`);
  };
  return worker;
}

export function resolveTurn(state: GameState, orders: PlayerOrders = {}): Promise<GameState> {
  const w = getWorker();
  if (!w) return Promise.resolve().then(() => advanceTurn(state, orders));
  const id = nextId++;
  return new Promise<GameState>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    const request: WorkerRequest = { id, state, orders };
    w.postMessage(request);
  });
}
