/**
 * Save files.
 *
 * A save is the whole GameState as JSON, wrapped with a format marker and a
 * schema version. When the state's shape changes in a later version, bump
 * SCHEMA_VERSION and add a migration below so old saves keep loading.
 */

import { popModelFor, type Content } from './content';
import { createEconomy } from './economy/calibrate';
import { createNationEconomy } from './economy/create';
import { normalCapacities } from './economy/industry';
import { stepPlanned } from './economy/planned';
import { addPops } from './world';
import { SCHEMA_VERSION, type GameState, type HistoryEntry, type NationState } from './schema';
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

/**
 * v3 → v4: a nation that gains a planned economy (the USSR) is created at its
 * 1949 calibration and replayed through every quarter already played, using
 * the rival's recorded figures from the save's history. Its history is filled
 * in as if it had been running all along.
 */
function addPlannedEconomy(state: Record<string, unknown>, nation: NationState, content: Content): void {
  const data = content.nations[nation.id];
  if (!data?.economy) return;
  const e = createNationEconomy(data, content.economy);
  nation.economy = e;
  if (e.engine !== 'planned') return;

  const history = state.history as HistoryEntry[];
  const first = history[0];
  if (first) {
    const stats = (first.stats[nation.id] ??= {});
    for (const [id, entry] of Object.entries(data.stats)) if (!(id in stats)) stats[id] = entry.value;
  }
  for (let k = 1; k < history.length; k++) {
    const entry = history[k]!;
    const rival = entry.stats[e.rival];
    const valuation = entry.stats[e.valuation];
    const headline = stepPlanned(e, {
      date: history[k - 1]!.date,
      rivalDefenceShare:
        rival?.defence_spending !== undefined && rival.gdp_nominal ? rival.defence_spending / rival.gdp_nominal : null,
      valuationPrice: valuation?.gdp_nominal && valuation.gdp_real ? valuation.gdp_nominal / valuation.gdp_real : 1,
    });
    const stats = (entry.stats[nation.id] ??= { ...nation.stats });
    for (const [id, value] of Object.entries(headline)) if (id in nation.stats) stats[id] = value;
    const ind = e.industry;
    entry.sectors = {
      ...(entry.sectors ?? {}),
      [nation.id]: Object.fromEntries(
        ind.sectors.map((id, j) => [id, { output: ind.output[j]!, utilisation: ind.output[j]! / ind.normalCapacity[j]! }]),
      ),
    };
    if (k === history.length - 1) for (const id of Object.keys(headline)) if (id in nation.stats) nation.stats[id] = stats[id]!;
  }
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
      if (data.economy && !nation.economy) nation.economy = createNationEconomy(data, content.economy);
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

  /** v3 (Phase 2B) → v4 (Phase 2C): economies name their engine, and the USSR gains a planned economy. */
  3: (state, content) => {
    const nations = state.nations as Record<string, NationState>;
    for (const nation of Object.values(nations)) {
      const e = nation.economy as unknown as Record<string, unknown> | undefined;
      if (e && !e.engine) e.engine = 'keynesian';
    }
    for (const nation of Object.values(nations)) {
      addMissingStats(nation, content);
      if (!nation.economy && content.nations[nation.id]?.economy) addPlannedEconomy(state, nation, content);
    }
    return state;
  },

  /**
   * v4 (Phase 2C) → v5 (Phase 3, pops): nations with a pop model gain pops,
   * fitted to the census tables and scaled to the save's current population,
   * and the stats pops provide. Births and deaths are calibrated at the save's
   * date, so the old save carries on smoothly.
   */
  4: (state, content) => {
    const nations = state.nations as Record<string, NationState>;
    for (const nation of Object.values(nations)) {
      const model = popModelFor(content, nation.id);
      if (model && !nation.pops) addPops(nation, model);
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
