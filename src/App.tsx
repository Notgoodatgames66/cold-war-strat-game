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
import { NationDossier } from './ui/NationDossier';
import { resolveTurn } from './ui/simClient';
import { AUTOSAVE_KEY, readSlot, writeSlot } from './ui/storage';

const SCENARIO_ID = 'usa-1949';

const TABS = [
  { id: 'situation', label: 'Situation' },
  { id: 'economy', label: 'Economy' },
  { id: 'industry', label: 'Industry' },
  { id: 'files', label: 'Files' },
] as const;
type TabId = (typeof TABS)[number]['id'];

interface Boot {
  game: GameState;
  status: string;
}

function boot(): Boot {
  const autosave = readSlot(AUTOSAVE_KEY);
  if (autosave) {
    try {
      const game = deserializeGame(autosave, content);
      return { game, status: `Resumed your autosaved game at ${formatDate(game.date)}.` };
    } catch {
      // An autosave from an incompatible build: start fresh.
    }
  }
  return { game: createGame(content, SCENARIO_ID), status: 'New game started. The situation file is on your desk.' };
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

  const scenario = content.scenarios[game.scenarioId];
  const player = game.nations[game.playerNation];
  const others = Object.values(game.nations).filter((n) => n.id !== game.playerNation);
  const previous = game.history.length > 1 ? game.history[game.history.length - 2] : undefined;
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
      setStatus(
        `${formatDate(game.date)} resolved${orders ? ` with ${orders} order${orders === 1 ? '' : 's'}` : ''}. It is now ${formatDateLong(next.date)}.`,
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
  };

  return (
    <div className="desk">
      <header className="folder">
        <div className="folder__tab">National Situation File</div>
        <div className="folder__body">
          <div>
            <p className="folder__kicker">{scenario?.name ?? game.scenarioId}</p>
            <h1 className="folder__title">Cold War Grand Strategy</h1>
          </div>
          <p className="stamp" aria-hidden="true">
            Top Secret
          </p>
        </div>
      </header>

      <section className="calendar" aria-live="polite">
        <div className="calendar__date">
          <p className="calendar__quarter">{formatDate(game.date)}</p>
          <p className="calendar__months">
            {formatDateLong(game.date)} · Turn {game.turn} of {totalTurns(game)}
          </p>
        </div>
        <div className="calendar__action">
          <button type="button" className="end-turn" onClick={endTurn} disabled={busy || finished}>
            {finished ? 'Simulation complete' : busy ? 'Resolving…' : 'End turn'}
          </button>
          <p className="calendar__status">
            {pending > 0 && !busy ? `${pending} order${pending === 1 ? '' : 's'} ready to send. ` : ''}
            {status}
          </p>
        </div>
      </section>

      <nav className="tabs" aria-label="Screens">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tabs__tab${tab === t.id ? ' tabs__tab--active' : ''}`}
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === 'economy' && pending > 0 && <span className="tabs__badge">{pending}</span>}
          </button>
        ))}
      </nav>

      <main className="screen">
        {tab === 'situation' && (
          <>
            {game.turn === 1 && scenario && <p className="briefing">{scenario.description}</p>}
            <div className="dossiers">
              {player && <NationDossier nation={player} previousStats={previous?.stats[player.id]} />}
              {others.map((nation) => (
                <NationDossier key={nation.id} nation={nation} previousStats={previous?.stats[nation.id]} />
              ))}
            </div>
          </>
        )}

        {tab === 'economy' && <EconomyScreen game={game} draft={draft} onDraft={setDraft} />}

        {tab === 'industry' && <IndustryScreen game={game} />}

        {tab === 'files' && (
          <div className="lower">
            <EngineRoom game={game} lastResolutionMs={lastMs} />
            <FilingCabinet game={game} scenarioId={SCENARIO_ID} onLoad={load} onStatus={setStatus} />
          </div>
        )}
      </main>

      <footer className="colophon">Phase 2B build · the US economy and its seven industries are live · the Soviet economy comes next</footer>
    </div>
  );
}
