/**
 * The United States by state, for the Population tab: Census Bureau
 * cartographic boundaries (via the us-atlas package, already projected with
 * an Albers equal-area projection), in data/map/us-states-albers.json.
 *
 * Alaska and Hawaii are left out: they became states in 1959 and the 1949
 * scenario does not model them yet. Display data only.
 */

import { geoPath } from 'd3-geo';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import states from '../../data/map/us-states-albers.json';

export interface StateShape {
  /** Full state name, matching the pop model's state category labels. */
  name: string;
  d: string;
  /** Where to put a label. */
  cx: number;
  cy: number;
}

export interface USMap {
  viewBox: string;
  states: StateShape[];
}

const LEFT_OUT = new Set(['Alaska', 'Hawaii', 'Puerto Rico']);
let cache: USMap | null = null;

export function usMap(): USMap {
  if (cache) return cache;
  const topo = states as unknown as Topology<{ states: GeometryCollection<{ name: string }> }>;
  const path = geoPath().digits(1);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const shapes: StateShape[] = [];
  for (const g of topo.objects.states.geometries) {
    const name = (g.properties as { name: string }).name;
    if (LEFT_OUT.has(name)) continue;
    const f = feature(topo, g) as Feature<Polygon | MultiPolygon>;
    const [[a, b], [c, d]] = path.bounds(f);
    x0 = Math.min(x0, a);
    y0 = Math.min(y0, b);
    x1 = Math.max(x1, c);
    y1 = Math.max(y1, d);
    const [cx, cy] = path.centroid(f);
    shapes.push({ name, d: path(f) ?? '', cx, cy });
  }
  const pad = 8;
  cache = {
    viewBox: `${Math.floor(x0 - pad)} ${Math.floor(y0 - pad)} ${Math.ceil(x1 - x0 + 2 * pad)} ${Math.ceil(y1 - y0 + 2 * pad)}`,
    states: shapes,
  };
  return cache;
}
