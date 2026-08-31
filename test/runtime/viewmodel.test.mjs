import assert from "node:assert/strict";
import test from "node:test";

import { BASE_TILE, polyCssDistanceToWorld } from "@layoutit/polycss";
import { createGlyphPerspectiveCamera } from "glyphcss";
import { Window } from "happy-dom";

import { importTsModule } from "../importTsModule.mjs";

const {
  createQuakeViewmodelController,
  quakeGlyphWeaponModelLocalPose,
  quakeGlyphWeaponModelScale,
  quakeGlyphWeaponLocalPose,
} = await importTsModule("src/runtime/viewmodel.ts");

test("axe and shotgun use the PolyCSS X/Y basis without changing later guns", () => {
  const geometry = {
    version: 1,
    polygonCount: 1,
    polygons: [{ c: "#fff", v: [[1, 2, 3]] }],
  };
  const tuning = {
    localYOffsetPx: -50,
    localPitchDeg: 90,
    localPivotXPx: 0,
    localPivotYPx: 0,
    localPivotZPx: 0,
  };

  const axe = quakeGlyphWeaponModelLocalPose("progs/v_axe.mdl", geometry, tuning);
  const shotgun = quakeGlyphWeaponModelLocalPose("progs/v_shot.mdl", geometry, tuning);
  const superShotgun = quakeGlyphWeaponModelLocalPose("progs/v_shot2.mdl", geometry, tuning);

  assert.deepEqual(roundedVertex(axe), [-4, 2, 1]);
  assert.deepEqual(roundedVertex(shotgun), [-4, 2, 1]);
  assert.deepEqual(roundedVertex(superShotgun), [1, -4, 2]);
});

test("axe and shotgun scale swap only the PolyCSS X/Y axes", () => {
  assert.deepEqual(quakeGlyphWeaponModelScale("progs/v_axe.mdl", [2, 3, 5], 7), [21, 14, 35]);
  assert.deepEqual(quakeGlyphWeaponModelScale("progs/v_shot.mdl", [2, 3, 5], 7), [21, 14, 35]);
  assert.deepEqual(quakeGlyphWeaponModelScale("progs/v_shot2.mdl", [2, 3, 5], 7), [35, 14, 21]);
});

test("axe vertices project identically through the CSS and glyph basis paths", () => {
  const tuning = {
    localYOffsetPx: -25,
    localPitchDeg: 11,
    localPivotXPx: 0,
    localPivotYPx: 0,
    localPivotZPx: 0,
  };
  const weaponScale = [2.748, 1.636, 2.352];
  const position = [0, 3.1, -0.3];
  const camera = createGlyphPerspectiveCamera({
    rotX: 90,
    rotY: 270,
    distance: 0,
    perspective: 596.0866666666666,
    zoom: 50,
    center: [0.5, 0.5],
  });
  camera.target = [0, camera.perspective / BASE_TILE, 0];

  for (const vertex of [[-1.13, -2.992, -5.866], [6.303, 0.228, -0.075], [2, -1, -2]]) {
    const geometry = {
      version: 1,
      polygonCount: 1,
      polygons: [{ c: "#fff", v: [vertex] }],
    };
    const posed = quakeGlyphWeaponModelLocalPose("progs/v_axe.mdl", geometry, tuning);
    const scale = quakeGlyphWeaponModelScale("progs/v_axe.mdl", weaponScale, 1);
    const glyphWorld = add3(rotateZ90(multiply3(posed.polygons[0].v[0], scale)), position);
    const cssWorld = cssWeaponVertexToWorld(vertex, tuning, weaponScale, position);

    assertVecClose(glyphWorld, cssWorld);
    assert.ok(Math.abs(camera.eyeDepth(glyphWorld) - camera.eyeDepth(cssWorld)) < 1e-9);
    assertVecClose(
      camera.project(glyphWorld, 160, 90, 1),
      camera.project(cssWorld, 160, 90, 1),
    );
  }
});

test("shotgun vertices project identically through the CSS and glyph basis paths", () => {
  const tuning = {
    localYOffsetPx: -25,
    localPitchDeg: 13,
    localPivotXPx: 0,
    localPivotYPx: 0,
    localPivotZPx: 0,
  };
  const weaponScale = [2.748, 1.636, 2.352];
  const position = [0, 3.1, -0.3];
  const camera = createGlyphPerspectiveCamera({
    rotX: 90,
    rotY: 270,
    distance: 0,
    perspective: 596.0866666666666,
    zoom: 50,
    center: [0.5, 0.5],
  });
  camera.target = [0, camera.perspective / BASE_TILE, 0];

  for (const vertex of [[-3.302, -0.288, -1.973], [2.404, 0.294, -1.048], [0, -0.1, -1.5]]) {
    const geometry = {
      version: 1,
      polygonCount: 1,
      polygons: [{ c: "#fff", v: [vertex] }],
    };
    const posed = quakeGlyphWeaponModelLocalPose("progs/v_shot.mdl", geometry, tuning);
    const scale = quakeGlyphWeaponModelScale("progs/v_shot.mdl", weaponScale, 1);
    const glyphWorld = add3(rotateZ90(multiply3(posed.polygons[0].v[0], scale)), position);
    const cssWorld = cssWeaponVertexToWorld(vertex, tuning, weaponScale, position);

    assertVecClose(glyphWorld, cssWorld);
    assert.ok(Math.abs(camera.eyeDepth(glyphWorld) - camera.eyeDepth(cssWorld)) < 1e-9);
    assertVecClose(
      camera.project(glyphWorld, 160, 90, 1),
      camera.project(cssWorld, 160, 90, 1),
    );
  }
});

