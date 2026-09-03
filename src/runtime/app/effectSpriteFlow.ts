import type { Vec3 } from "glyphcss";

import { QUAKE_COLLISION_UNIT_SCALE } from "../constants";
import type { QuakeGlyphEntityGeometry, QuakeGlyphEntityTransform } from "../render/glyphWorldOverlay";

const QUAKE_EFFECT_SPRITE_CLASS = "quake-effect-sprite";
const QUAKE_EFFECT_SPRITE_GLYPH_PRELOAD_ID = "effect-texture-preload:explosion";
const QUAKE_EFFECT_SPRITE_FRAME_DURATION_MS = 80;
const QUAKE_EFFECT_SPRITE_SCALE = 2;
const QUAKE_EFFECT_SPRITE_DENSITY = 1;
const QUAKE_EFFECT_SPRITE_TONE_SCALE = 3.9 / 3.5;
const QUAKE_EFFECT_SPRITE_DEFAULT_MAX = 4;
const QUAKE_EFFECT_SPRITE_MIN_DEPTH = 0.02;
const QUAKE_EFFECT_SPRITE_MIN_SCALE = 0.2;
const QUAKE_EFFECT_SPRITE_MAX_SCALE = 12;
const QUAKE_EFFECT_SPRITE_FALLBACK_VIEWPORT_WIDTH = 800;
const QUAKE_EFFECT_SPRITE_FALLBACK_VIEWPORT_HEIGHT = 600;

export interface QuakeEffectSpriteSpawn {
  origin?: Vec3;
  radiusUnits?: number;
}

export interface QuakeEffectSpriteFlow {
  clear(): void;
  dispose(): void;
  preload(): Promise<boolean>;
  setEnabled(enabled: boolean): void;
  spawnExplosion(input?: QuakeEffectSpriteSpawn): void;
}

export interface QuakeEffectSpriteFlowOptions {
  canShow(): boolean;
  cameraPerspectiveStyle?: () => string | null | undefined;
  decodeImage?: (url: string) => Promise<void>;
  effectSpritesUrl(): string | null | undefined;
  glyphEntitySink?: {
    removeEntity(id: string): void;
    setEntity(id: string, geometry: QuakeGlyphEntityGeometry | null, transform: QuakeGlyphEntityTransform): void;
    setEntityTransform(id: string, transform: QuakeGlyphEntityTransform): boolean;
  };
  isGameplayPaused(): boolean;
  layer: HTMLElement;
  maxSprites?: number;
  now?: () => number;
  viewOrigin?: () => Vec3 | null;
  viewRotation?: () => { rotX: number; rotY: number } | null;
}

export interface QuakeEffectSpriteManifest {
  explosionSprite: string;
  sprites: Record<string, QuakePreparedEffectSprite>;
}

export interface QuakePreparedEffectSprite {
  frameCount: number;
  frameDurationMs: number;
  frames: QuakePreparedEffectSpriteFrame[];
  header?: {
    maxHeight?: number;
    maxWidth?: number;
  };
  sourcePath: string;
  texture: {
    height: number;
    url: string;
    width: number;
  };
}

export interface QuakePreparedEffectSpriteFrame {
  height: number;
  index: number;
  originX: number;
  originY: number;
  width: number;
  x: number;
  y: number;
}

interface EffectSpriteHandle {
  active: boolean;
  element: HTMLElement | null;
  frameIndex: number;
  glyphId: string;
  origin: Vec3 | null;
  presentedFrameIndex: number;
  sprite: QuakePreparedEffectSprite | null;
  startedAt: number;
}

interface EffectSpriteProjection {
  scale: number;
  visible: boolean;
  x: number;
  y: number;
}

