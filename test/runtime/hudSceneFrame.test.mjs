/**
 * Pins `quakeHudSceneFrame`'s small-viewport floor: desktop sizes stay on the
 * old `83.2vh` rule, a landscape phone is scaled up to a 44 CSS px readout,
 * and `100vw` still wins last.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "../importTsModule.mjs";

const { quakeHudSceneFrame } = await importTsModule(
  "src/runtime/render/hudSceneManifest.ts",
);

/** Pre-floor CSS rule: `min(max(320px, 83.2vh), 100vw)`. */
function oldHudWidth(hostW, hostH) {
  return Math.min(Math.max(320, 0.832 * hostH), hostW);
}

function assertClose(actual, expected, message) {
  assert.ok(
    Math.abs(actual - expected) <= 1e-6,
    `${message}: ${actual} vs ${expected}`,
  );
}

function assertPlacement(frame, hostW, hostH) {
  assert.equal(frame.x, (hostW - frame.w) / 2, "frame is centred horizontally");
  assert.equal(frame.y, hostH - frame.h, "frame is flush to the bottom");
}

const DESKTOPS = [
  [1600, 900],
  [1440, 900],
  [1366, 768],
  [1280, 720],
];

test("desktop viewports are unchanged by the small-viewport floor", () => {
  for (const [hostW, hostH] of DESKTOPS) {
    const frame = quakeHudSceneFrame(hostW, hostH);
    const oldW = oldHudWidth(hostW, hostH);
    assert.equal(frame.w, oldW, `${hostW}x${hostH} width matches the old rule`);
    assert.equal(
      frame.h,
      (oldW * 24) / 320,
      `${hostW}x${hostH} height follows 320/24`,
    );
    assertPlacement(frame, hostW, hostH);
  }
});

test("landscape phone is scaled up to the 44 CSS px readout floor", () => {
  const hostW = 846;
  const hostH = 411;
  const oldW = oldHudWidth(hostW, hostH);
  // Old rule at 846x411: w = 342.0, readout h = 25.65.
  assert.ok(Math.abs(oldW - 342) < 0.05, `old width ≈ 342.0, got ${oldW}`);
  assert.ok(
    Math.abs((oldW * 24) / 320 - 25.65) < 0.01,
    `old readout h ≈ 25.65, got ${(oldW * 24) / 320}`,
  );

  const frame = quakeHudSceneFrame(hostW, hostH);
  assert.ok(frame.w > oldW, "new width is scaled UP from the old 83.2vh result");
  // Floor width 44 * 320 / 24 = 586.6̅, documented as 586.667.
  assertClose(frame.w, (44 * 320) / 24, "w = 586.667");
  assertClose(frame.h, 44, "readout h = 44.0");
  assertPlacement(frame, hostW, hostH);
});

test("100vw cap still wins last on a narrow portrait viewport", () => {
  const hostW = 411;
  const hostH = 846;
  const frame = quakeHudSceneFrame(hostW, hostH);
  assert.equal(frame.w, hostW, "full-bleed: w equals hostW, never wider");
  assertPlacement(frame, hostW, hostH);
});

test("frame stays centred horizontally and flush to the bottom", () => {
  for (const [hostW, hostH] of [
    ...DESKTOPS,
    [846, 411],
    [411, 846],
    [1000, 700],
    [1000, 710],
  ]) {
    assertPlacement(quakeHudSceneFrame(hostW, hostH), hostW, hostH);
  }
});

test("floor binds just below hostH = 705.13 and 0.832*hostH wins just above", () => {
  const hostW = 1600;
  const threshold = 705.13;
  const floorW = (44 * 320) / 24;

  const belowH = threshold - 0.01;
  const below = quakeHudSceneFrame(hostW, belowH);
  assert.ok(
    0.832 * belowH < floorW,
    "just below 705.13, 83.2vh is under the floor",
  );
  assertClose(below.w, floorW, "floor wins just below hostH = 705.13");
  assertPlacement(below, hostW, belowH);

  const aboveH = threshold + 0.01;
  const above = quakeHudSceneFrame(hostW, aboveH);
  assert.ok(
    0.832 * aboveH > floorW,
    "just above 705.13, 83.2vh is over the floor",
  );
  assertClose(above.w, 0.832 * aboveH, "0.832*hostH wins just above hostH = 705.13");
  assertPlacement(above, hostW, aboveH);
});
