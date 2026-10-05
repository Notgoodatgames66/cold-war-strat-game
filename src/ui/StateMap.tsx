/**
 * A map of the US states coloured by one of several measures, with chips to
 * switch between them. Shared by the Population and Politics tabs.
 */

import { useState } from 'react';
import { codecFor } from '../sim/pops/codec';
import type { PopModelData } from '../sim/pops/types';
import { usMap } from './usMap';

export interface MapMeasure {
  id: string;
  label: string;
  /** Short label for the chip (defaults to `label`). */
  chip?: string;
  /** One value per region category of the pop model. */
  values: number[];
  format(v: number): string;
  /** Diverging colours around `center` (default 0), at least ±`minSpan` wide. */
  diverging?: boolean;
  center?: number;
  minSpan?: number;
  /** For diverging measures: which side is blue. */
  positive?: 'high' | 'low';
  /** Colours to use instead of the default ramp (low to high). */
  palette?: string[];
}

const SEQUENTIAL = ['#15263a', '#1d3651', '#28496b', '#365f88', '#4b79a6', '#6a98c4', '#93bde0'];
const DIVERGING = ['#7a302b', '#62302c', '#3a2a2c', '#1f2a35', '#22384f', '#2c5578', '#4b79a6', '#7fb3dd'];

function span(m: MapMeasure, min: number, max: number): number {
  const c = m.center ?? 0;
  return Math.max(Math.abs(min - c), Math.abs(max - c), m.minSpan ?? 0.05);
}

export function colourFor(m: MapMeasure, v: number, min: number, max: number): string {
  if (m.diverging) {
    const ramp = m.palette ?? DIVERGING;
    const c = m.center ?? 0;
    let t = ((v - c) / span(m, min, max) + 1) / 2;
    if (m.positive === 'low') t = 1 - t;
    return ramp[Math.min(ramp.length - 1, Math.max(0, Math.floor(t * ramp.length)))]!;
  }
  const ramp = m.palette ?? SEQUENTIAL;
  const t = max > min ? (v - min) / (max - min) : 0.5;
  return ramp[Math.min(ramp.length - 1, Math.floor(t * ramp.length))]!;
}

/** Winner-take-all colours: every state clearly red or blue, deeper with a wider margin. */
export const ELECTION_PALETTE = ['#c0574b', '#a04a40', '#823e36', '#66332d', '#284c6e', '#356390', '#4f80b0', '#7fb3dd'];

/** Whether the model's regions are the US states. */
export function hasStateMap(model: PopModelData): boolean {
  const codec = codecFor(model);
  if (codec.role.region === undefined) return false;
  const names = new Set(usMap().states.map((s) => s.name));
  const cats = codec.attributes[codec.role.region]!.categories;
  return cats.filter((c) => names.has(c.label)).length >= cats.length - 1;
}

interface Props {
  model: PopModelData;
  measures: MapMeasure[];
  initial?: string;
  eyebrow?: string;
}

export function StateMap({ model, measures, initial, eyebrow = 'By state' }: Props) {
  const [measureId, setMeasureId] = useState(initial ?? measures[0]?.id);
  const measure = measures.find((m) => m.id === measureId) ?? measures[0]!;
  const codec = codecFor(model);
  const regionCats = codec.attributes[codec.role.region!]!.categories;
  const byName = new Map(regionCats.map((c, i) => [c.label, i]));
  const map = usMap();
  const values = measure.values.filter((v) => Number.isFinite(v));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const c = measure.center ?? 0;
  const s = span(measure, min, max);
  const stops = measure.diverging ? [c - s, c, c + s] : [min, (min + max) / 2, max];
  const base = measure.palette ?? (measure.diverging ? DIVERGING : SEQUENTIAL);
  const ramp = measure.diverging && measure.positive === 'low' ? [...base].reverse() : base;

  return (
    <figure className="panel statemap">
      <figcaption className="statemap__head">
        <span className="eyebrow">{eyebrow}</span>
        {measures.length > 1 && (
          <div className="statemap__measures" role="group" aria-label="Colour the map by">
            {measures.map((m) => (
              <button key={m.id} type="button" className={`chip${m.id === measure.id ? ' chip--on' : ''}`} aria-pressed={m.id === measure.id} onClick={() => setMeasureId(m.id)}>
                {m.chip ?? m.label}
              </button>
            ))}
          </div>
        )}
      </figcaption>
      <svg className="statemap__svg" viewBox={map.viewBox} role="img" aria-label={`Map of the states: ${measure.label}`}>
        {map.states.map((st) => {
          const i = byName.get(st.name);
          const v = i === undefined ? undefined : measure.values[i];
          const ok = v !== undefined && Number.isFinite(v);
          return (
            <path key={st.name} className="statemap__state" d={st.d} fill={ok ? colourFor(measure, v, min, max) : '#141c25'}>
              <title>{ok ? `${st.name}: ${measure.format(v)}` : st.name}</title>
            </path>
          );
        })}
      </svg>
      <div className="statemap__legend">
        <span>{measure.label}</span>
        <span className="statemap__ramp" style={{ background: `linear-gradient(90deg, ${ramp.join(', ')})` }} aria-hidden="true" />
        <span className="statemap__stops">
          {stops.map((v, i) => (
            <span key={i}>{measure.format(v)}</span>
          ))}
        </span>
      </div>
    </figure>
  );
}
