import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "../importTsModule.mjs";

const {
  resolveQuakeGlyphWeaponCameraBackoffPx,
} = await importTsModule("src/runtime/render/glyphWorldOverlay.ts");
const { quakeGlyphWeaponModelTrim } = await importTsModule("src/runtime/viewmodel.ts");

const QUAKE_VIEWMODEL_PATHS = [
  "progs/v_axe.mdl",
  "progs/v_shot.mdl",
  "progs/v_shot2.mdl",
  "progs/v_nail.mdl",
  "progs/v_nail2.mdl",
  "progs/v_rock.mdl",
  "progs/v_rock2.mdl",
  "progs/v_light.mdl",
];

test("every Quake viewmodel uses the CSS eye plane", () => {
  for (const modelPath of QUAKE_VIEWMODEL_PATHS) {
    assert.equal(quakeGlyphWeaponModelTrim(modelPath).cameraBackoffPx, 0, modelPath);
  }
  assert.equal(quakeGlyphWeaponModelTrim("progs/unknown.mdl").cameraBackoffPx, 310);
});

test("glyph weapon camera standoff precedence is override, model, default", () => {
  assert.equal(resolveQuakeGlyphWeaponCameraBackoffPx(96, 470), 96);
  assert.equal(resolveQuakeGlyphWeaponCameraBackoffPx(undefined, 470), 470);
  assert.equal(resolveQuakeGlyphWeaponCameraBackoffPx(undefined, null), 310);
});

test("every Quake viewmodel uses the CSS basis without glyph-only trims", () => {
  for (const modelPath of QUAKE_VIEWMODEL_PATHS) {
    const trim = quakeGlyphWeaponModelTrim(modelPath);
    assert.deepEqual(trim.axisTrim, [1, 1], modelPath);
    assert.deepEqual(trim.screenTrim, [0, 0], modelPath);
    assert.deepEqual(trim.screenScale, [1, 1], modelPath);
    assert.equal(trim.basis, "css", modelPath);
    assert.deepEqual(trim.eulerSign, [1, 1], modelPath);
  }
  assert.equal(quakeGlyphWeaponModelTrim("progs/unknown.mdl").basis, "legacy");
});
