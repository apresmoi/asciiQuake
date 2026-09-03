/**
 * Explosion lab — the original Quake frames and the actual gameplay entity
 * renderer in isolation. Nothing here implements a second ASCII converter:
 * the right pane is createQuakeGlyphWorldOverlay plus the shared explosion
 * geometry builder used by createQuakeEffectSpriteFlow.
 */
import { GLYPH_FONT_ATLAS_ASCII } from "glyphcss";

import "../quake.css";
import "./explosion.css";
import {
  glyphEffectSpriteFrameGeometry,
  loadQuakeExplosionSprite,
  type QuakePreparedEffectSprite,
} from "../runtime/app/effectSpriteFlow";
import {
  createQuakeGlyphWorldOverlay,
  type QuakeGlyphWorldOverlay,
} from "../runtime/render/glyphWorldOverlay";

const MANIFEST_URL = "/q/effects.json";
const ENTITY_ID = "explosion-lab";
const CAMERA_VIEW = [0, 0, 0, 90, 270] as const;

interface ExplosionLabApi {
  currentFrame: number;
  frameCount: number;
  overlay: QuakeGlyphWorldOverlay;
  playing: boolean;
  ready: boolean;
}

declare global {
  interface Window {
    __asciiQuakeExplosionLab?: ExplosionLabApi;
  }
}

const sourceCanvas = required<HTMLCanvasElement>("explosion-source");
const sourceContext = sourceCanvas.getContext("2d", { alpha: true });
if (!sourceContext) throw new Error("Explosion lab requires a 2D canvas context.");

const glyphHost = required<HTMLElement>("explosion-glyph-host");
const strip = required<HTMLElement>("explosion-strip");
const status = required<HTMLElement>("explosion-status");
const playButton = required<HTMLButtonElement>("explosion-play");
const frameInput = required<HTMLInputElement>("explosion-frame");
const durationInput = required<HTMLInputElement>("explosion-duration");
const brightnessInput = required<HTMLInputElement>("explosion-brightness");
const cellInput = required<HTMLInputElement>("explosion-cell");
const densityInput = required<HTMLInputElement>("explosion-density");
const scaleInput = required<HTMLInputElement>("explosion-scale");
const paletteInput = required<HTMLSelectElement>("explosion-palette");

const params = new URLSearchParams(location.search);
frameInput.value = String(paramNumber("frame", 0, 5, 0));
durationInput.value = String(paramNumber("duration", 40, 300, 80));
brightnessInput.value = String(paramNumber("bright", 1, 10, 3.9));
cellInput.value = String(paramNumber("cell", 6, 24, 12));
densityInput.value = String(paramNumber("density", 1, 4, 1));
scaleInput.value = String(paramNumber("scale", 0.5, 2, 2));
if (["dense", "detail", "ascii"].includes(params.get("palette") ?? "")) {
  paletteInput.value = params.get("palette")!;
}

let currentFrame = Math.round(Number(frameInput.value));
let frameDurationMs = Number(durationInput.value);
let playing = params.get("play") === "1";
let playbackStartedAt = performance.now() - currentFrame * frameDurationMs;
let sprite: QuakePreparedEffectSprite | null = null;
let spriteImage: HTMLImageElement | null = null;
let overlay: QuakeGlyphWorldOverlay | null = null;
let animationFrame = 0;

const api = {} as ExplosionLabApi;
Object.defineProperties(api, {
  currentFrame: { enumerable: true, get: () => currentFrame },
  frameCount: { enumerable: true, get: () => sprite?.frameCount ?? 0 },
  overlay: { enumerable: true, get: () => overlay },
  playing: { enumerable: true, get: () => playing },
  ready: { enumerable: true, get: () => Boolean(sprite && spriteImage && overlay) },
});
window.__asciiQuakeExplosionLab = api;