export function createQuakeEffectSpriteFlow(options: QuakeEffectSpriteFlowOptions): QuakeEffectSpriteFlow {
  const maxSprites = Math.max(1, Math.floor(options.maxSprites ?? QUAKE_EFFECT_SPRITE_DEFAULT_MAX));
  const now = options.now ?? (() => performance.now());
  const handles: EffectSpriteHandle[] = [];
  let disposed = false;
  let enabled = true;
  let frameId: number | null = null;
  let loadPromise: Promise<boolean> | null = null;
  let nextSpriteIndex = 0;
  let preparedExplosionSprite: QuakePreparedEffectSprite | null = null;
  const glyphEntitySink = options.glyphEntitySink ?? null;

  for (let index = 0; index < maxSprites; index++) {
    const element = glyphEntitySink ? null : document.createElement("i");
    if (element) {
      element.className = `${QUAKE_EFFECT_SPRITE_CLASS} quake-effect-sprite-explosion`;
      element.setAttribute("aria-hidden", "true");
      element.dataset.quakeEffectSpriteActive = "false";
    }
    handles.push({
      active: false,
      element,
      frameIndex: 0,
      glyphId: `effect:explosion:${index}`,
      origin: null,
      presentedFrameIndex: -1,
      sprite: null,
      startedAt: 0,
    });
  }

  void preload();

  function setEnabled(nextEnabled: boolean): void {
    enabled = nextEnabled;
    if (!enabled) clear();
  }

  async function preload(): Promise<boolean> {
    if (preparedExplosionSprite) return true;
    if (loadPromise) return loadPromise;
    const url = options.effectSpritesUrl();
    if (!url) return false;
    loadPromise = loadExplosionSprite(url)
      .then((sprite) => {
        if (!sprite || disposed) return false;
        preparedExplosionSprite = sprite;
        applyPreparedSpriteTexture(sprite);
        return true;
      })
      .catch(() => false)
      .finally(() => {
        loadPromise = null;
      });
    return loadPromise;
  }

  function spawnExplosion(input: QuakeEffectSpriteSpawn = {}): void {
    if (!enabled || disposed || options.isGameplayPaused() || !options.canShow()) return;
    const sprite = preparedExplosionSprite;
    if (!sprite) {
      void preload();
      return;
    }
    const handle = nextHandle();
    handle.active = true;
    handle.frameIndex = 0;
    handle.origin = input.origin ? [...input.origin] as Vec3 : null;
    handle.sprite = sprite;
    handle.startedAt = now();
    handle.presentedFrameIndex = -1;
    if (handle.element) {
      handle.element.dataset.quakeEffectSpriteActive = "true";
      handle.element.dataset.quakeEffectSpriteSource = sprite.sourcePath;
      handle.element.style.opacity = "1";
      if (handle.element.parentElement !== options.layer) options.layer.appendChild(handle.element);
    }
    syncHandle(handle);
    ensureFrame();
  }

  function clear(): void {
    for (const handle of handles) {
      if (handle.active) removeHandlePresentation(handle);
      handle.active = false;
      handle.origin = null;
      handle.sprite = null;
      handle.startedAt = 0;
      handle.frameIndex = 0;
      handle.presentedFrameIndex = -1;
      if (handle.element) {
        handle.element.dataset.quakeEffectSpriteActive = "false";
        delete handle.element.dataset.quakeEffectSpriteFrame;
        delete handle.element.dataset.quakeEffectSpriteSource;
        handle.element.style.opacity = "0";
        handle.element.style.transform = "translate3d(-50%, -50%, 0) scale(1)";
        handle.element.remove();
      }
    }
    cancelFrame();
  }

  function dispose(): void {
    disposed = true;
    clear();
    if (glyphEntitySink) glyphEntitySink.removeEntity(QUAKE_EFFECT_SPRITE_GLYPH_PRELOAD_ID);
    for (const handle of handles) handle.element?.remove();
  }

  function nextHandle(): EffectSpriteHandle {
    const inactive = handles.find((handle) => !handle.active);
    if (inactive) return inactive;
    const handle = handles[nextSpriteIndex];
    nextSpriteIndex = (nextSpriteIndex + 1) % handles.length;
    return handle;
  }

  async function loadExplosionSprite(url: string): Promise<QuakePreparedEffectSprite | null> {
    const prepared = await loadQuakeExplosionSprite(url);
    if (!prepared) return null;
    if (!glyphEntitySink) await decodeSpriteTexture(prepared.texture.url);
    return prepared;
  }

  async function decodeSpriteTexture(url: string): Promise<void> {
    if (options.decodeImage) {
      await options.decodeImage(url);
      return;
    }
    await decodeImage(url);
  }

  function applyPreparedSpriteTexture(sprite: QuakePreparedEffectSprite): void {
    if (glyphEntitySink) {
      const frame = sprite.frames[0];
      if (frame) {
        // Keep one zero-scale textured mesh registered so GlyphCSS decodes and
        // retains the sampler before gameplay can spawn the visible quad. Without
        // this, its first async render uses the white fallback for one frame.
        glyphEntitySink.setEntity(
          QUAKE_EFFECT_SPRITE_GLYPH_PRELOAD_ID,
          glyphEffectSpriteFrameGeometry(sprite, frame),
          { position: [0, 0, 0], scale: 0 },
        );
      }
      return;
    }
    for (const handle of handles) {
      if (!handle.element) continue;
      handle.element.style.backgroundImage = cssUrl(sprite.texture.url);
      handle.element.style.backgroundSize = `${sprite.texture.width}px ${sprite.texture.height}px`;
    }
  }

  function syncHandle(handle: EffectSpriteHandle): void {
    const sprite = handle.sprite;
    if (!sprite) return;
    const frame = sprite.frames[handle.frameIndex] ?? sprite.frames[0];
    if (glyphEntitySink) {
      const geometry = glyphEffectSpriteFrameGeometry(sprite, frame);
      const transform = glyphEffectSpriteTransform(handle.origin);
      if (handle.presentedFrameIndex !== handle.frameIndex) {
        glyphEntitySink.setEntity(handle.glyphId, geometry, transform);
        handle.presentedFrameIndex = handle.frameIndex;
      } else if (!glyphEntitySink.setEntityTransform(handle.glyphId, transform)) {
        glyphEntitySink.setEntity(handle.glyphId, geometry, transform);
      }
      return;
    }
    if (!handle.element) return;
    handle.element.style.width = `${frame.width}px`;
    handle.element.style.height = `${frame.height}px`;
    handle.element.style.backgroundImage = cssUrl(sprite.texture.url);
    handle.element.style.backgroundSize = `${sprite.texture.width}px ${sprite.texture.height}px`;
    handle.element.style.backgroundPosition = `${-frame.x}px ${-frame.y}px`;
    handle.element.dataset.quakeEffectSpriteActive = handle.active ? "true" : "false";
    handle.element.dataset.quakeEffectSpriteFrame = String(frame.index);
    handle.element.dataset.quakeEffectSpriteSource = sprite.sourcePath;
    const projection = effectSpriteProjection(handle.origin, sprite, frame);
    handle.element.style.left = `${projection.x}px`;
    handle.element.style.top = `${projection.y}px`;
    handle.element.style.opacity = handle.active && projection.visible ? "1" : "0";
    handle.element.style.transform = `translate3d(-50%, -50%, 0) scale(${roundCssNumber(projection.scale)})`;
  }

  function effectSpriteProjection(
    origin: Vec3 | null,
    sprite: QuakePreparedEffectSprite,
    frame: QuakePreparedEffectSpriteFrame,
  ): EffectSpriteProjection {
    const viewport = layerViewport();
    if (!origin) {
      return {
        scale: 1,
        visible: true,
        x: viewport.width / 2,
        y: viewport.height / 2,
      };
    }
    const viewOrigin = options.viewOrigin?.();
    const rotation = options.viewRotation?.();
    const perspective = effectSpritePerspectivePx();
    if (!viewOrigin || !rotation || !Number.isFinite(perspective) || perspective <= 0) {
      return {
        scale: 1,
        visible: true,
        x: viewport.width / 2,
        y: viewport.height / 2,
      };
    }
    const axes = viewAxes(rotation.rotX, rotation.rotY);
    const relative: Vec3 = [
      origin[0] - viewOrigin[0],
      origin[1] - viewOrigin[1],
      origin[2] - viewOrigin[2],
    ];
    const depth = dotVec3(relative, axes.forward);
    if (depth <= QUAKE_EFFECT_SPRITE_MIN_DEPTH) {
      return {
        scale: 0,
        visible: false,
        x: viewport.width / 2,
        y: viewport.height / 2,
      };
    }
    const x = dotVec3(relative, axes.right);
    const y = -dotVec3(relative, axes.up);
    const worldWidth = Math.max(1, sprite.header?.maxWidth ?? frame.width) * QUAKE_COLLISION_UNIT_SCALE;
    const scale = clampNumber(
      QUAKE_EFFECT_SPRITE_SCALE * (perspective * worldWidth) / (depth * Math.max(1, frame.width)),
      QUAKE_EFFECT_SPRITE_MIN_SCALE,
      QUAKE_EFFECT_SPRITE_MAX_SCALE,
    );
    return {
      scale,
      visible: true,
      x: viewport.width / 2 + (x / depth) * perspective,
      y: viewport.height / 2 + (y / depth) * perspective,
    };
  }

  function effectSpritePerspectivePx(): number {
    const value = options.cameraPerspectiveStyle?.() ?? "";
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : layerViewport().width;
  }

  function layerViewport(): { height: number; width: number } {
    return {
      width: options.layer.clientWidth || window.innerWidth || QUAKE_EFFECT_SPRITE_FALLBACK_VIEWPORT_WIDTH,
      height: options.layer.clientHeight || window.innerHeight || QUAKE_EFFECT_SPRITE_FALLBACK_VIEWPORT_HEIGHT,
    };
  }

  function ensureFrame(): void {
    if (frameId !== null) return;
    frameId = requestAnimationFrame(tick);
  }

  function cancelFrame(): void {
    if (frameId === null) return;
    cancelAnimationFrame(frameId);
    frameId = null;
  }

  function tick(at: number): void {
    frameId = null;
    if (disposed || !enabled || options.isGameplayPaused() || !options.canShow()) {
      clear();
      return;
    }
    let activeCount = 0;
    for (const handle of handles) {
      const sprite = handle.sprite;
      if (!handle.active || !sprite) continue;
      const elapsed = at - handle.startedAt;
      const frameIndex = Math.floor(elapsed / sprite.frameDurationMs);
      if (frameIndex >= sprite.frameCount) {
        removeHandlePresentation(handle);
        handle.active = false;
        handle.presentedFrameIndex = -1;
        if (handle.element) {
          handle.element.dataset.quakeEffectSpriteActive = "false";
          handle.element.style.opacity = "0";
          handle.element.remove();
        }
        continue;
      }
      handle.frameIndex = clampNumber(frameIndex, 0, sprite.frameCount - 1);
      syncHandle(handle);
      activeCount++;
    }
    if (activeCount > 0) ensureFrame();
  }

  return {
    clear,
    dispose,
    preload,
    setEnabled,
    spawnExplosion,
  };

  function glyphEffectSpriteTransform(origin: Vec3 | null): QuakeGlyphEntityTransform {
    const rotation = options.viewRotation?.();
    return {
      position: origin ? [...origin] as Vec3 : [0, 0, 0],
      rotation: rotation ? glyphBillboardRotation(rotation.rotX, rotation.rotY) : [0, 0, 0],
      scale: QUAKE_EFFECT_SPRITE_SCALE,
      density: QUAKE_EFFECT_SPRITE_DENSITY,
      toneScale: QUAKE_EFFECT_SPRITE_TONE_SCALE,
    };
  }

  function removeHandlePresentation(handle: EffectSpriteHandle): void {
    if (glyphEntitySink && handle.presentedFrameIndex >= 0) glyphEntitySink.removeEntity(handle.glyphId);
    handle.presentedFrameIndex = -1;
  }
}

