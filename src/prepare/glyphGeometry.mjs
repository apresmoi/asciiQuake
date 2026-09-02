// Renderer-neutral world geometry for the glyphcss (ASCII) backend.
//
// Capture raw `scene.polygons` (world-space vertices + the lit
// fallback colour that already encodes texture tone × brightness) into a
// compact payload the runtime can hand straight to `glyphScene.add(...)`.
//
// The payload is a trimmed, rounded projection of the prepared polygons.

const QUAKE_GLYPH_GEOMETRY_VERSION = 3;
const QUAKE_GLYPH_GEOMETRY_PRECISION = 1000; // 3 decimal places
const QUAKE_GLYPH_UV_PRECISION = 1_000_000; // sub-texel precision in a 2048px atlas
const QUAKE_GLYPH_ATLAS_MAX_SIDE = 2048;
const QUAKE_GLYPH_ATLAS_TILE_MAX_SIDE = 24;
const QUAKE_GLYPH_ATLAS_PADDING = 1;

function roundCoordinate(value) {
  return Math.round(value * QUAKE_GLYPH_GEOMETRY_PRECISION) / QUAKE_GLYPH_GEOMETRY_PRECISION;
}

function roundUv(value) {
  return Math.round(value * QUAKE_GLYPH_UV_PRECISION) / QUAKE_GLYPH_UV_PRECISION;
}

// Union of BSP leaf indexes touched by a polygon's source face(s). The runtime
// uses these for a potentially-visible-set (PVS) cull: a polygon renders only
// when one of its leaves is visible from the player's current leaf.
function polygonLeaves(polygon, faceLeaves) {
  if (!faceLeaves) return undefined;
  // The face index lives on the in-memory candidate (sourceFaceIndices/faceIndex)
  // or, on a hydrated scene polygon, in `data.f` (the serialized "f" key).
  const dataFace = polygon.data && polygon.data.f;
  const faces = Array.isArray(polygon.sourceFaceIndices) && polygon.sourceFaceIndices.length
    ? polygon.sourceFaceIndices
    : (typeof polygon.faceIndex === "number" ? [polygon.faceIndex]
      : (typeof dataFace === "number" ? [dataFace] : []));
  const leaves = new Set();
  for (const f of faces) {
    const ls = faceLeaves.get(f);
    if (ls) for (const l of ls) leaves.add(l);
  }
  return leaves.size ? [...leaves] : undefined;
}

function glyphPolygon(polygon, faceLeaves) {
  const out = {
    v: polygon.vertices.map((point) => [
      roundCoordinate(point[0]),
      roundCoordinate(point[1]),
      roundCoordinate(point[2]),
    ]),
    c: typeof polygon.color === "string" ? polygon.color : "#cccccc",
  };
  const leaves = polygonLeaves(polygon, faceLeaves);
  if (leaves) out.l = leaves;
  return out;
}

/**
 * Build the static world glyph geometry. Brush-model (mover: door/plat/button)
 * polygons — tagged with `modelIndex > 0` — are EXCLUDED here and emitted
 * separately by {@link buildQuakeGlyphMovers} so the runtime can animate them.
 *
 * @param {Array<{ vertices: number[][], color?: string, modelIndex?: number }>} polygons
 * @param {Map<number, number[]>} [faceLeaves] face index → BSP leaf indexes, for PVS culling.
 * @param {{ includeMovers?: boolean }} [options] If true, keep polygons regardless of modelIndex.
 * @returns {{ version: number, polygonCount: number, polygons: Array<{ v: number[][], c: string, l?: number[] }> }}
 */
export function buildQuakeGlyphGeometry(polygons, faceLeaves, options = {}) {
  const includeMovers = Boolean(options?.includeMovers);
  const out = [];
  for (const polygon of polygons ?? []) {
    const vertices = polygon?.vertices;
    if (!Array.isArray(vertices) || vertices.length < 3) continue;
    if (!includeMovers && polygon.modelIndex) continue; // mover — emitted by buildQuakeGlyphMovers
    out.push(glyphPolygon(polygon, faceLeaves));
  }
  return {
    version: QUAKE_GLYPH_GEOMETRY_VERSION,
    polygonCount: out.length,
    polygons: out,
  };
}

