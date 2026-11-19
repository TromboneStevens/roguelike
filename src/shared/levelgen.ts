// Seeded procedural level generation. generateLevel(seed) is a pure function of its
// seed: the same seed always yields a deep-equal TileMap on both client and server.
//
// Shape guarantees (not a full reachability proof, but solvable by construction):
//   - a continuous solid floor row along the bottom,
//   - a player spawn on the left and an exit on the right, both on non-solid tiles,
//   - a sequence of platforms whose vertical gaps stay within the player's jump height
//     so the level reads as traversable,
//   - at least one enemy spawn point on solid ground.

import { createRng } from "./rng.js";
import {
  GRAVITY,
  JUMP_VELOCITY,
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

  // Build left-to-right platforms. Each platform sits at a height reachable from the
  // previous one, giving a staircase-ish traversable path toward the exit.
  let prevTop = floorRow; // row the previous standing surface occupied
  let cursorX = 4; // leave room for the spawn area on the far left

  while (cursorX < width - 6) {
    const platLen = rng.int(3, 6);
    // Choose a vertical offset relative to the previous surface, bounded by jump range.
    const rise = rng.int(1, maxRise); // how many tiles up from previous surface
    let platTop = prevTop - rise;
    // Keep platforms inside the playable area, above the floor and below the ceiling.
    if (platTop < 2) platTop = 2;
    if (platTop > floorRow - 1) platTop = floorRow - 1;

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

  // Exit: near the far right, standing on the floor. Place a small solid pedestal under
  // it so a player arriving along the floor reaches it, and keep the exit tile non-solid.
  const exitX = width - 2;
  const exit: TileCoord = { tx: exitX, ty: floorRow - 1 };
  // Guarantee the pedestal/floor beneath the exit is solid (it already is: floorRow).

  // Make sure spawn and exit tiles themselves are open (non-solid).
  set(spawn.tx, spawn.ty, false);
  set(exit.tx, exit.ty, false);

  // Enemy spawn: somewhere in the middle, standing on the floor, non-solid tile above it.
  const enemyX = Math.floor(width / 2) + rng.int(-4, 4);
  const enemySpawns: TileCoord[] = [{ tx: enemyX, ty: floorRow - 1 }];
  for (const es of enemySpawns) {
    set(es.tx, es.ty, false);
  }

  return { width, height, grid, spawn, exit, enemySpawns };
}

/** Whether the tile at (tx, ty) is solid. Out-of-bounds is treated as solid (walls). */
export function isSolidTile(map: TileMap, tx: number, ty: number): boolean {
  if (tx < 0 || tx >= map.width || ty < 0 || ty >= map.height) return true;
  return map.grid[tileIndex(map.width, tx, ty)] === true;
}
