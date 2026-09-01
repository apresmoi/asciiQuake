import type { Polygon } from "glyphcss";

import type { QuakeGlyphGeometry } from "../types/quake";
import type { QuakeAppSceneHandle, QuakeMeshHandle } from "./render/engine";

export interface QuakeModelFrame {
  name: string;
  glyphGeometry?: QuakeGlyphGeometry;
}

export interface QuakeModelFrameSet {
  baseGeometry?: QuakeGlyphGeometry;
  frames: readonly QuakeModelFrame[];
}

export interface QuakeModelFrameSetMountOptions {
  changedFrameTransitions?: boolean;
  motionMaterial?: QuakeModelFrameSetMotionMaterialOptions | null;
}

export interface QuakeModelFrameSetMotionMaterialOptions {
  restoreDelayMs?: number;
  restoreChunkIntervalMs?: number;
  solidBackground?: string;
  texturedAreaRatio?: number;
}

export type QuakeModelFrameSetHandle = QuakeMeshHandle & {
  getFrameIndex(): number;
  markMotionMaterialActive(reason?: string): boolean;
  setFrameIndex(frameIndex: number): boolean;
};

export function mountQuakeModelMesh(
  scene: Pick<QuakeAppSceneHandle, "add">,
  geometry: QuakeGlyphGeometry | null | undefined,
): QuakeMeshHandle {
  return scene.add({ polygons: quakeGlyphGeometryPolygons(geometry) });
}

export function mountQuakeModelFrameSetMesh(
  scene: Pick<QuakeAppSceneHandle, "add">,
  frameSet: QuakeModelFrameSet,
  frameIndex = 0,
  _options: QuakeModelFrameSetMountOptions = {},
): QuakeModelFrameSetHandle {
  let currentFrame = normalizedFrameIndex(frameIndex, frameSet.frames.length);
  const handle = mountQuakeModelMesh(
    scene,
    frameSet.frames[currentFrame]?.glyphGeometry ?? frameSet.baseGeometry,
  ) as QuakeModelFrameSetHandle;
  handle.getFrameIndex = () => currentFrame;
  handle.setFrameIndex = (next) => {
    const normalized = normalizedFrameIndex(next, frameSet.frames.length);
    if (normalized === currentFrame) return false;
    currentFrame = normalized;
    handle.setPolygons(quakeGlyphGeometryPolygons(
      frameSet.frames[currentFrame]?.glyphGeometry ?? frameSet.baseGeometry,
    ));
    return true;
  };
  handle.markMotionMaterialActive = () => false;
  return handle;
}

export function setQuakeModelFrameSetHandleFrame(
  handle: QuakeMeshHandle | null,
  frameIndex: number,
): boolean {
  return isQuakeModelFrameSetHandle(handle) && handle.setFrameIndex(frameIndex);
}

export function isQuakeModelFrameSetHandle(
  handle: QuakeMeshHandle | null,
): handle is QuakeModelFrameSetHandle {
  return typeof (handle as Partial<QuakeModelFrameSetHandle> | null)?.setFrameIndex === "function";
}

export function markQuakeModelFrameSetHandleMotionMaterial(
  handle: QuakeMeshHandle | null,
  reason?: string,
): boolean {
  return isQuakeModelFrameSetHandle(handle) && handle.markMotionMaterialActive(reason);
}

export function quakeGlyphGeometryPolygons(
  geometry: QuakeGlyphGeometry | null | undefined,
): Polygon[] {
  return geometry?.polygons.map((polygon) => ({
    vertices: polygon.v.map((vertex) => [vertex[0] ?? 0, vertex[1] ?? 0, vertex[2] ?? 0]),
    color: polygon.c,
  })) ?? [];
}

function normalizedFrameIndex(frameIndex: number, frameCount: number): number {
  if (frameCount <= 0) return 0;
  return Math.min(frameCount - 1, Math.max(0, Math.trunc(frameIndex)));
}
