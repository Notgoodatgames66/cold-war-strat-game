import { useCallback, useEffect, useState } from 'react';
import { content } from './sim/loadContent';
import { deserializeGame, serializeGame } from './sim/save';
import type { GameState, PlayerOrders } from './sim/schema';
import { formatDate, formatDateLong } from './sim/time';
import { canAdvance, totalTurns } from './sim/turn';
import { createGame } from './sim/world';
import { EconomyScreen } from './ui/EconomyScreen';
import { EngineRoom } from './ui/EngineRoom';
import { FilingCabinet } from './ui/FilingCabinet';
import { IndustryScreen } from './ui/IndustryScreen';
import { billsStatus } from './ui/bills';
import { formatStat } from './ui/format';
import { resolveTurn } from './ui/simClient';
import { PoliticsScreen } from './ui/PoliticsScreen';
import { PopulationScreen } from './ui/PopulationScreen';
import { SituationScreen } from './ui/SituationScreen';
import { SuperEvent } from './ui/SuperEvent';
import { AUTOSAVE_KEY, readSlot, writeSlot } from './ui/storage';

const SCENARIO_ID = 'usa-1949';

const TABS = [
  { id: 'situation', label: 'Situation' },
  { id: 'economy', label: 'Economy' },
  { id: 'industry', label: 'Industry' },
  { id: 'politics', label: 'Politics' },
  { id: 'population', label: 'Population' },
  { id: 'files', label: 'Files' },
] as const;
type TabId = (typeof TABS)[number]['id'];

interface Boot {
  game: GameState;
  status: string;
  isNew: boolean;
}

function boot(): Boot {
  const autosave = readSlot(AUTOSAVE_KEY);
  if (autosave) {
    try {
      const game = deserializeGame(autosave, content);
      return { game, status: `Resumed your autosaved game at ${formatDate(game.date)}.`, isNew: false };
    } catch {
      // An autosave from an incompatible build: start fresh.
    }
  }
  return { game: createGame(content, SCENARIO_ID), status: 'New game started. Your first briefing is on the wire.', isNew: true };
}

function countOrders(draft: PlayerOrders): number {
  return (
    Object.keys(draft.budget ?? {}).length +
    Object.keys(draft.taxes ?? {}).length +
    (draft.budgetIndexed !== undefined ? 1 : 0)
  );
}

