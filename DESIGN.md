# DESIGN — Co-op Bullet Hell Roguelike

## Concept

An online co-op roguelike platforming bullet hell that runs in the browser. One to
four players drop into a procedurally generated run, platform through rooms packed
with enemy fire, and push toward the exit. Death ends the run; a fresh seed builds a
fresh run. The game is twitch-reactive moment to moment (dodge, jump, shoot) and
strategic across a run (which rooms, which items, how to survive together).

## Core fantasy

You and your friends are agile gunners threading through walls of bullets. Movement
is the primary skill: precise platforming and dodging matter more than raw damage.
Every run is different, every death is yours to own, and a good run is a shared story.

## Pillars

1. **Readable chaos.** Dense bullet patterns that are always fair and legible. Clear
   telegraphs, consistent hitboxes, a slightly forgiving player hitbox.
2. **Movement is the weapon.** Tight platforming (coyote time, jump buffering,
   variable jump height) so dodging feels expressive and skillful.
3. **Deterministic, seeded runs.** A seed reproduces a run exactly. This makes co-op
   netcode tractable and makes runs shareable and testable.
4. **Co-op that respects everyone.** Shared fate with individual agency. Reviving,
   shared loot decisions, and patterns that scale with player count.
5. **Roguelike depth over time.** Items, synergies, branching floors, and
   meta-progression that reward repeated runs (phase 3+).

## v1 vertical slice (Phase 1 — this task)

The first playable slice is intentionally single-player and small, but built on the
shared deterministic core so co-op drops in during phase 2 without a rewrite.

- One procedurally generated platforming level from a seed. The floor carries an
  authored pit in front of the exit, so reaching the goal requires at least one jump:
  the platforming geometry is load-bearing, not a decorative overlay on a flat walk.
- A player who can run, jump, move precisely, and shoot a projectile in the facing
  direction (gated by a short per-player cooldown) to fight back against the enemy.
- At least one enemy that fires aimed projectiles and can be destroyed by player fire.
- Win condition: reach the level exit.
- Lose condition: the player's health reaches zero (hit by projectiles / hazards).
- Renders and plays in the browser over a fixed-timestep simulation at 60 Hz.
- A Node server that serves the client and stands up the ws transport groundwork.

### Controls (v1)

| Action      | Keys                          |
| ----------- | ----------------------------- |
| Move left   | `A` / `←`                     |
| Move right  | `D` / `→`                     |
| Jump        | `Space` / `W` / `↑`           |
| Shoot       | `J` / mouse (see client input) |

Shooting fires a projectile horizontally in the player's current facing direction,
rate-limited by a per-player cooldown. Player shots damage enemies but never other
players (no friendly fire in v1), keeping co-op safe.

### Win / lose

- **Win:** the player overlaps the exit trigger placed by the level generator.
- **Lose:** player health reaches 0. The run ends and can be restarted with a new seed.

### Running the slice

`npm run build` then `npm start` launches the Node server on
`http://localhost:8080` (override with the `PORT` env var) and serves the built
client. Open that URL in a browser to play.

**Default run mode is single-player, local.** The browser client runs the shared
deterministic simulation in its own fixed-timestep loop, so play needs no server
round-trip. The server additionally runs one authoritative room over the SAME shared
`step()` and accepts WebSocket connections: a client that opts in (via
`src/client/net.ts`) receives a `joinAck` with its player id + the room seed, renders
authoritative `snapshot` broadcasts, and streams its `input` up. This server path is
the co-op foundation, not the default v1 experience, and the local mode works with no
server dependency.

## Where co-op fits

The simulation is a pure function `step(state, inputs) -> state` run at a fixed
timestep. Because it is deterministic and seeded, the same inputs produce the same
state on every machine. The Phase 1 server already runs this shared loop authoritatively
in a room and broadcasts snapshots. Phase 2 builds on that with client-side prediction,
server reconciliation, and remote-player interpolation so online co-op feels smooth. See
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the netcode design and
[`docs/ROADMAP.md`](docs/ROADMAP.md) for the phased plan.
