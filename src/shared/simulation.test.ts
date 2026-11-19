import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ENEMY_FIRE_INTERVAL,
  ENEMY_HEIGHT,
  ENEMY_MAX_HP,
  ENEMY_WIDTH,
  PLAYER_FIRE_COOLDOWN,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  PROJECTILE_SIZE,
  TILE_SIZE,
} from "./constants.js";
import { createPlayer } from "./entities.js";
import { isSolidTile } from "./levelgen.js";
import {
  createInitialState,
  DEFAULT_PLAYER_ID,
  step,
} from "./simulation.js";
import type { GameState, InputState, InputsById, PlayerState } from "./types.js";

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

test("fire: pressing fire spawns a player-owned projectile moving in the facing direction", () => {
  let s = createInitialState(42);
  for (let i = 0; i < 30; i++) s = step(s, only(input())); // settle on the ground
  const before = s.projectiles.length;

  s = step(s, only(input({ fire: true })));
  const mine = s.projectiles.filter((pr) => pr.owner === DEFAULT_PLAYER_ID);
  assert.equal(mine.length, before + 1, "fire should spawn one player-owned projectile");
  const shot = mine[0]!;
  // Player spawns facing right, so the shot travels to the right horizontally.
  assert.ok(shot.vel.x > 0, "player shot should travel in the facing direction (right)");
  assert.equal(shot.vel.y, 0, "player shot travels horizontally");
});

test("fire cooldown: a second immediate fire does not spawn until the cooldown elapses", () => {
  let s = createInitialState(42);
  for (let i = 0; i < 30; i++) s = step(s, only(input()));

  s = step(s, only(input({ fire: true })));
  const afterFirst = s.projectiles.filter((pr) => pr.owner === DEFAULT_PLAYER_ID).length;
  assert.equal(afterFirst, 1, "first fire spawns a projectile");

  // Immediately holding fire again must not spawn a second shot during the cooldown.
  s = step(s, only(input({ fire: true })));
  const duringCooldown = s.projectiles.filter(
    (pr) => pr.owner === DEFAULT_PLAYER_ID,
  ).length;
  assert.equal(duringCooldown, 1, "cooldown blocks a second immediate shot");

  // After the cooldown elapses, a held fire spawns another shot. Compare the set of
  // player-projectile ids so an in-flight shot leaving the array doesn't skew the count.
  const idsBefore = new Set(
    s.projectiles.filter((pr) => pr.owner === DEFAULT_PLAYER_ID).map((pr) => pr.id),
  );
  let sawNew = false;
  for (let i = 0; i < PLAYER_FIRE_COOLDOWN; i++) {
    s = step(s, only(input({ fire: true })));
    if (
      s.projectiles.some(
        (pr) => pr.owner === DEFAULT_PLAYER_ID && !idsBefore.has(pr.id),
      )
    ) {
      sawNew = true;
    }
  }
  assert.ok(sawNew, "firing again after cooldown spawns another player projectile");
});

test("player shot vs enemy: an overlapping player projectile reduces enemy hp and is consumed", () => {
  let s = createInitialState(42);
  const enemy = s.enemies[0]!;
  const hpBefore = enemy.hp;

  // Place a player-owned projectile overlapping the enemy.
  s.projectiles.push({
    id: "proj:ptest",
    pos: { x: enemy.pos.x + ENEMY_WIDTH / 2, y: enemy.pos.y + ENEMY_HEIGHT / 2 },
    vel: { x: 0, y: 0 },
    owner: DEFAULT_PLAYER_ID,
    ttl: 60,
  });

  s = step(s, only(input()));
  assert.equal(s.enemies[0]!.hp, hpBefore - 1, "enemy hp should drop by 1");
  assert.ok(
    !s.projectiles.some((pr) => pr.id === "proj:ptest"),
    "player projectile should be consumed on hit",
  );
});

test("player shot vs enemy: enough hits reduce enemy hp to 0 and remove the enemy", () => {
  let s = createInitialState(42);
  assert.ok(s.enemies.length >= 1);
  const enemy = s.enemies[0]!;

  // Fire ENEMY_MAX_HP overlapping player projectiles across successive ticks.
  for (let i = 0; i < ENEMY_MAX_HP; i++) {
    s.projectiles.push({
      id: `proj:kill${i}`,
      pos: {
        x: enemy.pos.x + ENEMY_WIDTH / 2 - PROJECTILE_SIZE / 2,
        y: enemy.pos.y + ENEMY_HEIGHT / 2 - PROJECTILE_SIZE / 2,
      },
      vel: { x: 0, y: 0 },
      owner: DEFAULT_PLAYER_ID,
      ttl: 60,
    });
    s = step(s, only(input()));
  }

  assert.equal(s.enemies.length, 0, "enemy should be removed when hp reaches 0");
});

