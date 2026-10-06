# Events: the engine and the first events

*Plain-English notes on how the game's events work. Code: `src/sim/events/` (conditions, modifiers, effects, engine, validation) and `src/sim/systems/events.ts`. Data: every file in `data/events/`. Interface: `src/ui/EventDialog.tsx`, `src/ui/EventRecord.tsx` and the wire on the Situation screen.*

## The idea in one paragraph

An event is a hand-written moment, such as the Soviet bomb, Korea or a strike wave, with conditions that make it possible, odds that respond to the world, and effects. Historical anchors can only happen inside a window of quarters and roll their odds each quarter, so history is the likeliest path but never a script: the Soviet bomb usually comes in late 1949, but sometimes a few months later; Korea usually comes in mid-1950, sometimes a year late, and in a few games not at all. When an event offers a choice, the player decides; if the player does not answer, the event takes what actually happened. Events change the world through flags, pressure meters, modifiers, budgets, the Fed's freedom and price controls, and they can set later events in motion.

## When things happen

Each turn resolves in this order: the player's bills go to Congress; the player's answers to last quarter's events take effect; population, economy and politics run; and last of all the events engine looks ahead to the quarter about to begin.

1. **Meters fade and drift.** Each pressure meter loses a share of its level, then rises while its conditions hold (the Red Scare grows while McCarthy goes unchecked).
2. **Spent modifiers are dropped.**
3. **Consequences fall due.** Events queued by earlier events (Korea queues the Chinese intervention two quarters later) fire if their triggers still hold. A consequence ignores the odds; if the war has ended in the meantime, it does not fire.
4. **Everything else rolls.** Every eligible event (inside its window, triggers met, not yet fired, or off cooldown if it recurs) rolls its chance on its own seeded stream, `events:<event id>`. Adding an event never shifts another's dice.
5. **Tier caps.** At most 1 super-event, 2 decisions, 2 cables and 3 wire stories fire in a quarter. If more succeed, the most decisive rolls win.

A fired event applies its immediate effects at once. If it has options, it appears in the next briefing. The answer is sent with that turn's orders and takes effect when the turn resolves, so the player can change their mind until then.

## Writing an event

```json
{
  "id": "korean_war",
  "tier": "super",
  "nation": "usa",
  "window": { "from": "1950-Q2", "to": "1951-Q4" },
  "triggers": [{ "notFlag": "korea_war" }],
  "chance": { "base": 0.45, "modifiers": [{ "if": [{ "flag": "nsc68_adopted" }], "multiply": 0.6 }] },
  "kicker": "Seoul · June 1950",
  "headline": "War in Korea",
  "paragraphs": ["…"],
  "quote": { "text": "…", "source": "…" },
  "effects": [{ "flag": "korea_invasion" }, { "meter": "red_scare", "add": 8 }],
  "options": [
    { "id": "intervene", "label": "…", "description": "…", "default": true, "effects": ["…"] }
  ],
  "provenance": "measured",
  "note": "…"
}
```

- **Tiers.** `super` fills the screen; `major` is a decision card; `minor` is a cable; `news` is a wire story.
- **Chance** is per eligible quarter: the base times every modifier whose conditions hold, at most 1. An event with a base of 0 fires only when another event queues it.
- **Pool events** (`"repeatable": true`, with a `cooldown` in quarters) can recur. Strike waves and McCarthy's accusations are pool events.
- **Options.** Exactly one is the `default`, the historical choice. `requires` hides an option until its conditions hold: the player cannot seize the steel mills in peacetime. `aiWeight` is how often an AI nation picks it.
- Every event has a `provenance` and a `note`, like every figure in the game.

### Conditions

| Condition | Holds when |
| --- | --- |
| `{ "after": "1950-Q2" }`, `{ "before": … }` | The quarter is on or after (before) the date |
| `{ "flag": "x" }`, `{ "notFlag": "x" }` | A world flag is (not) set |
| `{ "fired": "id" }`, `{ "notFired": "id" }` | An event has (not) happened |
| `{ "chose": "id", "option": "o" }` | That option was taken |
| `{ "quartersSince": "id", "atLeast": 6, "atMost": 8 }` | Quarters since the event last fired |
| `{ "stat": "inflation", "above": 6 }` | A stat of the event's nation (or `"nation": "ussr"`) |
| `{ "meter": "red_scare", "above": 30 }` | A meter's level |
| `{ "leaderParty": "republican" }` | Who holds the presidency |
| `{ "monetaryRegime": "treasury_peg" }`, `{ "priceControls": true }` | The state of the economy |
| `{ "all": […] }`, `{ "any": […] }`, `{ "not": … }` | Combinations |

### Effects

