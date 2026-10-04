/**
 * Building a nation's starting pops from census tables.
 *
 * Iterative proportional fitting (IPF), the standard way demographers build a
 * synthetic population: start from a table of every combination of attributes,
 * shaped by the known associations (odds), then repeatedly rescale it until it
 * matches every census table at once. Associations the census tables do not
 * pin down survive the fitting unchanged.
 *
 * The result is deterministic: the same data always gives the same pops.
 */

import { codecFor, type PopCodec } from './codec';
import type { PopMarginData, PopModelData, PopsState } from './types';

const MAX_ITERATIONS = 300;
const TOLERANCE = 1e-7;
/** Sizes are kept to 1/100 of a person so save files stay compact. */
export const roundSize = (x: number) => Math.round(x * 100) / 100;

export interface MarginFit {
  id: string;
  /** Largest relative error over the margin's cells with a target of at least 0.1% of the total. */
  maxError: number;
}

export interface BuiltPops {
  keys: number[];
  size: number[];
  /** How well the final (sparse, scaled) pops still match each census table. */
  fit: MarginFit[];
  iterations: number;
}

interface ResolvedMargin {
  id: string;
  dims: number[];
  /** Margin cell index of every full cell. */
  map: Int32Array;
  target: Float64Array;
}

/** Mixed-radix index over a subset of attributes, for every full cell. */
function marginMap(codec: PopCodec, dims: number[]): { map: Int32Array; cells: number } {
  const strides: number[] = new Array(dims.length);
  let s = 1;
  for (let d = dims.length - 1; d >= 0; d--) {
    strides[d] = s;
    s *= codec.sizes[dims[d]!]!;
  }
  const map = new Int32Array(codec.cells);
  for (let key = 0; key < codec.cells; key++) {
    let m = 0;
    for (let d = 0; d < dims.length; d++) m += codec.get(key, dims[d]!) * strides[d]!;
    map[key] = m;
  }
  return { map, cells: s };
}

/** Reads a nested values object into a flat array over the margin's cells. */
function readValues(codec: PopCodec, margin: PopMarginData, dims: number[], cells: number): Float64Array {
  const out = new Float64Array(cells);
  const walk = (node: unknown, d: number, offset: number, stride: number) => {
    if (d === dims.length) {
      out[offset] = typeof node === 'number' ? node : 0;
      return;
    }
    const attr = codec.attributes[dims[d]!]!;
    const next = stride / attr.categories.length;
    const obj = (node ?? {}) as Record<string, unknown>;
    attr.categories.forEach((cat, i) => walk(obj[cat.id], d + 1, offset + i * next, next));
  };
  walk(margin.values, 0, 0, cells);
  return out;
}

/** Sums a resolved margin's targets down to a subset of its dimensions. */
function marginalise(codec: PopCodec, from: ResolvedMargin, to: number[]): Float64Array {
  const { map, cells } = marginMap(codec, to);
  const out = new Float64Array(cells);
  const seen = new Uint8Array(from.target.length);
  for (let key = 0; key < codec.cells; key++) {
    const m = from.map[key]!;
    if (seen[m]) continue;
    seen[m] = 1;
    out[map[key]!]! += from.target[m]!;
  }
  return out;
}

/**
 * Census targets for every margin cell. With `kept` (the combinations that
 * survive the threshold), shares that would fall on combinations with no pops
 * left are spread over the rest of their row first, and later tables are
 * conditioned on the adjusted totals, so the tables stay consistent.
 */
function resolveMargins(codec: PopCodec, model: PopModelData, kept?: number[]): ResolvedMargin[] {
  const resolved: ResolvedMargin[] = [];
  for (const margin of model.margins) {
    const dims = margin.dims.map((id) => codec.index[id]!);
    const { map, cells } = marginMap(codec, dims);
    const values = readValues(codec, margin, dims, cells);
    if (kept && margin.given.length > 0) {
      const supported = new Uint8Array(cells);
      for (const k of kept) supported[map[k]!] = 1;
      const rows = cells / dims.slice(margin.given.length).reduce((p, d) => p * codec.sizes[d]!, 1);
      const rest = cells / rows;
      for (let r = 0; r < rows; r++) {
        let all = 0;
        let ok = 0;
        for (let m = r * rest; m < (r + 1) * rest; m++) {
          all += values[m]!;
          if (supported[m]) ok += values[m]!;
        }
        for (let m = r * rest; m < (r + 1) * rest; m++) values[m] = supported[m] && ok > 0 ? (values[m]! * all) / ok : 0;
      }
    }
    let target = values;
    if (margin.given.length > 0) {
      const given = margin.given.map((id) => codec.index[id]!);
      const source = resolved.find((r) => given.every((g) => r.dims.includes(g)));
      if (!source) throw new Error(`pop model ${model.id}: margin "${margin.id}" is conditional on attributes no earlier table covers`);
      const totals = marginalise(codec, source, given);
      // The given attributes come first in `dims`, so each margin cell's given cell is a prefix.
      const rest = cells / totals.length;
      target = new Float64Array(cells);
      for (let m = 0; m < cells; m++) target[m] = values[m]! * totals[Math.floor(m / rest)]!;
    }
    resolved.push({ id: margin.id, dims, map, target });
  }
  return resolved;
}

