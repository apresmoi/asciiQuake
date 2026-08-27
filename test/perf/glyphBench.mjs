#!/usr/bin/env node
/**
 * Glyph render benchmark — cost AND fidelity, on a recorded human play session.
 *
 * Why this exists: every "optimization" to an ASCII renderer can be faked by
 * rendering less. So this reports two things that must move independently — a
 * cost number that should go DOWN, and a fidelity digest that must NOT change.
 * A run whose digest differs from the baseline is a rendering change, not an
 * optimization, no matter what happened to the frame time.
 *
 * The camera path (`fixtures/playPath.json`) is a real recorded session through
 * e1m1 — 1547 samples, ~18k Quake units, including the lower level. Synthetic
 * "walk forward" paths do not reproduce the PVS churn that dominates cost.
 *
 * FIDELITY DIGEST: the replay pauses at fixed waypoints along the path, lets the
 * scene settle, and hashes the exact `<pre>` text plus its per-cell colours. Two
 * builds that render the same world produce the same digest.
 *
 * NON-BLANK GUARD: an all-blank grid is fast and worthless. Several measurements
 * during this renderer's history were taken against an accidentally black screen
 * (a Quake-units value passed to a poly-frame API flung the camera outside the
 * map). Every sample asserts a non-blank cell ratio before its numbers count.
 *
 * Usage:
 *   node test/perf/glyphBench.mjs --url http://127.0.0.1:5176 [options]
 *
 *   --url <origin>        dev server origin (required)
 *   --viewport WxH        default 2560x1440
 *   --seconds <n>         measured window, default 15
 *   --speed <n>           replay rate multiplier, default 2.15
 *   --params "a=1&b=2"    extra query params (e.g. glyphCell=12)
 *   --label <name>        label for the output row
 *   --json <file>         write the full result as JSON
 *   --headed              run headed (real GPU; headless software-renders and
 *                         inflates raster ~32x, so headed is the honest default
 *                         for paint/raster questions)
 *   --fidelity-only       capture the digest and skip the timing window
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : (process.argv[i + 1] ?? true);
}
const hasFlag = (name) => process.argv.includes(`--${name}`);

const URL_BASE = arg("url");
if (!URL_BASE) {
  console.error("glyphBench: --url is required (e.g. --url http://127.0.0.1:5176)");
  process.exit(2);
}
const [VW, VH] = String(arg("viewport", "2560x1440")).split("x").map(Number);
const SECONDS = Number(arg("seconds", 15));
const SPEED = Number(arg("speed", 2.15));
const EXTRA = arg("params", "");
const LABEL = arg("label", "run");
const JSON_OUT = arg("json", null);
const HEADED = hasFlag("headed");
const FIDELITY_ONLY = hasFlag("fidelity-only");

/** Fraction of cells that must be non-blank for a sample to count. */
const MIN_NONBLANK_RATIO = 0.2;
/** Waypoint indexes into the path where the fidelity digest is captured. */
const FIDELITY_STOPS = 12;

const { chromium } = await import("playwright");
const fixture = JSON.parse(readFileSync(path.join(HERE, "fixtures/playPath.json"), "utf8"));

const browser = await chromium.launch({
  headless: !HEADED,
  args: HEADED ? ["--disable-frame-rate-limit", "--disable-gpu-vsync"] : [],
});
const page = await browser.newPage({ viewport: { width: VW, height: VH } });
const cdp = await page.context().newCDPSession(page);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e.message)));

const url = `${URL_BASE}/?map=${fixture.map}&view=480,-352,88,0,90,0&renderMode=glyphcss`
  + (EXTRA ? `&${EXTRA}` : "");
await page.goto(url, { waitUntil: "load" });
await page.waitForSelector(".quake-glyph-overlay pre", { timeout: 60000 });
await page.waitForTimeout(7000);

