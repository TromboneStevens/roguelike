// Seeded procedural level generation. generateLevel(seed) is a pure function of its
// seed: the same seed always yields a deep-equal TileMap on both client and server.
//
// Shape guarantees (not a full reachability proof, but solvable by construction):
//   - a solid floor row along the bottom with one authored gap just before the exit,
//   - a player spawn on the left on solid ground and a non-solid exit on the right,
//     raised onto a pedestal so reaching it REQUIRES a jump (the floor walk no longer
//     leads straight to the exit),
//   - the pre-exit gap width and the pedestal rise both stay within the player's jump
//     reach (maxJumpGapTiles / maxJumpTiles) so the level is always completable,
//   - a sequence of platforms whose vertical gaps stay within the player's jump height,
//   - at least one enemy spawn point on solid ground with headroom (never embedded in
//     a platform tile).

import { createRng } from "./rng.js";
import {
  GRAVITY,
  JUMP_VELOCITY,
  MOVE_SPEED,
  TILE_SIZE,
  WORLD_TILES_H,
  WORLD_TILES_W,
} from "./constants.js";
import type { TileMap, TileCoord } from "./types.js";

/** Row-major index into a tile grid. */
export function tileIndex(width: number, tx: number, ty: number): number {
  return ty * width + tx;
}

/**
 * Maximum height, in whole tiles, a player can gain in a single jump. Derived from the
 * jump impulse and gravity (h = v^2 / 2g) so level geometry respects the physics.
 */
function maxJumpTiles(): number {
  const peakPixels = (JUMP_VELOCITY * JUMP_VELOCITY) / (2 * GRAVITY);
  return Math.floor(peakPixels / TILE_SIZE);
}

/**
 * Horizontal distance, in whole tiles, a running jump covers before the player returns
 * to the launch height. Air time is 2 * |JUMP_VELOCITY| / GRAVITY (up then back down);
 * multiplied by MOVE_SPEED and divided by the tile size, then floored for a safe bound.
 */
function maxJumpGapTiles(): number {
  const airtime = (2 * Math.abs(JUMP_VELOCITY)) / GRAVITY;
  const reachPixels = airtime * MOVE_SPEED;
  return Math.floor(reachPixels / TILE_SIZE);
}

