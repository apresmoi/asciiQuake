import type { Polygon, Vec3 } from "glyphcss";
import type {
  QuakeAppSceneHandle,
  QuakeMeshHandle,
  QuakeMeshSource,
} from "../render/engine";

import { COLLISION_EPSILON } from "../constants";
import type { QuakeWeaponId } from "../hud";
import { addVec3, crossVec3, normalizeVec3, subtractVec3 } from "../math";
import {
  quakePickupModelFrameSet,
  type QuakeGlyphEntitySink,
  type QuakePickupModelLibrary,
} from "../pickups";
import {
  mountQuakeModelFrameSetMesh,
  mountQuakeModelMesh,
} from "../modelMesh";
import type { QuakeViewmodelFireAnimation } from "../viewmodel";
import type {
  QuakeWeaponLightningBeamVisual,
  QuakeWeaponProjectileVisualHandle,
} from "../weapons";

const QUAKE_CROSSHAIR_HIT_MS = 110;
const QUAKE_LIGHTNING_BEAM_VISUAL_MS = 180;
const QUAKE_LIGHTNING_BEAM_INNER_RADIUS = 0.018;
const QUAKE_LIGHTNING_BEAM_OUTER_RADIUS = 0.045;

export interface QuakeWeaponPresentationFlowOptions {
  addBodyClasses(...classNames: string[]): void;
  currentModelLibrary(): QuakePickupModelLibrary | null;
  glyphEntitySink?: QuakeGlyphEntitySink;
  playWeaponFireFeedback(animation?: QuakeViewmodelFireAnimation): void;
  removeBodyClasses(...classNames: string[]): void;
  scene: Pick<QuakeAppSceneHandle, "add">;
}

export interface QuakeWeaponPresentationFlow {
  addProjectileMesh(modelPath: string, weapon: QuakeWeaponId): QuakeWeaponProjectileVisualHandle | null;
  clear(): void;
  clearCrosshairHit(): void;
  clearLightningBeams(): void;
  flashCrosshairHit(): void;
  playFireAnimation(animation?: QuakeViewmodelFireAnimation): void;
  showLightningBeam(beam: QuakeWeaponLightningBeamVisual): void;
}

