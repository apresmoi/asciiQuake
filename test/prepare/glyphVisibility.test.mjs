import assert from "node:assert/strict";
import test from "node:test";

import {
  buildQuakeGlyphFaceLeaves,
  buildQuakeGlyphGeometry,
  buildQuakeGlyphMovers,
  buildQuakeGlyphWorldTextureAtlas,
} from "../../src/prepare/glyphGeometry.mjs";

test("merged world polygons retain the union of their source BSP leaves", () => {
  const faceLeaves = buildQuakeGlyphFaceLeaves({
    candidates: [
      { faceIndex: 100, sourceFaceIndices: [10, 11, 12] },
      { faceIndex: 200, sourceFaceIndices: [20] },
    ],
    metadata: {
      sourceFaces: [
        { faceIndex: 10, leafIndexes: [1] },
        { faceIndex: 11, leafIndexes: [2, 3] },
        { faceIndex: 12, leafIndexes: [3, 4] },
        { faceIndex: 20, leafIndexes: [5] },
      ],
    },
  });
  const geometry = buildQuakeGlyphGeometry([
    { faceIndex: 100, vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], color: "#fff" },
    { faceIndex: 200, vertices: [[0, 0, 1], [1, 0, 1], [0, 1, 1]], color: "#aaa" },
  ], faceLeaves);

  assert.deepEqual(geometry.polygons[0].l, [1, 2, 3, 4]);
  assert.deepEqual(geometry.polygons[1].l, [5]);
});

test("world glyph geometry preserves UV texture detail in one atlas without subdividing faces", () => {
  const texture = "/q/t/lit-floor.png";
  const polygon = {
    vertices: [[0, 0, 0], [1.28, 0, 0], [1.28, 1.28, 0], [0, 1.28, 0]],
    color: "#111111",
    texture,
    textureAlphaMode: "opaque",
    textureWrap: { s: "repeat", t: "repeat" },
    uvs: [[0, 0], [1, 0], [1, 1], [0, 1]],
    data: { f: 7, tex: "floor" },
  };
  const samplers = new Map([[texture, {
    width: 2,
    height: 2,
    data: Uint8Array.from([
      220, 40, 20, 255, 20, 180, 40, 255,
      30, 50, 210, 255, 230, 190, 30, 255,
    ]),
  }]]);
  const result = buildQuakeGlyphWorldTextureAtlas(
    [polygon],
    samplers,
    new Map([[7, [3, 4]]]),
    { maxAtlasSide: 16, maxTileSide: 4 },
  );

  assert.equal(result.geometry.polygonCount, 1, "the original face geometry should remain intact");
  assert.equal(result.texturedPolygonCount, 1);
  assert.deepEqual(result.geometry.polygons[0].l, [3, 4]);
  assert.equal(result.geometry.polygons[0].c, "#ffffff", "the atlas already contains the face's material color and baked light");
  assert.equal(result.geometry.polygons[0].u.length, 4);
  assert.ok(result.geometry.polygons[0].u.flat().every((value) => value > 0 && value < 1));
  assert.ok(result.atlas);
  const atlasColors = new Set();
  let opaquePixels = 0;
  for (let offset = 0; offset < result.atlas.rgba.length; offset += 4) {
    if (result.atlas.rgba[offset + 3]) {
      opaquePixels++;
      atlasColors.add(`${result.atlas.rgba[offset]},${result.atlas.rgba[offset + 1]},${result.atlas.rgba[offset + 2]}`);
    }
  }
  assert.equal(opaquePixels, 16, "the 2x2 tile plus one-pixel duplicated border must stay inside the atlas");
  assert.deepEqual(atlasColors, new Set([
    "220,40,20",
    "20,180,40",
    "30,50,210",
    "230,190,30",
  ]), "the atlas must preserve baked-light texels exactly without clipping highlights");
});

