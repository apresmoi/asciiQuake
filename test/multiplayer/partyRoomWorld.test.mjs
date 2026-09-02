import assert from "node:assert/strict";
import test from "node:test";

import {
  cleanupDuelRoom,
  createFakePartyRoom,
  worldEnvelope,
  connectDuelRoom,
  facts,
  helloEnvelope,
  latestConnectionMessage,
  partyRoomModule,
} from "./partyRoomHarness.mjs";
import bundledWorldFacts from "../../src/generated/quakeMultiplayerWorldFacts.json" with { type: "json" };

test("party room accepts a bundled deathmatch changelevel trigger without static asset serving", () => {
  const definition = bundledWorldFacts.e1m1.find((candidate) => candidate.kind === "changelevel");
  assert.ok(definition?.bounds, "expected bundled e1m1 changelevel bounds");
  const origin = definition.bounds.mins.map((value, index) =>
    (value + definition.bounds.maxs[index]) / 2
  );
  const roomKey = {
    mapName: "e1m1",
    assetManifestVersion: 1,
    assetRoot: "/q",
    sceneUrl: "https://quake.example/q/e1m1.deathmatch.json",
  };
  const { room, createConnection } = createFakePartyRoom("bundled-changelevel");
  const deathmatchSpawns = [{
    spawnId: "changelevel-spawn",
    classname: "info_player_deathmatch",
    origin,
    rotX: 90,
    rotY: 0,
  }];
  const partyRoom = new partyRoomModule.default(room, {
    random: () => 0.999999,
    trustedGameplayDefinitions: facts.createQuakeMultiplayerGameplayDefinitions({
      deathmatchSpawns,
      pickupDefinitions: [],
    }),
  });
  const alice = createConnection("alice");
  partyRoom.onConnect(alice);
  partyRoom.onMessage(JSON.stringify(helloEnvelope({
    clientId: "client-a",
    deathmatchSpawns,
    messageId: "bundled-changelevel-hello",
    roomKey,
    sentAt: Date.now(),
  })), alice);
  partyRoom.onMessage(JSON.stringify(worldEnvelope({
    clientId: "client-a",
    intent: {
      intentType: "level-transition",
      entityIndex: definition.entityIndex,
      origin,
    },
    messageId: "bundled-changelevel-intent",
    roomKey,
    sequence: 2,
    sentAt: Date.now(),
  })), alice);

  const transition = alice.messages.find((message) =>
    message.type === "room.event" && message.payload.event.eventType === "level.transition"
  );
  assert.equal(transition?.payload.event.targetMap, "e1m2");
  assert.equal(alice.messages.some((message) => message.type === "room.reject"), false);
});

