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
 *  - `sanitizeQuakeGlyphSceneMode` — `?glyphSceneMode=` (world renderer):
 *    "solid" and "wireframe" are legal. Wireframe was verified against
 *    glyphcss 0.1.6: its box-drawing junction set (│─└┘┌┐├┤┬┴┼) is emitted
 *    ONLY by the `wireframeJunctions: true` resolve pass — with the option
 *    off (its default; this repo never sets it, wiring-asserted by the
 *    test) every wireframe cell draws from the palette's thin/normal/core
 *    tiers, which the palette sanitizer already guarantees are ASCII.
 *    "voxel" falls through to the junction-capable path unverified and
 *    stays illegal. "ink" renders a FIXED oriented set (`- _ / \ |` plus
 *    non-ASCII `· ‾ ▔ ▏ ▕`), ignoring the palette entirely — it is legal
 *    only where the render path installs {@link QUAKE_INK_ASCII_GLYPH_REMAP}
 *    (a `transformCells` post-pass). The UI overlay does; the world overlay
 *    has no cell hook (adding one would touch the per-frame hot path), so
 *    ink stays rejected for `?glyphSceneMode=` and is allowed only through
 *    `sanitizeQuakeGlyphUiSceneMode`.
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

/**
 * Ink mode's non-ASCII glyphs → ASCII stand-ins, orientation preserved.
 *
 * glyphcss 0.1.6's ink rasterizer picks every cell from ONE hardcoded
 * oriented set — `- _ / \ |` plus the five keys below — and consults neither
 * the glyph palette nor `wireframeJunctions` (verified in the 0.1.6 bundle;
 * the policy test re-verifies by rendering through the library). Remapping
 * these five therefore makes ink's whole output alphabet printable ASCII.
 * Applied as the FIRST step of a `transformCells` hook wherever ink mode is
 * exposed (the UI overlay); the wiring test asserts that hook exists.
 */
export const QUAKE_INK_ASCII_GLYPH_REMAP: Readonly<Record<string, string>> = Object.freeze({
  "·": ".", // · middle dot (degenerate/zero-direction cell)
  "‾": '"', // ‾ overline (high horizontal)
  "▔": '"', // ▔ upper one-eighth block (high horizontal)
  "▏": "|", // ▏ left one-eighth block (vertical)
  "▕": "|", // ▕ right one-eighth block (vertical)
});

/** In-place ASCII remap of a rasterized cell-glyph array (ink mode). */
export function remapQuakeInkGlyphsToAscii(chars: string[]): void {
  for (let i = 0; i < chars.length; i++) {
    const replacement = QUAKE_INK_ASCII_GLYPH_REMAP[chars[i]!];
    if (replacement !== undefined) chars[i] = replacement;
  }
}

/** The UI overlay's scene modes — the subset with an ASCII guarantee. */
export type QuakeGlyphUiSceneMode = "solid" | "wireframe" | "ink";

/**
 * Gate for `?glyphSceneMode=` (WORLD renderer) — "solid" and "wireframe"
 * render ASCII-only (wireframe: palette tiers only while `wireframeJunctions`
 * stays unset — see the module doc). Ink needs the remap hook the world
 * overlay does not have; voxel is unverified. Both fall back to "solid".
 */
export function sanitizeQuakeGlyphSceneMode(mode: string | null | undefined): QuakeGlyphSceneMode | undefined {
  if (mode == null || mode === "") return undefined;
  if (mode === "solid" || mode === "wireframe") return mode;
  console.warn(
    `asciiQuake: glyphSceneMode ${JSON.stringify(mode)} rejected - voxel emits box-drawing ` +
      `junctions and ink emits a non-ASCII oriented set (no remap hook on the world path). ` +
      `Using "solid". Legal: solid, wireframe.`,
  );
  return "solid";
}

/**
 * Gate for the UI overlay's scene mode (the glyph lab's render-mode select).
 * "ink" is legal HERE because the UI overlay's `transformCells` hook applies
 * {@link QUAKE_INK_ASCII_GLYPH_REMAP} before encoding whenever its scene mode
 * is ink (wiring-asserted by the policy test); "wireframe" for the same
 * junctions-off reason as the world gate. Everything else → "solid".
 */
export function sanitizeQuakeGlyphUiSceneMode(mode: string | null | undefined): QuakeGlyphUiSceneMode | undefined {
  if (mode == null || mode === "") return undefined;
  if (mode === "solid" || mode === "wireframe" || mode === "ink") return mode;
  console.warn(
    `asciiQuake: UI glyphSceneMode ${JSON.stringify(mode)} rejected - only solid, wireframe ` +
      `and ink (ASCII-remapped) are legal. Using "solid".`,
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
