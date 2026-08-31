import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "../importTsModule.mjs";

const {
  QUAKE_GLYPH_UI_TUNING_KNOBS,
  adaptQuakeUiDensitiesToDisplay,
  readQuakeGlyphTuningValues,
} = await importTsModule("src/runtime/app/glyphTuningSpec.ts");

const {
  QUAKE_CONSOLE_GLYPH,
  QUAKE_CONSOLE_PITCH,
  quakeConsoleTextMetrics,
  quakeNotifyLayout,
} = await importTsModule("src/runtime/render/menuSceneManifest.ts");

const DESKTOP = { hostW: 1600, hostH: 900, dpr: 2 };
const PHONE = { hostW: 390, hostH: 844, dpr: 3 };

function resolved(params = new URLSearchParams()) {
  return readQuakeGlyphTuningValues(QUAKE_GLYPH_UI_TUNING_KNOBS, params);
}

test("density adaptation leaves the 1600x900 DPR-2 tuning display untouched", () => {
  const values = resolved();
  const reference = resolved();
  adaptQuakeUiDensitiesToDisplay(values, new URLSearchParams(), DESKTOP);
  assert.deepEqual(values, reference);
});

test("density adaptation scales phone densities to keep the approved detail-cell device size", () => {
  const values = resolved();
  adaptQuakeUiDensitiesToDisplay(values, new URLSearchParams(), PHONE);
  // Base cell: sqrt(390*844 / (0.606 * 24000)) = 4.757 CSS px * DPR 3 =
  // 14.27 device px -> factor 14.27 / 19.9 = 0.717.
  const factor = (Math.sqrt((390 * 844) / (0.606 * 24_000)) * 3) / 19.9;
  assert.ok(factor > 0.7 && factor < 0.73, `factor ${factor}`);
  assert.ok(Math.abs(values.plaqueDensity - 11.8 * factor) < 1e-9, `plaque ${values.plaqueDensity}`);
  assert.ok(Math.abs(values.titleDensity - 3.34 * factor) < 1e-9, `title ${values.titleDensity}`);
  assert.ok(Math.abs(values.consoleDensity - 4.06 * factor) < 1e-9, `console ${values.consoleDensity}`);
  // The detail cell device size is restored to the approved value:
  // (baseCss / density) * dpr == (9.95 / specDensity) * 2 for every knob.
  const baseCss = Math.sqrt((390 * 844) / (0.606 * 24_000));
  const phonePlaqueCellDevice = (baseCss / values.plaqueDensity) * 3;
  const approvedPlaqueCellDevice = (9.95 / 11.8) * 2;
  assert.ok(Math.abs(phonePlaqueCellDevice - approvedPlaqueCellDevice) < 0.01);
  // Non-density knobs stay put.
  assert.equal(values.ambient, 3.0);
  assert.equal(values.maxCells, 24_000);
});

test("URL-pinned densities are never scaled", () => {
  const params = new URLSearchParams("glyphImagePlaqueDensity=11.8");
  const values = resolved(params);
  adaptQuakeUiDensitiesToDisplay(values, params, PHONE);
  assert.equal(values.plaqueDensity, 11.8);
  assert.ok(values.titleDensity < 3.34, "unpinned knobs still adapt");
});

test("console text metrics keep the shipped 16/18 on desktop and fit 42 columns on phones", () => {
  assert.deepEqual(quakeConsoleTextMetrics(1600), { glyph: QUAKE_CONSOLE_GLYPH, pitch: QUAKE_CONSOLE_PITCH });
  assert.deepEqual(quakeConsoleTextMetrics(844), { glyph: 16, pitch: 18 });
  const phone = quakeConsoleTextMetrics(390);
  assert.ok(phone.glyph < 16, "phone glyph shrinks");
  assert.ok(phone.glyph * 42 <= 390 - 24 + 1e-9, "42 columns fit the phone viewport");
  assert.ok(Math.abs(phone.pitch / phone.glyph - 18 / 16) < 1e-9, "pitch ratio preserved");
});

test("notify/centerprint glyphs keep desktop sizes and shrink with phone widths", () => {
  const desktop = quakeNotifyLayout(1600, 900);
  assert.equal(desktop.notify.h, 24);
  assert.equal(desktop.center.h, 28);
  const phone = quakeNotifyLayout(390, 844);
  assert.ok(Math.abs(phone.notify.h - 24 * (390 / 640)) < 1e-9);
  assert.ok(Math.abs(phone.center.h - 28 * (390 / 640)) < 1e-9);
  // "You got the nailgun" (19 chars) fits the phone width now.
  assert.ok(19 * phone.notify.h <= 390 - phone.notify.x);
});
