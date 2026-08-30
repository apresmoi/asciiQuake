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
  QUAKE_INK_ASCII_GLYPH_REMAP,
  remapQuakeInkGlyphsToAscii,
  sanitizeQuakeGlyphCharMode,
  sanitizeQuakeGlyphPalette,
  sanitizeQuakeGlyphSceneMode,
  sanitizeQuakeGlyphUiSceneMode,
  GLYPH_FONT_ATLAS_ASCII,
  WIREFRAME_PALETTES,
  buildRasterizeContext,
  rasterize,
  createGlyphCamera,
  cubePolygons,
  spherePolygons,
  tetrahedronPolygons,
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

test("world scene mode: solid + wireframe survive; voxel/ink/unknown are forced to solid", () => {
  assert.equal(sanitizeQuakeGlyphSceneMode(null), undefined);
  assert.equal(sanitizeQuakeGlyphSceneMode("solid"), "solid");
  // Wireframe is ASCII-legal: with `wireframeJunctions` off (the default,
  // never set in this repo — see the wiring test) every wireframe cell draws
  // from the palette's thin/normal/core tiers, proven by the render-through
  // test below.
  assert.equal(sanitizeQuakeGlyphSceneMode("wireframe"), "wireframe");
  for (const mode of ["voxel", "ink", "bogus"]) {
    const { result, warns } = withCapturedWarn(() => sanitizeQuakeGlyphSceneMode(mode));
    assert.equal(result, "solid", `"${mode}" must be forced to solid`);
    assert.equal(warns.length, 1);
  }
});

test("UI scene mode: solid + wireframe + ink survive; voxel/unknown are forced to solid", () => {
  assert.equal(sanitizeQuakeGlyphUiSceneMode(null), undefined);
  assert.equal(sanitizeQuakeGlyphUiSceneMode("solid"), "solid");
  assert.equal(sanitizeQuakeGlyphUiSceneMode("wireframe"), "wireframe");
  // Ink is legal on the UI path ONLY because the UI overlay's transformCells
  // hook remaps ink's non-ASCII oriented glyphs (render-through + wiring
  // tests below prove both halves).
  assert.equal(sanitizeQuakeGlyphUiSceneMode("ink"), "ink");
  for (const mode of ["voxel", "braille", "bogus"]) {
    const { result, warns } = withCapturedWarn(() => sanitizeQuakeGlyphUiSceneMode(mode));
    assert.equal(result, "solid", `"${mode}" must be forced to solid`);
    assert.equal(warns.length, 1);
  }
});

/**
 * Rasterize real geometry through the SAME glyphcss build the app links, at
 * several rotations (to exercise every edge orientation), and return the set
 * of characters drawn. Colourless polygons → plain-text output, no markup.
 */
function renderModeGlyphs(opts) {
  const polygons = [
    ...cubePolygons({ center: [0, 0, 0], size: 2 }),
    ...spherePolygons({ center: [3.2, 0, 0], size: 1.2, subdivisions: 2 }),
    ...tetrahedronPolygons({ center: [-3.2, 0, 0], size: 1.4 }),
  ];
  const chars = new Set();
  for (const [rotX, rotY] of [
    [0, 0], [10, 5], [30, 40], [45, 80], [60, 120], [85, 10], [20, 200], [-30, -40], [75, 300],
  ]) {
    const camera = createGlyphCamera({ rotX, rotY, zoom: 8 });
    const out = rasterize(buildRasterizeContext({
      camera,
      grid: { cols: 120, rows: 60, cellAspect: 0.6 },
      polygons,
      ...opts,
    }));
    // rasterize() emits HTML with colour spans even for colourless geometry —
    // strip exactly the span markup so only CELL GLYPHS are scanned. (No
    // legal palette nor ink's fixed set can produce these exact sequences as
    // consecutive cell glyphs.)
    const text = out.replace(/<span style="[^"]*">/g, "").replace(/<\/span>/g, "");
    for (const ch of text) if (ch !== "\n" && ch !== " ") chars.add(ch);
  }
  return chars;
}

