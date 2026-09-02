#!/usr/bin/env node
import {
  collectPageErrors,
  debugMapUrl,
  hasFlag,
  loadChromium,
  optionValue,
  parseCommonBrowserArgs,
  resolveBrowserTarget,
} from "./browserHarnessSupport.mjs";
import { assertAssetState } from "../assets/checkAssetState.mjs";

const DEFAULT_PORT = 5188;
const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_VIEWPORT = "1280x720";
const TEST_VIEW = "-576,192,184,0,90,0";
const TEST_VIEW_FIVE = "-576,192,184,0,90";

if (hasFlag(process.argv.slice(2), "help") || hasFlag(process.argv.slice(2), "h")) {
  printHelp();
  process.exit(0);
}

const args = process.argv.slice(2);
const common = parseCommonBrowserArgs(args, {
  port: DEFAULT_PORT,
  timeoutMs: DEFAULT_TIMEOUT_MS,
  viewport: DEFAULT_VIEWPORT,
});

console.log("Browser URL/API smoke gate");
console.log("validates: public URL map/view links, every world texture atlas, shell ownership, lazy multiplayer form, weapon output, debug roll rejection");
console.log("requires prepared assets: yes, all shareware maps");
console.log("classification: acceptance");
assertAssetState({ requiredMaps: ["start", "e1m1", "e1m2", "e1m3", "e1m4", "e1m5", "e1m6", "e1m7", "e1m8"], requireGlyphGeometry: true });

const server = await resolveBrowserTarget({ ...common, forceDeps: hasFlag(args, "force-deps") });
let browser = null;
try {
  const chromium = await loadChromium();
  browser = await chromium.launch({ headless: !common.headed });
  const page = await browser.newPage({ viewport: common.viewport });
  const textureResponses = [];
  page.on("response", (response) => {
    const pathname = new URL(response.url()).pathname;
    if (pathname.startsWith("/q/t/")) textureResponses.push({ pathname, status: response.status() });
  });
  const pageErrors = collectPageErrors(page, {
    ignoreConsoleError: (text) => text.includes("the server responded with a status of 409 (Conflict)"),
  });

  const cases = [
    { name: "nativeSix", params: { map: "e1m5", view: TEST_VIEW, debug: true }, assert: assertCanonicalView },
    { name: "fivePartRejected", params: { map: "e1m5", view: TEST_VIEW_FIVE, debug: true }, assert: (state) => assertNoView(state, "fivePartRejected") },
    { name: "nonZeroRollRejected", params: { map: "e1m5", view: "-576,192,184,0,90,3", debug: true }, assert: (state) => assertNoView(state, "nonZeroRollRejected") },
    { name: "underscoreRejected", params: { map: "e1m5", view: "-576_192_184_0_90_0", debug: true }, assert: (state) => assertNoView(state, "underscoreRejected") },
    {
      name: "invalidMapWithViewIgnored",
      params: { map: "badmap", view: TEST_VIEW, debug: true },
      assert: (state) => {
        assert(state.mapName === "e1m1", `invalid map should load fallback e1m1, got ${state.mapName}`);
        assert(state.menuOpen === true && state.paused === true, "invalid map should keep menu open");
        assert(new URL(state.href).searchParams.get("map") === "badmap", `invalid map should not publish fake canonical URL: ${state.href}`);
      },
    },
  ];

  for (const testCase of cases) await runRouteCase(page, server.url, testCase, common.timeoutMs);
  await assertWorldTextureAtlases(page, server.url, textureResponses);
  await assertDomShell(page, common.timeoutMs);
  await assertIntermissionBackdrop(page);
  await assertGlyphWeaponsRender(page, common.timeoutMs);
  const debugRoll = await page.evaluate(() => ({
    zeroRoll: window.__cssQuakeDebug?.setViewpos?.(-576, 192, 184, 0, 90, 0),
    nonZeroRoll: window.__cssQuakeDebug?.setViewpos?.(-576, 192, 184, 0, 90, 3),
  }));
  assert(debugRoll.zeroRoll === true, `debug zero roll should succeed: ${JSON.stringify(debugRoll)}`);
  assert(debugRoll.nonZeroRoll === false, `debug non-zero roll should fail: ${JSON.stringify(debugRoll)}`);
  console.log("ok debugRoll");
  if (pageErrors.length) throw new Error(`Page errors:\n${pageErrors.join("\n")}`);
  console.log("Browser URL/API smoke passed.");
} finally {
  await browser?.close();
  await server.close();
}

