/**
 * Opinion: each pop's approval of the head of government and its vote.
 *
 * Additive in log-odds (GDD): a pop's approval is
 *   intercept (calibrated) − term decay + honeymoon
 *   + party leaning × weight × (+1 if the leader is of the first party, −1 otherwise)
 *   + the economy as this group feels it (unemployment, inflation, deflation, growth)
 *   + the pocketbook effects of policy changes since the start.
 * Party leaning is itself additive by attribute, plus a few historical
 * interactions (the Solid South).
 *
 * Only adults who may vote count towards national approval; elections also
 * weigh them by turnout. Per-combination tables are compiled once per model.
 */

import { codecFor, type PopCodec } from '../pops/codec';
import type { PopModelData, PopsState } from '../pops/types';
import { leverChange } from './levers';
import type { AttributeFactors, PoliticsModelData, PoliticsState } from './types';

export const logistic = (z: number) => 1 / (1 + Math.exp(-z));
export const logit = (p: number) => Math.log(p / (1 - p));

export interface CellTables {
  /** Party leaning (log-odds towards the first party), before the national intercept. */
  lean: Float64Array;
  /** Share old enough and allowed to vote. */
  eligible: Float64Array;
  /** Turnout of those who may vote. */
  turnout: Float64Array;
  /** Sensitivity to each economic condition. */
  sensitivity: Record<'unemployment' | 'inflation' | 'deflation' | 'growth', Float64Array>;
  /** Pocketbook effect of each lever, per unit of change. */
  policy: Record<string, Float64Array>;
}

/** A factor or effect table compiled to numbers: one value per category of each attribute. */
type Compiled = Float64Array[];

/** Compiles attribute → category → value into per-attribute arrays (unlisted categories get `fill`). */
function compile(codec: PopCodec, table: Record<string, Record<string, number>>, fill: number, defaults?: Record<string, number>): Compiled {
  return codec.attributes.map((attr) => {
    const row = table[attr.id];
    const def = defaults?.[attr.id] ?? fill;
    return Float64Array.from(attr.categories.map((c) => row?.[c.id] ?? def));
  });
}

/** Product of a compiled factor table and region-group multipliers, for every attribute combination. */
export function factorTable(codec: PopCodec, f: AttributeFactors, scale = 1): Float64Array {
  const compiled = compile(codec, f.factors, 1, f.defaults);
  const region = codec.role.region;
  if (f.regionGroups && region !== undefined) {
    const groups = codec.attributes[region]!.categories.map((c) => f.regionGroups![c.group ?? ''] ?? 1);
    compiled[region] = compiled[region]!.map((v, i) => v * groups[i]!);
  }
  return combine(compiled, (a, b) => a * b, scale);
}

/** Sum of a compiled effect table, for every attribute combination. */
function effectTable(codec: PopCodec, table: Record<string, Record<string, number>>): Float64Array {
  const compiled = compile(codec, Object.fromEntries(Object.entries(table).filter(([k]) => k !== '*')), 0);
  return combine(compiled, (a, b) => a + b, table['*']?.['*'] ?? 0);
}

/** Folds per-attribute arrays over every combination (last attribute fastest, matching the codec). */
function combine(compiled: Compiled, op: (a: number, b: number) => number, start: number): Float64Array {
  let table = Float64Array.of(start);
  for (let a = 0; a < compiled.length; a++) {
    const values = compiled[a]!;
    const next = new Float64Array(table.length * values.length);
    for (let i = 0; i < table.length; i++) for (let c = 0; c < values.length; c++) next[i * values.length + c] = op(table[i]!, values[c]!);
    table = next;
  }
  return table;
}

const cache = new WeakMap<PoliticsModelData, CellTables>();

