# Cold War Grand Strategy

A deep, calculation-driven grand strategy simulator of the Cold War. Guide the United States from January 1949 to December 2000, one quarter at a time, with economic and military power at the core and domestic politics pulling at every decision.

**Play it:** https://notgoodatgames66.github.io/cold-war-strat-game/

## Status

Phase 1 of 5 (Foundations) is complete: the engine skeleton, seeded random numbers, the quarterly turn loop, save/load, and the USA and USSR loaded with 1949 figures. The economy, politics and events arrive in the phases that follow. See [`docs/GDD.md`](docs/GDD.md) for the full design and roadmap.

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
