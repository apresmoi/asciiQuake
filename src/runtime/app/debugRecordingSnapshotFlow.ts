import type {
  QuakeDebugRecordingSnapshot,
  QuakeDebugRecordingView,
} from "../debug/recording";
import type { QuakeTouchedTrigger } from "../collision";

export interface QuakeDebugRecordingSnapshotFlowOptions {
  currentMapName(): string;
  currentView(): QuakeDebugRecordingView;
  flags(): Record<string, unknown>;
  gameplay(): Record<string, unknown>;
  hazards(): Record<string, unknown>;
  input(): Record<string, unknown>;
  isLoading(): boolean;
  isPaused(): boolean;
  isPointerLocked(): boolean;
  multiplayer(): Record<string, unknown> | null;
  moversStats(): Record<string, unknown>;
  pickupsStats(): Record<string, unknown>;
  playerMovement(): Record<string, unknown>;
  playerProgress(): Record<string, unknown>;
  shootableCulling(origin: [number, number, number]): QuakeDebugRecordingSnapshot["shootableCulling"];
  shootablesStats(): QuakeDebugRecordingSnapshot["shootables"];
  targets(): Record<string, unknown>;
  touchedTriggers(origin: [number, number, number]): QuakeTouchedTrigger[];
  triggersStats(): Record<string, unknown>;
  viewUrl(view: QuakeDebugRecordingView): string;
  viewmodel(): Record<string, unknown>;
  worldStats(): QuakeDebugRecordingSnapshot["world"];
}

export interface QuakeDebugRecordingSnapshotFlow {
  capture(): QuakeDebugRecordingSnapshot;
}

export function createQuakeDebugRecordingSnapshotFlow(
  options: QuakeDebugRecordingSnapshotFlowOptions,
): QuakeDebugRecordingSnapshotFlow {
  function capture(): QuakeDebugRecordingSnapshot {
    const view = options.currentView();
    return {
      mapName: options.currentMapName(),
      view,
      viewUrl: options.viewUrl(view),
      loading: options.isLoading(),
      paused: options.isPaused(),
      pointerLocked: options.isPointerLocked(),
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio || 1,
        visualWidth: window.visualViewport?.width ?? null,
        visualHeight: window.visualViewport?.height ?? null,
      },
      world: options.worldStats(),
      player: {
        movement: options.playerMovement(),
        progress: options.playerProgress(),
      },
      shootables: options.shootablesStats(),
      shootableCulling: options.shootableCulling(view.origin),
      pickups: options.pickupsStats(),
      movers: options.moversStats(),
      triggers: {
        ...options.triggersStats(),
        touched: options.touchedTriggers(view.origin).map(triggerSnapshot),
      },
      targets: options.targets(),
      hazards: options.hazards(),
      multiplayer: options.multiplayer(),
      viewmodel: options.viewmodel(),
      input: options.input(),
      gameplay: options.gameplay(),
      dom: captureDomSnapshot(),
      flags: options.flags(),
      performance: capturePerformanceSnapshot(),
    };
  }

  return { capture };
}

function captureDomSnapshot(): Record<string, unknown> {
  const app = document.querySelector<HTMLElement>("#quake-app");
  return {
    elements: app?.querySelectorAll("*").length ?? 0,
    cameraHosts: app?.querySelectorAll(".quake-camera-host").length ?? 0,
    glyphOutputs: app?.querySelectorAll(
      "pre.quake-glyph-overlay, pre.quake-glyph-weapon-overlay, pre.quake-glyph-ui",
    ).length ?? 0,
    activeEffects: app?.querySelectorAll(".quake-impact-particle, .quake-effect-sprite").length ?? 0,
    bodyClass: document.body.className,
  };
}

function triggerSnapshot(trigger: QuakeTouchedTrigger): Record<string, unknown> {
  return {
    entityIndex: trigger.entityIndex,
    modelIndex: trigger.modelIndex,
    classname: trigger.classname,
    contact: trigger.contact ?? null,
    target: trigger.target ?? null,
    targetname: trigger.targetname ?? null,
  };
}

function capturePerformanceSnapshot(): Record<string, unknown> {
  const memory = (performance as Performance & {
    memory?: {
      jsHeapSizeLimit?: number;
      totalJSHeapSize?: number;
      usedJSHeapSize?: number;
    };
  }).memory;
  return {
    now: performance.now(),
    timeOrigin: performance.timeOrigin,
    documentHidden: document.hidden,
    visibilityState: document.visibilityState,
    memory: memory
      ? {
          jsHeapSizeLimit: memory.jsHeapSizeLimit ?? null,
          totalJSHeapSize: memory.totalJSHeapSize ?? null,
          usedJSHeapSize: memory.usedJSHeapSize ?? null,
        }
      : null,
  };
}
