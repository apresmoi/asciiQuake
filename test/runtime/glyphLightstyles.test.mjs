import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "../importTsModule.mjs";

const {
  QUAKE_GLYPH_LIGHTSTYLE_HZ,
  quakeGlyphLightstyleIntensity,
  quakeGlyphLightstyleTick,
} = await importTsModule("src/runtime/render/glyphWorldOverlay.ts");

test("glyph lightstyle clock follows Quake's ten-hertz frame selection", () => {
  assert.equal(QUAKE_GLYPH_LIGHTSTYLE_HZ, 10);
  assert.equal(quakeGlyphLightstyleTick(999, 1000), 0);
  assert.equal(quakeGlyphLightstyleTick(1099.99, 1000), 0);
  assert.equal(quakeGlyphLightstyleTick(1100, 1000), 1);
  assert.equal(quakeGlyphLightstyleTick(1299.99, 1000), 2);
});

test("glyph lightstyles repeat, clamp, and reject invalid intensities safely", () => {
  const frames = [1, 0.48, 0.75];
  assert.equal(quakeGlyphLightstyleIntensity(frames, 0), 1);
  assert.equal(quakeGlyphLightstyleIntensity(frames, 1), 0.48);
  assert.equal(quakeGlyphLightstyleIntensity(frames, 3), 1);
  assert.equal(quakeGlyphLightstyleIntensity([2, -1], 0), 1);
  assert.equal(quakeGlyphLightstyleIntensity([2, -1], 1), 0);
  assert.equal(quakeGlyphLightstyleIntensity([Number.NaN], 0), 1);
  assert.equal(quakeGlyphLightstyleIntensity([], 5), 1);
});
