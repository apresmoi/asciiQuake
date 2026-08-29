/**
 * Test entry for asciiGlyphPolicy.test.mjs — one bundle so the policy module
 * and the glyphcss data it guards come from the SAME glyphcss instance.
 */
export {
  asciiOnlyGlyphPaletteNames,
  isAsciiOnlyGlyphPalette,
  QUAKE_ASCII_FALLBACK_PALETTE,
  QUAKE_ASCII_GLYPH_PALETTES,
  sanitizeQuakeGlyphCharMode,
  sanitizeQuakeGlyphPalette,
  sanitizeQuakeGlyphSceneMode,
} from "../../src/runtime/app/asciiGlyphPolicy";
export { GLYPH_FONT_ATLAS_ASCII, WIREFRAME_PALETTES } from "glyphcss";
