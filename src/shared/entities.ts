// Entity factory helpers used by the simulation. Kept separate from the step() logic
// so construction stays in one place and reads cleanly. All factories take explicit
// values (no hidden randomness) to preserve determinism.

import {
  ENEMY_MAX_HP,
  PLAYER_MAX_HP,
  PROJECTILE_TTL,
  TILE_SIZE,
} from "./constants.js";
import type {
  EnemyPattern,
  EnemyState,
  Facing,
  PlayerState,
  Projectile,
  TileCoord,
} from "./types.js";

/** Convert a tile coordinate to the world-pixel position of its top-left corner. */
export function tileToWorld(coord: TileCoord): { x: number; y: number } {
  return { x: coord.tx * TILE_SIZE, y: coord.ty * TILE_SIZE };
}

export function createPlayer(id: string, spawn: TileCoord): PlayerState {
  const world = tileToWorld(spawn);
  return {
    id,
    pos: { x: world.x, y: world.y },
    vel: { x: 0, y: 0 },
    onGround: false,
    hp: PLAYER_MAX_HP,
    facing: "right" as Facing,
    alive: true,
    fireCooldown: 0,
  };
}

export function createEnemy(id: string, spawn: TileCoord, pattern: EnemyPattern = "aimed"): EnemyState {
  const world = tileToWorld(spawn);
  return {
    id,
    pos: { x: world.x, y: world.y },
    hp: ENEMY_MAX_HP,
    fireCooldown: 0,
    pattern,
  };
}

export function createProjectile(
  id: string,
  x: number,
  y: number,
  vx: number,
  vy: number,
  owner: string,
): Projectile {
  return {
    id,
    pos: { x, y },
    vel: { x: vx, y: vy },
    owner,
    ttl: PROJECTILE_TTL,
  };
}