test("no friendly fire: a player-owned projectile does not damage players", () => {
  let s = createInitialState(42);
  const p = s.players[DEFAULT_PLAYER_ID]!;
  const hpBefore = p.hp;

  s.projectiles.push({
    id: "proj:friendly",
    pos: { x: p.pos.x + PLAYER_WIDTH / 2, y: p.pos.y + PLAYER_HEIGHT / 2 },
    vel: { x: 0, y: 0 },
    owner: DEFAULT_PLAYER_ID,
    ttl: 60,
  });

  s = step(s, only(input()));
  assert.equal(
    s.players[DEFAULT_PLAYER_ID]!.hp,
    hpBefore,
    "player hp must be unchanged by a player-owned projectile",
  );
});

test("reachability: a scripted floor-walk with a pit jump completes the level to 'won'", () => {
  // Drives step() with a move-right script that jumps only when the floor directly ahead
  // is missing (the authored pre-exit pit). This proves the generated geometry is really
  // completable with a jump, so finding #2's fix can't silently make the level unwinnable.
  // A pure flat walk cannot win (the pit forces the jump), so reaching 'won' exercises
  // both the floor traversal and the jump. Enemies are dropped so a stray bullet can't
  // end the run before it proves geometric reachability.
  let s = createInitialState(42);
  s.enemies = [];
  const maxTicks = 8000;
  let won = false;
  for (let i = 0; i < maxTicks; i++) {
    const player = s.players[DEFAULT_PLAYER_ID]!;
    const aheadTx = Math.floor((player.pos.x + PLAYER_WIDTH + 4) / TILE_SIZE);
    const belowTy = Math.floor((player.pos.y + PLAYER_HEIGHT + 2) / TILE_SIZE);
    const pitAhead = !isSolidTile(s.map, aheadTx, belowTy);
    const jump = player.onGround && pitAhead;
    s = step(s, only(input({ right: true, jump, tick: i })));
    if (s.status === "won") {
      won = true;
      break;
    }
  }
  assert.ok(won, "a right-moving player jumping the pit should reach the exit and win");
});

test("determinism: two players firing on the same tick get id-stable projectiles regardless of players-map key order", () => {
  // Two players firing on the SAME tick both mint player-owned projectile ids from the
  // shared nextEntityId counter. If the per-player fire loop iterated the players map in
  // unsorted key order, two peers whose maps were rebuilt in different key orders would
  // assign proj ids to the opposite players' shots and diverge. Build the same match with
  // the two players inserted in OPPOSITE key order, step both with both firing, and assert
  // the resulting GameStates are deep-equal. Reverts to unsorted iteration fail this test.
  const idA = "player:a";
  const idB = "player:b";

  function twoPlayerState(order: "ab" | "ba"): GameState {
    const base = createInitialState(42);
    const spawn = base.map.spawn;
    // Place the two players apart so their shots never overlap/consume each other, and
    // facing opposite directions so a swapped id would also swap velocity sign.
    const pa = createPlayer(idA, spawn);
    pa.onGround = true;
    pa.facing = "right";
    pa.pos = { x: 4 * TILE_SIZE, y: spawn.ty * TILE_SIZE };
    const pb = createPlayer(idB, spawn);
    pb.onGround = true;
    pb.facing = "left";
    pb.pos = { x: 10 * TILE_SIZE, y: spawn.ty * TILE_SIZE };

    const players: Record<string, PlayerState> = {};
    if (order === "ab") {
      players[idA] = pa;
      players[idB] = pb;
    } else {
      players[idB] = pb;
      players[idA] = pa;
    }
    // Drop enemies so only the two player shots are in play this tick.
    return { ...base, players, enemies: [] };
  }

  const inputs: InputsById = {
    [idA]: input({ fire: true }),
    [idB]: input({ fire: true }),
  };

  const sAb = step(twoPlayerState("ab"), inputs);
  const sBa = step(twoPlayerState("ba"), inputs);

  // Full-state deep equality: id minting, projectile ids, and nextEntityId must match
  // regardless of players-map insertion order.
  assert.deepEqual(sAb, sBa);

  // Each player's own shot is stably attributable: player A (facing right) always owns
  // the same projectile id moving right, player B (facing left) the one moving left.
  const shotA = sAb.projectiles.find((pr) => pr.owner === idA)!;
  const shotB = sAb.projectiles.find((pr) => pr.owner === idB)!;
  assert.ok(shotA.vel.x > 0, "player A shot travels right");
  assert.ok(shotB.vel.x < 0, "player B shot travels left");
  // Sorted-id order means A ("player:a") mints before B ("player:b").
  assert.ok(
    shotA.id < shotB.id,
    "the lower-id player mints its projectile first, deterministically",
  );
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
