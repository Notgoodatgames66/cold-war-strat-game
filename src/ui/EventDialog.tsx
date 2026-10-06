/**
 * An event, presented by tier: super-events fill the screen (TNO-style),
 * decisions are cards, cables and wire stories are telegrams. Options show
 * what they will do in plain words; the choice is sent with the turn's
 * orders, so the player can change their mind until the turn ends.
 */

import { useEffect, useRef } from 'react';
import type { EventData } from '../sim/events/types';
import type { GameState } from '../sim/schema';
import { describeEffects, optionsFor, TIER_LABEL } from './events';

interface Props {
  game: GameState;
  event: EventData;
  /** Set when the event is waiting for the player's answer. */
  pendingKey?: string;
  /** The option chosen in this turn's draft, if any. */
  chosen?: string;
  /** The option taken, for events already decided. */
  taken?: string;
  onChoose(option: string): void;
  onClose(): void;
}

export function EventDialog({ game, event, pendingKey, chosen, taken, onChoose, onClose }: Props) {
  const first = useRef<HTMLButtonElement>(null);
  const deciding = pendingKey !== undefined;
  const options = deciding ? optionsFor(game, event) : (event.options ?? []).filter((o) => o.id === taken);
  const immediate = describeEffects(event.effects, game, event.nation);
  const defaultId = (options.find((o) => o.default) ?? options[0])?.id;

  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={`superevent eventdialog eventdialog--${event.tier}`} role="dialog" aria-modal="true" aria-labelledby="event-title">
      <div className="superevent__card eventdialog__card">
        <p className="superevent__kicker">
          <span className="eventdialog__tier">{TIER_LABEL[event.tier]}</span> · {event.kicker}
        </p>
        <h1 id="event-title" className="superevent__headline eventdialog__headline">
          {event.headline}
        </h1>
        <div className="superevent__body eventdialog__body">
          {event.paragraphs.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
        {event.quote && (
          <blockquote className="superevent__quote">
            {event.quote.text}
            <cite>{event.quote.source}</cite>
          </blockquote>
        )}
        {immediate.length > 0 && (
          <div className="eventdialog__fallout">
            <p className="eyebrow eyebrow--muted">Already happening</p>
            <ul>
              {immediate.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        )}

        {options.length > 0 && (
          <div className="eventdialog__options" role={deciding ? 'radiogroup' : undefined} aria-label="Your options">
            {deciding && <p className="eyebrow">Your decision</p>}
            {options.map((o, i) => {
              const selected = deciding ? (chosen ?? defaultId) === o.id : true;
              const effects = describeEffects(o.effects, game, event.nation);
              return (
                <button
                  key={o.id}
                  ref={i === 0 ? first : undefined}
                  type="button"
                  role={deciding ? 'radio' : undefined}
                  aria-checked={deciding ? selected : undefined}
                  className={`eventoption${selected ? ' eventoption--on' : ''}`}
                  disabled={!deciding}
                  onClick={() => onChoose(o.id)}
                >
                  <span className="eventoption__label">
                    {o.label}
                    {deciding && o.id === defaultId && <span className="eventoption__history">What happened</span>}
                  </span>
                  <span className="eventoption__desc">{o.description}</span>
                  {effects.length > 0 && (
                    <ul className="eventoption__effects">
                      {effects.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <div className="eventdialog__actions">
          {deciding ? (
            <>
              <p className="eventdialog__hint">
                Your answer goes with this turn's orders. Left unanswered, the event takes what happened in history.
              </p>
              <button type="button" className="btn" onClick={onClose}>
                Decide later
              </button>
            </>
          ) : (
            <button ref={options.length === 0 ? first : undefined} type="button" className="btn btn--primary superevent__action" onClick={onClose}>
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
