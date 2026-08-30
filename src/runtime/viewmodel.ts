import {
  buildPolySceneTransform,
  polyCssDistanceToWorld,
  type PolyFirstPersonControlsHandle,
  type PolyMeshHandle,
  type PolySceneHandle,
  type Vec3,
  worldPositionToPolyCss,
} from "@layoutit/polycss";

import type { QuakePreparedRenderBundle } from "../prepare/scene";
import { COLLISION_EPSILON, QUAKE_COLLISION_UNIT_SCALE } from "./constants";
import { crossVec3, normalizeVec3 } from "./math";
import { mountQuakeRenderBundleMesh, stripPolyMeshMetadata } from "./renderBundleMesh";
import { quakeRuntimeViewportSize, type QuakeRuntimeViewportSize } from "./viewport";
import type { QuakeGlyphGeometry } from "../types/quake";
import type { QuakeGlyphEntitySink } from "./pickups";
import type { QuakeGlyphEntityTransform } from "./render/glyphWorldOverlay";

export interface QuakeViewmodelController {
  mount(model: QuakeViewmodelModel): void;
  remove(): void;
  hasWeapon(): boolean;
  setVisible(visible: boolean): void;
  debugSnapshot(): QuakeViewmodelDebugSnapshot;
  getTuning(): QuakeResolvedViewmodelTuning;
  setTuning(tuning: QuakeViewmodelTuning): QuakeResolvedViewmodelTuning;
  resetTuning(): QuakeResolvedViewmodelTuning;
  syncTransform(options?: QuakeViewmodelSyncOptions): void;
  queueViewportSync(): void;
  playFireAnimation(animation?: QuakeViewmodelFireAnimation): void;
  clearFireAnimation(): void;
}

export interface QuakeViewmodelSyncOptions {
  stable?: boolean;
}

export interface QuakeViewmodelFireAnimation {
  frameIntervalMs: number;
  frames: readonly number[];
  firstFrameMuzzleFlash?: boolean;
}

export interface QuakeViewmodelTuning {
  forwardOffset?: number;
  rightOffset?: number;
  upOffset?: number;
  horizontalScale?: number;
  verticalScale?: number;
  depthScale?: number;
  localYOffsetPx?: number;
  localPitchDeg?: number;
  localPivotXPx?: number;
  localPivotYPx?: number;
  localPivotZPx?: number;
  screenXOffsetPx?: number;
  screenYOffsetPx?: number;
  screenScaleX?: number;
  screenScaleY?: number;
  perspectiveScale?: number;
  stageOffsetPx?: number;
  perspectiveOriginXOffsetPx?: number;
  perspectiveOriginYOffsetPx?: number;
}

export type QuakeResolvedViewmodelTuning = Required<QuakeViewmodelTuning>;

export interface QuakeViewmodelModel {
  source: string;
  renderBundle: QuakePreparedRenderBundle;
  /**
   * Per-frame ASCII (glyphcss) geometry — index 0 = idle, 1 = fire/muzzle —
   * mirroring the render bundle's first-2-frame slice. Present when the prepare
   * step emits glyph geometry; consumed only in the glyphcss render mode.
   */
  glyphFrames?: QuakeGlyphGeometry[];
}

export interface QuakeViewmodelDebugSnapshot {
  mounted: boolean;
  source: string | null;
  tuning: QuakeResolvedViewmodelTuning;
  camera: {
    rotX: number;
    rotY: number;
    weaponRotX: number;
    weaponPitch: number;
  };
  origin: Vec3;
  renderOrigin: Vec3;
  bob: {
    walk: number;
    fireForwardKick: number;
    fireUpKick: number;
  };
  viewport: {
    layerScale: number;
    referenceWidth: number;
    referenceHeight: number;
    perspectivePx: number;
    stageOffsetPx: number;
    perspectiveOriginXOffsetPx: number;
    perspectiveOriginYOffsetPx: number;
    baseScale: number;
  };
  weapon: {
    position: Vec3;
    rotation: Vec3;
    scale: Vec3;
    forwardOffset: number;
    rightOffset: number;
    upOffset: number;
    forward: Vec3;
    right: Vec3;
    up: Vec3;
  };
  layer: QuakeViewmodelElementDebugSnapshot | null;
  stage: (QuakeViewmodelElementDebugSnapshot & {
    target: Vec3;
    lookOffset: number;
    cameraScale: number;
    cameraTranslateZ: number;
  }) | null;
  mesh: (QuakeViewmodelElementDebugSnapshot & {
    localTransform: string;
    leafCount: number;
    leafTagCounts: Record<"b" | "i" | "s" | "u", number>;
    leafBounds: QuakeViewmodelDebugRect | null;
  }) | null;
}

export interface QuakeViewmodelElementDebugSnapshot {
  id: string | null;
  className: string;
  rect: QuakeViewmodelDebugRect;
  inlineStyle: QuakeViewmodelDebugStyleSnapshot;
  computedStyle: QuakeViewmodelDebugStyleSnapshot;
}

export interface QuakeViewmodelDebugStyleSnapshot {
  left: string;
  top: string;
  width: string;
  height: string;
  transform: string | null;
  transformOrigin: string;
  perspective: string;
  perspectiveOrigin: string;
  zoom: string;
}

