// Client entry point: single-player local slice.
//
// Wires the deterministic shared simulation core to the browser. It:
//   - generates a level via createInitialState(seed),
//   - runs a FIXED-TIMESTEP loop: requestAnimationFrame delivers variable frame times,
//     an accumulator (see timestep.ts) converts that into whole TICK_DT steps, and the
//     simulation advances exactly at TICK_RATE independent of the render framerate,
//   - renders once per animation frame (snapping to the latest sim state),
//   - restarts with a fresh seed on R, and on win/lose shows an overlay.
//
// Networking is a later feature; the local player uses a single id so the players-map
// shape already matches what the co-op server will populate.

import { TICK_DT, VIEW_HEIGHT, VIEW_WIDTH } from "../shared/constants.js";
import { createInitialState, step } from "../shared/simulation.js";
import type { GameState, InputsById } from "../shared/types.js";
import { getInput, installInput, isRestartKey } from "./input.js";
import { render } from "./renderer.js";
import { advance } from "./timestep.js";

/** Id for the local player. The server will key additional players into the same map. */
const LOCAL_PLAYER_ID = "player:0";

/** Max fixed steps to run per animation frame, capping catch-up (spiral-of-death guard). */
const MAX_STEPS_PER_FRAME = 5;

function newSeed(): number {
  return (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
}

function boot(): void {
  const canvas = document.getElementById("game") as HTMLCanvasElement | null;
  const hud = document.getElementById("hud");
  if (!canvas) {
    throw new Error("missing #game canvas");
  }
  canvas.width = VIEW_WIDTH;
  canvas.height = VIEW_HEIGHT;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("2d context unavailable");
  }

  // The HUD is drawn onto the canvas; clear the placeholder DOM text.
  if (hud) hud.textContent = "";

  installInput(canvas);

  let state: GameState = createInitialState(newSeed());
  let accumulator = 0;
  let lastTime = performance.now();

  // R restarts with a new seed. Listen at the document level so it works any time.
  window.addEventListener("keydown", (e) => {
    if (isRestartKey(e.code)) {
      state = createInitialState(newSeed());
      accumulator = 0;
      lastTime = performance.now();
    }
  });

  function frame(now: number): void {
    const elapsedSeconds = (now - lastTime) / 1000;
    lastTime = now;

    const { steps, accumulator: nextAcc } = advance(
      accumulator,
      elapsedSeconds,
      TICK_DT,
      MAX_STEPS_PER_FRAME,
    );
    accumulator = nextAcc;

    for (let i = 0; i < steps; i++) {
      // Capture input per simulated tick so the sim sees the input tagged with its tick.
      const inputs: InputsById = { [LOCAL_PLAYER_ID]: getInput(state.tick + 1) };
      state = step(state, inputs);
    }

    render(ctx as CanvasRenderingContext2D, state, { localPlayerId: LOCAL_PLAYER_ID });
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
}
