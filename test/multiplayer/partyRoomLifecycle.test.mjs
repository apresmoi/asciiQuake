import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import {
  authority,
  fireEnvelope,
  facts,
  helloEnvelope,
  inputBatchEnvelope,
  inputEnvelope,
  partyRoomModule,
  presenceEnvelope,
  createFakePartyRoom,
  latestConnectionMessage,
  roomEvents,
  connectDuelRoom,
  cleanupDuelRoom,
  cleanupPartyRoomConnections,
} from "./partyRoomHarness.mjs";

test("party room accepts a fifth capped player as a spectator", () => {
  const { room, createConnection } = createFakePartyRoom();
  const RoomClass = partyRoomModule.default;
  const partyRoom = new RoomClass(room);
  assert.equal(partyRoomModule.CSSQUAKE_PARTY_MAX_SPECTATORS_PER_ROOM, 8);

  for (let index = 1; index <= 4; index += 1) {
    const connection = createConnection(`connection-${index}`);
    partyRoom.onConnect(connection);
    partyRoom.onMessage(JSON.stringify(helloEnvelope({
      clientId: `client-${index}`,
      displayName: `Player ${index}`,
      messageId: `hello-${index}`,
      sequence: 1,
      sentAt: Date.now(),
      matchSettings: { maxPlayers: 8 },
    })), connection);
    const snapshot = latestConnectionMessage(connection, "room.snapshot");
    assert.equal(snapshot.payload.match.maxPlayers, 4);
  }

  const spectator = createConnection("connection-5");
  partyRoom.onConnect(spectator);
  partyRoom.onMessage(JSON.stringify(helloEnvelope({
    clientId: "client-5",
    displayName: "Player 5",
    messageId: "hello-5",
    sequence: 1,
    sentAt: Date.now(),
    matchSettings: { maxPlayers: 8 },
  })), spectator);

  const snapshot = latestConnectionMessage(spectator, "room.snapshot");
  assert.equal(snapshot.payload.players.length, 4);
  assert.deepEqual(snapshot.payload.spectators, [{
    clientId: "client-5",
    displayName: "Player 5",
  }]);
  assert.equal(spectator.state.role, "spectator");
  assert.equal(spectator.state.playerId, undefined);
  assert.equal(spectator.messages.filter((message) => message.type === "room.reject").length, 0);
  assert.equal(spectator.closed.length, 0);

  for (let index = 6; index < 6 + partyRoomModule.CSSQUAKE_PARTY_MAX_SPECTATORS_PER_ROOM - 1; index += 1) {
    const extraSpectator = createConnection(`connection-${index}`);
    partyRoom.onConnect(extraSpectator);
    partyRoom.onMessage(JSON.stringify(helloEnvelope({
      clientId: `client-${index}`,
      displayName: `Player ${index}`,
      messageId: `hello-${index}`,
      sequence: 1,
      sentAt: Date.now(),
      matchSettings: { maxPlayers: 8 },
    })), extraSpectator);
    assert.equal(extraSpectator.state.role, "spectator");
    assert.equal(extraSpectator.closed.length, 0);
  }

  const overflow = createConnection("connection-overflow");
  partyRoom.onConnect(overflow);
  partyRoom.onMessage(JSON.stringify(helloEnvelope({
    clientId: "client-overflow",
    displayName: "Overflow",
    messageId: "hello-overflow",
    sequence: 1,
    sentAt: Date.now(),
    matchSettings: { maxPlayers: 8 },
  })), overflow);
  const reject = latestConnectionMessage(overflow, "room.reject");
  assert.equal(reject.payload.code, "room-full");
  assert.equal(reject.payload.recoverable, false);
  assert.deepEqual(overflow.closed.at(-1), { code: 1008, reason: "reject:room-full" });
});

