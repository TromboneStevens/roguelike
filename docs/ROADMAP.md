# ROADMAP

Four phases, each with concrete deliverables. Phase 1 is the current task (the
playable single-player browser slice). Everything is built on the deterministic shared
simulation core (see [`ARCHITECTURE.md`](ARCHITECTURE.md)) so later phases extend
rather than rewrite.

## Phase 1 — Single-player playable browser slice (this task)

Goal: a browser page where one player platforms through a generated level, dodges an
enemy's bullets, and wins or loses.

Deliverables:

- Project scaffold: TypeScript + esbuild toolchain, three-layer `shared/client/server`
  split, `tsconfig`, build script, `.gitignore`, design/architecture/roadmap docs.
  **(FEAT-001)**
- Shared deterministic core: seeded RNG, vector/math helpers, entity types/constants,
  fixed-timestep `step(state, inputs)` with gravity, tile collision, jump mechanics
  (coyote time + jump buffering).
- Procedural level generation from a seed: solvable-shaped platforming layout with a
  spawn point and an exit trigger.
- One bullet-firing enemy with a telegraphed projectile pattern; projectile spawning,
  movement, expiry, and hit detection against the player.
- Win (reach exit) and lose (health to 0) conditions, with restart on a new seed.
- Canvas renderer + input capture + fixed-step game loop in the client.
- Node HTTP server that serves the built client; `ws` endpoint stood up as groundwork.
- Headless determinism smoke test: stepping the sim N ticks from a fixed seed is
  reproducible and the generated level is solvable-shaped.

## Phase 2 — Online co-op

Goal: play the same slice with friends over a shareable link.

Deliverables:

- Authoritative server simulation loop running the shared core at the fixed timestep.
- WebSocket protocol: input commands up, authoritative snapshots/deltas down, with
  input sequence numbers.
- Client-side prediction of the local player using the same `step` function.
- Server reconciliation: snapshot + replay of unacknowledged inputs.
- Remote-player interpolation buffer for smooth remote motion.
- Lobby/room system keyed by a shareable room code; mid-run join via snapshot sync.
- Player-count scaling of enemy patterns and co-op mechanics (e.g. revive).

## Phase 3 — Roguelike run structure

Goal: turn the single level into a full roguelike run.

Deliverables:

- Run structure: multiple rooms and floors chained from the seed, with a run map.
- Items and passives with synergies; a loot/reward flow between rooms.
- Shops, keys/locks, and optional challenge rooms.
- Meta-progression: unlocks that persist across runs (characters, items, starting
  options).
- Expanded enemy roster and room archetypes.

## Phase 4 — Content, balance, and polish

Goal: make it feel like a finished game.

Deliverables:

- More enemy types and bullet patterns; multi-phase bosses as floor capstones.
- Audio: music and SFX, with hooks tied to sim events.
- Visual polish: particles, screen shake, hit feedback, readable telegraphs tuning.
- Balance pass on movement, damage, spawn rates, and difficulty curve.
- Accessibility and options (keybinds, assist toggles), plus performance tuning.
