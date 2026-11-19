// Optional WebSocket client for server-authoritative play.
//
// This is OPT-IN. The default v1 slice runs fully local (see main.ts) with no server
// dependency, so the game is playable even when this module is never used. When a
// caller does connect, the flow is deliberately thin for v1:
//   - open a WebSocket to the server,
//   - on JoinAck, record the assigned player id + seed,
//   - send {type:"input"} each tick,
//   - render the authoritative {type:"snapshot"} the server broadcasts.
// Client-side prediction and reconciliation are phase 2; here a connected client is a
// pure thin client that displays server state. It uses the browser-native WebSocket
// global, so nothing Node-specific leaks into the client bundle.

import type { InputState } from "../shared/types.js";
import type { ServerMessage } from "../shared/protocol.js";
import { parseServerMessage } from "../shared/protocol.js";

export interface NetHandlers {
  /** Called once when the server assigns this client a player id + room seed. */
  onJoinAck?(playerId: string, seed: number): void;
  /** Called for every authoritative snapshot the server broadcasts. */
  onSnapshot?(message: Extract<ServerMessage, { type: "snapshot" }>): void;
  /** Called when the socket opens. */
  onOpen?(): void;
  /** Called when the socket closes or errors; `ok` is false on error. */
  onClose?(ok: boolean): void;
}

export class NetClient {
  private socket: WebSocket | null = null;
  private playerId: string | null = null;
  private seed: number | null = null;

  constructor(
    private readonly url: string,
    private readonly handlers: NetHandlers = {},
  ) {}

  /** Open the connection. Safe to call once; no automatic reconnect in v1. */
  connect(): void {
    if (this.socket) return;
    const socket = new WebSocket(this.url);
    this.socket = socket;

    socket.addEventListener("open", () => this.handlers.onOpen?.());

    socket.addEventListener("message", (event: MessageEvent) => {
      if (typeof event.data !== "string") return;
      const message = parseServerMessage(event.data);
      if (!message) return;
      if (message.type === "joinAck") {
        this.playerId = message.playerId;
        this.seed = message.seed;
        this.handlers.onJoinAck?.(message.playerId, message.seed);
      } else if (message.type === "snapshot") {
        this.handlers.onSnapshot?.(message);
      }
    });

    socket.addEventListener("close", () => this.handlers.onClose?.(true));
    socket.addEventListener("error", () => this.handlers.onClose?.(false));
  }

  /** True once the socket is open and ready to send. */
  get connected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  /** The player id the server assigned, or null before JoinAck. */
  get assignedPlayerId(): string | null {
    return this.playerId;
  }

  /** The room seed the server reported, or null before JoinAck. */
  get roomSeed(): number | null {
    return this.seed;
  }

  /** Send this client's input for a tick. No-op until the socket is open. */
  sendInput(input: InputState): void {
    if (!this.connected || !this.socket) return;
    this.socket.send(JSON.stringify({ type: "input", input }));
  }

  /** Close the connection. */
  close(): void {
    this.socket?.close();
    this.socket = null;
  }
}