export function createQuakeWeaponPresentationFlow(
  options: QuakeWeaponPresentationFlowOptions,
): QuakeWeaponPresentationFlow {
  const lightningBeamHandles = new Set<QuakeMeshHandle>();
  const lightningBeamTimers = new Map<QuakeMeshHandle, number>();
  let crosshairHitTimer: number | null = null;
  let nextVisualId = 0;

  function addProjectileMesh(
    modelPath: string,
    weapon: QuakeWeaponId,
  ): QuakeWeaponProjectileVisualHandle | null {
    const model = options.currentModelLibrary()?.models[modelPath];
    if (!model) return null;
    const frameSet = quakePickupModelFrameSet(model);
    const handle = frameSet
      ? mountQuakeModelFrameSetMesh(options.scene, frameSet, 0)
      : mountQuakeModelMesh(options.scene, model.glyphGeometry);
    if (!handle) return null;
    handle.element.classList.add("player-projectile", `player-projectile-${weapon}`);
    mirrorHandleInGlyph(
      handle,
      `projectile:${++nextVisualId}`,
      model.animationFrames?.[0]?.glyphGeometry ?? model.glyphGeometry ?? null,
    );
    return {
      handle,
      scale: model.renderScale ? 1 / model.renderScale : 1,
    };
  }

  function showLightningBeam(beam: QuakeWeaponLightningBeamVisual): void {
    if (beam.tempEntity !== "TE_LIGHTNING2") return;
    const polygons = lightningBeamPolygons(beam.start, beam.end);
    if (!polygons.length) return;
    const handle = options.scene.add(makeParseResult(polygons), {
      merge: false,
      meshResolution: "lossless",
      excludeFromAutoCenter: true,
    });
    handle.element.classList.add("player-lightning-beam", `player-lightning-beam-${beam.weapon}`);
    handle.element.dataset.tempEntity = beam.tempEntity;
    mirrorHandleInGlyph(handle, `lightning:${++nextVisualId}`, {
      version: 2,
      polygonCount: polygons.length,
      polygons: polygons.map((polygon) => ({ v: polygon.vertices, c: polygon.color ?? "#d9ffff" })),
    }, true);
    lightningBeamHandles.add(handle);
    const timer = window.setTimeout(() => removeLightningBeam(handle), QUAKE_LIGHTNING_BEAM_VISUAL_MS);
    lightningBeamTimers.set(handle, timer);
  }

  function removeLightningBeam(handle: QuakeMeshHandle): void {
    const timer = lightningBeamTimers.get(handle);
    if (timer !== undefined) window.clearTimeout(timer);
    lightningBeamTimers.delete(handle);
    if (!lightningBeamHandles.delete(handle)) return;
    handle.remove();
  }

  function clearLightningBeams(): void {
    for (const handle of [...lightningBeamHandles]) removeLightningBeam(handle);
  }

  function flashCrosshairHit(): void {
    clearCrosshairHitTimer();
    options.addBodyClasses("quake-crosshair-hit");
    crosshairHitTimer = window.setTimeout(clearCrosshairHit, QUAKE_CROSSHAIR_HIT_MS);
  }

  function clearCrosshairHit(): void {
    clearCrosshairHitTimer();
    options.removeBodyClasses("quake-crosshair-hit");
  }

  function clearCrosshairHitTimer(): void {
    if (crosshairHitTimer === null) return;
    window.clearTimeout(crosshairHitTimer);
    crosshairHitTimer = null;
  }

  function clear(): void {
    clearCrosshairHit();
    clearLightningBeams();
  }

  function mirrorHandleInGlyph(
    handle: QuakeMeshHandle,
    id: string,
    geometry: Parameters<QuakeGlyphEntitySink["setEntity"]>[1],
    mountImmediately = false,
  ): void {
    const sink = options.glyphEntitySink;
    if (!sink || !geometry) return;
    const originalSetTransform = handle.setTransform.bind(handle);
    const originalRemove = handle.remove.bind(handle);
    let removed = false;
    const sync = (): void => {
      const position = handle.getPosition();
      if (!position && !mountImmediately) return;
      sink.setEntity(id, geometry, {
        position: position ?? [0, 0, 0],
        ...(handle.getRotation() ? { rotation: handle.getRotation() } : {}),
        ...(handle.getScale() !== undefined ? { scale: handle.getScale() } : {}),
      });
    };
    handle.setTransform = (transform) => {
      originalSetTransform(transform);
      sync();
    };
    handle.remove = handle.dispose = () => {
      if (removed) return;
      removed = true;
      sink.removeEntity(id);
      originalRemove();
    };
    if (mountImmediately) sync();
  }

  return {
    addProjectileMesh,
    clear,
    clearCrosshairHit,
    clearLightningBeams,
    flashCrosshairHit,
    playFireAnimation: options.playWeaponFireFeedback,
    showLightningBeam,
  };
}

function lightningBeamPolygons(start: Vec3, end: Vec3): Polygon[] {
  const delta = subtractVec3(end, start);
  const length = Math.hypot(delta[0], delta[1], delta[2]);
  if (length <= COLLISION_EPSILON) return [];
  const direction = normalizeVec3(delta);
  const reference: Vec3 = Math.abs(direction[2]) > 0.9 ? [0, 1, 0] : [0, 0, 1];
  const side = scaleVec3(normalizeVec3(crossVec3(direction, reference)), QUAKE_LIGHTNING_BEAM_OUTER_RADIUS);
  const up = scaleVec3(normalizeVec3(crossVec3(side, direction)), QUAKE_LIGHTNING_BEAM_INNER_RADIUS);
  return [
    lightningBeamQuad(start, end, side, "#d9ffff"),
    lightningBeamQuad(start, end, up, "#66f8ff"),
  ];
}

function lightningBeamQuad(start: Vec3, end: Vec3, offset: Vec3, color: string): Polygon {
  return {
    color,
    vertices: [
      subtractVec3(start, offset),
      subtractVec3(end, offset),
      addVec3(end, offset),
      addVec3(start, offset),
    ],
  };
}

function scaleVec3(value: Vec3, scale: number): Vec3 {
  return [value[0] * scale, value[1] * scale, value[2] * scale];
}

function makeParseResult(polygons: Polygon[]): QuakeMeshSource {
  return { polygons, objectUrls: [], warnings: [], dispose: () => undefined };
}
