/**
 * Line charts for the history panels.
 *
 * One series: the title names it, so no legend is needed. Several series
 * (the balance of power): a legend above the plot, a label at the end of each
 * line, and the rival drawn dashed so the lines differ by more than colour.
 * Hover (or focus and arrow keys) moves a crosshair that snaps to the nearest
 * quarter and reads out every series; a table view keeps every value
 * reachable without hovering.
 */

import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { StatDef } from '../sim/schema';
import { formatStat } from './format';

export interface ChartPoint {
  label: string;
  year: number;
  value: number;
}

/** One line on a chart. `tone` picks its ink: the player's nation or its rival. */
export interface ChartSeries {
  name: string;
  tone: 'player' | 'rival';
  points: ChartPoint[];
}

interface Props {
  def: StatDef;
  /** A single series (the title names it). */
  points?: ChartPoint[];
  /** Several series sharing the same quarters; drawn with a legend. */
  series?: ChartSeries[];
  /** Overrides the title (defaults to the stat's label). */
  title?: string;
  /** A short line under the title: units, base year. */
  subtitle?: string;
  /** Draw a reference line at zero (for measures that change sign). */
  zeroLine?: boolean;
}

const W = 360;
const H = 180;
const M = { top: 16, right: 52, bottom: 24, left: 48 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;
/** End labels closer than this (in chart units) are pushed apart. */
const LABEL_GAP = 12;

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
  // "$1.2 tn" fits the axis where "$1,200 bn" would not.
  if (def.unit === 'usd_bn' && Math.abs(value) >= 1000) return `${value < 0 ? '−' : ''}$${(Math.abs(value) / 1000).toFixed(1)} tn`;
  const compact = { ...def, decimals: Math.abs(value) >= 100 || Number.isInteger(value) ? 0 : 1 };
  return formatStat(value, compact);
}

/** Spreads end labels so none overlap, keeping each as close to its line as possible. */
function spreadLabels(ys: number[]): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < order.length; k++) {
    if (order[k]!.y - order[k - 1]!.y < LABEL_GAP) order[k]!.y = order[k - 1]!.y + LABEL_GAP;
  }
  const out = [...ys];
  for (const { y, i } of order) out[i] = y;
  return out;
}

