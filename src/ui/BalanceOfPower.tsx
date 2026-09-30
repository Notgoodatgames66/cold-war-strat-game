/**
 * The balance of power: the player's nation against its main rival, quarter
 * by quarter, on the measures that decide a long contest: output, defence,
 * steel and industry.
 *
 * Until intelligence arrives (Phase 3) the rival's figures are the
 * simulation's true values, and the panel says so.
 */

import { content } from '../sim/loadContent';
import type { GameState, NationState } from '../sim/schema';
import { formatDate } from '../sim/time';
import { LineChart, type ChartPoint, type ChartSeries } from './LineChart';

interface Props {
  game: GameState;
}

const CHARTS: { stat: string; subtitle: string }[] = [
  { stat: 'gdp_real', subtitle: '1949 dollars, annual rate' },
  { stat: 'defence_spending', subtitle: 'Current dollars, annual rate' },
  { stat: 'steel_output', subtitle: 'Million tonnes a year' },
  { stat: 'industrial_output', subtitle: 'Index, 1949 = 100' },
];

const pct = (v: number) => `${Math.round(v * 100)}%`;
const pct1 = (v: number) => `${(v * 100).toFixed(1)}%`;

export function BalanceOfPower({ game }: Props) {
  const player = game.nations[game.playerNation];
  const rival = Object.values(game.nations).find((n) => n.tier === 'main_rival');
  if (!player || !rival || rival.stats.gdp_real === undefined || player.stats.gdp_real === undefined) return null;

  const both = game.history.filter(
    (h) => h.stats[player.id]?.gdp_real !== undefined && h.stats[rival.id]?.gdp_real !== undefined,
  );
  const points = (nation: NationState, stat: string): ChartPoint[] =>
    both.map((h) => ({ label: formatDate(h.date), year: h.date.year, value: h.stats[nation.id]?.[stat] ?? NaN }));
  const series = (stat: string): ChartSeries[] => [
    { name: player.shortName, tone: 'player', points: points(player, stat) },
    { name: rival.shortName, tone: 'rival', points: points(rival, stat) },
  ];

  const ratio = rival.stats.gdp_real / player.stats.gdp_real;
  const start = both[0];
  const startRatio = start ? start.stats[rival.id]!.gdp_real! / start.stats[player.id]!.gdp_real! : null;
  const defenceShare = (n: NationState) =>
    n.stats.defence_spending !== undefined && n.stats.gdp_nominal ? n.stats.defence_spending / n.stats.gdp_nominal : null;
  const playerDefence = defenceShare(player);
  const rivalDefence = defenceShare(rival);

  return (
    <section className="balance" aria-labelledby="balance-title">
      <h2 id="balance-title" className="section-title">
        Balance of power
      </h2>
      <dl className="balance__figures">
        <div>
          <dt>
            {rival.shortName} output as a share of {player.shortName} output
          </dt>
          <dd>
            {pct(ratio)}
            {startRatio !== null && start && pct(startRatio) !== pct(ratio) && (
              <span className="balance__then">
                {' '}
                ({pct(startRatio)} in {start.date.year})
              </span>
            )}
          </dd>
        </div>
        {playerDefence !== null && rivalDefence !== null && (
          <div>
            <dt>Defence as a share of output</dt>
            <dd>
              {player.shortName} {pct1(playerDefence)} · {rival.shortName} {pct1(rivalDefence)}
            </dd>
          </div>
        )}
      </dl>
      <p className="devnote" role="note">
        <span className="devnote__tag">Developer view</span> These are the {rival.shortName}’s true figures. From Phase 3,
        intelligence estimates with error ranges replace them.
      </p>
      {both.length < 2 ? (
        <p className="empty">Comparison charts appear after your first turn.</p>
      ) : (
        <div className="charts">
          {CHARTS.map(({ stat, subtitle }) => {
            const def = content.stats.find((s) => s.id === stat);
            if (!def || player.stats[stat] === undefined || rival.stats[stat] === undefined) return null;
            return <LineChart key={stat} def={def} subtitle={subtitle} series={series(stat)} />;
          })}
        </div>
      )}
    </section>
  );
}
