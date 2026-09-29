import type { GameState } from '../sim/schema';
import { SYSTEMS } from '../sim/systems';
import { formatDate } from '../sim/time';
import { stateChecksum } from '../sim/turn';

interface Props {
  game: GameState;
  lastResolutionMs: number | null;
}

const systemLabel = (id: string) => SYSTEMS.find((s) => s.id === id)?.label ?? id;

export function EngineRoom({ game, lastResolutionMs }: Props) {
  const recent = game.log.slice(-6).reverse();
  return (
    <section className="engine" aria-labelledby="engine-title">
      <h2 id="engine-title" className="engine__title">
        Engine room
      </h2>
      <dl className="engine__facts">
        <div>
          <dt>World seed</dt>
          <dd>{game.seed}</dd>
        </div>
        <div>
          <dt>State checksum</dt>
          <dd>{stateChecksum(game)}</dd>
        </div>
        <div>
          <dt>Last resolution</dt>
          <dd>{lastResolutionMs === null ? '—' : `${lastResolutionMs.toFixed(0)} ms of a 10,000 ms budget`}</dd>
        </div>
        <div>
          <dt>Systems</dt>
          <dd>
            {SYSTEMS.map((s) => `${s.label} (${s.frequency})`).join(', ')}
          </dd>
        </div>
      </dl>

      <h3 className="engine__subtitle">Turn log</h3>
      {recent.length === 0 ? (
        <p className="engine__empty">No turns resolved yet. Press End Turn.</p>
      ) : (
        <ol className="engine__log">
          {recent.map((entry) => (
            <li key={`${entry.resolved.year}-${entry.resolved.quarter}`}>
              <span className="engine__log-date">{formatDate(entry.resolved)}</span>
              <span>
                {entry.systemsRun.length ? entry.systemsRun.map(systemLabel).join(', ') : 'No systems due'}
              </span>
              <code>{entry.checksum}</code>
            </li>
          ))}
        </ol>
      )}
      <p className="engine__note">
        Same seed plus the same choices always gives the same checksum. Yearly systems run when Q4 resolves.
      </p>
    </section>
  );
}
