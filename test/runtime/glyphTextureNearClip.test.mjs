import assert from "node:assert/strict";
import test from "node:test";

import { Window } from "happy-dom";

test("near-plane-clipped baked-light polygons keep their texture and authored brightness", async () => {
  const window = new Window();
  const globals = installWindowGlobals(window);
  try {
    const { createGlyphPerspectiveCamera, createGlyphScene } = await import("glyphcss");
    const camera = createGlyphPerspectiveCamera({
      rotX: 0,
      rotY: 0,
      zoom: 50,
      perspective: 1000,
      distance: 0,
    });
    const polygon = {
      color: "#ffffff",
      texture: "test://red-green",
      unlit: true,
      vertices: [[-5, -5, 0], [5, -5, 0], [0, 5, 25]],
      uvs: [[0, 0], [0, 1], [1, .5]],
    };
    assert.equal(
      polygon.vertices.filter((vertex) => Number.isFinite(camera.project(vertex, 40, 24, 2)[0])).length,
      2,
      "the fixture must cross the perspective near plane",
    );

    const host = document.createElement("div");
    document.body.append(host);
    const scene = createGlyphScene(host, {
      camera,
      cols: 40,
      rows: 24,
      autoSize: false,
      mode: "solid",
      colorEncoding: "spans",
      useColors: true,
      doubleSided: true,
      ambientLight: { intensity: .25 },
      directionalLight: { direction: [0, 0, 1], intensity: 0 },
    });
    try {
      scene.add([polygon]);
      const html = await waitForTextureRender(scene.output);
      assert.match(html, /color:#ff0000/);
      assert.match(html, /color:#00ff00/);
      assert.doesNotMatch(html, /color:#ffffff/, "a near-clipped face must not fall back to its flat color");
      const columns = coloredCellColumns(scene.output);
      assert.ok(mean(columns.red) < mean(columns.green), "clipped UVs must keep the authored left-to-right texture orientation");
    } finally {
      scene.destroy();
    }
  } finally {
    globals.restore();
  }
});

test("animated lightstyle intensity dims baked texture color inside GlyphCSS", async () => {
  const window = new Window();
  const globals = installWindowGlobals(window);
  try {
    const { createGlyphOrthographicCamera, createGlyphScene } = await import("glyphcss");
    const host = document.createElement("div");
    document.body.append(host);
    const scene = createGlyphScene(host, {
      camera: createGlyphOrthographicCamera({ rotX: 0, rotY: 0, zoom: 400 }),
      cols: 40,
      rows: 24,
      autoSize: false,
      mode: "solid",
      colorEncoding: "spans",
      useColors: true,
      doubleSided: true,
      ambientLight: { intensity: .25 },
      directionalLight: { direction: [0, 0, 1], intensity: 0 },
    });
    try {
      const polygon = {
        color: "#ffffff",
        texture: "test://red-green",
        unlit: true,
        lightstyleIntensity: 1,
        vertices: [[-1, -1, 0], [-1, 1, 0], [1, 1, 0], [1, -1, 0]],
        uvs: [[0, 1], [1, 1], [1, 0], [0, 0]],
      };
      scene.add([polygon]);
      await waitForTextureRender(scene.output);
      const fullIntensityGlyphs = scene.output.textContent;
      polygon.lightstyleIntensity = .5;
      scene.rerender();
      const html = await waitForTextureRender(scene.output, ["#7f0000", "#007f00"]);
      assert.match(html, /color:#7f0000/);
      assert.match(html, /color:#007f00/);
      assert.doesNotMatch(html, /color:#ff0000|color:#00ff00/);
      assert.notEqual(scene.output.textContent, fullIntensityGlyphs, "lightstyle intensity must also change glyph density");
    } finally {
      scene.destroy();
    }
  } finally {
    globals.restore();
  }
});

test("world texture ink compensation brightens color without flattening glyph detail", async () => {
  const window = new Window();
  const globals = installWindowGlobals(window);
  try {
    const { createGlyphOrthographicCamera, createGlyphScene } = await import("glyphcss");
    const host = document.createElement("div");
    document.body.append(host);
    const polygon = {
      color: "#808080",
      texture: "test://red-green",
      unlit: true,
      textureInkIntensity: 1,
      vertices: [[-1, -1, 0], [-1, 1, 0], [1, 1, 0], [1, -1, 0]],
      uvs: [[0, 1], [1, 1], [1, 0], [0, 0]],
    };
    const scene = createGlyphScene(host, {
      camera: createGlyphOrthographicCamera({ rotX: 0, rotY: 0, zoom: 400 }),
      cols: 40,
      rows: 24,
      autoSize: false,
      mode: "solid",
      colorEncoding: "spans",
      useColors: true,
      doubleSided: true,
      ambientLight: { intensity: .25 },
      directionalLight: { direction: [0, 0, 1], intensity: 0 },
    });
    try {
      scene.add([polygon]);
      await waitForTextureRender(scene.output, ["#800000", "#008000"]);
      const uncompensatedGlyphs = scene.output.textContent;
      polygon.textureInkIntensity = 2;
      scene.rerender();
      const html = await waitForTextureRender(scene.output, ["#ff0000", "#00ff00"]);
      assert.match(html, /color:#ff0000/);
      assert.match(html, /color:#00ff00/);
      assert.equal(scene.output.textContent, uncompensatedGlyphs, "ink compensation must not change texture detail glyphs");
    } finally {
      scene.destroy();
    }
  } finally {
    globals.restore();
  }
});

test("animated lightstyle intensity dims cached flat mover geometry", async () => {
  const window = new Window();
  const globals = installWindowGlobals(window);
  try {
    const { createGlyphOrthographicCamera, createGlyphScene } = await import("glyphcss");
    const host = document.createElement("div");
    document.body.append(host);
    const polygon = {
      color: "#f0b478",
      lightstyleIntensity: 1,
      vertices: [[-1, -1, 0], [-1, 1, 0], [1, 1, 0], [1, -1, 0]],
    };
    const scene = createGlyphScene(host, {
      camera: createGlyphOrthographicCamera({ rotX: 0, rotY: 0, zoom: 400 }),
      cols: 40,
      rows: 24,
      autoSize: false,
      mode: "solid",
      colorEncoding: "spans",
      useColors: true,
      doubleSided: true,
      ambientLight: { intensity: .25 },
      directionalLight: { direction: [0, 0, 1], intensity: 0 },
    });
    try {
      scene.add([polygon]);
      await waitForTextureRender(scene.output, ["#3c2d1e"]);
      const fullIntensityGlyphs = scene.output.textContent;
      polygon.lightstyleIntensity = .5;
      scene.rerender();
      const html = await waitForTextureRender(scene.output, ["#1e160f"]);
      assert.match(html, /color:#1e160f/);
      assert.notEqual(scene.output.textContent, fullIntensityGlyphs, "flat mover glyph density must animate too");
    } finally {
      scene.destroy();
    }
  } finally {
    globals.restore();
  }
});

async function waitForTextureRender(output, expectedColors = ["#ff0000", "#00ff00"]) {
  const deadline = Date.now() + 500;
  while (Date.now() < deadline) {
    if (expectedColors.every((color) => output.innerHTML.includes(color))) return output.innerHTML;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return output.innerHTML;
}

function installWindowGlobals(window) {
  class FakeImage {
    naturalWidth = 2;
    naturalHeight = 1;
    width = 2;
    height = 1;
    onload = null;
    onerror = null;

    set src(value) {
      this.source = value;
      queueMicrotask(() => this.onload?.());
    }

    get src() {
      return this.source;
    }

    decode() {
      return Promise.resolve();
    }
  }

  window.HTMLCanvasElement.prototype.getContext = () => ({
    clearRect: () => undefined,
    drawImage: () => undefined,
    getImageData: () => ({ data: new Uint8ClampedArray([
      255, 0, 0, 255,
      0, 255, 0, 255,
    ]) }),
  });

  const previous = new Map();
  for (const [name, value] of [
    ["cancelAnimationFrame", clearTimeout],
    ["document", window.document],
    ["getComputedStyle", window.getComputedStyle.bind(window)],
    ["HTMLElement", window.HTMLElement],
    ["Image", FakeImage],
    ["Node", window.Node],
    ["requestAnimationFrame", (callback) => setTimeout(callback, 0)],
    ["window", window],
  ]) {
    previous.set(name, globalThis[name]);
    Object.defineProperty(globalThis, name, { configurable: true, value });
  }
  Object.defineProperty(window, "Image", { configurable: true, value: FakeImage });

  return {
    restore: () => {
      window.happyDOM?.abort?.();
      window.close?.();
      for (const [name, value] of previous) {
        if (value === undefined) delete globalThis[name];
        else Object.defineProperty(globalThis, name, { configurable: true, value });
      }
    },
  };
}

function coloredCellColumns(output) {
  const columns = { red: [], green: [] };
  let column = 0;
  for (const node of output.childNodes) visit(node, null);
  return columns;

  function visit(node, inheritedColor) {
    const color = node.nodeType === 1 ? node.getAttribute("style")?.match(/color:(#[0-9a-f]{6})/)?.[1] ?? inheritedColor : inheritedColor;
    if (node.nodeType === 3) {
      for (const char of node.textContent ?? "") {
        if (char === "\n") column = 0;
        else {
          if (char !== " ") {
            if (color === "#ff0000") columns.red.push(column);
            if (color === "#00ff00") columns.green.push(column);
          }
          column++;
        }
      }
      return;
    }
    for (const child of node.childNodes ?? []) visit(child, color);
  }
}

function mean(values) {
  assert.ok(values.length > 0);
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