async function assertWorldTextureAtlases(page, baseUrl, textureResponses) {
  const manifestUrl = new URL("/q/manifest.json", baseUrl).toString();
  const maps = await page.evaluate(async (url) => (await (await fetch(url)).json()).maps, manifestUrl);
  const atlasesLoadedByTheApp = new Set(textureResponses
    .filter((response) => response.status >= 200 && response.status < 300)
    .map((response) => response.pathname));
  let texturedFaceCount = 0;
  for (const map of maps) {
    const sceneUrl = new URL(map.sceneUrl, baseUrl).toString();
    const geometry = await page.evaluate(async (url) => (await (await fetch(url)).json()).glyphGeometry, sceneUrl);
    assert(geometry?.version >= 3, `${map.mapName} glyph geometry must use the textured schema: ${JSON.stringify(geometry?.version)}`);
    assert(typeof geometry.t === "string" && geometry.t.startsWith("/q/t/"), `${map.mapName} must carry one top-level world atlas URL`);
    const textured = geometry.polygons.filter((polygon) => Array.isArray(polygon.u));
    assert(textured.length > 0, `${map.mapName} must carry UV-mapped world polygons`);
    assert(
      textured.every((polygon) => polygon.u.length === polygon.v.length && polygon.t === undefined),
      `${map.mapName} textured polygons must use matching UVs and the shared top-level atlas`,
    );
    if (map.mapName === "e1m1") {
      assert(atlasesLoadedByTheApp.has(geometry.t), `the active map did not load its atlas ${geometry.t}`);
    }
    const atlasStatus = await page.evaluate(async (url) => (await fetch(url)).status, new URL(geometry.t, baseUrl).toString());
    assert(atlasStatus >= 200 && atlasStatus < 300, `${map.mapName} atlas ${geometry.t} returned ${atlasStatus}`);
    texturedFaceCount += textured.length;
  }
  console.log(`ok worldTextureAtlases (${maps.length} maps, ${texturedFaceCount} UV-mapped faces)`);
}

