import assert from "node:assert/strict";
import test from "node:test";

import {
  buildQuakeGlyphFaceLeaves,
  buildQuakeGlyphGeometry,
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