| Effect | What it does |
| --- | --- |
| `{ "flag": "x" }`, `{ "clearFlag": "x" }` | Sets or clears a world flag |
| `{ "meter": "red_scare", "add": 12 }` | Moves a meter |
| `{ "modifier": { "target", "value", "duration", "curve" } }` | A modifier (below) |
| `{ "capital": -5 }` | Political capital |
| `{ "budget": "defence", "multiply": 1.7 }` | An emergency budget change that bypasses Congress, as war supplementals did |
| `{ "stat": "nuclear_warheads", "nation": "ussr", "add": 1 }` | Changes a stat no system calculates yet |
| `{ "monetaryRegime": "independent" }` | Ends the Treasury peg |
| `{ "priceControls": true }` | Imposes or lifts a general price freeze |
| `{ "queue": "chinese_intervention", "delay": 2 }` | Sets a later event in motion |

### Modifiers

Every buff and debuff has a source, a target, a value, a duration and a curve, as the GDD asks. **Flat** modifiers hold for their duration (or for ever). **Decay** modifiers start full and fall in a straight line to nothing. **Ramp** modifiers build up over their duration and then stay.

| Target | Unit | Used by |
| --- | --- | --- |
| `approval` | log-odds of every pop's approval of the President | Opinion |
| `group:<id>` | log-odds of an interest group's approval | Interest groups |
| `bill:<lever>` | log-odds of every faction voting for a bill on that lever | Congress |
| `consumption`, `investment`, `exports` | share added to desired spending (0.05 = +5%) | Economy |
| `inflation` | points added to inflation | Economy |

0.1 log-odds is about two points of approval when approval is between 50% and 70%. The decision cards translate every effect into points at the current level.

### Meters

Meters are pressure gauges from 0 to 100. They fade by a share each quarter, drift while conditions hold, and act every quarter as a level × a per-point effect on any modifier target.

| Meter | Fades | Rises | Each point |
| --- | --- | --- | --- |
| Red Scare (starts at 12) | 6% a quarter | 2 a quarter while McCarthy is unchecked (1 once confronted) | −0.003 approval, −0.008 intellectuals, −0.012 radical left, +0.01 for defence bills |
| War weariness (starts at 0) | 10% a quarter | 4 a quarter while American troops fight in Korea (settles near 40) | −0.008 approval, −0.008 isolationists, −0.004 veterans |

## The first events, 1949–53

| Event | Tier | When | The choice (historical default first) |
| --- | --- | --- | --- |
| The Blockade Is Lifted | Wire | 1949 Q2–Q3 | — |
| A Peacetime Alliance (NATO) | Decision | 1949 Q2–Q4 | Sign and fight for ratification · a looser declaration |
| The Russians Have the Bomb | Crisis | 1949 Q3–1951 Q2 | Tell the nation · announce and review strategy (queues NSC-68) · keep it quiet (it may leak) |
| TASS Confirms Soviet Atomic Weapon | Cable | after a secret | — (the cost of keeping quiet) |
| The People's Republic of China | Decision | 1949 Q3–1950 Q2 | Let the dust settle · pledge to defend Formosa · open a channel to Peking |
| The Super (H-bomb) | Decision | after the Soviet bomb | Crash programme · international control first · defer (both return) |
| Hiss Guilty of Perjury | Wire | 1950 Q1 | — |
| A Senator With a List (McCarthy) | Decision | 1950–51, once the Red Scare is above 15 | Dismiss him · take him on in the Senate · outflank him with a loyalty drive |
| McCarthy Names Another 'Security Risk' | Cable (pool) | while McCarthy is unchecked | — |
| NSC-68 | Decision | 1950 Q1–1951 Q2 | Note it and hold the budget line · adopt it and rearm now (Korea becomes less likely) |
| War in Korea | Crisis | 1950 Q2–1951 Q4 | Commit forces under the UN flag · air and naval support only · stay out |
| South Korea Is Collapsing | Decision | after "air and naval only" | Commit ground troops after all · accept the loss |
| Atom Spy Ring: Rosenberg Arrested | Wire | 1950 Q3 | — |
| An Entirely New War (China enters) | Crisis | two quarters into the war | Fight a limited war · widen the war into China · seek a ceasefire |
| Congress Votes the Rearmament Budget | Wire | three quarters later | — (the second half of the build-up) |
| The General and the President (MacArthur) | Decision | after a limited war | Relieve him · keep him and keep him quiet |
| Freeze Prices? | Decision | 1950 Q3–1953 Q2, in war or high inflation | Impose a general freeze · rely on taxes and credit (returns) |
| The Fed Wants Its Freedom (the Accord) | Decision | from 1950 Q4, under the peg | Accept an accord · hold the peg (returns) |
| An Armistice in Korea | Decision | 1951 Q3–1956, likelier from 1953, under a Republican, or when war-weary | Sign · hold out for better terms (returns) |
| Lift the Controls? | Decision | six quarters into a freeze | Lift them · keep them (returns) |
| Have You No Sense of Decency? (censure) | Decision | 1953–57 | Back the censure motion · stay out (returns) |
| Strike Wave | Cable (pool) | any time; likelier with high inflation and tight labour | Let bargaining run · invoke Taft–Hartley · seize the plants (wartime only) |

