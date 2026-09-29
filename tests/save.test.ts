import { describe, expect, it } from 'vitest';
import { content } from '../src/sim/loadContent';
import { SAVE_FORMAT, deserializeGame, serializeGame } from '../src/sim/save';
import { SCHEMA_VERSION } from '../src/sim/schema';
import { advanceTurn, stateChecksum } from '../src/sim/turn';
import { createGame } from '../src/sim/world';

describe('save and load', () => {
  // The Phase 1 gate from the GDD roadmap: "one turn saves and reloads".
  it('PHASE 1 GATE: a played turn saves, reloads identically, and continues identically', () => {
    const afterOneTurn = advanceTurn(createGame(content, 'usa-1949', 'gate-test'));
    const reloaded = deserializeGame(serializeGame(afterOneTurn, '2026-09-29T23:00:00Z'), content);

    expect(reloaded).toEqual(afterOneTurn);
    expect(stateChecksum(reloaded)).toBe(stateChecksum(afterOneTurn));

    // Playing on from the reloaded save must give exactly the same future.
    let original = afterOneTurn;
    let fromSave = reloaded;
    for (let i = 0; i < 8; i++) {
      original = advanceTurn(original);
      fromSave = advanceTurn(fromSave);
    }
    expect(stateChecksum(fromSave)).toBe(stateChecksum(original));
  });

  it('rejects files that are not saves, with a readable message', () => {
    expect(() => deserializeGame('not json', content)).toThrow(/not valid JSON/);
    expect(() => deserializeGame('{"hello":"world"}', content)).toThrow(/not a Cold War Grand Strategy save/);
  });

  it('rejects saves from a newer version of the game', () => {
    const text = JSON.stringify({ format: SAVE_FORMAT, schemaVersion: SCHEMA_VERSION + 1, state: {} });
    expect(() => deserializeGame(text, content)).toThrow(/newer version/);
  });

  it('rejects damaged saves', () => {
    const text = JSON.stringify({ format: SAVE_FORMAT, schemaVersion: SCHEMA_VERSION, state: { seed: 'x' } });
    expect(() => deserializeGame(text, content)).toThrow(/damaged/);
  });

  it('upgrades a Phase 1 (schema 1) save by adding the economy', () => {
    const modern = advanceTurn(createGame(content, 'usa-1949', 'old-save'));
    const old = structuredClone(modern) as unknown as Record<string, any>;
    for (const nation of Object.values(old.nations as Record<string, any>)) {
      delete nation.economy;
      for (const id of ['gdp_real', 'interest_rate', 'debt_to_gdp']) {
        delete nation.stats[id];
        delete nation.statProvenance[id];
      }
    }
    old.schemaVersion = 1;
    const text = JSON.stringify({ format: SAVE_FORMAT, schemaVersion: 1, state: old });

    const upgraded = deserializeGame(text, content);
    expect(upgraded.schemaVersion).toBe(SCHEMA_VERSION);
    expect(upgraded.nations.usa!.economy).toBeDefined();
    expect(upgraded.nations.usa!.stats.gdp_real).toBeDefined();
    expect(upgraded.nations.ussr!.economy).toBeUndefined();
    expect(() => advanceTurn(upgraded)).not.toThrow();
  });
});
