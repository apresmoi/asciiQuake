import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "../importTsModule.mjs";

const {
  resolveQuakeGlyphWeaponCameraBackoffPx,
} = await importTsModule("src/runtime/render/glyphWorldOverlay.ts");
const { quakeGlyphWeaponModelTrim } = await importTsModule("src/runtime/viewmodel.ts");

test("migrated axe and shotgun use the CSS eye plane without changing later guns", () => {
  const axe = quakeGlyphWeaponModelTrim("progs/v_axe.mdl").cameraBackoffPx;
  const shotgun = quakeGlyphWeaponModelTrim("progs/v_shot.mdl").cameraBackoffPx;
  assert.equal(axe, 0);
  assert.equal(shotgun, 0);
  assert.equal(quakeGlyphWeaponModelTrim("progs/v_shot2.mdl").cameraBackoffPx, 310);
});

test("glyph weapon camera standoff precedence is override, model, default", () => {
  assert.equal(resolveQuakeGlyphWeaponCameraBackoffPx(96, 470), 96);
  assert.equal(resolveQuakeGlyphWeaponCameraBackoffPx(undefined, 470), 470);
  assert.equal(resolveQuakeGlyphWeaponCameraBackoffPx(undefined, null), 310);
});

test("migrated axe and shotgun use the CSS basis without glyph-only trims", () => {
  const axe = quakeGlyphWeaponModelTrim("progs/v_axe.mdl");
  const shotgun = quakeGlyphWeaponModelTrim("progs/v_shot.mdl");
  assert.deepEqual(axe.screenTrim, [0, 0]);
  assert.equal(axe.basis, "css");
  assert.deepEqual(axe.eulerSign, [1, 1]);
  assert.deepEqual(shotgun.axisTrim, [1, 1]);
  assert.deepEqual(shotgun.screenTrim, [0, 0]);
  assert.equal(shotgun.basis, "css");
  assert.deepEqual(shotgun.eulerSign, [1, 1]);
  assert.equal(quakeGlyphWeaponModelTrim("progs/v_shot2.mdl").basis, "legacy");
});
