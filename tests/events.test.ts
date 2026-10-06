import { describe, expect, it } from 'vitest';
import { holds, parseQuarter, type ConditionScope } from '../src/sim/events/conditions';
import { createEventsState, fireEvent, inWindow, rollEvents } from '../src/sim/events/engine';
import { modifierTotal, modifierValue } from '../src/sim/events/modifiers';
import type { EventData, EventsState } from '../src/sim/events/types';
import { validateEventFiles, type EventRefs } from '../src/sim/events/validate';
import { content } from '../src/sim/loadContent';
import { eventEngineContent, proposedBills } from '../src/sim/orders';
import { leverIds } from '../src/sim/politics/levers';
import { createRng } from '../src/sim/rng';
import { SAVE_FORMAT, deserializeGame, serializeGame } from '../src/sim/save';
import type { GameState } from '../src/sim/schema';
import { compareDates } from '../src/sim/time';
import { advanceTurn, stateChecksum } from '../src/sim/turn';
import { createGame } from '../src/sim/world';
import { sandboxGame } from './helpers';

const engine = eventEngineContent();
const eventById = (id: string) => content.events.events.find((e) => e.id === id)!;
const usa = (g: GameState) => g.nations.usa!;
const econ = (g: GameState) => {
  const e = usa(g).economy!;
  if (e.engine !== 'keynesian') throw new Error('expected a Keynesian economy');
  return e;
};
const rng = (g: GameState) => (stream: string) => createRng(g.seed, g.turn, `events:${stream}`);

/** Fires an event in the game's current quarter, as if it had just been rolled. */
function fireNow(g: GameState, id: string): GameState {
  const next = structuredClone(g);
  fireEvent(next, engine, eventById(id), next.turn, next.date, rng(next));
  return next;
}

function play(g: GameState, quarters: number): GameState {
  for (let i = 0; i < quarters; i++) g = advanceTurn(g);
  return g;
}

const refs: EventRefs = {
  nations: new Set(Object.keys(content.nations)),
  stats: new Set(content.stats.map((s) => s.id)),
  budgetLines: new Set(content.economy.budgetLines.map((l) => l.id)),
  levers: leverIds(content.economy.budgetLines, content.economy.taxLines),
  politics: content.politics,
};

const minimalEvent = (over: Record<string, unknown> = {}) => ({
  id: 'test_event',
  tier: 'major',
  nation: 'usa',
  triggers: [],
  chance: { base: 0.5 },
  kicker: 'Test',
  headline: 'A test',
  paragraphs: ['Something happens.'],
  options: [
    { id: 'a', label: 'A', description: 'Option A', default: true, effects: [] },
    { id: 'b', label: 'B', description: 'Option B', effects: [] },
  ],
  provenance: 'estimate',
  note: 'Test event.',
  ...over,
});

