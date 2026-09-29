import { content } from '../sim/loadContent';
import type { NationState, Pillar, StatDef } from '../sim/schema';
import { formatChange, formatStat } from './format';

const PILLAR_LABELS: Record<Pillar, string> = {
  economy: 'Economy',
  military: 'Military',
  politics: 'Politics',
  society: 'Society',
  world: 'World standing',
  intelligence: 'Intelligence',
};

const TIER_LABELS: Record<NationState['tier'], string> = {
  player: 'Your nation',
  main_rival: 'Main rival',
  major: 'Major power',
  regional: 'Regional power',
  minor: 'Minor state',
};

interface Props {
  nation: NationState;
  previousStats?: Record<string, number>;
}

export function NationDossier({ nation, previousStats }: Props) {
  const data = content.nations[nation.id];
  const shown = content.stats.filter((def) => nation.stats[def.id] !== undefined);
  const pillars = [...new Set(shown.map((def) => def.pillar))];
  const leader = nation.government.leader;

  return (
    <article className={`dossier dossier--${nation.tier}`} aria-labelledby={`dossier-${nation.id}`}>
      <header className="dossier__head">
        <p className="dossier__tier">{TIER_LABELS[nation.tier]}</p>
        <h2 id={`dossier-${nation.id}`} className="dossier__name">
          {nation.shortName}
        </h2>
        <p className="dossier__gov">{nation.government.label}</p>
        <p className="dossier__leader">
          {leader.title} <strong>{leader.name}</strong>
          <span className="dossier__party">{leader.party}</span>
        </p>
      </header>

      {pillars.map((pillar) => (
        <section key={pillar} className="ledger" aria-label={PILLAR_LABELS[pillar]}>
          <h3 className="ledger__title">{PILLAR_LABELS[pillar]}</h3>
          <dl className="ledger__rows">
            {shown
              .filter((def) => def.pillar === pillar)
              .map((def) => (
                <StatRow
                  key={def.id}
                  def={def}
                  value={nation.stats[def.id]!}
                  previous={previousStats?.[def.id]}
                  estimate={nation.statProvenance[def.id] === 'estimate'}
                  note={data?.stats[def.id]?.note}
                />
              ))}
          </dl>
        </section>
      ))}

      {data?.verification === 'unchecked' && (
        <p className="dossier__footnote">Starting figures not yet checked against sources.</p>
      )}
    </article>
  );
}

interface RowProps {
  def: StatDef;
  value: number;
  previous?: number;
  estimate: boolean;
  note?: string;
}

function StatRow({ def, value, previous, estimate, note }: RowProps) {
  const change = formatChange(value, previous, def);
  const tooltip = note ? `${def.description}\n\nStarting figure: ${note}` : def.description;
  return (
    <div className="ledger__row" title={tooltip}>
      <dt className="ledger__label">{def.label}</dt>
      <dd className="ledger__value">
        {formatStat(value, def)}
        {estimate && (
          <abbr className="ledger__est" title="Estimate">
            est.
          </abbr>
        )}
        {change && <span className="ledger__change">{change}</span>}
      </dd>
    </div>
  );
}