test("glyph weapon geometry carries raster local roll and Y offset before entity placement", () => {
  const posed = quakeGlyphWeaponLocalPose({
    version: 1,
    polygonCount: 1,
    polygons: [{ c: "#fff", v: [[0, 1, 0]] }],
  }, {
    localYOffsetPx: -50,
    localPitchDeg: 90,
    localPivotXPx: 0,
    localPivotYPx: 0,
    localPivotZPx: 0,
  });

  assert.deepEqual(posed.polygons[0].v[0].map((value) => Math.round(value * 1e6) / 1e6), [0, -1, 1]);
});

test("viewmodel layer uses visual viewport placement when browser UI changes viewport height", () => {
  const window = new Window();
  const globals = installWindowGlobals(window);
  try {
    setViewportWindowValues(window, {
      innerHeight: 720,
      innerWidth: 1280,
      visualHeight: 600,
      visualOffsetLeft: 10,
      visualOffsetTop: 50,
      visualWidth: 1000,
    });

    const host = document.createElement("div");
    host.getBoundingClientRect = () => rect(0, 0, 1280, 720);
    const layer = document.createElement("div");
    const sceneElement = document.createElement("div");
    document.body.append(host, layer, sceneElement);

    const viewmodel = createQuakeViewmodelController({
      controls: {
        getOrigin: () => [0, 0, 0],
      },
      host,
      layer,
      scene: {
        camera: {
          state: {
            distance: 0,
            rotX: 88,
            rotY: 270,
            zoom: 1,
          },
        },
        sceneElement,
      },
    });

    viewmodel.mount({
      source: "progs/v_shot.mdl",
      renderBundle: emptyRenderBundle(),
    });

    assert.equal(layer.style.left, "-130.833px");
    assert.equal(layer.style.top, "-59.583px");
    assert.equal(viewmodel.debugSnapshot().viewport.layerScale, 0.8333);

    viewmodel.playFireAnimation({ frameIntervalMs: 45, frames: [1] });

    const fired = viewmodel.debugSnapshot();
    assert.equal(layer.style.left, "-130.833px");
    assert.equal(layer.style.top, "-59.583px");
    assert.equal(fired.viewport.layerScale, 0.8333);
    assert.equal(fired.bob.fireForwardKick, -0.52);
    assert.equal(fired.bob.fireUpKick, -0.1);
  } finally {
    globals.restore();
  }
});

function roundedVertex(geometry) {
  return geometry.polygons[0].v[0].map(roundNumber);
}

function roundNumber(value) {
  return Math.round(value * 1e6) / 1e6;
}

function cssWeaponVertexToWorld(vertex, tuning, scale, position) {
  const radians = tuning.localPitchDeg * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const localY = polyCssDistanceToWorld(tuning.localYOffsetPx);
  const css = [vertex[1], vertex[0], vertex[2]];
  const locallyPosed = [
    css[0],
    css[1] * cos - css[2] * sin + localY,
    css[1] * sin + css[2] * cos,
  ];
  const scaled = multiply3(locallyPosed, scale);
  const outerCss = [scaled[1], -scaled[0], scaled[2]];
  const cssPosition = [position[1], position[0], position[2]];
  const translated = add3(outerCss, cssPosition);
  return [translated[1], translated[0], translated[2]];
}

function multiply3(a, b) {
  return [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
}

function add3(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function rotateZ90(v) {
  return [-v[1], v[0], v[2]];
}

function assertVecClose(actual, expected) {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, index) => {
    if (Number.isNaN(value) && Number.isNaN(expected[index])) return;
    assert.ok(Math.abs(value - expected[index]) < 1e-9, `${value} != ${expected[index]} at ${index}`);
  });
}

function emptyRenderBundle() {
  return {
    assetUrls: [],
    assetUrlsComplete: true,
    atlasLeafCount: 0,
    kind: "polycss-mesh",
    leafCount: 0,
    leafMetadata: [],
    meshHtml: "<div class=\"polycss-mesh\"></div>",
    polygonCount: 0,
    polycssVersion: "test",
    textureLighting: "baked",
    textureQuality: 1,
    version: 1,
  };
}

function setViewportWindowValues(window, {
  innerHeight,
  innerWidth,
  visualHeight,
  visualOffsetLeft,
  visualOffsetTop,
  visualWidth,
}) {
  Object.defineProperties(window, {
    innerHeight: { configurable: true, value: innerHeight },
    innerWidth: { configurable: true, value: innerWidth },
    visualViewport: {
      configurable: true,
      value: {
        height: visualHeight,
        offsetLeft: visualOffsetLeft,
        offsetTop: visualOffsetTop,
        width: visualWidth,
      },
    },
  });
}

function rect(left, top, right, bottom) {
  return {
    bottom,
    height: bottom - top,
    left,
    right,
    toJSON: () => undefined,
    top,
    width: right - left,
    x: left,
    y: top,
  };
}

function installWindowGlobals(window) {
  const previous = new Map();
  for (const [name, value] of [
    ["document", window.document],
    ["getComputedStyle", window.getComputedStyle.bind(window)],
    ["HTMLElement", window.HTMLElement],
    ["Node", window.Node],
    ["performance", window.performance],
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