describe('event content', () => {
  it('loads every event and meter from data/events', () => {
    expect(content.events.events.length).toBeGreaterThanOrEqual(10);
    expect(content.events.meters.map((m) => m.id)).toEqual(expect.arrayContaining(['red_scare', 'war_weariness']));
    for (const id of ['soviet_bomb', 'korean_war', 'mccarthy_wheeling', 'fall_of_china', 'nsc_68', 'treasury_fed_accord', 'price_freeze']) {
      expect(eventById(id), id).toBeDefined();
    }
  });

  it('every event with choices has exactly one default, the historical choice', () => {
    for (const e of content.events.events) {
      if (!e.options) continue;
      expect(e.options.filter((o) => o.default).length, e.id).toBe(1);
    }
  });

  it('quotes stay short (they come from public-domain government documents, and the rest is paraphrase)', () => {
    for (const e of content.events.events) {
      if (e.quote) expect(e.quote.text.split(/\s+/).length, e.id).toBeLessThanOrEqual(30);
    }
  });

  it('rejects broken event files with clear messages', () => {
    const check = (events: unknown[], meters: unknown[] = []) => validateEventFiles({ 'data/events/test.json': { events, meters } }, refs).errors.join('\n');
    expect(check([minimalEvent()])).toBe('');
    expect(check([minimalEvent({ tier: 'epic' })])).toMatch(/tier/);
    expect(check([minimalEvent({ nation: 'atlantis' })])).toMatch(/unknown nation "atlantis"/);
    expect(check([minimalEvent({ window: { from: 'June 1950' } })])).toMatch(/window.from/);
    expect(check([minimalEvent({ window: { from: '1951-Q1', to: '1950-Q1' } })])).toMatch(/from is after to/);
    expect(check([minimalEvent({ triggers: [{ fired: 'no_such_event' }] })])).toMatch(/unknown event "no_such_event"/);
    expect(check([minimalEvent({ triggers: [{ chose: 'test_event', option: 'z' }] })])).toMatch(/has no option "z"/);
    expect(check([minimalEvent({ triggers: [{ meter: 'panic' }] })])).toMatch(/unknown meter "panic"/);
    expect(check([minimalEvent({ triggers: [{ wibble: 1 }] })])).toMatch(/unknown condition/);
    expect(check([minimalEvent({ chance: { base: 2 } })])).toMatch(/chance.base/);
    expect(check([minimalEvent({ effects: [{ modifier: { target: 'group:freemasons', value: 1 } }] })])).toMatch(/no interest group "freemasons"/);
    expect(check([minimalEvent({ effects: [{ modifier: { target: 'bill:budget:moonbase', value: 1 } }] })])).toMatch(/unknown lever/);
    expect(check([minimalEvent({ effects: [{ modifier: { target: 'morale', value: 1 } }] })])).toMatch(/unknown target "morale"/);
    expect(check([minimalEvent({ effects: [{ modifier: { target: 'approval', value: 1, curve: 'decay' } }] })])).toMatch(/needs a duration/);
    expect(check([minimalEvent({ effects: [{ budget: 'moonbase', multiply: 2 }] })])).toMatch(/unknown budget line/);
    expect(check([minimalEvent({ effects: [{ queue: 'test_event', delay: 0 }] })])).toMatch(/delay/);
    expect(check([minimalEvent({ effects: [{ monetaryRegime: 'gold_standard' }] })])).toMatch(/monetaryRegime/);
    expect(check([minimalEvent({ effects: [{ teleport: true }] })])).toMatch(/unknown effect/);
    expect(check([minimalEvent({ options: [{ id: 'a', label: 'A', description: 'A', effects: [] }] })])).toMatch(/exactly one option must be the default/);
    expect(check([minimalEvent(), minimalEvent()])).toMatch(/duplicate event id/);
    expect(check([minimalEvent({ provenance: 'rumour' })])).toMatch(/provenance/);
    expect(check([], [{ id: 'm', label: 'M', description: 'D', min: 0, max: 10, start: 20, decay: 0.1, provenance: 'estimate', note: 'n' }])).toMatch(/start/);
  });
});

