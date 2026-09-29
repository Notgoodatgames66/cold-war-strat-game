import { useCallback, useEffect, useRef, useState } from 'react';
import { content } from './sim/loadContent';
import { deserializeGame, serializeGame } from './sim/save';
import type { GameState } from './sim/schema';
import { formatDate, formatDateLong } from './sim/time';
import { canAdvance, totalTurns } from './sim/turn';
import { createGame } from './sim/world';
import { EngineRoom } from './ui/EngineRoom';
import { NationDossier } from './ui/NationDossier';
import { resolveTurn } from './ui/simClient';
import { AUTOSAVE_KEY, MANUAL_SAVE_KEY, downloadText, readSlot, writeSlot } from './ui/storage';

const SCENARIO_ID = 'usa-1949';

interface Boot {
  game: GameState;
  status: string;
}

function boot(): Boot {
  const autosave = readSlot(AUTOSAVE_KEY);
  if (autosave) {
    try {
      const game = deserializeGame(autosave);
      return { game, status: `Resumed your autosaved game at ${formatDate(game.date)}.` };
    } catch {
      // An autosave from an older, incompatible build: start fresh.
    }
  }
  return { game: createGame(content, SCENARIO_ID), status: 'New game started. The situation file is on your desk.' };
}

export function App() {
  const [initial] = useState(boot);
  const [game, setGame] = useState<GameState>(initial.game);
  const [status, setStatus] = useState(initial.status);
  const [busy, setBusy] = useState(false);
  const [lastMs, setLastMs] = useState<number | null>(null);
  const [seedInput, setSeedInput] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const scenario = content.scenarios[game.scenarioId];
  const player = game.nations[game.playerNation];
  const others = Object.values(game.nations).filter((n) => n.id !== game.playerNation);
  const previous = game.history.length > 1 ? game.history[game.history.length - 2] : undefined;
  const finished = !canAdvance(game);

  useEffect(() => {
    writeSlot(AUTOSAVE_KEY, serializeGame(game));
  }, [game]);

  const endTurn = useCallback(async () => {
    if (busy || !canAdvance(game)) return;
    setBusy(true);
    const t0 = performance.now();
    try {
      const next = await resolveTurn(game);
      setLastMs(performance.now() - t0);
      setGame(next);
      setStatus(`${formatDate(game.date)} resolved. It is now ${formatDateLong(next.date)}.`);
    } catch (err) {
      setStatus(`The turn could not be resolved: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }, [busy, game]);

  const newGame = () => {
    const seed = seedInput.trim();
    const fresh = createGame(content, SCENARIO_ID, seed || undefined);
    setGame(fresh);
    setLastMs(null);
    setStatus(`New game started with seed "${fresh.seed}".`);
  };

  const saveToBrowser = () => {
    const ok = writeSlot(MANUAL_SAVE_KEY, serializeGame(game, new Date().toISOString()));
    setStatus(ok ? `Saved ${formatDate(game.date)} in this browser.` : 'This browser blocked saving. Use Export instead.');
  };

  const loadFromBrowser = () => {
    const text = readSlot(MANUAL_SAVE_KEY);
    if (!text) {
      setStatus('There is no saved game in this browser yet.');
      return;
    }
    try {
      const loaded = deserializeGame(text);
      setGame(loaded);
      setLastMs(null);
      setStatus(`Loaded your save from ${formatDate(loaded.date)}.`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'That save could not be loaded.');
    }
  };

  const exportSave = () => {
    const name = `cold-war-${game.seed}-${game.date.year}-Q${game.date.quarter}.json`;
    downloadText(name, serializeGame(game, new Date().toISOString()));
    setStatus(`Exported ${name}.`);
  };

  const importSave = async (file: File | undefined) => {
    if (!file) return;
    try {
      const loaded = deserializeGame(await file.text());
      setGame(loaded);
      setLastMs(null);
      setStatus(`Imported ${file.name} (${formatDate(loaded.date)}).`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'That file could not be loaded.');
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
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
          <p className="calendar__months">{formatDateLong(game.date)}</p>
          <p className="calendar__turn">
            Turn {game.turn} of {totalTurns(game)}
          </p>
        </div>
        <div className="calendar__action">
          <button type="button" className="end-turn" onClick={endTurn} disabled={busy || finished}>
            {finished ? 'Simulation complete' : busy ? 'Resolving…' : 'End turn'}
          </button>
          <p className="calendar__status">{status}</p>
        </div>
      </section>

      {game.turn === 1 && scenario && <p className="briefing">{scenario.description}</p>}

      <main className="dossiers">
        {player && <NationDossier nation={player} previousStats={previous?.stats[player.id]} />}
        {others.map((nation) => (
          <NationDossier key={nation.id} nation={nation} previousStats={previous?.stats[nation.id]} />
        ))}
      </main>

      <div className="lower">
        <EngineRoom game={game} lastResolutionMs={lastMs} />

        <section className="files" aria-labelledby="files-title">
          <h2 id="files-title" className="files__title">
            Filing cabinet
          </h2>
          <div className="files__row">
            <button type="button" onClick={saveToBrowser}>
              Save
            </button>
            <button type="button" onClick={loadFromBrowser}>
              Load
            </button>
            <button type="button" onClick={exportSave}>
              Export file
            </button>
            <button type="button" onClick={() => fileInput.current?.click()}>
              Import file
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(e) => importSave(e.target.files?.[0])}
            />
          </div>
          <p className="files__hint">Save and Load use this browser. Export gives you a file you can keep or share.</p>

          <h3 className="files__subtitle">New game</h3>
          <div className="files__row">
            <label className="files__seed">
              <span>Seed</span>
              <input
                type="text"
                value={seedInput}
                placeholder={scenario?.defaultSeed ?? 'any words'}
                onChange={(e) => setSeedInput(e.target.value)}
              />
            </label>
            <button type="button" onClick={newGame}>
              Start new game
            </button>
          </div>
          <p className="files__hint">The same seed recreates the same world, so you can share one with a friend.</p>
        </section>
      </div>

      <footer className="colophon">Phase 1 build · engine foundations only · figures and systems will grow each phase</footer>
    </div>
  );
}