/**
 * Preserve the real UV-mapped world materials without making the browser load
 * one image per face. Each eligible floor/wall face receives a small raster
 * tile containing its already-lit, repeated Quake texture. Tiles are packed
 * into one map atlas; the original polygon remains intact and its UVs are
 * remapped to that tile for glyphcss's per-cell texture sampler.
 *
 * @param {Array<object>} polygons
 * @param {Map<string, { width: number, height: number, data: ArrayLike<number> }>} textureSamplers
 * @param {Map<number, number[]>} [faceLeaves]
 * @param {{ maxAtlasSide?: number, maxTileSide?: number, padding?: number }} [options]
 * @returns {{ geometry: { version: number, polygonCount: number, polygons: Array<object> },
 *   atlas: { width: number, height: number, rgba: Uint8Array } | null,
 *   texturedPolygonCount: number }}
 */
export function buildQuakeGlyphWorldTextureAtlas(polygons, textureSamplers, faceLeaves, options = {}) {
  const maxAtlasSide = positiveInteger(options.maxAtlasSide, QUAKE_GLYPH_ATLAS_MAX_SIDE);
  const maxTileSide = positiveInteger(options.maxTileSide, QUAKE_GLYPH_ATLAS_TILE_MAX_SIDE);
  const padding = Math.max(0, Math.trunc(
    Number.isFinite(options.padding) ? options.padding : QUAKE_GLYPH_ATLAS_PADDING,
  ));
  const plans = [];

  for (const polygon of polygons ?? []) {
    const vertices = polygon?.vertices;
    if (!Array.isArray(vertices) || vertices.length < 3 || polygon.modelIndex) continue;
    const base = glyphPolygon(polygon, faceLeaves);
    const sampler = typeof polygon.texture === "string"
      ? textureSamplers?.get(polygon.texture)
      : undefined;
    if (!quakeGlyphWorldTextureCandidate(polygon, sampler)) {
      plans.push({ base });
      continue;
    }
    const bounds = textureUvBounds(polygon.uvs);
    if (bounds.width <= 1e-9 || bounds.height <= 1e-9) {
      plans.push({ base });
      continue;
    }
    plans.push({
      base,
      polygon,
      sampler,
      bounds,
      desiredWidth: Math.max(2, Math.min(maxTileSide, Math.ceil(bounds.width * sampler.width))),
      desiredHeight: Math.max(2, Math.min(maxTileSide, Math.ceil(bounds.height * sampler.height))),
    });
  }

  const texturedPlans = plans.filter((plan) => plan.sampler);
  if (!texturedPlans.length) {
    const out = plans.map((plan) => plan.base);
    return {
      geometry: { version: QUAKE_GLYPH_GEOMETRY_VERSION, polygonCount: out.length, polygons: out },
      atlas: null,
      texturedPolygonCount: 0,
    };
  }

  const packed = packQuakeGlyphAtlasTiles(texturedPlans, maxAtlasSide, padding);
  const rgba = new Uint8Array(packed.width * packed.height * 4);
  for (const plan of texturedPlans) rasterizeQuakeGlyphAtlasTile(rgba, packed.width, plan, padding);

  const out = plans.map((plan) => {
    if (!plan.sampler) return plan.base;
    return {
      ...plan.base,
      // GlyphCSS multiplies sampled texels by the polygon color. The atlas
      // already contains material color and baked light, so its tint must be
      // neutral to avoid applying either twice.
      c: "#ffffff",
      u: plan.polygon.uvs.map((uv) => remapQuakeGlyphAtlasUv(uv, plan, packed.width, packed.height, padding)),
    };
  });
  return {
    geometry: { version: QUAKE_GLYPH_GEOMETRY_VERSION, polygonCount: out.length, polygons: out },
    atlas: { width: packed.width, height: packed.height, rgba },
    texturedPolygonCount: texturedPlans.length,
  };
}

