/**
 * A tiny trend line for table rows. The table cell beside it carries the
 * value; the sparkline only shows direction, so it has no axes.
 */

interface Props {
  values: number[];
  label: string;
  width?: number;
  height?: number;
}

export function Sparkline({ values, label, width = 88, height = 24 }: Props) {
  if (values.length < 2) return <span className="sparkline sparkline--empty">—</span>;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const pad = 3;
  const x = (i: number) => pad + (i / (values.length - 1)) * (width - 2 * pad);
  const y = (v: number) => pad + (1 - (v - lo) / span) * (height - 2 * pad);
  const path = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('');
  const last = values.length - 1;
  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={label}>
      <path d={path} />
      <circle cx={x(last)} cy={y(values[last]!)} r={2.5} />
    </svg>
  );
}
