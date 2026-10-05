/**
 * One quarter of politics for a nation: the public's mood catches up with the
 * economy, the leader's term wears on, interest groups and approval are
 * worked out, and political capital regenerates.
 */

import type { NationState } from '../schema';
import type { PopModelData } from '../pops/types';
import { livingStandard } from '../pops/summary';
import { groupStates } from './groups';
import { leverValues } from './levers';
import { approvalInputs, nationalApproval } from './opinion';
import type { PoliticsModelData, PoliticsState } from './types';

export function updateMood(model: PoliticsModelData, politics: PoliticsState, nation: NationState): void {
  const memory = model.opinion.economy.memory;
  const living = livingStandard(nation);
  const history = politics.calib.livingHistory;
  const yearAgo = history[0] ?? living;
  const growth = yearAgo > 0 ? (living / yearAgo - 1) * 100 : 0;
  politics.calib.livingHistory = [...history.slice(1), living];
  const m = politics.mood;
  m.unemployment = memory * m.unemployment + (1 - memory) * (nation.stats.unemployment ?? m.unemployment);
  m.inflation = memory * m.inflation + (1 - memory) * (nation.stats.inflation ?? m.inflation);
  m.growth = memory * m.growth + (1 - memory) * growth;
}

/** Political capital gained this quarter at the current approval. */
export function capitalRegeneration(model: PoliticsModelData, approval: number): number {
  return model.capital.base + (model.capital.approvalRate * (approval * 100 - 50)) / 100;
}

/** Share of the first chamber's seats held by the leader's party, percent. */
export function legislativeSupport(model: PoliticsModelData, politics: PoliticsState): number {
  const chamber = model.legislature.chambers[0]!;
  const seats = politics.seats[chamber.id] ?? {};
  let own = 0;
  for (const f of model.legislature.factions) if (f.party === politics.leader.party) own += seats[f.id] ?? 0;
  return (own / chamber.seats) * 100;
}

export function stepPolitics(model: PoliticsModelData, popModel: PopModelData, politics: PoliticsState, nation: NationState): void {
  const pops = nation.pops;
  if (!pops) return;
  updateMood(model, politics, nation);
  politics.leader.quartersInOffice += 1;
  politics.leader.honeymoon *= model.opinion.honeymoonKeep;

  const levers = leverValues(nation.economy);
  politics.groups = groupStates(model, popModel, pops, politics, levers, nation.stats);
  politics.approval = nationalApproval(model, popModel, pops, approvalInputs(model, politics, levers));
  politics.capital = Math.min(model.capital.max, Math.max(0, politics.capital + capitalRegeneration(model, politics.approval)));
}

/** The stats politics provides. */
export function politicsStats(model: PoliticsModelData, politics: PoliticsState): Record<string, number> {
  return {
    approval: politics.approval * 100,
    political_capital: politics.capital,
    congress_support: legislativeSupport(model, politics),
  };
}
