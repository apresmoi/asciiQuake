import { BASE_TILE, type Polygon, type Vec3 } from "glyphcss";

export interface QuakeTexturePlan {
  canvasH: number;
  canvasW: number;
  screenPts: number[];
  uvAffine: null;
  uvSampleRect: { minU: number; minV: number; maxU: number; maxV: number } | null;
}

/**
 * Renderer-neutral planar footprint used only by asset preparation helpers.
 * GlyphCSS consumes the polygon geometry directly; it does not need a CSS
 * transform or atlas layout plan.
 */
export function computeQuakeTexturePlan(
  polygon: Polygon,
  _index = 0,
  options: { tileSize?: number } = {},
): QuakeTexturePlan | null {
  const vertices = polygon.vertices;
  if (vertices.length < 3) return null;
  const origin = vertices[0];
  const xAxis = firstDirection(vertices, origin);
  if (!xAxis) return null;
  const normal = firstNormal(vertices, origin, xAxis);
  if (!normal) return null;
  const yAxis = normalize(cross(normal, xAxis));
  if (!yAxis) return null;

  const tileSize = options.tileSize ?? BASE_TILE;
  const points = vertices.map((vertex) => [
    dot(subtract(vertex, origin), xAxis) * tileSize,
    dot(subtract(vertex, origin), yAxis) * tileSize,
  ] as const);
  const minX = Math.min(...points.map((point) => point[0]));
  const minY = Math.min(...points.map((point) => point[1]));
  const maxX = Math.max(...points.map((point) => point[0]));
  const maxY = Math.max(...points.map((point) => point[1]));
  const screenPts = points.flatMap(([x, y]) => [x - minX, y - minY]);
  const uvs = polygon.uvs ?? [];

  return {
    canvasW: Math.max(1, Math.ceil(maxX - minX)),
    canvasH: Math.max(1, Math.ceil(maxY - minY)),
    screenPts,
    uvAffine: null,
    uvSampleRect: uvs.length
      ? {
          minU: Math.min(...uvs.map((uv) => uv[0])),
          minV: Math.min(...uvs.map((uv) => uv[1])),
          maxU: Math.max(...uvs.map((uv) => uv[0])),
          maxV: Math.max(...uvs.map((uv) => uv[1])),
        }
      : null,
  };
}

function firstDirection(vertices: Vec3[], origin: Vec3): Vec3 | null {
  for (let index = 1; index < vertices.length; index++) {
    const direction = normalize(subtract(vertices[index], origin));
    if (direction) return direction;
  }
  return null;
}

function firstNormal(vertices: Vec3[], origin: Vec3, xAxis: Vec3): Vec3 | null {
  for (let index = 2; index < vertices.length; index++) {
    const normal = normalize(cross(xAxis, subtract(vertices[index], origin)));
    if (normal) return normal;
  }
  return null;
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalize(value: Vec3): Vec3 | null {
  const length = Math.hypot(value[0], value[1], value[2]);
  return length > 1e-9
    ? [value[0] / length, value[1] / length, value[2] / length]
    : null;
}
