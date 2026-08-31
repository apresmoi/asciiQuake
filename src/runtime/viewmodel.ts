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
import {
  resolveQuakeGlyphWeaponCameraBackoffPx,
  type QuakeGlyphEntityTransform,
  type QuakeGlyphWeaponOverlay,
} from "./render/glyphWorldOverlay";

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
  setGlyphWeaponTuning(tuning: QuakeGlyphWeaponTuning): void;
}

export interface QuakeGlyphWeaponTuning {
  scale?: number;
  reach?: number;
  density?: number;
  fovScale?: number;
  centerX?: number;
  centerY?: number;
  perspective?: number;
  zoom?: number;
  roll?: number;
  backoff?: number;
  localY?: number;
  pivotX?: number;
  pivotY?: number;
  pivotZ?: number;
  screenX?: number;
  screenY?: number;
  screenScaleX?: number;
  screenScaleY?: number;
  stageOffset?: number;
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
   * Dedicated glyph weapon scene. When present AND `renderModeIsGlyph()` is
   * true, the weapon is placed in that scene's local camera (mirroring the
   * raster weapon stage) and the polycss carrier is hidden. Absent / polycss
   * mode → the raster weapon is used. Must NOT be the world overlay: a shared
   * world camera clips the near-field model (see createQuakeGlyphWeaponOverlay).
   */
  glyphWeaponOverlay?: QuakeGlyphWeaponOverlay;
  renderModeIsGlyph?: () => boolean;
  /**
   * Model-scale multiplier on the raster weapon's per-axis scale. Tunable via
   * `?glyphWeaponScale=`. Default {@link QUAKE_GLYPH_WEAPON_SCALE} (identity
   * on the dedicated stage; the old 0.3 was a world-camera fudge).
   */
  glyphWeaponScale?: number;
  /**
   * Fraction of the raster weapon's eye→weapon offset (forward 3.1 etc.).
   * Tunable via `?glyphWeaponReach=`. Default {@link QUAKE_GLYPH_WEAPON_REACH}
   * (full raster offset; the old 0.18 contracted the gun into the world
   * camera's near plane).
   */
  glyphWeaponReach?: number;
  /**
   * Detail-layer density for the weapon mesh. Default matches the world's
   * entity density. `?glyphWeaponDensity=`. `1` = the scene's base grid.
   */
  glyphWeaponDensity?: number;
  /**
   * Overrides for the dedicated camera. `undefined` means "compute from the
   * raster stage" (layerScale as fovScale, viewport-centre as projection
   * center, weapon-stage perspective). URL pins are passed in from App.
   */
  glyphWeaponFovScale?: number;
  glyphWeaponCenterX?: number;
  glyphWeaponCenterY?: number;
  glyphWeaponPersp?: number;
  glyphWeaponZoom?: number;
  glyphWeaponRoll?: number;
  glyphWeaponBackoff?: number;
  glyphWeaponLocalY?: number;
  glyphWeaponPivotX?: number;
  glyphWeaponPivotY?: number;
  glyphWeaponPivotZ?: number;
  glyphWeaponScreenX?: number;
  glyphWeaponScreenY?: number;
  glyphWeaponScreenScaleX?: number;
  glyphWeaponScreenScaleY?: number;
  glyphWeaponStageOffset?: number;
}

