import { describe, expect, it } from 'vitest';
import world from '../data/map/world-110m.json';
import scenarioMap from '../data/map/world-1949.json';
import { validateScenario } from '../src/sim/content';
import { content } from '../src/sim/loadContent';
import { compareDates, isValidDate, type GameDate } from '../src/sim/time';
import { prepareMap } from '../src/ui/mapData';

const geometryNames = new Set(
  (world as { objects: { countries: { geometries: { properties: { name: string } }[] } } }).objects.countries.geometries.map(
    (g) => g.properties.name,
  ),
);
const mergedNames = new Set(Object.keys(scenarioMap.merge));

describe('1949 world map data', () => {
  it('only merges countries that exist in the Natural Earth geometry', () => {
    for (const [state, parts] of Object.entries(scenarioMap.merge)) {
      for (const part of parts) expect(geometryNames.has(part), `${state}: ${part}`).toBe(true);
    }
  });

  it('puts every bloc member on the map, either as a country or as a merged 1949 state', () => {
    for (const [bloc, { members }] of Object.entries(scenarioMap.blocs)) {
      for (const m of members) expect(geometryNames.has(m) || mergedNames.has(m), `${bloc}: ${m}`).toBe(true);
    }
  });

  it('never places a country in two blocs', () => {
    const seen = new Map<string, string>();
    for (const [bloc, { members }] of Object.entries(scenarioMap.blocs)) {
      for (const m of members) {
        expect(seen.get(m), `${m} is in ${seen.get(m)} and ${bloc}`).toBeUndefined();
        seen.set(m, bloc);
      }
    }
  });

  it('links map countries only to nations that have data files', () => {
    for (const id of Object.values(scenarioMap.nations)) expect(content.nations[id]).toBeDefined();
  });

  it('gives every hotspot a valid end date and a source note', () => {
    for (const h of scenarioMap.hotspots) {
      expect(isValidDate(h.until), h.id).toBe(true);
      expect(compareDates(h.until as GameDate, scenarioMap.date as GameDate)).toBeGreaterThanOrEqual(0);
      expect(h.note.length, h.id).toBeGreaterThan(10);
    }
  });
});

describe('prepared map', () => {
  const map = prepareMap();

  it('draws the Soviet Union as one state and links it to the USSR', () => {
    const ussr = map.countries.filter((c) => c.nation === 'ussr');
    expect(ussr).toHaveLength(1);
    expect(ussr[0]!.name).toBe('Soviet Union');
    expect(ussr[0]!.bloc).toBe('soviet');
    expect(map.countries.some((c) => c.name === 'Ukraine' || c.name === 'Kazakhstan')).toBe(false);
  });

  it('colours the United States as the player bloc', () => {
    expect(map.countries.find((c) => c.nation === 'usa')?.bloc).toBe('us');
  });

  it('leaves out Antarctica and keeps every point inside the frame', () => {
    expect(map.countries.some((c) => c.name === 'Antarctica')).toBe(false);
    for (const p of [...map.capitals, ...map.hotspots]) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(map.width);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(map.height);
    }
  });

  it('places Washington west of Moscow, and Moscow north of Athens', () => {
    const dc = map.capitals.find((c) => c.name === 'Washington')!;
    const moscow = map.capitals.find((c) => c.name === 'Moscow')!;
    expect(dc.x).toBeLessThan(moscow.x);
    expect(moscow.y).toBeLessThan(map.hotspots.find((h) => h.id === 'greek-civil-war')!.y);
  });
});

describe('scenario opening', () => {
  const base = {
    id: 's',
    name: 'S',
    description: 'D',
    playerNation: 'usa',
    defaultSeed: 'x',
    startDate: { year: 1949, quarter: 1 },
    endDate: { year: 1950, quarter: 1 },
    nations: ['usa'],
  };
  const ids = new Set(['usa']);

  it('ships with the 1949 scenario', () => {
    expect(content.scenarios['usa-1949']?.opening?.headline).toBeTruthy();
  });

  it('is optional', () => {
    expect(validateScenario(base, 's.json', ids)).toEqual([]);
  });

  it('rejects an opening without paragraphs or with a quote missing its source', () => {
    const errors = validateScenario(
      { ...base, opening: { kicker: 'K', headline: 'H', action: 'Go', paragraphs: [], quote: { text: 'T' } } },
      's.json',
      ids,
    );
    expect(errors).toContain('s.json: opening.paragraphs must list at least one paragraph');
    expect(errors).toContain('s.json: opening.quote needs text and source');
  });
});
