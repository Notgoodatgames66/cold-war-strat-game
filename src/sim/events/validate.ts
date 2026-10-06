/**
 * Checks event files (data/events/*.json). Events refer to each other, to
 * meters, nations, stats, interest groups, budget lines and policy levers, so
 * every reference is checked and a typo gives a clear message.
 */

import { MONETARY_REGIMES } from '../economy/types';
import type { PoliticsModelData } from '../politics/types';
import { parseQuarter } from './conditions';
import {
  EVENT_TIERS,
  MODIFIER_CURVES,
  MODIFIER_PREFIXES,
  MODIFIER_TARGETS,
  type EventContent,
  type EventData,
  type MeterData,
} from './types';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export interface EventRefs {
  nations: Set<string>;
  stats: Set<string>;
  budgetLines: Set<string>;
  levers: Set<string>;
  politics: Record<string, PoliticsModelData>;
}

interface Known {
  events: Map<string, Set<string>>;
  meters: Set<string>;
}

function checkSourced(o: Obj, where: string, errors: string[]) {
  if (o.provenance !== 'measured' && o.provenance !== 'estimate') errors.push(`${where}: provenance must be "measured" or "estimate"`);
  if (!isStr(o.note)) errors.push(`${where}: missing note`);
}

function groupIds(refs: EventRefs, nation: string): Set<string> {
  const model = Object.values(refs.politics).find((m) => m.nation === nation);
  return new Set(model?.interestGroups.map((g) => g.id) ?? []);
}

/** Problems with a modifier target for a nation, or null. */
export function targetProblem(target: unknown, nation: string, refs: EventRefs): string | null {
  if (!isStr(target)) return 'target must be a string';
  if ((MODIFIER_TARGETS as readonly string[]).includes(target)) return null;
  if (target.startsWith('group:')) {
    return groupIds(refs, nation).has(target.slice(6)) ? null : `"${target}": "${nation}" has no interest group "${target.slice(6)}"`;
  }
  if (target.startsWith('bill:')) return refs.levers.has(target.slice(5)) ? null : `"${target}": unknown lever "${target.slice(5)}"`;
  return `unknown target "${target}" (use ${[...MODIFIER_TARGETS, ...MODIFIER_PREFIXES.map((p) => `${p}…`)].join(', ')})`;
}

function checkRange(c: Obj, where: string, errors: string[]) {
  if (c.above !== undefined && !isNum(c.above)) errors.push(`${where}.above: must be a number`);
  if (c.below !== undefined && !isNum(c.below)) errors.push(`${where}.below: must be a number`);
}

function checkConditions(list: unknown, where: string, refs: EventRefs, known: Known, errors: string[]) {
  if (!Array.isArray(list)) {
    errors.push(`${where}: must be a list of conditions`);
    return;
  }
  list.forEach((c, i) => checkCondition(c, `${where}[${i}]`, refs, known, errors));
}

function checkEventRef(id: unknown, where: string, known: Known, errors: string[]) {
  if (!isStr(id) || !known.events.has(id)) errors.push(`${where}: unknown event "${String(id)}"`);
}

export function checkCondition(c: unknown, where: string, refs: EventRefs, known: Known, errors: string[]): void {
  if (!isObj(c)) {
    errors.push(`${where}: must be an object`);
    return;
  }
  if ('all' in c || 'any' in c) return checkConditions(c.all ?? c.any, `${where}.${'all' in c ? 'all' : 'any'}`, refs, known, errors);
  if ('not' in c) return checkCondition(c.not, `${where}.not`, refs, known, errors);
  if ('after' in c || 'before' in c) {
    const v = c.after ?? c.before;
    if (!isStr(v) || !parseQuarter(v)) errors.push(`${where}: date must look like "1950-Q2"`);
    return;
  }
  if ('flag' in c || 'notFlag' in c) {
    if (!isStr(c.flag ?? c.notFlag)) errors.push(`${where}: flag name must be a string`);
    return;
  }
  if ('fired' in c || 'notFired' in c) return checkEventRef(c.fired ?? c.notFired, where, known, errors);
  if ('chose' in c) {
    checkEventRef(c.chose, where, known, errors);
    const options = isStr(c.chose) ? known.events.get(c.chose) : undefined;
    if (options && (!isStr(c.option) || !options.has(c.option))) errors.push(`${where}: event "${String(c.chose)}" has no option "${String(c.option)}"`);
    return;
  }
  if ('quartersSince' in c) {
    checkEventRef(c.quartersSince, where, known, errors);
    for (const k of ['atLeast', 'atMost'] as const) if (c[k] !== undefined && !isNum(c[k])) errors.push(`${where}.${k}: must be a number`);
    return;
  }
  if ('stat' in c) {
    if (!isStr(c.stat) || !refs.stats.has(c.stat)) errors.push(`${where}: unknown stat "${String(c.stat)}"`);
    if (c.nation !== undefined && (!isStr(c.nation) || !refs.nations.has(c.nation))) errors.push(`${where}: unknown nation "${String(c.nation)}"`);
    return checkRange(c, where, errors);
  }
  if ('meter' in c) {
    if (!isStr(c.meter) || !known.meters.has(c.meter)) errors.push(`${where}: unknown meter "${String(c.meter)}"`);
    return checkRange(c, where, errors);
  }
  if ('leaderParty' in c) {
    if (!isStr(c.leaderParty)) errors.push(`${where}: leaderParty must be a party id`);
    return;
  }
  if ('monetaryRegime' in c) {
    if (!MONETARY_REGIMES.includes(c.monetaryRegime as never)) errors.push(`${where}: monetaryRegime must be one of ${MONETARY_REGIMES.join(', ')}`);
    return;
  }
  if ('priceControls' in c) {
    if (typeof c.priceControls !== 'boolean') errors.push(`${where}: priceControls must be true or false`);
    return;
  }
  errors.push(`${where}: unknown condition ${JSON.stringify(c)}`);
}

