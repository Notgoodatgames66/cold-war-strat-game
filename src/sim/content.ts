/**
 * Content validation.
 *
 * Data files are written by hand, so every file is checked when the game
 * loads (and in the automated tests). A typo in a JSON file should produce a
 * clear message, not a silent wrong number.
 */

import {
  PILLARS,
  STAT_UNITS,
  TIERS,
  type NationData,
  type ScenarioData,
  type StatDef,
} from './schema';
import { compareDates, isValidDate } from './time';

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function validateStatRegistry(raw: unknown): string[] {
  const errors: string[] = [];
  if (!Array.isArray(raw)) return ['stats.json: must be a list of stat definitions'];
  const seen = new Set<string>();
  raw.forEach((s, i) => {
    const where = `stats.json[${i}]`;
    if (!isObj(s)) {
      errors.push(`${where}: must be an object`);
      return;
    }
    if (!isStr(s.id)) errors.push(`${where}: missing id`);
    else if (seen.has(s.id)) errors.push(`${where}: duplicate id "${s.id}"`);
    else seen.add(s.id);
    if (!isStr(s.label)) errors.push(`${where}: missing label`);
    if (!PILLARS.includes(s.pillar as never)) errors.push(`${where}: pillar must be one of ${PILLARS.join(', ')}`);
    if (!STAT_UNITS.includes(s.unit as never)) errors.push(`${where}: unit must be one of ${STAT_UNITS.join(', ')}`);
    if (!isNum(s.decimals) || s.decimals < 0) errors.push(`${where}: decimals must be 0 or more`);
    if (!isStr(s.description)) errors.push(`${where}: missing description`);
  });
  return errors;
}

function validateSourcedMap(map: unknown, where: string, allowedIds: Set<string> | null): string[] {
  const errors: string[] = [];
  if (!isObj(map)) return [`${where}: must be an object`];
  for (const [key, entry] of Object.entries(map)) {
    const at = `${where}.${key}`;
    if (allowedIds && !allowedIds.has(key)) errors.push(`${at}: "${key}" is not in data/stats.json`);
    if (!isObj(entry)) {
      errors.push(`${at}: must be { value, provenance, note }`);
      continue;
    }
    if (!isNum(entry.value)) errors.push(`${at}.value: must be a number`);
    if (entry.provenance !== 'measured' && entry.provenance !== 'estimate')
      errors.push(`${at}.provenance: must be "measured" or "estimate"`);
    if (!isStr(entry.note)) errors.push(`${at}.note: every figure needs a note saying where it came from`);
  }
  return errors;
}

export function validateNation(raw: unknown, file: string, statIds: Set<string>): string[] {
  if (!isObj(raw)) return [`${file}: must be an object`];
  const errors: string[] = [];
  for (const field of ['id', 'name', 'shortName'] as const) {
    if (!isStr(raw[field])) errors.push(`${file}: missing ${field}`);
  }
  if (!TIERS.includes(raw.tier as never)) errors.push(`${file}: tier must be one of ${TIERS.join(', ')}`);
  const gov = raw.government;
  if (!isObj(gov) || !isStr(gov.type) || !isStr(gov.label) || !isObj(gov.leader)) {
    errors.push(`${file}: government needs type, label and leader`);
  } else {
    const leader = gov.leader as Obj;
    for (const field of ['name', 'title', 'party'] as const) {
      if (!isStr(leader[field])) errors.push(`${file}: government.leader missing ${field}`);
    }
  }
  errors.push(...validateSourcedMap(raw.stats, `${file}: stats`, statIds));
  errors.push(...validateSourcedMap(raw.params, `${file}: params`, null));
  if (raw.verification !== 'unchecked' && raw.verification !== 'checked')
    errors.push(`${file}: verification must be "unchecked" or "checked"`);
  if (!Array.isArray(raw.sources) || raw.sources.length === 0) errors.push(`${file}: list at least one source`);
  return errors;
}

export function validateScenario(raw: unknown, file: string, nationIds: Set<string>): string[] {
  if (!isObj(raw)) return [`${file}: must be an object`];
  const errors: string[] = [];
  for (const field of ['id', 'name', 'description', 'playerNation', 'defaultSeed'] as const) {
    if (!isStr(raw[field])) errors.push(`${file}: missing ${field}`);
  }
  if (!isValidDate(raw.startDate)) errors.push(`${file}: startDate must be { year, quarter }`);
  if (!isValidDate(raw.endDate)) errors.push(`${file}: endDate must be { year, quarter }`);
  if (isValidDate(raw.startDate) && isValidDate(raw.endDate) && compareDates(raw.endDate, raw.startDate) <= 0)
    errors.push(`${file}: endDate must come after startDate`);
  if (!Array.isArray(raw.nations) || raw.nations.length === 0) {
    errors.push(`${file}: nations must list at least one nation`);
  } else {
    for (const id of raw.nations) {
      if (!nationIds.has(id as string)) errors.push(`${file}: nation "${String(id)}" has no file in data/nations`);
    }
    if (isStr(raw.playerNation) && !raw.nations.includes(raw.playerNation))
      errors.push(`${file}: playerNation must be one of its nations`);
  }
  return errors;
}

export interface Content {
  stats: StatDef[];
  nations: Record<string, NationData>;
  scenarios: Record<string, ScenarioData>;
}

/** Validates raw file contents and assembles them. Throws with every problem listed. */
export function buildContent(
  rawStats: unknown,
  rawNations: Record<string, unknown>,
  rawScenarios: Record<string, unknown>,
): Content {
  const errors = validateStatRegistry(rawStats);
  const stats = (Array.isArray(rawStats) ? rawStats : []) as StatDef[];
  const statIds = new Set(stats.map((s) => s.id));

  const nations: Record<string, NationData> = {};
  for (const [file, raw] of Object.entries(rawNations)) {
    const problems = validateNation(raw, file, statIds);
    errors.push(...problems);
    if (problems.length === 0) {
      const nation = raw as NationData;
      if (nations[nation.id]) errors.push(`${file}: duplicate nation id "${nation.id}"`);
      nations[nation.id] = nation;
    }
  }

  const nationIds = new Set(Object.keys(nations));
  const scenarios: Record<string, ScenarioData> = {};
  for (const [file, raw] of Object.entries(rawScenarios)) {
    const problems = validateScenario(raw, file, nationIds);
    errors.push(...problems);
    if (problems.length === 0) {
      const scenario = raw as ScenarioData;
      scenarios[scenario.id] = scenario;
    }
  }

  if (errors.length > 0) {
    throw new Error(`Content errors:\n- ${errors.join('\n- ')}`);
  }
  return { stats, nations, scenarios };
}
