import type { Vec3 } from "glyphcss";

import type { QuakeScene, QuakeVisibility } from "../types/quake";
import {
  createQuakeWorldVisibilityChurnStats,
  recordQuakeWorldVisibilitySync,
  type QuakeWorldVisibilityChurnStats,
} from "./debug/churnStats";
import type { QuakeMeshHandle } from "./render/engine";

export interface QuakeWorldControllerOptions {
  getOrigin: () => [number, number, number];
  syncPickupsVisibility: (origin: [number, number, number]) => void;
}

export interface QuakeWorldController {
  clear(): void;
  debugStats(): QuakeWorldDebugStats;
  dispose(): void;
  leafIndexAt(origin: Vec3): number | undefined;
  mount(result: QuakeScene): void;
  pixelate(handle?: QuakeMeshHandle | null): void;
  schedulePresentationResync(handle?: QuakeMeshHandle | null): Promise<void>;
  setDebugShellVisible(visible: boolean): void;
  syncVisibilityAt(origin: [number, number, number], force?: boolean): void;
  syncVisibility(force?: boolean): void;
  visibleLeavesAt(origin: [number, number, number]): Set<number> | null;
  waitForVisibleAtlasPages(): Promise<void>;
  waitForVisibleTextures(): Promise<void>;
}

export interface QuakeWorldDebugBucket {
  total: number;
  mounted: number;
}

export interface QuakeWorldDebugStats {
  currentLeafIndex: number | null;
  visibleLeafCount: number | null;
  pvsFaceCount: number | null;
  renderFaceCount: number;
  totalLeaves: number;
  mountedLeaves: number;
  unmountedLeaves: number;
  mountedAtlasLeaves: number;
  mountedSkyTextureLeaves: number;
  mountedSpecialTextureLeaves: number;
  mountedTextureAnimatedLeaves: number;
  mountedLightstyleLeaves: number;
  mountedBrushModelLeaves: number;
  mountedEntityLeaves: number;
  leavesByMesh: Record<string, QuakeWorldDebugBucket>;
  leavesByTag: Record<string, QuakeWorldDebugBucket>;
  visibilityChurn: QuakeWorldVisibilityChurnStats;
}

export function createQuakeWorldController(options: QuakeWorldControllerOptions): QuakeWorldController {
  let visibility: QuakeVisibility | null = null;
  let currentLeafIndex: number | null = null;
  let visibleLeafCount: number | null = null;
  let renderFaceCount = 0;
  let churn = createQuakeWorldVisibilityChurnStats();

  function clear(): void {
    visibility = null;
    currentLeafIndex = null;
    visibleLeafCount = null;
    renderFaceCount = 0;
    churn = createQuakeWorldVisibilityChurnStats();
  }

  function mount(result: QuakeScene): void {
    clear();
    visibility = result.visibility ?? null;
    renderFaceCount = result.glyphGeometry?.polygonCount ?? result.glyphGeometry?.polygons.length ?? 0;
    syncVisibility(true);
  }

  function syncVisibility(force = false): void {
    syncVisibilityAt(options.getOrigin(), force);
  }

  function syncVisibilityAt(origin: [number, number, number], force = false): void {
    const startedAt = performance.now();
    options.syncPickupsVisibility(origin);
    if (!visibility) {
      currentLeafIndex = null;
      visibleLeafCount = null;
      recordQuakeWorldVisibilitySync(churn, "no-pvs", startedAt, { force });
      return;
    }
    const nextLeaf = visibility.leafIndexAt(origin);
    const leaves = visibility.visibleLeavesAt(origin);
    currentLeafIndex = Number.isInteger(nextLeaf) ? nextLeaf : null;
    visibleLeafCount = leaves?.size ?? null;
    recordQuakeWorldVisibilitySync(churn, "same-key", startedAt, {
      force,
      pvsFaceCount: null,
    });
  }

  function debugStats(): QuakeWorldDebugStats {
    const totalLeaves = visibility?.metadata?.leaves.length ?? 0;
    return {
      currentLeafIndex,
      visibleLeafCount,
      pvsFaceCount: null,
      renderFaceCount,
      totalLeaves,
      mountedLeaves: 0,
      unmountedLeaves: totalLeaves,
      mountedAtlasLeaves: 0,
      mountedSkyTextureLeaves: 0,
      mountedSpecialTextureLeaves: 0,
      mountedTextureAnimatedLeaves: 0,
      mountedLightstyleLeaves: 0,
      mountedBrushModelLeaves: 0,
      mountedEntityLeaves: 0,
      leavesByMesh: {},
      leavesByTag: {},
      visibilityChurn: { ...churn },
    };
  }

  return {
    clear,
    debugStats,
    dispose: clear,
    leafIndexAt: (origin) => visibility?.leafIndexAt(origin),
    mount,
    pixelate: () => {},
    schedulePresentationResync: () => Promise.resolve(),
    setDebugShellVisible: () => {},
    syncVisibilityAt,
    syncVisibility,
    visibleLeavesAt: (origin) => visibility?.visibleLeavesAt(origin) ?? null,
    waitForVisibleAtlasPages: () => Promise.resolve(),
    waitForVisibleTextures: () => Promise.resolve(),
  };
}
