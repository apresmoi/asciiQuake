import { debugMapUrl, waitForDebugMapReady } from "./browserHarnessSupport.mjs";
import { defineBrowserFixture } from "./fixtureHarness.mjs";

/**
 * Portrait boot → landscape rotation must keep the camera's look-target
 * distance in sync with the viewport perspective.
 *
 * polycss's first-person controls place the camera target at
 * `parseFloat(scene.camera.perspectiveStyle) / BASE_TILE` in front of the eye,
 * and `perspectiveStyle` is a plain property frozen at camera creation. The
 * app refreshes the CSS `--polycss-fpv-perspective` var on resize, but until
 * the fix in cameraViewFlow.syncViewportProjection it never refreshed the
 * JS-side property — so after rotating a portrait boot to landscape the
 * controls kept placing the target at the portrait look distance while every
 * eye-from-target consumer (the glyph overlay, the DOM projection) used the
 * landscape perspective. Net effect: the rendered eye was displaced ~9 poly
 * units (~450 Quake units) forward along the view direction. Near a wall the
 * world rasterized to almost nothing — the "camera flickers outside the map"
 * bug measured on a Galaxy S23 (846x411 landscape after portrait boot).
 */

const PORTRAIT = { width: 411, height: 846 };
const LANDSCAPE = { width: 846, height: 411 };
// Standing against the corridor's east wall, looking along it (poly units) —
// the pose the S23 flicker was pinned to. With the stale-perspective bug the
// displaced eye sits inside the wall and the world grid renders < 300 cells.
const WALL_POSE = [2.879375, 13.439375, -0.03937499999999994, 90, 270];
const MIN_WORLD_INK = 8000;
// Poly units. The portrait/landscape mismatch this guards against is ~8.9.
const TARGET_DISTANCE_EPSILON = 0.05;

export const viewportRotationCameraFixture = defineBrowserFixture({
  id: "viewport-rotation-camera",
  label: "Viewport rotation camera perspective fixture",
  artifact: "bench/results/quake/viewport-rotation-camera-summary.json",
  family: "camera",
  maps: ["e1m1"],
  run: runViewportRotationCameraFixture,
});

async function runViewportRotationCameraFixture({ browser, baseUrl, options }) {
  const failures = [];
  let rotated = null;
  let reference = null;
  let page = await browser.newPage({ viewport: PORTRAIT });
  try {
    await page.goto(debugMapUrl(baseUrl, "e1m1"), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await waitForDebugMapReady(page, { mapName: "e1m1", timeoutMs: options.timeoutMs });
    // Rotate AFTER load — the portrait boot must not leave a stale perspective.
    await page.setViewportSize(LANDSCAPE);
    await page.waitForTimeout(1000);
    rotated = await measureCameraState(page);
    await page.close();
    page = null;

    // Reference: a direct landscape load of the same map.
    page = await browser.newPage({ viewport: LANDSCAPE });
    await page.goto(debugMapUrl(baseUrl, "e1m1"), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await waitForDebugMapReady(page, { mapName: "e1m1", timeoutMs: options.timeoutMs });
    reference = await measureCameraState(page);
  } finally {
    await page?.close();
  }

  for (const [label, state] of [["rotated", rotated], ["reference", reference]]) {
    if (!Number.isFinite(state.targetDistance) || !Number.isFinite(state.expectedTargetDistance)) {
      failures.push(`${label}: camera target distance unreadable: ${JSON.stringify(state)}`);
    } else if (Math.abs(state.targetDistance - state.expectedTargetDistance) > TARGET_DISTANCE_EPSILON) {
      failures.push(
        `${label}: camera look-target distance ${state.targetDistance.toFixed(3)} poly does not match ` +
        `the applied perspective's ${state.expectedTargetDistance.toFixed(3)} poly — the render eye derived ` +
        `back out of the target is displaced along the view direction (stale scene.camera.perspectiveStyle)`,
      );
    }
  }
  if (rotated.wallPoseInk < MIN_WORLD_INK) {
    failures.push(
      `world grid nearly empty at the wall pose after rotation: ink=${rotated.wallPoseInk} ` +
      `(reference landscape load: ${reference.wallPoseInk}) — displaced render eye`,
    );
  }
  if (reference.wallPoseInk < MIN_WORLD_INK) {
    failures.push(`reference landscape load unexpectedly sparse at the wall pose: ink=${reference.wallPoseInk}`);
  }

  if (failures.length) {
    throw new Error(`Viewport rotation camera fixture failed:\n${failures.join("\n")}`);
  }
  return {
    kind: "cssquake-viewport-rotation-camera",
    startedAt: new Date().toISOString(),
    rotated,
    reference,
    passed: true,
  };
}

async function measureCameraState(page) {
  return page.evaluate(async (pose) => {
    const POLYCSS_BASE_TILE = 50; // px per poly unit; the controls' target sits at perspective/BASE_TILE.
    const overlay = window.__quakeGlyphOverlay;
    // Measure the LIVE camera state before any debug teleport: setViewpos would
    // re-place the target through the app's (viewport-aware) path and hide the
    // staleness this fixture exists to catch.
    const params = overlay?.__cameraParams?.();
    const eye = overlay?.__debugEye?.();
    const target = params?.target;
    const targetDistance = target && eye
      ? Math.hypot(target[0] - eye[0], target[1] - eye[1], target[2] - eye[2])
      : Number.NaN;
    const perspectiveHost = document.querySelector('[style*="--polycss-fpv-perspective"]');
    const appliedPerspectivePx = perspectiveHost
      ? Number.parseFloat(perspectiveHost.style.getPropertyValue("--polycss-fpv-perspective"))
      : Number.NaN;
    const expectedTargetDistance = appliedPerspectivePx / POLYCSS_BASE_TILE;
    // Behavioral check: the ASCII world grid at the wall-hug pose.
    let wallPoseInk = -1;
    if (overlay && typeof overlay.setFixedView === "function") {
      overlay.setFixedView(pose[0], pose[1], pose[2], pose[3], pose[4]);
      await new Promise((resolve) => setTimeout(resolve, 150));
      const pre = overlay.element.querySelector("pre");
      wallPoseInk = (pre?.textContent ?? "").replace(/\s/g, "").length;
    }
    return {
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      appliedPerspectivePx,
      targetDistance,
      expectedTargetDistance,
      wallPoseInk,
    };
  }, WALL_POSE);
}
