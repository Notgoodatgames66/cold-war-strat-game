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

import type { NationEconomy, NationEconomyData } from './economy/types';
import type { PoliticsState } from './politics/types';
import type { PopsState } from './pops/types';
import type { GameDate } from './time';

// ---------------------------------------------------------------------------
// Stat registry (data/stats.json)
// ---------------------------------------------------------------------------

export const PILLARS = ['economy', 'military', 'politics', 'society', 'world', 'intelligence'] as const;
export type Pillar = (typeof PILLARS)[number];

export const STAT_UNITS = ['people', 'usd_bn', 'percent', 'count', 'mt', 'index'] as const;
/** people = persons · usd_bn = billions of current US dollars · percent · count · mt = million metric tonnes · index = base year 100 */
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
  /** Present when the nation's economy is simulated (Phase 2: the USA). */
  economy?: NationEconomyData;
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
  /** Optional opening shown full-screen when a new game starts. */
  opening?: ScenarioOpening;
}

export interface ScenarioOpening {
  kicker: string;
  headline: string;
  paragraphs: string[];
  quote?: { text: string; source: string };
  action: string;
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
  /** The simulated economy, when the nation has one: Keynesian or planned. */
  economy?: NationEconomy;
  /** The population as pops, when the nation has a pop model (data/pops/). */
  pops?: PopsState;
  /** Opinion, interest groups, the legislature and elections, when the nation has a politics model (data/politics/). */
  politics?: PoliticsState;
}

/** One sector's figures in a history snapshot. */
export interface SectorSnapshot {
  /** Real gross output, $bn a year (1949 dollars). */
  output: number;
  /** Output ÷ normal capacity (1 = normal). */
  utilisation: number;
}

/** A snapshot of every nation's stats at one date. One per quarter, never pruned. */
export interface HistoryEntry {
  date: GameDate;
  stats: Record<string, Record<string, number>>;
  /** Sector figures for nations with a simulated industry: nation → sector → figures. */
  sectors?: Record<string, Record<string, SectorSnapshot>>;
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

/**
 * The player's decisions for the quarter. Only the levers that change need to
 * be sent; anything omitted keeps its current setting.
 */
export interface PlayerOrders {
  /** New budget targets, nominal $bn a year, keyed by budget line id. */
  budget?: Record<string, number>;
  /** New tax rates, percent, keyed by tax id. */
  taxes?: Record<string, number>;
  /** Switch automatic budget indexation on or off. */
  budgetIndexed?: boolean;
}

export const SCHEMA_VERSION = 6;
