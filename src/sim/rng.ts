/**
 * Seeded random numbers.
 *
 * RULE: the simulation never calls Math.random(). Every random draw comes from
 * a stream derived from (world seed, turn number, stream name). Each system
 * asks for its own named stream each turn, so adding a new dice roll in one
 * system never shifts the rolls of any other system. That keeps whole
 * histories reproducible as the game grows: same seed + same choices = same
 * world, every time.
 */

export type Seed4 = [number, number, number, number];

/** cyrb128: hashes a string into four 32-bit numbers. */
export function hash128(input: string): Seed4 {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < input.length; i++) {
    const k = input.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** sfc32: a small, fast, well-tested generator. Returns floats in [0, 1). */
function sfc32([seedA, seedB, seedC, seedD]: Seed4): () => number {
  let a = seedA | 0;
  let b = seedB | 0;
  let c = seedC | 0;
  let d = seedD | 0;
  return () => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

export interface WeightedOption<T> {
  item: T;
  weight: number;
}

export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
  /** True with probability p (0–1). */
  chance(p: number): boolean;
  /** One item, uniformly. */
  pick<T>(items: readonly T[]): T;
  /** One item, in proportion to its weight. Used for probability tables. */
  weighted<T>(options: readonly WeightedOption<T>[]): T;
  /** Normally distributed number (Box–Muller). */
  normal(mean: number, sd: number): number;
}

export function rngFromSeed(seed: Seed4): Rng {
  const raw = sfc32(seed);
  // Discard the first outputs so similar seeds diverge quickly.
  for (let i = 0; i < 15; i++) raw();

  const rng: Rng = {
    next: raw,
    int(min, max) {
      if (max < min) throw new RangeError(`int(): max ${max} is below min ${min}`);
      return min + Math.floor(raw() * (max - min + 1));
    },
    chance(p) {
      return raw() < p;
    },
    pick(items) {
      if (items.length === 0) throw new RangeError('pick(): empty list');
      return items[Math.floor(raw() * items.length)] as (typeof items)[number];
    },
    weighted(options) {
      const total = options.reduce((sum, o) => sum + Math.max(0, o.weight), 0);
      if (total <= 0) throw new RangeError('weighted(): weights must sum to more than zero');
      let roll = raw() * total;
      let lastWithWeight = options[0] as (typeof options)[number];
      for (const option of options) {
        if (option.weight <= 0) continue;
        lastWithWeight = option;
        roll -= option.weight;
        if (roll < 0) return option.item;
      }
      // Floating-point edge case: the roll landed exactly on the total.
      return lastWithWeight.item;
    },
    normal(mean, sd) {
      let u = 0;
      while (u === 0) u = raw();
      const v = raw();
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
  };
  return rng;
}

/**
 * The stream a system uses on a given turn, e.g. createRng(seed, 12, 'events').
 */
export function createRng(worldSeed: string, turn: number, stream: string): Rng {
  return rngFromSeed(hash128(`${worldSeed}|${turn}|${stream}`));
}
