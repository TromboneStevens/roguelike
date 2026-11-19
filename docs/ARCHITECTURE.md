# ARCHITECTURE

This document describes how the game is structured so that a single-player browser
slice (phase 1) grows into authoritative-server online co-op (phase 2) without a
rewrite. The central idea: one deterministic simulation core shared by client and
server.

## Three-layer source split

```
src/
  shared/   deterministic, engine-agnostic simulation core (NO DOM, NO Node APIs)
  client/   browser: Canvas rendering, input capture, prediction, interpolation
  server/   Node: static file server, ws transport, authoritative sim loop, rooms
```

- **`src/shared`** holds the entire game simulation plus its types, constants, seeded
  RNG, and math helpers. It must not import anything browser-specific (`document`,
  `window`) or Node-specific (`fs`, `http`). This is the hard rule that lets the exact
  same code run on both ends and stay deterministic.
- **`src/client`** imports `shared`, renders simulation state to a 2D canvas, captures
  input, and (phase 2) predicts locally while reconciling against the server.
- **`src/server`** imports `shared`, runs the authoritative fixed-timestep loop,
  serves the built client, and relays state/inputs over WebSockets.

Both the client and server bundles are produced by esbuild (`scripts/build.mjs`); the
whole tree is type-checked together by `tsc --noEmit` so shared code stays compatible
with both consumers.

## Fixed-timestep simulation model

The simulation advances in fixed discrete ticks (`TICK_RATE = 60` Hz, see
`src/shared/constants.ts`). The core is a pure step function:

```
step(state: GameState, inputs: PlayerInputs, dt = TICK_DT) -> GameState
```

- `dt` is constant. Rendering may interpolate between ticks for smoothness, but the
  simulation never uses a variable delta. This keeps physics and collisions identical
  everywhere.
- Each tick: apply inputs, integrate movement/gravity, resolve tile collisions, update
  enemies and their bullet patterns, spawn/expire projectiles, test hits, evaluate
  win/lose.
- The render loop runs on `requestAnimationFrame` and accumulates real time, stepping
  the sim zero or more times per frame to stay in sync (fixed-step accumulator).

## Entity model

A lightweight struct-of-fields model, not a heavyweight ECS. Entities are plain data
records (player, enemy, projectile) stored in typed arrays/lists on `GameState`.
Systems are plain functions over that state (movement, enemy AI, collision, etc.).
This keeps the state trivially serializable, snapshot-able, and cheap to copy — which
matters for prediction/reconciliation and for deterministic tests.

## Determinism requirement (seeded RNG)

All nondeterminism goes through a single seeded PRNG (`src/shared/rng.ts`, mulberry32).

- Level generation, enemy spawn choices, and bullet-pattern jitter all draw from the
  seeded RNG. `Math.random()` is banned in the simulation core.
- A run is identified by its seed; the same seed + same inputs reproduce the same
  states tick for tick. This is what makes co-op netcode and headless tests possible.
- Avoid platform-divergent math where it would affect state. Stick to plain IEEE-754
  `number` operations used identically on both ends.

## Netcode design (phase 2 — documented now so the core is built for it)

The core is authoritative-server + client-prediction from day one in spirit; phase 2
wires it up. Transport is JSON (later binary) over `ws`.

1. **Authoritative server loop.** The server owns the true `GameState` and steps it at
   the fixed timestep. Clients send input commands; the server never trusts client
   state, only client inputs.
2. **Client-side prediction.** The client immediately applies the local player's input
   to its own copy of the sim (same `step` function) so controls feel instant instead
   of waiting a round trip.
3. **Server reconciliation.** The server periodically sends an authoritative snapshot
   (or delta) tagged with the last input sequence it processed. The client rewinds to
   that snapshot and re-applies any inputs the server had not yet acknowledged,
   correcting prediction error without visible rubber-banding in the common case.
4. **Remote-player interpolation.** Other players are rendered slightly in the past
   (interpolation buffer) between received snapshots so their motion is smooth despite
   discrete, jittery network updates.
5. **Rooms / lobby.** The server groups players into rooms keyed by a shareable code.
   A room has one simulation seed and one authoritative loop; joining mid-run syncs
   from a snapshot.

Because client and server step the identical deterministic `shared` core, prediction
and the authoritative result converge whenever they see the same inputs — which is the
whole reason for the shared-core design.

## Build & runtime shape

- `scripts/build.mjs` bundles `src/client/main.ts -> dist/client/bundle.js` (browser,
  ESM) and `src/server/index.ts -> dist/server/index.js` (node, ESM, `ws` external),
  and copies `public/*` into `dist/client`.
- `npm start` runs `dist/server/index.js`, which serves `dist/client` over HTTP on
  `:8080` and hosts the WebSocket endpoint on the same server.
