/**
 * The Economy tab: history charts, the national accounts, the federal
 * budget, what is driving prices and jobs, and the Treasury desk.
 */

import { useMemo } from 'react';
import type { Contribution, EconomyState } from '../sim/economy/types';
import { content } from '../sim/loadContent';
import { proposedBills } from '../sim/orders';
import type { GameState, PlayerOrders } from '../sim/schema';
import { formatDate } from '../sim/time';
import { LineChart, type ChartPoint } from './LineChart';
import { TreasuryDesk } from './TreasuryDesk';

interface Props {
  game: GameState;
  draft: PlayerOrders;
  onDraft(next: PlayerOrders): void;
}

const CHARTS: { stat: string; zeroLine?: boolean }[] = [
  { stat: 'gdp_real' },
  { stat: 'unemployment' },
  { stat: 'inflation', zeroLine: true },
  { stat: 'budget_balance', zeroLine: true },
  { stat: 'debt_to_gdp' },
  { stat: 'gold_reserves' },
];

const OUTLAY_LABELS: Record<string, string> = {
  ...Object.fromEntries(content.economy.budgetLines.map((l) => [l.id, l.label])),
  unemployment_insurance: 'Unemployment insurance',
  interest: 'Interest on the debt',
};
const RECEIPT_LABELS: Record<string, string> = {
  ...Object.fromEntries(content.economy.taxLines.map((l) => [l.id, l.label])),
  other: 'Other receipts',
};

const money = (v: number) => `${v < 0 ? '−' : ''}$${Math.abs(v).toFixed(1)} bn`;
const signed = (v: number) => `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(1)}`;

export function EconomyScreen({ game, draft, onDraft }: Props) {
  const nation = game.nations[game.playerNation];
  const economy = nation?.economy;
  const congress = useMemo(() => {
    const politics = nation?.politics;
    const model = politics ? content.politics[politics.model] : undefined;
    const bills = proposedBills(game, draft);
    return politics && model && bills ? { model, politics, bills } : null;
  }, [game, draft, nation]);
  if (!nation || economy?.engine !== 'keynesian') {
    return <p className="empty">The Treasury desk is for market economies; this nation's economy runs on a plan.</p>;
  }

  const history = (stat: string): ChartPoint[] =>
    game.history
      .filter((h) => h.stats[nation.id]?.[stat] !== undefined)
      .map((h) => ({ label: formatDate(h.date), year: h.date.year, value: h.stats[nation.id]![stat]! }));

  return (
    <div className="economy">
      <section aria-labelledby="charts-title">
        <h2 id="charts-title" className="section-title">
          The record since {game.startDate.year}
        </h2>
        {game.history.length < 2 ? (
          <p className="empty">Charts of growth, jobs, prices, the budget, debt and gold appear after your first turn.</p>
        ) : (
          <div className="charts">
            {CHARTS.map(({ stat, zeroLine }) => {
              const def = content.stats.find((s) => s.id === stat);
              return def ? <LineChart key={stat} def={def} points={history(stat)} zeroLine={zeroLine} /> : null;
            })}
          </div>
        )}
      </section>

      <div className="accounts">
        <NationalAccounts economy={economy} />
        <FederalBudget economy={economy} />
        <Drivers economy={economy} />
      </div>

      <TreasuryDesk economy={economy} gdpNominal={nation.stats.gdp_nominal ?? 1} draft={draft} onDraft={onDraft} congress={congress} />
    </div>
  );
}

