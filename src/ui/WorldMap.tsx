/**
 * The situation map: the world in 1949, coloured by bloc, with the capitals
 * and the crises live at the current date. Clicking a superpower selects it.
 */

import { useMemo } from 'react';
import { compareDates, type GameDate } from '../sim/time';
import { prepareMap, type MapHotspot } from './mapData';

interface Props {
  date: GameDate;
  playerNation: string;
  selected: string;
  onSelect(nationId: string): void;
}

/** IBM Plex Mono is monospaced, so callout widths can be worked out from character counts. */
const LABEL_SIZE = 10.5;
const DETAIL_SIZE = 11.5;
const labelWidth = (s: string) => s.length * LABEL_SIZE * (0.6 + 0.16);
const detailWidth = (s: string) => s.length * DETAIL_SIZE * 0.6;

export function WorldMap({ date, playerNation, selected, onSelect }: Props) {
  const map = prepareMap();
  const live = useMemo(() => map.hotspots.filter((h) => compareDates(date, h.until) <= 0), [map, date]);

  return (
    <svg
      className="worldmap"
      viewBox={`0 0 ${map.width} ${map.height}`}
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label="World map, coloured by Cold War bloc, with current crises marked"
    >
      <rect className="worldmap__sea" width={map.width} height={map.height} />
      <path className="worldmap__sphere" d={map.sphere} />
      <path className="worldmap__graticule" d={map.graticule} />
      <g>
        {map.countries.map((c) => {
          const isSelected = c.nation === selected;
          const cls = `worldmap__country worldmap__country--${c.bloc}${c.nation ? ' worldmap__country--nation' : ''}${isSelected ? ' worldmap__country--selected' : ''}`;
          return (
            <path key={c.name} className={cls} d={c.d} onClick={c.nation ? () => onSelect(c.nation!) : undefined}>
              <title>{c.nation ? `${c.name}: select to see its dossier` : c.name}</title>
            </path>
          );
        })}
      </g>

      {map.capitals.map((c) => {
        const own = c.nation === playerNation;
        return (
          <g key={c.name} className={`worldmap__capital worldmap__capital--${own ? 'player' : 'rival'}`}>
            <rect x={c.x - 5} y={c.y - 5} width={10} height={10} transform={`rotate(45 ${c.x} ${c.y})`} />
            <text x={c.x + 12} y={c.y + 4}>
              {c.name.toUpperCase()}
            </text>
          </g>
        );
      })}

      {live.map((h) => (
        <Hotspot key={h.id} h={h} />
      ))}

    </svg>
  );
}

function Hotspot({ h }: { h: MapHotspot }) {
  const label = h.label.toUpperCase();
  const w = Math.ceil(Math.max(labelWidth(label), detailWidth(h.detail)) + 22);
  const boxH = 46;
  const bx = h.x + h.callout.dx;
  const by = h.y + h.callout.dy;
  // Leader line from the marker to the nearest edge of the box.
  const lx = Math.min(Math.max(h.x, bx), bx + w);
  const ly = h.callout.dy < 0 ? by + boxH : by;
  return (
    <g className={`worldmap__hotspot worldmap__hotspot--${h.tone}`}>
      <title>{h.note}</title>
      <line x1={h.x} y1={h.y} x2={lx} y2={ly} />
      <circle className="worldmap__ring" cx={h.x} cy={h.y} r={11} />
      <circle className="worldmap__dot" cx={h.x} cy={h.y} r={4} />
      <rect className="worldmap__box" x={bx} y={by} width={w} height={boxH} />
      <text className="worldmap__label" x={bx + 11} y={by + 18}>
        {label}
      </text>
      <text className="worldmap__detail" x={bx + 11} y={by + 35}>
        {h.detail}
      </text>
    </g>
  );
}