describe('conditions and modifiers', () => {
  const scope = (over: Partial<ConditionScope> = {}): ConditionScope => {
    const g = createGame(content, 'usa-1949');
    return { state: g, events: g.events, date: { year: 1950, quarter: 2 }, turn: 6, nation: 'usa', ...over };
  };

  it('reads dates, flags, event history, stats and meters', () => {
    expect(parseQuarter('1950-Q2')).toEqual({ year: 1950, quarter: 2 });
    expect(parseQuarter('1950-Q5')).toBeNull();
    const s = scope();
    expect(holds({ after: '1950-Q2' }, s)).toBe(true);
    expect(holds({ after: '1950-Q3' }, s)).toBe(false);
    expect(holds({ before: '1950-Q1' }, s)).toBe(false);
    expect(holds({ flag: 'korea_war' }, s)).toBe(false);
    s.events.flags.korea_war = 5;
    expect(holds({ flag: 'korea_war' }, s)).toBe(true);
    expect(holds({ notFlag: 'korea_war' }, s)).toBe(false);
    s.events.record.push({ key: 'soviet_bomb@3', event: 'soviet_bomb', nation: 'usa', turn: 3, option: 'announce' });
    expect(holds({ fired: 'soviet_bomb' }, s)).toBe(true);
    expect(holds({ chose: 'soviet_bomb', option: 'announce' }, s)).toBe(true);
    expect(holds({ chose: 'soviet_bomb', option: 'withhold' }, s)).toBe(false);
    expect(holds({ quartersSince: 'soviet_bomb', atLeast: 3 }, s)).toBe(true);
    expect(holds({ quartersSince: 'soviet_bomb', atLeast: 4 }, s)).toBe(false);
    expect(holds({ quartersSince: 'soviet_bomb', atMost: 2 }, s)).toBe(false);
    expect(holds({ stat: 'unemployment', above: 3 }, s)).toBe(true);
    expect(holds({ stat: 'nuclear_warheads', nation: 'ussr', above: 0 }, s)).toBe(false);
    expect(holds({ meter: 'red_scare', above: 5 }, s)).toBe(true);
    expect(holds({ leaderParty: 'democratic' }, s)).toBe(true);
    expect(holds({ monetaryRegime: 'treasury_peg' }, s)).toBe(true);
    expect(holds({ priceControls: false }, s)).toBe(true);
    expect(holds({ any: [{ flag: 'nope' }, { flag: 'korea_war' }] }, s)).toBe(true);
    expect(holds({ all: [{ flag: 'nope' }, { flag: 'korea_war' }] }, s)).toBe(false);
    expect(holds({ not: { flag: 'nope' } }, s)).toBe(true);
  });

  it('fire windows include both ends', () => {
    const e = { window: { from: '1949-Q3', to: '1951-Q2' } };
    expect(inWindow(e, { year: 1949, quarter: 2 })).toBe(false);
    expect(inWindow(e, { year: 1949, quarter: 3 })).toBe(true);
    expect(inWindow(e, { year: 1951, quarter: 2 })).toBe(true);
    expect(inWindow(e, { year: 1951, quarter: 3 })).toBe(false);
  });

  it('modifier curves: flat, decaying in a straight line, ramping up and staying', () => {
    expect(modifierValue({ value: 1, curve: 'flat', duration: 4 }, 3)).toBe(1);
    expect(modifierValue({ value: 1, curve: 'flat', duration: 4 }, 4)).toBe(0);
    expect(modifierValue({ value: 1, curve: 'flat' }, 400)).toBe(1);
    expect(modifierValue({ value: 1, curve: 'decay', duration: 4 }, 0)).toBe(1);
    expect(modifierValue({ value: 1, curve: 'decay', duration: 4 }, 2)).toBeCloseTo(0.5);
    expect(modifierValue({ value: 1, curve: 'decay', duration: 4 }, 4)).toBe(0);
    expect(modifierValue({ value: 1, curve: 'ramp', duration: 4 }, 0)).toBeCloseTo(0.25);
    expect(modifierValue({ value: 1, curve: 'ramp', duration: 4 }, 3)).toBe(1);
    expect(modifierValue({ value: 1, curve: 'ramp', duration: 4 }, 40)).toBe(1);
    expect(modifierValue({ value: 1, curve: 'flat' }, -1)).toBe(0);
  });

  it('a target sums its modifiers and every meter that acts on it', () => {
    const events: EventsState = { ...createEventsState(content.events), meters: { red_scare: 50, war_weariness: 0 } };
    events.modifiers.push({ source: 'x', nation: 'usa', target: 'approval', value: -0.2, start: 1, curve: 'flat' });
    events.modifiers.push({ source: 'y', nation: 'ussr', target: 'approval', value: 9, start: 1, curve: 'flat' });
    const perPoint = content.events.meters.find((m) => m.id === 'red_scare')!.effects!.find((e) => e.target === 'approval')!.perPoint;
    expect(modifierTotal(events, content.events, 'usa', 'approval', 2)).toBeCloseTo(-0.2 + 50 * perPoint);
  });

  it('meters fade without pressure and rise while their condition holds', () => {
    let g = createGame(content, 'usa-1949', 'meters');
    g.events.meters.red_scare = 50;
    g.events.flags.korea_war = 1;
    const red = content.events.meters.find((m) => m.id === 'red_scare')!;
    g = advanceTurn(g);
    // Nothing in early 1949 feeds the scare, so it only fades; American troops "in Korea" wear on the public.
    expect(g.events.meters.red_scare).toBeCloseTo(50 * (1 - red.decay), 6);
    expect(g.events.meters.war_weariness).toBe(4);
  });
});