function checkModifier(m: unknown, where: string, nation: string, refs: EventRefs, errors: string[]) {
  if (!isObj(m)) {
    errors.push(`${where}: must be { target, value, duration?, curve? }`);
    return;
  }
  const problem = targetProblem(m.target, nation, refs);
  if (problem) errors.push(`${where}: ${problem}`);
  if (!isNum(m.value)) errors.push(`${where}.value: must be a number`);
  const curve = m.curve ?? 'flat';
  if (!MODIFIER_CURVES.includes(curve as never)) errors.push(`${where}.curve: must be one of ${MODIFIER_CURVES.join(', ')}`);
  if (m.duration !== undefined && (!isNum(m.duration) || m.duration < 1)) errors.push(`${where}.duration: must be at least 1 quarter`);
  if ((curve === 'decay' || curve === 'ramp') && m.duration === undefined) errors.push(`${where}: a ${String(curve)} modifier needs a duration`);
}

export function checkEffect(e: unknown, where: string, nation: string, refs: EventRefs, known: Known, errors: string[]): void {
  if (!isObj(e)) {
    errors.push(`${where}: must be an object`);
    return;
  }
  if ('flag' in e || 'clearFlag' in e) {
    if (!isStr(e.flag ?? e.clearFlag)) errors.push(`${where}: flag name must be a string`);
  } else if ('meter' in e) {
    if (!isStr(e.meter) || !known.meters.has(e.meter)) errors.push(`${where}: unknown meter "${String(e.meter)}"`);
    if (!isNum(e.add)) errors.push(`${where}.add: must be a number`);
  } else if ('modifier' in e) {
    checkModifier(e.modifier, `${where}.modifier`, nation, refs, errors);
  } else if ('capital' in e) {
    if (!isNum(e.capital)) errors.push(`${where}.capital: must be a number`);
  } else if ('budget' in e) {
    if (!isStr(e.budget) || !refs.budgetLines.has(e.budget)) errors.push(`${where}: unknown budget line "${String(e.budget)}"`);
    if (e.multiply === undefined && e.add === undefined) errors.push(`${where}: needs multiply or add`);
    if (e.multiply !== undefined && (!isNum(e.multiply) || e.multiply < 0)) errors.push(`${where}.multiply: must be 0 or more`);
    if (e.add !== undefined && !isNum(e.add)) errors.push(`${where}.add: must be a number`);
  } else if ('stat' in e) {
    if (!isStr(e.stat) || !refs.stats.has(e.stat)) errors.push(`${where}: unknown stat "${String(e.stat)}"`);
    if (e.nation !== undefined && (!isStr(e.nation) || !refs.nations.has(e.nation))) errors.push(`${where}: unknown nation "${String(e.nation)}"`);
    if ((e.add === undefined) === (e.set === undefined)) errors.push(`${where}: needs exactly one of add or set`);
    if (e.add !== undefined && !isNum(e.add)) errors.push(`${where}.add: must be a number`);
    if (e.set !== undefined && !isNum(e.set)) errors.push(`${where}.set: must be a number`);
  } else if ('monetaryRegime' in e) {
    if (!MONETARY_REGIMES.includes(e.monetaryRegime as never)) errors.push(`${where}: monetaryRegime must be one of ${MONETARY_REGIMES.join(', ')}`);
  } else if ('priceControls' in e) {
    if (typeof e.priceControls !== 'boolean') errors.push(`${where}: priceControls must be true or false`);
  } else if ('queue' in e) {
    checkEventRef(e.queue, where, known, errors);
    if (!isNum(e.delay) || e.delay < 1) errors.push(`${where}.delay: must be at least 1 quarter`);
  } else {
    errors.push(`${where}: unknown effect ${JSON.stringify(e)}`);
  }
}