test("party room promotes the oldest spectator when a disconnected player slot expires", () => {
  const { room, createConnection } = createFakePartyRoom("spectator-promotion");
  const RoomClass = partyRoomModule.default;
  const partyRoom = new RoomClass(room);
  const alice = createConnection("alice");
  const bob = createConnection("bob");
  const cara = createConnection("cara");
  try {
    for (const [index, connection] of [alice, bob, cara].entries()) {
      partyRoom.onConnect(connection);
      partyRoom.onMessage(JSON.stringify(helloEnvelope({
        clientId: `client-${index + 1}`,
        color: index === 2 ? "#123456" : undefined,
        displayName: ["Alice", "Bob", "Cara"][index],
        messageId: `promotion-hello-${index + 1}`,
        sequence: 1,
        sentAt: Date.now(),
        matchSettings: { maxPlayers: 2 },
      })), connection);
    }
    assert.equal(cara.state.role, "spectator");

    partyRoom.onClose(bob);
    partyRoom.finalizeDisconnectedPlayer("party:client-2", "test-expired");

    assert.equal(cara.state.role, "player");
    assert.equal(cara.state.playerId, "party:client-3");
    const promoted = latestConnectionMessage(cara, "room.snapshot").payload;
    assert.equal(promoted.players.length, 2);
    assert.equal(promoted.spectators.length, 0);
    assert.equal(promoted.players.find((player) => player.clientId === "client-3")?.color, "#123456");
    assert.ok(roomEvents(cara, "player.joined").some((event) =>
      event.player.clientId === "client-3"
    ));

    partyRoom.onMessage(JSON.stringify(inputEnvelope({
      clientId: "client-3",
      inputSequence: 1,
      messageId: "promoted-input",
      sequence: 2,
      sentAt: Date.now(),
    })), cara);
    assert.deepEqual(
      partyRoom.playerSimulationStates.get("party:client-3")?.pendingInputs.map((input) => input.inputSequence),
      [1],
    );
  } finally {
    cleanupPartyRoomConnections(partyRoom, alice, bob, cara);
  }
});

test("party room automatically restarts a frag-limit intermission", async () => {
  const { alice, bob, partyRoom } = connectDuelRoom({
    id: "automatic-match-restart",
    matchSettings: { fragLimit: 1, restartDelayMs: 20 },
  });
  try {
    partyRoom.applyPlayerDamage({
      attackerPlayerId: "party:client-a",
      victimPlayerId: "party:client-b",
      damage: 150,
      source: "shotgun",
      eventId: "automatic-match-restart-kill",
      now: Date.now(),
    });
    assert.equal(latestConnectionMessage(alice, "room.snapshot").payload.match.status, "intermission");

    await delay(50);

    const snapshot = latestConnectionMessage(alice, "room.snapshot");
    assert.equal(snapshot.payload.match.status, "active");
    assert.deepEqual(snapshot.payload.players.map((player) => ({
      alive: player.alive,
      deaths: player.deaths,
      frags: player.frags,
      health: player.health,
    })), [
      { alive: true, deaths: 0, frags: 0, health: 100 },
      { alive: true, deaths: 0, frags: 0, health: 100 },
    ]);
    assert.ok(roomEvents(alice, "match.notice").some((event) => event.code === "restart"));
  } finally {
    cleanupDuelRoom(partyRoom, alice, bob);
  }
});

test("party room queues ordered input batches into the player simulation state", () => {
  const { room, createConnection } = createFakePartyRoom("input-batch-room");
  const RoomClass = partyRoomModule.default;
  const partyRoom = new RoomClass(room);
  const connection = createConnection("connection-a");
  try {
    partyRoom.onConnect(connection);
    partyRoom.onMessage(JSON.stringify(helloEnvelope({
      messageId: "batch-hello",
      sequence: 1,
      sentAt: Date.now(),
    })), connection);

    partyRoom.onMessage(JSON.stringify(inputBatchEnvelope({
      messageId: "batch-inputs",
      sequence: 2,
      inputSequences: [1, 2, 3],
      sentAt: Date.now(),
    })), connection);

    assert.equal(connection.state.authority.lastIntentSequences.input, 3);
    const simulationState = partyRoom.playerSimulationStates.get("party:client-a");
    assert.ok(simulationState);
    assert.deepEqual(simulationState.pendingInputs.map((input) => input.inputSequence), [1, 2, 3]);
    assert.deepEqual(simulationState.acceptedInputHistory.map((input) => input.inputSequence), [1, 2, 3]);
  } finally {
    cleanupPartyRoomConnections(partyRoom, connection);
  }
});

test("party room accepts fire timestamps near accepted input history", () => {
  const { alice, bob, partyRoom } = connectDuelRoom({ id: "fire-input-history-accept" });
  try {
    const base = Date.now();
    partyRoom.onMessage(JSON.stringify(inputBatchEnvelope({
      clientId: "client-a",
      messageId: "fire-history-inputs",
      sequence: 2,
      sentAt: base,
      inputSequences: [1, 2],
      inputs: [
        { sampledAt: base, rotX: -78, rotY: 0 },
        { sampledAt: base + 50, rotX: -78, rotY: 0 },
      ],
    })), alice);
    partyRoom.onMessage(JSON.stringify(fireEnvelope({
      clientId: "client-a",
      messageId: "fire-history-valid",
      sequence: 3,
      sentAt: base + 60,
      fireSequence: 1,
      fire: {
        firedAt: base + 55,
      },
    })), alice);

    const damage = roomEvents(alice, "player.damaged")
      .find((event) => event.attackerPlayerId === "party:client-a" && event.victimPlayerId === "party:client-b");
    assert.ok(damage, "expected accepted fire timestamp to damage the remote player");
    assert.equal(damage.damage, 24);
    assert.equal(alice.messages.some((message) => message.type === "room.reject"), false);
  } finally {
    cleanupDuelRoom(partyRoom, alice, bob);
  }
});

