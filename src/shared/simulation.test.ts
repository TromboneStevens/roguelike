import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ENEMY_FIRE_INTERVAL,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  TILE_SIZE,
} from "./constants.js";
import {
  createInitialState,
  DEFAULT_PLAYER_ID,
  step,
} from "./simulation.js";
import type { GameState, InputState, InputsById } from "./types.js";

function input(partial: Partial<InputState> = {}): InputState {
  return { left: false, right: false, jump: false, fire: false, tick: 0, ...partial };
}

function only(i: InputState): InputsById {
  return { [DEFAULT_PLAYER_ID]: i };
}

/** Run a sequence of per-tick inputs through step(), returning the final state. */
function run(state: GameState, sequence: InputsById[]): GameState {
  let s = state;
  for (const ins of sequence) {
    s = step(s, ins);
  }
  return s;
}

test("determinism: same seed + inputs yields deep-equal state across two runs", () => {
  const seq: InputsById[] = [];
  for (let i = 0; i < 200; i++) {
    seq.push(only(input({ right: i % 3 !== 0, jump: i % 30 === 0, tick: i })));
  }

  const a = run(createInitialState(42), seq);
  const b = run(createInitialState(42), seq);
  assert.deepEqual(a, b);
});

test("step() does not mutate the input state (replay safety)", () => {
  const s0 = createInitialState(42);
  const snapshot = structuredClone(s0);
  step(s0, only(input({ right: true })));
  assert.deepEqual(s0, snapshot);
});

test("gravity: an idle player falls and lands on the floor with onGround", () => {
  let s = createInitialState(42);
  const startY = s.players[DEFAULT_PLAYER_ID]!.pos.y;

  // Spawn a little above the floor so the fall is observable.
  s.players[DEFAULT_PLAYER_ID]!.pos.y = startY - 3 * TILE_SIZE;

  // One early tick: still airborne and moving downward.
  s = step(s, only(input()));
  assert.ok(s.players[DEFAULT_PLAYER_ID]!.vel.y > 0, "should be falling");

  // Step enough ticks to land.
  for (let i = 0; i < 120; i++) s = step(s, only(input()));
  const p = s.players[DEFAULT_PLAYER_ID]!;
  assert.ok(p.onGround, "player should be on the ground");
  assert.equal(p.vel.y, 0, "vertical velocity should be zero on landing");

  const floorTopY = (s.map.height - 1) * TILE_SIZE - PLAYER_HEIGHT;
  assert.equal(p.pos.y, floorTopY, "player should rest exactly atop the floor");
});

test("jump: only fires from the ground, no double jump", () => {
  let s = createInitialState(42);
  // Settle onto the ground first.
  for (let i = 0; i < 60; i++) s = step(s, only(input()));
  assert.ok(s.players[DEFAULT_PLAYER_ID]!.onGround);

  const groundY = s.players[DEFAULT_PLAYER_ID]!.pos.y;

  // Jump from the ground: y velocity goes negative (upward) and player leaves ground.
  s = step(s, only(input({ jump: true })));
  const afterJump = s.players[DEFAULT_PLAYER_ID]!;
  assert.ok(afterJump.vel.y < 0, "jump should produce upward velocity");
  assert.ok(!afterJump.onGround, "player should leave the ground");
  assert.ok(afterJump.pos.y < groundY, "player should move upward");

  // Mid-air: pressing jump again must NOT re-launch (no double jump).
  const velBefore = s.players[DEFAULT_PLAYER_ID]!.vel.y;
  s = step(s, only(input({ jump: true })));
  const velAfter = s.players[DEFAULT_PLAYER_ID]!.vel.y;
  // Velocity only increases due to gravity, never jumps back up to the launch value.
  assert.ok(velAfter > velBefore, "mid-air jump should not re-apply upward impulse");
});

