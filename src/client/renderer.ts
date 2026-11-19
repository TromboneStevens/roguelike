// Canvas 2D renderer. render(ctx, state) draws the whole frame from a GameState and
// its TileMap. It is strictly read-only over the state: nothing here mutates the
// simulation, so rendering and simulation stay decoupled and the same state can be
// drawn any number of times.
//
// The world is wider than the viewport (WORLD_TILES_W * TILE_SIZE > VIEW_WIDTH), so a
// simple camera follows the local player horizontally, clamped to the level bounds.

import {
  ENEMY_HEIGHT,
  ENEMY_WIDTH,
  PLAYER_HEIGHT,
  PLAYER_MAX_HP,
  PLAYER_WIDTH,
  PROJECTILE_SIZE,
  TILE_SIZE,
  VIEW_HEIGHT,
  VIEW_WIDTH,
} from "../shared/constants.js";
import { isSolidTile } from "../shared/levelgen.js";
import type { GameState, PlayerState, TileMap } from "../shared/types.js";

// Palette. Bright projectiles on a dark field for bullet-hell readability.
const COLOR_BG = "#11141f";
const COLOR_TILE = "#2c3550";
const COLOR_TILE_EDGE = "#3d4a70";
const COLOR_EXIT = "#38e08b";
const COLOR_EXIT_GLOW = "rgba(56, 224, 139, 0.35)";
const COLOR_PLAYER = "#6ad0ff";
const COLOR_PLAYER_DEAD = "#4a5570";
const COLOR_PLAYER_EYE = "#0b0d14";
const COLOR_ENEMY = "#ff5d73";
const COLOR_PROJECTILE = "#ffe14d";
const COLOR_PROJECTILE_CORE = "#ffffff";
// Player-fired shots use a cool tint so they read as distinct from enemy bullets.
const COLOR_PLAYER_PROJECTILE = "#8af0ff";
const COLOR_HP_FULL = "#6ad0ff";
const COLOR_HP_EMPTY = "#2c3550";

/** Which player id the camera follows and the HUD reports for. */
export interface RenderOptions {
  localPlayerId: string;
}

/** Compute a horizontal camera offset (in pixels) that keeps the player centered. */
function cameraX(player: PlayerState | undefined, map: TileMap): number {
  const worldW = map.width * TILE_SIZE;
  if (worldW <= VIEW_WIDTH || !player) return 0;
  const centerTarget = player.pos.x + PLAYER_WIDTH / 2 - VIEW_WIDTH / 2;
  const maxX = worldW - VIEW_WIDTH;
  return Math.max(0, Math.min(maxX, centerTarget));
}

export function render(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  options: RenderOptions,
): void {
  const map = state.map;
  const local = state.players[options.localPlayerId];
  const camX = cameraX(local, map);

  // Background.
  ctx.fillStyle = COLOR_BG;
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

  drawTiles(ctx, map, camX);
  drawExit(ctx, map, camX);
  drawEnemies(ctx, state, camX);
  drawProjectiles(ctx, state, camX);
  drawPlayers(ctx, state, camX);

  drawHud(ctx, local);

  if (state.status !== "playing") {
    drawOverlay(ctx, state.status);
  }
}

/** Only draw tile columns visible in the current camera window. */
function drawTiles(ctx: CanvasRenderingContext2D, map: TileMap, camX: number): void {
  const firstCol = Math.max(0, Math.floor(camX / TILE_SIZE));
  const lastCol = Math.min(
    map.width - 1,
    Math.ceil((camX + VIEW_WIDTH) / TILE_SIZE),
  );

  for (let tx = firstCol; tx <= lastCol; tx++) {
    for (let ty = 0; ty < map.height; ty++) {
      if (!isSolidTile(map, tx, ty)) continue;
      const x = Math.round(tx * TILE_SIZE - camX);
      const y = ty * TILE_SIZE;
      ctx.fillStyle = COLOR_TILE;
      ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
      // Thin top edge gives tiles a readable surface line.
      ctx.fillStyle = COLOR_TILE_EDGE;
      ctx.fillRect(x, y, TILE_SIZE, 3);
    }
  }
}

