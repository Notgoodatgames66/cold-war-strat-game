/**
 * Elections: the legislature every `legislative.every` years and the head of
 * government every `executive.every` years, resolved in the given quarter.
 *
 * 1. Reapportionment. After a census year, the first chamber's seats are
 *    shared out again from the pops by the method of equal proportions
 *    (Huntington–Hill), effective at the next election.
 * 2. The vote. Every pop votes by its party leaning (opinion.ts) plus a
 *    national tide in log-odds towards the governing party:
 *      approvalEffect × (approval − 50)
 *      − midtermPenalty (legislative elections without an executive race)
 *      + incumbency (the head of government running again)
 *    plus the nominees' personal appeal, a national swing ~ N(0, noise) and a
 *    swing in each region ~ N(0, regionNoise), both from the 'elections'
 *    stream.
 * 3. Seats. Within each bloc ("core", e.g. the Solid South, and "rest") the
 *    first party's seat share follows the seats–votes curve
 *      logit(seats) = swingRatio × logit(votes) + bias,
 *    with the bias calibrated so the starting vote gives the starting seats.
 *    A chamber with only part of its seats up (the Senate, a third) moves
 *    that part of the way towards its target. Each party's seats in a bloc go
 *    to its factions based there, in proportion to the seats they held.
 * 4. The executive. Regions' votes go winner-take-all through an electoral
 *    college of first-chamber seats plus `electoralBonus` per region. A new
 *    head of government starts a honeymoon with `capital.newTerm` capital.
 */

import type { GameDate } from '../time';
import type { Rng } from '../rng';
import type { NationState } from '../schema';
import { peopleBy } from '../pops/summary';
import type { PopModelData, PopsState } from '../pops/types';
import { blocSeats } from './create';
import { groupStates } from './groups';
import { leverValues } from './levers';
import { approvalInputs, logistic, logit, nationalApproval, partySign, votesByRegion } from './opinion';
import type { ElectionResult, NomineeData, PoliticsModelData, PoliticsState } from './types';

export interface ElectionsDue {
  legislative: boolean;
  executive: boolean;
}

/** Which elections are held when `date` resolves. */
export function electionsDue(model: PoliticsModelData, date: GameDate): ElectionsDue {
  const el = model.elections;
  if (!el) return { legislative: false, executive: false };
  const on = (s: { every: number; quarter: number; first: number }) =>
    date.quarter === s.quarter && date.year >= s.first && (date.year - s.first) % s.every === 0;
  return { legislative: on(el.legislative), executive: on(el.executive) };
}

// ---------------------------------------------------------------------------
// Reapportionment
// ---------------------------------------------------------------------------

/**
 * The method of equal proportions (Huntington–Hill), used for the US House
 * since 1941: every region with seats gets one, then each further seat goes
 * to the region with the highest priority P ÷ √(n(n+1)).
 */
export function huntingtonHill(populations: number[], seats: number): number[] {
  const n: number[] = populations.map((p) => (p > 0 ? 1 : 0));
  let left = seats - n.reduce((a, b) => a + b, 0);
  if (left < 0) throw new Error(`huntingtonHill: ${seats} seats for ${seats - left} regions`);
  while (left > 0) {
    let best = -1;
    let bestPriority = -Infinity;
    for (let i = 0; i < populations.length; i++) {
      if (n[i]! === 0) continue;
      const priority = populations[i]! / Math.sqrt(n[i]! * (n[i]! + 1));
      if (priority > bestPriority) {
        bestPriority = priority;
        best = i;
      }
    }
    n[best]! += 1;
    left -= 1;
  }
  return n;
}

/** A census year whose count takes effect at an election in `year`, if any. */
export function censusFor(model: PoliticsModelData, year: number): number | undefined {
  const el = model.elections;
  if (!el) return undefined;
  return el.censusYears.find((c) => c < year && c >= year - el.legislative.every);
}

/**
 * The first chamber's seats per region from the pops. Only regions that had
 * seats at the start take part (DC elects no voting member).
 */
export function apportionFromPops(model: PoliticsModelData, popModel: PopModelData, pops: Pick<PopsState, 'keys' | 'size'>): Record<string, number> {
  const chamber = model.legislature.chambers[0]!;
  const region = popModel.attributes.find((a) => a.role === 'region')!;
  const people = peopleBy(popModel, pops, region.id);
  const start = model.legislature.seatsByRegion[chamber.id]!;
  const populations = region.categories.map((c, i) => ((start[c.id] ?? 0) > 0 ? people[i]! : 0));
  const seats = huntingtonHill(populations, chamber.seats);
  return Object.fromEntries(region.categories.map((c, i) => [c.id, seats[i]!]));
}

