# CLAUDE.md — standing instructions for this project

Read this first in every session. The full design is in `docs/GDD.md`; this file is the working rulebook.

## The project

A deep, calculation-driven Cold War grand strategy simulator. Alpha scenario: the United States from Q1 1949 to Q4 2000, one quarter per turn (208 turns). It runs entirely in the browser and is published with GitHub Pages.

- **Live site:** https://notgoodatgames66.github.io/cold-war-strat-game/
- **Repository:** https://github.com/Notgoodatgames66/cold-war-strat-game (public; Pages source is GitHub Actions)

## Who does what

- **Ryan is the creative director and tester.** He makes the design calls, plays each build and reports what feels wrong. He is new to coding.
- **Claude writes the code, data files and tests.**
- Explain changes in plain language. Say what changed in the game, not only in the code.
- When a design question is genuinely Ryan's to decide, ask. Otherwise follow the GDD and say which reading you took.
- Push back when an idea would hurt the game, and say why.

## Architecture rules (do not break these)

1. **The simulation is pure and deterministic.** `src/sim/` never uses `Math.random()`, `Date`, `performance.now()` or anything else outside its inputs. `tests/purity.test.ts` enforces this.
2. **All randomness comes from `createRng(seed, turn, stream)`** in `src/sim/rng.ts`. Each system uses its own named stream via `ctx.rng('name')`, so adding a dice roll in one system never shifts another's.
3. **`advanceTurn()` never mutates the state it receives.** It returns a new state.
4. **Content lives in `data/`, not code.** Nations, stats, scenarios, and later events, technologies and modifiers are JSON or YAML files. New files in `data/nations/` and `data/scenarios/` are picked up automatically.
5. **Every figure in a data file has a `provenance` (`measured` or `estimate`) and a `note` saying where it came from.** Nation files stay `"verification": "unchecked"` until Ryan has checked them against sources.
6. **One universal nation schema.** Every nation uses the same structure at a different resolution. Never special-case a nation in engine code; express differences in data.
7. **Systems declare their frequency** (`quarterly` or `yearly`) and are registered in order in `src/sim/systems/index.ts`.
8. **Save files are versioned.** If the shape of `GameState` changes, bump `SCHEMA_VERSION` in `src/sim/schema.ts` and add a migration in `src/sim/save.ts` so old saves still load.
9. **The interface never computes game rules.** `src/ui/` and `src/App.tsx` display state and send orders; turn resolution runs in the web worker (`src/sim/worker.ts`).
10. **Every formula gets a test.** Tests live in `tests/`.

## Working rules

- Keep the game playable at the end of every session.
- Smallest working version first, then deepen.
- Run `npm test` and `npm run build` before every commit. Both must pass.
- Commit after each working change with a clear message.
- Check the page in a browser after interface changes.

## Commands

| Command | What it does |
| --- | --- |
| `npm install` | Install dependencies (first time only) |
| `npm run dev` | Run the game locally with live reload |
| `npm test` | Run all automated tests |
| `npm run build` | Type-check and build the production site into `dist/` |
| `npm run preview` | Serve the production build locally |

## Layout

```
data/            stats.json (stat registry), nations/, scenarios/, economy/ (models, levers, sectors, industry tables, plans), map/ (world geometry, 1949 blocs and crises), pops/, politics/, events/ (meters and events)
src/sim/         the engine: rng, time, schema, content, world, turn, orders, save, worker, systems/, economy/, pops/, politics/, events/
src/ui/          interface components and helpers (world map, situation screen, super-events, event dialogs and record, charts, Treasury desk with bills, Industry, Politics and Population screens, balance of power)
src/App.tsx      the main screen
tests/           automated tests
docs/GDD.md      the game design document
docs/models/     plain-English papers explaining each model (economy, industry, planned, pops, politics, events)
tools/           data generators (usa_1950_pops.py, ussr_1950_pops.py and usa_1949_politics.py build data/pops/ and data/politics/ from readable tables)
.github/workflows/deploy.yml   tests, builds and publishes to GitHub Pages on every push to main
```

## Status

