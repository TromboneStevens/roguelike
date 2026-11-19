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

test("bottom row is a continuous solid floor", () => {
  const map = generateLevel(7);
  const floorRow = map.height - 1;
  for (let tx = 0; tx < map.width; tx++) {
    assert.ok(
      map.grid[tileIndex(map.width, tx, floorRow)],
      `floor tile ${tx} should be solid`,
    );
  }
});

test("spawn and exit are non-solid and distinct", () => {
  const map = generateLevel(55);
  assert.ok(!isSolidTile(map, map.spawn.tx, map.spawn.ty), "spawn must be open");
  assert.ok(!isSolidTile(map, map.exit.tx, map.exit.ty), "exit must be open");
  assert.notDeepEqual(map.spawn, map.exit);
});

test("has at least one enemy spawn on an open tile", () => {
  const map = generateLevel(55);
  assert.ok(map.enemySpawns.length >= 1);
  for (const es of map.enemySpawns) {
    assert.ok(!isSolidTile(map, es.tx, es.ty), "enemy spawn must be open");
  }
});

test("out-of-bounds tiles are treated as solid walls", () => {
  const map = generateLevel(3);
  assert.ok(isSolidTile(map, -1, 0));
  assert.ok(isSolidTile(map, map.width, 0));
  assert.ok(isSolidTile(map, 0, -1));
  assert.ok(isSolidTile(map, 0, map.height));
});
