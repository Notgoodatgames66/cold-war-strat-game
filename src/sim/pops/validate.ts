/**
 * Checks a pop model file (data/pops/*.json) before the game uses it.
 */

import { POP_ROLES, type PopModelData } from './types';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** The largest number of attribute combinations the fitting will handle. */
export const MAX_POP_CELLS = 2_000_000;

export function validatePopModel(raw: unknown, file: string, nationIds: Set<string>, statIds: Set<string>): string[] {
  if (!isObj(raw)) return [`${file}: must be an object`];
  const errors: string[] = [];
  const err = (m: string) => errors.push(`${file}: ${m}`);

  for (const f of ['id', 'nation', 'label', 'scaleToStat'] as const) if (!isStr(raw[f])) err(`missing ${f}`);
  if (isStr(raw.nation) && !nationIds.has(raw.nation)) err(`nation "${raw.nation}" has no file in data/nations`);
  if (isStr(raw.scaleToStat) && !statIds.has(raw.scaleToStat)) err(`scaleToStat "${raw.scaleToStat}" is not in stats.json`);
  if (!isNum(raw.threshold) || raw.threshold < 0) err('threshold must be a number of people');
  if (raw.verification !== 'checked' && raw.verification !== 'unchecked') err('verification must be "checked" or "unchecked"');

  // Attributes
  const cats: Record<string, Set<string>> = {};
  if (!Array.isArray(raw.attributes) || raw.attributes.length === 0) {
    err('attributes must list at least one attribute');
  } else {
    const roles = new Set<string>();
    let cells = 1;
    for (const a of raw.attributes as unknown[]) {
      if (!isObj(a) || !isStr(a.id)) {
        err('every attribute needs an id');
        continue;
      }
      if (cats[a.id]) err(`duplicate attribute "${a.id}"`);
      if (!POP_ROLES.includes(a.role as never)) err(`attribute "${a.id}" has unknown role "${String(a.role)}"`);
      else if (roles.has(a.role as string)) err(`role "${String(a.role)}" is used twice`);
      roles.add(a.role as string);
      if (!Array.isArray(a.categories) || a.categories.length < 1) {
        err(`attribute "${a.id}" needs categories`);
        continue;
      }
      const ids = new Set<string>();
      for (const c of a.categories as unknown[]) {
        if (!isObj(c) || !isStr(c.id) || !isStr(c.label)) err(`attribute "${a.id}": every category needs an id and label`);
        else if (ids.has(c.id)) err(`attribute "${a.id}": duplicate category "${c.id}"`);
        else ids.add(c.id);
      }
      cats[a.id] = ids;
      cells *= ids.size;
      if (a.role === 'age') {
        const bands = a.categories as Obj[];
        bands.forEach((b, i) => {
          if (!isNum(b.ageFrom)) err(`age band "${String(b.id)}" needs ageFrom`);
          if (i < bands.length - 1 && !(isNum(b.ageWidth) && b.ageWidth > 0)) err(`age band "${String(b.id)}" needs ageWidth`);
        });
      }
      if (a.role === 'sex' && (a.categories as Obj[]).filter((c) => c.female === true).length !== 1)
        err('the sex attribute needs exactly one category marked "female"');
    }
    if (cells > MAX_POP_CELLS) err(`${cells} attribute combinations is more than the ${MAX_POP_CELLS} the fitting allows`);
    if (!roles.has('age') || !roles.has('sex')) err('pop models need an age and a sex attribute for demography');
  }

  // Margins
  const checkShares = (node: unknown, dims: string[], depth: number, conditionalDepth: number, path: string, id: string): number => {
    if (depth === dims.length) {
      if (!isNum(node) || node < 0) err(`margin "${id}": ${path} must be a number of at least 0`);
      return isNum(node) ? node : 0;
    }
    if (!isObj(node)) {
      err(`margin "${id}": ${path || 'values'} must be an object keyed by ${dims[depth]}`);
      return 0;
    }
    const allowed = cats[dims[depth]!] ?? new Set();
    let total = 0;
    for (const [k, v] of Object.entries(node)) {
      if (!allowed.has(k)) err(`margin "${id}": "${k}" is not a category of ${dims[depth]}`);
      const sub = checkShares(v, dims, depth + 1, conditionalDepth, `${path}${path ? '.' : ''}${k}`, id);
      if (depth >= conditionalDepth) total += sub;
    }
    if (depth === conditionalDepth && conditionalDepth > 0 && Math.abs(total - 1) > 0.002)
      err(`margin "${id}": shares at ${path} sum to ${total.toFixed(4)}, not 1`);
    return total;
  };
  if (!Array.isArray(raw.margins) || raw.margins.length === 0) err('margins must list at least one census table');
  else {
    (raw.margins as unknown[]).forEach((m, i) => {
      if (!isObj(m) || !isStr(m.id)) return err(`margin ${i} needs an id`);
      if (!isStr(m.note) || (m.provenance !== 'measured' && m.provenance !== 'estimate'))
        err(`margin "${m.id}" needs a provenance and a note`);
      const dims = Array.isArray(m.dims) ? (m.dims as string[]) : [];
      const given = Array.isArray(m.given) ? (m.given as string[]) : [];
      if (dims.length === 0 || dims.some((d) => !cats[d])) return err(`margin "${m.id}": dims must name attributes`);
      if (given.some((g, k) => dims[k] !== g)) err(`margin "${m.id}": given attributes must come first in dims, in order`);
      if (i === 0 && given.length > 0) err(`margin "${m.id}": the first table must be absolute counts`);
      checkShares(m.values, dims, 0, given.length > 0 ? given.length : -1, '', m.id);
    });
  }

  // Associations
  if (!Array.isArray(raw.associations)) err('associations must be a list (it may be empty)');
  else
    for (const a of raw.associations as unknown[]) {
      if (!isObj(a) || !isStr(a.id) || !Array.isArray(a.dims) || a.dims.length !== 2) {
        err('every association needs an id and two dims');
        continue;
      }
      const [d0, d1] = a.dims as string[];
      if (!cats[d0!] || !cats[d1!]) {
        err(`association "${a.id}": dims must name attributes`);
        continue;
      }
      if (!isObj(a.odds)) err(`association "${a.id}" needs odds`);
      else
        for (const [c0, row] of Object.entries(a.odds)) {
          if (!cats[d0!]!.has(c0)) err(`association "${a.id}": "${c0}" is not a category of ${d0}`);
          if (!isObj(row)) continue;
          for (const [c1, v] of Object.entries(row)) {
            if (!cats[d1!]!.has(c1)) err(`association "${a.id}": "${c1}" is not a category of ${d1}`);
            if (!isNum(v) || v < 0) err(`association "${a.id}": odds for ${c0}/${c1} must be at least 0`);
          }
        }
    }

  // Demography
  const d = raw.demography;
  if (!isObj(d)) err('demography is missing');
  else {
    for (const f of [
      'crudeBirthRate',
      'crudeDeathRate',
      'maleBirthShare',
      'mortalityImprovement',
      'fertilityIncomeElasticity',
      'initialExpectation',
      'expectationAdjustment',
      'cohortSizeElasticity',
      'womenWorkElasticity',
    ] as const)
      if (!isNum(d[f])) err(`demography.${f} must be a number`);
    const ageAttr = (raw.attributes as Obj[] | undefined)?.find((a) => isObj(a) && a.role === 'age');
    const ages = ageAttr ? cats[ageAttr.id as string] : undefined;
    for (const f of ['fertility', 'mortality'] as const) {
      if (!isObj(d[f])) err(`demography.${f} must map age bands to rates`);
      else for (const [k, v] of Object.entries(d[f] as Obj)) if (!ages?.has(k) || !isNum(v)) err(`demography.${f}: bad entry "${k}"`);
    }
    if (isObj(d.mortality) && ages && [...ages].some((a) => !isNum((d.mortality as Obj)[a])))
      err('demography.mortality needs a rate for every age band');
    for (const f of ['fertilityMultipliers', 'mortalityMultipliers'] as const) {
      if (!isObj(d[f])) err(`demography.${f} must be an object`);
      else
        for (const [attr, row] of Object.entries(d[f] as Obj)) {
          if (!cats[attr] || !isObj(row)) err(`demography.${f}: "${attr}" is not an attribute`);
          else for (const c of Object.keys(row)) if (!cats[attr]!.has(c)) err(`demography.${f}: "${c}" is not a category of ${attr}`);
        }
    }
    if (!Array.isArray(d.ageProfile) || d.ageProfile.length < 2 || !d.ageProfile.every((v) => isNum(v) && v >= 0))
      err('demography.ageProfile must list people by single year of age');
    if (!isStr(d.note)) err('demography needs a note');
  }
  return errors;
}

export type { PopModelData };