await page.evaluate((samples) => {
  window.__bench = { samples, stageCounts: {} };
  globalThis.__glyphRenderStage = (s) => {
    window.__bench.stageCounts[s] = (window.__bench.stageCounts[s] || 0) + 1;
  };
  // setViewpos takes QUAKE units, matching the recorded path and the `view=` URL
  // param. setPose takes poly-frame units — mixing them silently renders nothing.
  window.__benchSeek = (i) => {
    const s = window.__bench.samples[Math.min(i, window.__bench.samples.length - 1)];
    window.__cssQuakeDebug.setViewpos(s[1], s[2], s[3], s[4], s[5], 0);
  };
  window.__benchGrid = () => {
    const pre = document.querySelector(".quake-glyph-overlay pre");
    if (!pre) return null;
    const text = pre.textContent ?? "";
    const nonBlank = text.replace(/\s/g, "").length;
    // Colour lives in spans OR in the atlas font's PUA code points; both are in
    // textContent+innerHTML, so digest innerHTML to catch a colour-only change.
    return { text, html: pre.innerHTML, cells: text.replace(/\n/g, "").length, nonBlank };
  };
}, fixture.samples);

// ── Fidelity digest ────────────────────────────────────────────────────────
const stops = [];
const n = fixture.samples.length;
for (let k = 0; k < FIDELITY_STOPS; k++) stops.push(Math.floor((k + 0.5) * n / FIDELITY_STOPS));

const domParts = [];
const pixelParts = [];
let minRatio = 1;
for (const idx of stops) {
  await page.evaluate((i) => window.__benchSeek(i), idx);
  // The atlas is a COLR/CPAL webfont: the SAME PUA text paints differently
  // depending on whether the face has finished loading, which made the pixel
  // digest vary run to run on an identical DOM. Wait for fonts, then settle.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400); // let the scene settle on this pose
  const g = await page.evaluate(() => window.__benchGrid());
  if (!g || !g.cells) throw new Error(`glyphBench: no grid at stop ${idx}`);
  const ratio = g.nonBlank / g.cells;
  minRatio = Math.min(minRatio, ratio);
  domParts.push(createHash("sha256").update(g.html).digest("hex").slice(0, 16));
  // NO PIXEL DIGEST — deliberately.
  //
  // A screenshot hash was tried and abandoned: on a byte-identical DOM it
  // produced a different hash on every run, and stayed unstable through all
  // three plausible fixes (narrowing from the whole overlay to the base `<pre>`,
  // awaiting `document.fonts.ready` for the COLR/CPAL atlas face, and hiding the
  // animated per-entity detail layers that a Playwright element screenshot
  // captures because it clips the composited page rather than isolating one
  // element). Identical DOM with differing pixels is GPU rasterization noise, so
  // the digest was measuring the compositor, not the renderer.
  //
  // The DOM digest is the fidelity gate instead: it captures every glyph and
  // every colour the renderer chose, and an identical DOM means an identical
  // paint instruction stream. It is stable run to run — verified repeatedly.
  //
  // COMPARE ACROSS BUILDS IN `spans` MODE (`--params glyphColorEncoding=spans`).
  // Under the default `atlas` encoding a cell is a PUA code point encoding
  // (glyph, palette-slot), and the 30-slot palette is derived by median-cut over
  // the grids the quantizer happens to train on. Any change to HOW MANY renders
  // occur per frame retrains it, permuting slot indices — so two builds that
  // paint identical colours get different atlas digests. Measured exactly this:
  // a change that cut renders/frame from 1.97 to 0.99 showed 85% of atlas cells
  // "differing", yet was byte-identical (0.000%) in spans mode. Gating on the
  // atlas digest would have rejected a correct optimization.
}
const fidelity = createHash("sha256").update(domParts.join("|")).digest("hex").slice(0, 24);

