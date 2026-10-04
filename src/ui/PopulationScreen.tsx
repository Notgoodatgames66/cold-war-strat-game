/**
 * The Population tab: who lives where, and how that is changing.
 *
 * - Headline figures and their change since the start.
 * - An age pyramid by single year of age, with the baby boom generation marked.
 * - A state map (the future electoral map) coloured by a chosen measure.
 * - Breakdowns by race, class, religion, place and age, against the start.
 * - Trend charts and a sortable table of the states.
 *
 * Everything here adds pops up for display; no game rules are computed.
 */

import { useMemo, useState } from 'react';
import { content } from '../sim/loadContent';
import { buildPops } from '../sim/pops/build';
import { codecFor } from '../sim/pops/codec';
import { peopleBy, peopleBy2, totalPeople } from '../sim/pops/summary';
import type { PopModelData, PopsState } from '../sim/pops/types';
import type { GameState } from '../sim/schema';
import { formatDate } from '../sim/time';
import { formatChange, formatStat } from './format';
import { LineChart, type ChartPoint } from './LineChart';
import { usMap } from './usMap';

interface Props {
  game: GameState;
}

const FIGURES = ['population', 'labour_force', 'urban_share', 'farm_population', 'birth_rate', 'death_rate'];
const CHARTS: { stat: string; subtitle: string }[] = [
  { stat: 'population', subtitle: 'People' },
  { stat: 'labour_force', subtitle: 'Working or looking for work' },
  { stat: 'birth_rate', subtitle: 'Births per 1,000 people a year' },
  { stat: 'death_rate', subtitle: 'Deaths per 1,000 people a year' },
  { stat: 'farm_population', subtitle: 'People in farm households' },
  { stat: 'urban_share', subtitle: 'Share in cities, towns and suburbs' },
];

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const millions = (x: number) => (x >= 1e6 ? `${(x / 1e6).toFixed(1)} m` : `${Math.round(x / 1000)}k`);
const pts = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(1)} pts`;

/** Index of a category by id within an attribute, or -1. */
const catIndex = (model: PopModelData, attrId: string, catId: string) =>
  model.attributes.find((a) => a.id === attrId)?.categories.findIndex((c) => c.id === catId) ?? -1;

export function PopulationScreen({ game }: Props) {
  const withPops = Object.values(game.nations).filter((n) => n.pops);
  const [selected, setSelected] = useState(game.playerNation);
  const nation = game.nations[selected]?.pops ? game.nations[selected]! : withPops[0];
  if (!nation?.pops) return <p className="empty">No nation in this game has a simulated population yet.</p>;
  const model = content.pops[nation.pops.model];
  if (!model) return <p className="empty">Unknown pop model “{nation.pops.model}”.</p>;
  const start = game.history[0]?.stats[nation.id];
  const previous = game.history.length > 1 ? game.history[game.history.length - 2]!.stats[nation.id] : undefined;

  const history = (stat: string): ChartPoint[] =>
    game.history
      .filter((h) => h.stats[nation.id]?.[stat] !== undefined)
      .map((h) => ({ label: formatDate(h.date), year: h.date.year, value: h.stats[nation.id]![stat]! }));

  return (
    <div className="population">
      <header className="population__head">
        <div>
          <p className="eyebrow">Population · {nation.shortName}</p>
          <h2 className="section-title">Who lives where</h2>
          <p className="population__lead">
            {millions(nation.stats.population ?? 0)} people in {nation.pops.keys.length.toLocaleString('en-GB')} groups, each sharing every
            attribute below. Births, deaths and ageing every quarter; jobs, homes and states change once a year.
          </p>
        </div>
        {withPops.length > 1 && (
          <div className="mapdossier__switch" role="group" aria-label="Show nation">
            {withPops.map((n) => (
              <button
                key={n.id}
                type="button"
                className={`chip${n.id === nation.id ? ' chip--on' : ''}`}
                aria-pressed={n.id === nation.id}
                onClick={() => setSelected(n.id)}
              >
                {n.shortName}
              </button>
            ))}
          </div>
        )}
      </header>

      <dl className="popfigures">
        {FIGURES.map((id) => {
          const def = content.stats.find((s) => s.id === id);
          const value = nation.stats[id];
          if (!def || value === undefined) return null;
          const since = start?.[id];
          return (
            <div key={id} className="popfigure">
              <dt>{def.label}</dt>
              <dd>
                {formatStat(value, def)}
                <span className="popfigure__change">
                  {since !== undefined && since !== value
                    ? `${formatChange(value, since, def)} since ${game.startDate.year}`
                    : (formatChange(value, previous?.[id], def) || '—')}
                </span>
              </dd>
            </div>
          );
        })}
      </dl>

      <Panels game={game} model={model} pops={nation.pops} startPopulation={start?.population ?? totalPeople(nation.pops)} />

      <section aria-labelledby="pop-trends">
        <h3 id="pop-trends" className="section-title">
          The record since {game.startDate.year}
        </h3>
        {game.history.length < 2 ? (
          <p className="empty">Trend charts appear after your first turn.</p>
        ) : (
          <div className="charts">
            {CHARTS.map(({ stat, subtitle }) => {
              const def = content.stats.find((s) => s.id === stat);
              if (!def || nation.stats[stat] === undefined) return null;
              return <LineChart key={stat} def={def} subtitle={subtitle} points={history(stat)} />;
            })}
          </div>
        )}
      </section>
    </div>
  );
}

interface PanelProps {
  game: GameState;
  model: PopModelData;
  pops: PopsState;
  startPopulation: number;
}

function Panels({ game, model, pops, startPopulation }: PanelProps) {
  const codec = codecFor(model);
  const baseline = useMemo(() => buildPops(model, startPopulation), [model, startPopulation]);
  const region = codec.role.region !== undefined ? codec.attributes[codec.role.region]! : undefined;
  return (
    <>
      <div className="popgrid">
        <AgePyramid game={game} model={model} pops={pops} />
        {region && hasStateMap(model) && <StateMap model={model} pops={pops} baseline={baseline} early={game.history.length < 8} />}
      </div>
      <Breakdowns model={model} pops={pops} baseline={baseline} />
      {region && <RegionTable model={model} pops={pops} baseline={baseline} regionId={region.id} />}
    </>
  );
}

/** The state map applies when the model's regions are the US states. */
function hasStateMap(model: PopModelData): boolean {
  const codec = codecFor(model);
  if (codec.role.region === undefined) return false;
  const names = new Set(usMap().states.map((s) => s.name));
  const cats = codec.attributes[codec.role.region]!.categories;
  return cats.filter((c) => names.has(c.label)).length >= cats.length - 1;
}

// ---------------------------------------------------------------------------
// Age pyramid
// ---------------------------------------------------------------------------

function AgePyramid({ game, model, pops }: { game: GameState; model: PopModelData; pops: PopsState }) {
  const codec = codecFor(model);
  const ageAttr = codec.attributes[codec.role.age!]!;
  const sexAttr = codec.attributes[codec.role.sex!]!;
  const femaleIdx = sexAttr.categories.findIndex((c) => c.female);
  const bySex = peopleBy2(model, pops, ageAttr.id, sexAttr.id);
  const profile = pops.ageProfile.length > 0 ? pops.ageProfile : bySex.map((row) => row.reduce((s, x) => s + x, 0));
  const bandOf = (age: number) => {
    let b = 0;
    ageAttr.categories.forEach((c, i) => {
      if (age >= (c.ageFrom ?? 0)) b = i;
    });
    return b;
  };
  const femaleShare = bySex.map((row) => {
    const t = row.reduce((s, x) => s + x, 0);
    return t > 0 ? row[femaleIdx]! / t : 0.5;
  });
  const rows = profile.map((people, age) => ({ age, women: people * femaleShare[bandOf(age)]!, men: people * (1 - femaleShare[bandOf(age)]!) }));
  const max = Math.max(...rows.map((r) => Math.max(r.men, r.women)));
  const bar = 3.2;
  const half = 170;
  const height = rows.length * bar;
  const top = (age: number) => height - (age + 1) * bar;
  const boomFrom = Math.max(0, game.date.year - 1964);
  const boomTo = game.date.year - 1946;
  const showBoom = boomTo >= 0 && pops.ageProfile.length > 0;

  return (
    <figure className="panel pyramid">
      <figcaption className="pyramid__head">
        <span className="eyebrow">Age and sex</span>
        <span className="pyramid__key">
          <span className="pyramid__swatch pyramid__swatch--men" /> Men <span className="pyramid__swatch pyramid__swatch--women" /> Women
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${half * 2 + 60} ${height + 24}`} role="img" aria-label="Age pyramid by single year of age">
        {showBoom && (
          <g className="pyramid__boom">
            <rect x={0} y={top(Math.min(boomTo, rows.length - 1))} width={half * 2 + 60} height={(Math.min(boomTo, rows.length - 1) - boomFrom + 1) * bar} />
            <text x={half * 2 + 56} y={top(Math.min(boomTo, rows.length - 1)) - 4} textAnchor="end">
              BABY BOOM · BORN 1946–64
            </text>
          </g>
        )}
        {rows.map((r) => (
          <g key={r.age}>
            <rect className="pyramid__men" x={half - (r.men / max) * half} y={top(r.age)} width={(r.men / max) * half} height={bar - 0.6} />
            <rect className="pyramid__women" x={half + 60} y={top(r.age)} width={(r.women / max) * half} height={bar - 0.6} />
          </g>
        ))}
        {[0, 15, 30, 45, 65, 85].filter((a) => a < rows.length).map((a) => (
          <text key={a} className="pyramid__age" x={half + 30} y={top(a) + bar} textAnchor="middle">
            {a === rows.length - 1 ? `${a}+` : a}
          </text>
        ))}
        <text className="pyramid__age" x={half + 30} y={height + 18} textAnchor="middle">
          AGE
        </text>
      </svg>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// State map
