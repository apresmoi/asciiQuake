import type {
  createPolyFirstPersonControls,
  createPolyPerspectiveCamera,
  createPolyScene,
} from "@layoutit/polycss";

import type { QuakeAppControlsHandle, QuakeAppSceneHandle } from "../app/context";
import { createQuakePolyRenderEngine } from "./polyEngine";

/**
 * cssQuake can render through more than one backend. `polycss` paints
 * CSS-transformed, texture-mapped DOM polygons (the default). `glyphcss`
 * rasterizes the same world geometry to ASCII art in a `<pre>` element.
 *
 * The two backends produce completely different DOM and consume scene data
 * differently, so the active engine is chosen once at startup (from a persisted
 * preference) and the whole engine is reconstructed by reloading the page when
 * the user flips the render-mode option — there is no live hot-swap.
 */
export type QuakeRenderMode = "polycss" | "glyphcss";

export const QUAKE_RENDER_MODES: readonly QuakeRenderMode[] = ["polycss", "glyphcss"];

/** glyphcss (ASCII) is this fork's whole point, so it is the out-of-the-box
 *  backend; polycss stays one Options toggle (or `?renderMode=polycss`) away. */
export const QUAKE_DEFAULT_RENDER_MODE: QuakeRenderMode = "glyphcss";

export function isQuakeRenderMode(value: unknown): value is QuakeRenderMode {
  return value === "polycss" || value === "glyphcss";
}

/** Options the camera factory accepts (mirrors the polycss perspective camera). */
export type QuakeRenderEngineCameraOptions = Parameters<typeof createPolyPerspectiveCamera>[0];

/** Scene options minus `camera`, which the engine wires internally. */
export type QuakeRenderEngineSceneOptions = Omit<NonNullable<Parameters<typeof createPolyScene>[1]>, "camera">;

/** First-person controls options (mirrors the polycss controls factory). */
export type QuakeRenderEngineControlsOptions = Parameters<typeof createPolyFirstPersonControls>[1];

/** The camera handle exposed by the scene (rotX/rotY/zoom state, update, etc.). */
export type QuakeRenderEngineCamera = QuakeAppSceneHandle["camera"];

export interface QuakeRenderEngineOptions {
  readonly camera: QuakeRenderEngineCameraOptions;
  readonly scene: QuakeRenderEngineSceneOptions;
}

/**
 * The facade every render backend implements. Phase 1 ships only the polycss
 * engine, which returns the real polycss handles so the rest of the app is
 * unchanged. The glyphcss engine (added in a later phase) returns structurally
 * compatible handles.
 */
export interface QuakeRenderEngine {
  readonly mode: QuakeRenderMode;
  readonly camera: QuakeRenderEngineCamera;
  readonly scene: QuakeAppSceneHandle;
  readonly cameraEl: HTMLElement;
  readonly sceneElement: HTMLElement;
  createControls(options: QuakeRenderEngineControlsOptions): QuakeAppControlsHandle;
}

/**
 * Construct the render engine for the given mode. Called once at startup.
 */
export function createQuakeRenderEngine(
  mode: QuakeRenderMode,
  host: HTMLElement,
  options: QuakeRenderEngineOptions,
): QuakeRenderEngine {
  switch (mode) {
    case "glyphcss":
      // The glyphcss engine lands in a later phase; until then fall back to
      // polycss so an early `?renderMode=glyphcss` never breaks the app.
      return createQuakePolyRenderEngine(host, options);
    case "polycss":
    default:
      return createQuakePolyRenderEngine(host, options);
  }
}