describe('firing events', () => {
  it('the same seed gives the same events; different seeds give different histories', () => {
    const run = (seed: string) => play(createGame(content, 'usa-1949', seed), 8).events.record.map((r) => `${r.key}:${r.option ?? ''}`);
    expect(run('same')).toEqual(run('same'));
    const histories = new Set(['a', 'b', 'c', 'd'].map((s) => run(s).join(' ')));
    expect(histories.size).toBeGreaterThan(1);
  });

  it('hands-off, the history of 1949–53 is the likeliest path: the bomb, China, Korea, each inside its window', () => {
    const seeds = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
    let bomb = 0;
    let korea = 0;
    let china = 0;
    for (const seed of seeds) {
      const g = play(createGame(content, 'usa-1949', seed), 19);
      const fired = (id: string) => g.events.record.filter((r) => r.event === id);
      if (fired('soviet_bomb').length) bomb += 1;
      if (fired('fall_of_china').length) china += 1;
      if (fired('korean_war').length) korea += 1;
      // Nothing fires outside its window, and one-off events fire at most once.
      for (const r of g.events.record) {
        const e = eventById(r.event);
        const date = g.history[r.turn - 1]!.date;
        expect(inWindow(e, date), `${r.event} at turn ${r.turn}`).toBe(true);
        if (!e.repeatable) expect(fired(r.event).length, r.event).toBe(1);
      }
      // Korea comes after the bomb's window opens and never before mid-1950.
      for (const r of fired('korean_war')) expect(compareDates(g.history[r.turn - 1]!.date, { year: 1950, quarter: 2 })).toBeGreaterThanOrEqual(0);
    }
    expect(bomb).toBeGreaterThanOrEqual(5);
    expect(china).toBeGreaterThanOrEqual(5);
    expect(korea).toBeGreaterThanOrEqual(4);
  });

  it('an event with choices waits for the player; unanswered, it takes the historical default', () => {
    const g = fireNow(createGame(content, 'usa-1949'), 'nato_treaty');
    expect(g.events.pending.map((p) => p.event)).toEqual(['nato_treaty']);
    const next = advanceTurn(g);
    const record = next.events.record.find((r) => r.event === 'nato_treaty')!;
    expect(record.option).toBe('sign');
    expect(record.defaulted).toBe(true);
    expect(next.events.flags.nato).toBeDefined();
    expect(next.events.pending.some((p) => p.event === 'nato_treaty')).toBe(false);
  });

  it("the player's choice decides the outcome, and an option that is not offered falls back to the default", () => {
    const g = fireNow(createGame(content, 'usa-1949'), 'nato_treaty');
    const key = g.events.pending[0]!.key;
    const loose = advanceTurn(g, { events: { [key]: 'loose_declaration' } });
    expect(loose.events.flags.nato_weak).toBeDefined();
    expect(loose.events.flags.nato).toBeUndefined();
    expect(loose.events.record.find((r) => r.key === key)!.defaulted).toBeUndefined();
    const bogus = advanceTurn(g, { events: { [key]: 'annex_canada' } });
    expect(bogus.events.flags.nato).toBeDefined();
  });

  it('options with requirements are only offered when they hold (no plant seizures in peacetime)', () => {
    const g = fireNow(createGame(content, 'usa-1949'), 'strike_wave');
    const key = g.events.pending[0]!.key;
    const next = advanceTurn(g, { events: { [key]: 'seize' } });
    expect(next.events.record.find((r) => r.key === key)!.option).toBe('bargain');
  });

  it('Korea: intervening raises the defence budget at once and queues the Chinese intervention; staying out does not', () => {
    const g = fireNow(createGame(content, 'usa-1949'), 'korean_war');
    const key = g.events.pending[0]!.key;
    const defence0 = econ(g).budgetTargets.defence!;
    const fight = advanceTurn(g, { events: { [key]: 'intervene' } });
    const out = advanceTurn(g, { events: { [key]: 'stay_out' } });
    expect(econ(fight).budgetTargets.defence!).toBeCloseTo(defence0 * 1.7, 5);
    expect(econ(out).budgetTargets.defence!).toBeCloseTo(defence0, 5);
    expect(fight.events.flags.korea_war).toBeDefined();
    expect(fight.events.queued.some((q) => q.event === 'chinese_intervention')).toBe(true);
    expect(out.events.flags.korea_lost).toBeDefined();
    expect(out.events.meters.red_scare!).toBeGreaterThan(fight.events.meters.red_scare!);
    expect(usa(fight).stats.approval!).toBeGreaterThan(usa(out).stats.approval!);
  });

  it('queued consequences fire on time when their triggers still hold, and not when they do not', () => {
    let g = fireNow(createGame(content, 'usa-1949'), 'korean_war');
    const key = g.events.pending[0]!.key;
    g = advanceTurn(g, { events: { [key]: 'intervene' } });
    const due = g.events.queued.find((q) => q.event === 'chinese_intervention')!.turn;
    while (g.turn < due) g = advanceTurn(g);
    expect(g.events.record.some((r) => r.event === 'chinese_intervention' && r.turn === due)).toBe(true);

    let h = fireNow(createGame(content, 'usa-1949'), 'korean_war');
    h = advanceTurn(h, { events: { [h.events.pending[0]!.key]: 'intervene' } });
    delete h.events.flags.korea_war; // the war ended before China came in
    while (h.turn < due) h = advanceTurn(h);
    expect(h.events.record.some((r) => r.event === 'chinese_intervention')).toBe(false);
  });

  it('AI nations choose at once, by weight', () => {
    const g = createGame(content, 'usa-1949');
    const soviet: EventData = {
      ...(minimalEvent({ id: 'politburo_test', nation: 'ussr' }) as unknown as EventData),
      options: [
        { id: 'never', label: 'N', description: 'N', default: true, aiWeight: 0, effects: [{ flag: 'never' }] },
        { id: 'always', label: 'A', description: 'A', aiWeight: 1, effects: [{ flag: 'always' }] },
      ],
    };
    fireEvent(g, { ...engine, events: [...engine.events, soviet] }, soviet, g.turn, g.date, rng(g));
    expect(g.events.pending).toEqual([]);
    expect(g.events.flags.always).toBeDefined();
    expect(g.events.flags.never).toBeUndefined();
  });

  it('a sandbox game with events switched off fires nothing', () => {
    const g = play(sandboxGame('usa-1949', 'quiet'), 8);
    expect(g.events.record).toEqual([]);
  });

  it('no more events of a tier fire in one quarter than the tier allows (consequences excepted)', () => {
    const g = createGame(content, 'usa-1949', 'crowded');
    // Make everything eligible fire: a world where every chance is certain.
    const certain = { ...engine, events: engine.events.map((e) => ({ ...e, chance: { base: e.chance.base > 0 ? 1 : 0 } })) };
    g.date = { year: 1950, quarter: 1 };
    g.turn = 5;
    g.events.flags.korea_war = 1;
    g.events.record.push({ key: 'soviet_bomb@3', event: 'soviet_bomb', nation: 'usa', turn: 3 });
    rollEvents(g, certain, rng(g));
    const fired = g.events.record.filter((r) => r.turn === 6);
    const byTier: Record<string, number> = {};
    for (const r of fired) byTier[eventById(r.event).tier] = (byTier[eventById(r.event).tier] ?? 0) + 1;
    expect(byTier.super ?? 0).toBeLessThanOrEqual(1);
    expect(byTier.major ?? 0).toBeLessThanOrEqual(2);
    expect(byTier.minor ?? 0).toBeLessThanOrEqual(2);
    expect(byTier.news ?? 0).toBeLessThanOrEqual(3);
    expect(fired.length).toBeGreaterThan(0);
  });
});

