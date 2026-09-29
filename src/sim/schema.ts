/**
 * The shapes of the game's data.
 *
 * Two layers:
 *  - *Data files* (data/…): what a designer writes. Every starting figure
 *    carries its provenance and a note saying where it came from.
 *  - *State* (GameState): what the engine carries from turn to turn and what
 *    a save file contains. Plain JSON only, so it can be saved, sent to the
 *    simulation worker, and compared.
 *
 * Every nation uses the SAME structure at a different resolution (GDD:
 * "one universal nation schema"). A minor state simply has fewer stats and,
 * later, fewer pops and coarser sectors.
 */

import type { GameDate } from './time';

// ---------------------------------------------------------------------------
// Stat registry (data/stats.json)
// ---------------------------------------------------------------------------

export const PILLARS = ['economy', 'military', 'politics', 'society', 'world', 'intelligence'] as const;
export type Pillar = (typeof PILLARS)[number];

export const STAT_UNITS = ['people', 'usd_bn', 'percent', 'count', 'mt'] as const;
/** people = persons · usd_bn = billions of current US dollars · percent · count · mt = million metric tonnes */
export type StatUnit = (typeof STAT_UNITS)[number];

export interface StatDef {
  id: string;
  label: string;
  pillar: Pillar;
  unit: StatUnit;
  /** Decimal places shown in the interface. */
  decimals: number;
  description: string;
}

// ---------------------------------------------------------------------------
// Nation data files (data/nations/*.json)
// ---------------------------------------------------------------------------

export const TIERS = ['player', 'main_rival', 'major', 'regional', 'minor'] as const;
export type Tier = (typeof TIERS)[number];

/**
 * measured = taken from a historical statistical series.
 * estimate = reconstructed, interpolated or a Western estimate of an opaque state.
 */
export type Provenance = 'measured' | 'estimate';

export interface SourcedValue {
  value: number;
  provenance: Provenance;
  note: string;
}

export interface Leader {
  name: string;
  title: string;
  party: string;
}

export interface Government {
  /** Machine id for the regime type; later versions switch mechanics on it. */
  type: string;
  label: string;
  leader: Leader;
}

export interface SourceRef {
  label: string;
  url?: string;
}

export interface NationData {
  id: string;
  name: string;
  shortName: string;
  tier: Tier;
  government: Government;
  /** Starting figures, keyed by stat id from the registry. A missing stat means "not modelled for this nation yet". */
  stats: Record<string, SourcedValue>;
  /** Model parameters (rates, coefficients). Not shown as headline stats. */
  params: Record<string, SourcedValue>;
  /** "unchecked" until a human has checked the figures against the sources. */
  verification: 'unchecked' | 'checked';
  sources: SourceRef[];
}

// ---------------------------------------------------------------------------
// Scenario files (data/scenarios/*.json)
// ---------------------------------------------------------------------------

export interface ScenarioData {
  id: string;
  name: string;
  description: string;
  playerNation: string;
  startDate: GameDate;
  endDate: GameDate;
  nations: string[];
  defaultSeed: string;
}

// ---------------------------------------------------------------------------
// Game state (what a save file holds)
// ---------------------------------------------------------------------------

export interface NationState {
  id: string;
  name: string;
  shortName: string;
  tier: Tier;
  government: Government;
  stats: Record<string, number>;
  /** Provenance of each starting figure, kept so the interface can mark estimates. */
  statProvenance: Record<string, Provenance>;
  params: Record<string, number>;
}

/** A snapshot of every nation's stats at one date. One per quarter, never pruned. */
export interface HistoryEntry {
  date: GameDate;
  stats: Record<string, Record<string, number>>;
}

/** What happened when a turn resolved. */
export interface TurnLogEntry {
  /** The quarter that was resolved. */
  resolved: GameDate;
  systemsRun: string[];
  /** Fingerprint of the state after resolution. Same seed + same choices = same checksum. */
  checksum: string;
}

export interface GameState {
  schemaVersion: number;
  scenarioId: string;
  seed: string;
  playerNation: string;
  /** Turn 1 is the start date. */
  turn: number;
  date: GameDate;
  startDate: GameDate;
  endDate: GameDate;
  nations: Record<string, NationState>;
  history: HistoryEntry[];
  log: TurnLogEntry[];
}

/** The player's decisions for the quarter. Empty in Phase 1; policy sliders arrive in Phase 2. */
export type PlayerOrders = Record<string, never>;

export const SCHEMA_VERSION = 1;
