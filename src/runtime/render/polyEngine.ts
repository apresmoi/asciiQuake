import { createPolyFirstPersonControls, createPolyPerspectiveCamera, createPolyScene } from "@layoutit/polycss";

import type {
  QuakeRenderEngine,
  QuakeRenderEngineControlsOptions,
  QuakeRenderEngineOptions,
} from "./engine";

/**
 * The default cssQuake backend: polycss. This wraps the existing
 * `createPolyPerspectiveCamera` / `createPolyScene` / `createPolyFirstPersonControls`
 * calls 1:1 so behaviour is identical to the pre-facade code — it only moves
 * construction behind the {@link QuakeRenderEngine} interface.
 */
export function createQuakePolyRenderEngine(
  host: HTMLElement,
  options: QuakeRenderEngineOptions,
): QuakeRenderEngine {
  const camera = createPolyPerspectiveCamera(options.camera);
  const scene = createPolyScene(host, { camera, ...options.scene });

  return {
    mode: "polycss",
    camera,
    scene,
    cameraEl: scene.cameraEl as HTMLElement,
    sceneElement: scene.sceneElement,
    createControls(controlsOptions: QuakeRenderEngineControlsOptions) {
      return createPolyFirstPersonControls(scene, controlsOptions);
    },
  };
}