test("world texture atlas converts baked top-origin V coordinates for GlyphCSS", () => {
  const texture = "/q/t/top-bottom.png";
  const sampler = new Map([[texture, {
    width: 2,
    height: 2,
    data: Uint8Array.from([
      220, 20, 20, 255, 220, 20, 20, 255,
      20, 40, 220, 255, 20, 40, 220, 255,
    ]),
  }]]);
  const build = (baked, uvs) => buildQuakeGlyphWorldTextureAtlas([{
    vertices: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]],
    color: "#ffffff",
    texture,
    textureAlphaMode: "opaque",
    textureWrap: { s: "clamp-to-edge", t: "clamp-to-edge" },
    uvs,
    data: { f: 12, tex: "top-bottom", ...(baked ? { "lm-bake": true } : {}) },
  }], sampler, undefined, { maxAtlasSide: 8, maxTileSide: 2, padding: 0 });
  const sample = (result, uv) => {
    const x = Math.max(0, Math.min(result.atlas.width - 1, Math.floor(uv[0] * result.atlas.width)));
    const y = Math.max(0, Math.min(result.atlas.height - 1, Math.floor((1 - uv[1]) * result.atlas.height)));
    const offset = (y * result.atlas.width + x) * 4;
    return [...result.atlas.rgba.slice(offset, offset + 3)];
  };

  const baked = build(true, [[0, 0], [1, 0], [1, 1], [0, 1]]);
  assert.deepEqual(sample(baked, baked.geometry.polygons[0].u[0]), [220, 20, 20],
    "a baked face's V=0 top vertex must sample the image's top row");
  assert.deepEqual(sample(baked, baked.geometry.polygons[0].u[3]), [20, 40, 220],
    "a baked face's V=1 bottom vertex must sample the image's bottom row");

  const ordinary = build(false, [[0, 1], [1, 1], [1, 0], [0, 0]]);
  assert.deepEqual(sample(ordinary, ordinary.geometry.polygons[0].u[0]), [220, 20, 20],
    "ordinary bottom-origin UVs must remain unchanged");
});

test("world texture atlas supports triangles and repeated Quake UVs", () => {
  const texture = "/q/t/repeating-floor.png";
  const polygon = {
    vertices: [[0, 0, 0], [2, 0, 0], [0, 1, 0]],
    color: "#111111",
    texture,
    textureAlphaMode: "opaque",
    textureWrap: { s: "repeat", t: "repeat" },
    uvs: [[0, 0], [2, 0], [0, 1]],
    data: { f: 8, tex: "floor" },
  };
  const sampler = new Map([[texture, {
    width: 2,
    height: 1,
    data: Uint8Array.from([
      220, 40, 20, 255, 20, 50, 210, 255,
    ]),
  }]]);

  const result = buildQuakeGlyphWorldTextureAtlas(
    [polygon],
    sampler,
    new Map([[8, [5]]]),
    { maxAtlasSide: 16, maxTileSide: 4 },
  );

  assert.equal(result.geometry.polygonCount, 1);
  assert.equal(result.geometry.polygons[0].v.length, 3);
  assert.deepEqual(result.geometry.polygons[0].l, [5]);
  const redPixels = [];
  const bluePixels = [];
  for (let offset = 0; offset < result.atlas.rgba.length; offset += 4) {
    if (!result.atlas.rgba[offset + 3]) continue;
    if (result.atlas.rgba[offset] > result.atlas.rgba[offset + 2]) redPixels.push(offset);
    if (result.atlas.rgba[offset + 2] > result.atlas.rgba[offset]) bluePixels.push(offset);
  }
  assert.ok(redPixels.length > 0 && bluePixels.length > 0, "repeated source texels must both reach the atlas");
});

test("world texture atlas area-filters source detail that is smaller than an atlas texel", () => {
  const texture = "/q/t/checker-floor.png";
  const polygon = {
    vertices: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]],
    color: "#ffffff",
    texture,
    textureAlphaMode: "opaque",
    textureWrap: { s: "repeat", t: "repeat" },
    uvs: [[0, 0], [1, 0], [1, 1], [0, 1]],
    data: { f: 10, tex: "checker" },
  };
  const sampler = new Map([[texture, {
    width: 4,
    height: 1,
    data: Uint8Array.from([
      0, 0, 0, 255,
      255, 255, 255, 255,
      0, 0, 0, 255,
      255, 255, 255, 255,
    ]),
  }]]);

  const result = buildQuakeGlyphWorldTextureAtlas(
    [polygon],
    sampler,
    undefined,
    { maxAtlasSide: 8, maxTileSide: 2, padding: 0 },
  );
  const opaque = [];
  for (let offset = 0; offset < result.atlas.rgba.length; offset += 4) {
    if (result.atlas.rgba[offset + 3]) opaque.push(result.atlas.rgba.slice(offset, offset + 4));
  }

  assert.equal(opaque.length, 4);
  for (const pixel of opaque) {
    assert.deepEqual(
      [...pixel],
      [128, 128, 128, 255],
      "each atlas texel must represent its complete source footprint instead of one aliasing point sample",
    );
  }
});

