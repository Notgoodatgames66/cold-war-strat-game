/**
 * Content validation.
 *
 * Data files are written by hand, so every file is checked when the game
 * loads (and in the automated tests). A typo in a JSON file should produce a
 * clear message, not a silent wrong number.
 */

import { PURCHASE_KINDS, REQUIRED_STATS, createEconomy, type EconomyDefs } from './economy/calibrate';
import {
  BUDGET_KINDS,
  ECONOMY_START_KEYS,
  MODEL_PARAM_KEYS,
  MONETARY_REGIMES,
  TAX_IDS,
  WORKFORCE,
  type BudgetLineDef,
  type EconomyModelData,
  type IndustryTableData,
  type SectorDef,
  type TaxLineDef,
} from './economy/types';
import { PILLARS, STAT_UNITS, TIERS, type NationData, type ScenarioData, type StatDef } from './schema';
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

/** Checks a map of { value, provenance, note } entries. `required` lists keys that must be present. */
function validateSourcedMap(
  map: unknown,
  where: string,
  allowedIds: Set<string> | null,
  required: readonly string[] = [],
): string[] {
  const errors: string[] = [];
  if (!isObj(map)) return [`${where}: must be an object`];
  for (const key of required) {
    if (!(key in map)) errors.push(`${where}: missing "${key}"`);
  }
  for (const [key, entry] of Object.entries(map)) {
    const at = `${where}.${key}`;
    if (allowedIds && !allowedIds.has(key)) errors.push(`${at}: "${key}" is not a known id`);
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

// ---------------------------------------------------------------------------
// Economy definitions
// ---------------------------------------------------------------------------

export function validateEconomyModel(raw: unknown, file: string): string[] {
  if (!isObj(raw)) return [`${file}: must be an object`];
  const errors: string[] = [];
  for (const field of ['id', 'label', 'description'] as const) {
    if (!isStr(raw[field])) errors.push(`${file}: missing ${field}`);
  }
  errors.push(...validateSourcedMap(raw.params, `${file}: params`, new Set(MODEL_PARAM_KEYS), MODEL_PARAM_KEYS));
  return errors;
}

function validateLevers(raw: unknown, file: string, extra: (line: Obj, where: string) => string[]): string[] {
  if (!Array.isArray(raw)) return [`${file}: must be a list`];
  const errors: string[] = [];
  const seen = new Set<string>();
  raw.forEach((line, i) => {
    const where = `${file}[${i}]`;
    if (!isObj(line)) {
      errors.push(`${where}: must be an object`);
      return;
    }
    if (!isStr(line.id)) errors.push(`${where}: missing id`);
    else if (seen.has(line.id)) errors.push(`${where}: duplicate id "${line.id}"`);
    else seen.add(line.id);
    if (!isStr(line.label)) errors.push(`${where}: missing label`);
    if (!isStr(line.description)) errors.push(`${where}: missing description`);
    if (!isNum(line.min) || !isNum(line.max) || line.min > line.max) errors.push(`${where}: needs min ≤ max`);
    if (!isNum(line.step) || line.step <= 0) errors.push(`${where}: step must be above zero`);
    errors.push(...extra(line, where));
  });
  return errors;
}

export function validateBudgetLines(raw: unknown, file: string): string[] {
  return validateLevers(raw, file, (line, where) =>
    BUDGET_KINDS.includes(line.kind as never) ? [] : [`${where}: kind must be one of ${BUDGET_KINDS.join(', ')}`],
  );
}

export function validateTaxLines(raw: unknown, file: string): string[] {
  const errors = validateLevers(raw, file, (line, where) =>
    TAX_IDS.includes(line.id as never) ? [] : [`${where}: id must be one of ${TAX_IDS.join(', ')}`],
  );
  if (Array.isArray(raw)) {
    for (const id of TAX_IDS) {
      if (!raw.some((l) => isObj(l) && l.id === id)) errors.push(`${file}: missing tax "${id}"`);
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Industry: sectors and input–output tables
// ---------------------------------------------------------------------------

export function validateSectors(raw: unknown, file: string): string[] {
  if (!Array.isArray(raw) || raw.length === 0) return [`${file}: must be a list of sectors`];
  const errors: string[] = [];
  const seen = new Set<string>();
  raw.forEach((s, i) => {
    const where = `${file}[${i}]`;
    if (!isObj(s)) {
      errors.push(`${where}: must be an object`);
      return;
    }
    if (!isStr(s.id)) errors.push(`${where}: missing id`);
    else if (s.id === WORKFORCE) errors.push(`${where}: "${WORKFORCE}" is reserved`);
    else if (seen.has(s.id)) errors.push(`${where}: duplicate id "${s.id}"`);
    else seen.add(s.id);
    if (!isStr(s.label)) errors.push(`${where}: missing label`);
    if (!isStr(s.description)) errors.push(`${where}: missing description`);
    if (typeof s.tradable !== 'boolean') errors.push(`${where}: tradable must be true or false`);
    if (typeof s.industrial !== 'boolean') errors.push(`${where}: industrial must be true or false`);
  });
  return errors;
}

const SHARE_TOLERANCE = 0.002;

/** Checks a { value: {key: share}, provenance, note } block: known keys, no negatives, sums to 1. */
function validateShares(raw: unknown, where: string, allowed: Set<string>): string[] {
  if (!isObj(raw) || !isObj(raw.value)) return [`${where}: must be { value: { … }, provenance, note }`];
  const errors: string[] = [];
  let total = 0;
  for (const [key, share] of Object.entries(raw.value)) {
    if (!allowed.has(key)) errors.push(`${where}: "${key}" is not allowed here`);
    if (!isNum(share) || share < 0) errors.push(`${where}.${key}: must be a number ≥ 0`);
    else total += share;
  }
  if (Math.abs(total - 1) > SHARE_TOLERANCE) errors.push(`${where}: shares sum to ${total.toFixed(3)}, not 1`);
  if (raw.provenance !== 'measured' && raw.provenance !== 'estimate') errors.push(`${where}.provenance: must be "measured" or "estimate"`);
  if (!isStr(raw.note)) errors.push(`${where}.note: every figure needs a note saying where it came from`);
  return errors;
}

const SECTOR_FIELDS = ['valueAddedShare', 'valueAddedRatio', 'imports', 'capitalShare', 'investmentShare'] as const;

export function validateIndustryTable(
  raw: unknown,
  file: string,
  sectors: SectorDef[],
  budgetLines: BudgetLineDef[],
  statIds: Set<string>,
): string[] {
  if (!isObj(raw)) return [`${file}: must be an object`];
  const errors: string[] = [];
  if (!isStr(raw.id)) errors.push(`${file}: missing id`);
  if (!isStr(raw.description)) errors.push(`${file}: missing description`);
  if (raw.verification !== 'unchecked' && raw.verification !== 'checked')
    errors.push(`${file}: verification must be "unchecked" or "checked"`);
  if (!Array.isArray(raw.sources) || raw.sources.length === 0) errors.push(`${file}: list at least one source`);

  const ids = new Set(sectors.map((s) => s.id));
  const withWorkforce = new Set([...ids, WORKFORCE]);
  if (!isObj(raw.sectors)) return [...errors, `${file}: sectors must be an object`];
  for (const id of Object.keys(raw.sectors)) {
    if (!ids.has(id)) errors.push(`${file}: sectors.${id} is not in data/economy/sectors.json`);
  }
  const sums = { valueAddedShare: 0, capitalShare: 0, investmentShare: 0 };
  for (const s of sectors) {
    const entry = raw.sectors[s.id];
    const at = `${file}: sectors.${s.id}`;
    if (!isObj(entry)) {
      errors.push(`${at}: missing`);
      continue;
    }
    errors.push(...validateSourcedMap(Object.fromEntries(SECTOR_FIELDS.map((f) => [f, entry[f]])), at, null, SECTOR_FIELDS));
    errors.push(...validateShares(entry.inputs, `${at}.inputs`, ids));
    const num = (f: (typeof SECTOR_FIELDS)[number]) => (isObj(entry[f]) && isNum((entry[f] as Obj).value) ? ((entry[f] as Obj).value as number) : NaN);
    const ratio = num('valueAddedRatio');
    if (!(ratio > 0 && ratio < 1)) errors.push(`${at}.valueAddedRatio: must be between 0 and 1`);
    if (!(num('imports') >= 0)) errors.push(`${at}.imports: must be 0 or more`);
    for (const f of ['valueAddedShare', 'capitalShare', 'investmentShare'] as const) {
      if (!(num(f) >= 0)) errors.push(`${at}.${f}: must be 0 or more`);
      else sums[f] += num(f);
    }
  }
  for (const [f, total] of Object.entries(sums)) {
    if (Math.abs(total - 1) > SHARE_TOLERANCE) errors.push(`${file}: ${f} across sectors sums to ${total.toFixed(3)}, not 1`);
  }

  if (!isObj(raw.capital)) errors.push(`${file}: capital must be an object`);
  else {
    errors.push(...validateSourcedMap(raw.capital, `${file}: capital`, new Set(['capitalOutputRatio', 'depreciation']), ['capitalOutputRatio', 'depreciation']));
  }

  const bridges = raw.bridges;
  if (!isObj(bridges)) errors.push(`${file}: bridges must be an object`);
  else {
    for (const key of ['fixed_investment', 'inventory_investment', 'exports', 'aid_exports'] as const) {
      errors.push(...validateShares(bridges[key], `${file}: bridges.${key}`, ids));
    }
    errors.push(...validateShares(bridges.state_local, `${file}: bridges.state_local`, withWorkforce));
    if (!isObj(bridges.budget)) errors.push(`${file}: bridges.budget must be an object`);
    else {
      for (const line of budgetLines) {
        const buys = (PURCHASE_KINDS as readonly string[]).includes(line.kind);
        if (buys && !(line.id in bridges.budget)) errors.push(`${file}: bridges.budget is missing "${line.id}"`);
      }
      for (const [id, bridge] of Object.entries(bridges.budget)) {
        const line = budgetLines.find((l) => l.id === id);
        if (!line || !(PURCHASE_KINDS as readonly string[]).includes(line.kind))
          errors.push(`${file}: bridges.budget.${id} is not a government-purchase budget line`);
        errors.push(...validateShares(bridge, `${file}: bridges.budget.${id}`, withWorkforce));
      }
    }
  }

  if (!Array.isArray(raw.physicalIndicators)) errors.push(`${file}: physicalIndicators must be a list`);
  else {
    raw.physicalIndicators.forEach((ind, i) => {
      const at = `${file}: physicalIndicators[${i}]`;
      if (!isObj(ind)) return errors.push(`${at}: must be an object`);
      if (!isStr(ind.stat) || !statIds.has(ind.stat)) errors.push(`${at}.stat: "${String(ind.stat)}" is not in data/stats.json`);
      if (!isStr(ind.sector) || !ids.has(ind.sector)) errors.push(`${at}.sector: "${String(ind.sector)}" is not a sector`);
      if (!isStr(ind.note)) errors.push(`${at}.note: missing`);
      return undefined;
    });
  }
  return errors;
}

export function validateNationEconomy(raw: unknown, file: string, defs: EconomyDefs): string[] {
  const where = `${file}: economy`;
  if (!isObj(raw)) return [`${where}: must be an object`];
  const errors: string[] = [];
  if (!isStr(raw.model) || !defs.models[raw.model]) errors.push(`${where}.model: unknown model "${String(raw.model)}"`);
  if (!isStr(raw.industry) || !defs.industryTables[raw.industry])
    errors.push(`${where}.industry: unknown input–output table "${String(raw.industry)}"`);
  if (!MONETARY_REGIMES.includes(raw.monetaryRegime as never))
    errors.push(`${where}.monetaryRegime: must be one of ${MONETARY_REGIMES.join(', ')}`);
  errors.push(...validateSourcedMap(raw.start, `${where}.start`, new Set(ECONOMY_START_KEYS), ECONOMY_START_KEYS));

  const lineIds = defs.budgetLines.map((l) => l.id);
  errors.push(...validateSourcedMap(raw.budget, `${where}.budget`, new Set(lineIds), lineIds));
  errors.push(...validateSourcedMap(raw.taxRates, `${where}.taxRates`, new Set(TAX_IDS), TAX_IDS));
  errors.push(...validateSourcedMap(raw.taxReceipts, `${where}.taxReceipts`, new Set(TAX_IDS), TAX_IDS));

  const within = (map: unknown, lines: { id: string; min: number; max: number }[], label: string) => {
    if (!isObj(map)) return;
    for (const line of lines) {
      const entry = map[line.id];
      if (isObj(entry) && isNum(entry.value) && (entry.value < line.min || entry.value > line.max))
        errors.push(`${where}.${label}.${line.id}: ${entry.value} is outside ${line.min}–${line.max}`);
    }
  };
  within(raw.budget, defs.budgetLines, 'budget');
  within(raw.taxRates, defs.taxLines, 'taxRates');
  return errors;
}

// ---------------------------------------------------------------------------
// Nations and scenarios
// ---------------------------------------------------------------------------

export function validateNation(raw: unknown, file: string, statIds: Set<string>, defs?: EconomyDefs): string[] {
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
  const statErrors = validateSourcedMap(raw.stats, `${file}: stats`, statIds);
  errors.push(...statErrors.map((e) => e.replace('is not a known id', 'is not in data/stats.json')));
  errors.push(...validateSourcedMap(raw.params, `${file}: params`, null));
  if (raw.verification !== 'unchecked' && raw.verification !== 'checked')
    errors.push(`${file}: verification must be "unchecked" or "checked"`);
  if (!Array.isArray(raw.sources) || raw.sources.length === 0) errors.push(`${file}: list at least one source`);

  if (raw.economy !== undefined) {
    if (!defs) {
      errors.push(`${file}: has an economy block but no economy definitions were loaded`);
    } else {
      const economyErrors = validateNationEconomy(raw.economy, file, defs);
      errors.push(...economyErrors);
      if (isObj(raw.stats)) {
        for (const id of REQUIRED_STATS) {
          if (!(id in raw.stats)) errors.push(`${file}: a nation with an economy needs the "${id}" stat`);
        }
      }
      if (economyErrors.length === 0 && errors.length === 0) {
        try {
          createEconomy(raw as unknown as NationData, defs);
        } catch (err) {
          errors.push(`${file}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
  }
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

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

export interface Content {
  stats: StatDef[];
  nations: Record<string, NationData>;
  scenarios: Record<string, ScenarioData>;
  economy: EconomyDefs;
}

export interface RawContent {
  stats: unknown;
  nations: Record<string, unknown>;
  scenarios: Record<string, unknown>;
  economyModels: Record<string, unknown>;
  budgetLines: unknown;
  taxLines: unknown;
  sectors: unknown;
  industryTables: Record<string, unknown>;
}

/** Validates raw file contents and assembles them. Throws with every problem listed. */
export function buildContent(raw: RawContent): Content {
  const errors = validateStatRegistry(raw.stats);
  const stats = (Array.isArray(raw.stats) ? raw.stats : []) as StatDef[];
  const statIds = new Set(stats.map((s) => s.id));

  const models: Record<string, EconomyModelData> = {};
  for (const [file, model] of Object.entries(raw.economyModels)) {
    const problems = validateEconomyModel(model, file);
    errors.push(...problems);
    if (problems.length === 0) models[(model as EconomyModelData).id] = model as EconomyModelData;
  }
  const budgetErrors = validateBudgetLines(raw.budgetLines, 'data/economy/budget-lines.json');
  const taxErrors = validateTaxLines(raw.taxLines, 'data/economy/tax-lines.json');
  const sectorErrors = validateSectors(raw.sectors, 'data/economy/sectors.json');
  errors.push(...budgetErrors, ...taxErrors, ...sectorErrors);
  const budgetLines = budgetErrors.length === 0 ? (raw.budgetLines as BudgetLineDef[]) : [];
  const sectors = sectorErrors.length === 0 ? (raw.sectors as SectorDef[]) : [];

  const industryTables: Record<string, IndustryTableData> = {};
  for (const [file, tableRaw] of Object.entries(raw.industryTables)) {
    const problems = validateIndustryTable(tableRaw, file, sectors, budgetLines, statIds);
    errors.push(...problems);
    if (problems.length === 0) {
      const table = tableRaw as IndustryTableData;
      if (industryTables[table.id]) errors.push(`${file}: duplicate table id "${table.id}"`);
      industryTables[table.id] = table;
    }
  }

  const economy: EconomyDefs = {
    models,
    budgetLines,
    taxLines: taxErrors.length === 0 ? (raw.taxLines as TaxLineDef[]) : [],
    sectors,
    industryTables,
  };

  const nations: Record<string, NationData> = {};
  for (const [file, nationRaw] of Object.entries(raw.nations)) {
    const problems = validateNation(nationRaw, file, statIds, economy);
    errors.push(...problems);
    if (problems.length === 0) {
      const nation = nationRaw as NationData;
      if (nations[nation.id]) errors.push(`${file}: duplicate nation id "${nation.id}"`);
      nations[nation.id] = nation;
    }
  }

  const nationIds = new Set(Object.keys(nations));
  const scenarios: Record<string, ScenarioData> = {};
  for (const [file, scenarioRaw] of Object.entries(raw.scenarios)) {
    const problems = validateScenario(scenarioRaw, file, nationIds);
    errors.push(...problems);
    if (problems.length === 0) {
      const scenario = scenarioRaw as ScenarioData;
      scenarios[scenario.id] = scenario;
    }
  }

  if (errors.length > 0) {
    throw new Error(`Content errors:\n- ${errors.join('\n- ')}`);
  }
  return { stats, nations, scenarios, economy };
}