test("render-through: wireframe with junctions off draws ONLY palette-tier glyphs (ASCII)", () => {
  for (const name of asciiOnlyGlyphPaletteNames()) {
    const entry = WIREFRAME_PALETTES[name];
    const tiers = new Set([...entry.thin, ...entry.normal, ...entry.core].flatMap((g) => [...g]));
    const drawn = renderModeGlyphs({ mode: "wireframe", glyphPalette: name });
    assert.ok(drawn.size > 0, `wireframe render with "${name}" drew something`);
    for (const ch of drawn) {
      assert.ok(isAsciiChar(ch), `wireframe/"${name}" drew non-ASCII ${JSON.stringify(ch)}`);
      assert.ok(tiers.has(ch), `wireframe/"${name}" drew ${JSON.stringify(ch)} outside the palette tiers`);
    }
  }
  // Anti-vacuity: the SAME sweep with the junction pass enabled emits
  // box-drawing glyphs — proving the sweep can see the non-ASCII risk the
  // policy excludes, and that its absence above is the option's doing.
  const junctions = renderModeGlyphs({
    mode: "wireframe", glyphPalette: "detail", wireframeJunctions: true,
  });
  assert.ok(
    [...junctions].some((ch) => !isAsciiChar(ch)),
    "wireframeJunctions: true must emit non-ASCII junction glyphs in this sweep",
  );
});

test("render-through: raw ink emits non-ASCII, the remap covers ALL of it, remapped ink is pure ASCII", () => {
  // 1. Raw ink really is illegal (why the world gate rejects it).
  const raw = renderModeGlyphs({ mode: "ink" });
  const nonAscii = [...raw].filter((ch) => !isAsciiChar(ch));
  assert.ok(nonAscii.length > 0, "raw ink must emit non-ASCII glyphs (else loosen the policy)");
  // 2. Every non-ASCII glyph ink actually emitted is a remap key, and every
  //    remap value is printable ASCII. A NEW ink glyph in a glyphcss upgrade
  //    lands here as a failure instead of shipping Unicode.
  for (const ch of nonAscii) {
    assert.ok(
      ch in QUAKE_INK_ASCII_GLYPH_REMAP,
      `ink glyph ${JSON.stringify(ch)} (U+${ch.codePointAt(0).toString(16).toUpperCase()}) has no ASCII remap`,
    );
  }
  for (const [from, to] of Object.entries(QUAKE_INK_ASCII_GLYPH_REMAP)) {
    assert.ok(!isAsciiChar(from), `remap key ${JSON.stringify(from)} should be non-ASCII`);
    assert.ok([...to].every(isAsciiChar), `remap value ${JSON.stringify(to)} must be ASCII`);
  }
  // 3. The exact hook the UI overlay installs makes the render pure ASCII.
  const remapped = renderModeGlyphs({
    mode: "ink",
    transformCells: (grid) => {
      remapQuakeInkGlyphsToAscii(grid.char);
      return grid;
    },
  });
  assert.ok(remapped.size > 0, "remapped ink render drew something");
  for (const ch of remapped) {
    assert.ok(isAsciiChar(ch), `remapped ink drew non-ASCII ${JSON.stringify(ch)}`);
  }
});

test("overlays uphold the scene-mode guarantees (wiring)", async () => {
  const uiSource = await readFile(
    path.join(projectRoot, "src", "runtime", "render", "glyphUiOverlay.ts"),
    "utf8",
  );
  const worldSource = await readFile(
    path.join(projectRoot, "src", "runtime", "render", "glyphWorldOverlay.ts"),
    "utf8",
  );
  // Wireframe legality rests on the junction pass staying OFF: neither
  // overlay may ever WRITE the option (comments may name it; the option-key
  // form `wireframeJunctions:` is what would enable it).
  for (const [name, src] of [["glyphWorldOverlay.ts", worldSource], ["glyphUiOverlay.ts", uiSource]]) {
    assert.ok(
      !/wireframeJunctions\s*:/.test(src),
      `${name} must never set the wireframeJunctions option`,
    );
  }
  // Ink legality on the UI path rests on the remap running inside the
  // transformCells hook whenever the scene mode is ink.
  assert.ok(
    uiSource.includes('if (sceneMode === "ink") remapQuakeInkGlyphsToAscii(grid.char);'),
    "glyphUiOverlay.ts must remap ink glyphs to ASCII in its transformCells hook",
  );
  // The world overlay has no such hook — the reason its gate rejects ink.
  assert.ok(
    !worldSource.includes("transformCells"),
    "glyphWorldOverlay.ts grew a transformCells hook - re-adjudicate the ink gate",
  );
  // The lab routes its render-mode selection through the UI gate (startup
  // param + select onchange).
  const labSource = await readFile(path.join(projectRoot, "src", "lab", "main.ts"), "utf8");
  assert.ok(
    labSource.split("sanitizeQuakeGlyphUiSceneMode(").length - 1 >= 2,
    "src/lab/main.ts must sanitize both the ?labSceneMode= param and the select",
  );
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
  // The per-element style table is the SHARED builder (quakeUiMeshStyles.ts),
  // so the glyph lab's "complete first screen" preview can never drift from
  // what the game ships.
  assert.ok(
    source.includes("meshStyles: buildQuakeUiMeshStyles("),
    "App.ts builds its style table through the shared builder",
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
