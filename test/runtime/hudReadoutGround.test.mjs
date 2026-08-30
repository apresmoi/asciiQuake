import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "../importTsModule.mjs";

const {
  applyQuakeHudReadoutGround,
  QUAKE_HUD_GROUND_MAX_TEXELS,
} = await importTsModule("src/runtime/render/hudReadoutGroundSheet.ts");

function image(width, height) {
  return { data: new Uint8ClampedArray(width * height * 4), width, height };
}

function setPixel(target, x, y, rgba) {
  target.data.set(rgba, (y * target.width + x) * 4);
}

function pixel(target, x, y) {
  return [...target.data.slice((y * target.width + x) * 4, (y * target.width + x) * 4 + 4)];
}

test("margin zero leaves every source byte unchanged and fills nothing", () => {
  const target = image(3, 2);
  target.data.set([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
  ]);
  const before = target.data.slice();

  assert.equal(applyQuakeHudReadoutGround(target, 0, 3), 0);
  assert.deepEqual(target.data, before);
});

test("margin two dilates from original ink only and cannot run away", () => {
  const target = image(7, 7);
  setPixel(target, 3, 3, [80, 90, 100, 255]);

  const filled = applyQuakeHudReadoutGround(target, 2, 7);

  assert.equal(filled, 12, "radius-two circle has twelve empty texels around its source");
  assert.deepEqual(pixel(target, 1, 3), [0, 0, 0, 255], "the requested radius is filled");
  assert.deepEqual(pixel(target, 0, 3), [0, 0, 0, 0], "new ground cannot seed further growth");
  assert.deepEqual(pixel(target, 1, 1), [0, 0, 0, 0], "pixels outside the circular radius stay empty");
});

test("a halo is clipped to its source frame", () => {
  const target = image(8, 3);
  setPixel(target, 3, 1, [200, 100, 50, 255]);

  const filled = applyQuakeHudReadoutGround(target, 2, 4);

  assert.equal(filled, 6);
  assert.deepEqual(pixel(target, 2, 1), [0, 0, 0, 255], "halo grows inside the source frame");
  assert.deepEqual(pixel(target, 4, 1), [0, 0, 0, 0], "next frame's first column is untouched");
});

test("new ground is opaque black while source colour is preserved and count is exact", () => {
  const target = image(3, 3);
  setPixel(target, 1, 1, [17, 34, 51, 200]);

  const filled = applyQuakeHudReadoutGround(target, 1, 3);

  assert.equal(filled, 4);
  assert.deepEqual(pixel(target, 1, 1), [17, 34, 51, 200]);
  for (const [x, y] of [[1, 0], [0, 1], [2, 1], [1, 2]]) {
    assert.deepEqual(pixel(target, x, y), [0, 0, 0, 255]);
  }
  assert.equal(
    [...target.data].filter((_, index) => index % 4 === 3 && target.data[index] === 255).length,
    filled,
    "reported count matches newly opaque black texels",
  );
});

test("margin is clamped to QUAKE_HUD_GROUND_MAX_TEXELS", () => {
  const makeTarget = () => {
    const target = image(17, 17);
    setPixel(target, 8, 8, [255, 255, 255, 255]);
    return target;
  };
  const clamped = makeTarget();
  const excessive = makeTarget();

  const clampedCount = applyQuakeHudReadoutGround(
    clamped,
    QUAKE_HUD_GROUND_MAX_TEXELS,
    clamped.width,
  );
  const excessiveCount = applyQuakeHudReadoutGround(excessive, 10_000, excessive.width);

  assert.equal(excessiveCount, clampedCount);
  assert.deepEqual(excessive.data, clamped.data);
  assert.deepEqual(pixel(excessive, 15, 8), [0, 0, 0, 0], "no fill beyond the maximum radius");
});