export interface QuakeViewmodelDebugRect {
  x: number;
  y: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

export interface QuakeViewmodelControllerOptions {
  scene: PolySceneHandle;
  controls: Pick<PolyFirstPersonControlsHandle, "getOrigin">;
  getRenderOrigin?: () => Vec3;
  host: HTMLElement;
  layer: HTMLElement | null;
  /**
   * Glyph entity layer (the world overlay) for rendering the weapon as ASCII in
   * glyphcss mode. When present AND `renderModeIsGlyph()` is true, the weapon is
   * mirrored into the overlay as a world-space entity at the eye and the raster
   * canvas is hidden. Absent / polycss mode → the raster weapon is used.
   */
  glyphEntitySink?: QuakeGlyphEntitySink;
  renderModeIsGlyph?: () => boolean;
  /**
   * Empirical size multiplier for the ASCII weapon (the model's own units +
   * weapon perspective don't map 1:1 onto the world perspective). Tunable via
   * `?glyphWeaponScale=`. Default {@link QUAKE_GLYPH_WEAPON_SCALE}.
   */
  glyphWeaponScale?: number;
  /**
   * Fraction of the raster weapon's eye→weapon offset to apply in the world
   * frame (brings the weapon from metres away to the hand). Tunable via
   * `?glyphWeaponReach=`. Default {@link QUAKE_GLYPH_WEAPON_REACH}.
   */
  glyphWeaponReach?: number;
}

const QUAKE_WEAPON_GLYPH_ID = "viewmodel:weapon";
// Per-mesh lift over the world overlay's brighten (see the transform's
// `toneScale` doc): measured 2026-08 against the cssquake.wtf gun. The lift
// lands sub-linearly (the tone pipe's channel-clip guard caps the gun's
// bright metal), so the factor is larger than the raw ink deficit: 1.6
// measured the glyph gun's ink mean level with the reference gun's under the
// retuned world tone at the default entity density.
const QUAKE_WEAPON_GLYPH_TONE_SCALE = 1.6;
// The ASCII weapon is the same model rendered in the WORLD camera's own
// projection instead of the raster path's dedicated close-up weapon-stage
// perspective (a SEPARATE, near-field-tuned `perspective` CSS value the glyph
// engine has no equivalent of — see `syncTransform`'s glyph branch), so its
// on-screen size needs an empirical factor on top of the per-axis weapon
// scale. Tunable (?glyphWeaponScale). Calibrated 2026-08 against the measured
// cssquake.wtf reference (width frac ~0.090, aspect ~1.04) — see the report
// for the sweep this and REACH were solved from together.
const QUAKE_GLYPH_WEAPON_SCALE = 0.756;
// Fraction of the raster weapon's eye→weapon offset to apply in the WORLD
// camera's own projection (there's no separate near-field weapon-stage
// perspective to place it in — see the class doc). This multiplies the whole
// eye→weapon offset (preserving the bob/punch proportions baked into it), so
// forward/right/up all scale together.
//
// A prior pass pushed this to 7 (far-field) on the theory that the mesh's own
// depth extent (~5.7 world units) at a near distance caused severe near/far
// foreshortening. Measured (2026-08, bounded reach sweep at fixed pose):
// that theory doesn't hold — aspect and vertical centring both get WORSE as
// reach grows past ~1, and both converge close to the cssquake.wtf reference
// (aspect ~1.04, width ~0.09, centre ~0.86) in a 0.5-0.7 band. The far-field
// value was very likely overcompensating for the double-pitch rotation bug
// that got fixed in the same round (visible distortion at close range, wrongly
// attributed to distance rather than the corrupted rotation) — with rotation
// fixed, a near-field reach close to the raster's own proportions is correct.
// Tunable (?glyphWeaponReach).
const QUAKE_GLYPH_WEAPON_REACH = 0.65;
// Small forward depth bias so the close weapon wins the depth test against
// world geometry right at the muzzle (FPS weapons render on top), matching how
// the polycss weapon sits in its own layer above the world.
const QUAKE_GLYPH_WEAPON_DEPTH_BIAS = 0.02;
// The exported glyph mesh's own rest frame doesn't have local +X held exactly
// along the camera's forward axis the way `quakeAliasModelRenderYaw` assumes
// for world-facing entities (monsters/pickups) — viewmodel frames are posed
// "held up in front of the viewer," not "standing facing a direction," so the
// rest pose carries its own fixed cant. Measured empirically: swept the raw
// yaw at two different camera yaws (90° and 0°) and found the SAME -20° offset
// reproduces the reference aspect (~1.04) at both — i.e. a real, portable axis-
// convention constant, not a pose-specific fit. See the report for the sweep.
const QUAKE_GLYPH_WEAPON_YAW_OFFSET = -20;
// Small additional drop below the raster upOffset, verified (2026-08) to still
// help at the corrected near-field REACH: with it, aspect/width/centring all
// land close to the cssquake.wtf reference at both the desktop and phone
// viewports; zeroing it measurably worsens aspect and width (re-verified after
// the REACH fix — not a leftover far-field-only knob).
const QUAKE_GLYPH_WEAPON_VERTICAL_ADJUST = -0.5;
const QUAKE_WEAPON_FORWARD_OFFSET = 3.1;
const QUAKE_WEAPON_RIGHT_OFFSET = 0;
const QUAKE_WEAPON_UP_OFFSET = -0.3;
const QUAKE_WEAPON_REFERENCE_VIEWPORT_WIDTH_PX = 1280;
const QUAKE_WEAPON_REFERENCE_VIEWPORT_HEIGHT_PX = 720;
const QUAKE_WEAPON_REFERENCE_SCENE_PERSPECTIVE_PX = 745.1083333333332;
const QUAKE_WEAPON_REFERENCE_STAGE_OFFSET_PX = 30.887;
const QUAKE_WEAPON_REFERENCE_BASE_SCALE = 1.7046145833333335;
const QUAKE_WEAPON_DEFAULT_TUNING: QuakeResolvedViewmodelTuning = {
  forwardOffset: QUAKE_WEAPON_FORWARD_OFFSET,
  rightOffset: QUAKE_WEAPON_RIGHT_OFFSET,
  upOffset: QUAKE_WEAPON_UP_OFFSET,
  horizontalScale: 1.612,
  verticalScale: 0.96,
  depthScale: 1.38,
  localYOffsetPx: -25,
  localPitchDeg: 13,
  localPivotXPx: 0,
  localPivotYPx: 0,
  localPivotZPx: 0,
  screenXOffsetPx: -1,
  screenYOffsetPx: 12.5,
  screenScaleX: 0.98,
  screenScaleY: 1,
  perspectiveScale: 0.8,
  stageOffsetPx: QUAKE_WEAPON_REFERENCE_STAGE_OFFSET_PX,
  perspectiveOriginXOffsetPx: 0,
  perspectiveOriginYOffsetPx: 0,
};
const QUAKE_WEAPON_MODEL_TUNING_OVERRIDES: Record<string, QuakeViewmodelTuning> = {
  "progs/v_axe.mdl": {
    localPitchDeg: 11,
    screenXOffsetPx: -4,
    screenYOffsetPx: 15,
    screenScaleX: 0.866,
    screenScaleY: 0.972,
  },
  "progs/v_shot2.mdl": {
    screenScaleX: 1.149,
    screenScaleY: 1.394,
  },
  "progs/v_nail.mdl": {
    screenScaleX: 0.907,
    screenScaleY: 0.871,
  },
  "progs/v_nail2.mdl": {
    screenScaleX: 0.894,
    screenScaleY: 0.864,
  },
  "progs/v_rock.mdl": {
    screenScaleX: 0.96,
    screenScaleY: 0.971,
  },
  "progs/v_rock2.mdl": {
    screenScaleX: 0.87,
    screenScaleY: 0.835,
  },
  "progs/v_light.mdl": {
    screenScaleX: 0.916,
    screenScaleY: 0.922,
  },
};
const QUAKE_WEAPON_SCREEN_ROT_X = 90;
const QUAKE_WEAPON_MUZZLE_FLASH_MS = 45;
const QUAKE_WEAPON_FIRE_ANIMATION_FRAME_MS = QUAKE_WEAPON_MUZZLE_FLASH_MS;
const QUAKE_WEAPON_DEFAULT_FIRE_ANIMATION: QuakeViewmodelFireAnimation = {
  frameIntervalMs: QUAKE_WEAPON_MUZZLE_FLASH_MS,
  frames: [1],
};
const QUAKE_WEAPON_KICK_SETTLE_MS = 160;
const QUAKE_WEAPON_KICK_RECOVER_MS = 280;
const QUAKE_WEAPON_BOB = 0.02;
const QUAKE_WEAPON_BOB_CYCLE_SECONDS = 0.6;
const QUAKE_WEAPON_BOB_UP = 0.5;
const QUAKE_WEAPON_BOB_FORWARD_SCALE = 0.7;
const QUAKE_WEAPON_BOB_MIN_DT = 1 / 120;
const QUAKE_WEAPON_BOB_STOP_SPEED = 1 * QUAKE_COLLISION_UNIT_SCALE;
const QUAKE_WEAPON_BOB_TELEPORT_DISTANCE = 128 * QUAKE_COLLISION_UNIT_SCALE;
const QUAKE_WEAPON_BOB_MIN = -7 * QUAKE_COLLISION_UNIT_SCALE;
const QUAKE_WEAPON_BOB_MAX = 4 * QUAKE_COLLISION_UNIT_SCALE;
const QUAKE_WEAPON_SHORT_LANDSCAPE_MAX_HEIGHT_PX = 560;

export function createQuakeViewmodelController({
  scene,
  controls,
  getRenderOrigin,
  host,
  layer,
  glyphEntitySink,
  renderModeIsGlyph,
  glyphWeaponScale,
  glyphWeaponReach,
}: QuakeViewmodelControllerOptions): QuakeViewmodelController {
  const stage = layer ? createQuakeViewmodelStage(layer) : null;
  let handle: PolyMeshHandle | null = null;
  // Glyph (ASCII) weapon: mirror the weapon into the world overlay's entity
  // layer instead of drawing the polycss carrier. Render mode is fixed for the
  // controller's lifetime (a mode change forces a full remount).
  const glyphMode = (renderModeIsGlyph?.() ?? false) && glyphEntitySink != null;
  const glyphSink: QuakeGlyphEntitySink | null = glyphMode ? (glyphEntitySink ?? null) : null;
  const glyphScaleFactor = glyphWeaponScale ?? QUAKE_GLYPH_WEAPON_SCALE;
  const glyphReach = glyphWeaponReach ?? QUAKE_GLYPH_WEAPON_REACH;
  let glyphFrames: QuakeGlyphGeometry[] | null = null;
  let glyphFrameIndex = 0;
  let glyphRegistered = false;
  let lastGlyphWeaponTransform: QuakeGlyphEntityTransform | null = null;
  let carrier: HTMLElement | null = null;
  let viewportSyncFrame = 0;
  let cachedLayerScale = 1;
  let layerViewportDirty = true;
  let hostResizeObserver: ResizeObserver | null = null;
  let fireForwardKick = 0;
  let fireUpKick = 0;
  let fireAnimationTimer: number | null = null;
  let fireFrameTimers: number[] = [];
  let fireKickTimers: number[] = [];
  let tuning: QuakeResolvedViewmodelTuning = { ...QUAKE_WEAPON_DEFAULT_TUNING };
  let appliedLocalTransform = "";
  let walkBob = 0;
  let walkBobOrigin: Vec3 | null = null;
  let walkBobAt = 0;
  let mountedSource: string | null = null;
  let visible = true;

  if (typeof ResizeObserver !== "undefined") {
    hostResizeObserver = new ResizeObserver(() => {
      invalidateViewportLayer();
      queueViewportSync();
    });
    hostResizeObserver.observe(host);
  }

  function mount(model: QuakeViewmodelModel): void {
    const source = normalizedViewmodelSource(model.source);
    if (carrier && mountedSource === source) {
      syncTransform();
      return;
    }
    clearFireAnimation();
    resetWalkBob();
    invalidateViewportLayer();
    handle?.remove();
    handle = null;
    carrier = null;
    if (!stage) throw new Error("Quake viewmodel mount requires a viewmodel stage.");
    handle = mountQuakeRenderBundleMesh(stage, model.renderBundle);
    carrier = handle.element;
    carrier.classList.add("viewmodel", "quake-viewmodel-transform");
    stripPolyMeshMetadata(carrier);
    appliedLocalTransform = "";
    // Glyph mode: hide the polycss carrier (the ASCII weapon renders in the
    // world overlay instead) and load this weapon's per-frame glyph geometry.
    if (glyphMode) {
      if (layer) layer.hidden = true;
      removeGlyphWeapon();
      glyphFrames = model.glyphFrames ?? null;
      glyphFrameIndex = 0;
      lastGlyphWeaponTransform = null;
    }
    mountedSource = source;
    prepareNozzleLeaves();
    syncTransform();
    setNozzleVisible(false);
  }

  function remove(): void {
    clearFireAnimation();
    resetWalkBob();
    handle?.remove();
    handle = null;
    carrier = null;
    removeGlyphWeapon();
    glyphFrames = null;
    lastGlyphWeaponTransform = null;
    appliedLocalTransform = "";
    mountedSource = null;
  }

  function hasWeapon(): boolean {
    return carrier !== null;
  }

  function setVisible(nextVisible: boolean): void {
    visible = nextVisible;
    // In glyph mode the raster layer stays hidden regardless (the ASCII weapon
    // lives in the world overlay); toggle the overlay entity instead.
    if (layer) layer.hidden = !visible || glyphMode;
    if (glyphMode) {
      if (!visible) removeGlyphWeapon();
      else if (carrier) syncTransform();
    }
  }

  function debugSnapshot(): QuakeViewmodelDebugSnapshot {
    const movementOrigin = controls.getOrigin();
    const origin = getRenderOrigin?.() ?? movementOrigin;
    const rotX = weaponViewRotX(scene.camera.state.rotX ?? 88);
    const rotY = scene.camera.state.rotY ?? 270;
    const currentTuning = activeTuning();
    const weapon = debugWeaponTransform(weaponTransform(origin, rotX, rotY, walkBob));
    const stageTransform = weaponStageTransform();
    const target = roundDebugVec3(weaponStageTarget(origin, rotX, rotY));
    return {
      mounted: carrier !== null,
      source: mountedSource,
      tuning: currentTuning,
      camera: {
        rotX: scene.camera.state.rotX ?? 88,
        rotY,
        weaponRotX: rotX,
        weaponPitch: rotX - 90,
      },
      origin: [movementOrigin[0], movementOrigin[1], movementOrigin[2]],
      renderOrigin: [origin[0], origin[1], origin[2]],
      bob: {
        walk: roundDebugNumber(walkBob),
        fireForwardKick: roundDebugNumber(fireForwardKick),
        fireUpKick: roundDebugNumber(fireUpKick),
      },
      viewport: {
        layerScale: roundDebugNumber(cachedLayerScale),
        referenceWidth: QUAKE_WEAPON_REFERENCE_VIEWPORT_WIDTH_PX,
        referenceHeight: QUAKE_WEAPON_REFERENCE_VIEWPORT_HEIGHT_PX,
        perspectivePx: roundDebugNumber(weaponPerspectivePx()),
        stageOffsetPx: roundDebugNumber(currentTuning.stageOffsetPx),
        perspectiveOriginXOffsetPx: roundDebugNumber(currentTuning.perspectiveOriginXOffsetPx),
        perspectiveOriginYOffsetPx: roundDebugNumber(currentTuning.perspectiveOriginYOffsetPx),
        baseScale: QUAKE_WEAPON_REFERENCE_BASE_SCALE,
      },
      weapon,
      layer: layer ? elementDebugSnapshot(layer) : null,
      stage: stage ? {
        ...elementDebugSnapshot(stage),
        target,
        lookOffset: roundDebugNumber(polyCssDistanceToWorld(weaponPerspectivePx())),
        cameraScale: roundDebugNumber(polyCssDistanceToWorld(scene.camera.state.zoom ?? 1)),
        cameraTranslateZ: roundDebugNumber(-(scene.camera.state.distance ?? 0)),
        inlineStyle: {
          ...elementInlineStyleSnapshot(stage),
          transform: stageTransform || null,
        },
      } : null,
      mesh: carrier ? {
        ...elementDebugSnapshot(carrier),
        localTransform: appliedLocalTransform,
        ...meshLeafDebugSnapshot(carrier),
      } : null,
    };
  }

  function getTuning(): QuakeResolvedViewmodelTuning {
    return { ...tuning };
  }

  function activeTuning(): QuakeResolvedViewmodelTuning {
    const override = mountedSource ? QUAKE_WEAPON_MODEL_TUNING_OVERRIDES[mountedSource] : undefined;
    return override ? sanitizeViewmodelTuning(override, tuning) : tuning;
  }

  function setTuning(next: QuakeViewmodelTuning): QuakeResolvedViewmodelTuning {
    tuning = sanitizeViewmodelTuning(next, tuning);
    invalidateViewportLayer();
    syncTransform({ stable: true });
    return getTuning();
  }

  function resetTuning(): QuakeResolvedViewmodelTuning {
    tuning = { ...QUAKE_WEAPON_DEFAULT_TUNING };
    invalidateViewportLayer();
    syncTransform({ stable: true });
    return getTuning();
  }

  function syncTransform(options: QuakeViewmodelSyncOptions = {}): void {
    if (!carrier) return;
    if (options.stable) resetWalkBob();
    const movementOrigin = controls.getOrigin();
    const origin = getRenderOrigin?.() ?? movementOrigin;
    const bob = updateWalkBob(movementOrigin);
    const rotX = weaponViewRotX(scene.camera.state.rotX ?? 88);
    const rotY = scene.camera.state.rotY ?? 270;
    const weapon = weaponTransform(origin, rotX, rotY, bob);
    syncCarrierTransform(weapon);
    syncLayer();
    // Glyph mode: the carrier is hidden; mirror the weapon into the world overlay.
    // Reuse the SAME pinned-pitch `weapon` the raster carrier uses. `rotX` is a
    // constant 90 (weaponViewRotX) — like the raster path's "stage", the glyph
    // world overlay's own camera (synced separately, see App.ts's
    // `scene.applyCamera` wrapper) already carries the REAL view pitch and
    // applies it to every world entity including this one, so the weapon's own
    // offset math must stay pitch-free or the pitch gets applied twice and
    // distorts the gun's pose/aspect as you look up/down.
    if (glyphMode) {
      syncGlyphWeapon(weapon, origin);
    }
  }

  function queueViewportSync(): void {
    invalidateViewportLayer();
    if (viewportSyncFrame) return;
    viewportSyncFrame = window.requestAnimationFrame(() => {
      viewportSyncFrame = 0;
      syncTransform();
    });
  }

  function playFireAnimation(animation: QuakeViewmodelFireAnimation = QUAKE_WEAPON_DEFAULT_FIRE_ANIMATION): void {
    const frames = sanitizeFireAnimationFrames(animation.frames);
    const frameIntervalMs = Math.min(
      sanitizeFireAnimationFrameInterval(animation.frameIntervalMs),
      QUAKE_WEAPON_FIRE_ANIMATION_FRAME_MS,
    );
    const firstFrameDurationMs = animation.firstFrameMuzzleFlash
      ? Math.min(QUAKE_WEAPON_MUZZLE_FLASH_MS, frameIntervalMs)
      : frameIntervalMs;
    clearFrameTimers();
    setWeaponFrameIndex(frames[0] ?? 1);
    frames.slice(1).forEach((frame, index) => {
      fireFrameTimers.push(window.setTimeout(() => setWeaponFrameIndex(frame), firstFrameDurationMs + frameIntervalMs * index));
    });
    if (fireAnimationTimer !== null) window.clearTimeout(fireAnimationTimer);
    fireAnimationTimer = window.setTimeout(() => {
      setWeaponFrameIndex(0);
      fireAnimationTimer = null;
    }, firstFrameDurationMs + frameIntervalMs * Math.max(0, frames.length - 1));

    clearKickTimers();
    setKick(-0.52, -0.1);
    fireKickTimers.push(
      window.setTimeout(() => setKick(-0.22, -0.04), QUAKE_WEAPON_KICK_SETTLE_MS),
      window.setTimeout(() => setKick(0, 0), QUAKE_WEAPON_KICK_RECOVER_MS),
    );
  }

  function clearFireAnimation(): void {
    if (fireAnimationTimer !== null) {
      window.clearTimeout(fireAnimationTimer);
      fireAnimationTimer = null;
    }
    clearFrameTimers();
    clearKickTimers();
    fireForwardKick = 0;
    fireUpKick = 0;
    setNozzleVisible(false);
    if (viewportSyncFrame) {
      window.cancelAnimationFrame(viewportSyncFrame);
      viewportSyncFrame = 0;
    }
  }

  function clearFrameTimers(): void {
    for (const timer of fireFrameTimers) window.clearTimeout(timer);
    fireFrameTimers = [];
  }

  function clearKickTimers(): void {
    for (const timer of fireKickTimers) window.clearTimeout(timer);
    fireKickTimers = [];
  }

  function setKick(forward: number, up: number): void {
    fireForwardKick = forward;
    fireUpKick = up;
    syncTransform();
  }

  function setNozzleVisible(visible: boolean): void {
    if (!carrier) return;
    carrier.classList.toggle("quake-nozzle-visible", visible);
  }

  function setWeaponFrameIndex(frameIndex: number): void {
    setNozzleVisible(frameIndex > 0);
    if (glyphSink && glyphFrames) {
      glyphFrameIndex = frameIndex;
      // Frame change = geometry swap; reuse the last placement (re-registers if
      // it was removed). Skipped until the first transform is known.
      // A frame with no geometry must NOT push `null` — that removes the mesh
      // while we still believe it is registered, and the gun never comes back.
      const frame = currentGlyphFrame();
      if (frame && lastGlyphWeaponTransform) {
        glyphSink.setEntity(QUAKE_WEAPON_GLYPH_ID, frame, lastGlyphWeaponTransform);
        glyphRegistered = true;
      }
    }
  }

  function currentGlyphFrame(): QuakeGlyphGeometry | null {
    if (!glyphFrames?.length) return null;
    const index = Math.min(Math.max(glyphFrameIndex, 0), glyphFrames.length - 1);
    return glyphFrames[index] ?? null;
  }

  function weaponGlyphTransform(
    weapon: QuakeViewmodelDebugSnapshot["weapon"],
    origin: Vec3,
  ): QuakeGlyphEntityTransform {
    const currentTuning = activeTuning();
    // Bring the weapon in to `glyphReach`'s near-field distance: keep the
    // eye→weapon direction + bob/punch proportions, scaling the whole offset
    // uniformly (see QUAKE_GLYPH_WEAPON_REACH's doc for why "near", not "far").
    // `weapon.up` is always world +Z here (pinned-pitch offset math), so the
    // raster path's small local screen-lift (`localYOffsetPx`, applied before
    // its own world placement) folds in the same way: an un-scaled lift along
    // world up, independent of the reach distance — plus a small fixed extra
    // drop (QUAKE_GLYPH_WEAPON_VERTICAL_ADJUST) on top of the raster upOffset
    // (see its doc).
    const localLift = polyCssDistanceToWorld(-currentTuning.localYOffsetPx);
    return {
      position: [
        origin[0] + (weapon.position[0] - origin[0]) * glyphReach + weapon.up[0] * localLift,
        origin[1] + (weapon.position[1] - origin[1]) * glyphReach + weapon.up[1] * localLift,
        origin[2] + (weapon.position[2] - origin[2]) * glyphReach + weapon.up[2] * localLift + QUAKE_GLYPH_WEAPON_VERTICAL_ADJUST,
      ],
      // `weapon.rotation[2]` is the yaw-only component ((rotY+180)%360, same as
      // the raster carrier's rotateZ) since `weapon` here always comes from the
      // pinned-pitch `weaponTransform` call — see `glyphEulerFromYawPitch` and
      // QUAKE_GLYPH_WEAPON_YAW_OFFSET's docs for the rest of the rotation story.
      rotation: glyphEulerFromYawPitch(weapon.rotation[2] + QUAKE_GLYPH_WEAPON_YAW_OFFSET, currentTuning.localPitchDeg),
      scale: [
        weapon.scale[0] * glyphScaleFactor,
        weapon.scale[1] * glyphScaleFactor,
        weapon.scale[2] * glyphScaleFactor,
      ],
      depthBias: QUAKE_GLYPH_WEAPON_DEPTH_BIAS,
      // Quake draws the viewmodel after a depth clear — it is never occluded by
      // the world. Without this the gun sits at eye+reach in world space, so
      // standing against a wall/floor buries it inside that surface and the
      // shared depth buffer hides it: the gun "drops" until you back away.
      neverOccluded: true,
      // The gun's own lift over the scene tone (2026-08 retune vs the
      // cssquake.wtf gun): under the world tone that matches the walls, the
      // viewmodel's baked colours measured ~0.8x the reference gun's ink —
      // walls measured ~1.4x — so it carries a per-mesh multiplier.
      toneScale: QUAKE_WEAPON_GLYPH_TONE_SCALE,
    };
  }

  // Mirror the weapon into the world overlay's entity layer. First call (or one
  // after a removal) registers the mesh + frame; later calls only move it.
  function syncGlyphWeapon(weapon: QuakeViewmodelDebugSnapshot["weapon"], origin: Vec3): void {
    if (!glyphSink) return;
    const transform = weaponGlyphTransform(weapon, origin);
    lastGlyphWeaponTransform = transform;
    const frame = currentGlyphFrame();
    // Self-healing: `glyphRegistered` is our belief about the sink, not the truth.
    // If the mesh is gone (dropped by any path) the move is a no-op and the gun
    // would stay lost forever — so re-register whenever the move reports a miss.
    if (glyphRegistered && glyphSink.setEntityTransform(QUAKE_WEAPON_GLYPH_ID, transform)) return;
    glyphSink.setEntity(QUAKE_WEAPON_GLYPH_ID, frame, transform);
    glyphRegistered = frame != null;
  }

  function removeGlyphWeapon(): void {
    if (!glyphSink || !glyphRegistered) return;
    glyphSink.removeEntity(QUAKE_WEAPON_GLYPH_ID);
    glyphRegistered = false;
  }

  function prepareNozzleLeaves(): void {
    if (!carrier) return;
    let nozzleGroup = carrier.querySelector<HTMLElement>(".quake-nozzle-group");
    if (!nozzleGroup) {
      nozzleGroup = carrier.ownerDocument.createElement("span");
      nozzleGroup.className = "quake-nozzle-group";
    }
    for (const leaf of carrier.querySelectorAll<HTMLElement>("[data-weapon]")) {
      leaf.removeAttribute("data-weapon");
    }
    for (const leaf of carrier.querySelectorAll<HTMLElement>("[data-nozzle]")) {
      nozzleGroup.appendChild(leaf);
      leaf.removeAttribute("data-nozzle");
    }
    carrier.appendChild(nozzleGroup);
  }

  function updateWalkBob(origin: Vec3): number {
    const now = performance.now();
    if (!walkBobOrigin || !Number.isFinite(now)) {
      syncWalkBobOrigin(origin, now);
      walkBob = 0;
      return walkBob;
    }

    const elapsed = (now - walkBobAt) / 1000;
    const horizontalDistance = Math.hypot(origin[0] - walkBobOrigin[0], origin[1] - walkBobOrigin[1]);
    syncWalkBobOrigin(origin, now);
    if (horizontalDistance <= COLLISION_EPSILON && elapsed < QUAKE_WEAPON_BOB_MIN_DT) {
      return walkBob;
    }
    if (
      !Number.isFinite(elapsed) ||
      elapsed <= 0 ||
      elapsed > 0.5 ||
      horizontalDistance > QUAKE_WEAPON_BOB_TELEPORT_DISTANCE
    ) {
      walkBob = 0;
      return walkBob;
    }

    const speed = horizontalDistance / Math.max(elapsed, QUAKE_WEAPON_BOB_MIN_DT);
    if (speed <= QUAKE_WEAPON_BOB_STOP_SPEED) {
      walkBob = 0;
      return walkBob;
    }

    const cycle = bobCycle((now / 1000) % QUAKE_WEAPON_BOB_CYCLE_SECONDS);
    const baseBob = speed * QUAKE_WEAPON_BOB;
    walkBob = clampNumber(
      baseBob * 0.3 + baseBob * 0.7 * Math.sin(cycle),
      QUAKE_WEAPON_BOB_MIN,
      QUAKE_WEAPON_BOB_MAX,
    );
    return walkBob;
  }

  function bobCycle(cycleTime: number): number {
    const cycle = cycleTime / QUAKE_WEAPON_BOB_CYCLE_SECONDS;
    return cycle < QUAKE_WEAPON_BOB_UP
      ? Math.PI * cycle / QUAKE_WEAPON_BOB_UP
      : Math.PI + Math.PI * (cycle - QUAKE_WEAPON_BOB_UP) / (1 - QUAKE_WEAPON_BOB_UP);
  }

  function syncWalkBobOrigin(origin: Vec3, now: number): void {
    walkBobOrigin = [origin[0], origin[1], origin[2]];
    walkBobAt = now;
  }

  function resetWalkBob(): void {
    walkBob = 0;
    walkBobOrigin = null;
    walkBobAt = 0;
  }

  function syncLayer(): void {
    if (!layer || !stage) return;
    const sceneElement = scene.sceneElement;
    syncViewportLayer();
    setStyleValue(stage, "transform", weaponStageTransform());
    const zoom = sceneElement.style.getPropertyValue("zoom");
    setStyleValue(stage, "zoom", zoom);
  }

  function syncViewportLayer(): void {
    if (!layerViewportDirty || !layer || !stage) return;
    const currentTuning = activeTuning();
    const viewport = viewmodelViewportSize();
    const layerScale = refreshWeaponLayerScale(viewport);
    setStyleValue(
      layer,
      "left",
      cssPx(
        viewport.offsetLeft +
          (viewport.width - QUAKE_WEAPON_REFERENCE_VIEWPORT_WIDTH_PX) / 2 +
          currentTuning.screenXOffsetPx * layerScale,
      ),
    );
    setStyleValue(
      layer,
      "top",
      cssPx(
        viewport.offsetTop +
          viewport.height -
          QUAKE_WEAPON_REFERENCE_VIEWPORT_HEIGHT_PX +
          currentTuning.screenYOffsetPx * layerScale,
      ),
    );
    setStyleValue(layer, "right", "auto");
    setStyleValue(layer, "bottom", "auto");
    setStyleValue(layer, "width", `${QUAKE_WEAPON_REFERENCE_VIEWPORT_WIDTH_PX}px`);
    setStyleValue(layer, "height", `${QUAKE_WEAPON_REFERENCE_VIEWPORT_HEIGHT_PX}px`);
    setStyleValue(layer, "transform-origin", "50% 100%");
    setStyleValue(layer, "transform", weaponLayerTransform(layerScale));
    setStyleValue(layer, "perspective", `${weaponPerspectivePx()}px`);
    setStyleValue(
      layer,
      "perspective-origin",
      `${QUAKE_WEAPON_REFERENCE_VIEWPORT_WIDTH_PX / 2 + currentTuning.perspectiveOriginXOffsetPx}px ` +
        `${QUAKE_WEAPON_REFERENCE_VIEWPORT_HEIGHT_PX / 2 + currentTuning.perspectiveOriginYOffsetPx}px`,
    );
    setStyleValue(stage, "top", `calc(50% + ${currentTuning.stageOffsetPx}px)`);
    layerViewportDirty = false;
  }

  function invalidateViewportLayer(): void {
    layerViewportDirty = true;
  }

  function setStyleValue(element: HTMLElement, property: string, value: string): void {
    if (element.style.getPropertyValue(property) === value) return;
    if (value) {
      element.style.setProperty(property, value);
    } else {
      element.style.removeProperty(property);
    }
  }

  function weaponScaleVec(): Vec3 {
    const currentTuning = activeTuning();
    return [
      QUAKE_WEAPON_REFERENCE_BASE_SCALE * currentTuning.horizontalScale,
      QUAKE_WEAPON_REFERENCE_BASE_SCALE * currentTuning.verticalScale,
      QUAKE_WEAPON_REFERENCE_BASE_SCALE * currentTuning.depthScale,
    ];
  }

  function weaponTransform(origin: Vec3, rotX: number, rotY: number, bob: number): QuakeViewmodelDebugSnapshot["weapon"] {
    const currentTuning = activeTuning();
    const forward = forwardDirection(rotX, rotY);
    const right = rightDirection(rotY);
    const up = normalizeVec3(crossVec3(right, forward));
    const forwardOffset = currentTuning.forwardOffset + fireForwardKick + bob * QUAKE_WEAPON_BOB_FORWARD_SCALE;
    const upOffset = currentTuning.upOffset + fireUpKick;
    const position: Vec3 = [
      origin[0] + forward[0] * forwardOffset + right[0] * currentTuning.rightOffset + up[0] * upOffset,
      origin[1] + forward[1] * forwardOffset + right[1] * currentTuning.rightOffset + up[1] * upOffset,
      origin[2] + forward[2] * forwardOffset + right[2] * currentTuning.rightOffset + up[2] * upOffset + bob,
    ];
    return {
      position,
      rotation: [rotX - 90, 0, (rotY + 180) % 360],
      scale: weaponScaleVec(),
      forwardOffset,
      rightOffset: currentTuning.rightOffset,
      upOffset,
      forward,
      right,
      up,
    };
  }

  function weaponPerspectivePx(): number {
    return QUAKE_WEAPON_REFERENCE_SCENE_PERSPECTIVE_PX * activeTuning().perspectiveScale;
  }

  function refreshWeaponLayerScale(viewport = viewmodelViewportSize()): number {
    const viewportWidth = viewport.width;
    const viewportHeight = viewport.height;
    const heightScale = viewportHeight / QUAKE_WEAPON_REFERENCE_VIEWPORT_HEIGHT_PX;
    if (viewportWidth <= viewportHeight || viewportHeight > QUAKE_WEAPON_SHORT_LANDSCAPE_MAX_HEIGHT_PX) {
      cachedLayerScale = heightScale;
      return cachedLayerScale;
    }
    cachedLayerScale = Math.max(heightScale, viewportWidth / QUAKE_WEAPON_REFERENCE_VIEWPORT_WIDTH_PX);
    return cachedLayerScale;
  }

  function viewmodelViewportSize(): QuakeRuntimeViewportSize {
    const hostRect = host.getBoundingClientRect();
    return quakeRuntimeViewportSize({ width: hostRect.width, height: hostRect.height });
  }

  function weaponLayerTransform(scale: number): string {
    const currentTuning = activeTuning();
    const transforms = [
      Math.abs(currentTuning.screenScaleX - 1) > 0.001 ? `scaleX(${currentTuning.screenScaleX})` : "",
      Math.abs(currentTuning.screenScaleY - 1) > 0.001 ? `scaleY(${currentTuning.screenScaleY})` : "",
      Number.isFinite(scale) && Math.abs(scale - 1) > 0.001 ? `scale(${scale})` : "",
    ];
    return transforms.filter(Boolean).join(" ");
  }

  function weaponStageTransform(): string {
    const origin = getRenderOrigin?.() ?? controls.getOrigin();
    const rotX = weaponViewRotX(scene.camera.state.rotX ?? 88);
    const rotY = scene.camera.state.rotY ?? 270;
    return buildPolySceneTransform({
      target: weaponStageTarget(origin, rotX, rotY),
      rotX,
      rotY,
      zoom: scene.camera.state.zoom ?? 1,
      distance: scene.camera.state.distance ?? 0,
    });
  }

  function weaponStageTarget(origin: Vec3, rotX: number, rotY: number): Vec3 {
    const forward = forwardDirection(rotX, rotY);
    const lookOffset = polyCssDistanceToWorld(weaponPerspectivePx());
    return [
      origin[0] + forward[0] * lookOffset,
      origin[1] + forward[1] * lookOffset,
      origin[2] + forward[2] * lookOffset,
    ];
  }

  function syncCarrierTransform(weapon: QuakeViewmodelDebugSnapshot["weapon"]): void {
    if (!carrier) return;
    const baseTransform = weaponTransformCss(weapon);
    const localTransform = weaponLocalTransform(activeTuning());
    appliedLocalTransform = localTransform;
    const nextTransform = baseTransform ? `${baseTransform} ${localTransform}` : localTransform;
    if (carrier.style.transform !== nextTransform) {
      carrier.style.transform = nextTransform;
    }
  }

  return {
    mount,
    remove,
    hasWeapon,
    setVisible,
    debugSnapshot,
    getTuning,
    setTuning,
    resetTuning,
    syncTransform,
    queueViewportSync,
    playFireAnimation,
    clearFireAnimation,
  };
}

function weaponViewRotX(rotX: number): number {
  if (!Number.isFinite(rotX)) return QUAKE_WEAPON_SCREEN_ROT_X;
  return QUAKE_WEAPON_SCREEN_ROT_X;
}

function normalizedViewmodelSource(source: string): string {
  return source.trim().toLowerCase();
}

function sanitizeFireAnimationFrames(frames: readonly number[]): number[] {
  const sanitized = frames
    .map((frame) => Math.max(0, Math.floor(frame)))
    .filter((frame) => Number.isFinite(frame));
  return sanitized.length ? sanitized : [1];
}

function sanitizeFireAnimationFrameInterval(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.max(1, value) : QUAKE_WEAPON_MUZZLE_FLASH_MS;
}

function sanitizeViewmodelTuning(
  next: QuakeViewmodelTuning,
  current: QuakeResolvedViewmodelTuning,
): QuakeResolvedViewmodelTuning {
  const sanitized = { ...current };
  for (const key of Object.keys(QUAKE_WEAPON_DEFAULT_TUNING) as Array<keyof QuakeResolvedViewmodelTuning>) {
    const value = next[key];
    if (typeof value === "number" && Number.isFinite(value)) sanitized[key] = value;
  }
  return sanitized;
}

function weaponLocalTransform(tuning: QuakeResolvedViewmodelTuning): string {
  const hasPivot =
    Math.abs(tuning.localPivotXPx) > 0.001 ||
    Math.abs(tuning.localPivotYPx) > 0.001 ||
    Math.abs(tuning.localPivotZPx) > 0.001;
  return [
    `translate3d(0px, ${tuning.localYOffsetPx}px, 0px)`,
    hasPivot ? `translate3d(${tuning.localPivotXPx}px, ${tuning.localPivotYPx}px, ${tuning.localPivotZPx}px)` : "",
    `rotateX(${tuning.localPitchDeg}deg)`,
    hasPivot ? `translate3d(${-tuning.localPivotXPx}px, ${-tuning.localPivotYPx}px, ${-tuning.localPivotZPx}px)` : "",
  ].filter(Boolean).join(" ");
}

function weaponTransformCss(weapon: QuakeViewmodelDebugSnapshot["weapon"]): string {
  const [x, y, z] = weapon.position;
  const cssPosition = worldPositionToPolyCss([x, y, z]);
  const [rotX, rotY, rotZ] = weapon.rotation;
  const [scaleX, scaleY, scaleZ] = weapon.scale;
  return [
    `translate3d(${cssPosition[0]}px, ${cssPosition[1]}px, ${cssPosition[2]}px)`,
    Math.abs(rotX) > 0.001 ? `rotateY(${-rotX}deg)` : "",
    Math.abs(rotY) > 0.001 ? `rotateX(${rotY}deg)` : "",
    Math.abs(rotZ) > 0.001 ? `rotateZ(${-rotZ}deg)` : "",
    `scale3d(${scaleX}, ${scaleY}, ${scaleZ})`,
  ].filter(Boolean).join(" ");
}

function cssPx(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return `${Object.is(rounded, -0) ? 0 : rounded}px`;
}

function elementDebugSnapshot(element: HTMLElement): QuakeViewmodelElementDebugSnapshot {
  return {
    id: element.id || null,
    className: element.className,
    rect: debugRect(element.getBoundingClientRect()),
    inlineStyle: elementInlineStyleSnapshot(element),
    computedStyle: elementComputedStyleSnapshot(element),
  };
}

function elementInlineStyleSnapshot(element: HTMLElement): QuakeViewmodelDebugStyleSnapshot {
  return styleDebugSnapshot(element.style);
}

function elementComputedStyleSnapshot(element: HTMLElement): QuakeViewmodelDebugStyleSnapshot {
  return styleDebugSnapshot(getComputedStyle(element));
}

function styleDebugSnapshot(style: CSSStyleDeclaration): QuakeViewmodelDebugStyleSnapshot {
  return {
    left: style.getPropertyValue("left"),
    top: style.getPropertyValue("top"),
    width: style.getPropertyValue("width"),
    height: style.getPropertyValue("height"),
    transform: debugTransformValue(style.getPropertyValue("transform")),
    transformOrigin: style.getPropertyValue("transform-origin"),
    perspective: style.getPropertyValue("perspective"),
    perspectiveOrigin: style.getPropertyValue("perspective-origin"),
    zoom: style.getPropertyValue("zoom"),
  };
}

function debugTransformValue(value: string): string | null {
  const trimmed = value.trim();
  return trimmed && trimmed !== "none" ? trimmed : null;
}

function meshLeafDebugSnapshot(element: HTMLElement): {
  leafCount: number;
  leafTagCounts: Record<"b" | "i" | "s" | "u", number>;
  leafBounds: QuakeViewmodelDebugRect | null;
} {
  const leaves = Array.from(element.querySelectorAll<HTMLElement>("b,i,s,u"));
  const leafTagCounts: Record<"b" | "i" | "s" | "u", number> = { b: 0, i: 0, s: 0, u: 0 };
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const leaf of leaves) {
    const tag = leaf.tagName.toLowerCase();
    if (tag === "b" || tag === "i" || tag === "s" || tag === "u") leafTagCounts[tag] += 1;
    const rect = leaf.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    left = Math.min(left, rect.left);
    top = Math.min(top, rect.top);
    right = Math.max(right, rect.right);
    bottom = Math.max(bottom, rect.bottom);
  }
  return {
    leafCount: leaves.length,
    leafTagCounts,
    leafBounds: right > left && bottom > top
      ? debugRectFromEdges(left, top, right, bottom)
      : null,
  };
}

