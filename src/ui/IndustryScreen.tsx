/**
 * The Industry tab: the seven sectors, how hard each is working, what went
 * short last quarter, and who supplies whom.
 */

import { DEMAND_COMPONENTS, type DemandComponent, type IndustryState } from '../sim/economy/types';
import { content } from '../sim/loadContent';
import type { GameState } from '../sim/schema';
import { CapacityMeter, capacityState } from './CapacityMeter';
import { Sparkline } from './Sparkline';

interface Props {
  game: GameState;
}

const SHORT: Record<string, string> = {
  agriculture: 'Farms',
  heavy_industry: 'Heavy',
  energy: 'Energy',
  consumer_goods: 'Consumer',
  technology: 'Tech',
  services: 'Services',
  shipping_trade: 'Shipping',
};

/** Names as they read mid-sentence. */
const IN_SENTENCE: Record<string, string> = {
  agriculture: 'farming',
  heavy_industry: 'heavy industry',
  energy: 'energy',
  consumer_goods: 'consumer goods',
  technology: 'technology',
  services: 'services',
  shipping_trade: 'shipping and trade',
};

const UNMET_LABELS: Record<DemandComponent, string> = {
  consumption: 'Household purchases',
  fixed_investment: 'Investment projects',
  inventories: 'Stockbuilding',
  government: 'Government orders',
  exports: 'Export orders',
};

