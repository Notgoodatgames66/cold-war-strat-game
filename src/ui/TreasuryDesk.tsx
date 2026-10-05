/**
 * The Treasury desk: the player's budget and tax orders for the quarter.
 *
 * Changes are drafted here and only take effect when the turn ends. Budget
 * changes then phase in over several quarters; tax changes apply at once.
 * Where the nation has a legislature, every change is a bill: the desk shows
 * the engine's odds and lets the player spend political capital on it.
 */

import type { EconomyState, TaxId } from '../sim/economy/types';
import { content } from '../sim/loadContent';
import type { BillPreview } from '../sim/politics/bills';
import type { PoliticsModelData, PoliticsState } from '../sim/politics/types';
import type { PlayerOrders } from '../sim/schema';
import { BillStrip, LastBills } from './BillPanels';

export interface CongressView {
  model: PoliticsModelData;
  politics: PoliticsState;
  /** The engine's odds for the drafted changes (sim/orders.ts proposedBills). */
  bills: BillPreview[];
}

interface Props {
  economy: EconomyState;
  gdpNominal: number;
  draft: PlayerOrders;
  onDraft(next: PlayerOrders): void;
  congress?: CongressView | null;
}

const money = (v: number) => `$${v.toFixed(1)} bn`;
const pct = (v: number) => `${v.toFixed(1)}%`;

export function TreasuryDesk({ economy, gdpNominal, draft, onDraft, congress }: Props) {
  const setBudget = (id: string, value: number) =>
    onDraft({ ...draft, budget: { ...draft.budget, [id]: value } });
  const setTax = (id: string, value: number) => onDraft({ ...draft, taxes: { ...draft.taxes, [id]: value } });
  const setCapital = (lever: string, value: number) => onDraft({ ...draft, capital: { ...draft.capital, [lever]: value } });
  const indexed = draft.budgetIndexed ?? economy.budgetIndexed;
  const pending =
    Object.keys(draft.budget ?? {}).length +
    Object.keys(draft.taxes ?? {}).length +
    (draft.budgetIndexed !== undefined ? 1 : 0);
  const bills = congress?.bills ?? [];
  const available = congress ? Math.floor(congress.politics.capital) : 0;
  const committed = bills.reduce((s, b) => s + b.capital, 0);
  const left = available - committed;
  const bill = (lever: string) => {
    const b = bills.find((x) => x.lever === lever);
    return b && congress ? <BillStrip bill={b} model={congress.model} left={left} onCapital={(v) => setCapital(lever, v)} /> : null;
  };

  return (
    <section className="treasury" aria-labelledby="treasury-title">
      <div className="treasury__head">
        <h2 id="treasury-title" className="section-title">
          Treasury desk
        </h2>
        {pending > 0 && (
          <button type="button" className="treasury__reset" onClick={() => onDraft({})}>
            Discard {pending} change{pending === 1 ? '' : 's'}
          </button>
        )}
      </div>
      {congress ? (
        <>
          <p className="treasury__hint">
            Every change is a bill. When you end the turn {congress.model.legislature.label} votes, and only what passes takes effect. Spend political capital to
            win votes: it is spent whether the bill passes or not, and a defeat costs {congress.model.capital.failurePenalty} more. Budget changes phase in over a few
            quarters; taxes change at once.
          </p>
          <p className="treasury__capital">
            <span className="eyebrow">Political capital</span>
            <strong>{available}</strong> available
            {committed > 0 && (
              <>
                {' · '}
                <strong>{committed}</strong> committed · <strong>{left}</strong> left
              </>
            )}
          </p>
          {congress.politics.lastBills.length > 0 && <LastBills model={congress.model} bills={congress.politics.lastBills} />}
        </>
      ) : (
        <p className="treasury__hint">
          Changes take effect when you end the turn. Budget changes phase in over a few quarters; taxes change at once.
        </p>
      )}

      <label className="treasury__index">
        <input
          type="checkbox"
          checked={indexed}
          onChange={(e) => onDraft({ ...draft, budgetIndexed: e.target.checked })}
        />
        <span>
          <strong>Index the budget to the economy.</strong> The Treasury raises every line each quarter in step with
          growth and inflation. Off: budgets stay fixed in dollars, so inflation and growth shrink them.
        </span>
      </label>
      {bill('indexation')}

      <div className="treasury__columns">
        <fieldset className="levers">
          <legend>Federal budget · $bn a year</legend>
          {content.economy.budgetLines.map((line) => {
            const target = economy.budgetTargets[line.id] ?? 0;
            const value = draft.budget?.[line.id] ?? target;
            const effective = economy.budgetEffective[line.id] ?? 0;
            const changed = draft.budget?.[line.id] !== undefined;
            return (
              <div key={line.id} className={`lever${changed ? ' lever--changed' : ''}`} title={line.description}>
                <div className="lever__row">
                  <label htmlFor={`budget-${line.id}`} className="lever__label">
                    {line.label}
                  </label>
                  <span className="lever__value">{money(value)}</span>
                </div>
                <input
                  id={`budget-${line.id}`}
                  type="range"
                  min={line.min}
                  max={line.max}
                  step={line.step}
                  value={value}
                  onChange={(e) => setBudget(line.id, Number(e.target.value))}
                />
                <p className="lever__note">
                  {pct((value / gdpNominal) * 100)} of GDP
                  {Math.abs(effective - target) > 0.05 && ` · spending ${money(effective)} now, phasing in`}
                </p>
                {bill(`budget:${line.id}`)}
              </div>
            );
          })}
        </fieldset>

        <fieldset className="levers">
          <legend>Taxes · rate</legend>
          {content.economy.taxLines.map((line) => {
            const current = economy.taxRates[line.id as TaxId];
            const value = draft.taxes?.[line.id] ?? current;
            const changed = draft.taxes?.[line.id] !== undefined;
            const receipts = economy.fiscal.receipts[line.id] ?? 0;
            return (
              <div key={line.id} className={`lever${changed ? ' lever--changed' : ''}`} title={line.description}>
                <div className="lever__row">
                  <label htmlFor={`tax-${line.id}`} className="lever__label">
                    {line.label}
                  </label>
                  <span className="lever__value">{pct(value)}</span>
                </div>
                <input
                  id={`tax-${line.id}`}
                  type="range"
                  min={line.min}
                  max={line.max}
                  step={line.step}
                  value={value}
                  onChange={(e) => setTax(line.id, Number(e.target.value))}
                />
                <p className="lever__note">Raised {money(receipts)} last quarter (annual rate)</p>
                {bill(`tax:${line.id}`)}
              </div>
            );
          })}
        </fieldset>
      </div>
    </section>
  );
}