function checkEffects(list: unknown, where: string, nation: string, refs: EventRefs, known: Known, errors: string[]) {
  if (list === undefined) return;
  if (!Array.isArray(list)) {
    errors.push(`${where}: must be a list of effects`);
    return;
  }
  list.forEach((e, i) => checkEffect(e, `${where}[${i}]`, nation, refs, known, errors));
}

function checkMeter(m: Obj, where: string, refs: EventRefs, known: Known, errors: string[]) {
  for (const k of ['label', 'description'] as const) if (!isStr(m[k])) errors.push(`${where}: missing ${k}`);
  if (!isNum(m.min) || !isNum(m.max) || m.min >= m.max) errors.push(`${where}: needs min < max`);
  else if (!isNum(m.start) || m.start < m.min || m.start > m.max) errors.push(`${where}.start: must lie between min and max`);
  if (!isNum(m.decay) || m.decay < 0 || m.decay > 1) errors.push(`${where}.decay: must be between 0 and 1`);
  if (m.drift !== undefined) {
    if (!Array.isArray(m.drift)) errors.push(`${where}.drift: must be a list`);
    else
      m.drift.forEach((d, i) => {
        if (!isObj(d) || !isNum(d.add)) errors.push(`${where}.drift[${i}]: needs if and add`);
        else checkConditions(d.if, `${where}.drift[${i}].if`, refs, known, errors);
      });
  }
  if (m.effects !== undefined) {
    if (!Array.isArray(m.effects)) errors.push(`${where}.effects: must be a list`);
    else
      m.effects.forEach((e, i) => {
        const at = `${where}.effects[${i}]`;
        if (!isObj(e) || !isStr(e.nation) || !isNum(e.perPoint)) {
          errors.push(`${at}: needs target, nation and perPoint`);
          return;
        }
        if (!refs.nations.has(e.nation)) errors.push(`${at}: unknown nation "${e.nation}"`);
        const problem = targetProblem(e.target, e.nation, refs);
        if (problem) errors.push(`${at}: ${problem}`);
      });
  }
  checkSourced(m, where, errors);
}

