// Keyboard + mouse input capture for the local player.
//
// Listeners fold raw key/mouse events into a small held-key set; getInput() snapshots
// that set into an InputState for the current tick. The simulation consumes InputState
// verbatim (see src/shared/types.ts), so the mapping here is the only place that knows
// which physical keys mean "move left", "jump", etc.
//
// Bindings:
//   left  : ArrowLeft, A
//   right : ArrowRight, D
//   jump  : Space, W, ArrowUp
//   fire  : J, or any mouse button held over the canvas
//
// Arrow keys and Space scroll the page by default; we preventDefault on them so the
// game does not jump the viewport while playing.

import type { InputState } from "../shared/types.js";

const LEFT_KEYS = new Set(["ArrowLeft", "KeyA"]);
const RIGHT_KEYS = new Set(["ArrowRight", "KeyD"]);
const JUMP_KEYS = new Set(["Space", "KeyW", "ArrowUp"]);
const FIRE_KEYS = new Set(["KeyJ"]);

/** Codes we swallow so they don't scroll the page. */
const PREVENT_SCROLL = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Space",
]);

/** Currently-held key codes (event.code values, layout-independent). */
const held = new Set<string>();
/** True while any mouse button is pressed (used as an alternate fire control). */
let mouseFiring = false;

let installed = false;

function onKeyDown(e: KeyboardEvent): void {
  if (PREVENT_SCROLL.has(e.code)) {
    e.preventDefault();
  }
  // Ignore auto-repeat; the held set already reflects the key being down.
  held.add(e.code);
}

function onKeyUp(e: KeyboardEvent): void {
  if (PREVENT_SCROLL.has(e.code)) {
    e.preventDefault();
  }
  held.delete(e.code);
}

function onMouseDown(): void {
  mouseFiring = true;
}

function onMouseUp(): void {
  mouseFiring = false;
}

function onBlur(): void {
  // Dropping focus (alt-tab) would otherwise leave keys stuck "down".
  held.clear();
  mouseFiring = false;
}

/**
 * Attach the event listeners. Idempotent: calling it twice installs once. Pass the
 * canvas so mouse-fire is scoped to the play area; falls back to window otherwise.
 */
export function installInput(canvas?: HTMLElement): void {
  if (installed) return;
  installed = true;

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);

  const mouseTarget: HTMLElement | Window = canvas ?? window;
  mouseTarget.addEventListener("mousedown", onMouseDown as EventListener);
  // Release anywhere so a drag off the canvas still clears the fire state.
  window.addEventListener("mouseup", onMouseUp);
  // Avoid the right-click menu stealing a fire press when bound to the canvas.
  if (canvas) {
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }
}

function anyHeld(codes: Set<string>): boolean {
  for (const code of codes) {
    if (held.has(code)) return true;
  }
  return false;
}

/** Snapshot the current held state into an InputState for the given tick. */
export function getInput(tick: number): InputState {
  return {
    left: anyHeld(LEFT_KEYS),
    right: anyHeld(RIGHT_KEYS),
    jump: anyHeld(JUMP_KEYS),
    fire: anyHeld(FIRE_KEYS) || mouseFiring,
    tick,
  };
}

/** True when the given KeyboardEvent.code should restart the run (R). Helper for main. */
export function isRestartKey(code: string): boolean {
  return code === "KeyR";
}
