/**
 * Checks a politics model (data/politics/*.json) against its nation's pop model
 * before the game uses it: every attribute, category, lever, group, faction and
 * party it names must exist.
 */

import type { PopModelData } from '../pops/types';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function validatePoliticsModel(
  raw: unknown,
  file: string,
  nationIds: Set<string>,
  popModels: Record<string, PopModelData>,
  levers: Set<string>,
  statIds: Set<string>,
): string[] {
  if (!isObj(raw)) return [`${file}: must be an object`];
  const errors: string[] = [];
  const err = (m: string) => errors.push(`${file}: ${m}`);
  for (const f of ['id', 'nation', 'label'] as const) if (!isStr(raw[f])) err(`missing ${f}`);
  if (raw.verification !== 'checked' && raw.verification !== 'unchecked') err('verification must be "checked" or "unchecked"');
  const nation = raw.nation as string;
  if (isStr(nation) && !nationIds.has(nation)) err(`nation "${nation}" has no file in data/nations`);
  const pops = Object.values(popModels).find((m) => m.nation === nation);
  if (!pops) {
    err(`nation "${nation}" needs a pop model (data/pops/) for politics`);
    return errors;
  }
  const cats: Record<string, Set<string>> = Object.fromEntries(pops.attributes.map((a) => [a.id, new Set(a.categories.map((c) => c.id))]));
  const groupsOfRegion = new Set(pops.attributes.find((a) => a.role === 'region')?.categories.map((c) => c.group ?? '') ?? []);
  const regionIds = cats[pops.attributes.find((a) => a.role === 'region')?.id ?? ''] ?? new Set<string>();

  const checkEffects = (where: string, table: unknown, allowStar = false) => {
    if (!isObj(table)) return err(`${where} must be an object of attribute → category → number`);
    for (const [attr, row] of Object.entries(table)) {
      if (allowStar && attr === '*') continue;
      if (!cats[attr]) {
        err(`${where}: "${attr}" is not a pop attribute`);
        continue;
      }
      if (!isObj(row)) {
        err(`${where}.${attr} must be an object`);
        continue;
      }
      for (const [c, v] of Object.entries(row)) {
        if (!cats[attr]!.has(c)) err(`${where}: "${c}" is not a category of ${attr}`);
        if (!isNum(v)) err(`${where}.${attr}.${c} must be a number`);
      }
    }
  };
  const checkFactors = (where: string, f: unknown) => {
    if (!isObj(f)) return err(`${where} must be an object`);
    checkEffects(`${where}.factors`, f.factors ?? {});
    if (f.defaults !== undefined) {
      if (!isObj(f.defaults)) err(`${where}.defaults must be an object`);
      else for (const a of Object.keys(f.defaults)) if (!cats[a]) err(`${where}.defaults: "${a}" is not a pop attribute`);
    }
    if (f.regionGroups !== undefined) {
      if (!isObj(f.regionGroups)) err(`${where}.regionGroups must be an object`);
      else for (const gname of Object.keys(f.regionGroups)) if (!groupsOfRegion.has(gname)) err(`${where}.regionGroups: "${gname}" is not a region group`);
    }
  };
  const checkLevers = (where: string, table: unknown) => {
    if (!isObj(table)) return err(`${where} must be an object of lever → number`);
    for (const [l, v] of Object.entries(table)) {
      if (!levers.has(l)) err(`${where}: "${l}" is not a lever`);
      if (!isNum(v)) err(`${where}.${l} must be a number`);
    }
  };

  // Voting
  const voting = raw.voting;
  if (!isObj(voting)) err('voting is missing');
  else {
    checkEffects('voting.ageShare', isObj(voting.ageShare) ? { [pops.attributes.find((a) => a.role === 'age')!.id]: voting.ageShare } : voting.ageShare);
    if (!isObj(voting.franchise)) err('voting.franchise must be an object');
    else
      for (const [attr, byCat] of Object.entries(voting.franchise)) {
        if (!cats[attr] || !isObj(byCat)) {
          err(`voting.franchise: "${attr}" is not a pop attribute`);
          continue;
        }
        for (const [c, byRegion] of Object.entries(byCat)) {
          if (!cats[attr]!.has(c)) err(`voting.franchise: "${c}" is not a category of ${attr}`);
          if (!isObj(byRegion)) continue;
          for (const r of Object.keys(byRegion)) if (!regionIds.has(r)) err(`voting.franchise: "${r}" is not a region`);
        }
      }
    if (!isObj(voting.turnout) || !isNum(voting.turnout.base)) err('voting.turnout needs a base rate');
    else checkFactors('voting.turnout', voting.turnout);
  }

  // Opinion
  const op = raw.opinion;
  if (!isObj(op)) err('opinion is missing');
  else {
    for (const f of ['startApproval', 'partisanWeight', 'termDecay', 'honeymoon', 'honeymoonKeep'] as const)
      if (!isNum(op[f])) err(`opinion.${f} must be a number`);
    checkEffects('opinion.partisan', op.partisan);
    if (!Array.isArray(op.partisanInteractions)) err('opinion.partisanInteractions must be a list');
    else
      for (const it of op.partisanInteractions as unknown[]) {
        if (!isObj(it) || !Array.isArray(it.when) || !isNum(it.effect)) {
          err('every partisan interaction needs `when` and `effect`');
          continue;
        }
        for (const pair of it.when as unknown[]) {
          const [a, c] = (pair as [string, string | string[]]) ?? [];
          if (!cats[a]) err(`partisan interaction: "${a}" is not a pop attribute`);
          else for (const cc of Array.isArray(c) ? c : [c]) if (!cats[a]!.has(cc)) err(`partisan interaction: "${cc}" is not a category of ${a}`);
        }
      }
    const econ = op.economy;
    if (!isObj(econ)) err('opinion.economy is missing');
    else {
      for (const f of ['unemployment', 'unemploymentRef', 'inflation', 'inflationRef', 'deflation', 'deflationRef', 'growth', 'memory'] as const)
        if (!isNum(econ[f])) err(`opinion.economy.${f} must be a number`);
      if (isObj(econ.sensitivity)) for (const [cond, t] of Object.entries(econ.sensitivity)) checkEffects(`opinion.economy.sensitivity.${cond}`, t);
    }
    if (!isObj(op.policies)) err('opinion.policies must be an object');
    else
      for (const [lever, t] of Object.entries(op.policies)) {
        if (!levers.has(lever)) err(`opinion.policies: "${lever}" is not a lever`);
        checkEffects(`opinion.policies.${lever}`, t, true);
      }
  }

  // Clout
  if (!isObj(raw.clout) || !['wealth', 'numbers', 'organisation'].every((k) => isNum((raw.clout as Obj)[k]))) err('clout needs wealth, numbers and organisation weights');

  // Parties and groups
  const leg = raw.legislature;
  const parties = new Set<string>(isObj(leg) && Array.isArray(leg.parties) ? (leg.parties as Obj[]).map((p) => p.id as string) : []);
  const groupIds = new Set<string>();
  if (!Array.isArray(raw.interestGroups) || raw.interestGroups.length === 0) err('interestGroups must list at least one group');
  else
    for (const g of raw.interestGroups as unknown[]) {
      if (!isObj(g) || !isStr(g.id) || !isStr(g.label)) {
        err('every interest group needs an id and label');
        continue;
      }
      if (groupIds.has(g.id)) err(`duplicate interest group "${g.id}"`);
      groupIds.add(g.id);
      const w = `group "${g.id}"`;
      if (!isObj(g.membership) || !isNum(g.membership.base)) err(`${w}: membership needs a base`);
      else checkFactors(`${w}.membership`, g.membership);
      for (const f of ['organisation', 'partyLean', 'startApproval'] as const) if (!isNum(g[f])) err(`${w}: ${f} must be a number`);
      if (g.party !== undefined && !parties.has(g.party as string)) err(`${w}: party "${String(g.party)}" is not a party`);
      checkLevers(`${w}.preferences`, g.preferences);
      if (!isObj(g.conditions)) err(`${w}: conditions must be an object`);
      else for (const s of Object.keys(g.conditions)) if (!statIds.has(s)) err(`${w}: condition "${s}" is not a stat`);
      if (g.lockIn !== undefined && (!isObj(g.lockIn) || !levers.has(g.lockIn.lever as string) || !isNum(g.lockIn.elasticity)))
        err(`${w}: lockIn needs a lever and an elasticity`);
      if (!isStr(g.note) || (g.provenance !== 'measured' && g.provenance !== 'estimate')) err(`${w} needs a provenance and a note`);
    }

  // Legislature
  if (!isObj(leg)) err('legislature is missing');
  else {
    const chambers = Array.isArray(leg.chambers) ? (leg.chambers as Obj[]) : [];
    if (chambers.length === 0) err('legislature needs at least one chamber');
    const factions = Array.isArray(leg.factions) ? (leg.factions as Obj[]) : [];
    for (const ch of chambers) {
      const total = factions.reduce((s, f) => s + (isObj(f.seats) && isNum(f.seats[ch.id as string]) ? (f.seats[ch.id as string] as number) : 0), 0);
      if (total !== ch.seats) err(`chamber "${String(ch.id)}": factions hold ${total} seats, not ${String(ch.seats)}`);
    }
    for (const f of factions) {
      if (!parties.has(f.party as string)) err(`faction "${String(f.id)}": unknown party`);
      if (f.base !== 'core' && f.base !== 'rest') err(`faction "${String(f.id)}": base must be "core" or "rest"`);
      if (!isObj(f.groups)) err(`faction "${String(f.id)}": groups must be an object`);
      else for (const gid of Object.keys(f.groups)) if (!groupIds.has(gid)) err(`faction "${String(f.id)}": "${gid}" is not an interest group`);
      checkLevers(`faction "${String(f.id)}".stances`, f.stances);
    }
    if (!Array.isArray(leg.coreRegions) || (leg.coreRegions as string[]).some((r) => !regionIds.has(r))) err('legislature.coreRegions must list regions');
    if (!isObj(leg.seatsByRegion)) err('legislature.seatsByRegion is missing');
    else
      for (const ch of chambers) {
        const byRegion = (leg.seatsByRegion as Obj)[ch.id as string];
        if (!isObj(byRegion)) {
          err(`legislature.seatsByRegion.${String(ch.id)} is missing`);
          continue;
        }
        const sum = Object.values(byRegion).reduce((s: number, v) => s + (isNum(v) ? v : 0), 0);
        if (sum !== ch.seats) err(`legislature.seatsByRegion.${String(ch.id)} sums to ${sum}, not ${String(ch.seats)}`);
      }
    if (!isObj(leg.bills)) err('legislature.bills is missing');
    else
      for (const f of ['salience', 'statusQuo', 'loyalty', 'opposition', 'ownFaction', 'approvalPull', 'groupPull', 'capitalPerPoint', 'whipUncertainty'] as const)
        if (!isNum((leg.bills as Obj)[f])) err(`legislature.bills.${f} must be a number`);
    if (isObj(leg.bills) && !((leg.bills as Obj).whipUncertainty as number > 0)) err('legislature.bills.whipUncertainty must be above zero');
  }

  // Capital
  if (!isObj(raw.capital) || !['start', 'max', 'base', 'approvalRate', 'failurePenalty', 'victoryBonus', 'newTerm'].every((k) => isNum((raw.capital as Obj)[k])))
    err('capital needs start, max, base, approvalRate, failurePenalty, victoryBonus and newTerm');

  // Leader
  const leader = raw.leader;
  if (!isObj(leader) || !isStr(leader.name) || !parties.has(leader.party as string)) err('leader needs a name and a party');

  // Elections
  const el = raw.elections;
  if (el !== undefined) {
    if (!isObj(el)) err('elections must be an object');
    else {
      for (const f of ['approvalEffect', 'midtermPenalty', 'incumbency', 'swingRatio', 'noise', 'retireBelow', 'normalVote', 'electoralBonus'] as const)
        if (!isNum(el[f])) err(`elections.${f} must be a number`);
      if (!isObj(el.nominees)) err('elections.nominees must be an object');
      else
        for (const [year, byParty] of Object.entries(el.nominees)) {
          if (!isObj(byParty)) continue;
          for (const [party, list] of Object.entries(byParty)) {
            if (!parties.has(party)) err(`elections.nominees.${year}: "${party}" is not a party`);
            if (!Array.isArray(list) || list.length === 0) err(`elections.nominees.${year}.${party} must list at least one nominee`);
          }
        }
    }
  }
  return errors;
}
