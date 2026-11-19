// Pure fixed-timestep accumulator math, extracted so it is testable without a DOM.
//
// A real-time render loop (requestAnimationFrame) delivers frames at an irregular
// cadence, but the deterministic simulation must advance in fixed DT slices. advance()
// folds the newly elapsed wall-clock time into a running accumulator and reports how
// many whole fixed steps are now due, plus the leftover time to carry forward.
//
// The maxSteps cap guards against the "spiral of death": if a frame hitches (tab
// backgrounded, GC pause) the accumulator could demand hundreds of steps, each of
// which costs time, so the next frame demands even more. Capping the steps per call
// drops that excess time instead of trying to catch up forever.

export interface AdvanceResult {
  /** Number of whole fixed steps to run this frame. */
  steps: number;
  /** Time (seconds) left over after removing the consumed steps; carried to next call. */
  accumulator: number;
}

/**
 * Fold `elapsed` seconds into `accumulator` and compute how many fixed `dt` steps are
 * due. Returns the step count (clamped to `maxSteps`) and the remaining accumulator.
 *
 * - `elapsed` and `accumulator` are in seconds; `dt` is the fixed timestep in seconds.
 * - When the cap is hit, the surplus time is discarded (accumulator clamped to < dt)
 *   so the loop cannot spiral. Otherwise the fractional remainder is kept for the next
 *   frame so stepping stays phase-accurate on average.
 */
export function advance(
  accumulator: number,
  elapsed: number,
  dt: number,
  maxSteps: number,
): AdvanceResult {
  if (dt <= 0) {
    throw new Error("advance: dt must be > 0");
  }
  // Guard against negative or NaN frame deltas (e.g. clock skew); treat as no time.
  let acc = accumulator + (elapsed > 0 ? elapsed : 0);

  let steps = Math.floor(acc / dt);
  if (steps <= 0) {
    return { steps: 0, accumulator: acc };
  }

  if (steps > maxSteps) {
    // Cap the catch-up and throw away the excess backlog to avoid the spiral of death.
    steps = maxSteps;
    acc = acc % dt;
    return { steps, accumulator: acc };
  }

  acc -= steps * dt;
  return { steps, accumulator: acc };
}
