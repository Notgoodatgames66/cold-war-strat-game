/**
 * Game time. One turn is one quarter.
 */

export type Quarter = 1 | 2 | 3 | 4;

export interface GameDate {
  year: number;
  quarter: Quarter;
}

const QUARTER_MONTHS: Record<Quarter, string> = {
  1: 'January–March',
  2: 'April–June',
  3: 'July–September',
  4: 'October–December',
};

export function nextQuarter(date: GameDate): GameDate {
  return date.quarter === 4
    ? { year: date.year + 1, quarter: 1 }
    : { year: date.year, quarter: (date.quarter + 1) as Quarter };
}

/** Quarters elapsed from `from` to `to` (0 when equal, negative if `to` is earlier). */
export function quartersBetween(from: GameDate, to: GameDate): number {
  return (to.year - from.year) * 4 + (to.quarter - from.quarter);
}

export function compareDates(a: GameDate, b: GameDate): number {
  return quartersBetween(b, a);
}

export function sameDate(a: GameDate, b: GameDate): boolean {
  return a.year === b.year && a.quarter === b.quarter;
}

/** "Q1 1949" */
export function formatDate(date: GameDate): string {
  return `Q${date.quarter} ${date.year}`;
}

/** "January–March 1949" */
export function formatDateLong(date: GameDate): string {
  return `${QUARTER_MONTHS[date.quarter]} ${date.year}`;
}

export function isValidDate(value: unknown): value is GameDate {
  if (typeof value !== 'object' || value === null) return false;
  const d = value as Record<string, unknown>;
  return (
    typeof d.year === 'number' &&
    Number.isInteger(d.year) &&
    (d.quarter === 1 || d.quarter === 2 || d.quarter === 3 || d.quarter === 4)
  );
}
