// Shared constants used by both the deterministic simulation core (server + client)
// and the renderer. Keeping these in one place makes the fixed-timestep sim and the
// view agree on sizes and rates. All tuning lives here so the simulation stays data-driven.

/** Simulation tick rate in hertz. The sim steps at a fixed timestep for determinism. */
export const TICK_RATE = 60;

/** Fixed timestep in seconds (1 / TICK_RATE). */
export const TICK_DT = 1 / TICK_RATE;

/** Logical play-field size in pixels. The canvas renders at this resolution. */
export const VIEW_WIDTH = 960;
export const VIEW_HEIGHT = 540;

// --- World / tilemap ---------------------------------------------------------

/** Side length of a square tile in world pixels. */
export const TILE_SIZE = 32;

/** Level dimensions in tiles. Width spans several screens; height fits the view. */
export const WORLD_TILES_W = 60;
export const WORLD_TILES_H = 17;

// --- Physics -----------------------------------------------------------------
// Units are world pixels and seconds. Per-tick deltas multiply by TICK_DT.

/** Downward acceleration in pixels per second squared. */
export const GRAVITY = 2000;

/** Horizontal run speed in pixels per second. */
export const MOVE_SPEED = 260;

/** Instant upward velocity applied on jump, in pixels per second (negative = up). */
export const JUMP_VELOCITY = -680;

/** Terminal fall speed cap in pixels per second. */
export const MAX_FALL_SPEED = 1200;

/** Player axis-aligned bounding box size in pixels. */
export const PLAYER_WIDTH = 24;
export const PLAYER_HEIGHT = 44;

/** Starting and maximum player hit points. */
export const PLAYER_MAX_HP = 5;

// --- Enemies / projectiles ---------------------------------------------------

/** Enemy bounding box size in pixels. */
export const ENEMY_WIDTH = 28;
export const ENEMY_HEIGHT = 28;

/** Enemy starting hit points. */
export const ENEMY_MAX_HP = 3;

/** Ticks between enemy shots. At 60Hz, 90 ticks is roughly 1.5 seconds. */
export const ENEMY_FIRE_INTERVAL = 90;

/** Projectile travel speed in pixels per second. */
export const PROJECTILE_SPEED = 420;

/** Projectile lifetime in ticks before it expires. */
export const PROJECTILE_TTL = 180;

/** Damage a single projectile deals to a player on hit. */
export const PROJECTILE_DAMAGE = 1;

/** Projectile bounding box size in pixels (small square). */
export const PROJECTILE_SIZE = 8;

/**
 * Random spread (in radians) applied to each enemy shot via the seeded RNG. Keeps
 * aim mostly toward the target but adds deterministic variation to the pattern.
 */
export const ENEMY_AIM_SPREAD = 0.18;
