import assert from "node:assert/strict";
import test, { after } from "node:test";

import { Window } from "happy-dom";

import { importTsModule } from "../importTsModule.mjs";

const moduleGlobals = installWindowGlobals(new Window());
// One bundle: the controller reads the module-singleton scene state, so the
// manifest/state helpers must come from the SAME bundle instance.
const {
  createQuakeMenuController,
  createQuakeMenuSceneManifest,
  quakeMenuSceneFrame,
  getQuakeMenuSceneState,
  updateQuakeMenuSceneState,
} = await importTsModule("test/runtime/menuTestEntry.ts");

after(() => {
  moduleGlobals.restore();
});

/** Landing hotspot geometry, in host px, from the same manifest math the
 *  controller hit-tests with. */
function landingPx(qx, qy) {
  const frame = quakeMenuSceneFrame(window.innerWidth, window.innerHeight);
  return {
    x: frame.x + (qx * frame.w) / 320,
    y: frame.y + (qy * frame.h) / 200,
  };
}

test("main menu background clicks keep the menu open", () => {
  const harness = createMenuHarness();
  try {
    harness.menu.showMainMenu();
    assert.equal(harness.menu.isMainMenuOpen(), true);

    // Far right of the card — no landing hotspot there.
    const point = landingPx(300, 180);
    harness.pointerDown(point.x, point.y);

    assert.equal(harness.menu.isMainMenuOpen(), true);
    assert.equal(getQuakeMenuSceneState().screen, "landing");
    assert.equal(document.body.classList.contains("quake-menu-open"), true);
  } finally {
    harness.restore();
  }
});

test("main menu item clicks activate the row's hotspot", () => {
  const harness = createMenuHarness();
  try {
    harness.menu.showMainMenu();

    // The HELP row: manifest rect y 92..112, x 54..129 (q-units).
    const point = landingPx(80, 102);
    harness.pointerDown(point.x, point.y);

    assert.equal(harness.menu.isMainMenuOpen(), false);
    assert.equal(harness.menu.isMenuPanelOpen(), true);
    assert.equal(getQuakeMenuSceneState().screen, "help");
    assert.equal(document.body.classList.contains("quake-menu-open"), true);
  } finally {
    harness.restore();
  }
});

test("keyboard selection walks the hotspots and Enter activates", () => {
  const harness = createMenuHarness();
  try {
    harness.menu.showMainMenu();
    assert.equal(getQuakeMenuSceneState().activeItem, "single-player");

    harness.key("ArrowDown");
    harness.key("ArrowDown");
    assert.equal(getQuakeMenuSceneState().activeItem, "options");

    harness.key("Enter");
    assert.equal(getQuakeMenuSceneState().screen, "options");

    harness.key("Escape");
    assert.equal(getQuakeMenuSceneState().screen, "landing");
  } finally {
    harness.restore();
  }
});

function createMenuHarness() {
  document.body.replaceChildren();
  document.body.className = "";

  const controls = createControls();
  const host = document.createElement("div");
  host.tabIndex = 0;
  document.body.append(host);

  const menu = createQuakeMenuController({
    enabled: true,
    host,
    controls,
    manifest: createQuakeMenuSceneManifest(),
    isMultiplayerEnabled: () => true,
    isQuitEnabled: () => false,
    clearCrosshairTarget: () => undefined,
    syncCrosshairTarget: () => undefined,
  });

  // The boot "pending" dim blocks pointer activation by design; the route
  // flow clears it once startup settles — simulate that here.
  menu.showMainMenu();
  updateQuakeMenuSceneState({ pending: false, deferred: false });

  return {
    menu,
    pointerDown: (clientX, clientY) => {
      document.body.dispatchEvent(new window.MouseEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX,
        clientY,
      }));
    },
    key: (code) => {
      menu.handleKeyDown(new window.KeyboardEvent("keydown", { code, cancelable: true }));
    },
    restore: () => {
      menu.dispose();
      document.body.replaceChildren();
      document.body.className = "";
    },
  };
}

function createControls() {
  const listeners = new Map([
    ["start", new Set()],
    ["end", new Set()],
  ]);

  return {
    update: () => undefined,
    lock: () => undefined,
    addEventListener: (type, listener) => {
      listeners.get(type)?.add(listener);
    },
    removeEventListener: (type, listener) => {
      listeners.get(type)?.delete(listener);
    },
  };
}

function installWindowGlobals(window) {
  const previous = new Map();
  for (const [name, value] of [
    ["CustomEvent", window.CustomEvent],
    ["document", window.document],
    ["Element", window.Element],
    ["getComputedStyle", window.getComputedStyle.bind(window)],
    ["HTMLAnchorElement", window.HTMLAnchorElement],
    ["HTMLButtonElement", window.HTMLButtonElement],
    ["HTMLElement", window.HTMLElement],
    ["KeyboardEvent", window.KeyboardEvent],
    ["MouseEvent", window.MouseEvent],
    ["Node", window.Node],
    ["window", window],
  ]) {
    previous.set(name, globalThis[name]);
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value,
    });
  }
  return {
    restore: () => {
      window.happyDOM?.abort?.();
      window.close?.();
      for (const [name, value] of previous) restoreGlobal(name, value);
    },
  };
}

function restoreGlobal(name, value) {
  if (value === undefined) {
    delete globalThis[name];
    return;
  }
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value,
  });
}
