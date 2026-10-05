/**
 * Interest groups (Victoria 3 style, GDD).
 *
 * - Members: each pop belongs in part: base × factors by attribute (capped at
 *   1). Lock-in groups grow with a lever: × (level ÷ start)^elasticity.
 * - Clout (GDD): w1·wealth + w2·numbers + w3·organisation, normalised so all
 *   groups sum to 1. Wealth is the members' share of national wealth
 *   (income squared, since wealth is far more concentrated than income);
 *   numbers their share of the population; organisation turns numbers into
 *   power, so it counts in proportion to the square root of the group's size
 *   (a tiny, well-organised cell is still tiny).
 * - Approval of the government (log-odds): calibrated intercept + preferences
 *   × policy changes since the start + responses to national conditions +
 *   party (positive when the group's party governs, negative otherwise).
 */

import { codecFor } from '../pops/codec';
import { relativeIncomes } from '../pops/economy';
import type { PopModelData, PopsState } from '../pops/types';
import { leverChange } from './levers';
import { factorTable, logistic, partySign } from './opinion';
import type { GroupState, InterestGroupData, PoliticsModelData, PoliticsState } from './types';

const shareCache = new WeakMap<PoliticsModelData, Float64Array[]>();

/** Membership share of every attribute combination, per group (before lock-in). */
function membershipTables(model: PoliticsModelData, popModel: PopModelData): Float64Array[] {
  const cached = shareCache.get(model);
  if (cached) return cached;
  const codec = codecFor(popModel);
  const tables = model.interestGroups.map((g) => factorTable(codec, g.membership, g.membership.base).map((v) => Math.min(1, v)));
  shareCache.set(model, tables);
  return tables;
}

/** Lock-in multiplier for a group: (lever level ÷ its start)^elasticity. */
export function lockInFactor(g: InterestGroupData, levers: Record<string, number>, levers0: Record<string, number>): number {
  if (!g.lockIn) return 1;
  const now = levers[g.lockIn.lever];
  const then = levers0[g.lockIn.lever];
  if (now === undefined || then === undefined || then <= 0) return 1;
  return Math.pow(Math.max(now, 0.01) / then, g.lockIn.elasticity);
}

/** Members, wealth share, numbers share and organisation of every group. */
export function groupStrength(
  model: PoliticsModelData,
  popModel: PopModelData,
  pops: PopsState,
  levers: Record<string, number>,
  levers0: Record<string, number>,
): { members: number; wealth: number; numbers: number; organisation: number }[] {
  const tables = membershipTables(model, popModel);
  const rel = relativeIncomes(popModel, pops);
  // Wealth is far more concentrated than income: weight it by relative income squared.
  let people = 0;
  let income = 0;
  for (let i = 0; i < pops.keys.length; i++) {
    people += pops.size[i]!;
    income += pops.size[i]! * rel[i]! * rel[i]!;
  }
  return model.interestGroups.map((g, gi) => {
    const t = tables[gi]!;
    const lock = lockInFactor(g, levers, levers0);
    let members = 0;
    let groupIncome = 0;
    for (let i = 0; i < pops.keys.length; i++) {
      const m = pops.size[i]! * Math.min(1, t[pops.keys[i]!]! * lock);
      members += m;
      groupIncome += m * rel[i]! * rel[i]!;
    }
    return {
      members,
      wealth: income > 0 ? groupIncome / income : 0,
      numbers: people > 0 ? members / people : 0,
      organisation: Math.min(1, g.organisation * lock),
    };
  });
}

/** Clout shares (summing to 1) from strengths. */
export function cloutShares(model: PoliticsModelData, strength: ReturnType<typeof groupStrength>): number[] {
  const w = model.clout;
  const raw = strength.map((s) => w.wealth * s.wealth + w.numbers * s.numbers + w.organisation * s.organisation * Math.sqrt(s.numbers));
  const total = raw.reduce((a, b) => a + b, 0);
  return raw.map((r) => (total > 0 ? r / total : 0));
}

/** A group's approval log-odds before its calibrated intercept. */
export function groupApprovalZ(
  _model: PoliticsModelData,
  g: InterestGroupData,
  politics: Pick<PoliticsState, 'leader' | 'calib'>,
  levers: Record<string, number>,
  stats: Record<string, number>,
): number {
  let z = 0;
  for (const [lever, pref] of Object.entries(g.preferences)) {
    const now = levers[lever];
    const then = politics.calib.levers0[lever];
    if (now !== undefined && then !== undefined) z += pref * leverChange(lever, then, now);
  }
  for (const [stat, coef] of Object.entries(g.conditions)) {
    const now = stats[stat];
    const then = politics.calib.stats0[stat];
    if (now !== undefined && then !== undefined) z += coef * (now - then);
  }
  if (g.party) z += (g.party === politics.leader.party ? 1 : -1) * g.partyLean;
  return z;
}

/** Every group's state this quarter. */
export function groupStates(
  model: PoliticsModelData,
  popModel: PopModelData,
  pops: PopsState,
  politics: Pick<PoliticsState, 'leader' | 'calib'>,
  levers: Record<string, number>,
  stats: Record<string, number>,
): GroupState[] {
  const strength = groupStrength(model, popModel, pops, levers, politics.calib.levers0);
  const clout = cloutShares(model, strength);
  return model.interestGroups.map((g, i) => ({
    id: g.id,
    members: strength[i]!.members,
    clout: clout[i]!,
    organisation: strength[i]!.organisation,
    approval: logistic((politics.calib.groupIntercepts[g.id] ?? 0) + groupApprovalZ(model, g, politics, levers, stats)),
  }));
}

export { partySign };
