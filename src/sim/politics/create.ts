/**
 * Starting a nation's politics: calibrating opinion, the vote and the
 * seats–votes curve to the start date, and every interest group's mood.
 */

import type { NationState } from '../schema';
import type { PopModelData } from '../pops/types';
import { livingStandard } from '../pops/summary';
import { groupApprovalZ, groupStates } from './groups';
import { leverValues } from './levers';
import { approvalInputs, approvalOffsets, logit, meanApproval, solveIncreasing, votesByRegion } from './opinion';
import type { PoliticsModelData, PoliticsState } from './types';

/** Seats each faction holds at the start, by chamber. */
function startingSeats(model: PoliticsModelData): Record<string, Record<string, number>> {
  return Object.fromEntries(
    model.legislature.chambers.map((ch) => [ch.id, Object.fromEntries(model.legislature.factions.map((f) => [f.id, f.seats[ch.id] ?? 0]))]),
  );
}

/** For each party, the first-listed "rest" faction's share of the party's rest seats (first chamber). */
function startingSplit(model: PoliticsModelData): Record<string, number> {
  const chamber = model.legislature.chambers[0]!.id;
  const out: Record<string, number> = {};
  for (const party of model.legislature.parties) {
    const rest = model.legislature.factions.filter((f) => f.party === party.id && f.base === 'rest');
    const total = rest.reduce((s, f) => s + (f.seats[chamber] ?? 0), 0);
    out[party.id] = rest.length > 0 && total > 0 ? (rest[0]!.seats[chamber] ?? 0) / total : 1;
  }
  return out;
}

/** Seats of the first party in each bloc ("core"/"rest") of a chamber. */
export function firstPartySeatsByBloc(model: PoliticsModelData, seats: Record<string, number>): Record<'core' | 'rest', number> {
  const first = model.legislature.parties[0]!.id;
  const out = { core: 0, rest: 0 };
  for (const f of model.legislature.factions) if (f.party === first) out[f.base] += seats[f.id] ?? 0;
  return out;
}

/** Seats of each bloc in a chamber, from the apportionment. */
export function blocSeats(model: PoliticsModelData, popModel: PopModelData, apportionment: Record<string, number>): Record<'core' | 'rest', number> {
  const core = new Set(model.legislature.coreRegions);
  const out = { core: 0, rest: 0 };
  const region = popModel.attributes.find((a) => a.role === 'region')!;
  for (const c of region.categories) out[core.has(c.id) ? 'core' : 'rest'] += apportionment[c.id] ?? 0;
  return out;
}

/** Vote share of the first party in each bloc. */
export function blocVotes(model: PoliticsModelData, popModel: PopModelData, v: { first: number[]; total: number[] }): Record<'core' | 'rest' | 'all', number> {
  const core = new Set(model.legislature.coreRegions);
  const region = popModel.attributes.find((a) => a.role === 'region')!;
  const sums = { core: [0, 0], rest: [0, 0], all: [0, 0] };
  region.categories.forEach((c, i) => {
    const bloc = core.has(c.id) ? 'core' : 'rest';
    for (const b of [bloc, 'all'] as const) {
      sums[b][0]! += v.first[i]!;
      sums[b][1]! += v.total[i]!;
    }
  });
  return { core: sums.core[0]! / sums.core[1]!, rest: sums.rest[0]! / sums.rest[1]!, all: sums.all[0]! / sums.all[1]! };
}

export function createPolitics(model: PoliticsModelData, popModel: PopModelData, nation: NationState): PoliticsState {
  const pops = nation.pops;
  if (!pops) throw new Error(`${nation.id}: politics needs pops`);
  const levers0 = leverValues(nation.economy);
  const living = livingStandard(nation);
  const op = model.opinion;
  const seats = startingSeats(model);
  const apportionment = structuredClone(model.legislature.seatsByRegion);

  const politics: PoliticsState = {
    model: model.id,
    approval: op.startApproval / 100,
    capital: model.capital.start,
    leader: { ...model.leader },
    mood: {
      unemployment: nation.stats.unemployment ?? op.economy.unemploymentRef,
      inflation: nation.stats.inflation ?? 0,
      growth: 0,
    },
    groups: [],
    seats,
    apportionment,
    factionSplit: startingSplit(model),
    calib: {
      approvalIntercept: 0,
      voteIntercept: 0,
      seatBias: {},
      groupIntercepts: {},
      levers0,
      stats0: { ...nation.stats },
      livingHistory: [living, living, living, living],
    },
    lastBills: [],
    elections: [],
  };

  // Approval: the intercept that reproduces the starting approval among those who may vote.
  const inputs = approvalInputs(model, politics, levers0);
  const offsets = approvalOffsets(model, popModel, pops, inputs);
  // inputs.intercept = calibrated intercept (still 0) + the leader's honeymoon and term decay.
  const fixed = inputs.intercept;
  politics.calib.approvalIntercept = solveIncreasing((x) => meanApproval(offsets, x + fixed), op.startApproval / 100);

  // The vote: the intercept that gives the first party its normal vote with no national tide.
  const el = model.elections;
  if (el) {
    politics.calib.voteIntercept = solveIncreasing(
      (x) => blocVotes(model, popModel, votesByRegion(model, popModel, pops, x, 0)).all,
      el.normalVote,
    );
    // Seats–votes curve per bloc, so the starting vote reproduces the starting seats.
    const v = blocVotes(model, popModel, votesByRegion(model, popModel, pops, politics.calib.voteIntercept, 0));
    const chamber = model.legislature.chambers[0]!.id;
    const firstSeats = firstPartySeatsByBloc(model, seats[chamber]!);
    const total = blocSeats(model, popModel, apportionment[chamber]!);
    for (const bloc of ['core', 'rest'] as const) {
      const share = Math.min(0.995, Math.max(0.005, firstSeats[bloc] / total[bloc]));
      politics.calib.seatBias[bloc] = logit(share) - el.swingRatio * logit(v[bloc]);
    }
  }

  // Interest groups: intercepts that reproduce their starting approval.
  for (const g of model.interestGroups) {
    politics.calib.groupIntercepts[g.id] = logit(g.startApproval / 100) - groupApprovalZ(model, g, politics, levers0, nation.stats);
  }
  politics.groups = groupStates(model, popModel, pops, politics, levers0, nation.stats);
  return politics;
}