try {
  sprite = await loadQuakeExplosionSprite(MANIFEST_URL);
  if (!sprite) throw new Error(`Could not load a valid explosion from ${MANIFEST_URL}.`);
  spriteImage = await loadImage(sprite.texture.url);
  currentFrame = Math.min(currentFrame, sprite.frameCount - 1);
  frameInput.max = String(sprite.frameCount - 1);

  overlay = createOverlay();
  buildFrameStrip();
  bindControls();
  updateReadouts();

  // Register the sampler invisibly before presenting frame zero. This is the
  // same prewarm used by gameplay and makes the lab useful for first-frame bugs.
  overlay.setEntity(
    "explosion-lab-preload",
    glyphEffectSpriteFrameGeometry(sprite, sprite.frames[0]!),
    { position: [0, 10, 0], scale: 0 },
  );
  await nextPaint();
  applyFrame(currentFrame);

  status.textContent = "Ready — the right pane uses the same texture, UV quad, tone defaults, glyph selection, and entity renderer as gameplay; literal spans preserve exact isolated colours.";
  status.dataset.state = "ready";
  playButton.textContent = playing ? "Pause" : "Play";
  animationFrame = requestAnimationFrame(animate);
} catch (error) {
  status.textContent = error instanceof Error ? error.message : String(error);
  status.dataset.state = "error";
  throw error;
}

function createOverlay(): QuakeGlyphWorldOverlay {
  const world = createQuakeGlyphWorldOverlay({
    host: glyphHost,
    fontAtlas: GLYPH_FONT_ATLAS_ASCII,
    perspective: 1400,
    pinPerspective: true,
    zoom: 50,
    fixedView: CAMERA_VIEW,
    supersample: 1,
    temporalBlend: 0,
    cellPx: Number(cellInput.value),
    lineHeight: Math.round(Number(cellInput.value) * 0.6),
    entityDensity: Number(densityInput.value),
    glyphPalette: paletteInput.value,
    // Literal spans avoid training an isolated atlas from the quad's black
    // async fallback. Texture sampling and glyph selection remain identical to
    // gameplay; only the final colour encoding is lossless in this lab.
    colorEncoding: "spans",
    charMode: "ascii",
    sceneMode: "solid",
    flat: 0.5,
    brighten: Number(brightnessInput.value),
    gamma: 1,
    blackPoint: 0,
    whitePoint: 1,
    strokePx: 0.4,
    ambientLight: 0.55,
    directionalLight: 0.5,
  });
  world.setFixedView(...CAMERA_VIEW);
  return world;
}

function buildFrameStrip(): void {
  if (!sprite || !spriteImage) return;
  strip.replaceChildren();
  for (const frame of sprite.frames) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "explosion-lab__frame";
    button.dataset.explosionFrame = String(frame.index);
    button.setAttribute("aria-label", `Show explosion frame ${frame.index}`);
    button.setAttribute("aria-pressed", frame.index === currentFrame ? "true" : "false");
    const canvas = document.createElement("canvas");
    canvas.width = frame.width;
    canvas.height = frame.height;
    canvas.getContext("2d")?.drawImage(
      spriteImage,
      frame.x,
      frame.y,
      frame.width,
      frame.height,
      0,
      0,
      frame.width,
      frame.height,
    );
    const label = document.createElement("span");
    label.textContent = `frame ${frame.index}`;
    button.append(canvas, label);
    button.addEventListener("click", () => {
      setPlaying(false);
      applyFrame(frame.index);
    });
    strip.append(button);
  }
}

function bindControls(): void {
  playButton.addEventListener("click", () => setPlaying(!playing));
  frameInput.addEventListener("input", () => {
    setPlaying(false);
    applyFrame(Math.round(Number(frameInput.value)));
  });
  durationInput.addEventListener("input", () => {
    frameDurationMs = Number(durationInput.value);
    playbackStartedAt = performance.now() - currentFrame * frameDurationMs;
    updateReadouts();
    updateUrl();
  });
  brightnessInput.addEventListener("input", () => {
    overlay?.setTuning({ brighten: Number(brightnessInput.value) });
    updateReadouts();
    updateUrl();
  });
  cellInput.addEventListener("input", () => {
    overlay?.setCellPx(Number(cellInput.value));
    updateReadouts();
    updateUrl();
  });
  densityInput.addEventListener("input", () => {
    applyFrame(currentFrame);
    updateReadouts();
    updateUrl();
  });
  scaleInput.addEventListener("input", () => {
    applyFrame(currentFrame);
    updateReadouts();
    updateUrl();
  });
  paletteInput.addEventListener("change", () => {
    overlay?.setGlyphPalette(paletteInput.value);
    updateUrl();
  });
}

