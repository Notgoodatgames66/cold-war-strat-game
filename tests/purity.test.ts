import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Guard rails for determinism. The simulation must never read the clock or
 * use unseeded randomness, or saves, shared seeds and Monte Carlo testing
 * all break.
 */

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

/** Source code with comments removed, so explanations that mention a banned call don't trip the check. */
function codeOnly(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\s\/\/\s.*$/gm, '');
}

const FORBIDDEN: [RegExp, string][] = [
  [/Math\.random\s*\(/, 'Math.random() — use createRng() from rng.ts'],
  [/Date\.now\s*\(/, 'Date.now() — the simulation must not read the clock'],
  [/new Date\s*\(/, 'new Date() — the simulation must not read the clock'],
  [/performance\.now\s*\(/, 'performance.now() — timing belongs in the interface'],
];

describe('simulation purity', () => {
  const simDir = fileURLToPath(new URL('../src/sim', import.meta.url));
  const simFiles = filesUnder(simDir).filter((f) => f.endsWith('.ts'));

  it('finds the simulation source files', () => {
    expect(simFiles.length).toBeGreaterThan(5);
  });

  for (const [pattern, why] of FORBIDDEN) {
    it(`never uses ${why.split(' —')[0]}`, () => {
      const offenders = simFiles.filter((f) => pattern.test(codeOnly(f)));
      expect(offenders, `Forbidden in src/sim: ${why}`).toEqual([]);
    });
  }
});