function debugRect(rect: DOMRect): QuakeViewmodelDebugRect {
  return debugRectFromEdges(rect.left, rect.top, rect.right, rect.bottom);
}

function debugRectFromEdges(left: number, top: number, right: number, bottom: number): QuakeViewmodelDebugRect {
  return {
    x: roundDebugNumber(left),
    y: roundDebugNumber(top),
    width: roundDebugNumber(right - left),
    height: roundDebugNumber(bottom - top),
    right: roundDebugNumber(right),
    bottom: roundDebugNumber(bottom),
  };
}

function roundDebugVec3(value: Vec3): Vec3 {
  return [
    roundDebugNumber(value[0]),
    roundDebugNumber(value[1]),
    roundDebugNumber(value[2]),
  ];
}

function debugWeaponTransform(
  weapon: QuakeViewmodelDebugSnapshot["weapon"],
): QuakeViewmodelDebugSnapshot["weapon"] {
  return {
    position: roundDebugVec3(weapon.position),
    rotation: roundDebugVec3(weapon.rotation),
    scale: roundDebugVec3(weapon.scale),
    forwardOffset: roundDebugNumber(weapon.forwardOffset),
    rightOffset: roundDebugNumber(weapon.rightOffset),
    upOffset: roundDebugNumber(weapon.upOffset),
    forward: roundDebugVec3(weapon.forward),
    right: roundDebugVec3(weapon.right),
    up: roundDebugVec3(weapon.up),
  };
}

