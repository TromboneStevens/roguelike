// Minimal 2D vector helpers used by physics and projectiles. Functions return plain
// objects; callers that care about allocation can use the in-place numeric paths
// (e.g. physics integrates fields directly on the state structs).

export interface Vec2 {
  x: number;
  y: number;
}

/** Create a vector. */
export function vec(x: number, y: number): Vec2 {
  return { x, y };
}

/** Component-wise sum a + b. */
export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

/** Component-wise difference a - b. */
export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

/** Scale a vector by a scalar. */
export function scale(a: Vec2, s: number): Vec2 {
  return { x: a.x * s, y: a.y * s };
}

/** Euclidean length. */
export function length(a: Vec2): number {
  return Math.hypot(a.x, a.y);
}

/** Return a unit-length copy of a. A zero vector returns {0, 0}. */
export function normalize(a: Vec2): Vec2 {
  const len = length(a);
  if (len === 0) return { x: 0, y: 0 };
  return { x: a.x / len, y: a.y / len };
}

/** Clamp a scalar into [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/** Straight-line distance between two points. */
export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