async function assertGlyphWeaponsRender(page, timeoutMs) {
  const viewmodels = [
    ["shotgun", "progs/v_shot.mdl", [0.98, 1]],
    ["axe", "progs/v_axe.mdl", [0.866, 0.972]],
    ["supershotgun", "progs/v_shot2.mdl", [1.149, 1.394]],
    ["nailgun", "progs/v_nail.mdl", [0.907, 0.871]],
    ["supernailgun", "progs/v_nail2.mdl", [0.894, 0.864]],
    ["grenadelauncher", "progs/v_rock.mdl", [0.96, 0.971]],
    ["rocketlauncher", "progs/v_rock2.mdl", [0.87, 0.835]],
    ["lightning", "progs/v_light.mdl", [0.916, 0.922]],
  ];
  const fingerprints = new Set();
  let previousFingerprint = null;
  for (const [weapon, source, screenScale] of viewmodels) {
    const selected = await page.evaluate((nextWeapon) => window.__cssQuakeDebug?.setWeapon?.(nextWeapon), weapon);
    assert(selected === true, `could not select ${weapon}`);
    const renderHandle = await page.waitForFunction(({ expectedWeapon, previousFingerprint, screenScale, source }) => {
      const debug = window.__cssQuakeDebug;
      if (debug?.stats?.().activeWeapon !== expectedWeapon) return false;
      const viewmodel = debug.viewmodel?.();
      const projection = viewmodel?.glyphProjection;
      const outputs = [...document.querySelectorAll("#quake-weapon .glyph-output")];
      const inkOutputs = outputs
        .map((output) => (output.textContent ?? "").replace(/\s/g, ""))
        .filter(Boolean);
      const ink = inkOutputs[0] ?? "";
      if (viewmodel?.source !== source || projection?.basis !== "css" ||
          projection.cameraBackoffPx !== 0 || projection.eulerSign?.[0] !== 1 || projection.eulerSign?.[1] !== 1 ||
          Math.abs((projection.screenScale?.[0] ?? NaN) - screenScale[0]) > 1e-9 ||
          Math.abs((projection.screenScale?.[1] ?? NaN) - screenScale[1]) > 1e-9 ||
          inkOutputs.length !== 1 || ink.length < 100) return false;
      let hash = 2166136261;
      for (const char of ink) {
        hash ^= char.codePointAt(0) ?? 0;
        hash = Math.imul(hash, 16777619);
      }
      const fingerprint = `${ink.length}:${hash >>> 0}`;
      return fingerprint !== previousFingerprint ? { fingerprint, inkCells: ink.length } : false;
    }, { expectedWeapon: weapon, previousFingerprint, screenScale, source }, { timeout: timeoutMs });
    const render = await renderHandle.jsonValue();
    assert(!fingerprints.has(render.fingerprint), `${weapon} should have distinct rendered geometry: ${render.fingerprint}`);
    fingerprints.add(render.fingerprint);
    previousFingerprint = render.fingerprint;
    console.log(`ok glyphWeapon:${weapon} (${render.inkCells} cells)`);
  }
}

async function assertIntermissionBackdrop(page) {
  const state = await page.evaluate(() => {
    const root = document.getElementById("quake-intermission");
    const interfaceLayer = document.getElementById("quake-interface");
    const ui = document.getElementById("quake-glyph-ui-host");
    if (!root || !interfaceLayer || !ui) return null;

    const scrim = document.createElement("div");
    scrim.className = "quake-intermission-scrim";
    root.replaceChildren(scrim);
    root.hidden = false;
    const hadBodyGlyphClass = document.body.classList.contains("quake-glyph-render");
    const hadRootGlyphClass = document.documentElement.classList.contains("quake-glyph-render");
    interfaceLayer.classList.add("quake-intermission-visible");
    const result = {
      scrimBackground: getComputedStyle(scrim).backgroundColor,
      uiBackground: getComputedStyle(ui).backgroundColor,
    };
    document.body.classList.remove("quake-glyph-render");
    document.documentElement.classList.remove("quake-glyph-render");
    result.fallbackScrimBackground = getComputedStyle(scrim).backgroundColor;
    result.fallbackUiBackground = getComputedStyle(ui).backgroundColor;
    if (hadBodyGlyphClass) document.body.classList.add("quake-glyph-render");
    if (hadRootGlyphClass) document.documentElement.classList.add("quake-glyph-render");
    interfaceLayer.classList.remove("quake-intermission-visible");
    result.classAfterClear = interfaceLayer.classList.contains("quake-intermission-visible");
    result.uiBackgroundAfterClear = getComputedStyle(ui).backgroundColor;
    root.replaceChildren();
    root.hidden = true;
    return result;
  });
  assert(state?.scrimBackground === "rgba(0, 0, 0, 0)", `intermission HTML scrim should be transparent: ${JSON.stringify(state)}`);
  assert(state?.uiBackground === "rgba(0, 0, 0, 0.65)", `intermission dimming should sit behind the Glyph UI: ${JSON.stringify(state)}`);
  assert(state?.fallbackScrimBackground === "rgba(0, 0, 0, 0.65)", `non-Glyph intermission should keep its HTML scrim: ${JSON.stringify(state)}`);
  assert(state?.fallbackUiBackground === "rgba(0, 0, 0, 0)", `non-Glyph intermission should not dim the Glyph host: ${JSON.stringify(state)}`);
  assert(state?.classAfterClear === false, `intermission class should be removed on clear: ${JSON.stringify(state)}`);
  assert(state?.uiBackgroundAfterClear === "rgba(0, 0, 0, 0)", `intermission backdrop should clear with its class: ${JSON.stringify(state)}`);
  console.log("ok intermissionBackdrop");
}