function roundDebugNumber(value: number, decimals = 4): number {
  if (!Number.isFinite(value)) return value;
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

function createQuakeViewmodelStage(layer: HTMLElement): HTMLElement {
  const stage = document.createElement("div");
  stage.className = "quake-weapon-stage polycss-scene";
  layer.appendChild(stage);
  return stage;
}

function forwardDirection(rotX: number, rotY: number): Vec3 {
  const rx = (rotX * Math.PI) / 180;
  const ry = (rotY * Math.PI) / 180;
  return [
    -Math.sin(rx) * Math.cos(ry),
    -Math.sin(rx) * Math.sin(ry),
    -Math.cos(rx),
  ];
}

/**
 * The viewmodel's world orientation as an XYZ Euler triple for glyphcss.
 *
 * `pitchDeg` here is the WEAPON's own small fixed local tilt (`localPitchDeg`,
 * 13° default / 11° for the axe) — never the real view pitch. The glyph
 * overlay's camera already carries real pitch for every world entity (see
 * `syncTransform`'s glyph branch), exactly like the raster path's "stage"
 * carries it for the carrier; re-deriving it here would apply it twice and
 * skew the gun's pose/aspect as you look up/down.
 *
 * The raster carrier applies its local tilt via `rotateX(pitch)` BEFORE the
 * outer `rotateZ(-yaw)` (see `weaponLocalTransform` + `weaponTransformCss`'s
 * ordering) — i.e. the intended composed rotation, applied to a point, is
 * `M = Rz(yaw)·Rx(pitch)` (pitch acts on the point first, in the model's own
 * local frame; yaw about world up acts second). glyphcss's `rotation` field
 * is a single Euler XYZ triple composed as `R = Rx·Ry·Rz` (Rz acts on the
 * point first), so `M` is decomposed back into that XYZ form here.
 */
function glyphEulerFromYawPitch(yawDeg: number, pitchDeg: number): Vec3 {
  const y = (yawDeg * Math.PI) / 180;
  const p = (pitchDeg * Math.PI) / 180;
  const cy = Math.cos(y), sy = Math.sin(y);
  const cp = Math.cos(p), sp = Math.sin(p);
  // M = Rz(y)·Rx(p), row-major.
  const m00 = cy, m01 = -sy * cp, m02 = sy * sp;
  const m12 = -cy * sp;
  const m22 = cp;
  // Invert R = Rx(a)·Ry(b)·Rz(c): m02 = sin b, m00/m01 give c, m12/m22 give a.
  const b = Math.asin(Math.max(-1, Math.min(1, m02)));
  const c = Math.atan2(-m01, m00);
  const a = Math.atan2(-m12, m22);
  return [(a * 180) / Math.PI, (b * 180) / Math.PI, (c * 180) / Math.PI];
}

function rightDirection(rotY: number): Vec3 {
  const ry = (rotY * Math.PI) / 180;
  return [-Math.sin(ry), Math.cos(ry), 0];
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