const QUAKE_WEAPON_GLYPH_ID = "viewmodel:weapon";
// Per-mesh lift over the world overlay's brighten (see the transform's
// `toneScale` doc): measured 2026-08 against the cssquake.wtf gun. The lift
// lands sub-linearly (the tone pipe's channel-clip guard caps the gun's
// bright metal), so the factor is larger than the raw ink deficit: 1.6
// measured the glyph gun's ink mean level with the reference gun's under the
// retuned world tone at the default entity density.
const QUAKE_WEAPON_GLYPH_TONE_SCALE = 1.6;
// Identity on the dedicated weapon-stage camera (the raster model's own
// per-axis scale already carries the size). The old 0.3 was a world-camera
// fudge and cancelled against reach. Tunable (?glyphWeaponScale).
const QUAKE_GLYPH_WEAPON_SCALE = 1;
// Full raster eye→weapon offset (forward 3.1 etc.). The old 0.18 contracted
// the gun into the world camera's near plane so most of the mesh clipped.
// Tunable (?glyphWeaponReach).
const QUAKE_GLYPH_WEAPON_REACH = 1;
// Local-frame yaw for the dedicated glyph camera. Must match
// createQuakeGlyphWeaponOverlay (rotX is QUAKE_WEAPON_SCREEN_ROT_X = 90).
const QUAKE_GLYPH_WEAPON_ROT_Y = 270;
const QUAKE_GLYPH_WEAPON_ORIGIN: Vec3 = [0, 0, 0];
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
export interface QuakeGlyphWeaponModelTrim {
  /** Coordinate conversion used before glyphcss sees the raw MDL vertices. */
  basis: "legacy" | "polycss";
  axisTrim: readonly [number, number];
  screenTrim: readonly [number, number];
  screenScale: readonly [number, number];
  /**
   * Glyph weapon camera distance in CSS px. The PolyCSS basis uses the actual
   * weapon-stage eye plane (0); legacy fitted models retain their old pullback.
   */
  cameraBackoffPx: number;
  /**
   * Sign applied to [yaw, pitch] before the glyph Euler conversion. PolyCSS-
   * basis models use the conjugated world sign; legacy fitted models keep the
   * prior sign until they are migrated independently.
   */
  eulerSign: readonly [number, number];
}

/**
 * Glyph-only, per-model corrections; the raster path never reads this table.
 * `axisTrim` scales mesh-local axes, `screenTrim` translates post-projection in
 * viewport fractions, and `screenScale` scales post-projection about the
 * viewport centre. Values were fitted from the rendered ink bbox at 1600x900
 * dpr1 against the cssquake oracle and must be refitted if the weapon camera or
 * projection changes. The 2D `screenScale`/`screenTrim` corrections deliberately
 * ignore player origin/yaw/pitch, preserving the weapon's view-lock.
 */
const QUAKE_GLYPH_WEAPON_MODEL_TRIM: Record<string, QuakeGlyphWeaponModelTrim> = {
  // Migrated models use the exact PolyCSS→world basis. They need neither
  // glyph-only mesh/screen corrections nor a camera pullback.
  "progs/v_shot.mdl": { basis: "polycss", axisTrim: [1, 1], screenTrim: [0, 0], screenScale: [1, 1], cameraBackoffPx: 0, eulerSign: [1, 1] },
  "progs/v_axe.mdl": { basis: "polycss", axisTrim: [1, 1], screenTrim: [0, 0], screenScale: [1, 1], cameraBackoffPx: 0, eulerSign: [1, 1] },
};
const QUAKE_GLYPH_WEAPON_TRIM_IDENTITY: QuakeGlyphWeaponModelTrim = {
  basis: "legacy", axisTrim: [1, 1], screenTrim: [0, 0], screenScale: [1, 1], cameraBackoffPx: 310, eulerSign: [-1, -1],
};