test("horizontal collision: moving into a wall stops the player", () => {
  let s = createInitialState(42);
  for (let i = 0; i < 60; i++) s = step(s, only(input())); // land

  const p = s.players[DEFAULT_PLAYER_ID]!;
  // Build a solid wall column just to the right of the player.
  const wallTx = Math.floor((p.pos.x + PLAYER_WIDTH) / TILE_SIZE) + 1;
  for (let ty = 0; ty < s.map.height; ty++) {
    s.map.grid[ty * s.map.width + wallTx] = true;
  }
  const wallLeftEdge = wallTx * TILE_SIZE;

  // Drive right into the wall for many ticks.
  for (let i = 0; i < 120; i++) s = step(s, only(input({ right: true })));

  const after = s.players[DEFAULT_PLAYER_ID]!;
  assert.ok(
    after.pos.x + PLAYER_WIDTH <= wallLeftEdge + 1e-6,
    "player should be stopped at the wall",
  );
  assert.equal(after.vel.x, 0, "horizontal velocity zeroed on wall contact");
});

test("enemy fires: a projectile exists after enough ticks", () => {
  let s = createInitialState(42);
  assert.equal(s.projectiles.length, 0);
  for (let i = 0; i <= ENEMY_FIRE_INTERVAL + 2; i++) s = step(s, only(input()));
  assert.ok(s.projectiles.length >= 1, "enemy should have fired at least one projectile");
});

test("damage: a projectile overlapping the player reduces hp", () => {
  let s = createInitialState(42);
  const p = s.players[DEFAULT_PLAYER_ID]!;
  const hpBefore = p.hp;

  // Place a projectile overlapping the player, aimed to stay overlapping next tick.
  s.projectiles.push({
    id: "proj:test",
    pos: { x: p.pos.x + PLAYER_WIDTH / 2, y: p.pos.y + PLAYER_HEIGHT / 2 },
    vel: { x: 0, y: 0 },
    owner: "enemy:0",
    ttl: 60,
  });

  s = step(s, only(input()));
  assert.equal(s.players[DEFAULT_PLAYER_ID]!.hp, hpBefore - 1, "hp should drop by 1");
  assert.ok(
    !s.projectiles.some((pr) => pr.id === "proj:test"),
    "projectile should be consumed on hit",
  );
});

test("win: a living player overlapping the exit sets status to 'won'", () => {
  let s = createInitialState(42);
  const exit = s.map.exit;
  // Teleport the player onto the exit tile.
  s.players[DEFAULT_PLAYER_ID]!.pos.x = exit.tx * TILE_SIZE;
  s.players[DEFAULT_PLAYER_ID]!.pos.y = exit.ty * TILE_SIZE;

  s = step(s, only(input()));
  assert.equal(s.status, "won");
});

test("lose: when all players die the status becomes 'lost'", () => {
  let s = createInitialState(42);
  const p = s.players[DEFAULT_PLAYER_ID]!;
  // Drop hp to 1 so a single hit is lethal, overlap with a projectile.
  p.hp = 1;
  s.projectiles.push({
    id: "proj:kill",
    pos: { x: p.pos.x + PLAYER_WIDTH / 2, y: p.pos.y + PLAYER_HEIGHT / 2 },
    vel: { x: 0, y: 0 },
    owner: "enemy:0",
    ttl: 60,
  });

  s = step(s, only(input()));
  assert.equal(s.players[DEFAULT_PLAYER_ID]!.alive, false);
  assert.equal(s.status, "lost");
});

test("frozen after resolution: stepping a decided match is idempotent in status", () => {
  let s = createInitialState(42);
  const exit = s.map.exit;
  s.players[DEFAULT_PLAYER_ID]!.pos.x = exit.tx * TILE_SIZE;
  s.players[DEFAULT_PLAYER_ID]!.pos.y = exit.ty * TILE_SIZE;
  s = step(s, only(input()));
  assert.equal(s.status, "won");
  s = step(s, only(input({ left: true })));
  assert.equal(s.status, "won");
});
