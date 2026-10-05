/**
 * The Politics tab: the head of government's standing with the public, the
 * interest groups, and the legislature.
 *
 * Group and state breakdowns call the engine's own opinion functions; nothing
 * here computes a game rule.
 */

import { useMemo } from 'react';
import { content } from '../sim/loadContent';
import { blocVotes } from '../sim/politics/create';
import { leverValues } from '../sim/politics/levers';
import { approvalBy, approvalInputs, partySign, votesByRegion } from '../sim/politics/opinion';
import { capitalRegeneration } from '../sim/politics/step';
import type { InterestGroupData, PoliticsModelData, PoliticsState } from '../sim/politics/types';
import type { PopModelData } from '../sim/pops/types';
import type { GameState, NationState } from '../sim/schema';
import { formatDate } from '../sim/time';
import { LineChart, type ChartPoint } from './LineChart';
import { ELECTION_PALETTE, StateMap, hasStateMap, type MapMeasure } from './StateMap';
import { factionColours } from './bills';
import { partySeats } from './elections';
import { LastBills } from './BillPanels';

interface Props {
  game: GameState;
}

const pct = (x: number, d = 0) => `${(x * 100).toFixed(d)}%`;
const millions = (x: number) => (x >= 1e6 ? `${(x / 1e6).toFixed(1)} m` : `${Math.round(x / 1000)}k`);

export function PoliticsScreen({ game }: Props) {
  const nation = game.nations[game.playerNation];
  const politics = nation?.politics;
  const model = politics ? content.politics[politics.model] : undefined;
  const popModel = nation?.pops ? content.pops[nation.pops.model] : undefined;
  if (!nation || !politics || !model || !popModel) return <p className="empty">This nation's politics are not simulated yet.</p>;
  return <Politics game={game} nation={nation} politics={politics} model={model} popModel={popModel} />;
}

interface InnerProps {
  game: GameState;
  nation: NationState;
  politics: PoliticsState;
  model: PoliticsModelData;
  popModel: PopModelData;
}

