import type { QuakeAssetManifest, QuakeAssetManifestMap, QuakeSceneMode } from "./session";
import {
  FALLBACK_QUAKE_ASSET_MANIFEST,
  quakeAssetManifestMapTitle,
  quakeAssetManifestSceneUrlMap,
  quakeAssetManifestSelectableLevels,
} from "./session";

export interface QuakeAssetCatalogFlow {
  assetRoot(): string | undefined;
  manifest(): QuakeAssetManifest;
  mapExists(mapName: string): boolean;
  mapTitle(level: QuakeAssetManifestMap): string;
  sceneUrl(mapName: string, mode?: QuakeSceneMode): string | undefined;
  selectableLevels(): QuakeAssetManifestMap[];
  setManifest(manifest: QuakeAssetManifest): void;
  startMap(): string;
  version(): number;
}

export function createQuakeAssetCatalogFlow(): QuakeAssetCatalogFlow {
  let assetManifest = FALLBACK_QUAKE_ASSET_MANIFEST;
  let mapUrls = quakeAssetManifestSceneUrlMap(assetManifest);
  let deathmatchMapUrls = quakeAssetManifestSceneUrlMap(assetManifest, "deathmatch");

  function manifest(): QuakeAssetManifest {
    return assetManifest;
  }

  // Level rows render from the scene state now (the menu controller pulls
  // selectableLevels() and pushes QuakeMenuSceneLevel rows) — no DOM here.
  function setManifest(manifest: QuakeAssetManifest): void {
    assetManifest = manifest;
    mapUrls = quakeAssetManifestSceneUrlMap(manifest);
    deathmatchMapUrls = quakeAssetManifestSceneUrlMap(manifest, "deathmatch");
  }

  function selectableLevels(): QuakeAssetManifestMap[] {
    return quakeAssetManifestSelectableLevels(assetManifest);
  }

  function mapTitle(level: QuakeAssetManifestMap): string {
    return quakeAssetManifestMapTitle(level);
  }

  function sceneUrl(mapName: string, mode: QuakeSceneMode = "singleplayer"): string | undefined {
    return (mode === "deathmatch" ? deathmatchMapUrls : mapUrls).get(mapName);
  }

  return {
    assetRoot: () => assetManifest.assetRoot,
    manifest,
    mapExists: (mapName) => sceneUrl(mapName) !== undefined,
    mapTitle,
    sceneUrl,
    selectableLevels,
    setManifest,
    startMap: () => assetManifest.startMap,
    version: () => assetManifest.version,
  };
}
