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
data/            stats.json (stat registry), nations/, scenarios/, economy/ (models, budget and tax levers)
src/sim/         the engine: rng, time, schema, content, world, turn, orders, save, worker, systems/, economy/
src/ui/          interface components and helpers (tabs, charts, Treasury desk)
src/App.tsx      the main screen
tests/           automated tests
docs/GDD.md      the game design document
docs/models/     plain-English papers explaining each model
.github/workflows/deploy.yml   tests, builds and publishes to GitHub Pages on every push to main
```

## Status

- **Phase 1 (Foundations): complete.** Seeded RNG, quarterly turn loop to Q4 2000, staggered system scheduler, universal nation schema, USA and USSR 1949 data, save/load/export/import, autosave, web worker, state checksums, GitHub Pages deployment.
- **Phase 2A (Macroeconomy): complete.** Keynesian model for the USA (C, I, inventories, G, trade, potential, Okun, Phillips, Treasury peg, federal budget, debt, gold), calibrated to 1949 from data files; budget and tax orders with phase-in and optional indexation; Economy tab with charts, accounts and the Treasury desk; save schema 2 with a migration from schema 1. Model paper: `docs/models/economy.md`.
- **Next: Phase 2B (Industry).** Seven sectors and input–output production chains, with a private capital stock feeding capacity. Then 2C: a simpler Soviet economy and the Phase 2 gate (1949–55 playable).

## Open design questions for Ryan

- Should budget indexation be on or off by default? Currently off: budgets stay fixed in dollars, which produces slow fiscal-drag stagnation for hands-off players.

## Open data tasks

- Ryan to verify the 1949 starting figures in `data/nations/usa.json` and `ussr.json` against the listed sources, then set `"verification": "checked"`.