export function LineChart({ def, points, series, title, subtitle, zeroLine = false }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const titleId = useId();
  const lines: ChartSeries[] = useMemo(
    () => series ?? [{ name: def.label, tone: 'player', points: points ?? [] }],
    [series, points, def.label],
  );
  const multi = lines.length > 1;
  const heading = title ?? def.label;
  const axis = lines[0]!.points;

  const geometry = useMemo(() => {
    if (axis.length < 2) return null;
    const values = lines.flatMap((s) => s.points.map((p) => p.value));
    let lo = Math.min(...values);
    let hi = Math.max(...values);
    if (zeroLine) {
      lo = Math.min(lo, 0);
      hi = Math.max(hi, 0);
    }
    const pad = (hi - lo) * 0.1 || Math.abs(hi) * 0.05 || 1;
    lo -= pad;
    hi += pad;
    const x = (i: number) => M.left + (i / (axis.length - 1)) * PLOT_W;
    const y = (v: number) => M.top + (1 - (v - lo) / (hi - lo)) * PLOT_H;
    const paths = lines.map((s) => s.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)} ${y(p.value).toFixed(2)}`).join(''));
    const yTicks = niceTicks(lo, hi);
    const firstYear = axis[0]!.year;
    const lastYear = axis[axis.length - 1]!.year;
    const yearStep = Math.max(1, Math.ceil((lastYear - firstYear + 1) / 5));
    const xTicks: { i: number; year: number }[] = [];
    axis.forEach((p, i) => {
      if (p.label.startsWith('Q1') && (p.year - firstYear) % yearStep === 0) xTicks.push({ i, year: p.year });
    });
    const endYs = spreadLabels(lines.map((s) => y(s.points[s.points.length - 1]!.value)));
    return { x, y, paths, yTicks, xTicks, endYs };
  }, [lines, axis, zeroLine]);

  const last = axis.length - 1;

  if (!geometry || last < 0) {
    return (
      <figure className="chart" aria-labelledby={titleId}>
        <figcaption id={titleId} className="chart__title">
          {heading}
        </figcaption>
        <p className="chart__empty">History appears after the first turn.</p>
      </figure>
    );
  }

  const { x, y, paths, yTicks, xTicks, endYs } = geometry;
  const at = hover ?? null;

  const onPointer = (event: PointerEvent<SVGRectElement>) => {
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    const box = svg.getBoundingClientRect();
    const px = ((event.clientX - box.left) / box.width) * W;
    const i = Math.round(((px - M.left) / PLOT_W) * last);
    setHover(Math.min(last, Math.max(0, i)));
  };

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const start = hover ?? last;
      const next = start + (event.key === 'ArrowRight' ? 1 : -1);
      setHover(Math.min(last, Math.max(0, next)));
    } else if (event.key === 'Escape') {
      setHover(null);
    }
  };

  const latestText = lines.map((s) => `${multi ? `${s.name} ` : ''}${formatStat(s.points[last]!.value, def)}`).join(', ');

  return (
    <figure className="chart" aria-labelledby={titleId}>
      <div className="chart__head">
        <figcaption id={titleId} className="chart__title">
          {heading}
        </figcaption>
        <button type="button" className="chart__toggle" onClick={() => setShowTable((s) => !s)}>
          {showTable ? 'Chart' : 'Table'}
        </button>
      </div>
      {subtitle && <p className="chart__subtitle">{subtitle}</p>}

      {multi && (
        <ul className="chart__legend" aria-hidden="true">
          {lines.map((s) => (
            <li key={s.name} className={`chart__key chart__key--${s.tone}`}>
              <svg viewBox="0 0 22 8" className="chart__swatch">
                <line x1="1" x2="21" y1="4" y2="4" />
              </svg>
              {s.name}
            </li>
          ))}
        </ul>
      )}

      {showTable ? (
        <div className="chart__table-wrap">
          <table className="chart__table">
            <thead>
              <tr>
                <th scope="col">Quarter</th>
                {lines.map((s) => (
                  <th key={s.name} scope="col">
                    {multi ? s.name : def.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {axis
                .map((p, i) => ({ p, i }))
                .reverse()
                .map(({ p, i }) => (
                  <tr key={p.label}>
                    <td>{p.label}</td>
                    {lines.map((s) => (
                      <td key={s.name}>{formatStat(s.points[i]!.value, def)}</td>
                    ))}
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
          aria-label={`${heading}, ${axis[0]!.label} to ${axis[last]!.label}. Latest: ${latestText}. Use the arrow keys to read each quarter.`}
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
            {lines.map((s, k) => (
              <g key={s.name} className={`chart__series chart__series--${s.tone}`}>
                <path className="chart__line" d={paths[k]} />
                <circle className="chart__dot" cx={x(last)} cy={y(s.points[last]!.value)} r={4} />
                <text className="chart__end" x={x(last) + 8} y={endYs[k]! + 3.5}>
                  {tickLabel(s.points[last]!.value, def)}
                </text>
              </g>
            ))}
            {at !== null && (
              <g className="chart__cross">
                <line x1={x(at)} x2={x(at)} y1={M.top} y2={M.top + PLOT_H} />
                {lines.map((s) => (
                  <circle
                    key={s.name}
                    className={`chart__dot chart__series--${s.tone}`}
                    cx={x(at)}
                    cy={y(s.points[at]!.value)}
                    r={4}
                  />
                ))}
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
          {at !== null && (
            // Pinned to the corner away from the crosshair, so it never runs off the card.
            <div className="chart__tip" style={at > last / 2 ? { left: 0 } : { right: 0 }}>
              <span>{axis[at]!.label}</span>
              {lines.map((s) => (
                <strong key={s.name} className={multi ? `chart__tip-row chart__tip-row--${s.tone}` : undefined}>
                  {multi && <span className="chart__tip-name">{s.name}</span>}
                  {formatStat(s.points[at]!.value, def)}
                </strong>
              ))}
            </div>
          )}
        </div>
      )}
    </figure>
  );
}
