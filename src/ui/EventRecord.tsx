/**
 * The record: every event so far, newest first, with what was decided.
 */

import type { GameState } from '../sim/schema';
import { formatDate } from '../sim/time';
import { eventData, TIER_LABEL } from './events';

interface Props {
  game: GameState;
  onOpenEvent(key: string): void;
}

export function EventRecord({ game, onOpenEvent }: Props) {
  const rows = [...game.events.record]
    .reverse()
    .map((record) => ({ record, event: eventData(record.event), date: game.history[record.turn - 1]?.date }))
    .filter((r) => r.event && r.date);
  if (rows.length === 0) return null;
  const pending = new Set(game.events.pending.map((p) => p.key));

  return (
    <section className="eventrecord" aria-labelledby="eventrecord-title">
      <h2 id="eventrecord-title" className="section-title">
        The record
      </h2>
      <ol className="eventrecord__list">
        {rows.map(({ record, event, date }) => {
          const option = event!.options?.find((o) => o.id === record.option);
          return (
            <li key={record.key} className={`eventrecord__item eventrecord__item--${event!.tier}`}>
              <span className="eventrecord__date">{formatDate(date!)}</span>
              <span className="eventrecord__tier">{TIER_LABEL[event!.tier]}</span>
              <button type="button" className="eventrecord__headline" onClick={() => onOpenEvent(record.key)}>
                {event!.headline}
              </button>
              <span className="eventrecord__choice">
                {pending.has(record.key) ? 'Awaiting your decision' : option ? `${option.label}${record.defaulted ? ' (unanswered: what happened)' : ''}` : ''}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
