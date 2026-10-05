/**
 * A bill on the Treasury desk (its odds, the capital spent on it and the whip
 * count by faction) and the record of last quarter's votes. The numbers come
 * from the engine; this only lays them out.
 */

import { useState } from 'react';
import type { BillPreview } from '../sim/politics/bills';
import type { BillResult, PoliticsModelData } from '../sim/politics/types';
import { billHeadline, factionColours, oddsText, tallyText } from './bills';

const CAPITAL_STEP = 5;

export function BillStrip({ bill, model, left, onCapital }: { bill: BillPreview; model: PoliticsModelData; left: number; onCapital(v: number): void }) {
  const [open, setOpen] = useState(false);
  const colours = factionColours(model);
  const tone = bill.odds >= 0.66 ? 'good' : bill.odds >= 0.33 ? 'mid' : 'bad';
  const share = (x: number) => `${Math.round(x * 100)}%`;
  return (
    <div className={`bill bill--${tone}`}>
      <div className="bill__row">
        <span className="bill__tag">Bill</span>
        <span className="bill__meter" aria-hidden="true">
          <span style={{ width: `${bill.odds * 100}%` }} />
        </span>
        <span className="bill__odds">{oddsText(bill.odds)} to pass</span>
      </div>
      <div className="bill__row">
        <span className="bill__capital">
          <span className="bill__label">Capital</span>
          <button type="button" className="bill__step" aria-label="Spend less capital" disabled={bill.capital <= 0} onClick={() => onCapital(Math.max(0, bill.capital - CAPITAL_STEP))}>
            −
          </button>
          <output className="bill__spent" aria-label="Capital spent on this bill">
            {bill.capital}
          </output>
          <button type="button" className="bill__step" aria-label="Spend more capital" disabled={left <= 0} onClick={() => onCapital(bill.capital + Math.min(CAPITAL_STEP, left))}>
            +
          </button>
        </span>
        <button type="button" className="bill__more" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Hide whip count' : 'Whip count'}
        </button>
      </div>
      {open && (
        <div className="bill__count">
          <ul className="bill__factions">
            {model.legislature.factions.map((f) => (
              <li key={f.id} title={f.description}>
                <span className="faction__swatch" style={{ background: colours[f.id] }} aria-hidden="true" />
                <span className="bill__faction">{f.label}</span>
                <span className="bill__bar" aria-hidden="true">
                  <span style={{ width: share(bill.factions[f.id] ?? 0), background: colours[f.id] }} />
                </span>
                <span className="bill__yes">{share(bill.factions[f.id] ?? 0)} yes</span>
              </li>
            ))}
          </ul>
          <p className="bill__chambers">
            {model.legislature.chambers
              .map((ch) => `${ch.label}: ${share(bill.votes[ch.id] ?? 0)} expected yes, ${oddsText(bill.chambers[ch.id] ?? 0)} to pass`)
              .join(' · ')}
          </p>
        </div>
      )}
    </div>
  );
}

export function LastBills({ model, bills }: { model: PoliticsModelData; bills: BillResult[] }) {
  return (
    <div className="lastbills">
      <span className="eyebrow eyebrow--muted">Last quarter in Congress</span>
      <ul>
        {bills.map((b) => (
          <li key={b.lever} className={b.passed ? 'is-passed' : 'is-failed'}>
            <span className="lastbills__verdict">{b.passed ? 'Passed' : 'Defeated'}</span>
            <span className="lastbills__what">{billHeadline(b)}</span>
            <span className="lastbills__tally">
              {tallyText(model, b)} · odds were {oddsText(b.odds)}
              {b.capital > 0 && ` · ${b.capital} capital`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
