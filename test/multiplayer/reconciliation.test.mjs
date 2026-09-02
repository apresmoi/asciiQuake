import assert from "node:assert/strict";
import test from "node:test";

import {
  correctionOptions,
  createPlayer,
  reconciliation,
} from "./harness.mjs";

test("multiplayer correction ignores snapshots that should not move the local player", () => {
  assertDecision(
    reconciliation.decideQuakeMultiplayerLocalCorrection(
      [0, 0, 0],
      createPlayer({ lastInputSequence: 0, origin: [100, 0, 0] }),
      0,
      correctionOptions(),
    ),
    { action: "none", reason: "no-authoritative-input", inputSequence: 0 },
  );
  assertDecision(
    reconciliation.decideQuakeMultiplayerLocalCorrection(
      [0, 0, 0],
      createPlayer({ alive: false, lastInputSequence: 10, origin: [100, 0, 0] }),
      0,
      correctionOptions(),
    ),
    { action: "none", reason: "not-alive", inputSequence: 10 },
  );
  assertDecision(
    reconciliation.decideQuakeMultiplayerLocalCorrection(
      [0, 0, 0],
      createPlayer({ lastInputSequence: 10, origin: [100, 0, 0] }),
      10,
      correctionOptions(),
    ),
    { action: "none", reason: "already-handled", inputSequence: 10 },
  );
  assertDecision(
    reconciliation.decideQuakeMultiplayerLocalCorrection(
      [0, 0, 0],
      createPlayer({ lastInputSequence: 11, origin: [7.99, 0, 0] }),
      10,
      correctionOptions(),
    ),
    { action: "none", reason: "within-threshold", inputSequence: 11 },
  );
});

test("runtime correction bounds visible drift in scaled Quake world units", () => {
  const options = reconciliation.QUAKE_MULTIPLAYER_LOCAL_CORRECTION_OPTIONS;
  assert.equal(options.softCorrectionDistance, 0.16);
  assert.equal(options.hardSnapDistance, 5.12);
  assert.equal(options.maxBlendDistance, 1.28);
  assert.equal(options.blendFraction, 0.5);

  const decision = reconciliation.decideQuakeMultiplayerLocalCorrection(
    [0, 0, 0],
    createPlayer({ lastInputSequence: 11, origin: [3.2, 0, 0] }),
    10,
    options,
  );
  assert.equal(decision.action, "blend");
});

test("multiplayer correction waits for local prediction and its last moving input", () => {
  assertDecision(
    reconciliation.decideQuakeMultiplayerLocalCorrection(
      [0, 0, 0],
      createPlayer({ lastInputSequence: 12, origin: [3.2, 0, 0] }),
      10,
      correctionOptions({ predictionActive: true }),
    ),
    { action: "none", reason: "local-prediction-active", inputSequence: 12 },
  );
  assertDecision(
    reconciliation.decideQuakeMultiplayerLocalCorrection(
      [0, 0, 0],
      createPlayer({ lastInputSequence: 12, origin: [3.2, 0, 0] }),
      10,
      correctionOptions({ minimumAcknowledgedInputSequence: 13 }),
    ),
    { action: "none", reason: "unacknowledged-motion", inputSequence: 12 },
  );
});

test("multiplayer correction blends medium drift and caps blend distance", () => {
  const decision = reconciliation.decideQuakeMultiplayerLocalCorrection(
    [0, 0, 0],
    createPlayer({ lastInputSequence: 12, origin: [20, 0, 0] }),
    11,
    correctionOptions({ blendFraction: 0.5, maxBlendDistance: 6 }),
  );

  assert.equal(decision.action, "blend");
  assert.equal(decision.reason, "drift");
  assert.equal(decision.inputSequence, 12);
  assert.equal(decision.drift, 20);
  assert.deepEqual(decision.authoritativeOrigin, [20, 0, 0]);
  assert.deepEqual(decision.origin, [6, 0, 0]);
});

test("multiplayer correction snaps large drift to the authoritative origin", () => {
  const decision = reconciliation.decideQuakeMultiplayerLocalCorrection(
    [0, 0, 0],
    createPlayer({ lastInputSequence: 13, origin: [32, 4, 0] }),
    12,
    correctionOptions(),
  );

  assert.equal(decision.action, "snap");
  assert.equal(decision.reason, "drift");
  assert.equal(decision.inputSequence, 13);
  assert.deepEqual(decision.origin, [32, 4, 0]);
});

test("multiplayer correction clamps an inverted soft threshold to the hard snap threshold", () => {
  const decision = reconciliation.decideQuakeMultiplayerLocalCorrection(
    [0, 0, 0],
    createPlayer({ lastInputSequence: 14, origin: [6, 0, 0] }),
    13,
    correctionOptions({ hardSnapDistance: 5, softCorrectionDistance: 10 }),
  );

  assert.equal(decision.action, "snap");
  assert.equal(decision.reason, "drift");
  assert.equal(decision.inputSequence, 14);
  assert.deepEqual(decision.origin, [6, 0, 0]);
});

function assertDecision(actual, expected) {
  assert.equal(actual.action, expected.action);
  assert.equal(actual.reason, expected.reason);
  assert.equal(actual.inputSequence, expected.inputSequence);
}
