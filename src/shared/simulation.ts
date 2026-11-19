// The deterministic simulation core. createInitialState(seed) builds a fresh match and
// step(state, inputsById) advances it exactly one fixed tick.
//
// Determinism contract:
//   - step() is a pure function of (state, inputs). It deep-clones the incoming state
//     and returns the new one; the argument is never mutated, so replaying the same
//     (state, inputs) sequence always reproduces the same result on client and server.
//   - All randomness (enemy aim spread) is drawn from a PRNG seeded from (seed, tick),
//     so no wall-clock or Math.random leaks in.

import {
  ENEMY_AIM_SPREAD,
  ENEMY_FIRE_INTERVAL,
  ENEMY_HEIGHT,
  ENEMY_WIDTH,
  GRAVITY,
  JUMP_VELOCITY,
  MAX_FALL_SPEED,
  MOVE_SPEED,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  PROJECTILE_DAMAGE,
  PROJECTILE_SIZE,
  PROJECTILE_SPEED,
  TICK_DT,
  TILE_SIZE,
} from "./constants.js";
import { createEnemy, createPlayer, createProjectile } from "./entities.js";
import { generateLevel, isSolidTile } from "./levelgen.js";
import { createRng } from "./rng.js";
import type {
  EnemyState,
  GameState,
  InputState,
  InputsById,
  PlayerState,
  Projectile,
  TileMap,
} from "./types.js";

/** Default id for the local/first player. Multiplayer adds more keys to the map. */
export const DEFAULT_PLAYER_ID = "player:0";

interface Aabb {
  x: number;
  y: number;
  w: number;
  h: number;
}

function aabbOverlap(a: Aabb, b: Aabb): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Deep clone of GameState via structuredClone fallback. Keeps step() non-mutating. */
function cloneState(state: GameState): GameState {
  return {
    tick: state.tick,
    seed: state.seed,
    map: state.map, // immutable after generation; safe to share by reference
    players: Object.fromEntries(
      Object.entries(state.players).map(([id, p]) => [id, clonePlayer(p)]),
    ),
    enemies: state.enemies.map(cloneEnemy),
    projectiles: state.projectiles.map(cloneProjectile),
    status: state.status,
    nextEntityId: state.nextEntityId,
  };
}

function clonePlayer(p: PlayerState): PlayerState {
  return {
    id: p.id,
    pos: { x: p.pos.x, y: p.pos.y },
    vel: { x: p.vel.x, y: p.vel.y },
    onGround: p.onGround,
    hp: p.hp,
    facing: p.facing,
    alive: p.alive,
  };
}

function cloneEnemy(e: EnemyState): EnemyState {
  return {
    id: e.id,
    pos: { x: e.pos.x, y: e.pos.y },
    hp: e.hp,
    fireCooldown: e.fireCooldown,
    pattern: e.pattern,
  };
}

function cloneProjectile(pr: Projectile): Projectile {
  return {
    id: pr.id,
    pos: { x: pr.pos.x, y: pr.pos.y },
    vel: { x: pr.vel.x, y: pr.vel.y },
    owner: pr.owner,
    ttl: pr.ttl,
  };
}

/** Build the first state for a run: generate the level, place the player and enemy. */
export function createInitialState(seed: number): GameState {
  const map = generateLevel(seed);
  const players: Record<string, PlayerState> = {};
  players[DEFAULT_PLAYER_ID] = createPlayer(DEFAULT_PLAYER_ID, map.spawn);

  const enemies: EnemyState[] = map.enemySpawns.map((es, i) =>
    createEnemy(`enemy:${i}`, es),
  );

  return {
    tick: 0,
    seed: seed >>> 0,
    map,
    players,
    enemies,
    projectiles: [],
    status: "playing",
    nextEntityId: 1,
  };
}

const NO_INPUT: InputState = {
  left: false,
  right: false,
  jump: false,
  fire: false,
  tick: 0,
};

/**
 * Advance the simulation by one fixed tick. Pure: returns a new GameState and does not
 * mutate `state` or `inputsById`.
 */
export function step(state: GameState, inputsById: InputsById): GameState {
  const next = cloneState(state);
  next.tick = state.tick + 1;

  // Once the match is decided, freeze the world (idempotent steps) for stable replay.
  if (next.status !== "playing") {
    return next;
  }

  // Per-tick RNG derived purely from seed + tick so randomness is reproducible.
  const rng = createRng((next.seed ^ Math.imul(next.tick, 0x9e3779b1)) >>> 0);

  // 1) Players: input -> velocity -> gravity -> integrate with tile collision.
  for (const id of Object.keys(next.players)) {
    const player = next.players[id]!;
    if (!player.alive) continue;
    const input = inputsById[id] ?? NO_INPUT;
    updatePlayer(player, input, next.map);
  }

  // 2) Enemies: tick fire cooldown, shoot toward nearest living player on interval.
  for (const enemy of next.enemies) {
    updateEnemy(enemy, next, rng);
  }

  // 3) Projectiles: integrate, expire by ttl, resolve vs tiles and players.
  updateProjectiles(next);

  // 4) Win / lose resolution.
  resolveStatus(next);

  return next;
}

