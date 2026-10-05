/**
 * Creating a new game from a scenario.
 */

import { politicsModelFor, popModelFor, type Content } from './content';
import { createPolitics } from './politics/create';
import { politicsStats } from './politics/step';
import type { PoliticsModelData } from './politics/types';
import { initialPopsState } from './pops/build';
import { calibrateDemography } from './pops/demography';
import { labourForce, linkEconomy, womenWork } from './pops/economy';
import { livingStandard, popStats } from './pops/summary';
import type { PopModelData } from './pops/types';
import type { EconomyDefs } from './economy/calibrate';
import { createNationEconomy } from './economy/create';
import { SCHEMA_VERSION, type GameState, type HistoryEntry, type NationData, type NationState } from './schema';

export function nationStateFrom(
  data: NationData,
  economyDefs: EconomyDefs,
  popModel?: PopModelData,
  politicsModel?: PoliticsModelData,
): NationState {
  const stats: Record<string, number> = {};
  const statProvenance: NationState['statProvenance'] = {};
  for (const [id, entry] of Object.entries(data.stats)) {
    stats[id] = entry.value;
    statProvenance[id] = entry.provenance;
  }
  const params: Record<string, number> = {};
  for (const [id, entry] of Object.entries(data.params)) params[id] = entry.value;

  const nation: NationState = {
    id: data.id,
    name: data.name,
    shortName: data.shortName,
    tier: data.tier,
    government: structuredClone(data.government),
    stats,
    statProvenance,
    params,
    ...(data.economy ? { economy: createNationEconomy(data, economyDefs) } : {}),
  };
  if (popModel) addPops(nation, popModel);
  if (popModel && politicsModel) addPolitics(nation, politicsModel, popModel);
  return nation;
}

/** Starts a nation's politics (needs its pops) and adds the stats it provides. */
export function addPolitics(nation: NationState, model: PoliticsModelData, popModel: PopModelData): void {
  nation.politics = createPolitics(model, popModel, nation);
  for (const [id, value] of Object.entries(politicsStats(model, nation.politics))) {
    nation.stats[id] = value;
    nation.statProvenance[id] ??= 'estimate';
  }
}

/**
 * Builds a nation's pops from its census tables, scaled to its current
 * population, and adds the stats they provide.
 */
export function addPops(nation: NationState, model: PopModelData): void {
  const total = nation.stats[model.scaleToStat];
  if (total === undefined) throw new Error(`${nation.id}: pop model ${model.id} scales to missing stat "${model.scaleToStat}"`);
  const pops = initialPopsState(model, total);
  calibrateDemography(model, pops, livingStandard(nation), model.economy ? womenWork(model, pops, 0) : 0);
  if (model.economy) {
    pops.labourForce = labourForce(model, pops, 0);
    pops.previousLabourForce = pops.labourForce;
    if (nation.economy) linkEconomy(model, pops, nation.economy.industry);
  }
  nation.pops = pops;
  for (const [id, value] of Object.entries(popStats(model, pops))) {
    nation.stats[id] = value;
    nation.statProvenance[id] ??= 'estimate';
  }
}

/** Every nation's stats (and sector figures, where simulated) at the current date. */
export function snapshot(state: Pick<GameState, 'date' | 'nations'>): HistoryEntry {
  const stats: HistoryEntry['stats'] = {};
  const sectors: NonNullable<HistoryEntry['sectors']> = {};
  for (const nation of Object.values(state.nations)) {
    stats[nation.id] = { ...nation.stats };
    const ind = nation.economy?.industry;
    if (ind) {
      sectors[nation.id] = Object.fromEntries(
        ind.sectors.map((id, j) => [id, { output: ind.output[j]!, utilisation: ind.output[j]! / ind.normalCapacity[j]! }]),
      );
    }
  }
  return Object.keys(sectors).length > 0 ? { date: { ...state.date }, stats, sectors } : { date: { ...state.date }, stats };
}

export function createGame(content: Content, scenarioId: string, seed?: string): GameState {
  const scenario = content.scenarios[scenarioId];
  if (!scenario) throw new Error(`Unknown scenario "${scenarioId}"`);

  const nations: Record<string, NationState> = {};
  for (const id of scenario.nations) {
    const data = content.nations[id];
    if (!data) throw new Error(`Scenario "${scenarioId}" needs nation "${id}", which has no data file`);
    nations[id] = nationStateFrom(data, content.economy, popModelFor(content, id), politicsModelFor(content, id));
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
