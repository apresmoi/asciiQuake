#!/usr/bin/env node
import {
  collectPageErrors,
  loadChromium,
  parseCommonBrowserArgs,
  resolveBrowserTarget,
} from "./browserHarnessSupport.mjs";
import sharp from "sharp";

const common = parseCommonBrowserArgs(process.argv.slice(2), {
  port: 5190,
  timeoutMs: 20_000,
  viewport: "1280x720",
});

console.log("Explosion lab smoke gate");
console.log("validates: real sprite frames, gameplay GlyphCSS entity path, frame selection, playback");
console.log("classification: targeted");

const server = await resolveBrowserTarget(common);
let browser = null;
try {
  const chromium = await loadChromium();
  browser = await chromium.launch({ headless: !common.headed });
  const page = await browser.newPage({ viewport: common.viewport });
  const pageErrors = collectPageErrors(page);
  const response = await page.goto(new URL("/lab/explosion.html", server.url).toString(), {
    waitUntil: "domcontentloaded",
  });
  assert(response?.ok(), `explosion lab returned ${response?.status() ?? "no response"}`);

  const initial = await page.waitForFunction(() => {
    const lab = window.__asciiQuakeExplosionLab;
    const source = document.querySelector("#explosion-source");
    const output = [...document.querySelectorAll("#explosion-glyph-host .glyph-output")]
      .find((candidate) => (candidate.textContent ?? "").trim());
    const stats = lab?.overlay?.__entityTextureStats?.("explosion-lab");
    if (!lab?.ready || !source || !output || !(output.textContent ?? "").trim()) return false;
    return {
      currentFrame: lab.currentFrame,
      frameCount: lab.frameCount,
      sourceWidth: source.width,
      sourceHeight: source.height,
      frameButtons: document.querySelectorAll("[data-explosion-frame]").length,
      texturedPolygons: stats?.texturedPolygonCount,
      texture: stats?.textures?.[0],
      asciiOnly: [...(output.textContent ?? "")].every((character) =>
        character === "\n" || (character.codePointAt(0) ?? 0) < 0x80),
      spans: output.querySelectorAll("span").length,
      domSprites: document.querySelectorAll(".quake-effect-sprite").length,
    };
  }, null, { timeout: common.timeoutMs }).then((handle) => handle.jsonValue());

  assert(initial.frameCount === 6 && initial.frameButtons === 6,
    `lab must expose all six original frames: ${JSON.stringify(initial)}`);
  assert(initial.currentFrame === 0 && initial.sourceWidth === 56 && initial.sourceHeight === 56,
    `lab must start on the uncropped first 56x56 frame: ${JSON.stringify(initial)}`);
  assert(initial.texturedPolygons === 1 && /\/q\/e\/s_explod-.*\.png$/.test(initial.texture),
    `lab must use the game's one-quad textured entity path: ${JSON.stringify(initial)}`);
  assert(initial.asciiOnly && initial.spans > 0 && initial.domSprites === 0,
    `lab output must be literal ASCII with coloured spans and no DOM effect sprite: ${JSON.stringify(initial)}`);
  const glyphScreenshot = await page.locator("#explosion-glyph-host").screenshot();
  const { data: pixels } = await sharp(glyphScreenshot).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let visiblePixels = 0;
  for (let offset = 0; offset < pixels.length; offset += 3) {
    if (Math.max(pixels[offset], pixels[offset + 1], pixels[offset + 2]) > 24) visiblePixels += 1;
  }
  assert(visiblePixels > 200, `lab glyph pane must visibly render the explosion, got ${visiblePixels} lit pixels`);

  await page.click('[data-explosion-frame="2"]');
  await page.waitForFunction(() => window.__asciiQuakeExplosionLab?.currentFrame === 2 &&
    document.querySelector("#explosion-source")?.dataset.frame === "2");

  await page.click("#explosion-play");
  const playingFrame = await page.waitForFunction(() => {
    const lab = window.__asciiQuakeExplosionLab;
    return lab?.playing && lab.currentFrame !== 2 ? lab.currentFrame : false;
  }).then((handle) => handle.jsonValue());
  assert(Number.isInteger(playingFrame), "playback must advance the rendered and source frames together");

  if (pageErrors.length) throw new Error(`Page errors:\n${pageErrors.join("\n")}`);
  console.log("ok explosionLab (six source frames, one textured ASCII quad, visible synchronized playback)");
} finally {
  await browser?.close();
  await server.close();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
