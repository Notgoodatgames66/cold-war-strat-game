/**
 * State fingerprints.
 *
 * The checksum turns a whole game state into a short code. If two runs with
 * the same seed and the same choices ever produce different checksums, the
 * simulation has stopped being deterministic, which is a bug.
 */

import { hash128 } from './rng';

const f64 = new Float64Array(1);
const u32 = new Uint32Array(f64.buffer);
/** Arrays of numbers at least this long (pops) are digested directly instead of written out as text. */
const LONG_NUMERIC = 256;

/** A fast fingerprint of a long array of numbers, from their exact bit patterns. */
function digestNumbers(values: number[]): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ values.length;
  for (let i = 0; i < values.length; i++) {
    f64[0] = values[i]!;
    h1 = Math.imul(h1 ^ u32[0]!, 0x01000193);
    h2 = Math.imul(h2 ^ u32[1]!, 0x85ebca6b) ^ (h1 >>> 15);
  }
  return `#${values.length}:${(h1 >>> 0).toString(16)}${(h2 >>> 0).toString(16)}`;
}

const isLongNumeric = (v: unknown[]): v is number[] => v.length >= LONG_NUMERIC && v.every((x) => typeof x === 'number');

/** JSON with object keys sorted, so identical data always gives identical text. */
export function canonicalStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (Array.isArray(v) && isLongNumeric(v)) return digestNumbers(v);
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>).sort()) {
        sorted[k] = (v as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return v;
  });
}

/** A 16-character hex fingerprint of any JSON-safe value. */
export function checksum(value: unknown): string {
  const [a, b] = hash128(canonicalStringify(value));
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}
