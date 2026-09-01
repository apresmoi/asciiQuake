import type { QuakeEntity, QuakeScene } from "../../types/quake";
import type { QuakeLoadingProgressTracker } from "../loadingConsole";
import {
  type QuakePickupModelLibrary,
  type QuakeProgramMetadata,
} from "../pickups";
import type { QuakeAssetManifest } from "./session";

export interface QuakeAssetWarmupFlowOptions {
  assetManifest(): QuakeAssetManifest;
  isDisposed(): boolean;
  onPickupModelLibrary(library: QuakePickupModelLibrary): void;
  onProgramMetadata(metadata: QuakeProgramMetadata): void;
  shouldSpawnPickup?(entity: QuakeEntity): boolean;
  shouldSpawnShootable?(entity: QuakeEntity): boolean;
}

export interface QuakeAssetWarmupFlow {
  loadPickupModels(progress?: QuakeLoadingProgressTracker): Promise<void>;
  loadProgramMetadata(progress?: QuakeLoadingProgressTracker): Promise<void>;
  modelLibrary(): QuakePickupModelLibrary | null;
  preloadMapModelAssets(mapName: string, progress?: QuakeLoadingProgressTracker): Promise<void>;
  preloadSceneModelAssets(scene: QuakeScene, progress?: QuakeLoadingProgressTracker): Promise<void>;
  programMetadata(): QuakeProgramMetadata | null;
}

export function createQuakeAssetWarmupFlow(options: QuakeAssetWarmupFlowOptions): QuakeAssetWarmupFlow {
  let currentModelLibrary: QuakePickupModelLibrary | null = null;
  let currentProgramMetadata: QuakeProgramMetadata | null = null;

  function modelLibrary(): QuakePickupModelLibrary | null {
    return currentModelLibrary;
  }

  function programMetadata(): QuakeProgramMetadata | null {
    return currentProgramMetadata;
  }

  async function loadPickupModels(progress?: QuakeLoadingProgressTracker): Promise<void> {
    const completePickupTask = progress?.startTask("Pickup definitions");
    const url = options.assetManifest().assets.pickupModelsUrl;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not load ${url}.`);
    const library = await response.json() as QuakePickupModelLibrary;
    if (options.isDisposed()) return;
    currentModelLibrary = library;
    options.onPickupModelLibrary(library);
    completePickupTask?.();
  }

  async function loadProgramMetadata(progress?: QuakeLoadingProgressTracker): Promise<void> {
    const completeMetadataTask = progress?.startTask("Game logic");
    const url = options.assetManifest().assets.programMetadataUrl;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not load ${url}.`);
    const metadata = await response.json() as QuakeProgramMetadata;
    if (options.isDisposed()) return;
    currentProgramMetadata = metadata;
    options.onProgramMetadata(metadata);
    completeMetadataTask?.();
  }

  async function preloadMapModelAssets(
    _mapName: string,
    progress?: QuakeLoadingProgressTracker,
  ): Promise<void> {
    progress?.startTask("Map model geometry")();
  }

  async function preloadSceneModelAssets(
    _scene: QuakeScene,
    progress?: QuakeLoadingProgressTracker,
  ): Promise<void> {
    progress?.startTask("Scene model geometry")();
  }

  function shouldSpawnPickup(entity: QuakeEntity): boolean {
    return options.shouldSpawnPickup?.(entity) ?? shouldSpawnQuakeEntityForCurrentGame(entity);
  }

  function shouldSpawnShootable(entity: QuakeEntity): boolean {
    return options.shouldSpawnShootable?.(entity) ?? shouldSpawnQuakeEntityForCurrentGame(entity);
  }

  return {
    loadPickupModels,
    loadProgramMetadata,
    modelLibrary,
    preloadMapModelAssets,
    preloadSceneModelAssets,
    programMetadata,
  };
}
