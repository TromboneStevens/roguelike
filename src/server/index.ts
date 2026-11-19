// Server entrypoint: static HTTP for the built client + authoritative ws game loop.
//
// It serves dist/client over plain HTTP (see http.ts) so `npm start` launches a
// playable page at http://localhost:8080, and it stands up a single authoritative
// Room (room.ts) that runs the SHARED deterministic simulation. WebSocket clients join
// the room, receive a JoinAck with their assigned player id + the room seed, stream
// {type:"input"} messages in, and receive {type:"snapshot"} broadcasts each tick.
//
// v1 scope: one shared room, full-state JSON snapshots, no prediction/reconciliation.
// The single-player browser client still runs fully local by default and does not
// depend on this server (see src/client/net.ts); this is the co-op groundwork so
// phase 2 is an extension rather than a rewrite.

import { WebSocketServer, type WebSocket } from "ws";
import { createStaticServer } from "./http.js";
import { Room, type RoomClient } from "./room.js";
import { parseClientMessage } from "../shared/protocol.js";
import type { ServerMessage } from "../shared/protocol.js";

const PORT = Number(process.env.PORT ?? 8080);

/** Seed the room from the environment when provided, else pick one at startup. */
const SEED = Number.isFinite(Number(process.env.SEED))
  ? Number(process.env.SEED) >>> 0
  : (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;

const httpServer = createStaticServer();
const room = new Room(SEED);

// One authoritative loop drives the shared simulation for all connected clients.
room.start();

const wss = new WebSocketServer({ server: httpServer });

let nextConnection = 0;

wss.on("connection", (socket: WebSocket) => {
  const playerId = `player:${nextConnection++}`;

  // Adapter so the room can broadcast without knowing about ws.
  const client: RoomClient = {
    id: playerId,
    send(message: ServerMessage) {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(message));
      }
    },
  };

  const { seed } = room.addPlayer(playerId, client);
  client.send({ type: "joinAck", playerId, seed });
  console.log(`[server] ${playerId} joined (seed ${seed})`);

  socket.on("message", (data) => {
    const message = parseClientMessage(data.toString());
    if (message?.type === "input") {
      room.setInput(playerId, message.input);
    }
  });

  socket.on("close", () => {
    room.removePlayer(playerId);
    console.log(`[server] ${playerId} left`);
  });

  socket.on("error", () => {
    room.removePlayer(playerId);
  });
});

httpServer.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});
