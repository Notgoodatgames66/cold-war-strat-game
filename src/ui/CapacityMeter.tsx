/**
 * How hard a sector is working: output as a share of its normal capacity.
 * The bar runs from 85% to the sector's ceiling, with a tick at 100%.
 * State is carried by an icon and a word as well as colour.
 */

interface Props {
  /** Output ÷ normal capacity (1 = normal). */
  utilisation: number;
  /** Highest possible utilisation, e.g. 1.12. */
  ceiling: number;
  /** Utilisation above this counts as a bottleneck, e.g. 1.03. */
  stretchedFrom: number;
}

const FLOOR = 0.85;

export type CapacityState = 'idle' | 'normal' | 'stretched' | 'limit';

export function capacityState(u: number, ceiling: number, stretchedFrom: number): CapacityState {
  if (u >= ceiling - 0.005) return 'limit';
  if (u > stretchedFrom) return 'stretched';
  if (u < 0.97) return 'idle';
  return 'normal';
}

const LABELS: Record<CapacityState, { icon: string; text: string }> = {
  idle: { icon: '○', text: 'Slack' },
  normal: { icon: '●', text: 'Normal' },
  stretched: { icon: '▲', text: 'Stretched' },
  limit: { icon: '■', text: 'At limit' },
};

export function CapacityMeter({ utilisation, ceiling, stretchedFrom }: Props) {
  const state = capacityState(utilisation, ceiling, stretchedFrom);
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const fill = clamp((utilisation - FLOOR) / (ceiling - FLOOR));
  const normalMark = clamp((1 - FLOOR) / (ceiling - FLOOR));
  const pct = `${(utilisation * 100).toFixed(0)}%`;
  return (
    <div className={`meter meter--${state}`} title={`${pct} of normal capacity (limit ${(ceiling * 100).toFixed(0)}%)`}>
      <div className="meter__bar" aria-hidden="true">
        <div className="meter__fill" style={{ width: `${fill * 100}%` }} />
        <div className="meter__tick" style={{ left: `${normalMark * 100}%` }} />
      </div>
      <span className="meter__value">{pct}</span>
      <span className="meter__state">
        <span aria-hidden="true">{LABELS[state].icon}</span> {LABELS[state].text}
      </span>
    </div>
  );
}
