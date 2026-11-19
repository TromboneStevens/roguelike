import assert from "node:assert/strict";
import { test } from "node:test";
import { WORLD_TILES_H, WORLD_TILES_W } from "./constants.js";
import { generateLevel, isSolidTile, tileIndex } from "./levelgen.js";

test("generateLevel is deterministic for a fixed seed", () => {
  const a = generateLevel(1234);
  const b = generateLevel(1234);
  assert.deepEqual(a, b);
});

test("different seeds produce different maps", () => {
  const a = generateLevel(1);
  const b = generateLevel(2);
  assert.notDeepEqual(a.grid, b.grid);
});

test("map has the expected dimensions", () => {
  const map = generateLevel(7);
  assert.equal(map.width, WORLD_TILES_W);
  assert.equal(map.height, WORLD_TILES_H);
  assert.equal(map.grid.length, WORLD_TILES_W * WORLD_TILES_H);
});

test("floor has an authored gap so a flat walk cannot reach the exit (load-bearing jump)", () => {
  // The platforming is load-bearing: the generator carves at least one non-solid column
  // into the bottom floor row for every tested seed, forcing a jump across.
  for (const seed of [7, 55, 1234, 99, 2024]) {
    const map = generateLevel(seed);
    const floorRow = map.height - 1;
    let gapColumns = 0;
    for (let tx = 0; tx < map.width; tx++) {
      if (!map.grid[tileIndex(map.width, tx, floorRow)]) gapColumns += 1;
    }
    assert.ok(gapColumns >= 1, `seed ${seed}: floor should contain at least one gap`);
  }
});

test("a floor pit lies between the spawn and the exit (jump required to reach the goal)", () => {
  for (const seed of [7, 55, 1234, 99, 2024]) {
    const map = generateLevel(seed);
    const floorRow = map.height - 1;
    // There must be a missing floor column strictly between the spawn and the exit, so
    // the exit cannot be reached by an unbroken floor walk.
    let pitBetween = false;
    for (let tx = map.spawn.tx + 1; tx < map.exit.tx; tx++) {
      if (!map.grid[tileIndex(map.width, tx, floorRow)]) {
        pitBetween = true;
        break;
      }
    }
    assert.ok(pitBetween, `seed ${seed}: a pit must separate spawn from exit`);
  }
});

test("spawn is on solid ground and exit is non-solid and distinct", () => {
  const map = generateLevel(55);
  assert.ok(!isSolidTile(map, map.spawn.tx, map.spawn.ty), "spawn must be open");
  assert.ok(
    isSolidTile(map, map.spawn.tx, map.spawn.ty + 1),
    "spawn must stand on solid ground",
  );
  assert.ok(!isSolidTile(map, map.exit.tx, map.exit.ty), "exit must be open");
  assert.ok(
    isSolidTile(map, map.exit.tx, map.exit.ty + 1),
    "exit must stand on a solid pedestal",
  );
  assert.notDeepEqual(map.spawn, map.exit);
});

test("enemy spawn is on open ground with headroom (not embedded in a platform)", () => {
  for (const seed of [7, 55, 1234, 99, 2024]) {
    const map = generateLevel(seed);
    assert.ok(map.enemySpawns.length >= 1);
    for (const es of map.enemySpawns) {
      assert.ok(!isSolidTile(map, es.tx, es.ty), "enemy spawn tile must be open");
      // Headroom above the standing tile so the enemy body is never inside a tile.
      assert.ok(!isSolidTile(map, es.tx, es.ty - 1), "enemy needs headroom above");
      assert.ok(
        isSolidTile(map, es.tx, es.ty + 1),
        "enemy must stand on solid ground",
      );
    }
  }
});

test("out-of-bounds tiles are treated as solid walls", () => {
  const map = generateLevel(3);
  assert.ok(isSolidTile(map, -1, 0));
  assert.ok(isSolidTile(map, map.width, 0));
  assert.ok(isSolidTile(map, 0, -1));
  assert.ok(isSolidTile(map, 0, map.height));
});