test("party room rejects fire timestamps outside accepted input history", () => {
  const { alice, bob, partyRoom } = connectDuelRoom({ id: "fire-input-history-reject" });
  try {
    const base = Date.now();
    partyRoom.onMessage(JSON.stringify(inputBatchEnvelope({
      clientId: "client-a",
      messageId: "fire-history-reject-inputs",
      sequence: 2,
      sentAt: base,
      inputSequences: [1, 2],
      inputs: [
        { sampledAt: base, rotX: -78, rotY: 0 },
        { sampledAt: base + 50, rotX: -78, rotY: 0 },
      ],
    })), alice);
    partyRoom.onMessage(JSON.stringify(fireEnvelope({
      clientId: "client-a",
      messageId: "fire-history-too-late",
      sequence: 3,
      sentAt: base + 60,
      fireSequence: 1,
      fire: {
        firedAt: base + 1_000,
      },
    })), alice);

    const reject = latestConnectionMessage(alice, "room.reject");
    assert.equal(reject.payload.code, "stale");
    assert.equal(reject.payload.recoverable, true);
    assert.equal(reject.payload.rejectedMessageId, "fire-history-too-late");
    assert.match(reject.payload.message, /fire-after-input-history/);
    assert.equal(
      roomEvents(alice, "player.damaged")
        .some((event) => event.attackerPlayerId === "party:client-a" && event.victimPlayerId === "party:client-b"),
      false,
    );
  } finally {
    cleanupDuelRoom(partyRoom, alice, bob);
  }
});

test("party room closes a connection after repeated recoverable rejects", () => {
  const { room, createConnection } = createFakePartyRoom();
  const RoomClass = partyRoomModule.default;
  const partyRoom = new RoomClass(room);
  const connection = createConnection("noisy-connection");

  partyRoom.onConnect(connection);
  partyRoom.onMessage(JSON.stringify(helloEnvelope({
    messageId: "hello-noisy",
    sequence: 1,
    sentAt: Date.now(),
  })), connection);

  for (let index = 0; index < partyRoomModule.CSSQUAKE_PARTY_MAX_REJECTS_PER_CONNECTION; index += 1) {
    partyRoom.onMessage(JSON.stringify(inputEnvelope({
      messageId: `stale-input-${index}`,
      sequence: 1,
      inputSequence: 1,
      sentAt: Date.now(),
    })), connection);
  }

  const rejects = connection.messages.filter((message) => message.type === "room.reject");
  assert.equal(rejects.length, partyRoomModule.CSSQUAKE_PARTY_MAX_REJECTS_PER_CONNECTION);
  assert.equal(rejects.at(-1).payload.code, "stale");
  assert.equal(rejects.at(-1).payload.recoverable, true);
  assert.deepEqual(connection.closed.at(-1), { code: 1008, reason: "too-many-rejects" });
});

test("party room keeps hello authority while trusted gameplay definitions are pending", async () => {
  const { room, createConnection } = createFakePartyRoom();
  const RoomClass = partyRoomModule.default;
  let resolveTrustedDefinitions;
  const trustedDefinitions = new Promise((resolve) => {
    resolveTrustedDefinitions = resolve;
  });
  const partyRoom = new RoomClass(room, {
    trustedGameplayDefinitionsFetcher: () => trustedDefinitions,
  });
  const connection = createConnection("pending-hello-connection");

  partyRoom.onConnect(connection);
  const helloResult = partyRoom.onMessage(JSON.stringify(helloEnvelope({
    messageId: "pending-hello",
    sequence: 1,
    sentAt: Date.now(),
  })), connection);
  partyRoom.onMessage(JSON.stringify(presenceEnvelope("active", {
    messageId: "presence-while-hello-pending",
    sequence: 2,
    sentAt: Date.now(),
  })), connection);

  assert.equal(connection.closed.length, 0);
  assert.equal(connection.messages.some((message) =>
    message.type === "room.reject" &&
    message.payload.code === "not-authorized"
  ), false);
  assert.equal(connection.state.authority.lastEnvelopeSequence, 2);

  resolveTrustedDefinitions({
    gameplayFacts: {
      factsVersion: 1,
      factsHash: "0000000000000000",
      deathmatchSpawnCount: 0,
      pickupCount: 0,
    },
    deathmatchSpawns: [],
    pickupDefinitions: [],
  });
  await Promise.resolve(helloResult);

  assert.equal(connection.state.playerId, "party:client-a");
  assert.equal(connection.state.authority.lastEnvelopeSequence, 2);
});