function setPlaying(next: boolean): void {
  playing = next;
  playbackStartedAt = performance.now() - currentFrame * frameDurationMs;
  playButton.textContent = playing ? "Pause" : "Play";
  updateUrl();
}

function animate(now: number): void {
  if (playing && sprite) {
    const frame = Math.floor((now - playbackStartedAt) / frameDurationMs) % sprite.frameCount;
    if (frame !== currentFrame) applyFrame(frame);
  }
  animationFrame = requestAnimationFrame(animate);
}

function applyFrame(index: number): void {
  if (!sprite || !spriteImage || !overlay) return;
  const clamped = Math.max(0, Math.min(sprite.frameCount - 1, Math.round(index)));
  const frame = sprite.frames[clamped] ?? sprite.frames[0]!;
  currentFrame = frame.index;
  frameInput.value = String(currentFrame);

  sourceCanvas.width = frame.width;
  sourceCanvas.height = frame.height;
  sourceCanvas.dataset.frame = String(currentFrame);
  sourceContext.clearRect(0, 0, frame.width, frame.height);
  sourceContext.drawImage(
    spriteImage,
    frame.x,
    frame.y,
    frame.width,
    frame.height,
    0,
    0,
    frame.width,
    frame.height,
  );

  overlay.setEntity(
    ENTITY_ID,
    glyphEffectSpriteFrameGeometry(sprite, frame),
    {
      position: [0, 10, 0],
      rotation: [0, 0, 0],
      density: Number(densityInput.value),
      scale: Number(scaleInput.value),
    },
  );
  overlay.setFixedView(...CAMERA_VIEW);

  for (const button of strip.querySelectorAll<HTMLElement>("[data-explosion-frame]")) {
    button.setAttribute("aria-pressed", button.dataset.explosionFrame === String(currentFrame) ? "true" : "false");
  }
  updateReadouts();
  updateUrl();
}

function updateReadouts(): void {
  required<HTMLOutputElement>("explosion-frame-value").value = `${currentFrame} / ${sprite ? sprite.frameCount - 1 : 5}`;
  required<HTMLOutputElement>("explosion-duration-value").value = `${Math.round(frameDurationMs)} ms`;
  required<HTMLOutputElement>("explosion-brightness-value").value = Number(brightnessInput.value).toFixed(1);
  required<HTMLOutputElement>("explosion-cell-value").value = `${Math.round(Number(cellInput.value))} px`;
  required<HTMLOutputElement>("explosion-density-value").value = `${Math.round(Number(densityInput.value))}x`;
  required<HTMLOutputElement>("explosion-scale-value").value = `${Number(scaleInput.value).toFixed(2)}x`;
}

function updateUrl(): void {
  const next = new URL(location.href);
  setParam(next, "frame", currentFrame, 0);
  setParam(next, "duration", frameDurationMs, 80);
  setParam(next, "bright", Number(brightnessInput.value), 3.9);
  setParam(next, "cell", Number(cellInput.value), 12);
  setParam(next, "density", Number(densityInput.value), 1);
  setParam(next, "scale", Number(scaleInput.value), 2);
  if (paletteInput.value === "dense") next.searchParams.delete("palette");
  else next.searchParams.set("palette", paletteInput.value);
  if (playing) next.searchParams.set("play", "1");
  else next.searchParams.delete("play");
  history.replaceState(null, "", next);
}

function setParam(url: URL, name: string, value: number, fallback: number): void {
  if (value === fallback) url.searchParams.delete(name);
  else url.searchParams.set(name, String(value));
}

function paramNumber(name: string, min: number, max: number, fallback: number): number {
  const raw = params.get(name);
  if (raw === null || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", () => reject(new Error(`Could not load explosion texture ${url}.`)), { once: true });
    image.src = url;
  });
}

function nextPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Explosion lab is missing #${id}.`);
  return element as T;
}

window.addEventListener("pagehide", () => {
  if (animationFrame) cancelAnimationFrame(animationFrame);
  overlay?.dispose();
}, { once: true });
