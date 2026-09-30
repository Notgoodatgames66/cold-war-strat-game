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

  it('upgrades a Phase 2B (schema 3) save by replaying the Soviet economy through the quarters already played', () => {
    let modern = createGame(content, 'usa-1949', 'phase-2b-save');
    for (let i = 0; i < 12; i++) modern = advanceTurn(modern, i === 0 ? { budget: { defence: 30 } } : {});
    const old = structuredClone(modern) as unknown as Record<string, any>;
    delete old.nations.usa.economy.engine;
    delete old.nations.ussr.economy;
    for (const id of ['gdp_real', 'real_growth', 'industrial_output', 'savings_overhang', 'defence_spending', 'consumer_shortage']) {
      delete old.nations.ussr.stats[id];
      delete old.nations.ussr.statProvenance[id];
    }
    old.history = old.history.map((h: Record<string, any>) => ({
      date: h.date,
      stats: { usa: h.stats.usa, ussr: { steel_output: 23.3, population: h.stats.ussr.population } },
      sectors: { usa: h.sectors.usa },
    }));
    const text = JSON.stringify({ format: SAVE_FORMAT, schemaVersion: 3, state: { ...old, schemaVersion: 3 } });

    const upgraded = deserializeGame(text, content);
    expect(upgraded.nations.usa!.economy?.engine).toBe('keynesian');
    expect(upgraded.nations.ussr!.economy?.engine).toBe('planned');
    // The replay reproduces exactly what a game that always had the Soviet economy would show.
    expect(upgraded.nations.ussr!.stats.gdp_real).toBeCloseTo(modern.nations.ussr!.stats.gdp_real!, 9);
    expect(upgraded.history.at(-1)!.stats.ussr!.steel_output).toBeCloseTo(modern.history.at(-1)!.stats.ussr!.steel_output!, 9);
    expect(upgraded.history[5]!.sectors?.ussr?.heavy_industry?.output).toBeGreaterThan(0);
    expect(() => advanceTurn(upgraded)).not.toThrow();
  });

  it('upgrades a Phase 2A (schema 2) save by adding industry, keeping potential output unchanged', () => {
    let modern = createGame(content, 'usa-1949', 'phase-2a-save');
    for (let i = 0; i < 9; i++) modern = advanceTurn(modern, i === 0 ? { budget: { defence: 20 } } : {});
    const old = structuredClone(modern) as unknown as Record<string, any>;
    const e = old.nations.usa.economy;
    delete e.industry;
    e.importPropensity = (9.7 / 272.5) * 1.02;
    delete e.params.capital_share;
    e.params.potential_growth = 0.032;
    delete old.nations.usa.stats.industrial_output;
    old.history = old.history.map(({ date, stats }: Record<string, unknown>) => ({ date, stats }));
    const text = JSON.stringify({ format: SAVE_FORMAT, schemaVersion: 2, state: { ...old, schemaVersion: 2 } });

    const upgraded = deserializeGame(text, content);
    const ind = upgraded.nations.usa!.economy!.industry;
    expect(ind.sectors).toHaveLength(7);
    expect(upgraded.nations.usa!.economy!.params.capital_share).toBe(0.3);
    expect(upgraded.nations.usa!.stats.industrial_output).toBeDefined();
    expect(ind.importIndex).toBeCloseTo(1.02, 9);
    expect(upgraded.nations.usa!.economy!.potential).toBeCloseTo(modern.nations.usa!.economy!.potential, 9);

    const next = advanceTurn(upgraded);
    const gap = (next.nations.usa!.economy!.gdpReal / next.nations.usa!.economy!.potential - 1) * 100;
    expect(Math.abs(gap)).toBeLessThan(8);
    expect(next.history.at(-1)!.sectors?.usa).toBeDefined();
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
    expect(upgraded.nations.ussr!.economy?.engine).toBe('planned');
    expect(() => advanceTurn(upgraded)).not.toThrow();
  });
});
