/**
 * Save files.
 *
 * A save is the whole GameState as JSON, wrapped with a format marker and a
 * schema version. When the state's shape changes in a later version, bump
 * SCHEMA_VERSION and add a migration below so old saves keep loading.
 */

import type { Content } from './content';
import { createEconomy } from './economy/calibrate';
import { normalCapacities } from './economy/industry';
import { SCHEMA_VERSION, type GameState, type NationState } from './schema';
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

type Migration = (state: Record<string, unknown>, content: Content) => Record<string, unknown>;

/** Adds any stats the nation's data file has that an older save lacks. */
function addMissingStats(nation: NationState, content: Content) {
  const data = content.nations[nation.id];
  if (!data) return;
  for (const [id, entry] of Object.entries(data.stats)) {
    if (!(id in nation.stats)) {
      nation.stats[id] = entry.value;
      nation.statProvenance[id] = entry.provenance;
    }
  }
}

/**
 * v2 → v3: gives an existing economy its industries. The 1949 industry
 * structure is scaled up to the economy's current size; total factor
 * productivity is then set so that potential output is unchanged.
 */
function addIndustry(e: Record<string, any>, nationId: string, turn: number, content: Content): void {
  const data = content.nations[nationId];
  if (!data?.economy) return;
  const fresh = createEconomy(data, content.economy);
  const ind = fresh.industry;
  const p = fresh.params;
  const growth = e.potential / e.calib.potential0;

  ind.capital = ind.capital.map((k) => k * growth);
  ind.labourIndex = Math.pow(1 + p.labour_force_growth, Math.max(0, turn - 1) / 4);
  ind.output = ind.output.map((x) => x * growth);
  ind.normalCapacity = normalCapacities(ind, e.potential);
  ind.utilisationSmoothed = ind.output.map((x, j) => x / ind.normalCapacity[j]!);
  const baseImportShare = fresh.imports / fresh.gdpReal;
  if (typeof e.importPropensity === 'number') ind.importIndex = e.importPropensity / baseImportShare;

  e.params = p;
  e.industry = ind;
  e.productivity =
    e.potential /
    (Math.pow(growth, p.capital_share) *
      Math.pow(ind.labourIndex, 1 - p.capital_share) *
      Math.pow(e.publicCapital / e.calib.publicCapital0, p.public_capital_elasticity));
  delete e.importPropensity;
}

/** Upgrades a save from one schema version to the next, keyed by the version it upgrades FROM. */
const MIGRATIONS: Record<number, Migration> = {
  /**
   * v1 (Phase 1) → v2 (Phase 2A): nations gain a simulated economy and three
   * new stats. Phase 1 games had no policy choices, so the economy is started
   * from its 1949 calibration whatever the save's date.
   */
  1: (state, content) => {
    const nations = state.nations as Record<string, NationState>;
    for (const nation of Object.values(nations)) {
      const data = content.nations[nation.id];
      if (!data) continue;
      addMissingStats(nation, content);
      if (data.economy && !nation.economy) nation.economy = createEconomy(data, content.economy);
    }
    return state;
  },

  /** v2 (Phase 2A) → v3 (Phase 2B): economies gain seven industries and a private capital stock. */
  2: (state, content) => {
    const nations = state.nations as Record<string, NationState>;
    const turn = typeof state.turn === 'number' ? state.turn : 1;
    for (const nation of Object.values(nations)) {
      addMissingStats(nation, content);
      const e = nation.economy as unknown as Record<string, any> | undefined;
      if (e && !e.industry) addIndustry(e, nation.id, turn, content);
    }
    return state;
  },
};

export function serializeGame(state: GameState, savedAt?: string): string {
  const file: SaveFile = { format: SAVE_FORMAT, schemaVersion: SCHEMA_VERSION, state };
  if (savedAt) file.savedAt = savedAt;
  return JSON.stringify(file);
}

export function deserializeGame(text: string, content: Content): GameState {
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
    if (typeof state.nations !== 'object' || state.nations === null) {
      throw new SaveError('The save file is damaged: the game state is incomplete.');
    }
    state = migrate(state, content);
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