if (minRatio < MIN_NONBLANK_RATIO) {
  console.error(`glyphBench: FAILED non-blank guard — min ratio ${(minRatio * 100).toFixed(1)}%`
    + ` (< ${MIN_NONBLANK_RATIO * 100}%). The camera is probably outside the map; numbers would be meaningless.`);
  await browser.close();
  process.exit(1);
}

// ── Timing window ──────────────────────────────────────────────────────────
let result = { label: LABEL, viewport: `${VW}x${VH}`, params: EXTRA, headed: HEADED, fidelity, minNonBlankRatio: Number(minRatio.toFixed(4)) };

if (!FIDELITY_ONLY) {
  await page.evaluate((speed) => {
    const S = window.__bench.samples, t0 = S[0][0];
    let i = 0;
    const start = performance.now();
    window.__bench.frames = 0;
    const step = () => {
      const now = (performance.now() - start) * speed + t0;
      while (i < S.length - 2 && S[i + 1][0] <= now) i++;
      const a = S[i], b = S[i + 1] || a;
      const span = (b[0] - a[0]) || 1;
      const u = Math.max(0, Math.min(1, (now - a[0]) / span));
      const lerp = (p, q) => p + (q - p) * u;
      window.__cssQuakeDebug.setViewpos(lerp(a[1], b[1]), lerp(a[2], b[2]), lerp(a[3], b[3]),
                                        lerp(a[4], b[4]), lerp(a[5], b[5]), 0);
      window.__bench.frames++;
      if (i < S.length - 2) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, SPEED);

  await page.waitForTimeout(3000); // warm the replay before measuring
  await page.evaluate(() => { window.__bench.frames = 0; window.__bench.stageCounts = {}; });
  await cdp.send("Performance.enable");
  const m0 = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((x) => [x.name, x.value]));
  const wall0 = Date.now();
  await page.waitForTimeout(SECONDS * 1000);
  const wall = (Date.now() - wall0) / 1000;
  const m1 = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((x) => [x.name, x.value]));
  const b = await page.evaluate(() => ({ frames: window.__bench.frames, stages: window.__bench.stageCounts }));

  const guard = await page.evaluate(() => window.__benchGrid());
  if (guard.nonBlank / guard.cells < MIN_NONBLANK_RATIO) {
    console.error("glyphBench: grid went blank during the timing window; discarding.");
    await browser.close();
    process.exit(1);
  }

  const per = (k) => ((m1[k] - m0[k]) * 1000) / b.frames;
  const task = per("TaskDuration"), script = per("ScriptDuration");
  const layout = per("LayoutDuration"), style = per("RecalcStyleDuration");
  result = {
    ...result,
    frames: b.frames,
    fps: Number((b.frames / wall).toFixed(1)),
    msPerFrame: { task: +task.toFixed(3), script: +script.toFixed(3), layout: +layout.toFixed(3),
                  style: +style.toFixed(3), other: +(task - script - layout - style).toFixed(3) },
    // A full render pass starts at base-validate; >1 per frame is discarded work.
    rendersPerFrame: +((b.stages["base-validate"] ?? 0) / b.frames).toFixed(2),
    writesPerFrame: +((b.stages["commit-write"] ?? 0) / b.frames).toFixed(2),
    grid: `${guard.text.split("\n")[0].length}x${guard.text.split("\n").length}`,
    cells: guard.cells,
  };
}
result.pageErrors = errors.slice(0, 5);
await browser.close();

const m = result.msPerFrame ?? {};
console.log(`${String(result.label).padEnd(22)} ${String(result.grid ?? "-").padStart(9)} `
  + `task ${String(m.task ?? "-").padStart(6)}  script ${String(m.script ?? "-").padStart(6)}  `
  + `layout ${String(m.layout ?? "-").padStart(5)}  renders/f ${String(result.rendersPerFrame ?? "-").padStart(5)}  `
  + `fidelity ${result.fidelity}`);
if (errors.length) console.log(`  page errors: ${errors.length} (first: ${errors[0]?.slice(0, 120)})`);
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(result, null, 2));