// ---------------------------------------------------------------------------

interface Measure {
  id: string;
  label: string;
  /** Value per region category index. */
  values: number[];
  format(v: number): string;
  diverging?: boolean;
}

const SEQUENTIAL = ['#15263a', '#1d3651', '#28496b', '#365f88', '#4b79a6', '#6a98c4', '#93bde0'];
const DIVERGING = ['#7a302b', '#62302c', '#3a2a2c', '#1f2a35', '#22384f', '#2c5578', '#4b79a6', '#7fb3dd'];

function shareOf(model: PopModelData, pops: Pick<PopsState, 'keys' | 'size'>, regionId: string, attrId: string, cats: (c: { id: string; farm?: boolean }) => boolean): number[] | null {
  const attr = model.attributes.find((a) => a.id === attrId);
  if (!attr) return null;
  const table = peopleBy2(model, pops, regionId, attrId);
  return table.map((row) => {
    const t = row.reduce((s, x) => s + x, 0);
    return t > 0 ? row.reduce((s, x, i) => s + (cats(attr.categories[i]!) ? x : 0), 0) / t : 0;
  });
}

function useMeasures(model: PopModelData, pops: PopsState, baseline: Pick<PopsState, 'keys' | 'size'>): Measure[] {
  return useMemo(() => {
    const codec = codecFor(model);
    const regionId = codec.attributes[codec.role.region!]!.id;
    const now = peopleBy(model, pops, regionId);
    const then = peopleBy(model, baseline, regionId);
    const list: Measure[] = [
      { id: 'change', label: `Population change`, values: now.map((n, i) => (then[i]! > 0 ? n / then[i]! - 1 : 0)), format: (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(0)}%`, diverging: true },
      { id: 'people', label: 'Population', values: now, format: millions },
    ];
    const add = (id: string, label: string, attr: string | undefined, test: (c: { id: string; farm?: boolean }) => boolean) => {
      if (!attr) return;
      const values = shareOf(model, pops, regionId, attr, test);
      if (values) list.push({ id, label, values, format: (v) => pct(v, 0) });
    };
    const role = (r: 'ethnicity' | 'settlement' | 'class' | 'religion') => (codec.role[r] !== undefined ? codec.attributes[codec.role[r]!]!.id : undefined);
    if (catIndex(model, role('ethnicity') ?? '', 'black') >= 0) add('black', 'Black', role('ethnicity'), (c) => c.id === 'black');
    add('urban', 'Cities and suburbs', role('settlement'), (c) => c.id !== 'rural');
    add('suburb', 'Suburbs', role('settlement'), (c) => c.id === 'suburb');
    add('farm', 'Farm households', role('class'), (c) => !!c.farm);
    if (catIndex(model, role('religion') ?? '', 'catholic') >= 0) add('catholic', 'Catholic', role('religion'), (c) => c.id === 'catholic');
    return list;
  }, [model, pops, baseline]);
}

function colourFor(m: Measure, v: number, min: number, max: number): string {
  if (m.diverging) {
    // At least ±5%, so rounding noise early in the game is not painted as change.
    const span = Math.max(Math.abs(min), Math.abs(max), 0.05);
    const t = (v / span + 1) / 2;
    return DIVERGING[Math.min(DIVERGING.length - 1, Math.max(0, Math.floor(t * DIVERGING.length)))]!;
  }
  const t = max > min ? (v - min) / (max - min) : 0.5;
  return SEQUENTIAL[Math.min(SEQUENTIAL.length - 1, Math.floor(t * SEQUENTIAL.length))]!;
}

function StateMap({ model, pops, baseline, early }: { model: PopModelData; pops: PopsState; baseline: Pick<PopsState, 'keys' | 'size'>; early: boolean }) {
  const measures = useMeasures(model, pops, baseline);
  const [measureId, setMeasureId] = useState(early ? 'people' : 'change');
  const measure = measures.find((m) => m.id === measureId) ?? measures[0]!;
  const codec = codecFor(model);
  const regionCats = codec.attributes[codec.role.region!]!.categories;
  const byName = new Map(regionCats.map((c, i) => [c.label, i]));
  const map = usMap();
  const values = measure.values;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(Math.abs(min), Math.abs(max), 0.05);
  const legendStops = measure.diverging
    ? [-span, 0, span]
    : [min, (min + max) / 2, max];

  return (
    <figure className="panel statemap">
      <figcaption className="statemap__head">
        <span className="eyebrow">By state</span>
        <div className="statemap__measures" role="group" aria-label="Colour the map by">
          {measures.map((m) => (
            <button key={m.id} type="button" className={`chip${m.id === measure.id ? ' chip--on' : ''}`} aria-pressed={m.id === measure.id} onClick={() => setMeasureId(m.id)}>
              {m.id === 'change' ? 'Change' : m.label}
            </button>
          ))}
        </div>
      </figcaption>
      <svg className="statemap__svg" viewBox={map.viewBox} role="img" aria-label={`Map of the states: ${measure.label}`}>
        {map.states.map((s) => {
          const i = byName.get(s.name);
          const v = i === undefined ? undefined : values[i];
          return (
            <path key={s.name} className="statemap__state" d={s.d} fill={v === undefined ? '#141c25' : colourFor(measure, v, min, max)}>
              <title>{v === undefined ? s.name : `${s.name}: ${measure.format(v)}`}</title>
            </path>
          );
        })}
      </svg>
      <div className="statemap__legend">
        <span>{measure.label}</span>
        <span className="statemap__ramp" style={{ background: `linear-gradient(90deg, ${(measure.diverging ? DIVERGING : SEQUENTIAL).join(', ')})` }} aria-hidden="true" />
        <span className="statemap__stops">
          {legendStops.map((v, i) => (
            <span key={i}>{measure.format(v)}</span>
          ))}
        </span>
      </div>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Breakdowns
// ---------------------------------------------------------------------------

function Breakdowns({ model, pops, baseline }: { model: PopModelData; pops: PopsState; baseline: Pick<PopsState, 'keys' | 'size'> }) {
  const codec = codecFor(model);
  const attrs = (['ethnicity', 'class', 'religion', 'settlement', 'age'] as const)
    .map((r) => (codec.role[r] !== undefined ? codec.attributes[codec.role[r]!]! : undefined))
    .filter((a) => a !== undefined);
  const total = totalPeople(pops);
  const totalThen = totalPeople(baseline);
  return (
    <section className="breakdowns" aria-label="Breakdowns">
      {attrs.map((attr) => {
        const now = peopleBy(model, pops, attr.id);
        const then = peopleBy(model, baseline, attr.id);
        const top = Math.max(...now.map((x) => x / total));
        return (
          <div key={attr.id} className="panel breakdown">
            <h3 className="breakdown__title">{attr.label}</h3>
            <ul className="breakdown__rows">
              {attr.categories.map((c, i) => {
                const share = now[i]! / total;
                const change = share - then[i]! / totalThen;
                return (
                  <li key={c.id} className="breakdown__row">
                    <span className="breakdown__label">{c.label}</span>
                    <span className="breakdown__bar" aria-hidden="true">
                      <span style={{ width: `${(share / top) * 100}%` }} />
                    </span>
                    <span className="breakdown__share">{pct(share)}</span>
                    <span className={`breakdown__change${Math.abs(change) < 0.0005 ? '' : change > 0 ? ' breakdown__change--up' : ' breakdown__change--down'}`}>
                      {Math.abs(change) < 0.0005 ? '—' : pts(change)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Region table
// ---------------------------------------------------------------------------

type SortKey = 'name' | 'people' | 'change' | 'black' | 'urban' | 'farm' | 'catholic';

function RegionTable({ model, pops, baseline, regionId }: { model: PopModelData; pops: PopsState; baseline: Pick<PopsState, 'keys' | 'size'>; regionId: string }) {
  const measures = useMeasures(model, pops, baseline);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'people', desc: true });
  const cats = model.attributes.find((a) => a.id === regionId)!.categories;
  const columns = (['people', 'change', 'black', 'urban', 'farm', 'catholic'] as const).map((id) => measures.find((m) => m.id === id)).filter((m) => m !== undefined);
  const rows = cats.map((c, i) => ({ name: c.label, group: c.group, i }));
  rows.sort((a, b) => {
    const dir = sort.desc ? -1 : 1;
    if (sort.key === 'name') return dir * a.name.localeCompare(b.name);
    const m = measures.find((x) => x.id === sort.key)!;
    return dir * (m.values[a.i]! - m.values[b.i]!);
  });
  const header = (key: SortKey, label: string, num = true) => (
    <th scope="col" className={num ? 'num' : undefined} aria-sort={sort.key === key ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
      <button type="button" className="sortbtn" onClick={() => setSort({ key, desc: sort.key === key ? !sort.desc : key !== 'name' })}>
        {label}
        {sort.key === key ? (sort.desc ? ' ↓' : ' ↑') : ''}
      </button>
    </th>
  );
  return (
    <section className="panel regions" aria-labelledby="regions-title">
      <h3 id="regions-title" className="breakdown__title">
        {model.attributes.find((a) => a.id === regionId)!.label}s
      </h3>
      <div className="table-scroll">
        <table className="sheet regions__table">
          <thead>
            <tr>
              {header('name', 'Name', false)}
              {columns.map((m) => header(m.id as SortKey, m.id === 'people' ? 'Population' : m.id === 'change' ? 'Change' : m.label))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <th scope="row">
                  {r.name}
                  {r.group && <span className="regions__group">{r.group}</span>}
                </th>
                {columns.map((m) => (
                  <td key={m.id} className="num">
                    {m.format(m.values[r.i]!)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