/** Load and validate the prepared explosion used by both gameplay and labs. */
export async function loadQuakeExplosionSprite(
  manifestUrl: string,
): Promise<QuakePreparedEffectSprite | null> {
  const response = await fetch(manifestUrl);
  if (!response.ok) return null;
  const manifest = normalizeEffectSpriteManifest(await response.json());
  if (!manifest) return null;
  const sprite = manifest.sprites[manifest.explosionSprite];
  if (!sprite) return null;
  return {
    ...sprite,
    frameDurationMs: QUAKE_EFFECT_SPRITE_FRAME_DURATION_MS,
    texture: {
      ...sprite.texture,
      url: resolveEffectSpriteUrl(sprite.texture.url, manifestUrl),
    },
  };
}

function normalizeEffectSpriteManifest(value: unknown): QuakeEffectSpriteManifest | null {
  if (!isRecord(value) || typeof value.explosionSprite !== "string" || !isRecord(value.sprites)) return null;
  const sprites: Record<string, QuakePreparedEffectSprite> = {};
  for (const [path, sprite] of Object.entries(value.sprites)) {
    const prepared = normalizeEffectSprite(sprite);
    if (prepared) sprites[path] = prepared;
  }
  return {
    explosionSprite: value.explosionSprite,
    sprites,
  };
}

