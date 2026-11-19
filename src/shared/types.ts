// Core data types for the deterministic simulation. These are plain data structs
// (no methods) so a GameState can be cloned, serialized across the wire, and
// deep-compared for determinism checks. Both client and server use these verbatim.

import type { Vec2 } from "./vec.js";

/** Per-tick input for a single player. Captured by the client, sent to the server. */
export interface InputState {
  left: boolean;
  right: boolean;
  jump: boolean;
  fire: boolean;
  /** The tick this input is intended for (used by prediction/reconciliation later). */
  tick: number;
}

/** Which way a player is facing; also drives projectile fire direction. */
export type Facing = "left" | "right";

/** Mutable state for one player, keyed by id inside GameState.players. */
export interface PlayerState {
  id: string;
  pos: Vec2;
  vel: Vec2;
  onGround: boolean;
  hp: number;
  facing: Facing;
  alive: boolean;
}

/** A simple enemy that fires projectiles toward the nearest player on an interval. */
export interface EnemyState {
  id: string;
  pos: Vec2;
  hp: number;
  /** Ticks remaining until the enemy may fire again. */
  fireCooldown: number;
  /** Named firing behaviour. Only "aimed" exists for now; room to grow. */
  pattern: EnemyPattern;
}

/** Enemy firing behaviours. */
export type EnemyPattern = "aimed";

/** A single projectile in flight. */
export interface Projectile {
  id: string;
  pos: Vec2;
  vel: Vec2;
  /** Id of the entity that fired it ("enemy:..." or "player:..."). */
  owner: string;
  /** Ticks remaining before the projectile expires. */
  ttl: number;
}

/** Position expressed in tile coordinates. */
export interface TileCoord {
  tx: number;
  ty: number;
}

/**
 * The static level geometry. `grid` is row-major (index = ty * width + tx) and holds
 * `true` for solid tiles. `spawn` and `exit` are tile coordinates guaranteed non-solid.
 */
export interface TileMap {
  width: number;
  height: number;
  grid: boolean[];
  spawn: TileCoord;
  exit: TileCoord;
  /** Tile coordinates where enemies start. */
  enemySpawns: TileCoord[];
}

/** Overall match status. */
export type GameStatus = "playing" | "won" | "lost";

/**
 * The entire simulation state at one tick. `players` is a map keyed by player id so
 * additional players drop in for multiplayer without reshaping the state.
 */
export interface GameState {
  tick: number;
  seed: number;
  map: TileMap;
  players: Record<string, PlayerState>;
  enemies: EnemyState[];
  projectiles: Projectile[];
  status: GameStatus;
  /** Monotonic counter used to mint unique entity ids deterministically. */
  nextEntityId: number;
}

/** A per-tick bundle of inputs keyed by player id, as passed to step(). */
export type InputsById = Record<string, InputState>;