test("party room falls back to hello gameplay facts when implicit trusted asset lookup misses", async () => {
  const { room, createConnection } = createFakePartyRoom("trusted-asset-miss");
  const RoomClass = partyRoomModule.default;
  const assetRequests = [];
  room.context.assets = {
    fetch: async (assetPath) => {
      assetRequests.push(assetPath);
      return new Response("missing", { status: 404 });
    },
  };
  const gameplayDefinitions = facts.createQuakeMultiplayerGameplayDefinitions({
    deathmatchSpawns: [{
      spawnId: "asset-miss-spawn",
      classname: "info_player_deathmatch",
      origin: [0, 0, 0],
      rotX: 90,
      rotY: 0,
    }],
    pickupDefinitions: [],
  });
  const partyRoom = new RoomClass(room);
  const connection = createConnection("asset-miss-connection");

  partyRoom.onConnect(connection);
  const result = partyRoom.onMessage(JSON.stringify(helloEnvelope({
    deathmatchSpawns: gameplayDefinitions.deathmatchSpawns,
    gameplayFacts: gameplayDefinitions.gameplayFacts,
    messageId: "asset-miss-hello",
    pickupDefinitions: gameplayDefinitions.pickupDefinitions,
    sequence: 1,
    sentAt: Date.now(),
  })), connection);
  await Promise.resolve(result);

  assert.deepEqual(assetRequests, ["/q/e1m1.deathmatch.json"]);
  assert.equal(connection.messages.some((message) => message.type === "room.reject"), false);
  assert.equal(connection.state.playerId, "party:client-a");
  const snapshot = latestConnectionMessage(connection, "room.snapshot");
  assert.equal(snapshot.payload.players.length, 1);
});

test("party room loads compact trusted gameplay and collision from its served asset", async () => {
  const assetText = await readFile(
    new URL("../../src/generated/partykit/q/e1m1.deathmatch.json", import.meta.url),
    "utf8",
  );
  const asset = JSON.parse(assetText);
  const { room, createConnection } = createFakePartyRoom("trusted-compact-asset");
  const assetRequests = [];
  room.context.assets = {
    fetch: async (assetPath) => {
      assetRequests.push(assetPath);
      return new Response(assetText, { status: 200 });
    },
  };
  const partyRoom = new partyRoomModule.default(room);
  const connection = createConnection("compact-asset-connection");
  try {
    partyRoom.onConnect(connection);
    const result = partyRoom.onMessage(JSON.stringify(helloEnvelope({
      deathmatchSpawns: asset.gameplayDefinitions.deathmatchSpawns,
      gameplayFacts: asset.gameplayDefinitions.gameplayFacts,
      messageId: "compact-asset-hello",
      pickupDefinitions: asset.gameplayDefinitions.pickupDefinitions,
      sequence: 1,
      sentAt: Date.now(),
    })), connection);
    await Promise.resolve(result);

    assert.deepEqual(assetRequests, ["/q/e1m1.deathmatch.json"]);
    assert.ok(partyRoom.trustedSceneMovement?.collisionWorld);
    assert.equal(partyRoom.trustedSceneMovement?.playerEyeHeight, asset.playerEyeHeight);
    assert.equal(connection.state.playerId, "party:client-a");
    assert.equal(connection.messages.some((message) => message.type === "room.reject"), false);
  } finally {
    cleanupPartyRoomConnections(partyRoom, connection);
  }
});

test("party room rejects hello when explicit trusted gameplay fetcher misses", async () => {
  const { room, createConnection } = createFakePartyRoom("required-trusted-fetcher-miss");
  const RoomClass = partyRoomModule.default;
  const gameplayDefinitions = facts.createQuakeMultiplayerGameplayDefinitions({
    deathmatchSpawns: [{
      spawnId: "required-fetcher-spawn",
      classname: "info_player_deathmatch",
      origin: [0, 0, 0],
      rotX: 90,
      rotY: 0,
    }],
    pickupDefinitions: [],
  });
  const partyRoom = new RoomClass(room, {
    trustedGameplayDefinitionsFetcher: async () => null,
  });
  const connection = createConnection("required-fetcher-connection");

  partyRoom.onConnect(connection);
  const result = partyRoom.onMessage(JSON.stringify(helloEnvelope({
    deathmatchSpawns: gameplayDefinitions.deathmatchSpawns,
    gameplayFacts: gameplayDefinitions.gameplayFacts,
    messageId: "required-fetcher-hello",
    pickupDefinitions: gameplayDefinitions.pickupDefinitions,
    sequence: 1,
    sentAt: Date.now(),
  })), connection);
  await Promise.resolve(result);

  const reject = latestConnectionMessage(connection, "room.reject");
  assert.equal(reject.payload.code, "wrong-map");
  assert.equal(connection.state?.playerId, undefined);
});
