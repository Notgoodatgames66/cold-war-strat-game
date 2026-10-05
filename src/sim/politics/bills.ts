/**
 * Bills: every change the player orders to a policy lever goes to the
 * legislature, and each faction decides how many of its members vote for it.
 *
 * A faction's members vote yes with probability logistic(u), where
 *
 *   u = salience × Δ × (Σ_g weight_g × preference_g + stance) − statusQuo × |Δ|
 *     + loyalty if the faction is of the head of government's party, − opposition if not
 *     + ownFaction if it is the head of government's own faction
 *     + approvalPull × (approval − 50)
 *     + groupPull × Σ_g weight_g × (group approval − 50)
 *     + capitalPerPoint × political capital spent on the bill
 *
 * and Δ is the size of the change in the lever's comparable unit (levers.ts):
 * the faction weighs what its interest groups and its own tradition want,
 * resists change of any kind, follows or opposes its party's leader, and is
 * swayed by how popular he is with the public and with its own groups.
 *
 * A chamber's expected yes share is the seat-weighted mean of its factions.
 * The count on the day is that share plus normal noise (sd `whipUncertainty`:
 * absences, cross-voting, last-minute deals), and the bill needs a majority of
 * seats in every chamber. So the odds of passing are
 *
 *   odds = Π_chambers Φ((expected yes − needed) / whipUncertainty)
 *
 * where `needed` is the share of seats that rounds to a strict majority. The
 * roll at turn end draws the same noise, so the odds shown are exact.
 */

import type { Rng } from '../rng';
import { leverChange } from './levers';
import { logistic } from './opinion';
import type { BillResult, PoliticsModelData, PoliticsState } from './types';

/** A bill before the vote: the odds the player sees. */
export interface BillPreview {
  lever: string;
  from: number;
  to: number;
  /** Size of the change in the lever's comparable unit. */
  change: number;
  /** Political capital spent on it. */
  capital: number;
  /** Share of each faction's members expected to vote yes. */
  factions: Record<string, number>;
  /** Expected yes share by chamber, and the share needed for a majority. */
  votes: Record<string, number>;
  needed: Record<string, number>;
  /** Chance of passing each chamber, and of passing all of them. */
  chambers: Record<string, number>;
  odds: number;
}

/** Standard normal cumulative distribution (Abramowitz & Stegun 7.1.26, error < 1.5e-7). */
export function normalCdf(x: number): number {
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-z * z);
  return x >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/** Share of seats that rounds to a strict majority of a chamber. */
export function majorityNeeded(seats: number): number {
  return (Math.floor(seats / 2) + 0.5) / seats;
}

/** The log-odds of a faction's members voting for a change of size `change` to `lever`. */
export function factionUtility(
  model: PoliticsModelData,
  politics: Pick<PoliticsState, 'approval' | 'leader' | 'groups'>,
  factionId: string,
  lever: string,
  change: number,
  capital: number,
): number {
  const b = model.legislature.bills;
  const f = model.legislature.factions.find((x) => x.id === factionId);
  if (!f) throw new Error(`Unknown faction ${factionId}`);
  let want = f.stances[lever] ?? 0;
  let groupMood = 0;
  for (const [groupId, weight] of Object.entries(f.groups)) {
    const g = model.interestGroups.find((x) => x.id === groupId);
    want += weight * (g?.preferences[lever] ?? 0);
    const s = politics.groups.find((x) => x.id === groupId);
    if (s) groupMood += weight * (s.approval * 100 - 50);
  }
  let u = b.salience * change * want - b.statusQuo * Math.abs(change);
  u += f.party === politics.leader.party ? b.loyalty : -b.opposition;
  if (politics.leader.faction && f.id === politics.leader.faction) u += b.ownFaction;
  u += b.approvalPull * (politics.approval * 100 - 50);
  u += b.groupPull * groupMood;
  u += b.capitalPerPoint * capital;
  return u;
}

/** The odds of a bill changing `lever` from `from` to `to`, with `capital` spent on it. */
export function billPreview(
  model: PoliticsModelData,
  politics: Pick<PoliticsState, 'approval' | 'leader' | 'groups' | 'seats'>,
  lever: string,
  from: number,
  to: number,
  capital: number,
): BillPreview {
  const change = leverChange(lever, from, to);
  const factions: Record<string, number> = {};
  for (const f of model.legislature.factions) factions[f.id] = logistic(factionUtility(model, politics, f.id, lever, change, capital));
  const votes: Record<string, number> = {};
  const needed: Record<string, number> = {};
  const chambers: Record<string, number> = {};
  let odds = 1;
  const sd = model.legislature.bills.whipUncertainty;
  for (const ch of model.legislature.chambers) {
    const seats = politics.seats[ch.id] ?? {};
    let yes = 0;
    let total = 0;
    for (const f of model.legislature.factions) {
      const n = seats[f.id] ?? 0;
      yes += n * factions[f.id]!;
      total += n;
    }
    votes[ch.id] = total > 0 ? yes / total : 0;
    needed[ch.id] = majorityNeeded(ch.seats);
    chambers[ch.id] = normalCdf((votes[ch.id]! - needed[ch.id]!) / sd);
    odds *= chambers[ch.id]!;
  }
  return { lever, from, to, change, capital, factions, votes, needed, chambers, odds };
}

/**
 * The vote on the day: each chamber's count is its expected share plus normal
 * noise; the bill passes if it wins a majority of seats in every chamber.
 */
export function rollBill(model: PoliticsModelData, bill: BillPreview, rng: Rng): BillResult {
  const sd = model.legislature.bills.whipUncertainty;
  const tally: Record<string, { yes: number; no: number }> = {};
  let passed = true;
  for (const ch of model.legislature.chambers) {
    const share = bill.votes[ch.id]! + sd * rng.normal(0, 1);
    const yes = Math.min(ch.seats, Math.max(0, Math.round(share * ch.seats)));
    tally[ch.id] = { yes, no: ch.seats - yes };
    if (share < bill.needed[ch.id]!) passed = false;
  }
  return { lever: bill.lever, from: bill.from, to: bill.to, odds: bill.odds, capital: bill.capital, passed, votes: bill.votes, tally };
}

/** Capital after the votes: what was spent, a penalty per failure, a bonus for unlikely wins. */
export function capitalAfterBills(model: PoliticsModelData, capital: number, results: BillResult[]): number {
  let c = capital;
  for (const r of results) {
    c -= r.capital;
    c += r.passed ? model.capital.victoryBonus * (1 - r.odds) : -model.capital.failurePenalty;
  }
  return Math.min(model.capital.max, Math.max(0, c));
}
