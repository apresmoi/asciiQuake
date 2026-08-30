import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "../importTsModule.mjs";
import {
  buildQuakeGlyphGeometry,
  buildQuakeStandaloneGlyphGeometry,
} from "../../src/prepare/glyphGeometry.mjs";

globalThis.window ??= globalThis;

const { createQuakePickupController } = await importTsModule("src/runtime/pickups.ts");

function createMockController(options = {}) {
  const setEntityCalls = [];
  const transformCalls = [];
  const removeEntityCalls = [];

  const sink = {
    setEntity: (id, geometry, transform) => {
      setEntityCalls.push({ id, geometry, transform });
    },
    setEntityTransform: (id, transform) => {
      transformCalls.push({ id, transform });
      return true;
    },
    removeEntity: (id) => {
      removeEntityCalls.push({ id });
    },
  };

  const controller = createQuakePickupController({
    addMesh: (entity, model) => ({
      element: { hidden: false },
      remove: () => {},
      setTransform: () => {},
    }),
    glyphEntitySink: sink,
    applyEffect: () => {},
    canPickup: () => true,
    leafIndexAt: () => 0,
    playerForward: () => [1, 0, 0],
    playerViewDot: () => 1,
    pointToPoly: (point) => [point.x, point.y, point.z],
    gameLogic: () => null,
    programMetadata: () => null,
    shouldSpawn: () => true,
    visibleLeavesAt: () => new Set([0]),
    ...options,
  });

  return { controller, setEntityCalls, transformCalls, removeEntityCalls };
}

test("BSP pickup model without glyphGeometry receives synthesized bounds box in glyph sink", (t) => {
  const { controller, setEntityCalls } = createMockController();
  t.after(() => controller.clear());

  const bspModel = {
    source: "maps/b_shell0.bsp",
    renderBundle: {},
    bounds: {
      min: [-0.16, -0.16, 0],
      max: [0.16, 0.16, 0.32],
    },
    // glyphGeometry intentionally omitted (matches current disk assets)
  };

  const modelLibrary = {
    models: {
      "maps/b_shell0.bsp": bspModel,
    },
  };

  const entity = {
    classname: "item_shells",
    index: 10,
    origin: { x: 2, y: 0, z: 0 },
    properties: {
      classname: "item_shells",
    },
  };

  controller.spawn([entity], modelLibrary, [0, 0, 0]);

  assert.equal(setEntityCalls.length, 1, "glyphEntitySink.setEntity should be called once");
  const call = setEntityCalls[0];
  assert.equal(call.id, "pickup:10");
  assert.ok(call.geometry, "geometry should be provided");
  assert.equal(call.geometry.version, 2);
  assert.equal(call.geometry.polygonCount, 6, "bounds box should have 6 quads");
  assert.equal(call.geometry.polygons.length, 6);
  assert.equal(call.geometry.polygons[1].c, "#7f6040", "bright top should use the generic ammo base color");
  assert.equal(new Set(call.geometry.polygons.map((polygon) => polygon.c)).size, 6,
    "all six faces should have distinct shading");

  for (const quad of call.geometry.polygons) {
    assert.equal(quad.v.length, 4, "each quad should have 4 vertices");
  }
});

test("health box BSP model synthesizes health color (#8b1510)", (t) => {
  const { controller, setEntityCalls } = createMockController();
  t.after(() => controller.clear());

  const healthModel = {
    source: "maps/b_bh10.bsp",
    renderBundle: {},
    bounds: {
      min: [-0.16, -0.16, 0],
      max: [0.16, 0.16, 0.32],
    },
  };

  const modelLibrary = {
    models: {
      "maps/b_bh10.bsp": healthModel,
    },
  };

  const entity = {
    classname: "item_health",
    index: 11,
    origin: { x: 2, y: 0, z: 0 },
    spawnflags: 1,
    properties: {
      classname: "item_health",
      spawnflags: "1",
    },
  };

  controller.spawn([entity], modelLibrary, [0, 0, 0]);

  assert.equal(setEntityCalls.length, 1);
  const call = setEntityCalls[0];
  assert.equal(call.geometry.polygons[1].c, "#8b1510", "health box top should use health red base color");
});

test("rocket ammo BSP model synthesizes rocket color (#8a3f24)", (t) => {
  const { controller, setEntityCalls } = createMockController();
  t.after(() => controller.clear());

  const rocketModel = {
    source: "maps/b_rock0.bsp",
    renderBundle: {},
    bounds: {
      min: [-0.16, -0.16, 0],
      max: [0.16, 0.16, 0.32],
    },
  };

  const modelLibrary = {
    models: {
      "maps/b_rock0.bsp": rocketModel,
    },
  };

  const entity = {
    classname: "item_rockets",
    index: 12,
    origin: { x: 2, y: 0, z: 0 },
    properties: {
      classname: "item_rockets",
    },
  };

  controller.spawn([entity], modelLibrary, [0, 0, 0]);

  assert.equal(setEntityCalls.length, 1);
  const call = setEntityCalls[0];
  assert.equal(call.geometry.polygons[1].c, "#8a3f24", "rocket box top should use rocket base color");
});

test("alias model with prepared glyphGeometry uses prepared geometry and not synthesized box", (t) => {
  const { controller, setEntityCalls } = createMockController();
  t.after(() => controller.clear());

  const preparedGlyphGeometry = {
    version: 2,
    polygonCount: 1,
    polygons: [{ v: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], c: "#abcdef" }],
  };

  const aliasModel = {
    source: "progs/armor.mdl",
    renderBundle: {},
    bounds: {
      min: [-0.16, -0.16, 0],
      max: [0.16, 0.16, 0.32],
    },
    glyphGeometry: preparedGlyphGeometry,
  };

  const modelLibrary = {
    models: {
      "progs/armor.mdl": aliasModel,
    },
  };

  const entity = {
    classname: "item_armor1",
    index: 20,
    origin: { x: 2, y: 0, z: 0 },
    properties: {
      classname: "item_armor1",
    },
  };

  controller.spawn([entity], modelLibrary, [0, 0, 0]);

  assert.equal(setEntityCalls.length, 1);
  const call = setEntityCalls[0];
  assert.equal(call.geometry, preparedGlyphGeometry, "must use the exact prepared glyph geometry");
  assert.equal(call.geometry.polygonCount, 1, "must not mask prepared geometry with 6-quad box");
});

test("standalone glyph geometry builder keeps polygons tagged with modelIndex", () => {
  const moverPolygons = [
    {
      vertices: [[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0]],
      color: "#ff0000",
      modelIndex: 1,
    },
  ];

  const worldResult = buildQuakeGlyphGeometry(moverPolygons);
  assert.equal(worldResult.polygonCount, 0, "world map builder skips mover polygons with modelIndex > 0");

  const standaloneResult = buildQuakeStandaloneGlyphGeometry(moverPolygons);
  assert.equal(standaloneResult.polygonCount, 1, "standalone model builder keeps mover polygons");
  assert.equal(standaloneResult.polygons[0].c, "#ff0000");

  const optionResult = buildQuakeGlyphGeometry(moverPolygons, undefined, { includeMovers: true });
  assert.equal(optionResult.polygonCount, 1, "includeMovers option keeps mover polygons");
});
