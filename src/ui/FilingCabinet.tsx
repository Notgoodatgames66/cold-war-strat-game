/**
 * Filing cabinet: saving, loading, exporting and starting new games.
 */

import { useRef, useState } from 'react';
import { content } from '../sim/loadContent';
import { deserializeGame, serializeGame } from '../sim/save';
import type { GameState } from '../sim/schema';
import { formatDate } from '../sim/time';
import { createGame } from '../sim/world';
import { MANUAL_SAVE_KEY, downloadText, readSlot, writeSlot } from './storage';

interface Props {
  game: GameState;
  scenarioId: string;
  onLoad(game: GameState, message: string): void;
  onStatus(message: string): void;
}

export function FilingCabinet({ game, scenarioId, onLoad, onStatus }: Props) {
  const [seedInput, setSeedInput] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const defaultSeed = content.scenarios[scenarioId]?.defaultSeed;

  const saveToBrowser = () => {
    const ok = writeSlot(MANUAL_SAVE_KEY, serializeGame(game, new Date().toISOString()));
    onStatus(ok ? `Saved ${formatDate(game.date)} in this browser.` : 'This browser blocked saving. Use Export instead.');
  };

  const loadFromBrowser = () => {
    const text = readSlot(MANUAL_SAVE_KEY);
    if (!text) {
      onStatus('There is no saved game in this browser yet.');
      return;
    }
    try {
      const loaded = deserializeGame(text, content);
      onLoad(loaded, `Loaded your save from ${formatDate(loaded.date)}.`);
    } catch (err) {
      onStatus(err instanceof Error ? err.message : 'That save could not be loaded.');
    }
  };

  const exportSave = () => {
    const name = `cold-war-${game.seed}-${game.date.year}-Q${game.date.quarter}.json`;
    downloadText(name, serializeGame(game, new Date().toISOString()));
    onStatus(`Exported ${name}.`);
  };

  const importSave = async (file: File | undefined) => {
    if (!file) return;
    try {
      const loaded = deserializeGame(await file.text(), content);
      onLoad(loaded, `Imported ${file.name} (${formatDate(loaded.date)}).`);
    } catch (err) {
      onStatus(err instanceof Error ? err.message : 'That file could not be loaded.');
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const newGame = () => {
    const fresh = createGame(content, scenarioId, seedInput.trim() || undefined);
    onLoad(fresh, `New game started with seed "${fresh.seed}".`);
  };

  return (
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
            placeholder={defaultSeed ?? 'any words'}
            onChange={(e) => setSeedInput(e.target.value)}
          />
        </label>
        <button type="button" onClick={newGame}>
          Start new game
        </button>
      </div>
      <p className="files__hint">The same seed recreates the same world, so you can share one with a friend.</p>
    </section>
  );
}
