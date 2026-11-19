import assert from "node:assert/strict";
import { test } from "node:test";
import { createInitialState, step } from "../shared/simulation.js";
import { createPlayer } from "../shared/entities.js";
import type { GameState, InputState, InputsById } from "../shared/types.js";
import { Room } from "./room.js";

const SEED = 1337;

function input(partial: Partial<InputState> = {}): InputState {
  return { left: false, right: false, jump: false, fire: false, tick: 0, ...partial };
}

test("room advances via the shared core and matches a direct step() replay", () => {
  // Two players join the room at the shared spawn.
  const room = new Room(SEED);
  room.addPlayer("player:0");
  room.addPlayer("player:1");

  // Reference state built from the shared core directly, with the same two players
  // added at the same spawn the Room uses (Room.addPlayer calls createPlayer(id, spawn)).
  let reference: GameState = createInitialState(SEED);
  for (const id of ["player:0", "player:1"]) {
    reference.players[id] = createPlayer(id, reference.map.spawn);
  }

  // A scripted per-tick input sequence for both players for several ticks.
  const script: InputsById[] = [
    { "player:0": input({ right: true, tick: 1 }), "player:1": input({ left: true, tick: 1 }) },
    { "player:0": input({ right: true, jump: true, tick: 2 }), "player:1": input({ tick: 2 }) },
    { "player:0": input({ tick: 3 }), "player:1": input({ right: true, tick: 3 }) },
    { "player:0": input({ jump: true, tick: 4 }), "player:1": input({ right: true, jump: true, tick: 4 }) },
    { "player:0": input({ right: true, tick: 5 }), "player:1": input({ right: true, tick: 5 }) },
  ];

  for (const perTick of script) {
    // Feed the room, then tick it.
    for (const id of Object.keys(perTick)) {
      room.setInput(id, perTick[id]!);
    }
    room.tick();
    // Advance the reference the same way.
    reference = step(reference, perTick);
  }

  assert.deepEqual(
    room.getState(),
    reference,
    "server room state must equal a direct shared-core step() of the same seed+inputs",
  );
});

test("room default (neutral) input matches a direct step() with no inputs", () => {
  const room = new Room(SEED);
  room.addPlayer("player:0");

  let reference = createInitialState(SEED);
  // createInitialState already seeds player:0 at spawn, so no extra setup needed.

  for (let i = 0; i < 30; i++) {
    room.tick(); // no setInput -> neutral
    reference = step(reference, {}); // step() substitutes NO_INPUT for missing players
  }

  assert.deepEqual(room.getState(), reference);
});

test("disconnect removes the player from the authoritative state", () => {
  const room = new Room(SEED);
  room.addPlayer("player:0");
  room.addPlayer("player:1");
  assert.deepEqual(room.getPlayerIds(), ["player:0", "player:1"]);
  assert.ok(room.getState().players["player:1"]);

  room.removePlayer("player:1");

  assert.deepEqual(room.getPlayerIds(), ["player:0"]);
  assert.equal(room.getState().players["player:1"], undefined);

  // The sim keeps stepping with the remaining player only.
  room.tick();
  assert.ok(room.getState().players["player:0"]);
});

test("setInput for an unknown player is ignored", () => {
  const room = new Room(SEED);
  room.addPlayer("player:0");
  room.setInput("player:99", input({ right: true }));
  // No throw, and the ghost never appears in state.
  room.tick();
  assert.equal(room.getState().players["player:99"], undefined);
});