export function App() {
  const [initial] = useState(boot);
  const [game, setGame] = useState<GameState>(initial.game);
  const [status, setStatus] = useState(initial.status);
  const [busy, setBusy] = useState(false);
  const [lastMs, setLastMs] = useState<number | null>(null);
  const [draft, setDraft] = useState<PlayerOrders>({});
  const [tab, setTab] = useState<TabId>('situation');
  const [showOpening, setShowOpening] = useState(initial.isNew);

  const scenario = content.scenarios[game.scenarioId];
  const player = game.nations[game.playerNation];
  const others = Object.values(game.nations).filter((n) => n.id !== game.playerNation);
  const finished = !canAdvance(game);
  const pending = countOrders(draft);

  useEffect(() => {
    writeSlot(AUTOSAVE_KEY, serializeGame(game));
  }, [game]);

  const endTurn = useCallback(async () => {
    if (busy || !canAdvance(game)) return;
    setBusy(true);
    const t0 = performance.now();
    try {
      const next = await resolveTurn(game, draft);
      setLastMs(performance.now() - t0);
      setGame(next);
      setDraft({});
      const orders = countOrders(draft);
      const congress = billsStatus(next.nations[next.playerNation]?.politics?.lastBills ?? []);
      setStatus(
        `${formatDate(game.date)} resolved${orders ? ` with ${orders} order${orders === 1 ? '' : 's'}` : ''}.${congress ? ` ${congress}` : ''} It is now ${formatDateLong(next.date)}.`,
      );
    } catch (err) {
      setStatus(`The turn could not be resolved: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }, [busy, game, draft]);

  const load = (next: GameState, message: string) => {
    setGame(next);
    setDraft({});
    setLastMs(null);
    setStatus(message);
    setShowOpening(next.turn === 1);
  };

  const indicator = (nation: typeof player, id: string) => {
    const def = content.stats.find((d) => d.id === id);
    const value = nation?.stats[id];
    return def && value !== undefined ? { text: formatStat(value, def), value } : null;
  };
  const rival = others.find((n) => n.tier === 'main_rival');
  const indicators = [
    { label: 'GDP', id: 'gdp_real' },
    { label: 'Growth', id: 'real_growth', signed: true },
    { label: 'Unemployed', id: 'unemployment' },
    { label: 'Budget', id: 'budget_balance', signed: true },
    { label: 'Approval', id: 'approval' },
  ];
  const warheads = indicator(player, 'nuclear_warheads');
  const rivalWarheads = indicator(rival, 'nuclear_warheads');

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__brand">
          <span className="topbar__title">Cold War</span>
          <span className="topbar__nation">{player?.shortName ?? scenario?.name}</span>
        </div>
        <div className="topbar__date" aria-live="polite">
          <span className="topbar__quarter">{formatDate(game.date)}</span>
          <span className="topbar__months">
            {formatDateLong(game.date)} · turn {game.turn} of {totalTurns(game)}
          </span>
        </div>
        <dl className="topbar__figures">
          {indicators.map(({ label, id, signed }) => {
            const ind = indicator(player, id);
            if (!ind) return null;
            const tone = signed ? (ind.value < 0 ? ' figure--bad' : ind.value > 0 ? ' figure--good' : '') : '';
            return (
              <div key={id} className={`figure${tone}`}>
                <dt>{label}</dt>
                <dd>{signed && ind.value > 0 ? `+${ind.text}` : ind.text}</dd>
              </div>
            );
          })}
          {warheads && (
            <div className="figure">
              <dt>Warheads</dt>
              <dd>
                {warheads.text}
                {rivalWarheads && <span className="figure__rival"> / {rivalWarheads.text}</span>}
              </dd>
            </div>
          )}
        </dl>
        <button type="button" className="btn btn--primary end-turn" onClick={endTurn} disabled={busy || finished}>
          {finished ? 'Complete' : busy ? 'Resolving…' : 'End turn'}
          {pending > 0 && !busy && !finished && <span className="end-turn__orders">{pending}</span>}
        </button>
      </header>

      <main className="main">
        {tab === 'situation' && <SituationScreen game={game} status={status} onOpenEconomy={() => setTab('economy')} />}

        {tab === 'economy' && (
          <div className="screen">
            <EconomyScreen game={game} draft={draft} onDraft={setDraft} />
          </div>
        )}

        {tab === 'industry' && (
          <div className="screen">
            <IndustryScreen game={game} />
          </div>
        )}

        {tab === 'politics' && (
          <div className="screen">
            <PoliticsScreen game={game} />
          </div>
        )}

        {tab === 'population' && (
          <div className="screen">
            <PopulationScreen game={game} />
          </div>
        )}

        {tab === 'files' && (
          <div className="screen">
            <div className="lower">
              <EngineRoom game={game} lastResolutionMs={lastMs} />
              <FilingCabinet game={game} scenarioId={SCENARIO_ID} onLoad={load} onStatus={setStatus} />
            </div>
          </div>
        )}
      </main>

      <nav className="dock" aria-label="Screens">
        <div className="dock__tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`dock__tab${tab === t.id ? ' dock__tab--active' : ''}`}
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {t.id === 'economy' && pending > 0 && <span className="dock__badge">{pending}</span>}
            </button>
          ))}
        </div>
        <p className="dock__status" aria-live="polite">
          {pending > 0 && !busy ? `${pending} order${pending === 1 ? '' : 's'} ready to send. ` : ''}
          {status}
        </p>
        <p className="dock__build">Phase 3 build</p>
      </nav>

      {showOpening && scenario?.opening && <SuperEvent event={scenario.opening} onClose={() => setShowOpening(false)} />}
    </div>
  );
}
