/**
 * State fingerprints.
 *
 * The checksum turns a whole game state into a short code. If two runs with
 * the same seed and the same choices ever produce different checksums, the
 * simulation has stopped being deterministic, which is a bug.
 */

import { hash128 } from './rng';

/** JSON with object keys sorted, so identical data always gives identical text. */
export function canonicalStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
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