- **Phase 1 (Foundations): complete.** Seeded RNG, quarterly turn loop to Q4 2000, staggered system scheduler, universal nation schema, USA and USSR 1949 data, save/load/export/import, autosave, web worker, state checksums, GitHub Pages deployment.
- **Phase 2A (Macroeconomy): complete.** Keynesian model for the USA (C, I, inventories, G, trade, potential, Okun, Phillips, Treasury peg, federal budget, debt, gold), calibrated to 1949 from data files; budget and tax orders with phase-in and optional indexation; Economy tab with charts, accounts and the Treasury desk; save schema 2 with a migration from schema 1. Model paper: `docs/models/economy.md`.
- **Phase 2B (Industry): complete.** Seven sectors with a 1949 input–output table (`data/economy/industry/usa-1949.json`), competitive imports, government's own workforce split out, sector capacity from sector capital, rationing with priorities and emergency imports, investment flowing to hot sectors, Cobb–Douglas potential, industrial production index and steel tonnage; Industry tab; save schema 3. Model paper: `docs/models/industry.md`.
- **Phase 2C (Soviet economy): complete. Phase 2 gate passed (1949–55 is playable).** A planned engine for the USSR on the same seven-industry model (`src/sim/economy/planned.ts`): a taut plan sets output, Five-Year Plan keyframes (`data/economy/plans/`) split it between investment, defence, civil government and exports, households get the rest; shortages and a savings overhang instead of inflation; productivity growth that fades; investment steered by plan priorities and bottlenecks; an arms-race reaction to US defence spending; Soviet output valued at US prices. Balance-of-power charts on the Situation tab (true Soviet figures, labelled as a developer view). Save schema 4 with a migration that replays the Soviet economy through an old save's history. Model paper: `docs/models/planned.md`.
- **Interface redesign ("Night Desk"): complete** (4 Oct 2026). One fixed dark look inspired by TNO, Pax Historia and Ryan's study-sheet maps; a map-first Situation screen (`src/ui/WorldMap.tsx`, data in `data/map/`); a full-screen super-event frame used for the scenario opening; fonts bundled with the game. The look is described in `docs/GDD.md` under Visuals.
- **Phase 3 (Alpha systems): in progress.**
  - **Pops, step 1 (US): done** (4 Oct 2026). 27,000 US pops over 48 states and DC × race × sex × household class × religion × age × city/suburb/country, fitted to 1950 census tables by iterative proportional fitting (`src/sim/pops/build.ts`, data `data/pops/usa-1950.json`, generated from the readable state table in `tools/usa_1950_pops.py`). Quarterly births, deaths and ageing with a single-year age profile so the baby boom moves as a wave; fertility from the Easterlin effect, relative cohort size and women's work. Yearly class changes driven by the jobs each sector offers (farm exodus), retirement, suburbanisation, migration between states (Jim Crow as an explicit barrier), immigration. Pops set the labour force (replacing the placeholder growth rate) and the household spending mix by Engel's law. Save schema 5. Population tab with age pyramid, state map, breakdowns, trends and a state table. Model paper: `docs/models/pops.md`.
  - **Soviet pops: done** (4 Oct 2026). About 12,000 pops over the 15 republics × nationality × sex × social group (kolkhozniki, workers, office staff, specialists, officials, Gulag prisoners, pensioners) × religion × age × city/countryside (`data/pops/ussr-1950.json` from `tools/ussr_1950_pops.py`): the war's missing men and birth holes, kolkhozniki unable to move between republics, prisoners freed only by policy. The Soviet labour force and spending mix now come from its pops.
  - **Politics: done** (5 Oct 2026). Opinion of the President per pop (party leaning, economy, cost of governing, honeymoon, policy), calibrated to Truman's 69%; who may vote under the 1949 franchise (Jim Crow, age 21). Thirteen interest groups with members from the pops, clout from wealth, numbers and organisation, lock-in and approval. Political capital. The 81st Congress by faction (Southern and Northern Democrats, Taft and internationalist Republicans): every Treasury change is a bill with odds, the player can spend capital, and the roll happens at turn end. Elections: Congress every two years from 1950, the President every four from 1952 through the Electoral College, reapportionment after each census, historical nominees. Politics tab, bill strips on the Treasury desk, a full-screen announcement for presidential elections. Save schema 6. Model paper: `docs/models/politics.md`.
  - **Events engine: done** (6 Oct 2026). Hand-written events in `data/events/` with fire windows, triggers, odds that respond to the world (each event rolls on its own seeded stream), tier caps per quarter, pool events with cooldowns, options with requirements and a historical default taken when the player does not answer, AI choice by weight, and consequences queued for later quarters. Effects: flags, pressure meters (Red Scare, war weariness), modifiers with curves (approval, interest groups, bill odds, consumption, investment, exports, inflation), emergency budget changes, stats, the Fed's regime and price controls. Twenty-two events for 1949–53: NATO, the Soviet bomb, China, the H-bomb, Hiss, McCarthy, NSC-68, the Korean War chain (invasion, Chinese entry, rearmament budget, MacArthur, armistice), the price freeze and its end, the Treasury–Fed Accord, the Rosenbergs, strike waves. The economy gains an independent Fed (gradual rate moves, long yields with a term premium) and price controls that hold back inflation and release it later. Decision cards and full-screen crises open at the start of a turn; the wire shows this quarter's events and the meters; the record lists every event. Sandbox games switch events off. Save schema 7. Model paper: `docs/models/events.md`.
  - **Next:** military units (divisions, the draft, casualties feeding war weariness), or opinion effects by pop attribute so events can drive realignment and civil rights.