/** Apply input and physics to one player, resolving collisions X then Y. */
function updatePlayer(player: PlayerState, input: InputState, map: TileMap): void {
  // Horizontal velocity is set directly from input (snappy platformer feel).
  let vx = 0;
  if (input.left) vx -= MOVE_SPEED;
  if (input.right) vx += MOVE_SPEED;
  player.vel.x = vx;
  if (vx < 0) player.facing = "left";
  else if (vx > 0) player.facing = "right";

  // Jump only from the ground: no double jump.
  if (input.jump && player.onGround) {
    player.vel.y = JUMP_VELOCITY;
    player.onGround = false;
  }

  // Gravity, capped at terminal velocity.
  player.vel.y += GRAVITY * TICK_DT;
  if (player.vel.y > MAX_FALL_SPEED) player.vel.y = MAX_FALL_SPEED;

  // Integrate and resolve one axis at a time so corners behave.
  moveAxisX(player, map, player.vel.x * TICK_DT);
  moveAxisY(player, map, player.vel.y * TICK_DT);
}

/** Tiles overlapped by an AABB, inclusive. */
function tileSpan(min: number, max: number): [number, number] {
  return [Math.floor(min / TILE_SIZE), Math.floor((max - 1e-6) / TILE_SIZE)];
}

function moveAxisX(player: PlayerState, map: TileMap, dx: number): void {
  if (dx === 0) return;
  let newX = player.pos.x + dx;
  const [tyMin, tyMax] = tileSpan(player.pos.y, player.pos.y + PLAYER_HEIGHT);

  if (dx > 0) {
    const rightTile = Math.floor((newX + PLAYER_WIDTH - 1e-6) / TILE_SIZE);
    for (let ty = tyMin; ty <= tyMax; ty++) {
      if (isSolidTile(map, rightTile, ty)) {
        newX = rightTile * TILE_SIZE - PLAYER_WIDTH;
        player.vel.x = 0;
        break;
      }
    }
  } else {
    const leftTile = Math.floor(newX / TILE_SIZE);
    for (let ty = tyMin; ty <= tyMax; ty++) {
      if (isSolidTile(map, leftTile, ty)) {
        newX = (leftTile + 1) * TILE_SIZE;
        player.vel.x = 0;
        break;
      }
    }
  }
  player.pos.x = newX;
}

function moveAxisY(player: PlayerState, map: TileMap, dy: number): void {
  player.onGround = false;
  if (dy === 0) {
    // Still probe for ground directly beneath so standing players read onGround.
    probeGround(player, map);
    return;
  }
  let newY = player.pos.y + dy;
  const [txMin, txMax] = tileSpan(player.pos.x, player.pos.x + PLAYER_WIDTH);

  if (dy > 0) {
    const bottomTile = Math.floor((newY + PLAYER_HEIGHT - 1e-6) / TILE_SIZE);
    for (let tx = txMin; tx <= txMax; tx++) {
      if (isSolidTile(map, tx, bottomTile)) {
        newY = bottomTile * TILE_SIZE - PLAYER_HEIGHT;
        player.vel.y = 0;
        player.onGround = true;
        break;
      }
    }
  } else {
    const topTile = Math.floor(newY / TILE_SIZE);
    for (let tx = txMin; tx <= txMax; tx++) {
      if (isSolidTile(map, tx, topTile)) {
        newY = (topTile + 1) * TILE_SIZE;
        player.vel.y = 0;
        break;
      }
    }
  }
  player.pos.y = newY;
}

/** Detect ground contact when the player is not moving vertically. */
function probeGround(player: PlayerState, map: TileMap): void {
  const [txMin, txMax] = tileSpan(player.pos.x, player.pos.x + PLAYER_WIDTH);
  const belowTile = Math.floor((player.pos.y + PLAYER_HEIGHT + 1e-3) / TILE_SIZE);
  for (let tx = txMin; tx <= txMax; tx++) {
    if (isSolidTile(map, tx, belowTile)) {
      player.onGround = true;
      return;
    }
  }
}

