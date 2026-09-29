import { describe, expect, it } from 'vitest';
import { compareDates, formatDate, formatDateLong, nextQuarter, quartersBetween } from '../src/sim/time';

describe('game time', () => {
  it('advances one quarter at a time and rolls over the year', () => {
    expect(nextQuarter({ year: 1949, quarter: 1 })).toEqual({ year: 1949, quarter: 2 });
    expect(nextQuarter({ year: 1949, quarter: 4 })).toEqual({ year: 1950, quarter: 1 });
  });

  it('counts 208 turns from Q1 1949 to Q4 2000 inclusive', () => {
    expect(quartersBetween({ year: 1949, quarter: 1 }, { year: 2000, quarter: 4 }) + 1).toBe(208);
  });

  it('compares dates', () => {
    expect(compareDates({ year: 1950, quarter: 1 }, { year: 1949, quarter: 4 })).toBeGreaterThan(0);
    expect(compareDates({ year: 1949, quarter: 2 }, { year: 1949, quarter: 2 })).toBe(0);
  });

  it('formats dates', () => {
    expect(formatDate({ year: 1949, quarter: 1 })).toBe('Q1 1949');
    expect(formatDateLong({ year: 1962, quarter: 4 })).toBe('October–December 1962');
  });
});