- **Phase 3 remaining:** military units, intelligence fog, the commodity market, regional industry (fixes the pops' migration bias that keeps the Northeast too big and the Sun Belt too small, which flows into reapportionment). Pops should also bring structural change (Engel's law in household spending, farm-to-factory migration), which fixes the known gap that industry and steel grow too slowly in the USSR and never lose ground to services in the USA (see "Known gaps" in `docs/models/planned.md`).

## Design decisions made by Ryan

- **Budget indexation is off by default** (decided 30 Sep 2026). Budgets stay fixed in dollars, so a hands-off player meets fiscal drag; the Treasury desk switch turns indexation on. Since Congress arrived (5 Oct 2026) the switch is a bill like any other, and a hard one to pass in 1949.
- **Price controls and ending the Fed peg wait for Phase 3** (decided 30 Sep 2026). They arrive as political decisions with costs (political capital, Congress, interest groups), not as free Treasury-desk switches.
- **Phase 2C scope** (decided 30 Sep 2026):
  - The USSR runs a **simple planned economy**: output set by capacity, the Plan splits it between investment, defence, civil government and exports, households get the residual, full employment, shortages and a savings overhang instead of open inflation.
  - The Soviets **follow the historical Five-Year Plans by default but react to US defence spending** (a basic arms race) until the rival AI arrives.
  - The player sees **true Soviet figures**, labelled as a developer view, until intelligence and fog arrive in Phase 3.
  - Phase 2 stays a **pure economic sandbox**; events arrive in Phase 3.
- **Politics scope** (decided 5 Oct 2026):
  - **Congress gates policy with bills that have odds.** Every Treasury change is a bill; the player sees the odds, can spend political capital, and the vote is rolled at turn end. Budget indexation is a bill too.
  - **Simple elections now:** Congress and the presidency on the historical calendar, with historical nominees; primaries and campaigns come later.
  - **Thirteen interest groups:** the GDD's eight plus intellectuals, isolationists, small business, veterans and a fringe radical left (the Old Left in 1949, later the New Left, SDS and the Black Panthers).
- **Interface look** (decided 4 Oct 2026):
  - **Night Desk** is the look: dark navy, phosphor-cyan actions, Gloock / Source Serif 4 / IBM Plex Mono, map first. Ryan approved the mockups as they were.
  - The look **stays fixed** for the whole game; it does not change with the era.
  - The big moments get **full-screen super-events**, TNO-style, once the events engine exists.

## Open design questions for Ryan

- None outstanding.

## Open data tasks

- Check the event texts, dates, quotes and effect sizes in `data/events/usa-1949-1953.json` and the meters in `data/events/meters.json`.

- Ryan to verify the 1949 starting figures in `data/nations/usa.json` and `ussr.json` against the listed sources, then set `"verification": "checked"`.
- Check the 1949 bloc assignments and crisis dates in `data/map/world-1949.json`, then set `"verification": "checked"`. Latin America and the European colonies are shown unaligned for now; decide whether Rio Treaty states should be US-aligned.
- Check the Soviet 1950 estimates in `tools/ussr_1950_pops.py` (republic populations, nationality and urban shares, prisoners).
- Check the 1950 census figures in `tools/usa_1950_pops.py` (state population, race, urban, farm and religion shares), rerun it, then set `"verification": "checked"` in `data/pops/usa-1950.json`.
- Replace the estimated input–output table with an aggregation of the 1947 BEA benchmark table to the seven sectors.
- Check the politics figures in `tools/usa_1949_politics.py` (81st Congress faction splits, Black registration by state, group memberships, nominee appeal), rerun it, then set `"verification": "checked"` in `data/politics/usa-1949.json`.
