/**
 * Creating a new game from a scenario.
 */

import type { Content } from './content';
import { createEconomy, type EconomyDefs } from './economy/calibrate';
import { SCHEMA_VERSION, type GameState, type HistoryEntry, type NationData, type NationState } from './schema';

export function nationStateFrom(data: NationData, economyDefs: EconomyDefs): NationState {
  const stats: Record<string, number> = {};
  const statProvenance: NationState['statProvenance'] = {};
  for (const [id, entry] of Object.entries(data.stats)) {
    stats[id] = entry.value;
    statProvenance[id] = entry.provenance;
  }
  const params: Record<string, number> = {};
  for (const [id, entry] of Object.entries(data.params)) params[id] = entry.value;

  return {
    id: data.id,
    name: data.name,
    shortName: data.shortName,
    tier: data.tier,
    government: structuredClone(data.government),
    stats,
    statProvenance,
    params,
    ...(data.economy ? { economy: createEconomy(data, economyDefs) } : {}),
  };
}

/** Every nation's stats at the current date. */
export function snapshot(state: Pick<GameState, 'date' | 'nations'>): HistoryEntry {
  const stats: HistoryEntry['stats'] = {};
  for (const nation of Object.values(state.nations)) stats[nation.id] = { ...nation.stats };
  return { date: { ...state.date }, stats };
}

export function createGame(content: Content, scenarioId: string, seed?: string): GameState {
  const scenario = content.scenarios[scenarioId];
  if (!scenario) throw new Error(`Unknown scenario "${scenarioId}"`);

  const nations: Record<string, NationState> = {};
  for (const id of scenario.nations) {
    const data = content.nations[id];
    if (!data) throw new Error(`Scenario "${scenarioId}" needs nation "${id}", which has no data file`);
    nations[id] = nationStateFrom(data, content.economy);
  }

  const chosenSeed = seed?.trim() || scenario.defaultSeed;
  const state: GameState = {
    schemaVersion: SCHEMA_VERSION,
    scenarioId: scenario.id,
    seed: chosenSeed,
    playerNation: scenario.playerNation,
    turn: 1,
    date: { ...scenario.startDate },
    startDate: { ...scenario.startDate },
    endDate: { ...scenario.endDate },
    nations,
    history: [],
    log: [],
  };
  state.history.push(snapshot(state));
  return state;
}
