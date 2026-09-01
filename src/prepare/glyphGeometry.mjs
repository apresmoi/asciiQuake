// Renderer-neutral world geometry for the glyphcss (ASCII) backend.
//
// Capture raw `scene.polygons` (world-space vertices + the lit
// fallback colour that already encodes texture tone × brightness) into a
// compact payload the runtime can hand straight to `glyphScene.add(...)`.
//
// The payload is a trimmed, rounded projection of the prepared polygons.

const QUAKE_GLYPH_GEOMETRY_VERSION = 2;
const QUAKE_GLYPH_GEOMETRY_PRECISION = 1000; // 3 decimal places

function roundCoordinate(value) {
  return Math.round(value * QUAKE_GLYPH_GEOMETRY_PRECISION) / QUAKE_GLYPH_GEOMETRY_PRECISION;
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
    for (let t = 0; t < cellsT; t++) {
      const t0 = t / cellsT;
      const t1 = (t + 1) / cellsT;
      for (let s = 0; s < cellsS; s++) {
        const s0 = s / cellsS;
        const s1 = (s + 1) / cellsS;
        const uv = bilinear2(polygon.uvs, (s0 + s1) * 0.5, (t0 + t1) * 0.5);
        const sampled = sampleTextureColor(sampler, uv, polygon.textureWrap);
        const color = sampled ?? (typeof polygon.color === "string" ? polygon.color : "#cccccc");
        out.push(glyphPolygon({
          vertices: [
            bilinear3(vertices, s0, t0),
            bilinear3(vertices, s1, t0),
            bilinear3(vertices, s1, t1),
            bilinear3(vertices, s0, t1),
          ],
          color,
        }));
      }
    }
  }
  return {
    version: QUAKE_GLYPH_GEOMETRY_VERSION,
    polygonCount: out.length,
    polygons: out,
  };
}

function positiveNumber(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
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
  const width = Math.trunc(sampler?.width ?? 0);
  const height = Math.trunc(sampler?.height ?? 0);
  const data = sampler?.data;
  if (width <= 0 || height <= 0 || !data || data.length < width * height * 4) return null;
  const u = wrapTextureCoordinate(uv[0], textureWrap?.s ?? "repeat");
  const v = wrapTextureCoordinate(uv[1], textureWrap?.t ?? "repeat");
  const x = Math.min(width - 1, Math.floor(u * width));
  const y = Math.min(height - 1, Math.floor((1 - v) * height));
  const offset = (y * width + x) * 4;
  if ((data[offset + 3] ?? 255) < 32) return null;
  return `#${hexByte(data[offset])}${hexByte(data[offset + 1])}${hexByte(data[offset + 2])}`;
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
