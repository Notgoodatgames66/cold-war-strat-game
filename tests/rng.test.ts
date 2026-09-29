import { describe, expect, it } from 'vitest';
import { createRng, hash128 } from '../src/sim/rng';

describe('seeded random numbers', () => {
  it('gives the same sequence for the same seed, turn and stream', () => {
    const a = createRng('truman-1949', 5, 'events');
    const b = createRng('truman-1949', 5, 'events');
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('gives different sequences for different seeds, turns or streams', () => {
    const first = (seed: string, turn: number, stream: string) => createRng(seed, turn, stream).next();
    const base = first('truman-1949', 5, 'events');
    expect(first('dewey-1949', 5, 'events')).not.toBe(base);
    expect(first('truman-1949', 6, 'events')).not.toBe(base);
    expect(first('truman-1949', 5, 'strikes')).not.toBe(base);
  });

  it('keeps floats in [0, 1) and integers within bounds', () => {
    const rng = createRng('bounds', 1, 'test');
    for (let i = 0; i < 10_000; i++) {
      const f = rng.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = rng.int(3, 7);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
      expect(Number.isInteger(n)).toBe(true);
    }
  });

  it('is roughly uniform', () => {
    const rng = createRng('uniform', 1, 'test');
    const buckets = new Array(10).fill(0) as number[];
    const draws = 100_000;
    for (let i = 0; i < draws; i++) buckets[Math.floor(rng.next() * 10)]! += 1;
    for (const count of buckets) expect(Math.abs(count - draws / 10)).toBeLessThan(draws * 0.01);
  });

  it('weighted() follows the probability table', () => {
    // The GDD's French election example: 75 / 20 / 4 / 1.
    const rng = createRng('election', 1, 'france');
    const table = [
      { item: 'favourite', weight: 75 },
      { item: 'opponent', weight: 20 },
      { item: 'dark horse', weight: 4 },
      { item: 'coup', weight: 1 },
    ];
    const counts: Record<string, number> = { favourite: 0, opponent: 0, 'dark horse': 0, coup: 0 };
    const draws = 100_000;
    for (let i = 0; i < draws; i++) counts[rng.weighted(table)]! += 1;
    expect(counts.favourite! / draws).toBeCloseTo(0.75, 2);
    expect(counts.opponent! / draws).toBeCloseTo(0.2, 2);
    expect(counts['dark horse']! / draws).toBeCloseTo(0.04, 2);
    expect(counts.coup! / draws).toBeCloseTo(0.01, 2);
  });

  it('weighted() never picks a zero-weight option', () => {
    const rng = createRng('zero', 1, 'test');
    for (let i = 0; i < 5_000; i++) {
      expect(rng.weighted([{ item: 'never', weight: 0 }, { item: 'always', weight: 1 }])).toBe('always');
    }
  });

  it('normal() has roughly the requested mean and spread', () => {
    const rng = createRng('normal', 1, 'test');
    const xs = Array.from({ length: 50_000 }, () => rng.normal(10, 2));
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length);
    expect(mean).toBeCloseTo(10, 1);
    expect(sd).toBeCloseTo(2, 1);
  });

  it('hash128 is stable', () => {
    expect(hash128('cold war')).toEqual(hash128('cold war'));
    expect(hash128('cold war')).not.toEqual(hash128('cold wax'));
  });
});
