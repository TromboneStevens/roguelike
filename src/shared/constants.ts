// Shared constants used by both the deterministic simulation core (server + client)
// and the renderer. Keeping these in one place makes the fixed-timestep sim and the
// view agree on sizes and rates.

/** Simulation tick rate in hertz. The sim steps at a fixed timestep for determinism. */
export const TICK_RATE = 60;

/** Fixed timestep in seconds (1 / TICK_RATE). */
export const TICK_DT = 1 / TICK_RATE;

/** Logical play-field size in pixels. The canvas renders at this resolution. */
export const VIEW_WIDTH = 960;
export const VIEW_HEIGHT = 540;