function quakeGlyphWorldTextureCandidate(polygon, sampler) {
  // Merged opaque world faces can lose the redundant alpha marker while
  // retaining their opaque PNG. Only an explicit blend mode is unsafe for the
  // solid atlas; treating an absent marker as transparent leaves real walls on
  // the flat-color fallback.
  if (!sampler || polygon.textureAlphaMode === "blend") return false;
  if (!validUvs(polygon.uvs, polygon.vertices.length)) return false;
  const textureName = String(polygon.data?.tex ?? "").toLowerCase();
  return !textureName.startsWith("sky") &&
    !textureName.startsWith("*") &&
    !textureName.startsWith("+");
}

function textureUvBounds(uvs) {
  let minU = Infinity;
  let minV = Infinity;
  let maxU = -Infinity;
  let maxV = -Infinity;
  for (const [u, v] of uvs) {
    minU = Math.min(minU, u);
    minV = Math.min(minV, v);
    maxU = Math.max(maxU, u);
    maxV = Math.max(maxV, v);
  }
  return { minU, minV, maxU, maxV, width: maxU - minU, height: maxV - minV };
}

function packQuakeGlyphAtlasTiles(plans, maxAtlasSide, padding) {
  for (let scale = 1; scale >= 0.05; scale *= 0.8) {
    for (const plan of plans) {
      plan.width = Math.max(2, Math.floor(plan.desiredWidth * scale));
      plan.height = Math.max(2, Math.floor(plan.desiredHeight * scale));
    }
    const totalArea = plans.reduce(
      (sum, plan) => sum + (plan.width + padding * 2) * (plan.height + padding * 2),
      0,
    );
    const widest = Math.max(...plans.map((plan) => plan.width + padding * 2));
    if (widest > maxAtlasSide) continue;
    let atlasWidth = nextPowerOfTwo(Math.max(widest, Math.ceil(Math.sqrt(totalArea))));
    atlasWidth = Math.min(maxAtlasSide, atlasWidth);
    for (; atlasWidth <= maxAtlasSide; atlasWidth *= 2) {
      const height = packQuakeGlyphAtlasShelves(plans, atlasWidth, padding);
      if (height <= maxAtlasSide) {
        return { width: atlasWidth, height: nextPowerOfTwo(Math.max(1, height)) };
      }
      if (atlasWidth === maxAtlasSide) break;
    }
  }
  throw new Error(`Could not fit ${plans.length} world texture tiles into a ${maxAtlasSide}px atlas.`);
}

function packQuakeGlyphAtlasShelves(plans, atlasWidth, padding) {
  const ordered = [...plans].sort((a, b) => (b.height - a.height) || (b.width - a.width));
  let x = 0;
  let y = 0;
  let shelfHeight = 0;
  for (const plan of ordered) {
    const width = plan.width + padding * 2;
    const height = plan.height + padding * 2;
    if (x > 0 && x + width > atlasWidth) {
      y += shelfHeight;
      x = 0;
      shelfHeight = 0;
    }
    plan.x = x;
    plan.y = y;
    x += width;
    shelfHeight = Math.max(shelfHeight, height);
  }
  return y + shelfHeight;
}

function rasterizeQuakeGlyphAtlasTile(rgba, atlasWidth, plan, padding) {
  for (let tileY = -padding; tileY < plan.height + padding; tileY++) {
    const innerY = Math.max(0, Math.min(plan.height - 1, tileY));
    const sourceV = plan.bounds.maxV - ((innerY + 0.5) / plan.height) * plan.bounds.height;
    for (let tileX = -padding; tileX < plan.width + padding; tileX++) {
      const innerX = Math.max(0, Math.min(plan.width - 1, tileX));
      const sourceU = plan.bounds.minU + ((innerX + 0.5) / plan.width) * plan.bounds.width;
      const sampled = sampleTextureRgba(plan.sampler, [sourceU, sourceV], plan.polygon.textureWrap);
      if (!sampled) continue;
      const target = ((plan.y + padding + tileY) * atlasWidth + plan.x + padding + tileX) * 4;
      rgba[target] = sampled[0];
      rgba[target + 1] = sampled[1];
      rgba[target + 2] = sampled[2];
      rgba[target + 3] = sampled[3];
    }
  }
}