const money = (v: number) => `$${v.toFixed(1)} bn`;
const signedPct = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}%`;
const SPARK_QUARTERS = 40;

function listWords(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function IndustryScreen({ game }: Props) {
  const nation = game.nations[game.playerNation];
  const economy = nation?.economy;
  if (!nation || !economy) return <p className="empty">This nation's industry is not simulated yet.</p>;

  const ind = economy.industry;
  const p = economy.params;
  const ceiling = 1 + p.sector_capacity_ceiling / 100;
  const stretchedFrom = 1 + p.overheating_threshold / 100;
  const defs = new Map(content.economy.sectors.map((s) => [s.id, s]));
  const label = (id: string) => defs.get(id)?.label ?? id;
  const utilisation = ind.output.map((x, j) => x / ind.normalCapacity[j]!);

  const history = game.history.slice(-SPARK_QUARTERS - 1);
  const previous = game.history.length > 1 ? game.history[game.history.length - 2]?.sectors?.[nation.id] : undefined;
  const series = (id: string) =>
    history.map((h) => h.sectors?.[nation.id]?.[id]?.output).filter((v): v is number => v !== undefined);

  return (
    <div className="industry">
      <section aria-labelledby="industry-title">
        <h2 id="industry-title" className="section-title">
          Industry
        </h2>
        <p className="industry__lead">
          {summary(ind, utilisation, ceiling, stretchedFrom, (economy.gdpReal / economy.potential - 1) * 100, p.capacity_ceiling)}
        </p>

        <div className="table-scroll">
          <table className="sheet sectors">
            <caption className="visually-hidden">Output, capacity and capital by sector</caption>
            <thead>
              <tr>
                <th scope="col">Sector</th>
                <th scope="col">Capacity use</th>
                <th scope="col" className="num">
                  Output
                  <span className="sectors__unit">$bn, 1949 prices</span>
                </th>
                <th scope="col" className="num">
                  Change
                  <span className="sectors__unit">vs last quarter</span>
                </th>
                <th scope="col" className="num">
                  Capital
                  <span className="sectors__unit">$bn</span>
                </th>
                <th scope="col">
                  Trend
                  <span className="sectors__unit">last {SPARK_QUARTERS / 4} years</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {ind.sectors.map((id, j) => {
                const before = previous?.[id]?.output;
                const change = before ? (ind.output[j]! / before - 1) * 100 : null;
                return (
                  <tr key={id}>
                    <th scope="row" title={defs.get(id)?.description}>
                      {label(id)}
                    </th>
                    <td>
                      <CapacityMeter utilisation={utilisation[j]!} ceiling={ceiling} stretchedFrom={stretchedFrom} />
                    </td>
                    <td className="num">{ind.output[j]!.toFixed(1)}</td>
                    <td className="num sectors__change">{change === null ? '—' : signedPct(change)}</td>
                    <td className="num">{ind.capital[j]!.toFixed(0)}</td>
                    <td>
                      <Sparkline values={series(id)} label={`${label(id)} output trend`} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="industry__note">
          Output is gross production at an annual rate. Industries can run up to {p.sector_capacity_ceiling}% above normal
          capacity with overtime and extra shifts; above {p.overheating_threshold}% they push up prices. Investment flows to
          the industries running hottest, so capacity follows demand over the years.
        </p>
      </section>

      <div className="accounts">
        <Shortages ind={ind} label={label} />
        <section className="ledger-card" aria-labelledby="gov-work-title">
          <h3 id="gov-work-title" className="ledger-card__title">
            Output by origin
          </h3>
          <p className="ledger-card__sub">Real GDP last quarter, 1949 dollars, annual rate</p>
          <table className="sheet">
            <tbody>
              {ind.sectors.map((id, j) => (
                <tr key={id}>
                  <th scope="row">{label(id)}</th>
                  <td>{money(ind.output[j]! * ind.valueAdded[j]!)}</td>
                </tr>
              ))}
              <tr>
                <th scope="row">Government’s own workforce</th>
                <td>{money(ind.governmentWorkforce)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Real GDP</th>
                <td>{money(economy.gdpReal)}</td>
              </tr>
            </tfoot>
          </table>
        </section>
      </div>

      <FlowMatrix ind={ind} />
    </div>
  );
}

function summary(
  ind: IndustryState,
  utilisation: number[],
  ceiling: number,
  stretchedFrom: number,
  gapPct: number,
  aggregateCeilingPct: number,
): string {
  const states = utilisation.map((u) => capacityState(u, ceiling, stretchedFrom));
  const name = (j: number) => IN_SENTENCE[ind.sectors[j]!] ?? ind.sectors[j]!;
  const atLimit = ind.sectors.map((_, j) => j).filter((j) => states[j] === 'limit').map(name);
  const stretched = ind.sectors.map((_, j) => j).filter((j) => states[j] === 'stretched').map(name);
  const unmet = DEMAND_COMPONENTS.reduce((s, k) => s + ind.unmet[k], 0);
  const surge = ind.surgeImports.reduce((s, v) => s + v, 0);

  const parts: string[] = [];
  if (gapPct >= aggregateCeilingPct - 0.05) {
    parts.push(
      `The economy has run out of workers: output is at its ceiling, ${aggregateCeilingPct}% above normal capacity, and cannot rise until capacity grows.`,
    );
  }
  if (atLimit.length) parts.push(`${capitalise(listWords(atLimit))} ${atLimit.length === 1 ? 'is' : 'are'} at the limit of capacity.`);
  if (stretched.length) parts.push(`${capitalise(listWords(stretched))} ${stretched.length === 1 ? 'is' : 'are'} stretched.`);
  if (unmet > 0.05) {
    parts.push(
      `Orders worth ${money(unmet)} a year went unfilled last quarter${surge > 0.05 ? `, even after ${money(surge)} of emergency imports` : ''}.`,
    );
  }
  if (parts.length === 0) {
    const slack = utilisation.filter((u) => u < 0.97).length;
    return slack > 3
      ? 'Most industries have spare capacity: there is room to grow without shortages.'
      : 'All seven industries are working within normal capacity.';
  }
  return parts.join(' ');
}

function Shortages({ ind, label }: { ind: IndustryState; label: (id: string) => string }) {
  const unmet = DEMAND_COMPONENTS.filter((k) => ind.unmet[k] > 0.005);
  const surge = ind.sectors.map((id, j) => [id, ind.surgeImports[j]!] as const).filter(([, v]) => v > 0.005);
  return (
    <section className="ledger-card" aria-labelledby="shortages-title">
      <h3 id="shortages-title" className="ledger-card__title">
        Shortages
      </h3>
      <p className="ledger-card__sub">Last quarter, 1949 dollars, annual rate</p>
      {unmet.length === 0 && surge.length === 0 ? (
        <p className="industry__calm">No shortages: every order was filled.</p>
      ) : (
        <table className="sheet">
          <tbody>
            {unmet.length > 0 && (
              <tr className="sheet__group">
                <th scope="rowgroup" colSpan={2}>
                  Went unfilled
                </th>
              </tr>
            )}
            {unmet.map((k) => (
              <tr key={k}>
                <th scope="row">{UNMET_LABELS[k]}</th>
                <td>{money(ind.unmet[k])}</td>
              </tr>
            ))}
            {surge.length > 0 && (
              <tr className="sheet__group">
                <th scope="rowgroup" colSpan={2}>
                  Emergency imports
                </th>
              </tr>
            )}
            {surge.map(([id, v]) => (
              <tr key={id}>
                <th scope="row">{label(id)}</th>
                <td>{money(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function FlowMatrix({ ind }: { ind: IndustryState }) {
  const flows = ind.A.map((row) => row.map((a, j) => a * ind.output[j]!));
  const max = Math.max(...flows.flat());
  const shade = (v: number) => (max > 0 ? Math.sqrt(v / max) * 0.42 : 0);
  return (
    <section className="flows" aria-labelledby="flows-title">
      <h2 id="flows-title" className="section-title">
        Who supplies whom
      </h2>
      <p className="industry__note">
        Each row is a supplier, each column a buyer: last quarter's purchases between industries, $bn a year. Darker cells
        are bigger flows. The last rows show what each industry adds itself (wages, profits and rents) and its total output.
      </p>
      <div className="table-scroll">
        <table className="sheet flows__table">
          <thead>
            <tr>
              <th scope="col">
                <span className="visually-hidden">Supplier</span>
              </th>
              {ind.sectors.map((id) => (
                <th key={id} scope="col" className="num">
                  {SHORT[id] ?? id}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ind.sectors.map((supplier, i) => (
              <tr key={supplier}>
                <th scope="row">{SHORT[supplier] ?? supplier}</th>
                {flows[i]!.map((v, j) => (
                  <td
                    key={ind.sectors[j]}
                    className="num"
                    style={{ background: `rgba(31, 95, 168, ${shade(v).toFixed(3)})` }}
                    title={`${SHORT[supplier]} → ${SHORT[ind.sectors[j]!]}: $${v.toFixed(2)} bn`}
                  >
                    {v >= 0.05 ? v.toFixed(1) : '·'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Value added</th>
              {ind.output.map((x, j) => (
                <td key={ind.sectors[j]} className="num">
                  {(x * ind.valueAdded[j]!).toFixed(1)}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row">Output</th>
              {ind.output.map((x, j) => (
                <td key={ind.sectors[j]} className="num">
                  {x.toFixed(1)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