function normalizeEffectSprite(value: unknown): QuakePreparedEffectSprite | null {
  if (!isRecord(value) || !isRecord(value.texture) || !Array.isArray(value.frames)) return null;
  if (typeof value.sourcePath !== "string") return null;
  const texture = value.texture;
  const textureUrl = typeof texture.url === "string" ? texture.url : "";
  const textureWidth = typeof texture.width === "number" ? texture.width : 0;
  const textureHeight = typeof texture.height === "number" ? texture.height : 0;
  if (!textureUrl || textureWidth <= 0 || textureHeight <= 0) return null;
  const frames = value.frames.map(normalizeEffectSpriteFrame)
    .filter((frame): frame is QuakePreparedEffectSpriteFrame => frame !== null);
  const frameCount = typeof value.frameCount === "number" ? Math.floor(value.frameCount) : frames.length;
  if (frameCount <= 0 || frames.length < frameCount) return null;
  return {
    frameCount,
    frameDurationMs: typeof value.frameDurationMs === "number" && value.frameDurationMs > 0
      ? value.frameDurationMs
      : QUAKE_EFFECT_SPRITE_FRAME_DURATION_MS,
    frames,
    header: isRecord(value.header)
      ? {
        ...(typeof value.header.maxHeight === "number" ? { maxHeight: value.header.maxHeight } : {}),
        ...(typeof value.header.maxWidth === "number" ? { maxWidth: value.header.maxWidth } : {}),
      }
      : undefined,
    sourcePath: value.sourcePath,
    texture: {
      height: textureHeight,
      url: textureUrl,
      width: textureWidth,
    },
  };
}