async function assertDomShell(page, timeoutMs) {
  const shell = await page.evaluate(() => {
    const wrappers = ["quake-game", "quake-interface", "quake-social"].map((id) => {
      const element = document.getElementById(id);
      const rect = element?.getBoundingClientRect();
      const style = element ? getComputedStyle(element) : null;
      return {
        id,
        parent: element?.parentElement?.id ?? null,
        rect: rect ? [rect.x, rect.y, rect.width, rect.height] : null,
        zIndex: style?.zIndex ?? null,
        transform: style?.transform ?? null,
        isolation: style?.isolation ?? null,
      };
    });
    return {
      wrappers,
      parents: {
        scene: document.getElementById("quake-scene")?.parentElement?.id ?? null,
        world: document.querySelector(".quake-glyph-overlay")?.parentElement?.id ?? null,
        weapon: document.getElementById("quake-weapon")?.parentElement?.id ?? null,
        particles: document.getElementById("quake-impact-particles")?.parentElement?.id ?? null,
        hud: document.getElementById("quake-hud")?.parentElement?.id ?? null,
        ui: document.getElementById("quake-glyph-ui-host")?.parentElement?.id ?? null,
        social: document.querySelector(".btn-github")?.parentElement?.id ?? null,
      },
      multiplayerFormPresent: document.getElementById("quake-multiplayer-controls") !== null,
      viewport: [window.innerWidth, window.innerHeight],
    };
  });
  for (const wrapper of shell.wrappers) {
    assert(wrapper.parent === "quake-app", `${wrapper.id} should be a direct app child: ${JSON.stringify(wrapper)}`);
    assert(wrapper.rect?.every((value, index) => near(value, [0, 0, ...shell.viewport][index])), `${wrapper.id} should fill the viewport: ${JSON.stringify(wrapper)}`);
    assert(wrapper.zIndex === "auto" && wrapper.transform === "none" && wrapper.isolation === "auto", `${wrapper.id} must not create a stacking context: ${JSON.stringify(wrapper)}`);
  }
  assert(JSON.stringify(shell.parents) === JSON.stringify({
    scene: "quake-game",
    world: "quake-game",
    weapon: "quake-game",
    particles: "quake-game",
    hud: "quake-interface",
    ui: "quake-interface",
    social: "quake-social",
  }), `unexpected shell ownership: ${JSON.stringify(shell.parents)}`);
  assert(shell.multiplayerFormPresent === false, "multiplayer form should not exist on the landing screen");

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.waitForSelector("#quake-interface > #quake-multiplayer-controls", { state: "attached", timeout: timeoutMs });
  const controlState = await page.evaluate(() => {
    const controls = [...document.querySelectorAll("#quake-multiplayer-controls > .quake-mp-control")];
    return controls.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        display: getComputedStyle(element).display,
        pointerEvents: getComputedStyle(element).pointerEvents,
        width: rect.width,
        height: rect.height,
      };
    });
  });
  assert(controlState.length === 5, `expected five multiplayer controls: ${JSON.stringify(controlState)}`);
  assert(controlState.every((control) => control.display === "block" && control.pointerEvents === "auto" && control.width > 0 && control.height > 0), `multiplayer controls should be interactive: ${JSON.stringify(controlState)}`);

  await page.locator("#quake-multiplayer-name").fill("Ranger");
  await page.keyboard.press("Escape");
  await page.waitForSelector("#quake-multiplayer-controls", { state: "detached", timeout: timeoutMs });
  await page.keyboard.press("Enter");
  await page.waitForSelector("#quake-multiplayer-name", { state: "attached", timeout: timeoutMs });
  assert(await page.locator("#quake-multiplayer-name").inputValue() === "Ranger", "multiplayer values should survive form remounting");
  await page.keyboard.press("Escape");
  await page.waitForSelector("#quake-multiplayer-controls", { state: "detached", timeout: timeoutMs });
  console.log("ok domShell");
}

