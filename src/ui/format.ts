import type { StatDef } from '../sim/schema';

const number = (value: number, decimals: number) =>
  new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Math.abs(value));

const sign = (value: number) => (value < 0 ? '−' : '');

/** A stat value as the interface shows it: "$272.5 bn", "147.9 m", "−0.6%". */
export function formatStat(value: number, def: Pick<StatDef, 'unit' | 'decimals'>): string {
  switch (def.unit) {
    case 'usd_bn':
      return `${sign(value)}$${number(value, def.decimals)} bn`;
    case 'people':
      return `${sign(value)}${number(value / 1_000_000, def.decimals)} m`;
    case 'percent':
      return `${sign(value)}${number(value, def.decimals)}%`;
    case 'mt':
      return `${sign(value)}${number(value, def.decimals)} Mt`;
    case 'count':
    case 'index':
      return `${sign(value)}${number(value, def.decimals)}`;
  }
}

/** The change since last quarter: "+2.6 m", "−0.4%". Empty when nothing changed. */
export function formatChange(current: number, previous: number | undefined, def: Pick<StatDef, 'unit' | 'decimals'>): string {
  if (previous === undefined || current === previous) return '';
  const delta = current - previous;
  const text = formatStat(delta, def);
  return delta > 0 ? `+${text}` : text;
}
