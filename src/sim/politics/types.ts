/**
 * Politics: opinion of the government, interest groups, the legislature,
 * political capital and elections.
 *
 * Like pops, politics uses one structure for every nation; what differs is
 * data (data/politics/*.json). A model refers to its nation's pop attributes
 * and categories by id. See docs/models/politics.md.
 *
 * Levers are named "budget:<line>", "tax:<line>" or "indexation".
 */

import type { Provenance, SourceRef } from '../schema';

/** Log-point (log-odds) effects by pop attribute and category: effects[attribute][category]. */
export type AttributeEffects = Record<string, Record<string, number>>;

/** Multipliers by pop attribute and category; unlisted categories use `defaults[attribute]` (or 1). */
export interface AttributeFactors {
  factors: Record<string, Record<string, number>>;
  /** Value for categories an attribute's factor table does not list (default 1). */
  defaults?: Record<string, number>;
  /** Multipliers by the region attribute's group (e.g. census division). */
  regionGroups?: Record<string, number>;
}

/** A two-attribute interaction: an extra effect for pops with both categories. */
export interface Interaction {
  /** [attribute, category] pairs; a category list matches any of them. */
  when: [string, string | string[]][];
  effect: number;
  note: string;
}

export interface VotingData {
  /** Share of each age band old enough to vote. */
  ageShare: Record<string, number>;
  /** Share of eligible adults allowed to register, by attribute × category × region (disenfranchisement). */
  franchise: Record<string, Record<string, Record<string, number>>>;
  /** Turnout of the enfranchised: a base rate times multipliers. */
  turnout: { base: number } & AttributeFactors;
  note: string;
}

export interface OpinionData {
  /** Approval of the head of government at the start (percent), for calibration. */
  startApproval: number;
  /** Party leaning by attribute: log-odds towards the first party in `legislature.parties`. */
  partisan: AttributeEffects;
  partisanInteractions: Interaction[];
  /** How strongly party leaning colours approval of a president of either party. */
  partisanWeight: number;
  economy: {
    /** Log-odds per point of unemployment above `unemploymentRef`. */
    unemployment: number;
    unemploymentRef: number;
    /** Log-odds per point of inflation above `inflationRef`, and per point of deflation below −`deflationRef`. */
    inflation: number;
    inflationRef: number;
    deflation: number;
    deflationRef: number;
    /** Log-odds per percent of yearly growth in real household consumption per head. */
    growth: number;
    /** Share of last quarter's smoothed conditions carried into this quarter (opinion has memory). */
    memory: number;
    /** Group sensitivity multipliers: sensitivity[condition][attribute][category]. */
    sensitivity: Record<string, Record<string, Record<string, number>>>;
  };
  /** Log-odds lost per quarter in office (the slow cost of governing). */
  termDecay: number;
  /** Log-odds boost after an inauguration, and the share of it kept each quarter. */
  honeymoon: number;
  honeymoonKeep: number;
  /** Pocketbook effects of policy on each group: policies[lever][attribute][category], log-odds per unit of change. */
  policies: Record<string, AttributeEffects>;
  provenance: Provenance;
  note: string;
}

export interface InterestGroupData {
  id: string;
  label: string;
  description: string;
  /** Share of each pop that belongs: base × factors, capped at 1. */
  membership: { base: number } & AttributeFactors;
  /** Organisation 0–1 at the start (unions, lobbies, churches, mass movements). */
  organisation: number;
  /** Lock-in: membership and organisation grow with a lever's level: × (level ÷ start)^elasticity. */
  lockIn?: { lever: string; elasticity: number };
  /** Party the group leans to (id), and how strongly (log-odds of approval when that party governs). */
  party?: string;
  partyLean: number;
  /** Approval of the government at the start (percent), for calibration. */
  startApproval: number;
  /** What the group wants: log-odds of approval per unit of change in each lever (+ = wants more). */
  preferences: Record<string, number>;
  /** How the group's approval responds to national conditions: stat id → log-odds per point away from its start. */
  conditions: Record<string, number>;
  provenance: Provenance;
  note: string;
}

export interface PartyData {
  id: string;
  /** Adjective, e.g. "Democratic". */
  label: string;
  /** What its members are called, e.g. "Democrats". */
  members: string;
}

export interface FactionData {
  id: string;
  label: string;
  party: string;
  description: string;
  /** Seats at the start, by chamber id. */
  seats: Record<string, number>;
  /** Which region the faction's seats come from: "core" (the `coreRegions`) or "rest". */
  base: 'core' | 'rest';
  /** How much the faction listens to each interest group (weights). */
  groups: Record<string, number>;
  /** The faction's own leaning on each lever, added to its groups' (+ = favours increases). */
  stances: Record<string, number>;
}

export interface LegislatureData {
  label: string;
  parties: PartyData[];
  chambers: { id: string; label: string; seats: number; /** Share of seats up at each election (1 = all). */ upShare: number }[];
  factions: FactionData[];
  /** Regions (pop region category ids) whose seats form the "core" bloc, e.g. the Solid South. */
  coreRegions: string[];
  /** Seats each region holds in each chamber at the start (House apportionment; two senators each). */
  seatsByRegion: Record<string, Record<string, number>>;
  bills: {
    /** How strongly factions react to a bill's content (× preference × size of change). */
    salience: number;
    /** Resistance to any change, per unit of its size. */
    statusQuo: number;
    /** Log-odds for factions of the head of government's party, and against for the opposition. */
    loyalty: number;
    opposition: number;
    /** Extra loyalty from the head of government's own faction. */
    ownFaction: number;
    /** Log-odds per point of the head of government's approval above 50%. */
    approvalPull: number;
    /** Log-odds per point of approval above 50% among the faction's interest groups. */
    groupPull: number;
    /** Log-odds added to every faction per point of political capital spent. */
    capitalPerPoint: number;
    /** Uncertainty in the vote count (share of seats, one standard deviation). */
    whipUncertainty: number;
    provenance: Provenance;
    note: string;
  };
}