function printHelp() {
  console.log(`Usage:
  node test/browser/runBrowserSmoke.mjs [options]

Options:
  --url <url>          Use an already-running cssQuake dev server.
  --port <port>        Port for temporary Vite. Default: ${DEFAULT_PORT}
  --force-deps         Start Vite with --force.
  --headed             Run Chromium headed.
  --viewport <WxH>     Browser viewport. Default: ${DEFAULT_VIEWPORT}
  --timeout-ms <ms>    Per-route readiness timeout. Default: ${DEFAULT_TIMEOUT_MS}`);
}

function routeUrl(baseUrl, params) {
  const url = new URL(debugMapUrl(baseUrl, "", params));
  if (params.view) url.search = url.search.replace(/([?&]view=)[^&]*/, `$1${params.view}`);
  return url.toString();
}

async function waitForState(page, name, timeoutMs) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    try {
      last = await page.evaluate(() => {
        const debug = window.__cssQuakeDebug;
        if (!debug) return { href: window.location.href, hasDebug: false, bodyClass: document.body.className };
        const stats = debug.stats();
        return {
          href: window.location.href,
          hasDebug: true,
          bodyClass: document.body.className,
          loading: stats.loading,
          mapName: stats.mapName,
          origin: stats.origin,
          cameraRotX: stats.cameraRotX,
          cameraRotY: stats.cameraRotY,
          menuOpen: document.body.classList.contains("quake-menu-open"),
          paused: document.body.classList.contains("quake-game-paused"),
          viewUrl: debug.viewUrl(),
        };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/Execution context was destroyed|Cannot find context|Target closed/.test(message)) throw error;
      last = { navigation: "reloading", message };
    }
    if (last.hasDebug && last.loading === false) return last;
    await page.waitForTimeout(250);
  }
  throw new Error(`${name} timed out: ${JSON.stringify(last)}`);
}

async function runRouteCase(page, baseUrl, testCase, timeoutMs) {
  await page.goto(routeUrl(baseUrl, testCase.params), { waitUntil: "domcontentloaded", timeout: timeoutMs });
  const state = await waitForState(page, testCase.name, timeoutMs);
  testCase.assert(state);
  console.log(`ok ${testCase.name}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function near(actual, expected, epsilon = 0.001) {
  return Math.abs(actual - expected) <= epsilon;
}

function assertCanonicalView(state) {
  const url = new URL(state.href);
  const viewUrl = new URL(state.viewUrl);
  assert(url.searchParams.get("map") === "e1m5", `expected canonical map=e1m5, got ${state.href}`);
  assert(url.searchParams.get("view") === TEST_VIEW, `expected canonical view=${TEST_VIEW}, got ${state.href}`);
  assert(viewUrl.searchParams.get("view") === TEST_VIEW, `expected copied view=${TEST_VIEW}, got ${state.viewUrl}`);
  assert(state.mapName === "e1m5", `expected e1m5, got ${state.mapName}`);
  assert(near(state.origin[0], 0) && near(state.origin[1], 0) && near(state.origin[2], 0.92), `unexpected origin ${JSON.stringify(state.origin)}`);
  assert(state.cameraRotX === 90 && state.cameraRotY === 270, `unexpected rotation ${state.cameraRotX}/${state.cameraRotY}`);
}

function assertNoView(state, name) {
  const url = new URL(state.href);
  assert(!url.searchParams.has("view"), `${name} should strip view, got ${state.href}`);
  assert(state.mapName === "e1m5", `${name} expected e1m5, got ${state.mapName}`);
}
