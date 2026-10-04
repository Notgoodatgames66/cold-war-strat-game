/**
 * The order in which systems run each turn. Order matters once systems feed
 * each other (production before trade, trade before opinion, and so on).
 */

import { demography } from './demography';
import { economy } from './economy';
import { population } from './population';
import type { SimSystem } from './system';

/**
 * Population runs first so the economy sees this quarter's people; the yearly
 * demography placeholder covers only nations without pops.
 */
export const SYSTEMS: readonly SimSystem[] = [population, economy, demography];

export { isDue, makeContext } from './system';
export type { Frequency, SimSystem, SystemContext } from './system';
