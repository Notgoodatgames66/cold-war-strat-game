/**
 * A full-screen "super-event": the presentation for the moments that change
 * the game. For now it opens a new game; the Phase 3 events engine will use it
 * for the big ones (the Soviet bomb, Korea, Sputnik).
 */

import { useEffect, useRef } from 'react';

export interface SuperEventContent {
  kicker: string;
  headline: string;
  paragraphs: string[];
  quote?: { text: string; source: string };
  action: string;
}

interface Props {
  event: SuperEventContent;
  onClose(): void;
}

export function SuperEvent({ event, onClose }: Props) {
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    button.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="superevent" role="dialog" aria-modal="true" aria-labelledby="superevent-title">
      <div className="superevent__card">
        <p className="superevent__kicker">{event.kicker}</p>
        <h1 id="superevent-title" className="superevent__headline">
          {event.headline}
        </h1>
        <div className="superevent__body">
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
        <button ref={button} type="button" className="btn btn--primary superevent__action" onClick={onClose}>
          {event.action}
        </button>
      </div>
    </div>
  );
}
