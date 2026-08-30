/**
 * Test entry for asciiGlyphPolicy.test.mjs — one bundle so the policy module
 * and the glyphcss data it guards come from the SAME glyphcss instance.
 */
export {
  asciiOnlyGlyphPaletteNames,
  isAsciiOnlyGlyphPalette,
  QUAKE_ASCII_FALLBACK_PALETTE,
  QUAKE_ASCII_GLYPH_PALETTES,
  QUAKE_INK_ASCII_GLYPH_REMAP,
  remapQuakeInkGlyphsToAscii,
  sanitizeQuakeGlyphCharMode,
  sanitizeQuakeGlyphPalette,
  sanitizeQuakeGlyphSceneMode,
  sanitizeQuakeGlyphUiSceneMode,
} from "../../src/runtime/app/asciiGlyphPolicy";
export {
  GLYPH_FONT_ATLAS_ASCII,
  WIREFRAME_PALETTES,
  // Render-through evidence for the scene-mode gates: the tests rasterize
  // real geometry through the SAME glyphcss instance the app links.
  buildRasterizeContext,
  rasterize,
  createGlyphCamera,
  cubePolygons,
  spherePolygons,
  tetrahedronPolygons,
} from "glyphcss";