function Politics({ game, nation, politics, model, popModel }: InnerProps) {
  const partyLabel = (id: string) => model.legislature.parties.find((p) => p.id === id)?.label ?? id;
  const history = (stat: string): ChartPoint[] =>
    game.history
      .filter((h) => h.stats[nation.id]?.[stat] !== undefined)
      .map((h) => ({ label: formatDate(h.date), year: h.date.year, value: h.stats[nation.id]![stat]! }));
  const regen = capitalRegeneration(model, politics.approval);
  const seatsHeld = (chamber: string) => {
    const seats = politics.seats[chamber] ?? {};
    return model.legislature.factions.reduce((s, f) => s + (f.party === politics.leader.party ? seats[f.id] ?? 0 : 0), 0);
  };
  const next = nextElection(model, game);

  return (
    <div className="population politics">
      <header className="population__head">
        <div>
          <p className="eyebrow">Politics · {nation.shortName}</p>
          <h2 className="section-title">The President and the people</h2>
          <p className="population__lead">
            {nation.government.leader.title} {politics.leader.name} ({partyLabel(politics.leader.party)}), quarter {politics.leader.quartersInOffice + 1} in
            office. Approval counts adults who may vote; most Black Southerners could not.
          </p>
        </div>
      </header>

      <dl className="popfigures">
        <Figure label="Approval" value={pct(politics.approval)} note={change(game, nation.id, 'approval')} tone={politics.approval >= 0.5 ? 'good' : 'bad'} />
        <Figure label="Political capital" value={politics.capital.toFixed(0)} note={`${regen >= 0 ? '+' : '−'}${Math.abs(regen).toFixed(1)} a quarter`} />
        {model.legislature.chambers.map((ch) => (
          <Figure key={ch.id} label={`${ch.label} seats held`} value={`${seatsHeld(ch.id)} of ${ch.seats}`} note={model.legislature.parties.find((p) => p.id === politics.leader.party)?.members ?? ''} />
        ))}
        {next && <Figure label="Next election" value={next.when} note={next.what} />}
      </dl>

      <OpinionPanels game={game} nation={nation} politics={politics} model={model} popModel={popModel} />

      <section aria-labelledby="groups-title">
        <h3 id="groups-title" className="section-title">
          Interest groups
        </h3>
        <div className="groups">
          {[...model.interestGroups]
            .map((g) => ({ g, s: politics.groups.find((x) => x.id === g.id)! }))
            .filter((x) => x.s)
            .sort((a, b) => b.s.clout - a.s.clout)
            .map(({ g, s }) => (
              <article key={g.id} className="panel group" title={g.note}>
                <header className="group__head">
                  <h4 className="group__name">{g.label}</h4>
                  <span className="group__clout">{pct(s.clout, 1)} clout</span>
                </header>
                <div className="group__meter" aria-label={`Approval ${pct(s.approval)}`}>
                  <span className={`group__fill ${s.approval >= 0.55 ? 'is-good' : s.approval < 0.4 ? 'is-bad' : 'is-mid'}`} style={{ width: pct(s.approval) }} />
                </div>
                <p className="group__approval">
                  Approves <strong>{pct(s.approval)}</strong> · {millions(s.members)} members · organisation {pct(s.organisation)}
                </p>
                <p className="group__desc">{g.description}</p>
                <p className="group__wants">
                  <span className="eyebrow eyebrow--muted">Wants</span> {demands(g).join(' · ')}
                </p>
              </article>
            ))}
        </div>
      </section>

      <Congress politics={politics} model={model} />

      {politics.elections.length > 0 && <Elections politics={politics} model={model} />}

      <section aria-labelledby="pol-trends">
        <h3 id="pol-trends" className="section-title">
          The record since {game.startDate.year}
        </h3>
        {game.history.length < 2 ? (
          <p className="empty">Trend charts appear after your first turn.</p>
        ) : (
          <div className="charts">
            {(['approval', 'political_capital', 'congress_support'] as const).map((stat) => {
              const def = content.stats.find((s) => s.id === stat);
              return def ? <LineChart key={stat} def={def} points={history(stat)} /> : null;
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function Figure({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: 'good' | 'bad' }) {
  return (
    <div className={`popfigure${tone ? ` popfigure--${tone}` : ''}`}>
      <dt>{label}</dt>
      <dd>
        {value}
        <span className="popfigure__change">{note || '—'}</span>
      </dd>
    </div>
  );
}

function change(game: GameState, nationId: string, stat: string): string {
  const h = game.history;
  if (h.length < 2) return '';
  const now = h[h.length - 1]!.stats[nationId]?.[stat];
  const before = h[h.length - 2]!.stats[nationId]?.[stat];
  if (now === undefined || before === undefined) return '';
  const d = now - before;
  return Math.abs(d) < 0.5 ? 'steady' : `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(0)} pts this quarter`;
}

/** The next legislative or executive election, as text. */
function nextElection(model: PoliticsModelData, game: GameState): { when: string; what: string } | null {
  const el = model.elections;
  if (!el) return null;
  for (let year = game.date.year; year <= game.endDate.year; year++) {
    const leg = year >= el.legislative.first && (year - el.legislative.first) % el.legislative.every === 0;
    const exe = year >= el.executive.first && (year - el.executive.first) % el.executive.every === 0;
    if (!leg && !exe) continue;
    if (year === game.date.year && game.date.quarter > el.legislative.quarter) continue;
    return { when: `Q${el.legislative.quarter} ${year}`, what: exe ? 'Presidential and congressional' : 'Midterm congressional' };
  }
  return null;
}

const LEVER_LABEL = (lever: string): string => {
  const [kind, id] = lever.split(':');
  if (kind === 'budget') return content.economy.budgetLines.find((l) => l.id === id)?.label.toLowerCase() ?? id!;
  if (kind === 'tax') return content.economy.taxLines.find((l) => l.id === id)?.label.toLowerCase() ?? id!;
  return 'budget indexation';
};

const CONDITION_TEXT: Record<string, [string, string]> = {
  unemployment: ['Rising unemployment', 'Jobs'],
  inflation: ['Rising prices', 'Stable prices'],
  real_growth: ['Growth', 'Slower growth'],
};

/** A group's three strongest demands, in plain words. */
export function demands(g: InterestGroupData): string[] {
  const out: { text: string; w: number }[] = [];
  for (const [lever, pref] of Object.entries(g.preferences)) {
    const up = pref > 0;
    const label = LEVER_LABEL(lever);
    const text = lever === 'indexation' ? (up ? 'Index the budget' : 'Fixed budgets') : lever.startsWith('tax:') ? `${up ? 'Higher' : 'Lower'} ${label}` : `${up ? 'More' : 'Less'} ${label}`;
    out.push({ text, w: Math.abs(pref) });
  }
  for (const [stat, coef] of Object.entries(g.conditions)) {
    const t = CONDITION_TEXT[stat];
    if (t) out.push({ text: coef > 0 ? t[0] : t[1], w: Math.abs(coef) * 5 });
  }
  return out
    .sort((a, b) => b.w - a.w)
    .slice(0, 3)
    .map((d) => d.text.charAt(0).toUpperCase() + d.text.slice(1));
}

// ---------------------------------------------------------------------------
// Opinion by group and state
// ---------------------------------------------------------------------------

function OpinionPanels({ nation, politics, model, popModel }: InnerProps) {
  const pops = nation.pops!;
  const inputs = useMemo(() => approvalInputs(model, politics, leverValues(nation.economy)), [model, politics, nation.economy]);
  const attrs = (['ethnicity', 'class', 'religion', 'settlement'] as const)
    .map((r) => popModel.attributes.find((a) => a.role === r))
    .filter((a) => a !== undefined);
  const byAttr = useMemo(
    () => attrs.map((a) => ({ attr: a, values: approvalBy(model, popModel, pops, inputs, a.id) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model, popModel, pops, inputs],
  );
  const region = popModel.attributes.find((a) => a.role === 'region');
  const measures = useMemo((): MapMeasure[] => {
    if (!region) return [];
    const approval = approvalBy(model, popModel, pops, inputs, region.id);
    const list: MapMeasure[] = [
      { id: 'approval', label: 'Approval', values: approval, format: (v) => pct(v), diverging: true, center: 0.5, minSpan: 0.15 },
    ];
    const el = model.elections;
    if (el) {
      const sign = partySign(model, politics.leader.party);
      const tide = sign * el.approvalEffect * (politics.approval * 100 - 50);
      const v = votesByRegion(model, popModel, pops, politics.calib.voteIntercept, tide);
      const first = model.legislature.parties[0]!;
      list.push({
        id: 'vote',
        label: `${first.label} vote if held today`,
        chip: `${first.label} vote`,
        values: v.first.map((f, i) => (v.total[i]! > 0 ? f / v.total[i]! : NaN)),
        format: (x) => pct(x),
        diverging: true,
        center: 0.5,
        minSpan: 0.2,
        palette: ELECTION_PALETTE,
      });
    }
    return list;
  }, [model, popModel, pops, inputs, politics, region]);
  const national = useMemo(() => {
    const el = model.elections;
    if (!el) return null;
    const sign = partySign(model, politics.leader.party);
    const tide = sign * el.approvalEffect * (politics.approval * 100 - 50);
    return blocVotes(model, popModel, votesByRegion(model, popModel, pops, politics.calib.voteIntercept, tide)).all;
  }, [model, popModel, pops, politics]);

  return (
    <div className="popgrid">
      <div className="panel breakdown approvalby">
        <span className="eyebrow">Approval by group</span>
        {byAttr.map(({ attr, values }) => (
          <div key={attr.id} className="approvalby__block">
            <h4 className="drivers__title">{attr.label}</h4>
            <ul className="breakdown__rows">
              {attr.categories.map((c, i) =>
                Number.isFinite(values[i]!) ? (
                  <li key={c.id} className="breakdown__row">
                    <span className="breakdown__label">{c.label}</span>
                    <span className="breakdown__bar approvalby__bar" aria-hidden="true">
                      <span className={values[i]! >= 0.5 ? 'is-good' : 'is-bad'} style={{ width: pct(values[i]!) }} />
                    </span>
                    <span className="breakdown__share">{pct(values[i]!)}</span>
                    <span className="breakdown__change" />
                  </li>
                ) : null,
              )}
            </ul>
          </div>
        ))}
        {national !== null && (
          <p className="approvalby__vote">
            If Congress were elected today, {model.legislature.parties[0]!.members} would take about <strong>{pct(national)}</strong> of the two-party vote.
          </p>
        )}
      </div>
      {region && hasStateMap(popModel) ? (
        <StateMap model={popModel} measures={measures} initial="approval" />
      ) : (
        <div className="panel breakdown" />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The legislature
// ---------------------------------------------------------------------------

/** Dots for a hemicycle: rows of seats on concentric arcs, filled left to right by faction order. */
function hemicycle(total: number, rows: number): { x: number; y: number }[] {
  const radii = Array.from({ length: rows }, (_, r) => 40 + (r * 60) / Math.max(1, rows - 1));
  const lengths = radii.map((r) => Math.PI * r);
  const sum = lengths.reduce((a, b) => a + b, 0);
  const counts = lengths.map((l) => Math.round((l / sum) * total));
  counts[counts.length - 1]! += total - counts.reduce((a, b) => a + b, 0);
  const dots: { x: number; y: number; a: number }[] = [];
  radii.forEach((r, ri) => {
    const n = counts[ri]!;
    for (let i = 0; i < n; i++) {
      const a = Math.PI - (Math.PI * (i + 0.5)) / n;
      dots.push({ x: 110 + r * Math.cos(a), y: 108 - r * Math.sin(a), a });
    }
  });
  return dots.sort((p, q) => q.a - p.a);
}

function Congress({ politics, model }: { politics: PoliticsState; model: PoliticsModelData }) {
  const colours = factionColours(model);
  return (
    <section aria-labelledby="congress-title">
      <h3 id="congress-title" className="section-title">
        {model.legislature.label}
      </h3>
      <div className="congress">
        {model.legislature.chambers.map((ch) => {
          const seats = politics.seats[ch.id] ?? {};
          const order = model.legislature.factions.map((f) => f.id);
          const fill: string[] = [];
          for (const id of order) for (let i = 0; i < (seats[id] ?? 0); i++) fill.push(colours[id]!);
          const dots = hemicycle(ch.seats, ch.seats > 200 ? 9 : 5);
          return (
            <figure key={ch.id} className="panel chamber">
              <figcaption className="eyebrow">
                {ch.label} · {ch.seats} seats · majority {Math.floor(ch.seats / 2) + 1}
              </figcaption>
              <svg viewBox="0 0 220 116" role="img" aria-label={`${ch.label} seats by faction`}>
                {dots.map((d, i) => (
                  <circle key={i} cx={d.x} cy={d.y} r={ch.seats > 200 ? 2.6 : 4.2} fill={fill[i] ?? '#22364a'} />
                ))}
              </svg>
            </figure>
          );
        })}
        <div className="panel factions">
          <table className="sheet">
            <thead>
              <tr>
                <th scope="col">Faction</th>
                {model.legislature.chambers.map((ch) => (
                  <th key={ch.id} scope="col" className="num">
                    {ch.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {model.legislature.factions.map((f) => (
                <tr key={f.id} title={f.description}>
                  <th scope="row">
                    <span className="faction__swatch" style={{ background: colours[f.id] }} aria-hidden="true" />
                    {f.label}
                  </th>
                  {model.legislature.chambers.map((ch) => (
                    <td key={ch.id} className="num">
                      {politics.seats[ch.id]?.[f.id] ?? 0}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="industry__note">Hover a faction for its outlook. Bills need a majority in both chambers.</p>
          {politics.lastBills.length > 0 && <LastBills model={model} bills={politics.lastBills} />}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The record of elections
// ---------------------------------------------------------------------------

function Elections({ politics, model }: { politics: PoliticsState; model: PoliticsModelData }) {
  const first = model.legislature.parties[0]!;
  const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0');
  return (
    <section aria-labelledby="elections-title">
      <h3 id="elections-title" className="section-title">
        Elections
      </h3>
      <div className="panel table-scroll">
        <table className="sheet elections">
          <thead>
            <tr>
              <th scope="col">Year</th>
              <th scope="col" className="num">
                {first.label} vote
              </th>
              {model.legislature.chambers.map((ch) => (
                <th key={ch.id} scope="col" className="num">
                  {first.members} in the {ch.label}
                </th>
              ))}
              <th scope="col">White House</th>
            </tr>
          </thead>
          <tbody>
            {[...politics.elections].reverse().map((r) => {
              const w = r.candidates?.find((c) => c.name === r.winner);
              const l = r.candidates?.find((c) => c.name !== r.winner);
              return (
                <tr key={`${r.year}-${r.kind}`}>
                  <th scope="row">
                    {r.year} <span className="elections__kind">{r.kind === 'executive' ? 'presidential' : 'midterm'}</span>
                  </th>
                  <td className="num">{(r.vote * 100).toFixed(1)}%</td>
                  {model.legislature.chambers.map((ch) => {
                    const p = partySeats(model, r, ch.id, first.id);
                    return (
                      <td key={ch.id} className="num">
                        {p.seats} <span className={`elections__change ${p.change > 0 ? 'is-up' : p.change < 0 ? 'is-down' : ''}`}>{signed(p.change)}</span>
                      </td>
                    );
                  })}
                  <td>{w && l ? `${w.name} ${w.electoral}–${l.electoral} over ${l.name}` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
