// Renderer-neutral world geometry for the glyphcss (ASCII) backend.
//
// The polycss render bundle bakes world surfaces into a CSS `meshHtml` string
// with no recoverable vertex data, so the glyph backend cannot reuse it. This
// module captures the raw `scene.polygons` (world-space vertices + the lit
// fallback colour that already encodes texture tone × brightness) into a
// compact payload the runtime can hand straight to `glyphScene.add(...)`.
//
// glyphcss and polycss share the same `Polygon` shape (vertices/color), so the
// payload is just a trimmed, rounded projection of the prepared polygons.

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