function drawExit(ctx: CanvasRenderingContext2D, map: TileMap, camX: number): void {
  const x = Math.round(map.exit.tx * TILE_SIZE - camX);
  const y = map.exit.ty * TILE_SIZE;
  ctx.fillStyle = COLOR_EXIT_GLOW;
  ctx.fillRect(x - 6, y - 6, TILE_SIZE + 12, TILE_SIZE + 12);
  ctx.fillStyle = COLOR_EXIT;
  ctx.fillRect(x + 4, y + 2, TILE_SIZE - 8, TILE_SIZE - 2);
  // A doorway notch so the exit reads as a goal, not just a colored tile.
  ctx.fillStyle = COLOR_BG;
  ctx.fillRect(x + 11, y + 10, TILE_SIZE - 22, TILE_SIZE - 10);
}

function drawPlayers(ctx: CanvasRenderingContext2D, state: GameState, camX: number): void {
  for (const id of Object.keys(state.players)) {
    const p = state.players[id];
    if (!p) continue;
    const x = Math.round(p.pos.x - camX);
    const y = Math.round(p.pos.y);

    ctx.fillStyle = p.alive ? COLOR_PLAYER : COLOR_PLAYER_DEAD;
    ctx.fillRect(x, y, PLAYER_WIDTH, PLAYER_HEIGHT);

    if (p.alive) {
      // Facing indicator: an "eye" near the leading edge.
      const eyeW = 5;
      const eyeX = p.facing === "right" ? x + PLAYER_WIDTH - eyeW - 3 : x + 3;
      ctx.fillStyle = COLOR_PLAYER_EYE;
      ctx.fillRect(eyeX, y + 8, eyeW, 6);
    }
  }
}

function drawEnemies(ctx: CanvasRenderingContext2D, state: GameState, camX: number): void {
  for (const e of state.enemies) {
    const x = Math.round(e.pos.x - camX);
    const y = Math.round(e.pos.y);
    ctx.fillStyle = COLOR_ENEMY;
    ctx.fillRect(x, y, ENEMY_WIDTH, ENEMY_HEIGHT);
    // Darker inner square so enemies read as hostile turrets.
    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(x + 8, y + 8, ENEMY_WIDTH - 16, ENEMY_HEIGHT - 16);
  }
}

function drawProjectiles(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  camX: number,
): void {
  for (const pr of state.projectiles) {
    const cx = pr.pos.x + PROJECTILE_SIZE / 2 - camX;
    const cy = pr.pos.y + PROJECTILE_SIZE / 2;
    const fromPlayer = !pr.owner.startsWith("enemy:");
    // Glow halo. Player shots are tinted so they are distinct from enemy bullets.
    ctx.fillStyle = fromPlayer ? COLOR_PLAYER_PROJECTILE : COLOR_PROJECTILE;
    ctx.beginPath();
    ctx.arc(cx, cy, PROJECTILE_SIZE, 0, Math.PI * 2);
    ctx.fill();
    // Bright core for high contrast.
    ctx.fillStyle = COLOR_PROJECTILE_CORE;
    ctx.beginPath();
    ctx.arc(cx, cy, PROJECTILE_SIZE / 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Heads-up display: the local player's hit points as a pip bar. */
function drawHud(ctx: CanvasRenderingContext2D, local: PlayerState | undefined): void {
  const pad = 12;
  const pipW = 18;
  const pipH = 12;
  const gap = 4;
  const hp = local ? Math.max(0, local.hp) : 0;

  ctx.font = "13px ui-monospace, monospace";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#e6e8ef";
  ctx.fillText("HP", pad, pad);

  const barX = pad + 28;
  for (let i = 0; i < PLAYER_MAX_HP; i++) {
    ctx.fillStyle = i < hp ? COLOR_HP_FULL : COLOR_HP_EMPTY;
    ctx.fillRect(barX + i * (pipW + gap), pad, pipW, pipH);
  }
}

/** Full-screen WIN/LOSE banner with restart hint. */
function drawOverlay(ctx: CanvasRenderingContext2D, status: GameState["status"]): void {
  ctx.fillStyle = "rgba(11, 13, 20, 0.72)";
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

  const won = status === "won";
  ctx.fillStyle = won ? COLOR_EXIT : COLOR_ENEMY;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 56px ui-monospace, monospace";
  ctx.fillText(won ? "YOU WIN" : "YOU DIED", VIEW_WIDTH / 2, VIEW_HEIGHT / 2 - 18);

  ctx.fillStyle = "#e6e8ef";
  ctx.font = "18px ui-monospace, monospace";
  ctx.fillText("press R to play a new level", VIEW_WIDTH / 2, VIEW_HEIGHT / 2 + 34);

  // Reset text alignment so later frames (HUD) aren't affected.
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
}
