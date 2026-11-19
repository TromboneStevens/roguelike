// Wire protocol shared by the client and the authoritative server.
//
// v1 uses plain JSON over a single WebSocket. Messages are discriminated by `type`
// so both ends can narrow on it. The shapes reuse the simulation types verbatim
// (InputState, GameState) so the server runs the SAME shared core the client does and
// no translation layer can drift between them. Prediction/reconciliation metadata
// (acked input tick, etc.) is intentionally left for phase 2; the shapes here are the
// minimum needed to join a room, send inputs, and render authoritative snapshots.

import type { GameState, InputState } from "./types.js";

/** Client -> server: one player's input for a specific tick. */
export interface InputMessage {
  type: "input";
  input: InputState;
}

/**
 * Server -> client, sent once right after a connection joins a room. Tells the client
 * which player id the server assigned it and the seed the room was created from, so a
 * client could (phase 2) spin up a local predicted copy of the same deterministic run.
 */
export interface JoinAckMessage {
  type: "joinAck";
  playerId: string;
  seed: number;
}

/**
 * Server -> client: an authoritative world snapshot. v1 ships the full GameState each
 * send for simplicity; a compact delta encoding is a phase-2 optimization. `tick` is
 * redundant with `state.tick` but kept top-level so a client can cheaply drop stale
 * or out-of-order snapshots without parsing the whole state.
 */
export interface SnapshotMessage {
  type: "snapshot";
  tick: number;
  state: GameState;
}

/** Any message the server may send to a client. */
export type ServerMessage = JoinAckMessage | SnapshotMessage;

/** Any message a client may send to the server. */
export type ClientMessage = InputMessage;

/** Narrowing parse of a raw JSON string into a ClientMessage, or null if invalid. */
export function parseClientMessage(raw: string): ClientMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const msg = value as { type?: unknown; input?: unknown };
  if (msg.type === "input" && isInputState(msg.input)) {
    return { type: "input", input: msg.input };
  }
  return null;
}

/** Narrowing parse of a raw JSON string into a ServerMessage, or null if invalid. */
export function parseServerMessage(raw: string): ServerMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const msg = value as { type?: unknown };
  if (msg.type === "joinAck" || msg.type === "snapshot") {
    return value as ServerMessage;
  }
  return null;
}

/** Shallow structural check that an unknown value is a valid InputState. */
function isInputState(value: unknown): value is InputState {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.left === "boolean" &&
    typeof v.right === "boolean" &&
    typeof v.jump === "boolean" &&
    typeof v.fire === "boolean" &&
    typeof v.tick === "number"
  );
}
