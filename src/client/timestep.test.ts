// Tests for the pure fixed-timestep accumulator helper. Runs headless under
// `node --import tsx --test` with no DOM dependency.

import { test } from "node:test";
import assert from "node:assert/strict";

import { advance } from "./timestep.js";

const DT = 1 / 60; // 60 Hz fixed step, matching TICK_DT.

test("exactly one step when elapsed equals dt", () => {
  const r = advance(0, DT, DT, 10);
  assert.equal(r.steps, 1);
  assert.ok(Math.abs(r.accumulator) < 1e-9, "accumulator drained to ~0");
});

test("no steps when elapsed is below dt, time accumulates", () => {
  const r = advance(0, DT / 2, DT, 10);
  assert.equal(r.steps, 0);
  assert.ok(Math.abs(r.accumulator - DT / 2) < 1e-9);
});

test("fractional remainder carries to the next call", () => {
  // 1.5 * dt -> 1 step this call, 0.5*dt left over.
  const first = advance(0, DT * 1.5, DT, 10);
  assert.equal(first.steps, 1);
  assert.ok(Math.abs(first.accumulator - DT * 0.5) < 1e-9);

  // Feed another 1.5*dt: now 2.0*dt accumulated -> 2 steps, 0 left.
  const second = advance(first.accumulator, DT * 1.5, DT, 10);
  assert.equal(second.steps, 2);
  assert.ok(Math.abs(second.accumulator) < 1e-9);
});

test("multiple whole steps from a large frame delta", () => {
  const r = advance(0, DT * 4, DT, 10);
  assert.equal(r.steps, 4);
  assert.ok(Math.abs(r.accumulator) < 1e-9);
});

test("sequence of deltas yields the correct total step count", () => {
  let acc = 0;
  let total = 0;
  // Ten frames of ~16.7ms each at ~60fps -> about 10 steps total, phase-accurate.
  const frames = [0.016, 0.017, 0.016, 0.018, 0.015, 0.017, 0.016, 0.017, 0.016, 0.016];
  for (const f of frames) {
    const r = advance(acc, f, DT, 10);
    acc = r.accumulator;
    total += r.steps;
  }
  const expected = Math.floor(frames.reduce((a, b) => a + b, 0) / DT);
  assert.equal(total, expected);
});

test("maxSteps cap prevents the spiral of death", () => {
  // A huge stall (1 second) would be 60 steps; cap at 5.
  const r = advance(0, 1.0, DT, 5);
  assert.equal(r.steps, 5);
  // Leftover is clamped below dt so backlog is discarded, not carried.
  assert.ok(r.accumulator < DT, "excess backlog discarded");
});

test("negative or NaN elapsed is treated as no elapsed time", () => {
  const neg = advance(DT * 0.25, -5, DT, 10);
  assert.equal(neg.steps, 0);
  assert.ok(Math.abs(neg.accumulator - DT * 0.25) < 1e-9);

  const nan = advance(DT * 0.25, Number.NaN, DT, 10);
  assert.equal(nan.steps, 0);
  assert.ok(Math.abs(nan.accumulator - DT * 0.25) < 1e-9);
});

test("dt must be positive", () => {
  assert.throws(() => advance(0, DT, 0, 10));
  assert.throws(() => advance(0, DT, -DT, 10));
});
