/**
 * Save files.
 *
 * A save is the whole GameState as JSON, wrapped with a format marker and a
 * schema version. When the state's shape changes in a later version, bump
 * SCHEMA_VERSION and add a migration below so old saves keep loading.
 */

import { SCHEMA_VERSION, type GameState } from './schema';
import { isValidDate } from './time';

export const SAVE_FORMAT = 'cold-war-strat-save';

export interface SaveFile {
  format: typeof SAVE_FORMAT;
  schemaVersion: number;
  /** Set by the interface when saving; not part of the simulation. */
  savedAt?: string;
  state: GameState;
}

export class SaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveError';
  }
}

/** Upgrades a save from one schema version to the next, keyed by the version it upgrades FROM. */
const MIGRATIONS: Record<number, (state: Record<string, unknown>) => Record<string, unknown>> = {
  // 1: (state) => ({ ...state, newField: defaultValue }),
};

export function serializeGame(state: GameState, savedAt?: string): string {
  const file: SaveFile = { format: SAVE_FORMAT, schemaVersion: SCHEMA_VERSION, state };
  if (savedAt) file.savedAt = savedAt;
  return JSON.stringify(file);
}

export function deserializeGame(text: string): GameState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new SaveError('This file is not valid JSON, so it cannot be a save file.');
  }
  if (typeof parsed !== 'object' || parsed === null || (parsed as SaveFile).format !== SAVE_FORMAT) {
    throw new SaveError('This file is not a Cold War Grand Strategy save.');
  }

  const file = parsed as { schemaVersion?: unknown; state?: unknown };
  let version = file.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version)) {
    throw new SaveError('The save file has no schema version.');
  }
  if (version > SCHEMA_VERSION) {
    throw new SaveError(`This save comes from a newer version of the game (schema ${version}). Update the game to load it.`);
  }

  if (typeof file.state !== 'object' || file.state === null) {
    throw new SaveError('The save file is damaged: it contains no game state.');
  }

  let state = file.state as Record<string, unknown>;
  while (version < SCHEMA_VERSION) {
    const migrate = MIGRATIONS[version];
    if (!migrate) throw new SaveError(`No upgrade path from save schema ${version}.`);
    state = migrate(state);
    version += 1;
  }
  state.schemaVersion = SCHEMA_VERSION;

  if (
    typeof state.seed !== 'string' ||
    typeof state.turn !== 'number' ||
    !isValidDate(state.date) ||
    !isValidDate(state.startDate) ||
    !isValidDate(state.endDate) ||
    typeof state.nations !== 'object' ||
    state.nations === null ||
    !Array.isArray(state.history) ||
    !Array.isArray(state.log)
  ) {
    throw new SaveError('The save file is damaged: the game state is incomplete.');
  }
  return state as unknown as GameState;
}