// ---------------------------------------------------------------------------
// Nominees
// ---------------------------------------------------------------------------

export interface Nominee extends NomineeData {
  incumbent: boolean;
}

/** Executive terms a person has won: the starting leader's, plus elections in this game. */
export function termsWon(model: PoliticsModelData, politics: Pick<PoliticsState, 'elections'>, name: string): number {
  const before = model.leader.name === name ? model.leader.termsWon : 0;
  return before + politics.elections.filter((e) => e.kind === 'executive' && e.winner === name).length;
}

/**
 * Each party's nominee: an eligible incumbent with at least `retireBelow`
 * approval runs again; otherwise the first historical nominee for the year who
 * may still serve; otherwise a generic candidate.
 */
export function nominees(model: PoliticsModelData, politics: Pick<PoliticsState, 'leader' | 'approval' | 'elections'>, year: number): Nominee[] {
  const el = model.elections!;
  const listed = el.nominees[String(year)] ?? {};
  const leader = politics.leader;
  const mayServe = (name: string) => termsWon(model, politics, name) < el.executive.maxTerms;
  return model.legislature.parties.slice(0, 2).map((party) => {
    const options = listed[party.id] ?? [];
    if (party.id === leader.party && mayServe(leader.name) && politics.approval * 100 >= el.retireBelow) {
      const own = options.find((n) => n.name === leader.name);
      return { name: leader.name, party: party.id, faction: leader.faction, appeal: own?.appeal ?? 0, incumbent: true };
    }
    const pick = options.find((n) => n.name !== leader.name && mayServe(n.name)) ?? options.find((n) => mayServe(n.name));
    return pick ? { ...pick, party: party.id, incumbent: false } : { name: `${party.label} nominee`, party: party.id, appeal: 0, incumbent: false };
  });
}

// ---------------------------------------------------------------------------
// The vote
// ---------------------------------------------------------------------------

/** The national tide towards the first party, before random swings. */
export function nationalTide(model: PoliticsModelData, politics: Pick<PoliticsState, 'leader' | 'approval'>, due: ElectionsDue, candidates?: Nominee[]): number {
  const el = model.elections!;
  const sign = partySign(model, politics.leader.party);
  let tide = sign * el.approvalEffect * (politics.approval * 100 - 50);
  if (!due.executive) tide -= sign * el.midtermPenalty;
  if (candidates) {
    for (const c of candidates) {
      const s = partySign(model, c.party);
      tide += s * c.appeal;
      if (c.incumbent) tide += s * el.incumbency;
    }
  }
  return tide;
}

/** First-party vote share and turnout by region, with a national and a regional swing. */
export function regionalVote(
  model: PoliticsModelData,
  popModel: PopModelData,
  pops: Pick<PopsState, 'keys' | 'size'>,
  politics: Pick<PoliticsState, 'calib'>,
  tide: number,
  swings: { national: number; region: number[] },
): { share: number[]; total: number[] } {
  const v = votesByRegion(model, popModel, pops, politics.calib.voteIntercept, tide + swings.national);
  const share = v.first.map((f, i) => {
    const t = v.total[i]!;
    if (t <= 0) return NaN;
    const s = Math.min(1 - 1e-9, Math.max(1e-9, f / t));
    return logistic(logit(s) + (swings.region[i] ?? 0));
  });
  return { share, total: v.total };
}

/** Vote share of the first party in each bloc and overall. */
export function blocShares(model: PoliticsModelData, popModel: PopModelData, vote: { share: number[]; total: number[] }): Record<'core' | 'rest' | 'all', number> {
  const core = new Set(model.legislature.coreRegions);
  const region = popModel.attributes.find((a) => a.role === 'region')!;
  const sums = { core: [0, 0], rest: [0, 0], all: [0, 0] };
  region.categories.forEach((c, i) => {
    const t = vote.total[i]!;
    if (!(t > 0)) return;
    for (const b of [core.has(c.id) ? 'core' : 'rest', 'all'] as const) {
      sums[b][0]! += vote.share[i]! * t;
      sums[b][1]! += t;
    }
  });
  const r = (x: number[]) => (x[1]! > 0 ? x[0]! / x[1]! : 0.5);
  return { core: r(sums.core), rest: r(sums.rest), all: r(sums.all) };
}