function remapQuakeGlyphAtlasUv(uv, plan, atlasWidth, atlasHeight, padding) {
  const x = plan.x + padding + ((uv[0] - plan.bounds.minU) / plan.bounds.width) * plan.width;
  const imageY = plan.y + padding + ((plan.bounds.maxV - uv[1]) / plan.bounds.height) * plan.height;
  return [roundUv(x / atlasWidth), roundUv(1 - imageY / atlasHeight)];
}

function nextPowerOfTwo(value) {
  return 2 ** Math.ceil(Math.log2(Math.max(1, value)));
}

/**
 * Build glyph geometry for a standalone model (e.g. BSP pickup or alias frame).
 * Polygons are never excluded based on modelIndex because standalone models do not
 * split static world geometry from movers.
 *
 * @param {Array<{ vertices: number[][], color?: string, modelIndex?: number }>} polygons
 * @returns {{ version: number, polygonCount: number, polygons: Array<{ v: number[][], c: string }> }}
 */
export function buildQuakeStandaloneGlyphGeometry(polygons) {
  return buildQuakeGlyphGeometry(polygons, undefined, { includeMovers: true });
}

/**
 * Bake a standalone BSP model's UV-mapped face textures into compact colored
 * quads. BSP pickup models are deliberately low-poly boxes, so keeping only a
 * single fallback color per face erases the ammo/health/explosive artwork that
 * identifies them in Quake. The baked cells remain ordinary glyph geometry:
 * runtime tone, lighting, culling, and entity transforms need no texture-only
 * path.
 *
 * @param {Array<{ vertices: number[][], color?: string, texture?: string,
 *   textureWrap?: { s?: string, t?: string }, uvs?: number[][] }>} polygons
 * @param {Map<string, { width: number, height: number, data: ArrayLike<number> }>} textureSamplers
 * @param {{ cellSize?: number, maxCellsPerAxis?: number }} [options]
 */
export function buildQuakeTexturedStandaloneGlyphGeometry(polygons, textureSamplers, options = {}) {
  const cellSize = positiveNumber(options.cellSize, 0.08);
  const maxCellsPerAxis = Math.max(1, Math.trunc(positiveNumber(options.maxCellsPerAxis, 12)));
  const out = [];
  for (const polygon of polygons ?? []) {
    const vertices = polygon?.vertices;
    if (!Array.isArray(vertices) || vertices.length < 3) continue;
    const sampler = typeof polygon.texture === "string"
      ? textureSamplers?.get(polygon.texture)
      : undefined;
    if (!sampler || vertices.length !== 4 || !validUvs(polygon.uvs, vertices.length)) {
      out.push(glyphPolygon(polygon));
      continue;
    }
    out.push(...texturedQuadGlyphPolygons(polygon, sampler, undefined, cellSize, maxCellsPerAxis));
  }
  return {
    version: QUAKE_GLYPH_GEOMETRY_VERSION,
    polygonCount: out.length,
    polygons: out,
  };
}

