/**
 * asciiQuake's ASCII-ONLY glyph policy — the project's hard constraint,
 * enforced in code, not by convention: EVERY character the app can put on
 * screen must be printable ASCII (code point < 0x80). Never Unicode — no
 * block elements, no braille, no box drawing, regardless of how much better
 * they might look. (Atlas COLOUR ENCODING is exempt: its PUA code points
 * encode an (ASCII glyph, palette slot) pair — the glyph SHAPE drawn is
 * still ASCII.)
 *
 * Everything that picks a glyph source funnels through the sanitizers here:
 *  - `sanitizeQuakeGlyphPalette` — `?glyphPalette=`, `?glyphImagePalette=`,
 *    the persisted options-menu choice, and the menu cycle list itself.
 *  - `sanitizeQuakeGlyphSceneMode` — `?glyphSceneMode=`: glyphcss's
 *    "wireframe"/"voxel" modes emit its box-drawing junction set
 *    (│─└┘┌┐├┤┬┴┼) and "ink" renders a fixed oriented set (·‾▔▏▕…), all
 *    non-ASCII, so only "solid" is legal here.
 *  - `sanitizeQuakeGlyphCharMode` — `?glyphCharMode=`: "braille" is Unicode
 *    braille patterns; "halfblock"/"quadrant" are block elements. Only
 *    "ascii" is legal.
 *
 * `test/runtime/asciiGlyphPolicy.test.mjs` is the durable protection: it
 * asserts every selectable palette is all-ASCII, that every non-ASCII
 * glyphcss palette is rejected, and that App.ts actually routes through
 * these sanitizers. Deleting a guard turns that test red.
 */
import { WIREFRAME_PALETTES } from "glyphcss";
import type { QuakeGlyphCharMode, QuakeGlyphSceneMode } from "../render/glyphWorldOverlay";

/** The palette every rejection falls back to — the shipped ASCII default. */
export const QUAKE_ASCII_FALLBACK_PALETTE = "detail";

/** Every char of every tier (wireframe thin/normal/core + solid ramp) is < 0x80. */
export function isAsciiOnlyGlyphPalette(name: string): boolean {
  const entry = (WIREFRAME_PALETTES as Record<string, { thin: string[]; normal: string[]; core: string[]; solid: string[] }>)[name];
  // Unknown names are ILLEGAL, not merely unknown: glyphcss resolves them to
  // its "default" palette, whose ramp is non-ASCII.
  if (!entry) return false;
  for (const tier of [entry.thin, entry.normal, entry.core, entry.solid]) {
    for (const glyph of tier) {
      for (const ch of glyph) if (ch.codePointAt(0)! >= 0x80) return false;
    }
  }
  return true;
}

/** Names of every glyphcss palette that passes the ASCII-only check. */
export function asciiOnlyGlyphPaletteNames(): string[] {
  return Object.keys(WIREFRAME_PALETTES).filter(isAsciiOnlyGlyphPalette);
}

/**
 * The options-menu glyph-set cycle. ASCII-legal candidates only — and the
 * list is re-filtered through the checker at module init, so an entry that
 * ever turns illegal (a glyphcss ramp edit, a typo'd name) drops out of the
 * menu instead of shipping Unicode.
 */
const QUAKE_GLYPH_PALETTE_MENU_CANDIDATES: readonly { name: string; palette: string }[] = [
  { name: "ASCII", palette: "detail" },
  { name: "Dense", palette: "dense" },
  { name: "Simple", palette: "ascii" },
];

export const QUAKE_ASCII_GLYPH_PALETTES: readonly { name: string; palette: string }[] =
  QUAKE_GLYPH_PALETTE_MENU_CANDIDATES.filter((entry) => isAsciiOnlyGlyphPalette(entry.palette));

/**
 * Gate for every palette selection path. Returns `requested` when it names an
 * all-ASCII glyphcss palette; otherwise logs why and returns the ASCII
 * fallback. `null`/`undefined`/"" mean "nothing requested" and fall back
 * silently.
 */
export function sanitizeQuakeGlyphPalette(requested: string | null | undefined): string {
  if (!requested) return QUAKE_ASCII_FALLBACK_PALETTE;
  if (isAsciiOnlyGlyphPalette(requested)) return requested;
  console.warn(
    `asciiQuake: glyph palette ${JSON.stringify(requested)} rejected - ` +
      `asciiQuake renders printable ASCII only, and that palette is unknown or contains ` +
      `non-ASCII glyphs. Falling back to "${QUAKE_ASCII_FALLBACK_PALETTE}". ` +
      `ASCII-legal palettes: ${asciiOnlyGlyphPaletteNames().join(", ")}.`,
  );
  return QUAKE_ASCII_FALLBACK_PALETTE;
}

/** Gate for `?glyphSceneMode=` — only "solid" renders ASCII-only. */
export function sanitizeQuakeGlyphSceneMode(mode: string | null | undefined): QuakeGlyphSceneMode | undefined {
  if (mode == null || mode === "") return undefined;
  if (mode === "solid") return mode;
  console.warn(
    `asciiQuake: glyphSceneMode ${JSON.stringify(mode)} rejected - wireframe/voxel emit ` +
      `box-drawing junctions and ink emits a non-ASCII oriented set. Using "solid".`,
  );
  return "solid";
}

/** Gate for `?glyphCharMode=` — only "ascii" renders ASCII-only. */
export function sanitizeQuakeGlyphCharMode(mode: string | null | undefined): QuakeGlyphCharMode | undefined {
  if (mode == null || mode === "") return undefined;
  if (mode === "ascii") return mode;
  console.warn(
    `asciiQuake: glyphCharMode ${JSON.stringify(mode)} rejected - braille/halfblock/quadrant ` +
      `are Unicode encodings. Using "ascii".`,
  );
  return "ascii";
}
