/**
 * The Situation screen: the world map first, with the selected nation's
 * dossier and the news wire floating over it, then the full dossiers and the
 * balance of power below.
 */

import { useState } from 'react';
import { content } from '../sim/loadContent';
import type { GameState, NationState } from '../sim/schema';
import { compareDates, formatDateLong } from '../sim/time';
import { BalanceOfPower } from './BalanceOfPower';
import { formatChange, formatStat } from './format';
import { prepareMap } from './mapData';
import { NationDossier } from './NationDossier';
import { WorldMap } from './WorldMap';

interface Props {
  game: GameState;
  status: string;
  onOpenEconomy(): void;
}

const TIER_LABELS: Record<NationState['tier'], string> = {
  player: 'Your nation',
  main_rival: 'Main rival',
  major: 'Major power',
  regional: 'Regional power',
  minor: 'Minor state',
};

/** The figures the map panel shows, in order of preference; the first six a nation has are used. */
const PANEL_STATS = [
  'gdp_real',
  'real_growth',
  'unemployment',
  'inflation',
  'industrial_output',
  'steel_output',
  'public_debt',
  'defence_spending',
  'nuclear_warheads',
  'savings_overhang',
];

export function SituationScreen({ game, status, onOpenEconomy }: Props) {
  const [selected, setSelected] = useState(game.playerNation);
  const nations = Object.values(game.nations);
  const nation = game.nations[selected] ?? game.nations[game.playerNation]!;
  const previous = game.history.length > 1 ? game.history[game.history.length - 2] : undefined;
  const scenario = content.scenarios[game.scenarioId];
  const crises = prepareMap().hotspots.filter((h) => compareDates(game.date, h.until) <= 0);

  const panelStats = PANEL_STATS.map((id) => content.stats.find((s) => s.id === id))
    .filter((def) => def && nation.stats[def.id] !== undefined)
    .slice(0, 6);

  return (
    <div className="situation">
      <section className="theatre" aria-label="World situation">
        <WorldMap date={game.date} playerNation={game.playerNation} selected={nation.id} onSelect={setSelected} />

        <aside className={`panel mapdossier mapdossier--${nation.tier}`} aria-label={`${nation.shortName} at a glance`}>
          <div className="mapdossier__switch" role="group" aria-label="Show nation">
            {nations.map((n) => (
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
          <p className="eyebrow">{TIER_LABELS[nation.tier]}</p>
          <h2 className="mapdossier__name">{nation.shortName}</h2>
          <p className="mapdossier__leader">
            {nation.government.leader.title} {nation.government.leader.name}
          </p>
          {nation.tier !== 'player' && <span className="tag tag--amber">Developer view · true figures</span>}
          <dl className="mapdossier__stats">
            {panelStats.map((def) => {
              const value = nation.stats[def!.id]!;
              const change = formatChange(value, previous?.stats[nation.id]?.[def!.id], def!);
              return (
                <div key={def!.id}>
                  <dt>{def!.label}</dt>
                  <dd>
                    {formatStat(value, def!)}
                    {change && <span className="mapdossier__change">{change}</span>}
                  </dd>
                </div>
              );
            })}
          </dl>
          <div className="mapdossier__links">
            {nation.id === game.playerNation && (
              <button type="button" className="linkbtn" onClick={onOpenEconomy}>
                National accounts →
              </button>
            )}
            <a className="linkbtn" href={`#dossier-${nation.id}`}>
              Full dossier ↓
            </a>
          </div>
        </aside>

        <aside className="panel wire" aria-label="News wire" aria-live="polite">
          <p className="wire__head">
            <span>Wire · {formatDateLong(game.date)}</span>
            <span className="wire__pulse" aria-hidden="true" />
          </p>
          <ul className="wire__items">
            {game.turn === 1 && scenario ? (
              <li>
                <span className="eyebrow eyebrow--amber">Briefing</span>
                <span className="wire__text">{scenario.description}</span>
              </li>
            ) : (
              <li>
                <span className="eyebrow eyebrow--muted">Desk</span>
                <span className="wire__text">{status}</span>
              </li>
            )}
            {crises.length > 0 && (
              <li>
                <span className="eyebrow eyebrow--ochre">
                  {crises.length} live {crises.length === 1 ? 'crisis' : 'crises'}
                </span>
                <span className="wire__text wire__text--small">{crises.map((h) => h.label).join(' · ')}</span>
              </li>
            )}
          </ul>
        </aside>

        <p className="theatre__credit">Natural Earth projection · borders approximate</p>

        <ul className="legend" aria-label="Map key">
          {prepareMap().blocs.map((b) => (
            <li key={b.id}>
              <span className={`legend__swatch worldmap__country--${b.id}`} aria-hidden="true" />
              {b.label}
            </li>
          ))}
        </ul>
      </section>

      <div className="screen">
        <div className="dossiers">
          {nations.map((n) => (
            <NationDossier key={n.id} nation={n} previousStats={previous?.stats[n.id]} />
          ))}
        </div>
        <BalanceOfPower game={game} />
      </div>
    </div>
  );
}
