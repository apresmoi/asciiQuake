import type { Polygon, Vec3 } from "glyphcss";
import type {
  QuakeAppSceneHandle,
  QuakeMeshHandle,
  QuakeMeshSource,
} from "../render/engine";

import type { QuakeEntity } from "../../types/quake";
import { isQuakeDebugDomMetadataEnabled } from "../debug/traceMarks";
import { quakeEntityNumber } from "../entities";
import { quakeAliasModelRenderYaw, normalizeQuakeRenderYaw } from "../aliasModelOrientation";
import {
  quakePickupPolygons,
  type QuakePickupModel,
} from "../pickups";
import {
  mountQuakeModelFrameSetMesh,
  mountQuakeModelMesh,
  type QuakeModelFrameSetMountOptions,
} from "../modelMesh";
import { quakeShootableFallbackPolygons } from "../shootables";

export interface QuakeEntityMeshMountFlowOptions {
  pixelate(handle?: QuakeMeshHandle | null): void;
  pointToWorld(point: { x: number; y: number; z: number }): Vec3;
  scene: Pick<QuakeAppSceneHandle, "add">;
  schedulePresentationResync(handle?: QuakeMeshHandle | null): Promise<void>;
}

export interface QuakeEntityMeshMountFlow {
  addPickupMesh(entity: QuakeEntity, model?: QuakePickupModel, frameIndex?: number): QuakeMeshHandle | null;
  addShootableMesh(
    entity: QuakeEntity,
    model?: QuakePickupModel,
    frameIndex?: number,
    options?: QuakeEntityShootableMeshMountOptions,
  ): QuakeMeshHandle | null;
}

export interface QuakeEntityShootableMeshMountOptions {
  frameSetMountOptions?: QuakeModelFrameSetMountOptions;
}

export function createQuakeEntityMeshMountFlow(
  options: QuakeEntityMeshMountFlowOptions,
): QuakeEntityMeshMountFlow {
  function addPickupMesh(entity: QuakeEntity, model?: QuakePickupModel, frameIndex = 0): QuakeMeshHandle | null {
    if (!entity.origin) return null;
    const handle = mountEntityModelMesh(options.scene, model, frameIndex)
      ?? addProceduralPickupMesh(entity);
    if (!handle) return null;
    handle.element.classList.add("pickup");
    keepPickupBackfacesVisible(handle.element);
    if (isQuakeDebugDomMetadataEnabled()) {
      handle.element.dataset.entityIndex = String(entity.index);
      handle.element.dataset.classname = entity.classname;
    }
    const angle = entity.angle ?? quakeEntityNumber(entity, "angle", 0);
    handle.setTransform({
      position: options.pointToWorld(entity.origin),
      rotation: [0, 0, model ? quakeAliasModelRenderYaw(angle) : normalizeQuakeRenderYaw(angle)],
      scale: 1,
    });
    if (!model) {
      options.pixelate(handle);
      void options.schedulePresentationResync(handle);
    }
    return handle;
  }

  function addShootableMesh(
    entity: QuakeEntity,
    model?: QuakePickupModel,
    frameIndex = 0,
    mountOptions: QuakeEntityShootableMeshMountOptions = {},
  ): QuakeMeshHandle | null {
    const handle = mountEntityModelMesh(options.scene, model, frameIndex, mountOptions.frameSetMountOptions)
      ?? addProceduralShootableMesh(entity);
    if (!handle) return null;
    return handle;
  }

  function addProceduralShootableMesh(entity: QuakeEntity): QuakeMeshHandle | null {
    const polygons = quakeShootableFallbackPolygons(entity);
    if (!polygons.length) return null;
    return options.scene.add(makeParseResult(polygons), {
      merge: false,
      meshResolution: "lossless",
      excludeFromAutoCenter: true,
    });
  }

  function addProceduralPickupMesh(entity: QuakeEntity): QuakeMeshHandle | null {
    const polygons = quakePickupPolygons(entity);
    if (!polygons.length) return null;
    return options.scene.add(makeParseResult(polygons), {
      merge: false,
      meshResolution: "lossless",
      excludeFromAutoCenter: true,
    });
  }

  return {
    addPickupMesh,
    addShootableMesh,
  };
}

function mountEntityModelMesh(
  scene: Pick<QuakeAppSceneHandle, "add">,
  model: QuakePickupModel | undefined,
  frameIndex: number,
  frameSetMountOptions?: QuakeModelFrameSetMountOptions,
): QuakeMeshHandle | null {
  if (!model) return null;
  const frames = model.animationFrames ?? [];
  return frames.length > 1
    ? mountQuakeModelFrameSetMesh(scene, { baseGeometry: model.glyphGeometry, frames }, frameIndex, frameSetMountOptions)
    : mountQuakeModelMesh(scene, frames[frameIndex]?.glyphGeometry ?? model.glyphGeometry);
}

function keepPickupBackfacesVisible(element: HTMLElement): void {
  for (const leaf of element.querySelectorAll<HTMLElement>("b,i,s,u")) {
    leaf.classList.add("quake-pickup-backface");
  }
}

function makeParseResult(polygons: Polygon[]): QuakeMeshSource {
  return { polygons, objectUrls: [], warnings: [], dispose: () => undefined };
}