export function cellTables(model: PoliticsModelData, pops: PopModelData): CellTables {
  const cached = cache.get(model);
  if (cached) return cached;
  const codec = codecFor(pops);
  const region = codec.role.region;
  const age = codec.role.age!;
  const op = model.opinion;

  // Party leaning: additive effects, plus interactions (pops matching every condition).
  const lean = effectTable(codec, op.partisan);
  for (const it of op.partisanInteractions) {
    const match = codec.attributes.map((attr) => {
      const cond = it.when.find(([a]) => a === attr.id);
      const allowed = cond ? (Array.isArray(cond[1]) ? cond[1] : [cond[1]]) : null;
      return Float64Array.from(attr.categories.map((c) => (allowed === null || allowed.includes(c.id) ? 1 : 0)));
    });
    const hit = combine(match, (x, y) => x * y, 1);
    for (let k = 0; k < lean.length; k++) if (hit[k]) lean[k]! += it.effect;
  }

  // Who may vote: age, then franchise limits by attribute and region.
  const ageShare = codec.attributes.map((attr, a) =>
    Float64Array.from(attr.categories.map((c) => (a === age ? model.voting.ageShare[c.id] ?? 0 : 1))),
  );
  const eligible = combine(ageShare, (x, y) => x * y, 1);
  if (region !== undefined) {
    for (const [attrId, byCat] of Object.entries(model.voting.franchise)) {
      const a = codec.index[attrId]!;
      const cats = codec.attributes[a]!.categories;
      for (let k = 0; k < eligible.length; k++) {
        const limits = byCat[cats[codec.get(k, a)]!.id];
        if (!limits || eligible[k] === 0) continue;
        eligible[k]! *= limits[codec.attributes[region]!.categories[codec.get(k, region)]!.id] ?? 1;
      }
    }
  }
  const turnout = factorTable(codec, model.voting.turnout, model.voting.turnout.base).map((t) => Math.min(1, t));

  const sens = (cond: string) => {
    const t = op.economy.sensitivity[cond];
    return t ? combine(compile(codec, t, 1), (x, y) => x * y, 1) : new Float64Array(codec.cells).fill(1);
  };
  const sensitivity = {
    unemployment: sens('unemployment'),
    inflation: sens('inflation'),
    deflation: sens('deflation'),
    growth: sens('growth'),
  };
  const policy: Record<string, Float64Array> = Object.fromEntries(
    Object.entries(op.policies).map(([lever, table]) => [lever, effectTable(codec, table)]),
  );
  const tables = { lean, eligible, turnout, sensitivity, policy };
  cache.set(model, tables);
  return tables;
}

/** +1 if the first party governs, −1 otherwise. */
export function partySign(model: PoliticsModelData, party: string): number {
  return model.legislature.parties[0]?.id === party ? 1 : -1;
}

/** The national (everyone-alike) part of approval this quarter, before group effects. */
export interface ApprovalInputs {
  intercept: number;
  sign: number;
  economy: { unemployment: number; inflation: number; deflation: number; growth: number };
  /** Change in each lever since the start, in comparable units. */
  changes: Record<string, number>;
}

export function approvalInputs(model: PoliticsModelData, politics: PoliticsState, levers: Record<string, number>): ApprovalInputs {
  const op = model.opinion;
  const e = op.economy;
  const m = politics.mood;
  const changes: Record<string, number> = {};
  for (const [lever, now] of Object.entries(levers)) {
    const then = politics.calib.levers0[lever];
    if (then !== undefined) changes[lever] = leverChange(lever, then, now);
  }
  return {
    intercept:
      politics.calib.approvalIntercept - op.termDecay * politics.leader.quartersInOffice + politics.leader.honeymoon +
      (politics.eventEffects?.approval ?? 0),
    sign: partySign(model, politics.leader.party),
    economy: {
      unemployment: e.unemployment * (m.unemployment - e.unemploymentRef),
      inflation: e.inflation * Math.max(0, m.inflation - e.inflationRef),
      deflation: e.deflation * Math.max(0, -m.inflation - e.deflationRef),
      growth: e.growth * m.growth,
    },
    changes,
  };
}

/**
 * Each pop's approval log-odds apart from the national intercept, and its
 * weight (people who may vote). Approval for any intercept x is then
 * Σ weight × logistic(x + offset) ÷ Σ weight, which makes calibration cheap.
 */