function seedTable(codec: PopCodec, model: PopModelData): Float64Array {
  const table = new Float64Array(codec.cells).fill(1);
  for (const assoc of model.associations) {
    const a = codec.index[assoc.dims[0]]!;
    const b = codec.index[assoc.dims[1]]!;
    const odds = codec.attributes[a]!.categories.map((ca) =>
      codec.attributes[b]!.categories.map((cb) => assoc.odds[ca.id]?.[cb.id] ?? 1),
    );
    for (let key = 0; key < codec.cells; key++) table[key]! *= odds[codec.get(key, a)]![codec.get(key, b)]!;
  }
  return table;
}

function fitErrors(margins: ResolvedMargin[], sum: (m: ResolvedMargin) => Float64Array, total: number, scale: number): MarginFit[] {
  return margins.map((m) => {
    const current = sum(m);
    let maxError = 0;
    m.target.forEach((t, i) => {
      const target = t * scale;
      if (target < total * 0.001) return;
      maxError = Math.max(maxError, Math.abs(current[i]! - target) / target);
    });
    return { id: m.id, maxError };
  });
}

const builtCache = new Map<string, BuiltPops>();

/** Fits the census tables, scales to `total` people and drops combinations below the threshold. */
export function buildPops(model: PopModelData, total: number): BuiltPops {
  const cacheKey = `${model.id}:${total}`;
  const cached = builtCache.get(cacheKey);
  if (cached) return { ...cached, keys: cached.keys.slice(), size: cached.size.slice() };

  const codec = codecFor(model);
  const margins = resolveMargins(codec, model);
  const table = seedTable(codec, model);

  let iterations = 0;
  const sums = margins.map((m) => new Float64Array(m.target.length));
  for (; iterations < MAX_ITERATIONS; iterations++) {
    let worst = 0;
    margins.forEach((m, k) => {
      const s = sums[k]!.fill(0);
      for (let key = 0; key < codec.cells; key++) s[m.map[key]!]! += table[key]!;
      const factor = new Float64Array(s.length);
      for (let i = 0; i < s.length; i++) {
        const t = m.target[i]!;
        factor[i] = s[i]! > 0 ? t / s[i]! : 0;
        if (t > 0) worst = Math.max(worst, Math.abs(s[i]! - t) / t);
      }
      for (let key = 0; key < codec.cells; key++) table[key]! *= factor[m.map[key]!]!;
    });
    if (worst < TOLERANCE) break;
  }

  // Scale to the nation's population at the start date.
  let fitted = 0;
  for (let key = 0; key < codec.cells; key++) fitted += table[key]!;
  const scale = total / fitted;

  // Drop combinations below the threshold, then refit the census tables on the
  // combinations that remain, so the dropped people are spread where the tables
  // say they belong rather than lost.
  const kept: number[] = [];
  for (let key = 0; key < codec.cells; key++) if (table[key]! * scale >= model.threshold) kept.push(key);
  const values = Float64Array.from(kept, (k) => table[k]!);
  const keptMargins = resolveMargins(codec, model, kept);
  const keptMaps = keptMargins.map((m) => Int32Array.from(kept, (k) => m.map[k]!));
  for (let it = 0; it < MAX_ITERATIONS; it++) {
    let worst = 0;
    keptMargins.forEach((m, k) => {
      const s = sums[k]!.fill(0);
      const map = keptMaps[k]!;
      for (let i = 0; i < kept.length; i++) s[map[i]!]! += values[i]!;
      const factor = new Float64Array(s.length);
      for (let i = 0; i < s.length; i++) {
        const t = m.target[i]!;
        factor[i] = s[i]! > 0 ? t / s[i]! : 0;
        if (t > 0 && s[i]! > 0) worst = Math.max(worst, Math.abs(s[i]! - t) / t);
      }
      for (let i = 0; i < kept.length; i++) values[i]! *= factor[map[i]!]!;
    });
    if (worst < TOLERANCE) break;
  }
  let keptTotal = 0;
  for (const v of values) keptTotal += v;
  const keys: number[] = [];
  const size: number[] = [];
  kept.forEach((k, i) => {
    keys.push(k);
    size.push(roundSize((values[i]! * total) / keptTotal));
  });

  const sparse = new Float64Array(codec.cells);
  keys.forEach((k, i) => (sparse[k] = size[i]!));
  const fit = fitErrors(
    margins,
    (m) => {
      const s = new Float64Array(m.target.length);
      for (let k = 0; k < keys.length; k++) s[m.map[keys[k]!]!]! += size[k]!;
      return s;
    },
    total,
    scale,
  );

  const built: BuiltPops = { keys, size, fit, iterations };
  builtCache.set(cacheKey, built);
  return { ...built, keys: keys.slice(), size: size.slice() };
}

/** A nation's pop state at the start of a game. */
export function initialPopsState(model: PopModelData, total: number): PopsState {
  const built = buildPops(model, total);
  return {
    model: model.id,
    keys: built.keys,
    size: built.size,
    fertilityScale: 1,
    mortalityScale: 1,
    quarters: 0,
    expectedLiving: 0,
    baseLiving: 0,
    baseRatio: 1,
    youngShare0: 0,
    womenWork0: 0,
    ageProfile: [],
    birthsThisYear: 0,
    labourForce: 0,
    previousLabourForce: 0,
  };
}
