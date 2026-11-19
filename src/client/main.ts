// Client entrypoint (placeholder scaffold).
//
// Later features add: input capture, a render loop, client-side prediction, and the
// WebSocket net layer. For now this verifies the toolchain end to end: the module
// bundles for the browser, grabs the canvas, and draws a single frame confirming the
// simulation constants are shared with the server.

import { VIEW_HEIGHT, VIEW_WIDTH } from "../shared/constants.js";

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

  ctx.fillStyle = "#11141f";
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
  ctx.fillStyle = "#6ad0ff";
  ctx.font = "16px ui-monospace, monospace";
  ctx.fillText("co-op bullet hell roguelike — scaffold ready", 24, 32);

  if (hud) {
    hud.textContent = "booting...";
  }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
}
