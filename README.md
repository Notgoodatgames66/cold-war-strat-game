# Cold War Grand Strategy

A deep, calculation-driven grand strategy simulator of the Cold War. Guide the United States from January 1949 to December 2000, one quarter at a time, with economic and military power at the core and domestic politics pulling at every decision.

**Play it:** https://notgoodatgames66.github.io/cold-war-strat-game/

## Status

Phase 2A is complete: a live, 1949-calibrated Keynesian economy for the United States with a federal budget, five taxes, the Treasury peg, gold under Bretton Woods, and charts of the record. Industry, the Soviet economy, politics and events arrive in the phases that follow. The economics are explained in [`docs/models/economy.md`](docs/models/economy.md). See [`docs/GDD.md`](docs/GDD.md) for the full design and roadmap.

## Run it locally

You need [Node.js](https://nodejs.org/) (LTS version).

```
npm install
npm run dev
```

Then open the address it prints (usually http://localhost:5173).

## Tests

```
npm test
```

## How it is built

- TypeScript, React and Vite. The simulation runs in a web worker so the screen never freezes.
- The engine is deterministic: the same seed and the same choices always produce the same history.
- Game content lives in plain data files under `data/`, so nations and scenarios can be added without touching code.