export function approvalOffsets(
  model: PoliticsModelData,
  popModel: PopModelData,
  pops: Pick<PopsState, 'keys' | 'size'>,
  inputs: ApprovalInputs,
): { offset: Float64Array; weight: Float64Array } {
  const t = cellTables(model, popModel);
  const n = pops.keys.length;
  const offset = new Float64Array(n);
  const weight = new Float64Array(n);
  const party = inputs.sign * model.opinion.partisanWeight;
  const e = inputs.economy;
  const active = Object.entries(inputs.changes)
    .filter(([lever, change]) => change !== 0 && t.policy[lever])
    .map(([lever, change]) => [t.policy[lever]!, change] as const);
  for (let i = 0; i < n; i++) {
    const k = pops.keys[i]!;
    weight[i] = pops.size[i]! * t.eligible[k]!;
    let z = party * t.lean[k]!;
    z += t.sensitivity.unemployment[k]! * e.unemployment + t.sensitivity.inflation[k]! * e.inflation;
    z += t.sensitivity.deflation[k]! * e.deflation + t.sensitivity.growth[k]! * e.growth;
    for (const [table, change] of active) z += table[k]! * change;
    offset[i] = z;
  }
  return { offset, weight };
}

/** Weighted mean of logistic(intercept + offset). */
export function meanApproval(o: { offset: Float64Array; weight: Float64Array }, intercept: number): number {
  let w = 0;
  let a = 0;
  for (let i = 0; i < o.offset.length; i++) {
    const wi = o.weight[i]!;
    if (wi <= 0) continue;
    w += wi;
    a += wi * logistic(intercept + o.offset[i]!);
  }
  return w > 0 ? a / w : 0.5;
}

/** National approval among those who may vote, 0–1. */
export function nationalApproval(model: PoliticsModelData, popModel: PopModelData, pops: Pick<PopsState, 'keys' | 'size'>, inputs: ApprovalInputs): number {
  return meanApproval(approvalOffsets(model, popModel, pops, inputs), inputs.intercept);
}

/** Approval among those who may vote, by category of one attribute (NaN where nobody may vote). */
export function approvalBy(
  model: PoliticsModelData,
  popModel: PopModelData,
  pops: Pick<PopsState, 'keys' | 'size'>,
  inputs: ApprovalInputs,
  attributeId: string,
): number[] {
  const codec = codecFor(popModel);
  const a = codec.index[attributeId]!;
  const o = approvalOffsets(model, popModel, pops, inputs);
  const w = new Array<number>(codec.sizes[a]!).fill(0);
  const s = new Array<number>(codec.sizes[a]!).fill(0);
  for (let i = 0; i < pops.keys.length; i++) {
    const wi = o.weight[i]!;
    if (wi <= 0) continue;
    const c = codec.get(pops.keys[i]!, a);
    w[c]! += wi;
    s[c]! += wi * logistic(inputs.intercept + o.offset[i]!);
  }
  return s.map((x, i) => (w[i]! > 0 ? x / w[i]! : NaN));
}

/**
 * Share of the vote for the first party among those who turn out, by region,
 * with a national tide (log-odds) and the calibrated intercept.
 * Returns votes for the first party and total votes per region category.
 */
export function votesByRegion(
  model: PoliticsModelData,
  popModel: PopModelData,
  pops: Pick<PopsState, 'keys' | 'size'>,
  intercept: number,
  tide: number,
): { first: number[]; total: number[] } {
  const tables = cellTables(model, popModel);
  const codec = codecFor(popModel);
  const r = codec.role.region!;
  const first = new Array<number>(codec.sizes[r]!).fill(0);
  const total = new Array<number>(codec.sizes[r]!).fill(0);
  for (let i = 0; i < pops.keys.length; i++) {
    const k = pops.keys[i]!;
    const votes = pops.size[i]! * tables.eligible[k]! * tables.turnout[k]!;
    if (votes <= 0) continue;
    const region = codec.get(k, r);
    total[region]! += votes;
    first[region]! += votes * logistic(tables.lean[k]! + intercept + tide);
  }
  return { first, total };
}

/** Finds x in [lo, hi] with f(x) = target for an increasing f (bisection). */
export function solveIncreasing(f: (x: number) => number, target: number, lo = -10, hi = 10): number {
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
