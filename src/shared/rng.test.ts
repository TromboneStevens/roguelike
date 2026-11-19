import assert from "node:assert/strict";
import { test } from "node:test";
import { createRng } from "./rng.js";

test("createRng is deterministic for a fixed seed", () => {
  const a = createRng(12345);
  const b = createRng(12345);
  const seqA = Array.from({ length: 8 }, () => a.next());
  const seqB = Array.from({ length: 8 }, () => b.next());
  assert.deepEqual(seqA, seqB);
});

test("next() stays within [0, 1)", () => {
  const rng = createRng(1);
  for (let i = 0; i < 1000; i++) {
    const v = rng.next();
    assert.ok(v >= 0 && v < 1, `out of range: ${v}`);
  }
});

test("int() is inclusive and bounded", () => {
  const rng = createRng(99);
  for (let i = 0; i < 1000; i++) {
    const v = rng.int(3, 7);
    assert.ok(Number.isInteger(v));
    assert.ok(v >= 3 && v <= 7, `out of range: ${v}`);
  }
});

test("different seeds diverge", () => {
  const a = createRng(1);
  const b = createRng(2);
  assert.notEqual(a.next(), b.next());
});
