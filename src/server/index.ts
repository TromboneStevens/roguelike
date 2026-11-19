// Server entrypoint (placeholder scaffold).
//
// Later features add: the authoritative fixed-timestep simulation loop, room/lobby
// management, and the ws transport that syncs clients. For now this serves the built
// client from dist/client over plain HTTP so `npm start` launches a playable page,
// and it stands up a WebSocket server to prove the ws dependency links in the bundle.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.PORT ?? 8080);

// When bundled to dist/server/index.js, the client assets live at ../client.
const clientDir = resolve(fileURLToPath(import.meta.url), "..", "..", "client");

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const httpServer = createServer(async (req, res) => {
  const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
  const relative = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");

  // Resolve inside clientDir and reject path traversal.
  const target = normalize(join(clientDir, relative));
  if (!target.startsWith(clientDir)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const body = await readFile(target);
    const type = CONTENT_TYPES[extname(target)] ?? "application/octet-stream";
    res.writeHead(200, { "Content-Type": type }).end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not Found");
  }
});

// WebSocket groundwork for phase 2 co-op. Echoes for now; the authoritative loop
// and room routing land in later features.
const wss = new WebSocketServer({ server: httpServer });
wss.on("connection", (socket) => {
  socket.send(JSON.stringify({ type: "hello" }));
  socket.on("message", (data) => socket.send(data));
});

httpServer.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});
