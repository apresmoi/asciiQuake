import {
  createGlyphFirstPersonControls,
  createGlyphPerspectiveCamera,
  type GlyphFirstPersonControlsHandle,
  type GlyphFirstPersonControlsOptions,
  type GlyphPerspectiveCameraHandle,
  type GlyphPerspectiveCameraOptions,
  type GlyphSceneHandle,
  type Polygon,
  type Vec3,
} from "glyphcss";

export type QuakeRenderMode = "glyphcss";

export const QUAKE_RENDER_MODES: readonly QuakeRenderMode[] = ["glyphcss"];
export const QUAKE_DEFAULT_RENDER_MODE: QuakeRenderMode = "glyphcss";

export function isQuakeRenderMode(value: unknown): value is QuakeRenderMode {
  return value === "glyphcss";
}

export type QuakeRenderEngineCameraOptions = GlyphPerspectiveCameraOptions & {
  target?: Vec3;
};

export type QuakeRenderEngineControlsOptions = GlyphFirstPersonControlsOptions;
export type QuakeAppControlsHandle = GlyphFirstPersonControlsHandle;

export interface QuakeRenderCameraState {
  target: Vec3;
  rotX: number;
  rotY: number;
  zoom: number;
  distance: number;
}

export interface QuakeRenderEngineCamera {
  readonly type: "perspective";
  readonly glyph: GlyphPerspectiveCameraHandle;
  readonly state: QuakeRenderCameraState;
  perspectiveStyle: string;
  update(next: Partial<QuakeRenderCameraState>): void;
}

export interface QuakeMeshTransform {
  id?: string;
  position?: Vec3;
  scale?: number | Vec3;
  rotation?: Vec3;
  [key: string]: unknown;
}

export interface QuakeMeshSource {
  polygons: Polygon[];
}

/**
 * Temporary data-only mesh contract for gameplay systems still holding render
 * handles. Its element is detached, so no compatibility geometry enters the DOM.
 */
export interface QuakeMeshHandle {
  readonly element: HTMLElement;
  readonly transform: QuakeMeshTransform;
  remove(): void;
  dispose(): void;
  setPolygons(polygons: Polygon[], options?: Record<string, unknown>): void;
  setTransform(transform: Partial<QuakeMeshTransform>): void;
  getPosition(): Vec3 | undefined;
  getRotation(): Vec3 | undefined;
  getScale(): number | Vec3 | undefined;
}

export interface QuakeAppSceneHandle {
  readonly host: HTMLElement;
  readonly cameraEl: HTMLElement;
  readonly camera: QuakeRenderEngineCamera;
  add(mesh: QuakeMeshSource, transform?: QuakeMeshTransform): QuakeMeshHandle;
  applyCamera(): void;
  destroy(): void;
}

export interface QuakeRenderEngineOptions {
  readonly camera: QuakeRenderEngineCameraOptions;
}

export interface QuakeRenderEngine {
  readonly mode: QuakeRenderMode;
  readonly camera: QuakeRenderEngineCamera;
  readonly scene: QuakeAppSceneHandle;
  readonly cameraEl: HTMLElement;
  createControls(options: QuakeRenderEngineControlsOptions): QuakeAppControlsHandle;
}

export function createQuakeRenderEngine(
  mode: QuakeRenderMode,
  host: HTMLElement,
  options: QuakeRenderEngineOptions,
): QuakeRenderEngine {
  const { target, ...cameraOptions } = options.camera;
  const glyphCamera = createGlyphPerspectiveCamera(cameraOptions);
  if (target) glyphCamera.target = [...target];

  const camera = createCameraAdapter(glyphCamera);
  const cameraEl = document.createElement("div");
  cameraEl.className = "quake-camera-host";
  const handles = new Set<QuakeMeshHandle>();

  const scene: QuakeAppSceneHandle = {
    host,
    cameraEl,
    camera,
    add(mesh, transform = {}) {
      const handle = createDataMeshHandle(mesh.polygons, transform, () => handles.delete(handle));
      handles.add(handle);
      return handle;
    },
    applyCamera() {},
    destroy() {
      for (const handle of [...handles]) handle.dispose();
      cameraEl.remove();
    },
  };

  const controlsScene = {
    host: cameraEl,
    camera: glyphCamera,
    rerender: () => scene.applyCamera(),
    setInteracting() {},
  } as unknown as GlyphSceneHandle;

  return {
    mode,
    camera,
    scene,
    cameraEl,
    createControls: (controlsOptions) => createGlyphFirstPersonControls(controlsScene, controlsOptions),
  };
}

function createCameraAdapter(glyph: GlyphPerspectiveCameraHandle): QuakeRenderEngineCamera {
  const state = {} as QuakeRenderCameraState;
  Object.defineProperties(state, {
    target: {
      enumerable: true,
      get: () => glyph.target,
      set: (value: Vec3) => { glyph.target = value; },
    },
    rotX: {
      enumerable: true,
      get: () => glyph.rotX,
      set: (value: number) => { glyph.rotX = value; },
    },
    rotY: {
      enumerable: true,
      get: () => glyph.rotY,
      set: (value: number) => { glyph.rotY = value; },
    },
    zoom: {
      enumerable: true,
      get: () => glyph.zoom,
      set: (value: number) => { glyph.zoom = value; },
    },
    distance: {
      enumerable: true,
      get: () => glyph.distance,
      set: (value: number) => { glyph.distance = value; },
    },
  });

  let perspectiveStyle = `${glyph.perspective}px`;
  return {
    type: "perspective",
    glyph,
    state,
    get perspectiveStyle() {
      return perspectiveStyle;
    },
    set perspectiveStyle(value: string) {
      perspectiveStyle = value;
      const perspective = Number.parseFloat(value);
      if (Number.isFinite(perspective)) glyph.perspective = perspective;
    },
    update(next) {
      if (next.target) glyph.target = [...next.target];
      if (next.rotX !== undefined) glyph.rotX = next.rotX;
      if (next.rotY !== undefined) glyph.rotY = next.rotY;
      if (next.zoom !== undefined) glyph.zoom = next.zoom;
      if (next.distance !== undefined) glyph.distance = next.distance;
    },
  };
}

function createDataMeshHandle(
  polygons: Polygon[],
  initialTransform: QuakeMeshTransform,
  onDispose: () => void,
): QuakeMeshHandle {
  const element = document.createElement("div");
  const transform = { ...initialTransform };
  void polygons;
  let disposed = false;
  const handle: QuakeMeshHandle = {
    element,
    transform,
    remove: dispose,
    dispose,
    setPolygons(next) {
      void next;
    },
    setTransform(next) {
      Object.assign(transform, next);
    },
    getPosition: () => transform.position,
    getRotation: () => transform.rotation,
    getScale: () => transform.scale,
  };
  return handle;

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    element.remove();
    onDispose();
  }
}
