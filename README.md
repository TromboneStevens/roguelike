# roguelike

An online co-op roguelike platforming bullet hell that runs in the browser.

One to four agile gunners platform through procedurally generated, bullet-filled rooms,
dodging telegraphed enemy fire on the way to the exit. Built on a deterministic,
seeded simulation core shared by client and server so that runs are reproducible and
online co-op (phase 2) drops in without a rewrite.

- Concept and scope: [`DESIGN.md`](DESIGN.md)
- Architecture and netcode: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Phased plan: [`docs/ROADMAP.md`](docs/ROADMAP.md)

## Tech stack

- **Language:** TypeScript (ES2020 modules), strict.
- **Client:** HTML5 Canvas 2D, bundled for the browser with esbuild.
- **Server:** Node + `ws`, serves the client and (phase 2) runs the authoritative sim.
- **Shared core:** engine-agnostic, deterministic, seeded — used by both ends.
- **Build:** esbuild (bundles) + `tsc --noEmit` (type-check). Tests via Node's built-in
  test runner (`node --test`) executing TypeScript through `tsx`.

## Project layout

```
src/shared/   deterministic simulation core (types, constants, seeded RNG, sim)
src/client/   Canvas renderer, input, game loop
src/server/   Node HTTP static server + ws authoritative loop
public/       index.html + static assets
scripts/      build.mjs (esbuild driver)
docs/         ARCHITECTURE.md, ROADMAP.md
dist/         build output (gitignored)
```

## Prerequisites

- Node.js 22+ and npm (developed against Node 22.x, npm 11.x).

## Commands

```bash
npm install        # install dependencies
npm run build      # type-check (tsc --noEmit) then bundle client + server into dist/
npm start          # run the server -> http://localhost:8080
npm test           # type-check then run the shared-core tests with node --test
npm run dev        # rebuild on change (esbuild watch)
```

After `npm run build`, run `npm start` and open
[http://localhost:8080](http://localhost:8080) in a browser to play. The server reads
`PORT` from the environment and defaults to `8080`, so `PORT=8137 npm start` serves on
a different port.

## Run modes (v1)

The Phase 1 slice is **single-player and local by default**. The browser client runs
the deterministic shared simulation in its own fixed-timestep loop, so the game is
fully playable with no server round-trip; `npm start` only needs to serve the static
page. Run and jump across the level (a pit before the exit forces at least one jump),
press `J` or a mouse button to shoot the enemy, and reach the exit to win.

The server also stands up the co-op groundwork: it runs one authoritative room over
the SAME shared simulation and accepts WebSocket connections. A connected client
receives a `joinAck` (its assigned player id + the room seed) and then authoritative
`snapshot` messages it can render, while it streams its `input` up. Opting a client
into this server-authoritative path is available through `src/client/net.ts` but is
not the default for v1; the local mode must keep working on its own.

Full client-side prediction, server reconciliation, and remote-player interpolation
(smooth online co-op) are **Phase 2**. See the [roadmap](docs/ROADMAP.md) and the
netcode notes in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
