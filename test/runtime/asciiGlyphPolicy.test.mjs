/**
 * asciiQuake's ASCII-ONLY constraint, as a test — the durable protection.
 *
 * The project rule is absolute: every glyph SHAPE the app can render must be
 * printable ASCII (< 0x80). (Atlas colour ENCODING is exempt: its PUA code
 * points name an (ASCII glyph, palette slot) pair; the drawn shape is still
 * ASCII.) These tests pin:
 *   1. every palette the app offers (options menu, debug panel) is all-ASCII,
 *   2. the sanitizers reject every non-ASCII/unknown palette, scene mode and
 *      char mode glyphcss would otherwise honour,
 *   3. the "dense" high-floor ramp stays ASCII and high-floor,
 *   4. the ASCII atlas's own glyph set is all-ASCII,
 *   5. App.ts actually ROUTES through the sanitizers (wiring assertions on
 *      the source), so deleting a guard call goes red here — not just
 *      gutting the sanitizer.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { importTsModule } from "../importTsModule.mjs";

const {
  asciiOnlyGlyphPaletteNames,
  isAsciiOnlyGlyphPalette,
  QUAKE_ASCII_FALLBACK_PALETTE,
  QUAKE_ASCII_GLYPH_PALETTES,
  sanitizeQuakeGlyphCharMode,
  sanitizeQuakeGlyphPalette,
  sanitizeQuakeGlyphSceneMode,
  GLYPH_FONT_ATLAS_ASCII,
  WIREFRAME_PALETTES,
} = await importTsModule("test/runtime/asciiGlyphPolicyTestEntry.ts");

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Every char of every tier of a glyphcss palette entry, flattened. */
function paletteGlyphs(name) {
  const entry = WIREFRAME_PALETTES[name];
  assert.ok(entry, `palette ${JSON.stringify(name)} exists in glyphcss`);
  return [...entry.thin, ...entry.normal, ...entry.core, ...entry.solid].flatMap((g) => [...g]);
}

function isAsciiChar(ch) {
  return ch.codePointAt(0) < 0x80;
}

/** Silence + capture the sanitizers' console.warn for rejection tests. */
function withCapturedWarn(fn) {
  const warns = [];
  const original = console.warn;
  console.warn = (...args) => warns.push(args.join(" "));
  try {
    return { result: fn(), warns };
  } finally {
    console.warn = original;
  }
}

test("every palette the app offers is printable ASCII, all tiers", () => {
  assert.ok(QUAKE_ASCII_GLYPH_PALETTES.length >= 2, "menu offers at least detail + dense");
  const names = QUAKE_ASCII_GLYPH_PALETTES.map((e) => e.palette);
  assert.ok(names.includes("detail"), "shipped default 'detail' is offered");
  assert.ok(names.includes("dense"), "the dense high-floor ramp is offered");
  for (const name of names) {
    // Independent re-check against the raw glyph data — not via the checker
    // the list was filtered through.
    for (const ch of paletteGlyphs(name)) {
      assert.ok(
        isAsciiChar(ch),
        `palette "${name}" glyph ${JSON.stringify(ch)} (U+${ch.codePointAt(0).toString(16).toUpperCase()}) is not ASCII`,
      );
    }
  }
});

test("asciiOnlyGlyphPaletteNames agrees with a raw scan of every glyphcss palette", () => {
  const expected = Object.keys(WIREFRAME_PALETTES).filter((name) =>
    paletteGlyphs(name).every(isAsciiChar),
  );
  assert.deepEqual(asciiOnlyGlyphPaletteNames().sort(), expected.sort());
  // The known-non-ASCII palettes really are outside the legal set — guards
  // that this test's own scan isn't vacuous.
  for (const name of ["solid", "blocks", "dots", "lines", "stars", "braille", "runes", "default"]) {
    assert.ok(name in WIREFRAME_PALETTES, `glyphcss still ships "${name}"`);
    assert.equal(isAsciiOnlyGlyphPalette(name), false, `"${name}" must be illegal`);
  }
});

test("sanitizeQuakeGlyphPalette rejects every non-ASCII glyphcss palette and unknown names", () => {
  for (const name of Object.keys(WIREFRAME_PALETTES)) {
    const legal = paletteGlyphs(name).every(isAsciiChar);
    const { result, warns } = withCapturedWarn(() => sanitizeQuakeGlyphPalette(name));
    if (legal) {
      assert.equal(result, name, `ASCII palette "${name}" passes through`);
      assert.equal(warns.length, 0);
    } else {
      assert.equal(result, QUAKE_ASCII_FALLBACK_PALETTE, `non-ASCII palette "${name}" falls back`);
      assert.equal(warns.length, 1, `rejection of "${name}" is logged`);
    }
  }
  // Unknown names are illegal too: glyphcss resolves them to its non-ASCII
  // "default" palette, so passing them through would render Unicode.
  const unknown = withCapturedWarn(() => sanitizeQuakeGlyphPalette("no-such-palette"));
  assert.equal(unknown.result, QUAKE_ASCII_FALLBACK_PALETTE);
  assert.equal(unknown.warns.length, 1);
  // Nothing requested → quiet fallback.
  const empty = withCapturedWarn(() => sanitizeQuakeGlyphPalette(null));
  assert.equal(empty.result, QUAKE_ASCII_FALLBACK_PALETTE);
  assert.equal(empty.warns.length, 0);
  assert.ok(
    paletteGlyphs(QUAKE_ASCII_FALLBACK_PALETTE).every(isAsciiChar),
    "the fallback itself is ASCII",
  );
});

