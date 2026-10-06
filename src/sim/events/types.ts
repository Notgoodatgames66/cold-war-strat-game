/**
 * Events: hand-authored moments with triggers, odds that respond to the
 * world, and effects. See docs/models/events.md.
 *
 * Content lives in data/events/*.json. Each file may hold `meters` (pressure
 * gauges such as the Red Scare) and `events`.
 *
 * Dates in data files are written "1949-Q3".
 */

import type { Provenance } from '../schema';

export const EVENT_TIERS = ['super', 'major', 'minor', 'news'] as const;
/** super = full-screen · major = card with options · minor = telegram or cable · news = a headline. */
export type EventTier = (typeof EVENT_TIERS)[number];

/** Most events of each tier that can fire in one quarter (GDD: about one major, a few minor, a page of news). */
export const TIER_CAP: Record<EventTier, number> = { super: 1, major: 2, minor: 2, news: 3 };

export const MODIFIER_CURVES = ['flat', 'decay', 'ramp'] as const;
/**
 * flat  = full value for `duration` quarters (for ever without one);
 * decay = full value, falling in a straight line to nothing over `duration`;
 * ramp  = rising in a straight line to full value over `duration`, then kept for ever.
 */
export type ModifierCurve = (typeof MODIFIER_CURVES)[number];

/**
 * What a modifier changes:
 *  approval         log-odds of every pop's approval of the head of government
 *  group:<id>       log-odds of an interest group's approval
 *  bill:<lever>     log-odds of every faction voting for a bill on that lever ("bill:budget:defence")
 *  consumption      share added to households' desired spending (0.03 = +3%)
 *  investment       share added to firms' desired fixed investment
 *  exports          share added to export demand
 *  inflation        points added to inflation
 */
export const MODIFIER_TARGETS = ['approval', 'consumption', 'investment', 'exports', 'inflation'] as const;
export const MODIFIER_PREFIXES = ['group:', 'bill:'] as const;

export interface ModifierSpec {
  target: string;
  value: number;
  /** Quarters; required for decay and ramp. */
  duration?: number;
  curve?: ModifierCurve;
}

/** A condition on the world. A list of conditions means all of them. */
export type Condition =
  | { after: string }
  | { before: string }
  | { flag: string }
  | { notFlag: string }
  | { fired: string }
  | { notFired: string }
  | { chose: string; option: string }
  | { quartersSince: string; atLeast?: number; atMost?: number }
  | { stat: string; nation?: string; above?: number; below?: number }
  | { meter: string; above?: number; below?: number }
  | { leaderParty: string }
  | { monetaryRegime: string }
  | { priceControls: boolean }
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition };

export type Effect =
  | { flag: string }
  | { clearFlag: string }
  | { meter: string; add: number }
  | { modifier: ModifierSpec }
  /** Political capital, added (negative to spend). */
  | { capital: number }
  /** An emergency change to a budget target that bypasses the legislature. */
  | { budget: string; multiply?: number; add?: number }
  /** A change to a stat no system calculates yet (warheads, personnel). */
  | { stat: string; nation?: string; add?: number; set?: number }
  | { monetaryRegime: string }
  | { priceControls: boolean }
  /** Fires another event after `delay` quarters (1 = next quarter), if its triggers still hold. */
  | { queue: string; delay: number };

export interface EventOption {
  id: string;
  label: string;
  /** What the choice means, in a sentence or two. */
  description: string;
  effects: Effect[];
  /** The option taken when nobody chooses (the historical choice). Exactly one per event. */
  default?: boolean;
  /** Only offered when this holds. */
  requires?: Condition[];
  /** Weight with which an AI nation picks this option (default 1). */
  aiWeight?: number;
}

export interface EventData {
  id: string;
  tier: EventTier;
  /** The nation the event happens to (who chooses). */
  nation: string;
  /** Historical anchors: the quarters in which it can fire, "1949-Q3". */
  window?: { from?: string; to?: string };
  /** All must hold for the event to be eligible. */
  triggers: Condition[];
  /** Chance of firing in an eligible quarter: base × every modifier whose condition holds, at most 1. */
  chance: { base: number; modifiers?: { if: Condition[]; multiply: number }[] };
  /** Pool events can recur, with at least `cooldown` quarters between firings. */
  repeatable?: boolean;
  cooldown?: number;
  /** Presentation. */
  kicker: string;
  headline: string;
  paragraphs: string[];
  quote?: { text: string; source: string };
  /** Effects the moment it fires. */
  effects?: Effect[];
  /** Choices for the nation. None = the event simply happens (a headline). */
  options?: EventOption[];
  provenance: Provenance;
  note: string;
}

export interface MeterData {
  id: string;
  label: string;
  description: string;
  min: number;
  max: number;
  start: number;
  /** Share of the meter's level lost each quarter (pressure fades unless fed). */
  decay: number;
  /** Change each quarter while a condition holds. */
  drift?: { if: Condition[]; add: number }[];
  /** Continuous effects: the meter's level × perPoint, on a modifier target, for a nation. */
  effects?: { target: string; nation: string; perPoint: number }[];
  provenance: Provenance;
  note: string;
}

export interface EventContent {
  meters: MeterData[];
  /** In a fixed order (by id), so rolls never depend on file order. */
  events: EventData[];
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface Modifier {
  /** The event (or event and option) that created it. */
  source: string;
  nation: string;
  target: string;
  value: number;
  /** Turn of the quarter in which it begins. */
  start: number;
  duration?: number;
  curve: ModifierCurve;
}

/** An event waiting for a nation's choice. */
export interface PendingEvent {
  /** Unique key: "<event id>@<turn>". */
  key: string;
  event: string;
  turn: number;
}

/** The record of an event: when it fired and what was chosen. */
export interface EventRecord {
  key: string;
  event: string;
  nation: string;
  turn: number;
  /** The option taken, once chosen; and whether it was the default because nobody chose. */
  option?: string;
  defaulted?: boolean;
}

export interface EventsState {
  /** False in sandbox games (and some tests): no meters move and no events fire. */
  enabled: boolean;
  /** World flags: name → turn set. */
  flags: Record<string, number>;
  meters: Record<string, number>;
  modifiers: Modifier[];
  pending: PendingEvent[];
  /** Events queued by other events: due turn and event id. */
  queued: { event: string; turn: number; source: string }[];
  /** Every event that fired, in order. */
  record: EventRecord[];
}
