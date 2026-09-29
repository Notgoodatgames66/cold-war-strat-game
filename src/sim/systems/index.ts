/**
 * The order in which systems run each turn. Order matters once systems feed
 * each other (production before trade, trade before opinion, and so on).
 */

import { demography } from './demography';
import type { SimSystem } from './system';

export const SYSTEMS: readonly SimSystem[] = [demography];

export { isDue, makeContext } from './system';
export type { Frequency, SimSystem, SystemContext } from './system';