test("world texture atlas preserves the sampling aspect of large rectangular faces", () => {
  const texture = "/q/t/large-floor.png";
  const result = buildQuakeGlyphWorldTextureAtlas([{
    vertices: [[0, 0, 0], [2.24, 0, 0], [2.24, 1.28, 0], [0, 1.28, 0]],
    color: "#ffffff",
    texture,
    textureAlphaMode: "opaque",
    textureWrap: { s: "repeat", t: "repeat" },
    uvs: [[0, 0], [1, 0], [1, 1], [0, 1]],
    data: { f: 11, tex: "floor", "lm-bake": true },
  }], new Map([[texture, {
    width: 224,
    height: 128,
    data: new Uint8Array(224 * 128 * 4).fill(255),
  }]]));

  const uvs = result.geometry.polygons[0].u;
  const uSpan = (Math.max(...uvs.map((uv) => uv[0])) - Math.min(...uvs.map((uv) => uv[0]))) * result.atlas.width;
  const vSpan = (Math.max(...uvs.map((uv) => uv[1])) - Math.min(...uvs.map((uv) => uv[1]))) * result.atlas.height;
  assert.ok(Math.abs(uSpan - 56) < 0.001, "wide source faces need more than the legacy 24 atlas samples");
  assert.ok(Math.abs(vSpan - 32) < 0.001, "tile dimensions must preserve the source sampling aspect");
});

test("world texture atlas preserves animated Quake lightstyles as intensity frames", () => {
  const texture = "/q/t/flicker.png";
  const polygon = {
    vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0]],
    color: "#ffffff",
    texture,
    textureAlphaMode: "opaque",
    textureWrap: { s: "repeat", t: "repeat" },
    uvs: [[0, 0], [1, 0], [0, 1]],
    data: {
      f: 9,
      tex: "light1_1",
      "ls-anim": "4",
      "ls-pattern": "0.000,0.520,0.250",
    },
  };
  const sampler = new Map([[texture, {
    width: 1,
    height: 1,
    data: Uint8Array.from([200, 160, 120, 255]),
  }]]);

  const result = buildQuakeGlyphWorldTextureAtlas(
    [polygon],
    sampler,
    new Map([[9, [6]]]),
    { maxAtlasSide: 16, maxTileSide: 2 },
  );

  assert.equal(result.texturedPolygonCount, 1);
  assert.equal(result.geometry.polygons[0].s, 4);
  assert.deepEqual(result.geometry.polygons[0].a, [1, 0.48, 0.75]);
});

test("world texture atlas leaves sky, liquid, animated, and mover faces on their flat fallback", () => {
  const texture = "/q/t/world.png";
  const makePolygon = (face, tex, extra = {}) => ({
    vertices: [[face, 0, 0], [face + 1, 0, 0], [face, 1, 0]],
    color: "#123456",
    texture,
    textureAlphaMode: "opaque",
    uvs: [[0, 0], [1, 0], [0, 1]],
    data: { f: face, tex },
    ...extra,
  });
  const sampler = new Map([[texture, {
    width: 1,
    height: 1,
    data: Uint8Array.from([100, 120, 140, 255]),
  }]]);
  const result = buildQuakeGlyphWorldTextureAtlas([
    makePolygon(0, "brick", { textureAlphaMode: undefined }),
    makePolygon(1, "sky1"),
    makePolygon(2, "*water"),
    makePolygon(3, "+0switch", { data: {
      f: 3,
      tex: "+0switch",
      "ls-anim": "2",
      "ls-pattern": "0.000,0.500",
    } }),
    makePolygon(4, "door", {
      modelIndex: 1,
      entityIndex: 12,
      data: { f: 4, tex: "door", "ls-anim": "6", "ls-pattern": "0.250,0.750" },
    }),
    makePolygon(5, "fence", { textureAlphaMode: "blend" }),
  ], sampler, undefined, { maxAtlasSide: 16, maxTileSide: 2 });

  assert.equal(result.geometry.polygonCount, 5, "movers remain in the separate animated geometry path");
  assert.equal(result.texturedPolygonCount, 1, "opaque faces without a redundant alpha marker still receive their texture");
  assert.equal(result.geometry.polygons.filter((item) => item.u).length, 1);
  assert.deepEqual(result.geometry.polygons.slice(1).map((item) => item.c), ["#123456", "#123456", "#123456", "#123456"]);
  assert.equal(result.geometry.polygons[3].s, 2, "animated-texture faces must retain their separate lightstyle");
  assert.deepEqual(result.geometry.polygons[3].a, [1, .5]);

  const movers = buildQuakeGlyphMovers([
    makePolygon(4, "door", {
      modelIndex: 1,
      entityIndex: 12,
      data: { f: 4, tex: "door", "ls-anim": "6", "ls-pattern": "0.250,0.750" },
    }),
  ]);
  assert.equal(movers.movers[0].polygons[0].s, 6, "mover faces must retain animated lightstyles");
  assert.deepEqual(movers.movers[0].polygons[0].a, [.75, .25]);
});