/** Enemy AI: fire an aimed projectile at the nearest living player when off cooldown. */
function updateEnemy(enemy: EnemyState, state: GameState, rng: ReturnType<typeof createRng>): void {
  if (enemy.fireCooldown > 0) {
    enemy.fireCooldown -= 1;
    return;
  }

  const target = nearestLivingPlayer(enemy, state.players);
  if (!target) return;

  const enemyCx = enemy.pos.x + ENEMY_WIDTH / 2;
  const enemyCy = enemy.pos.y + ENEMY_HEIGHT / 2;
  const targetCx = target.pos.x + PLAYER_WIDTH / 2;
  const targetCy = target.pos.y + PLAYER_HEIGHT / 2;

  const baseAngle = Math.atan2(targetCy - enemyCy, targetCx - enemyCx);
  // Deterministic spread: rng.next() in [0,1) -> symmetric offset.
  const spread = (rng.next() - 0.5) * 2 * ENEMY_AIM_SPREAD;
  const angle = baseAngle + spread;

  const vx = Math.cos(angle) * PROJECTILE_SPEED;
  const vy = Math.sin(angle) * PROJECTILE_SPEED;

  const id = `proj:${state.nextEntityId}`;
  state.nextEntityId += 1;
  state.projectiles.push(
    createProjectile(
      id,
      enemyCx - PROJECTILE_SIZE / 2,
      enemyCy - PROJECTILE_SIZE / 2,
      vx,
      vy,
      enemy.id,
    ),
  );
  enemy.fireCooldown = ENEMY_FIRE_INTERVAL;
}

function nearestLivingPlayer(
  enemy: EnemyState,
  players: Record<string, PlayerState>,
): PlayerState | null {
  let best: PlayerState | null = null;
  let bestDist = Infinity;
  // Iterate in sorted id order for deterministic tie-breaking.
  for (const id of Object.keys(players).sort()) {
    const p = players[id]!;
    if (!p.alive) continue;
    const dx = p.pos.x - enemy.pos.x;
    const dy = p.pos.y - enemy.pos.y;
    const d = dx * dx + dy * dy;
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best;
}

/** Move projectiles, expire them, and resolve collisions with tiles and players. */
function updateProjectiles(state: GameState): void {
  const survivors: Projectile[] = [];
  for (const pr of state.projectiles) {
    pr.pos.x += pr.vel.x * TICK_DT;
    pr.pos.y += pr.vel.y * TICK_DT;
    pr.ttl -= 1;

    if (pr.ttl <= 0) continue;

    // Remove on solid tile hit.
    const cx = pr.pos.x + PROJECTILE_SIZE / 2;
    const cy = pr.pos.y + PROJECTILE_SIZE / 2;
    const tx = Math.floor(cx / TILE_SIZE);
    const ty = Math.floor(cy / TILE_SIZE);
    if (isSolidTile(state.map, tx, ty)) continue;

    // Enemy-owned projectiles damage players on overlap.
    const box: Aabb = { x: pr.pos.x, y: pr.pos.y, w: PROJECTILE_SIZE, h: PROJECTILE_SIZE };
    let consumed = false;
    if (pr.owner.startsWith("enemy:")) {
      for (const id of Object.keys(state.players).sort()) {
        const player = state.players[id]!;
        if (!player.alive) continue;
        const pbox: Aabb = {
          x: player.pos.x,
          y: player.pos.y,
          w: PLAYER_WIDTH,
          h: PLAYER_HEIGHT,
        };
        if (aabbOverlap(box, pbox)) {
          player.hp -= PROJECTILE_DAMAGE;
          if (player.hp <= 0) {
            player.hp = 0;
            player.alive = false;
          }
          consumed = true;
          break;
        }
      }
    }
    if (consumed) continue;

    survivors.push(pr);
  }
  state.projectiles = survivors;
}

/** Decide win/lose: a living player on the exit tile wins; all dead loses. */
function resolveStatus(state: GameState): void {
  const exit = state.map.exit;
  const exitBox: Aabb = {
    x: exit.tx * TILE_SIZE,
    y: exit.ty * TILE_SIZE,
    w: TILE_SIZE,
    h: TILE_SIZE,
  };

  let anyAlive = false;
  for (const id of Object.keys(state.players)) {
    const p = state.players[id]!;
    if (!p.alive) continue;
    anyAlive = true;
    const pbox: Aabb = { x: p.pos.x, y: p.pos.y, w: PLAYER_WIDTH, h: PLAYER_HEIGHT };
    if (aabbOverlap(pbox, exitBox)) {
      state.status = "won";
      return;
    }
  }

  if (!anyAlive) {
    state.status = "lost";
  }
}
