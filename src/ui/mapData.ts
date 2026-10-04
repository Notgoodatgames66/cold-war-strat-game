/**
 * The world map's geometry, prepared once for drawing.
 *
 * Natural Earth countries (data/map/world-110m.json) are merged into their 1949
 * states and coloured by bloc from data/map/world-1949.json. This is display
 * data only: nothing here feeds the simulation.
 */

import { geoGraticule10, geoNaturalEarth1, geoPath } from 'd3-geo';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import { feature, merge } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import world from '../../data/map/world-110m.json';
import scenarioMap from '../../data/map/world-1949.json';
import type { GameDate } from '../sim/time';

export type BlocId = 'us' | 'west' | 'allied' | 'soviet' | 'east' | 'contested' | 'unaligned';
export type HotspotTone = 'alert' | 'contested';

export interface MapCountry {
  name: string;
  bloc: BlocId;
  /** The game nation this country is, when it is one. */
  nation?: string;
  d: string;
}

export interface MapPoint {
  x: number;
  y: number;
}

export interface MapHotspot extends MapPoint {
  id: string;
  label: string;
  detail: string;
  tone: HotspotTone;
  callout: { dx: number; dy: number };
  until: GameDate;
  note: string;
}

export interface MapCapital extends MapPoint {
  name: string;
  nation: string;
}

export interface PreparedMap {
  width: number;
  height: number;
  sphere: string;
  graticule: string;
  countries: MapCountry[];
  capitals: MapCapital[];
  hotspots: MapHotspot[];
  blocs: { id: BlocId; label: string }[];
}

export const MAP_WIDTH = 1600;

interface Raw {
  merge: Record<string, string[]>;
  nations: Record<string, string>;
  blocs: Record<string, { label: string; members: string[] }>;
  capitals: { name: string; nation: string; lon: number; lat: number }[];
  hotspots: (Omit<MapHotspot, 'x' | 'y'> & { lon: number; lat: number })[];
}

let cache: PreparedMap | null = null;

export function prepareMap(): PreparedMap {
  if (cache) return cache;
  const raw = scenarioMap as unknown as Raw;
  const topo = world as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;
  const geoms = topo.objects.countries.geometries;

  const projection = geoNaturalEarth1().rotate([-10, 0]).fitWidth(MAP_WIDTH, { type: 'Sphere' });
  // Crop the empty polar bands: keep roughly 83°N to 58°S.
  const [tx, ty] = projection.translate();
  const top = projection([0, 83])![1];
  projection.translate([tx, ty - top + 6]);
  const height = Math.round(projection([0, -58])![1] + 6);
  const path = geoPath(projection).digits(1);

  const blocOf = new Map<string, BlocId>();
  for (const [id, bloc] of Object.entries(raw.blocs)) for (const m of bloc.members) blocOf.set(m, id as BlocId);

  const merged = new Set(Object.values(raw.merge).flat());
  const shapes: { name: string; shape: Feature<Polygon | MultiPolygon> | ReturnType<typeof merge> }[] = [];
  for (const g of geoms) {
    const name = (g.properties as { name: string }).name;
    if (name === 'Antarctica' || name === 'Fr. S. Antarctic Lands' || merged.has(name)) continue;
    shapes.push({ name, shape: feature(topo, g) as Feature<Polygon | MultiPolygon> });
  }
  for (const [name, parts] of Object.entries(raw.merge)) {
    shapes.push({ name, shape: merge(topo, geoms.filter((g) => parts.includes((g.properties as { name: string }).name)) as never) });
  }

  const countries: MapCountry[] = shapes
    .map(({ name, shape }) => ({
      name,
      bloc: blocOf.get(name) ?? 'unaligned',
      nation: raw.nations[name],
      d: path(shape as never) ?? '',
    }))
    .filter((c) => c.d !== '')
    // Draw the two superpowers last so their borders sit on top.
    .sort((a, b) => Number(Boolean(a.nation)) - Number(Boolean(b.nation)));

  const at = (lon: number, lat: number): MapPoint => {
    const [x, y] = projection([lon, lat])!;
    return { x: Math.round(x), y: Math.round(y) };
  };

  cache = {
    width: MAP_WIDTH,
    height,
    sphere: path({ type: 'Sphere' }) ?? '',
    graticule: path(geoGraticule10()) ?? '',
    countries,
    capitals: raw.capitals.map((c) => ({ name: c.name, nation: c.nation, ...at(c.lon, c.lat) })),
    hotspots: raw.hotspots.map(({ lon, lat, ...h }) => ({ ...h, ...at(lon, lat) })),
    blocs: [
      ...Object.entries(raw.blocs).map(([id, b]) => ({ id: id as BlocId, label: b.label })),
      { id: 'unaligned' as const, label: 'Unaligned' },
    ],
  };
  return cache;
}
