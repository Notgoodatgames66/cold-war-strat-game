/**
 * Loads every data file in data/ and validates it.
 *
 * Adding a nation or scenario is just adding a JSON file: Vite's
 * import.meta.glob picks it up automatically.
 */

import rawStats from '../../data/stats.json';
import { buildContent, type Content } from './content';

const rawNations = import.meta.glob('../../data/nations/*.json', { eager: true, import: 'default' });
const rawScenarios = import.meta.glob('../../data/scenarios/*.json', { eager: true, import: 'default' });

const fileName = (path: string) => path.replace('../../', '');
const byFile = (modules: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(modules).map(([path, value]) => [fileName(path), value]));

export const content: Content = buildContent(rawStats, byFile(rawNations), byFile(rawScenarios));