export interface CapitalData {
  start: number;
  max: number;
  /** Regeneration per quarter: base + approvalRate × (approval − 50%) / 100. */
  base: number;
  approvalRate: number;
  /** Capital lost when one of your bills fails. */
  failurePenalty: number;
  /** Capital won when a bill passes, × the chance it had of failing (unlikely wins pay most). */
  victoryBonus: number;
  /** Capital after an inauguration. */
  newTerm: number;
  note: string;
}

export interface NomineeData {
  name: string;
  party: string;
  /** Faction the nominee belongs to, if any. */
  faction?: string;
  /** Personal appeal: log-odds added to the nominee's party vote. */
  appeal: number;
}

export interface ElectionsData {
  /** Legislative elections: every N years, resolved in this quarter, from this year. */
  legislative: { every: number; quarter: number; first: number };
  executive: { every: number; quarter: number; first: number; /** Elected terms a head of government may win. */ maxTerms: number };
  /** Log-odds of the governing party's vote per point of approval above 50%. */
  approvalEffect: number;
  /** Log-odds lost by the governing party in legislative elections without an executive race. */
  midtermPenalty: number;
  /** Log-odds for an incumbent head of government running again. */
  incumbency: number;
  /** Seats-votes curve: seat log-odds = swingRatio × vote log-odds + calibrated bias. */
  swingRatio: number;
  /** Standard deviation of the national swing (log-odds), rolled with the seeded RNG. */
  noise: number;
  /** Standard deviation of each region's own swing on top of the national one (log-odds). */
  regionNoise: number;
  /** Incumbents run again only with at least this approval (percent). */
  retireBelow: number;
  /** Party vote two-party share at the start (calibration target for party leaning). */
  normalVote: number;
  /** Electoral votes: House seats plus this many per region, plus extra votes for regions without seats from a year. */
  electoralBonus: number;
  extraElectors?: { region: string; votes: number; from: number }[];
  /** Years after which seats are reapportioned from the pops (census years); takes effect at the next election. */
  censusYears: number[];
  /** Historical nominees by election year and party, best first. */
  nominees: Record<string, Record<string, NomineeData[]>>;
  provenance: Provenance;
  note: string;
}

export interface PoliticsModelData {
  id: string;
  nation: string;
  label: string;
  voting: VotingData;
  opinion: OpinionData;
  interestGroups: InterestGroupData[];
  legislature: LegislatureData;
  capital: CapitalData;
  /** Weights of the three parts of clout (GDD: clout = w1·wealth + w2·numbers + w3·organisation). */
  clout: { wealth: number; numbers: number; organisation: number };
  elections?: ElectionsData;
  /** The head of government at the start. */
  leader: { name: string; party: string; faction?: string; termsWon: number; quartersInOffice: number; honeymoon: number };
  verification: 'unchecked' | 'checked';
  sources: SourceRef[];
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface GroupState {
  id: string;
  /** People in the group. */
  members: number;
  /** Share of political clout (all groups sum to 1). */
  clout: number;
  /** Organisation 0–1 (after lock-in). */
  organisation: number;
  /** Approval of the government, 0–1. */
  approval: number;
}

export interface BillResult {
  lever: string;
  from: number;
  to: number;
  /** Chance of passing when it went to the floor, and the capital spent on it. */
  odds: number;
  capital: number;
  passed: boolean;
  /** Expected yes share by chamber. */
  votes: Record<string, number>;
  /** The count on the day, by chamber. */
  tally: Record<string, { yes: number; no: number }>;
}

export interface ElectionResult {
  year: number;
  kind: 'legislative' | 'executive';
  /** Seats by chamber and faction after the election, and the change. */
  seats: Record<string, Record<string, number>>;
  change: Record<string, Record<string, number>>;
  /** Two-party vote share of each party (first party's share). */
  vote: number;
  /** Executive races: the candidates, the winner and electoral votes. */
  candidates?: { name: string; party: string; electoral: number; vote: number }[];
  winner?: string;
  /** First-party share of the two-party vote by region (pop-model order; −1 where nobody voted). */
  regionVote?: number[];
}

export interface PoliticsState {
  model: string;
  /** National approval of the head of government, 0–1. */
  approval: number;
  capital: number;
  leader: { name: string; party: string; faction?: string; termsWon: number; quartersInOffice: number; honeymoon: number };
  /** Smoothed conditions opinion responds to. */
  mood: { unemployment: number; inflation: number; growth: number };
  groups: GroupState[];
  /** Seats by chamber id and faction id. */
  seats: Record<string, Record<string, number>>;
  /** Seats per region and chamber (apportionment). */
  apportionment: Record<string, Record<string, number>>;
  /** Share of the second party's non-core seats held by its first-listed faction (e.g. Taft wing). */
  factionSplit: Record<string, number>;
  /** Calibration constants set at the start. */
  calib: {
    approvalIntercept: number;
    voteIntercept: number;
    /** Seat bias by bloc ("core"/"rest") for the seats-votes curve. */
    seatBias: Record<string, number>;
    /** Group approval intercepts by group id. */
    groupIntercepts: Record<string, number>;
    /** Lever levels at the start. */
    levers0: Record<string, number>;
    /** Stat values at the start, for group conditions. */
    stats0: Record<string, number>;
    /** Real consumption per head a year ago (four quarters), for growth. */
    livingHistory: number[];
  };
  lastBills: BillResult[];
  elections: ElectionResult[];
}
