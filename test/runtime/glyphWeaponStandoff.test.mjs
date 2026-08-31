import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "../importTsModule.mjs";

const {
  resolveQuakeGlyphWeaponCameraBackoffPx,
} = await importTsModule("src/runtime/render/glyphWorldOverlay.ts");
const { quakeGlyphWeaponModelTrim } = await importTsModule("src/runtime/viewmodel.ts");

test("glyph weapon camera standoff is a per-model constant", () => {
  const axe = quakeGlyphWeaponModelTrim("progs/v_axe.mdl").cameraBackoffPx;
  const shotgun = quakeGlyphWeaponModelTrim("progs/v_shot.mdl").cameraBackoffPx;
  assert.equal(axe, 470);
  assert.equal(shotgun, 310);
  assert.equal(quakeGlyphWeaponModelTrim("progs/unknown.mdl").cameraBackoffPx, 310);
  assert.notEqual(axe, shotgun);
});

test("glyph weapon camera standoff precedence is override, model, default", () => {
  assert.equal(resolveQuakeGlyphWeaponCameraBackoffPx(96, 470), 96);
  assert.equal(resolveQuakeGlyphWeaponCameraBackoffPx(undefined, 470), 470);
  assert.equal(resolveQuakeGlyphWeaponCameraBackoffPx(undefined, null), 310);
});

test("axe vertical placement and model handedness remain fitted", () => {
  const axe = quakeGlyphWeaponModelTrim("progs/v_axe.mdl");
  const shotgun = quakeGlyphWeaponModelTrim("progs/v_shot.mdl");
  assert.ok(axe.screenTrim[1] < 0);
  assert.ok(Math.abs(axe.screenTrim[1] - -0.0705) < 1e-9);
  assert.deepEqual(axe.eulerSign, [1, 1]);
  assert.deepEqual(shotgun.eulerSign, [-1, -1]);
});