/** Seat bias of a chamber's bloc (the Senate falls back to the first chamber's for older saves). */
export function seatBias(politics: Pick<PoliticsState, 'calib'>, chamber: string, bloc: string): number {
  return politics.calib.seatBias[`${chamber}:${bloc}`] ?? politics.calib.seatBias[bloc] ?? 0;
}

/** Largest-remainder rounding of `total` seats in proportion to `weights` (equal shares if all zero). */
export function shareOut(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  const w = sum > 0 ? weights : weights.map(() => 1);
  const ws = sum > 0 ? sum : w.length;
  const exact = w.map((x) => (total * x) / ws);
  const out = exact.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    out[i]! += 1;
    left -= 1;
  }
  return out;
}

/** A chamber's seats by faction after an election, from the first party's seats in each bloc. */
export function factionSeats(model: PoliticsModelData, current: Record<string, number>, firstByBloc: Record<'core' | 'rest', number>, totalByBloc: Record<'core' | 'rest', number>): Record<string, number> {
  const factions = model.legislature.factions;
  const parties = model.legislature.parties;
  const pools = new Map<string, { ids: string[]; seats: number }>();
  const add = (party: string, bloc: 'core' | 'rest', seats: number) => {
    let ids = factions.filter((f) => f.party === party && f.base === bloc).map((f) => f.id);
    if (ids.length === 0) ids = factions.filter((f) => f.party === party).map((f) => f.id);
    const key = ids.join('|');
    const pool = pools.get(key) ?? { ids, seats: 0 };
    pool.seats += seats;
    pools.set(key, pool);
  };
  for (const bloc of ['core', 'rest'] as const) {
    add(parties[0]!.id, bloc, firstByBloc[bloc]);
    add(parties[1]!.id, bloc, totalByBloc[bloc] - firstByBloc[bloc]);
  }
  const out: Record<string, number> = Object.fromEntries(factions.map((f) => [f.id, 0]));
  for (const pool of pools.values()) {
    const split = shareOut(pool.seats, pool.ids.map((id) => current[id] ?? 0));
    pool.ids.forEach((id, i) => (out[id]! += split[i]!));
  }
  return out;
}

/** Seats of the first party in each bloc of a chamber now. */
function firstSeatsNow(model: PoliticsModelData, seats: Record<string, number>, popModel: PopModelData, apportionment: Record<string, number>): Record<'core' | 'rest', number> {
  // Factions are tied to a bloc, but a party without a faction in a bloc holds
  // its seats there through its other factions: count by faction base where
  // possible and put the rest where the bloc's seats leave room.
  const first = model.legislature.parties[0]!.id;
  const total = blocSeats(model, popModel, apportionment);
  const out = { core: 0, rest: 0 };
  let floating = 0;
  for (const f of model.legislature.factions) {
    if (f.party !== first) continue;
    const n = seats[f.id] ?? 0;
    if (model.legislature.factions.some((g) => g.party === first && g.base !== f.base)) out[f.base] += n;
    else floating += n;
  }
  out.core += Math.min(floating, total.core);
  out.rest += floating - Math.min(floating, total.core);
  return out;
}

// ---------------------------------------------------------------------------
// Election day
// ---------------------------------------------------------------------------

