import { describe, expect, it } from 'vitest';
import { buildContent, validateNation } from '../src/sim/content';
import { content } from '../src/sim/loadContent';

describe('data files', () => {
  it('all load and validate', () => {
    expect(content.stats.length).toBeGreaterThan(0);
    expect(Object.keys(content.nations)).toEqual(expect.arrayContaining(['usa', 'ussr']));
    expect(content.scenarios['usa-1949']).toBeDefined();
  });

  it('every nation uses the universal schema and only registered stats', () => {
    const statIds = new Set(content.stats.map((s) => s.id));
    for (const nation of Object.values(content.nations)) {
      expect(validateNation(nation, nation.id, statIds)).toEqual([]);
    }
  });

  it('rejects a nation figure with no source note', () => {
    const statIds = new Set(['population']);
    const bad = {
      ...content.nations.usa,
      stats: { population: { value: 1, provenance: 'measured', note: '' } },
    };
    expect(validateNation(bad, 'bad.json', statIds).join(' ')).toMatch(/needs a note/);
  });

  it('rejects a stat that is not in the registry', () => {
    const statIds = new Set(['population']);
    const bad = {
      ...content.nations.usa,
      stats: { mystery_stat: { value: 1, provenance: 'measured', note: 'x' } },
    };
    expect(validateNation(bad, 'bad.json', statIds).join(' ')).toMatch(/not in data\/stats.json/);
  });

  it('reports every problem at once with the file name', () => {
    expect(() =>
      buildContent([], { 'data/nations/broken.json': { id: 'broken' } }, {}),
    ).toThrow(/data\/nations\/broken.json/);
  });

  it('the 1949 scenario starts in Q1 1949 and ends in Q4 2000', () => {
    const scenario = content.scenarios['usa-1949']!;
    expect(scenario.startDate).toEqual({ year: 1949, quarter: 1 });
    expect(scenario.endDate).toEqual({ year: 2000, quarter: 4 });
    expect(scenario.playerNation).toBe('usa');
  });
});
