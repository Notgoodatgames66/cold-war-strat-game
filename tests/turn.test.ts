import { describe, expect, it } from 'vitest';
import { content } from '../src/sim/loadContent';
import { advanceTurn, canAdvance, stateChecksum, totalTurns } from '../src/sim/turn';
import { createGame } from '../src/sim/world';
import type { GameState } from '../src/sim/schema';

const newGame = (seed = 'test-seed') => createGame(content, 'usa-1949', seed);

function play(state: GameState, turns: number): GameState {
  let current = state;
  for (let i = 0; i < turns; i++) current = advanceTurn(current);
  return current;
}

describe('new game', () => {
  it('starts at turn 1, Q1 1949, with starting figures from the data files', () => {
    const game = newGame();
    expect(game.turn).toBe(1);
    expect(game.date).toEqual({ year: 1949, quarter: 1 });
    expect(game.nations.usa!.stats.gdp_nominal).toBe(content.nations.usa!.stats.gdp_nominal!.value);
    expect(game.nations.ussr!.government.leader.name).toBe('Joseph Stalin');
    expect(game.history).toHaveLength(1);
    expect(totalTurns(game)).toBe(208);
  });

  it('uses the scenario default seed when none is given', () => {
    expect(createGame(content, 'usa-1949').seed).toBe('truman-1949');
    expect(createGame(content, 'usa-1949', '   ').seed).toBe('truman-1949');
  });
});

describe('turn loop', () => {
  it('advances the date and turn counter and records history', () => {
    const next = advanceTurn(newGame());
    expect(next.turn).toBe(2);
    expect(next.date).toEqual({ year: 1949, quarter: 2 });
    expect(next.history).toHaveLength(2);
    expect(next.log).toHaveLength(1);
  });

  it('never changes the state it was given', () => {
    const start = newGame();
    const before = JSON.stringify(start);
    play(start, 8);
    expect(JSON.stringify(start)).toBe(before);
  });

  it('is deterministic: same seed, same history', () => {
    const a = play(newGame('same'), 12);
    const b = play(newGame('same'), 12);
    expect(stateChecksum(a)).toBe(stateChecksum(b));
    expect(a.log.map((l) => l.checksum)).toEqual(b.log.map((l) => l.checksum));
  });

  it('runs yearly systems only when Q4 resolves (staggered updates)', () => {
    let game = newGame();
    const startPop = game.nations.usa!.stats.population!;
    for (let q = 1; q <= 3; q++) {
      game = advanceTurn(game);
      expect(game.nations.usa!.stats.population).toBe(startPop);
      expect(game.log.at(-1)!.systemsRun).not.toContain('demography');
    }
    game = advanceTurn(game); // resolves Q4 1949
    expect(game.date).toEqual({ year: 1950, quarter: 1 });
    expect(game.log.at(-1)!.systemsRun).toContain('demography');
    const growth = content.nations.usa!.params.population_growth_annual!.value;
    expect(game.nations.usa!.stats.population).toBe(Math.round(startPop * (1 + growth)));
  });

  it('plays all 208 turns and then stops at Q4 2000', () => {
    const end = play(newGame(), 207);
    expect(end.turn).toBe(208);
    expect(end.date).toEqual({ year: 2000, quarter: 4 });
    expect(end.history).toHaveLength(208);
    expect(canAdvance(end)).toBe(false);
    expect(() => advanceTurn(end)).toThrow(/end date/);
  });

  it('resolves a turn far inside the 10-second budget', () => {
    const game = newGame();
    const t0 = performance.now();
    advanceTurn(game);
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});