test("party room target dispatch activates relay chains and target teleporters", () => {
  const triggerDefinition = {
    kind: "trigger",
    entityIndex: 100,
    classname: "trigger_multiple",
    bounds: {
      mins: [-1, -1, 0],
      maxs: [1, 1, 2],
    },
    touchActivates: true,
    useActivates: false,
    shootActivates: false,
    oneShot: false,
    delayMs: 0,
    waitMs: 0,
    targetEntityIndexes: [101, 102],
  };
  const relayDefinition = {
    kind: "trigger",
    entityIndex: 101,
    classname: "trigger_relay",
    touchActivates: false,
    useActivates: true,
    shootActivates: false,
    oneShot: false,
    delayMs: 0,
    waitMs: 0,
    targetEntityIndexes: [103],
  };
  const teleportDefinition = {
    kind: "teleport",
    entityIndex: 102,
    classname: "trigger_teleport",
    touchRequiresActivation: true,
    activationWindowMs: 200,
    destinationEntityIndex: 900,
    destinationOrigin: [8, 0, 1],
    destinationRotX: 90,
    destinationRotY: 180,
  };
  const moverDefinition = {
    kind: "mover",
    entityIndex: 103,
    classname: "func_plat",
    bounds: {
      mins: [2, -1, 0],
      maxs: [3, 1, 2],
    },
    touchActivates: false,
    useActivates: true,
    shootActivates: false,
    speed: 50,
    moveMs: 200,
    delayMs: 0,
    fromOrigin: [0, 0, 0],
    toOrigin: [0, 0, 1],
    targetEntityIndexes: [],
  };
  const { alice, partyRoom } = connectDuelRoom({
    id: "party-target-relay-teleport",
    deathmatchSpawns: [
      {
        spawnId: "spawn-target-a",
        classname: "info_player_deathmatch",
        origin: [0, 0, 1],
        rotX: 90,
        rotY: 0,
      },
      {
        spawnId: "spawn-target-b",
        classname: "info_player_deathmatch",
        origin: [4, 0, 1],
        rotX: 90,
        rotY: 180,
      },
    ],
    roomOptions: {
      trustedWorldDefinitions: [
        triggerDefinition,
        relayDefinition,
        teleportDefinition,
        moverDefinition,
      ],
    },
  });

  partyRoom.onMessage(JSON.stringify(worldEnvelope({
    clientId: "client-a",
    messageId: "world-party-target-relay-teleport",
    sequence: 2,
    worldSequence: 1,
    sentAt: Date.now(),
    intent: {
      entityIndex: triggerDefinition.entityIndex,
      origin: [0, 0, 1],
    },
  })), alice);

  const events = alice.messages
    .filter((message) => message.type === "room.event")
    .map((message) => message.payload.event);
  const sourceTrigger = events.find((event) =>
    event.eventType === "world.trigger" &&
    event.entityIndex === triggerDefinition.entityIndex &&
    event.activation === "touch"
  );
  const sourceTargets = events.find((event) =>
    event.eventType === "world.targets" &&
    event.sourceEntityIndex === triggerDefinition.entityIndex
  );
  const relayTrigger = events.find((event) =>
    event.eventType === "world.trigger" &&
    event.entityIndex === relayDefinition.entityIndex &&
    event.activation === "target"
  );
  const relayTargets = events.find((event) =>
    event.eventType === "world.targets" &&
    event.sourceEntityIndex === relayDefinition.entityIndex
  );
  const teleportUse = events.find((event) =>
    event.eventType === "world.use" &&
    event.entityIndex === teleportDefinition.entityIndex
  );
  const mover = events.find((event) =>
    event.eventType === "world.mover" &&
    event.entityIndex === moverDefinition.entityIndex
  );

  assert.ok(sourceTrigger, "expected source trigger event");
  assert.ok(sourceTargets, "expected source target dispatch event");
  assert.deepEqual(sourceTargets.targetEntityIndexes, [101, 102]);
  assert.ok(relayTrigger, "expected relay trigger event");
  assert.ok(relayTargets, "expected relay target dispatch event");
  assert.deepEqual(relayTargets.targetEntityIndexes, [103]);
  assert.ok(teleportUse, "expected target teleporter activation event");
  assert.ok(mover, "expected chained target mover event");
  assert.equal(mover.classname, "func_plat");
  assert.equal(mover.activation, "target");
  assert.equal(mover.state, "moving-up");
  partyRoom.broadcastSnapshot();
  const snapshotMovers = latestConnectionMessage(alice, "room.snapshot").payload.movers;
  assert.equal(snapshotMovers.length, 1);
  assert.equal(snapshotMovers[0].entityIndex, moverDefinition.entityIndex);
  assert.equal(snapshotMovers[0].state, "moving-up");
  assert.equal(snapshotMovers[0].offset[0], 0);
  assert.equal(snapshotMovers[0].offset[1], 0);
  assert.ok(snapshotMovers[0].offset[2] >= 0 && snapshotMovers[0].offset[2] <= 1);
  assert.equal(alice.messages.some((message) => message.type === "room.reject"), false);
});

test("party room initializes mover collision at its Quake-authored bottom offset", () => {
  const collisionOffsets = [];
  const moverDefinition = {
    kind: "mover",
    entityIndex: 137,
    classname: "func_door",
    bounds: {
      mins: [0.66, 45.46, -5.26],
      maxs: [1.9, 50.54, -3.82],
    },
    touchActivates: true,
    useActivates: true,
    shootActivates: false,
    speed: 100,
    moveMs: 640,
    returnDelayMs: 3_000,
    delayMs: 0,
    fromOrigin: [-9.6, 7.04, -2.56],
    toOrigin: [-9.6, 7.04, -1.28],
    bottomOffset: [0, 0, -1.28],
    topOffset: [0, 0, 0],
    targetEntityIndexes: [],
  };
  const { alice, bob, partyRoom } = connectDuelRoom({
    id: "party-start-open-door-collision",
    roomOptions: {
      trustedWorldDefinitions: [moverDefinition],
      trustedSceneMovement: {
        collisionWorld: {
          setBrushOffset(entityIndex, offset) {
            collisionOffsets.push([entityIndex, [...offset]]);
          },
        },
        playerEyeHeight: 1,
      },
    },
  });
  try {
    assert.deepEqual(collisionOffsets[0], [137, [0, 0, -1.28]]);
  } finally {
    cleanupDuelRoom(partyRoom, alice, bob);
  }
});