export function quakeGlyphWeaponModelTrim(modelPath: string): QuakeGlyphWeaponModelTrim {
  return QUAKE_GLYPH_WEAPON_MODEL_TRIM[modelPath] ?? QUAKE_GLYPH_WEAPON_TRIM_IDENTITY;
}

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
  glyphWeaponOverlay,
  renderModeIsGlyph,
  glyphWeaponScale,
  glyphWeaponReach,
  glyphWeaponDensity,
  glyphWeaponFovScale,
  glyphWeaponCenterX,
  glyphWeaponCenterY,
  glyphWeaponPersp,
  glyphWeaponZoom,
  glyphWeaponRoll,
  glyphWeaponBackoff,
  glyphWeaponLocalY,
  glyphWeaponPivotX,
  glyphWeaponPivotY,
  glyphWeaponPivotZ,
  glyphWeaponScreenX,
  glyphWeaponScreenY,
  glyphWeaponScreenScaleX,
  glyphWeaponScreenScaleY,
  glyphWeaponStageOffset,
}: QuakeViewmodelControllerOptions): QuakeViewmodelController {
  const stage = layer ? createQuakeViewmodelStage(layer) : null;
  let handle: PolyMeshHandle | null = null;
  // Glyph (ASCII) weapon: dedicated scene with its own camera, not the world
  // overlay. Render mode is fixed for the controller's lifetime (a mode
  // change forces a full remount).
  const glyphMode = (renderModeIsGlyph?.() ?? false) && glyphWeaponOverlay != null;
  const glyphSink = glyphMode ? (glyphWeaponOverlay ?? null) : null;
  let glyphScaleFactor = glyphWeaponScale ?? QUAKE_GLYPH_WEAPON_SCALE;
  let glyphReach = glyphWeaponReach ?? QUAKE_GLYPH_WEAPON_REACH;
  let glyphDensity = glyphWeaponDensity;
  let glyphFovScaleOverride = glyphWeaponFovScale;
  let glyphCenterXOverride = glyphWeaponCenterX;
  let glyphCenterYOverride = glyphWeaponCenterY;
  let glyphPerspOverride = glyphWeaponPersp;
  let glyphZoomOverride = glyphWeaponZoom;
  let glyphRollOverride = glyphWeaponRoll;
  let glyphBackoffOverride = glyphWeaponBackoff;
  let glyphPoseOverrides: QuakeViewmodelTuning = {
    ...(glyphWeaponLocalY !== undefined ? { localYOffsetPx: glyphWeaponLocalY } : {}),
    ...(glyphWeaponPivotX !== undefined ? { localPivotXPx: glyphWeaponPivotX } : {}),
    ...(glyphWeaponPivotY !== undefined ? { localPivotYPx: glyphWeaponPivotY } : {}),
    ...(glyphWeaponPivotZ !== undefined ? { localPivotZPx: glyphWeaponPivotZ } : {}),
    ...(glyphWeaponScreenX !== undefined ? { screenXOffsetPx: glyphWeaponScreenX } : {}),
    ...(glyphWeaponScreenY !== undefined ? { screenYOffsetPx: glyphWeaponScreenY } : {}),
    ...(glyphWeaponScreenScaleX !== undefined ? { screenScaleX: glyphWeaponScreenScaleX } : {}),
    ...(glyphWeaponScreenScaleY !== undefined ? { screenScaleY: glyphWeaponScreenScaleY } : {}),
    ...(glyphWeaponStageOffset !== undefined ? { stageOffsetPx: glyphWeaponStageOffset } : {}),
  };
  if (glyphMode && stage) stage.hidden = true;
  let glyphFrames: QuakeGlyphGeometry[] | null = null;
  let posedGlyphFrames: QuakeGlyphGeometry[] | null = null;
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
    // Glyph mode: hide the polycss stage (the ASCII weapon renders in the
    // dedicated overlay inside this layer) and load per-frame glyph geometry.
    if (glyphMode) {
      if (stage) stage.hidden = true;
      if (layer) layer.hidden = !visible;
      removeGlyphWeapon();
      glyphFrames = model.glyphFrames ?? null;
      posedGlyphFrames = null;
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
    posedGlyphFrames = null;
    lastGlyphWeaponTransform = null;
    appliedLocalTransform = "";
    mountedSource = null;
  }

  function hasWeapon(): boolean {
    return carrier !== null;
  }

  function setVisible(nextVisible: boolean): void {
    visible = nextVisible;
    // Glyph mode keeps the layer (it hosts the dedicated ASCII scene) and
    // hides only the polycss stage. Polycss mode hides the whole layer.
    if (layer) layer.hidden = !visible;
    if (glyphMode) {
      if (stage) stage.hidden = true;
      glyphSink?.setVisible(visible);
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

  function activeGlyphTuning(): QuakeResolvedViewmodelTuning {
    const current = activeTuning();
    return sanitizeViewmodelTuning(glyphPoseOverrides, current);
  }

  function glyphModelTrim(): QuakeGlyphWeaponModelTrim {
    return quakeGlyphWeaponModelTrim(mountedSource ?? "");
  }

  function setTuning(next: QuakeViewmodelTuning): QuakeResolvedViewmodelTuning {
    tuning = sanitizeViewmodelTuning(next, tuning);
    posedGlyphFrames = null;
    glyphRegistered = false;
    invalidateViewportLayer();
    syncTransform({ stable: true });
    return getTuning();
  }

  function resetTuning(): QuakeResolvedViewmodelTuning {
    tuning = { ...QUAKE_WEAPON_DEFAULT_TUNING };
    posedGlyphFrames = null;
    glyphRegistered = false;
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
    // Glyph mode: the polycss carrier is hidden; place the weapon in the
    // dedicated scene's LOCAL frame (screen pitch 90, yaw 270) so looking
    // around cannot orbit it out of the frustum — the same contract as the
    // raster stage.
    if (glyphMode) {
      syncGlyphWeapon(
        weaponTransform(QUAKE_GLYPH_WEAPON_ORIGIN, QUAKE_WEAPON_SCREEN_ROT_X, QUAKE_GLYPH_WEAPON_ROT_Y, bob),
      );
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
    if (!posedGlyphFrames) {
      const current = activeGlyphTuning();
      const localTuning = glyphRollOverride === undefined
        ? current
        : { ...current, localPitchDeg: glyphRollOverride };
      posedGlyphFrames = glyphFrames.map((frame) =>
        quakeGlyphWeaponModelLocalPose(mountedSource ?? "", frame, localTuning));
    }
    return posedGlyphFrames[index] ?? null;
  }

  function weaponGlyphTransform(
    weapon: QuakeViewmodelDebugSnapshot["weapon"],
  ): QuakeGlyphEntityTransform {
    const modelPath = mountedSource ?? "";
    const modelTrim = glyphModelTrim();
    // Local-frame placement: origin is the dedicated camera's eye, so
    // `glyphReach` scales the raster eye→weapon vector without involving the
    // world camera. reach=1 is the raster offset (forward 3.1 etc.).
    return {
      position: [
        weapon.position[0] * glyphReach,
        weapon.position[1] * glyphReach,
        weapon.position[2] * glyphReach,
      ],
      // PolyCSS and glyphcss express the same carrier orientation in different
      // Euler conventions. Migrated models use the conjugated world sign;
      // legacy models retain their fitted sign until migrated independently.
      rotation: glyphEulerFromYawPitch(
        modelTrim.eulerSign[0] * weapon.rotation[2],
        modelTrim.eulerSign[1] * weapon.rotation[0],
      ),
      // `weapon.scale` is ordered for the raster CSS carrier. The model-aware
      // conversion applies the exact X/Y basis swap for migrated models while
      // preserving the old permutation and trims for every legacy weapon.
      scale: quakeGlyphWeaponModelScale(modelPath, weapon.scale, glyphScaleFactor),
      ...(glyphDensity != null ? { density: glyphDensity } : {}),
      // The gun's own lift over the scene tone (2026-08 retune vs the
      // cssquake.wtf gun): under the world tone that matches the walls, the
      // viewmodel's baked colours measured ~0.8x the reference gun's ink —
      // walls measured ~1.4x — so it carries a per-mesh multiplier.
      toneScale: QUAKE_WEAPON_GLYPH_TONE_SCALE,
    };
  }

  // Place the weapon in the dedicated overlay. First call (or one after a
  // removal) registers the mesh + frame; later calls only move it.
  function syncGlyphWeapon(weapon: QuakeViewmodelDebugSnapshot["weapon"]): void {
    if (!glyphSink) return;
    const transform = weaponGlyphTransform(weapon);
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
    if (glyphMode) {
      syncGlyphWeaponProjection();
      return;
    }
    const sceneElement = scene.sceneElement;
    syncViewportLayer();
    setStyleValue(stage, "transform", weaponStageTransform());
    const zoom = sceneElement.style.getPropertyValue("zoom");
    setStyleValue(stage, "zoom", zoom);
  }

  /**
   * Push the raster weapon stage's projection onto the dedicated glyph camera.
   *
   * - perspective: the stage's CSS perspective (745.108 × perspectiveScale),
   *   unless `?glyphWeaponPersp=` pins it.
   * - fovScale: the viewport-derived layerScale (1.25 at 1600×900, ~0.661 at
   *   846×411) so the gun stays a constant fraction of viewport width, unless
   *   `?glyphWeaponFovScale=` pins it.
   * - center: viewport centre (0.5, 0.5) by default — the current glyph gun's
   *   centre already matches the reference within 0.004; baking the raster
   *   layer's screen offsets in would move it. `?glyphWeaponCenterX/Y=` pin
   *   a bottom-anchor / perspective-origin experiment.
   */
  function syncGlyphWeaponProjection(): void {
    if (!glyphSink) return;
    const viewport = viewmodelViewportSize();
    const layerScale = refreshWeaponLayerScale(viewport);
    const fovScale = glyphFovScaleOverride ?? layerScale;
    const perspectivePx = glyphPerspOverride ?? weaponPerspectivePx();
    const currentTuning = activeGlyphTuning();
    const centerX = glyphCenterXOverride ??
      0.5 + currentTuning.screenXOffsetPx * layerScale /
        (viewport.width * currentTuning.screenScaleX);
    const rasterStageCenterY = viewport.height + currentTuning.screenYOffsetPx * layerScale +
      (-QUAKE_WEAPON_REFERENCE_VIEWPORT_HEIGHT_PX / 2 + currentTuning.stageOffsetPx) *
        currentTuning.screenScaleY * layerScale;
    const centerY = glyphCenterYOverride ??
      0.5 + (rasterStageCenterY / viewport.height - 0.5) / currentTuning.screenScaleY;
    const modelTrim = glyphModelTrim();
    glyphSink.setProjection({
      perspective: perspectivePx,
      fovScale,
      center: [centerX, centerY],
      screenScale: [
        currentTuning.screenScaleX * modelTrim.screenScale[0],
        currentTuning.screenScaleY * modelTrim.screenScale[1],
      ],
      screenTrim: modelTrim.screenTrim,
      cameraBackoffPx: resolveQuakeGlyphWeaponCameraBackoffPx(
        glyphBackoffOverride,
        modelTrim.cameraBackoffPx,
      ),
      zoom: glyphZoomOverride ?? scene.camera.state.zoom,
    });
  }

  function setGlyphWeaponTuning(next: QuakeGlyphWeaponTuning): void {
    if (next.scale !== undefined && Number.isFinite(next.scale)) {
      glyphScaleFactor = next.scale;
    }
    if (next.reach !== undefined && Number.isFinite(next.reach)) glyphReach = next.reach;
    if (next.density !== undefined && Number.isFinite(next.density)) {
      glyphDensity = next.density;
      glyphRegistered = false;
    }
    if (next.fovScale !== undefined) {
      glyphFovScaleOverride = Number.isFinite(next.fovScale) && next.fovScale > 0 ? next.fovScale : undefined;
    }
    if (next.centerX !== undefined) {
      glyphCenterXOverride = Number.isFinite(next.centerX) ? next.centerX : undefined;
    }
    if (next.centerY !== undefined) {
      glyphCenterYOverride = Number.isFinite(next.centerY) ? next.centerY : undefined;
    }
    if (next.perspective !== undefined) {
      glyphPerspOverride = Number.isFinite(next.perspective) && next.perspective > 0 ? next.perspective : undefined;
    }
    if (next.zoom !== undefined) {
      glyphZoomOverride = Number.isFinite(next.zoom) && next.zoom > 0 ? next.zoom : undefined;
    }
    if (next.roll !== undefined) {
      glyphRollOverride = Number.isFinite(next.roll) ? next.roll : undefined;
      posedGlyphFrames = null;
      glyphRegistered = false;
    }
    if (next.backoff !== undefined) {
      glyphBackoffOverride = Number.isFinite(next.backoff) && next.backoff >= 0 ? next.backoff : undefined;
    }
    const poseMap: Array<[keyof QuakeGlyphWeaponTuning, keyof QuakeViewmodelTuning]> = [
      ["localY", "localYOffsetPx"], ["pivotX", "localPivotXPx"],
      ["pivotY", "localPivotYPx"], ["pivotZ", "localPivotZPx"],
      ["screenX", "screenXOffsetPx"], ["screenY", "screenYOffsetPx"],
      ["screenScaleX", "screenScaleX"], ["screenScaleY", "screenScaleY"],
      ["stageOffset", "stageOffsetPx"],
    ];
    for (const [source, target] of poseMap) {
      const value = next[source];
      if (value !== undefined && Number.isFinite(value)) glyphPoseOverrides[target] = value;
    }
    if (poseMap.some(([source]) => next[source] !== undefined)) {
      posedGlyphFrames = null;
      glyphRegistered = false;
    }
    invalidateViewportLayer();
    if (carrier) syncTransform({ stable: true });
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

  // The tuning names (horizontal/vertical/depth) are SCREEN-axis intent, but
  // glyphcss's applyTransform scales each vertex's raw MESH-LOCAL component
  // (v[0]*sx, v[1]*sy, v[2]*sz) before rotation is applied — so this vector
  // must be permuted to the mesh's own axes, not the screen's. v_shot's
  // local frame has X as its long axis (the 5.706-unit barrel), Y as the
  // 0.582-unit transverse width, Z as the 0.925-unit transverse height;
  // after the model's rotation the mesh Y/Z pair is what reads as
  // screen width/height, so they take horizontal/vertical, while the
  // barrel (mesh X) takes depthScale.
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
    setGlyphWeaponTuning,
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

/** Legacy glyph-local pose retained for weapons not yet migrated. */
export function quakeGlyphWeaponLocalPose(
  geometry: QuakeGlyphGeometry,
  tuning: Pick<QuakeResolvedViewmodelTuning,
    "localYOffsetPx" | "localPitchDeg" | "localPivotXPx" | "localPivotYPx" | "localPivotZPx">,
): QuakeGlyphGeometry {
  const pxToWorld = (value: number) => polyCssDistanceToWorld(value);
  const pivot: Vec3 = [
    pxToWorld(tuning.localPivotXPx),
    pxToWorld(tuning.localPivotYPx),
    pxToWorld(tuning.localPivotZPx),
  ];
  const localY = pxToWorld(tuning.localYOffsetPx);
  const radians = tuning.localPitchDeg * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    ...geometry,
    polygons: geometry.polygons.map((polygon) => ({
      ...polygon,
      v: polygon.v.map((vertex) => {
        const x = vertex[0]! - pivot[0];
        const y = vertex[1]! - pivot[1];
        const z = vertex[2]! - pivot[2];
        return [
          x + pivot[0],
          y * cos - z * sin + pivot[1] + localY,
          y * sin + z * cos + pivot[2],
        ];
      }),
    })),
  };
}

/**
 * Apply CSS's `Ty · Tp · Rx · T-p` after conjugating through PolyCSS's X/Y
 * basis swap. In MDL/world coordinates that is `Tx · Tp' · Ry(-pitch) · T-p'`,
 * with the CSS pivot `[x,y,z]` represented as world `[y,x,z]`.
 */
export function quakeGlyphWeaponPolyCssLocalPose(
  geometry: QuakeGlyphGeometry,
  tuning: Pick<QuakeResolvedViewmodelTuning,
    "localYOffsetPx" | "localPitchDeg" | "localPivotXPx" | "localPivotYPx" | "localPivotZPx">,
): QuakeGlyphGeometry {
  const pxToWorld = (value: number) => polyCssDistanceToWorld(value);
  const pivot: Vec3 = [
    pxToWorld(tuning.localPivotYPx),
    pxToWorld(tuning.localPivotXPx),
    pxToWorld(tuning.localPivotZPx),
  ];
  const localX = pxToWorld(tuning.localYOffsetPx);
  const radians = tuning.localPitchDeg * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    ...geometry,
    polygons: geometry.polygons.map((polygon) => ({
      ...polygon,
      v: polygon.v.map((vertex) => {
        const x = vertex[0]! - pivot[0];
        const z = vertex[2]! - pivot[2];
        return [
          x * cos - z * sin + pivot[0] + localX,
          vertex[1]!,
          x * sin + z * cos + pivot[2],
        ];
      }),
    })),
  };
}

export function quakeGlyphWeaponModelLocalPose(
  modelPath: string,
  geometry: QuakeGlyphGeometry,
  tuning: Pick<QuakeResolvedViewmodelTuning,
    "localYOffsetPx" | "localPitchDeg" | "localPivotXPx" | "localPivotYPx" | "localPivotZPx">,
): QuakeGlyphGeometry {
  return quakeGlyphWeaponModelTrim(modelPath).basis === "polycss"
    ? quakeGlyphWeaponPolyCssLocalPose(geometry, tuning)
    : quakeGlyphWeaponLocalPose(geometry, tuning);
}

export function quakeGlyphWeaponModelScale(
  modelPath: string,
  weaponScale: readonly [number, number, number],
  glyphScaleFactor: number,
): Vec3 {
  const trim = quakeGlyphWeaponModelTrim(modelPath);
  if (trim.basis === "polycss") {
    return [
      weaponScale[1] * glyphScaleFactor * trim.axisTrim[1],
      weaponScale[0] * glyphScaleFactor * trim.axisTrim[0],
      weaponScale[2] * glyphScaleFactor,
    ];
  }
  return [
    weaponScale[2] * glyphScaleFactor,
    weaponScale[0] * glyphScaleFactor * trim.axisTrim[0],
    weaponScale[1] * glyphScaleFactor * trim.axisTrim[1],
  ];
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