function texturedQuadGlyphPolygons(polygon, sampler, faceLeaves, cellSize, maxCellsPerAxis) {
  const vertices = polygon.vertices;
  const cellsS = subdivisionCount(
    Math.max(distance3(vertices[0], vertices[1]), distance3(vertices[3], vertices[2])),
    cellSize,
    maxCellsPerAxis,
  );
  const cellsT = subdivisionCount(
    Math.max(distance3(vertices[0], vertices[3]), distance3(vertices[1], vertices[2])),
    cellSize,
    maxCellsPerAxis,
  );
  if (cellsS === 1 && cellsT === 1) return [glyphPolygon(polygon, faceLeaves)];

  const cells = [];
  const colors = new Set();
  for (let t = 0; t < cellsT; t++) {
    const t0 = t / cellsT;
    const t1 = (t + 1) / cellsT;
    for (let s = 0; s < cellsS; s++) {
      const s0 = s / cellsS;
      const s1 = (s + 1) / cellsS;
      const uv = bilinear2(polygon.uvs, (s0 + s1) * 0.5, (t0 + t1) * 0.5);
      const sampled = sampleTextureColor(sampler, uv, polygon.textureWrap);
      const color = sampled ?? (typeof polygon.color === "string" ? polygon.color : "#cccccc");
      colors.add(color);
      cells.push(glyphPolygon({
        ...polygon,
        vertices: [
          bilinear3(vertices, s0, t0),
          bilinear3(vertices, s1, t0),
          bilinear3(vertices, s1, t1),
          bilinear3(vertices, s0, t1),
        ],
        color,
      }, faceLeaves));
    }
  }
  return colors.size === 1
    ? [glyphPolygon({ ...polygon, color: cells[0]?.c ?? polygon.color }, faceLeaves)]
    : cells;
}