Korea is split into steps because the build-up was. Intervening raises the defence budget by 70% at once (FY1950 $13bn to about $22bn). China's entry raises it by half again, and the rearmament budget three quarters later by another 30%, to about $43bn (FY1952: $46bn). The armistice cuts it by a quarter.

## Two policy tools the events bring

Both were decided by Ryan on 30 September 2026 to arrive as political decisions with costs rather than free switches. The costs are political capital and interest-group anger. Neither goes to a congressional vote, because both rested on existing law: the Defense Production Act of 1950 for controls, and the Fed's own authority for the Accord.

**The Accord.** The economy gains a second monetary regime, `independent`. Under it the Fed's desired rate is no longer capped at 1.25%, and long-term yields follow the bill rate plus a term premium of 1 point, closing a tenth of the gap each quarter. The Fed also moves gradually: at most half a point a quarter (`policy_rate_max_step`). That limit never bound before, because the peg capped every rise.

**Price controls.** While a freeze lasts, only 35% of price rises above the gold anchor show in prices (`price_control_passthrough`). That covers rises from demand pressure (output gap, bottlenecks, shortages) and from expected inflation, since wages are frozen too. The held-back demand pressure is stored as a share of the price level. 5% of the stock leaks out each quarter while controls last (grey markets, exemptions), and a quarter of what is left comes out each quarter after they end. The Economy tab shows the freeze and the stock; the inflation breakdown shows "Price controls" and "Held-back prices coming out".

## How it compares with history (hands-off play, eight seeds)

| | Model | History |
| --- | --- | --- |
| Soviet bomb | 1949 Q3 to 1950 Q2 | August 1949 |
| Korea | 7 seeds of 8: 1950 Q2 to 1951 Q2 | June 1950 |
| The Accord | 1951 Q1 to 1952 Q2 (1953 without a war) | March 1951 |
| Price freeze | 1951 Q1 to 1951 Q4 | January 1951 |
| Armistice | 1951 Q4 to 1953 Q3 | July 1953 |
| Inflation 1951 / 1952 (Q4, year on year) | 1–8% / 4–5% | 6% / 1% |
| Unemployment 1952 | 2.5% | 3.0% |
| Defence outlays, end of 1952 | $33–42bn | about $46bn (FY1953 $52bn) |
| Truman's approval, end of 1951 / 1952 | 38–60% / 34–49% | 23% / 32% |

Before the events engine, a Korea-scale build-up gave about 11% inflation in 1952 (see `industry.md`). The freeze and the Accord now bring it to 4–5%.

## What the player sees

- **Decisions open by themselves** at the start of the turn, crises first. Each option shows what it means in a sentence and what it will do in plain words ("Approval −9 pts, fading over 8 quarters"); the historical choice is marked "What happened". "Decide later" closes the card. Unanswered events take the historical course, and the status line says so.
- **The wire** lists this quarter's events (click to reopen), marks those awaiting a decision, and shows the pressure meters.
- **The record**, at the foot of the Situation screen, lists every event so far with the choice made.
- The **dock** shows how many events await a decision.

## What the tests check

`tests/events.test.ts` checks, among other things, that:

- every event file loads, and broken files (unknown events, meters, groups, levers, bad dates, two defaults…) are rejected with clear messages;
- conditions, windows and modifier curves behave as described, and meters fade and drift;
- the same seed gives the same events, and hands-off 1949–53 follows the likeliest path (the bomb, China and Korea fire in most seeds, nothing fires outside its window);
- unanswered events take their default, chosen options take effect, and options with requirements are only offered when they hold;
- Korea's choices change the budget, flags, meters and approval; queued consequences fire on time, and not when their triggers have lapsed;
- approval, group, bill and demand modifiers act; the Accord lets rates rise past the old ceiling gradually; controls hold inflation down and release it later;
- saves with pending events reload identically, and schema 6 saves upgrade.

Economic tests that need a quiet world use sandbox games, which switch events off (`events.enabled = false`).

## Known gaps

- **The economy still overheats in Korea.** Output sits at the 6% capacity ceiling through 1951–52, so inflation stays at 4–5% under controls (history: 1–2%), and lifting controls while the war goes on releases a burst of inflation. Investment and productivity caught up with demand faster in reality.
- **Truman sometimes runs again in 1952.** His approval in the model stays near 40%, against 23–32% in reality, so he clears the retirement threshold in some seeds and occasionally wins. Approval falls too little in the Korean stalemate.
- **Only the United States has events.** Soviet events (Stalin's death, the succession) wait for Soviet politics; AI choice by weight is already in the engine.
- **No military model yet.** Korea moves budgets, personnel and opinion, not divisions; casualties stand in as war weariness. Warheads move only through events.
- **Opinion modifiers are national or by interest group.** Effects by pop attribute (the civil rights events will need them: Southern whites, Black voters) and changes to party leaning (realignment) are the next extension.
- **The texts are first drafts.** Ryan to check the history, dates and quotes in `data/events/usa-1949-1953.json`.