function glyphBillboardRotation(rotX: number, rotY: number): [number, number, number] {
  const { forward, right, up } = viewAxes(rotX, rotY);
  const ry = Math.asin(clampNumber(up[0], -1, 1));
  const rx = Math.atan2(-up[1], up[2]);
  const rz = Math.atan2(-forward[0], right[0]);
  return [rx, ry, rz].map((radians) => cleanDegrees(radians * 180 / Math.PI)) as [number, number, number];
}

function cleanDegrees(value: number): number {
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Math.abs(rounded) < 0.000001 ? 0 : rounded;
}

function normalizeEffectSpriteFrame(value: unknown): QuakePreparedEffectSpriteFrame | null {
  if (!isRecord(value)) return null;
  const index = typeof value.index === "number" ? Math.floor(value.index) : -1;
  const x = typeof value.x === "number" ? value.x : 0;
  const y = typeof value.y === "number" ? value.y : 0;
  const width = typeof value.width === "number" ? value.width : 0;
  const height = typeof value.height === "number" ? value.height : 0;
  if (index < 0 || width <= 0 || height <= 0) return null;
  const originX = typeof value.originX === "number"
    ? value.originX
    : typeof value.xoff === "number" ? value.xoff : -width / 2;
  const originY = typeof value.originY === "number"
    ? value.originY
    : typeof value.yoff === "number" ? -value.yoff : height / 2;
  return { height, index, originX, originY, width, x, y };
}