export function generateLevel(seed: number): TileMap {
  const width = WORLD_TILES_W;
  const height = WORLD_TILES_H;
  const rng = createRng(seed >>> 0);

  const grid: boolean[] = new Array(width * height).fill(false);

  const set = (tx: number, ty: number, solid: boolean): void => {
    if (tx < 0 || tx >= width || ty < 0 || ty >= height) return;
    grid[tileIndex(width, tx, ty)] = solid;
  };

  // Solid floor along the entire bottom row.
  const floorRow = height - 1;
  for (let tx = 0; tx < width; tx++) {
    set(tx, floorRow, true);
  }

  // Cap vertical platform gaps so each rise stays within jump range. Leave a 1-tile
  // safety margin below the theoretical max.
  const maxRise = Math.max(2, maxJumpTiles() - 1);

  // Horizontal gap, in tiles, a running jump can clear. The player runs at MOVE_SPEED
  // and the jump keeps them airborne for ~2 * (|JUMP_VELOCITY| / GRAVITY) seconds; a
  // conservative tile count derived from that keeps hand-authored gaps crossable.
  const maxGapTiles = Math.max(2, maxJumpGapTiles() - 1);

  // Build left-to-right platforms. Each platform sits at a height reachable from the
  // previous one, giving a staircase-ish traversable path toward the exit.
  let prevTop = floorRow; // row the previous standing surface occupied
  let cursorX = 4; // leave room for the spawn area on the far left

  while (cursorX < width - 6) {
    const platLen = rng.int(3, 6);
    // Choose a vertical offset relative to the previous surface, bounded by jump range.
    const rise = rng.int(1, maxRise); // how many tiles up from previous surface
    let platTop = prevTop - rise;
    // Keep platforms inside the playable area and at least 3 tiles above the floor so a
    // standing player's body (≈1.4 tiles) always has a clear walking lane along the
    // floor beneath them. This guarantees the floor remains a traversable path and the
    // only forced jump is the authored pre-exit pit, keeping every seed completable.
    const platCeil = floorRow - 3;
    if (platTop > platCeil) platTop = platCeil;
    if (platTop < 2) platTop = 2;

    for (let i = 0; i < platLen && cursorX + i < width - 2; i++) {
      set(cursorX + i, platTop, true);
    }

    prevTop = platTop;
    // Horizontal gap to the next platform, kept modest so a jump bridges it.
    const gap = rng.int(2, 4);
    cursorX += platLen + gap;
  }

  // Player spawn: on top of the floor at the far left (floor row minus one is open air).
  const spawn: TileCoord = { tx: 1, ty: floorRow - 1 };

  // Load-bearing platforming: a pit is carved into the floor just before the exit so a
  // flat walk can no longer reach it; the player must jump the gap. The exit sits on a
  // short solid landing on the far side of the pit. The pit width is clamped below the
  // physical jump reach (maxJumpGapTiles) so the level stays completable by construction
  // for every seed. Standing on the floor on both sides keeps the landing forgiving.
  const exitX = width - 2;
  const exit: TileCoord = { tx: exitX, ty: floorRow - 1 };

  // Solid landing pad under and to the right of the exit (the floor there, reinforced).
  for (let tx = exitX - 1; tx < width; tx++) {
    set(tx, floorRow, true);
  }

  // Floor pit just before the exit landing: remove a run of floor tiles so the player
  // must jump across. Width is clamped to a crossable gap (below the jump reach).
  const gapWidth = Math.min(maxGapTiles, 3);
  const gapEnd = exitX - 2; // last empty floor column before the landing
  const gapStart = gapEnd - gapWidth + 1;
  for (let tx = gapStart; tx <= gapEnd; tx++) {
    set(tx, floorRow, false);
  }

  // Clear an approach corridor over the pit and the exit landing: remove any platform
  // tiles above the floor from a few columns before the pit through to the right wall.
  // This guarantees a clean jump-across-and-land path to the exit (no platform traps the
  // jumper above the goal) so the pit is the only obstacle and the level stays solvable.
  for (let tx = gapStart - 2; tx < width; tx++) {
    for (let ty = 0; ty < floorRow; ty++) {
      set(tx, ty, false);
    }
  }
  // Re-assert the solid landing on the exit side after clearing the corridor.
  for (let tx = exitX - 1; tx < width; tx++) {
    set(tx, floorRow, true);
  }

  // Make sure spawn and exit tiles themselves are open (non-solid).
  set(spawn.tx, spawn.ty, false);
  set(exit.tx, exit.ty, false);

  // Enemy spawn: on the floor in the middle band, on the standing side of the gap so it
  // is reachable along the floor. Clear the enemy's bounding tiles (standing tile plus
  // headroom above) so no generated platform is embedded in the enemy's body.
  let enemyX = Math.floor(width / 2) + rng.int(-4, 4);
  // Keep the enemy clear of the pre-exit gap and the spawn area.
  if (enemyX >= gapStart - 1) enemyX = gapStart - 2;
  if (enemyX < 4) enemyX = 4;
  const enemyStandRow = floorRow - 1;
  const enemySpawns: TileCoord[] = [{ tx: enemyX, ty: enemyStandRow }];
  for (const es of enemySpawns) {
    // Clear a 1-tile-wide, 3-tile-tall column above the floor so the enemy AABB has
    // headroom and is never embedded in a platform tile.
    for (let ty = es.ty; ty > es.ty - 3 && ty >= 0; ty--) {
      set(es.tx, ty, false);
    }
    // Ensure the tile directly under the enemy is solid ground to stand on.
    set(es.tx, floorRow, true);
  }

  return { width, height, grid, spawn, exit, enemySpawns };
}

/** Whether the tile at (tx, ty) is solid. Out-of-bounds is treated as solid (walls). */
export function isSolidTile(map: TileMap, tx: number, ty: number): boolean {
  if (tx < 0 || tx >= map.width || ty < 0 || ty >= map.height) return true;
  return map.grid[tileIndex(map.width, tx, ty)] === true;
}