function NationalAccounts({ economy: e }: { economy: EconomyState }) {
  const rows: [string, number][] = [
    ['Consumption', e.consumption],
    ['Fixed investment', e.fixedInvestment],
    ['Inventories', e.inventoryInvestment],
    ['Government', e.government],
    ['Exports', e.exports],
    ['Imports', -e.imports],
  ];
  return (
    <section className="ledger-card" aria-labelledby="accounts-title">
      <h3 id="accounts-title" className="ledger-card__title">
        National accounts
      </h3>
      <p className="ledger-card__sub">Spending that makes up GDP, 1949 dollars, annual rate</p>
      <table className="sheet">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td>{money(value)}</td>
              <td className="sheet__share">{((value / e.gdpReal) * 100).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Real GDP</th>
            <td>{money(e.gdpReal)}</td>
            <td className="sheet__share">
              {e.gdpReal >= e.potential ? '+' : '−'}
              {Math.abs((e.gdpReal / e.potential - 1) * 100).toFixed(1)}% vs capacity
            </td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}

function FederalBudget({ economy: e }: { economy: EconomyState }) {
  const f = e.fiscal;
  return (
    <section className="ledger-card" aria-labelledby="budget-title">
      <h3 id="budget-title" className="ledger-card__title">
        Federal budget
      </h3>
      <p className="ledger-card__sub">Last quarter, current dollars, annual rate</p>
      <table className="sheet">
        <tbody>
          <tr className="sheet__group">
            <th scope="rowgroup" colSpan={2}>
              Receipts
            </th>
          </tr>
          {Object.entries(f.receipts).map(([id, v]) => (
            <tr key={id}>
              <th scope="row">{RECEIPT_LABELS[id] ?? id}</th>
              <td>{money(v)}</td>
            </tr>
          ))}
          <tr className="sheet__subtotal">
            <th scope="row">Total receipts</th>
            <td>{money(f.totalReceipts)}</td>
          </tr>
          <tr className="sheet__group">
            <th scope="rowgroup" colSpan={2}>
              Outlays
            </th>
          </tr>
          {Object.entries(f.outlays).map(([id, v]) => (
            <tr key={id}>
              <th scope="row">{OUTLAY_LABELS[id] ?? id}</th>
              <td>{money(v)}</td>
            </tr>
          ))}
          <tr className="sheet__subtotal">
            <th scope="row">Total outlays</th>
            <td>{money(f.totalOutlays)}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">{f.balance >= 0 ? 'Surplus' : 'Deficit'}</th>
            <td>{money(Math.abs(f.balance))}</td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}

function Breakdown({ title, items, total }: { title: string; items: Contribution[]; total: number }) {
  return (
    <div className="drivers__block">
      <h4 className="drivers__title">{title}</h4>
      <table className="sheet">
        <tbody>
          {items.map((c) => (
            <tr key={c.label}>
              <th scope="row">{c.label}</th>
              <td>{signed(c.value)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Total</th>
            <td>{total.toFixed(1)}%</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function Drivers({ economy: e }: { economy: EconomyState }) {
  if (e.breakdown.inflation.length === 0) {
    return (
      <section className="ledger-card" aria-labelledby="drivers-title">
        <h3 id="drivers-title" className="ledger-card__title">
          What is moving the numbers
        </h3>
        <p className="ledger-card__sub">Appears after the first turn.</p>
      </section>
    );
  }
  return (
    <section className="ledger-card" aria-labelledby="drivers-title">
      <h3 id="drivers-title" className="ledger-card__title">
        What is moving the numbers
      </h3>
      <p className="ledger-card__sub">Last quarter, percentage points</p>
      <Breakdown title="Inflation (annualised)" items={e.breakdown.inflation.filter((c) => Math.abs(c.value) > 0.005)} total={e.inflation} />
      <Breakdown title="Unemployment" items={e.breakdown.unemployment} total={e.unemployment} />
      <dl className="drivers__facts">
        <div>
          <dt>Interest rate</dt>
          <dd>
            {e.shortRate.toFixed(2)}%{e.monetaryRegime === 'treasury_peg' && ` · pegged, ceiling ${e.shortRateCeiling.toFixed(2)}%`}
          </dd>
        </div>
        <div>
          <dt>Balance of payments</dt>
          <dd>{money(e.balanceOfPayments)}</dd>
        </div>
        <div>
          <dt>Foreign-held dollars</dt>
          <dd>{money(e.foreignDollarClaims)}</dd>
        </div>
      </dl>
    </section>
  );
}