describe('what events change', () => {
  it('approval and interest-group modifiers move opinion', () => {
    const g = createGame(content, 'usa-1949', 'opinion');
    const hit = structuredClone(g);
    hit.events.modifiers.push({ source: 'test', nation: 'usa', target: 'approval', value: -0.5, start: 1, curve: 'flat' });
    hit.events.modifiers.push({ source: 'test', nation: 'usa', target: 'group:labour', value: -1, start: 1, curve: 'flat' });
    const a = advanceTurn(g);
    const b = advanceTurn(hit);
    expect(usa(b).stats.approval!).toBeLessThan(usa(a).stats.approval! - 5);
    const labour = (x: GameState) => usa(x).politics!.groups.find((gr) => gr.id === 'labour')!.approval;
    expect(labour(b)).toBeLessThan(labour(a) - 0.1);
  });

  it('a "bill:" modifier makes a bill likelier to pass, and the odds shown are the odds used', () => {
    const g = createGame(content, 'usa-1949', 'bills');
    const orders = { budget: { defence: 9 } };
    const before = proposedBills(g, orders)![0]!.odds;
    g.events.modifiers.push({ source: 'test', nation: 'usa', target: 'bill:budget:defence', value: -2, start: 1, curve: 'flat' });
    const cut = proposedBills(g, orders)![0]!.odds;
    expect(cut).toBeLessThan(before);
    const next = advanceTurn(g, orders);
    expect(usa(next).politics!.lastBills[0]!.odds).toBeCloseTo(cut, 10);
  });

  it('demand shocks: a consumption modifier raises spending', () => {
    const g = sandboxGame('usa-1949', 'shock');
    const hit = structuredClone(g);
    hit.events.modifiers.push({ source: 'test', nation: 'usa', target: 'consumption', value: 0.05, start: 1, curve: 'flat' });
    expect(econ(advanceTurn(hit)).consumption).toBeGreaterThan(econ(advanceTurn(g)).consumption * 1.01);
  });

  it('the Accord frees the Fed: in a war boom rates rise past the old ceiling, gradually', () => {
    let pegged = sandboxGame('usa-1949', 'accord');
    let free = structuredClone(pegged);
    free = fireNow(free, 'treasury_fed_accord');
    const key = free.events.pending[0]!.key;
    pegged = advanceTurn(pegged, { budget: { defence: 60 } });
    free = advanceTurn(free, { budget: { defence: 60 }, events: { [key]: 'accept' } });
    expect(econ(free).monetaryRegime).toBe('independent');
    let previous = econ(free).shortRate;
    for (let i = 0; i < 10; i++) {
      pegged = advanceTurn(pegged);
      free = advanceTurn(free);
      expect(econ(free).shortRate - previous).toBeLessThanOrEqual(econ(free).params.policy_rate_max_step + 1e-9);
      previous = econ(free).shortRate;
    }
    expect(econ(pegged).shortRate).toBeLessThanOrEqual(econ(pegged).shortRateCeiling + 1e-9);
    expect(econ(free).shortRate).toBeGreaterThan(econ(pegged).shortRateCeiling + 1);
    expect(econ(free).longRate).toBeGreaterThan(econ(pegged).longRate);
  });

  it('price controls hold inflation down in a war boom, and the held-back rises come out when they end', () => {
    const boom = (controls: boolean) => {
      let g = sandboxGame('usa-1949', 'controls');
      g = advanceTurn(g, { budget: { defence: 50 } });
      for (let i = 0; i < 6; i++) g = advanceTurn(g);
      econ(g).priceControls = controls;
      for (let i = 0; i < 6; i++) g = advanceTurn(g);
      return g;
    };
    const free = boom(false);
    const controlled = boom(true);
    expect(econ(controlled).inflation).toBeLessThan(econ(free).inflation - 2);
    expect(econ(controlled).repressedInflation).toBeGreaterThan(0);
    expect(econ(free).repressedInflation).toBe(0);
    const lifted = structuredClone(controlled);
    econ(lifted).priceControls = false;
    const after = advanceTurn(lifted);
    expect(econ(after).breakdown.inflation.find((b) => b.label === 'Held-back prices coming out')!.value).toBeGreaterThan(0);
    expect(econ(after).repressedInflation).toBeLessThan(econ(controlled).repressedInflation);
  });

  it('the Soviet bomb gives the USSR its first warhead', () => {
    const g = fireNow(createGame(content, 'usa-1949'), 'soviet_bomb');
    expect(g.nations.ussr!.stats.nuclear_warheads).toBe(1);
    expect(g.events.flags.soviet_bomb).toBeDefined();
  });
});