test("scene mode: only 'solid' survives (wireframe/voxel junctions and ink are non-ASCII)", () => {
  assert.equal(sanitizeQuakeGlyphSceneMode(null), undefined);
  assert.equal(sanitizeQuakeGlyphSceneMode("solid"), "solid");
  for (const mode of ["wireframe", "voxel", "ink", "bogus"]) {
    const { result, warns } = withCapturedWarn(() => sanitizeQuakeGlyphSceneMode(mode));
    assert.equal(result, "solid", `"${mode}" must be forced to solid`);
    assert.equal(warns.length, 1);
  }
});

test("char mode: only 'ascii' survives (braille/halfblock/quadrant are Unicode)", () => {
  assert.equal(sanitizeQuakeGlyphCharMode(null), undefined);
  assert.equal(sanitizeQuakeGlyphCharMode("ascii"), "ascii");
  for (const mode of ["braille", "halfblock", "quadrant", "bogus"]) {
    const { result, warns } = withCapturedWarn(() => sanitizeQuakeGlyphCharMode(mode));
    assert.equal(result, "ascii", `"${mode}" must be forced to ascii`);
    assert.equal(warns.length, 1);
  }
});

test("the dense ramp is ASCII, high-floor and a real ramp", () => {
  const dense = WIREFRAME_PALETTES.dense;
  assert.ok(dense, "glyphcss ships the 'dense' palette");
  for (const ch of paletteGlyphs("dense")) assert.ok(isAsciiChar(ch));
  const ramp = dense.solid;
  assert.ok(ramp.length >= 10, "enough steps to shade, not a repeated character");
  assert.equal(new Set(ramp).size, ramp.length, "no duplicate steps");
  assert.ok(!ramp.includes(" "), "high-floor: no blank step");
  // High floor, measured: chars whose alpha-weighted ink coverage in Menlo
  // (the atlas's primary source face, 0.606 cell aspect) is >= ~24% of the
  // cell. If the darkest step leaves this set, the ramp lost the property
  // that every cell keeps enough ink to read as its colour below 2 device px.
  const DENSE_FLOOR_SET = new Set([..."%$EUKH#D80BMN@WQR&O69GAbmdqgp"]);
  for (const ch of ramp) {
    assert.ok(DENSE_FLOOR_SET.has(ch), `ramp step ${JSON.stringify(ch)} is not a dense glyph`);
  }
});

test("the ASCII atlas glyph set is printable ASCII only", () => {
  assert.ok(GLYPH_FONT_ATLAS_ASCII.glyphs.length >= 90, "atlas covers printable ASCII");
  for (const glyph of GLYPH_FONT_ATLAS_ASCII.glyphs) {
    for (const ch of glyph) {
      assert.ok(
        isAsciiChar(ch),
        `atlas glyph ${JSON.stringify(ch)} (U+${ch.codePointAt(0).toString(16).toUpperCase()}) is not ASCII`,
      );
    }
  }
});

test("App.ts routes every glyph source through the sanitizers (wiring)", async () => {
  const source = await readFile(path.join(projectRoot, "src", "App.ts"), "utf8");
  const count = (needle) => source.split(needle).length - 1;
  // World palette (?glyphPalette= + persisted choice) and UI palette
  // (?glyphImagePalette=) both sanitize — resolve + UI init + 2 panel applies.
  assert.ok(count("sanitizeQuakeGlyphPalette(") >= 2, "palette sanitizer is called for both scenes");
  assert.ok(
    source.includes('sanitizeQuakeGlyphSceneMode(quakeStartupUrlParams.get("glyphSceneMode"))'),
    "?glyphSceneMode= is sanitized",
  );
  assert.ok(
    source.includes('sanitizeQuakeGlyphCharMode(quakeStartupUrlParams.get("glyphCharMode"))'),
    "?glyphCharMode= is sanitized",
  );
  assert.ok(
    source.includes("QUAKE_ASCII_GLYPH_PALETTES"),
    "the options-menu cycle list comes from the policy module",
  );
  // No raw (unsanitized) reads of the palette params: every `.get()` of these
  // params must have the sanitizer within a few lines (same expression or the
  // immediately following return) — code comments never name the function, so
  // this only matches real calls.
  // The corner logo's per-mesh ramp (?glyphImageLogoPalette=) reaches the
  // overlay through meshStyles — and must be sanitized like every palette.
  assert.ok(
    source.includes("meshStyles"),
    "the logo's per-mesh palette is wired through the overlay's meshStyles",
  );
  for (const param of ["glyphPalette", "glyphImagePalette", "glyphImageLogoPalette"]) {
    const raw = new RegExp(`\\.get\\("${param}"\\)`, "g");
    const matches = [...source.matchAll(raw)];
    assert.ok(matches.length >= 1, `App.ts reads ?${param}= somewhere`);
    for (const match of matches) {
      const context = source.slice(
        Math.max(0, match.index - 200),
        match.index + match[0].length + 200,
      );
      assert.ok(
        context.includes("sanitizeQuakeGlyphPalette("),
        `unsanitized read of ?${param}= in App.ts near: …${context}…`,
      );
    }
  }
  // The menu cycle list must not re-inline a non-ASCII palette.
  assert.ok(
    !/palette:\s*"(solid|blocks|dots|lines|braille|runes|stars|default|math|arrows|binary|hex)"/.test(source),
    "App.ts must not list a non-ASCII glyphcss palette",
  );
});
