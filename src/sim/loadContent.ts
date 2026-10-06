/**
 * Loads every data file in data/ and validates it.
 *
 * Adding a nation, scenario, economy model, input–output table, plan, pop model, politics model or event file is just adding a JSON file:
 * Vite's import.meta.glob picks it up automatically.
 */

import budgetLines from '../../data/economy/budget-lines.json';
import sectors from '../../data/economy/sectors.json';
import taxLines from '../../data/economy/tax-lines.json';
import stats from '../../data/stats.json';
import { buildContent, type Content } from './content';

const nations = import.meta.glob('../../data/nations/*.json', { eager: true, import: 'default' });
const scenarios = import.meta.glob('../../data/scenarios/*.json', { eager: true, import: 'default' });
const economyModels = import.meta.glob('../../data/economy/models/*.json', { eager: true, import: 'default' });
const industryTables = import.meta.glob('../../data/economy/industry/*.json', { eager: true, import: 'default' });
const plans = import.meta.glob('../../data/economy/plans/*.json', { eager: true, import: 'default' });
const pops = import.meta.glob('../../data/pops/*.json', { eager: true, import: 'default' });
const politics = import.meta.glob('../../data/politics/*.json', { eager: true, import: 'default' });
const events = import.meta.glob('../../data/events/*.json', { eager: true, import: 'default' });

const fileName = (path: string) => path.replace('../../', '');
const byFile = (modules: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(modules).map(([path, value]) => [fileName(path), value]));

export const content: Content = buildContent({
  stats,
  nations: byFile(nations),
  scenarios: byFile(scenarios),
  economyModels: byFile(economyModels),
  budgetLines,
  taxLines,
  sectors,
  industryTables: byFile(industryTables),
  plans: byFile(plans),
  pops: byFile(pops),
  politics: byFile(politics),
  events: byFile(events),
});
