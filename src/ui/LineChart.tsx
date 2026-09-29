/**
 * A single-series line chart for the history panels.
 *
 * Small multiples: one measure per chart, so the title names the series and
 * no legend is needed. Hover (or focus and arrow keys) moves a crosshair that
 * snaps to the nearest quarter; a table view keeps every value reachable
 * without hovering.
 */

import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { StatDef } from '../sim/schema';
import { formatStat } from './format';

export interface ChartPoint {
  label: string;
  year: number;
  value: number;
}

interface Props {
  def: StatDef;
  points: ChartPoint[];
  /** Draw a reference line at zero (for measures that change sign). */
  zeroLine?: boolean;
}

const W = 360;
const H = 180;
const M = { top: 16, right: 52, bottom: 24, left: 48 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;

function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min || Math.abs(max) || 1;
  const raw = span / count;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => span / s <= count) ?? magnitude * 10;
  const ticks: number[] = [];
  for (let t = Math.ceil(min / step) * step; t <= max + step * 1e-9; t += step) ticks.push(Number(t.toFixed(10)));
  return ticks;
}

function tickLabel(value: number, def: StatDef): string {
  const compact = { ...def, decimals: Math.abs(value) >= 100 || Number.isInteger(value) ? 0 : 1 };
  return formatStat(value, compact);
}

export function LineChart({ def, points, zeroLine = false }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const titleId = useId();

  const geometry = useMemo(() => {
    if (points.length < 2) return null;
    const values = points.map((p) => p.value);
    let lo = Math.min(...values);
    let hi = Math.max(...values);
    if (zeroLine) {
      lo = Math.min(lo, 0);
      hi = Math.max(hi, 0);
    }
    const pad = (hi - lo) * 0.1 || Math.abs(hi) * 0.05 || 1;
    lo -= pad;
    hi += pad;
    const x = (i: number) => M.left + (i / (points.length - 1)) * PLOT_W;
    const y = (v: number) => M.top + (1 - (v - lo) / (hi - lo)) * PLOT_H;
    const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)} ${y(p.value).toFixed(2)}`).join('');
    const yTicks = niceTicks(lo, hi);
    const firstYear = points[0]!.year;
    const lastYear = points[points.length - 1]!.year;
    const yearStep = Math.max(1, Math.ceil((lastYear - firstYear + 1) / 5));
    const xTicks: { i: number; year: number }[] = [];
    points.forEach((p, i) => {
      if (p.label.startsWith('Q1') && (p.year - firstYear) % yearStep === 0) xTicks.push({ i, year: p.year });
    });
    return { x, y, path, yTicks, xTicks };
  }, [points, zeroLine]);

  const latest = points[points.length - 1];

  if (!geometry || !latest) {
    return (
      <figure className="chart" aria-labelledby={titleId}>
        <figcaption id={titleId} className="chart__title">
          {def.label}
        </figcaption>
        <p className="chart__empty">History appears after the first turn.</p>
      </figure>
    );
  }

  const { x, y, path, yTicks, xTicks } = geometry;
  const active = hover === null ? null : points[hover];

  const onPointer = (event: PointerEvent<SVGRectElement>) => {
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    const box = svg.getBoundingClientRect();
    const px = ((event.clientX - box.left) / box.width) * W;
    const i = Math.round(((px - M.left) / PLOT_W) * (points.length - 1));
    setHover(Math.min(points.length - 1, Math.max(0, i)));
  };

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const start = hover ?? points.length - 1;
      const next = start + (event.key === 'ArrowRight' ? 1 : -1);
      setHover(Math.min(points.length - 1, Math.max(0, next)));
    } else if (event.key === 'Escape') {
      setHover(null);
    }
  };

  return (
    <figure className="chart" aria-labelledby={titleId}>
      <div className="chart__head">
        <figcaption id={titleId} className="chart__title">
          {def.label}
        </figcaption>
        <button type="button" className="chart__toggle" onClick={() => setShowTable((s) => !s)}>
          {showTable ? 'Chart' : 'Table'}
        </button>
      </div>

      {showTable ? (
        <div className="chart__table-wrap">
          <table className="chart__table">
            <thead>
              <tr>
                <th scope="col">Quarter</th>
                <th scope="col">{def.label}</th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((p) => (
                <tr key={p.label}>
                  <td>{p.label}</td>
                  <td>{formatStat(p.value, def)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          className="chart__plot"
          tabIndex={0}
          role="img"
          aria-label={`${def.label}, ${points[0]!.label} to ${latest.label}. Latest ${formatStat(latest.value, def)}. Use the arrow keys to read each quarter.`}
          onKeyDown={onKey}
          onBlur={() => setHover(null)}
        >
          <svg viewBox={`0 0 ${W} ${H}`} className="chart__svg">
            <g className="chart__grid">
              {yTicks.map((t) => (
                <g key={t}>
                  <line x1={M.left} x2={M.left + PLOT_W} y1={y(t)} y2={y(t)} />
                  <text x={M.left - 6} y={y(t) + 3.5} textAnchor="end">
                    {tickLabel(t, def)}
                  </text>
                </g>
              ))}
              {xTicks.map(({ i, year }) => (
                <text key={year} x={x(i)} y={H - 6} textAnchor="middle">
                  {year}
                </text>
              ))}
            </g>
            {zeroLine && <line className="chart__zero" x1={M.left} x2={M.left + PLOT_W} y1={y(0)} y2={y(0)} />}
            <path className="chart__line" d={path} />
            <circle className="chart__dot" cx={x(points.length - 1)} cy={y(latest.value)} r={4} />
            <text className="chart__end" x={x(points.length - 1) + 8} y={y(latest.value) + 3.5}>
              {tickLabel(latest.value, def)}
            </text>
            {active && hover !== null && (
              <g className="chart__cross">
                <line x1={x(hover)} x2={x(hover)} y1={M.top} y2={M.top + PLOT_H} />
                <circle className="chart__dot" cx={x(hover)} cy={y(active.value)} r={4} />
              </g>
            )}
            <rect
              className="chart__hit"
              x={M.left}
              y={0}
              width={PLOT_W}
              height={H}
              onPointerMove={onPointer}
              onPointerLeave={() => setHover(null)}
            />
          </svg>
          {active && hover !== null && (
            <div
              className="chart__tip"
              style={{ left: `${(x(hover) / W) * 100}%`, transform: `translateX(${hover > points.length / 2 ? '-105%' : '5%'})` }}
            >
              <strong>{formatStat(active.value, def)}</strong>
              <span>{active.label}</span>
            </div>
          )}
        </div>
      )}
    </figure>
  );
}