describe('saves', () => {
  it('a game with pending events and modifiers saves and continues identically', () => {
    let g = fireNow(createGame(content, 'usa-1949', 'save-events'), 'korean_war');
    g = advanceTurn(g);
    const reloaded = deserializeGame(serializeGame(g), content);
    expect(reloaded).toEqual(g);
    expect(stateChecksum(play(reloaded, 4))).toBe(stateChecksum(play(g, 4)));
  });

  it('upgrades a schema 6 save: events start empty, the economy gains price controls and the Accord', () => {
    const modern = play(createGame(content, 'usa-1949', 'old-events'), 2);
    const old = structuredClone(modern) as unknown as Record<string, any>;
    delete old.events;
    const e = old.nations.usa.economy;
    delete e.priceControls;
    delete e.repressedInflation;
    for (const k of ['term_premium', 'long_rate_adjustment', 'price_control_passthrough', 'price_control_leak', 'price_control_release', 'policy_rate_max_step']) delete e.params[k];
    const text = JSON.stringify({ format: SAVE_FORMAT, schemaVersion: 6, state: { ...old, schemaVersion: 6 } });
    const upgraded = deserializeGame(text, content);
    expect(upgraded.events).toEqual(createEventsState(content.events));
    expect(econ(upgraded).priceControls).toBe(false);
    expect(econ(upgraded).repressedInflation).toBe(0);
    expect(econ(upgraded).params.policy_rate_max_step).toBe(econ(modern).params.policy_rate_max_step);
    expect(() => advanceTurn(upgraded)).not.toThrow();
  });
});