export function glyphEffectSpriteFrameGeometry(
  sprite: QuakePreparedEffectSprite,
  frame: QuakePreparedEffectSpriteFrame,
): QuakeGlyphEntityGeometry {
  const left = frame.originX * QUAKE_COLLISION_UNIT_SCALE;
  const right = (frame.originX + frame.width) * QUAKE_COLLISION_UNIT_SCALE;
  const top = frame.originY * QUAKE_COLLISION_UNIT_SCALE;
  const bottom = (frame.originY - frame.height) * QUAKE_COLLISION_UNIT_SCALE;
  const u0 = frame.x / sprite.texture.width;
  const u1 = (frame.x + frame.width) / sprite.texture.width;
  const vTop = 1 - frame.y / sprite.texture.height;
  const vBottom = 1 - (frame.y + frame.height) / sprite.texture.height;
  return {
    t: sprite.texture.url,
    polygons: [{
      v: [
        [left, 0, bottom],
        [right, 0, bottom],
        [right, 0, top],
        [left, 0, top],
      ],
      // GlyphCSS multiplies sampled texels by the polygon colour, so this must
      // stay white to preserve the authored sprite RGB. The zero-scale sampler
      // preloader prevents this opaque fallback from reaching a visible frame.
      c: "#ffffff",
      u: [
        [u0, vBottom],
        [u1, vBottom],
        [u1, vTop],
        [u0, vTop],
      ],
    }],
  };
}

function resolveEffectSpriteUrl(url: string, manifestUrl: string): string {
  try {
    return new URL(url, new URL(manifestUrl, window.location.href)).toString();
  } catch {
    return url;
  }
}

async function decodeImage(url: string): Promise<void> {
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.addEventListener("load", () => resolve(), { once: true });
    image.addEventListener("error", () => reject(new Error(`Could not load effect sprite texture ${url}.`)), { once: true });
    image.src = url;
  });
  if (typeof image.decode === "function") await image.decode();
}

function viewAxes(rotX: number, rotY: number): { forward: Vec3; right: Vec3; up: Vec3 } {
  const rx = (rotX * Math.PI) / 180;
  const ry = (rotY * Math.PI) / 180;
  const forward = normalizeVec3([
    -Math.sin(rx) * Math.cos(ry),
    -Math.sin(rx) * Math.sin(ry),
    -Math.cos(rx),
  ]);
  const right = normalizeVec3([-Math.sin(ry), Math.cos(ry), 0]);
  return {
    forward,
    right,
    up: normalizeVec3(crossVec3(right, forward)),
  };
}

function crossVec3(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function dotVec3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalizeVec3(value: Vec3): Vec3 {
  const length = Math.hypot(value[0], value[1], value[2]);
  if (length <= 0.000001) return [0, 0, 0];
  return [value[0] / length, value[1] / length, value[2] / length];
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundCssNumber(value: number): string {
  return Number(value.toFixed(4)).toString();
}

function cssUrl(url: string): string {
  return `url("${url.replace(/["\\\n\r\f]/g, "\\$&")}")`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
