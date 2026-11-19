// A Room owns one authoritative run of the shared deterministic simulation.
//
// It holds a server-side GameState built by the shared core's createInitialState(seed)
// and advances it with the SAME shared step() the client runs, so there is a single
// source of truth and no divergent server fork of the game rules. Each connected
// player contributes one InputState per tick via setInput(); the room collects the
// latest input per player, calls step(state, inputsById), and broadcasts a snapshot.
//
// The fixed-timestep loop (start/stop) uses setInterval at TICK_RATE and is kept thin:
// the pure advance happens in tick(), which the unit test drives directly without any
// timers or real sockets. Players are tracked inside GameState.players keyed by their
// connection id, so adding/removing a player is just reshaping that map, which is
// exactly how the shared sim already models multiplayer.

import { TICK_DT, TICK_RATE } from "../shared/constants.js";
import { createPlayer } from "../shared/entities.js";
import { createInitialState, step } from "../shared/simulation.js";
import type { GameState, InputState, InputsById } from "../shared/types.js";
import type { ServerMessage } from "../shared/protocol.js";

/** A no-input default so a player with nothing pressed this tick still steps cleanly. */
function neutralInput(tick: number): InputState {
  return { left: false, right: false, jump: false, fire: false, tick };
}

/** A client the room can push messages to. The transport (ws) implements this. */
export interface RoomClient {
  readonly id: string;
  send(message: ServerMessage): void;
}

export class Room {
  private state: GameState;
  /** Latest input received from each connected player, applied on the next tick. */
  private readonly pendingInputs = new Map<string, InputState>();
  /** Connected clients to broadcast snapshots to. */
  private readonly clients = new Map<string, RoomClient>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(public readonly seed: number) {
    this.state = createInitialState(seed);
  }

  /** The current authoritative state (read-only use by callers/tests). */
  getState(): GameState {
    return this.state;
  }

  /** Current connected player ids, in a stable order. */
  getPlayerIds(): string[] {
    return Object.keys(this.state.players).sort();
  }

  /**
   * Add a player to the authoritative state at the level spawn. Idempotent per id.
   * Returns the seed so the caller can build a JoinAck. The optional client is
   * registered for snapshot broadcasts; omit it in unit tests that only drive ticks.
   */
  addPlayer(id: string, client?: RoomClient): { playerId: string; seed: number } {
    if (!this.state.players[id]) {
      this.state.players[id] = createPlayer(id, this.state.map.spawn);
    }
    if (client) this.clients.set(id, client);
    return { playerId: id, seed: this.seed };
  }

  /** Remove a player from the authoritative state and stop tracking its input. */
  removePlayer(id: string): void {
    delete this.state.players[id];
    this.pendingInputs.delete(id);
    this.clients.delete(id);
  }

  /** Record a player's input for the next tick. Ignored if the player is unknown. */
  setInput(id: string, input: InputState): void {
    if (!this.state.players[id]) return;
    this.pendingInputs.set(id, input);
  }

  /**
   * Advance the simulation exactly one tick using the collected per-player inputs,
   * then clear them so an absent input next tick reads as neutral. Returns the new
   * state. This is the pure core of the loop and is what the unit test exercises.
   */
  tick(): GameState {
    const inputs: InputsById = {};
    for (const id of Object.keys(this.state.players)) {
      inputs[id] = this.pendingInputs.get(id) ?? neutralInput(this.state.tick + 1);
    }
    this.state = step(this.state, inputs);
    this.pendingInputs.clear();
    return this.state;
  }

  /** Build the snapshot message for the current tick. */
  snapshot(): ServerMessage {
    return { type: "snapshot", tick: this.state.tick, state: this.state };
  }

  /** Send the current snapshot to every connected client. */
  broadcast(): void {
    const message = this.snapshot();
    for (const client of this.clients.values()) {
      client.send(message);
    }
  }

  /** Start the authoritative fixed-timestep loop (tick then broadcast at TICK_RATE). */
  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => {
      this.tick();
      this.broadcast();
    }, TICK_DT * 1000);
    // Don't keep the Node process alive solely for an idle room loop.
    if (typeof this.timer === "object" && this.timer && "unref" in this.timer) {
      (this.timer as { unref: () => void }).unref();
    }
  }

  /** Stop the loop. Safe to call when not running. */
  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export { TICK_RATE };