function positiveNumber(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function positiveInteger(value, fallback) {
  return Math.max(1, Math.trunc(positiveNumber(value, fallback)));
}

function validUvs(uvs, length) {
  return Array.isArray(uvs) && uvs.length === length &&
    uvs.every((uv) => Array.isArray(uv) && uv.length >= 2 && uv.every(Number.isFinite));
}

function subdivisionCount(length, cellSize, maxCellsPerAxis) {
  return Math.max(1, Math.min(maxCellsPerAxis, Math.ceil(length / cellSize)));
}

function distance3(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function bilinear2(points, s, t) {
  const bottom = lerp2(points[0], points[1], s);
  const top = lerp2(points[3], points[2], s);
  return lerp2(bottom, top, t);
}

function bilinear3(points, s, t) {
  const bottom = lerp3(points[0], points[1], s);
  const top = lerp3(points[3], points[2], s);
  return lerp3(bottom, top, t);
}

function lerp2(a, b, amount) {
  return [a[0] + (b[0] - a[0]) * amount, a[1] + (b[1] - a[1]) * amount];
}

function lerp3(a, b, amount) {
  return [
    a[0] + (b[0] - a[0]) * amount,
    a[1] + (b[1] - a[1]) * amount,
    a[2] + (b[2] - a[2]) * amount,
  ];
}

function sampleTextureColor(sampler, uv, textureWrap = {}) {
  const sampled = sampleTextureRgba(sampler, uv, textureWrap);
  if (!sampled || sampled[3] < 32) return null;
  return `#${hexByte(sampled[0])}${hexByte(sampled[1])}${hexByte(sampled[2])}`;
}

function sampleTextureRgba(sampler, uv, textureWrap = {}) {
  const width = Math.trunc(sampler?.width ?? 0);
  const height = Math.trunc(sampler?.height ?? 0);
  const data = sampler?.data;
  if (width <= 0 || height <= 0 || !data || data.length < width * height * 4) return null;
  const u = wrapTextureCoordinate(uv[0], textureWrap?.s ?? "repeat");
  const v = wrapTextureCoordinate(uv[1], textureWrap?.t ?? "repeat");
  const x = Math.min(width - 1, Math.floor(u * width));
  const y = Math.min(height - 1, Math.floor((1 - v) * height));
  const offset = (y * width + x) * 4;
  return [data[offset] ?? 0, data[offset + 1] ?? 0, data[offset + 2] ?? 0, data[offset + 3] ?? 255];
}

function wrapTextureCoordinate(value, mode) {
  if (mode === "clamp-to-edge") return Math.max(0, Math.min(1 - Number.EPSILON, value));
  if (mode === "mirrored-repeat") {
    const period = ((value % 2) + 2) % 2;
    return period <= 1 ? Math.min(period, 1 - Number.EPSILON) : 2 - period;
  }
  const repeated = ((value % 1) + 1) % 1;
  return Math.min(repeated, 1 - Number.EPSILON);
}

function hexByte(value) {
  return Math.max(0, Math.min(255, Math.round(Number(value) || 0))).toString(16).padStart(2, "0");
}

/**
 * Build a RENDER-face → BSP-leaf-indexes map from prepared visibility metadata,
 * for {@link buildQuakeGlyphGeometry}'s PVS leaf tagging.
 *
 * A scene polygon's `data.f` is its RENDER face index (post-merge), but the PVS
 * leaf data is keyed by SOURCE (BSP) faces. A merged render face covers several
 * source faces that can span several leaves, so its leaf set must be the UNION of
 * every source face's leaves — otherwise the polygon is wrongly culled whenever
 * the viewer sees it through a leaf only one of its source faces belongs to.
 *
 * @param {{ candidates?: Array<{ faceIndex: number, sourceFaceIndices?: number[] }>,
 *           metadata?: { sourceFaces?: Array<{ faceIndex: number, leafIndexes: number[] }> } }} [visibility]
 * @returns {Map<number, number[]> | undefined}
 */
export function buildQuakeGlyphFaceLeaves(visibility) {
  const sourceFaces = visibility?.metadata?.sourceFaces;
  if (!Array.isArray(sourceFaces) || !sourceFaces.length) return undefined;
  const sourceFaceLeaves = new Map();
  for (const face of sourceFaces) {
    if (typeof face?.faceIndex === "number" && Array.isArray(face.leafIndexes)) {
      sourceFaceLeaves.set(face.faceIndex, face.leafIndexes);
    }
  }
  const candidates = visibility?.candidates;
  const map = new Map();
  if (Array.isArray(candidates) && candidates.length) {
    for (const candidate of candidates) {
      if (typeof candidate?.faceIndex !== "number") continue;
      const sources = Array.isArray(candidate.sourceFaceIndices) && candidate.sourceFaceIndices.length
        ? candidate.sourceFaceIndices
        : [candidate.faceIndex];
      const leaves = new Set();
      for (const src of sources) {
        const ls = sourceFaceLeaves.get(src);
        if (ls) for (const l of ls) leaves.add(l);
      }
      if (leaves.size) map.set(candidate.faceIndex, [...leaves]);
    }
  } else {
    // No candidate→source map: fall back to source-face leaves keyed directly.
    for (const [faceIndex, leaves] of sourceFaceLeaves) map.set(faceIndex, leaves);
  }
  return map.size ? map : undefined;
}

/**
 * Group brush-model (mover) polygons by their owning entity index. The runtime
 * renders each as a separate glyph entity whose transform follows the mover's
 * live open/close offset.
 *
 * @param {Array<{ vertices: number[][], color?: string, modelIndex?: number, entityIndex?: number }>} polygons
 * @returns {{ version: number, movers: Array<{ entityIndex: number, modelIndex: number, polygons: Array<{ v: number[][], c: string }> }> }}
 */
export function buildQuakeGlyphMovers(polygons) {
  const byEntity = new Map();
  for (const polygon of polygons ?? []) {
    const vertices = polygon?.vertices;
    if (!Array.isArray(vertices) || vertices.length < 3) continue;
    if (!polygon.modelIndex || polygon.entityIndex === undefined) continue;
    let entry = byEntity.get(polygon.entityIndex);
    if (!entry) {
      entry = { entityIndex: polygon.entityIndex, modelIndex: polygon.modelIndex, polygons: [] };
      byEntity.set(polygon.entityIndex, entry);
    }
    entry.polygons.push(glyphPolygon(polygon));
  }
  return { version: QUAKE_GLYPH_GEOMETRY_VERSION, movers: [...byEntity.values()] };
}