function checkEvent(e: Obj, where: string, refs: EventRefs, known: Known, errors: string[]) {
  if (!EVENT_TIERS.includes(e.tier as never)) errors.push(`${where}.tier: must be one of ${EVENT_TIERS.join(', ')}`);
  const nation = isStr(e.nation) ? e.nation : '';
  if (!refs.nations.has(nation)) errors.push(`${where}.nation: unknown nation "${String(e.nation)}"`);
  if (e.window !== undefined) {
    if (!isObj(e.window)) errors.push(`${where}.window: must be { from?, to? }`);
    else {
      for (const k of ['from', 'to'] as const) {
        const v = e.window[k];
        if (v !== undefined && (!isStr(v) || !parseQuarter(v))) errors.push(`${where}.window.${k}: must look like "1950-Q2"`);
      }
      const from = isStr(e.window.from) ? parseQuarter(e.window.from) : null;
      const to = isStr(e.window.to) ? parseQuarter(e.window.to) : null;
      if (from && to && from.year * 4 + from.quarter > to.year * 4 + to.quarter) errors.push(`${where}.window: from is after to`);
    }
  }
  checkConditions(e.triggers, `${where}.triggers`, refs, known, errors);
  if (!isObj(e.chance) || !isNum(e.chance.base) || e.chance.base < 0 || e.chance.base > 1) {
    errors.push(`${where}.chance.base: must be between 0 and 1`);
  } else if (e.chance.modifiers !== undefined) {
    if (!Array.isArray(e.chance.modifiers)) errors.push(`${where}.chance.modifiers: must be a list`);
    else
      e.chance.modifiers.forEach((m, i) => {
        const at = `${where}.chance.modifiers[${i}]`;
        if (!isObj(m) || !isNum(m.multiply) || m.multiply < 0) errors.push(`${at}: needs if and a multiply of 0 or more`);
        else checkConditions(m.if, `${at}.if`, refs, known, errors);
      });
  }
  if (e.repeatable !== undefined && typeof e.repeatable !== 'boolean') errors.push(`${where}.repeatable: must be true or false`);
  if (e.cooldown !== undefined && (!isNum(e.cooldown) || e.cooldown < 1)) errors.push(`${where}.cooldown: must be at least 1 quarter`);
  for (const k of ['kicker', 'headline'] as const) if (!isStr(e[k])) errors.push(`${where}: missing ${k}`);
  if (!Array.isArray(e.paragraphs) || e.paragraphs.length === 0 || !e.paragraphs.every(isStr)) errors.push(`${where}.paragraphs: must list at least one paragraph`);
  if (e.quote !== undefined && (!isObj(e.quote) || !isStr(e.quote.text) || !isStr(e.quote.source))) errors.push(`${where}.quote: needs text and source`);
  checkEffects(e.effects, `${where}.effects`, nation, refs, known, errors);
  if (e.options !== undefined) {
    if (!Array.isArray(e.options) || e.options.length === 0) errors.push(`${where}.options: must list at least one option`);
    else {
      const seen = new Set<string>();
      let defaults = 0;
      e.options.forEach((o, i) => {
        const at = `${where}.options[${i}]`;
        if (!isObj(o)) {
          errors.push(`${at}: must be an object`);
          return;
        }
        if (!isStr(o.id)) errors.push(`${at}: missing id`);
        else if (seen.has(o.id)) errors.push(`${at}: duplicate option id "${o.id}"`);
        else seen.add(o.id);
        for (const k of ['label', 'description'] as const) if (!isStr(o[k])) errors.push(`${at}: missing ${k}`);
        if (o.default === true) defaults += 1;
        if (o.aiWeight !== undefined && (!isNum(o.aiWeight) || o.aiWeight < 0)) errors.push(`${at}.aiWeight: must be 0 or more`);
        if (o.requires !== undefined) checkConditions(o.requires, `${at}.requires`, refs, known, errors);
        if (!Array.isArray(o.effects)) errors.push(`${at}.effects: must be a list (it may be empty)`);
        else checkEffects(o.effects, `${at}.effects`, nation, refs, known, errors);
      });
      if (defaults !== 1) errors.push(`${where}.options: exactly one option must be the default (the historical choice)`);
    }
  }
  checkSourced(e, where, errors);
}

/** Validates every event file together (events refer to each other across files). */
export function validateEventFiles(files: Record<string, unknown>, refs: EventRefs): { errors: string[]; content: EventContent } {
  const errors: string[] = [];
  const meters: { m: Obj; where: string }[] = [];
  const events: { e: Obj; where: string }[] = [];
  const known: Known = { events: new Map(), meters: new Set() };

  for (const [file, raw] of Object.entries(files)) {
    if (!isObj(raw)) {
      errors.push(`${file}: must be an object with "meters" and/or "events"`);
      continue;
    }
    for (const key of Object.keys(raw)) if (key !== 'meters' && key !== 'events' && key !== 'note') errors.push(`${file}: unknown key "${key}"`);
    for (const [key, list] of [['meters', raw.meters], ['events', raw.events]] as const) {
      if (list === undefined) continue;
      if (!Array.isArray(list)) {
        errors.push(`${file}.${key}: must be a list`);
        continue;
      }
      list.forEach((item, i) => {
        const where = `${file}.${key}[${i}]`;
        if (!isObj(item) || !isStr(item.id)) {
          errors.push(`${where}: must be an object with an id`);
          return;
        }
        const label = `${file} ${key === 'meters' ? 'meter' : 'event'} "${item.id}"`;
        if (key === 'meters') {
          if (known.meters.has(item.id)) errors.push(`${label}: duplicate meter id`);
          known.meters.add(item.id);
          meters.push({ m: item, where: label });
        } else {
          if (known.events.has(item.id)) errors.push(`${label}: duplicate event id`);
          const options = Array.isArray(item.options) ? item.options.filter(isObj).map((o) => String(o.id)) : [];
          known.events.set(item.id, new Set(options));
          events.push({ e: item, where: label });
        }
      });
    }
  }
  for (const { m, where } of meters) checkMeter(m, where, refs, known, errors);
  for (const { e, where } of events) checkEvent(e, where, refs, known, errors);

  return {
    errors,
    content: {
      meters: meters.map(({ m }) => m as unknown as MeterData).sort((a, b) => (a.id < b.id ? -1 : 1)),
      events: events.map(({ e }) => e as unknown as EventData).sort((a, b) => (a.id < b.id ? -1 : 1)),
    },
  };
}