export function holdElections(
  model: PoliticsModelData,
  popModel: PopModelData,
  politics: PoliticsState,
  nation: NationState,
  date: GameDate,
  rng: Rng,
): ElectionResult | null {
  const el = model.elections;
  const pops = nation.pops;
  const due = electionsDue(model, date);
  if (!el || !pops || (!due.legislative && !due.executive)) return null;
  const year = date.year;
  const firstChamber = model.legislature.chambers[0]!;

  // 1. Reapportionment after a census.
  if (due.legislative && censusFor(model, year) !== undefined) {
    politics.apportionment[firstChamber.id] = apportionFromPops(model, popModel, pops);
  }

  // 2. The vote. Swings are drawn first, nationally then region by region.
  const candidates = due.executive ? nominees(model, politics, year) : undefined;
  const region = popModel.attributes.find((a) => a.role === 'region')!;
  const swings = {
    national: rng.normal(0, el.noise),
    region: region.categories.map(() => rng.normal(0, el.regionNoise)),
  };
  const tide = nationalTide(model, politics, due, candidates);
  const vote = regionalVote(model, popModel, pops, politics, tide, swings);
  const blocs = blocShares(model, popModel, vote);

  // 3. Seats.
  const before = structuredClone(politics.seats);
  if (due.legislative) {
    for (const ch of model.legislature.chambers) {
      const apportionment = politics.apportionment[ch.id]!;
      const total = blocSeats(model, popModel, apportionment);
      const now = firstSeatsNow(model, politics.seats[ch.id]!, popModel, apportionment);
      const first = { core: 0, rest: 0 };
      for (const bloc of ['core', 'rest'] as const) {
        const v = Math.min(1 - 1e-9, Math.max(1e-9, blocs[bloc]));
        const target = logistic(el.swingRatio * logit(v) + seatBias(politics, ch.id, bloc)) * total[bloc];
        first[bloc] = Math.min(total[bloc], Math.max(0, Math.round(now[bloc] + ch.upShare * (target - now[bloc]))));
      }
      politics.seats[ch.id] = factionSeats(model, politics.seats[ch.id]!, first, total);
    }
  }
  const change = Object.fromEntries(
    model.legislature.chambers.map((ch) => [
      ch.id,
      Object.fromEntries(model.legislature.factions.map((f) => [f.id, (politics.seats[ch.id]![f.id] ?? 0) - (before[ch.id]![f.id] ?? 0)])),
    ]),
  );
  const result: ElectionResult = {
    year,
    kind: due.executive ? 'executive' : 'legislative',
    seats: structuredClone(politics.seats),
    change,
    vote: blocs.all,
    regionVote: vote.share.map((s) => (Number.isFinite(s) ? Math.round(s * 10000) / 10000 : -1)),
  };

  // 4. The executive.
  if (due.executive && candidates) {
    const electors = electoralVotes(model, popModel, politics, year);
    const first = model.legislature.parties[0]!.id;
    const ev: Record<string, number> = {};
    for (const c of candidates) ev[c.party] = 0;
    region.categories.forEach((_, i) => {
      if (!(electors[i]! > 0) || !Number.isFinite(vote.share[i]!)) return;
      const party = vote.share[i]! > 0.5 ? first : candidates.find((c) => c.party !== first)!.party;
      ev[party] = (ev[party] ?? 0) + electors[i]!;
    });
    result.candidates = candidates.map((c) => ({ name: c.name, party: c.party, electoral: ev[c.party] ?? 0, vote: c.party === first ? blocs.all : 1 - blocs.all }));
    const [a, b] = result.candidates;
    const winner = a!.electoral !== b!.electoral ? (a!.electoral > b!.electoral ? a! : b!) : a!.vote >= b!.vote ? a! : b!;
    result.winner = winner.name;
    const nominee = candidates.find((c) => c.name === winner.name)!;
    inaugurate(model, popModel, politics, nation, nominee, termsWon(model, politics, winner.name) + 1);
  }

  politics.elections.push(result);
  return result;
}

/** Electoral votes per region in `year`: first-chamber seats plus the bonus, plus extra electors. */
export function electoralVotes(model: PoliticsModelData, popModel: PopModelData, politics: Pick<PoliticsState, 'apportionment'>, year: number): number[] {
  const el = model.elections!;
  const seats = politics.apportionment[model.legislature.chambers[0]!.id]!;
  const region = popModel.attributes.find((a) => a.role === 'region')!;
  return region.categories.map((c) => {
    const s = seats[c.id] ?? 0;
    const extra = (el.extraElectors ?? []).filter((x) => x.region === c.id && year >= x.from).reduce((t, x) => t + x.votes, 0);
    return (s > 0 ? s + el.electoralBonus : 0) + extra;
  });
}

/** The winner takes office: a new head of government gets a honeymoon and fresh capital; a re-elected one a shorter one. */
function inaugurate(model: PoliticsModelData, popModel: PopModelData, politics: PoliticsState, nation: NationState, winner: Nominee, terms: number): void {
  const op = model.opinion;
  if (winner.name === politics.leader.name) {
    politics.leader.termsWon = terms;
    politics.leader.honeymoon = Math.max(politics.leader.honeymoon, op.honeymoon / 2);
    politics.capital = Math.max(politics.capital, model.capital.newTerm);
  } else {
    politics.leader = { name: winner.name, party: winner.party, faction: winner.faction, termsWon: terms, quartersInOffice: 0, honeymoon: op.honeymoon };
    politics.capital = model.capital.newTerm;
    const label = model.legislature.parties.find((p) => p.id === winner.party)?.label ?? winner.party;
    nation.government.leader = { ...nation.government.leader, name: winner.name, party: label };
  }
  // Opinion turns around at once when the party in power changes.
  const levers = leverValues(nation.economy);
  politics.groups = groupStates(model, popModel, nation.pops!, politics, levers, nation.stats);
  politics.approval = nationalApproval(model, popModel, nation.pops!, approvalInputs(model, politics, levers));
}
