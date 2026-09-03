/**
 * Glyph lab — a standalone page for tuning the image→glyph and bitmap-font→
 * glyph pipelines WITHOUT booting Quake.
 *
 * Open `/lab/` on the dev server. It mounts the game's real
 * `createQuakeGlyphUiOverlay` (the exact pipeline the menus/boot console
 * render through — same gamma/levels/saturation lifts, ink compensation,
 * pinned atlas palette, conchars text-art path) on a bare host element, so
 * what this page shows IS what the game will draw. All knobs come from
 * `glyphTuningSpec.ts`, the same table the in-game `?debug` panel builds
 * from, so lab and game cannot drift.
 *
 * Dev-only by construction: `lab/index.html` is not in the production build's
 * rollup inputs (Vite's default input is `index.html` alone), and nothing in
 * the game imports this module.
 */
import {
  createQuakeGlyphUiOverlay,
  type QuakeGlyphUiOverlay,
} from "../runtime/render/glyphUiOverlay";
import {
  QUAKE_GLYPH_UI_TUNING_KNOBS,
  readQuakeGlyphTuningValues,
  type QuakeGlyphTuningValues,
} from "../runtime/app/glyphTuningSpec";
import { GLYPH_FONT_ATLAS_ASCII, WIREFRAME_PALETTES } from "glyphcss";
import {
  isAsciiOnlyGlyphPalette,
  sanitizeQuakeGlyphPalette,
  sanitizeQuakeGlyphUiSceneMode,
  type QuakeGlyphUiSceneMode,
} from "../runtime/app/asciiGlyphPolicy";
import { buildQuakeUiMeshStyles } from "../runtime/app/quakeUiMeshStyles";
import {
  createQuakeMenuSceneManifest,
  quakeMenuSceneFrame,
  quakeMenuVersionPos,
  QUAKE_CONSOLE_GLYPH,
  QUAKE_CONSOLE_LEFT,
  QUAKE_CONSOLE_PITCH,
  QUAKE_CONSOLE_TOP,
  QUAKE_MENU_SCENE_FRAME_W,
  QUAKE_MENU_SCENE_FRAME_H,
  type QuakeMenuSceneManifest,
  type QuakeMenuSceneSpriteDef,
} from "../runtime/render/menuSceneManifest";
import { QUAKE_HUD_BASE_URL, quakeHudSceneFrame } from "../runtime/render/hudSceneManifest";
import {
  getQuakeMenuSceneState,
  updateQuakeHudSceneState,
  updateQuakeMenuSceneState,
  updateQuakeMenuSceneTexts,
} from "../runtime/menuSceneState";
import {
  quakeLoadingConsoleBootLines,
  QUAKE_LOADING_CONSOLE_PAK_LINE,
  setQuakeLoadingRendererLine,
} from "../runtime/loadingConsole";
import logoUrl from "../assets/cssquake-logo.png";
import plaqueUrl from "../assets/main-menu-plaque-baked.png";
import titleUrl from "../assets/main-menu-title-baked.png";
import labelSheetUrl from "../assets/main-menu-single-player-sprite.png";

const CONCHARS_URL = "/q/conchars.png";
const CONCHARS_GRID = 16;
/** Monospace advance fraction — same constant the overlay uses. */
const CELL_ASPECT = 0.606;

/** Same define the game uses for its version tag (vite.config.ts). */
declare const __ASCIIQUAKE_VERSION__: string;

type SourceKind = "logo" | "text" | "plaque" | "title" | "label" | "screen" | "custom";

interface ImagePreset {
  readonly url: string;
  readonly label: string;
}
const IMAGE_PRESETS: Partial<Record<SourceKind, ImagePreset>> = {
  logo: { url: logoUrl, label: "asciiQuake logo (1343×262)" },
  plaque: { url: plaqueUrl, label: "menu plaque" },
  title: { url: titleUrl, label: "menu title" },
  label: { url: labelSheetUrl, label: "menu label sheet (2 frames)" },
};

// ── State ────────────────────────────────────────────────────────────────────
const startupParams = new URLSearchParams(location.search);
const values: QuakeGlyphTuningValues = readQuakeGlyphTuningValues(
  QUAKE_GLYPH_UI_TUNING_KNOBS,
  startupParams,
);
let source: SourceKind = (startupParams.get("labSource") as SourceKind) || "logo";
let displayW = numParam("labW", 120, 1600, 620);
let labText = startupParams.get("labText") ?? "Loading sound/misc/menu1.wav\nQUAKE v1.09";
let textGlyphPx = numParam("labGlyphPx", 6, 96, 16);
let palette = sanitizeQuakeGlyphPalette(startupParams.get("glyphImagePalette"));
/** The LOGO mesh's own ramp (`?glyphImageLogoPalette=`), default "dense" — the
 *  user-tuned corner-logo look. Every lab IMAGE previews with the logo's
 *  per-mesh style (the lab's images ARE the logo path — see the density note),
 *  so what this page shows for an image IS the game's logo treatment. */
const LOGO_PALETTE_DEFAULT = "dense";
let logoPalette = startupParams.get("glyphImageLogoPalette")
  ? sanitizeQuakeGlyphPalette(startupParams.get("glyphImageLogoPalette"))
  : LOGO_PALETTE_DEFAULT;
let encoding: "atlas" | "spans" =
  startupParams.get("glyphImageEncoding") === "spans" ? "spans" : "atlas";
let segment = startupParams.get("labSegment") !== "0";
let customUrl: string | null = null;
/** Scene render mode (`?labSceneMode=`): solid (shipped), ink, wireframe —
 *  the ASCII-legal subset, gated by the UI scene-mode sanitizer. */
let sceneMode: QuakeGlyphUiSceneMode =
  sanitizeQuakeGlyphUiSceneMode(startupParams.get("labSceneMode")) ?? "solid";
/** Render the in-game HUD bar into the "complete first screen" preview. */
let hudPreview = startupParams.get("labHud") === "1";
/** The non-logo per-element ramps, as shipped (App.ts's
 *  QUAKE_ELEMENT_PALETTE_DEFAULT). */
const ELEMENT_PALETTE_DEFAULT = "dense";
/** The manifest built for the current "screen" preview (ground-truth pane). */
let screenManifest: QuakeMenuSceneManifest | null = null;

function numParam(name: string, min: number, max: number, def: number): number {
  const raw = startupParams.get(name);
  const v = raw === null ? Number.NaN : Number.parseFloat(raw);
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
}

// ── DOM handles ──────────────────────────────────────────────────────────────
const controlsEl = document.getElementById("controls")!;
const glyphHost = document.getElementById("glyph-host")!;
const srcContent = document.getElementById("src-content")!;
const readoutMain = document.getElementById("readout-main")!;
const loupe = document.getElementById("loupe")!;
const loupeInner = document.getElementById("loupe-inner")!;
const glyphPaneBody = glyphHost.parentElement!;

let overlay: QuakeGlyphUiOverlay | null = null;

// Natural sizes per image URL, resolved lazily for layout.
const naturalSizes = new Map<string, { w: number; h: number }>();
function naturalSize(url: string, onReady: () => void): { w: number; h: number } | null {
  const cached = naturalSizes.get(url);
  if (cached) return cached;
  const img = new Image();
  img.onload = () => {
    naturalSizes.set(url, { w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
    onReady();
  };
  img.src = url;
  return null;
}

// Conchars sheet for the SOURCE pane's honest text rendering.
let concharsImg: HTMLImageElement | null = null;
{
  const img = new Image();
  img.onload = () => {
    concharsImg = img;
    renderSourcePane();
  };
  img.src = CONCHARS_URL;
}

// ── Mount / remount the game overlay ─────────────────────────────────────────
let remountTimer = 0;
function scheduleRemount(): void {
  if (remountTimer) return;
  remountTimer = window.setTimeout(() => {
    remountTimer = 0;
    remount();
  }, 80);
}

/** Element box (CSS px) the current source occupies, centred in the pane. */
function elementBox(): { w: number; h: number } {
  if (source === "screen") {
    // The complete first screen fills the whole pane — the pane IS the
    // viewport the manifest's host-anchored sizing rules resolve against.
    return { w: glyphHost.clientWidth || 1, h: glyphHost.clientHeight || 1 };
  }
  if (source === "text") {
    const lines = labText.split("\n");
    const cols = Math.max(1, ...lines.map((l) => l.length));
    return { w: cols * textGlyphPx, h: lines.length * textGlyphPx };
  }
  const url = source === "custom" ? customUrl : IMAGE_PRESETS[source]?.url;
  if (!url) return { w: displayW, h: displayW / 4 };
  const nat = naturalSize(url, scheduleRemount) ?? { w: 4, h: 1 };
  return { w: displayW, h: displayW * (nat.h / nat.w) };
}

/** Options shared by every overlay mount — the scene-wide tone/encoding
 *  knobs, exactly as the single-element mounts always passed them. */
function sharedOverlayOptions() {
  return {
    maxCells: values.maxCells,
    minCellPx: values.minCellPx,
    ambient: values.ambient,
    gamma: values.gamma,
    saturation: values.saturation,
    blackPoint: values.black,
    whitePoint: values.white,
    backdropGamma: values.backdropGamma,
    backdropBlackPoint: values.backdropBlack,
    backdropWhitePoint: values.backdropWhite,
    inkCompensation: values.inkComp,
    strokePx: values.stroke,
    textGamma: values.textGamma,
    textSaturation: values.textSaturation,
    glyphPalette: palette,
    colorEncoding: encoding,
    fontAtlas: GLYPH_FONT_ATLAS_ASCII,
    // Render mode (solid / ink / wireframe) — sanitized ASCII-legal subset.
    sceneMode,
  } as const;
}

/**
 * The COMPLETE first screen, composed exactly as the game ships it: the
 * overlay renders the same menu manifest (backdrop, corner logo, plaque,
 * MAIN title, the five landing labels, cursor) from the same shared scene
 * state (boot console transcript, version tag), styled by the SAME
 * `buildQuakeUiMeshStyles` table App.ts passes — not a lab copy. No Quake
 * boot: the state is seeded synchronously to the post-boot landing values.
 */
function remountScreen(): void {
  // The landing as the player sees it after boot (menuSceneState's live
  // values once main.ts/menu.ts clear `pending`/`deferred`).
  setQuakeLoadingRendererLine("glyphcss");
  updateQuakeMenuSceneState({
    screen: "landing",
    activeItem: "single-player",
    disabledItems: ["quit"],
    pending: false,
    deferred: false,
    chrome: true,
    consoleLines: [
      ...quakeLoadingConsoleBootLines(),
      QUAKE_LOADING_CONSOLE_PAK_LINE,
      `=== asciiQuake v${__ASCIIQUAKE_VERSION__} initialized ===`,
    ],
    consoleAction: null,
    consoleProgress: null,
  });
  updateQuakeMenuSceneTexts({ version: `v${__ASCIIQUAKE_VERSION__}` });
  if (hudPreview) {
    // A fresh-spawn loadout: face + shells icon, 100 health, 0 armor,
    // 25 shells, the default "plus" crosshair (hud.ts's initial inventory).
    updateQuakeHudSceneState({
      slots: ["face-normal", "ammo-shells"],
      armor: "  0",
      health: "100",
      ammo: " 25",
      damage: false,
      crosshair: "plus",
    });
  }

  screenManifest = createQuakeMenuSceneManifest({
    density: values.density,
    backdropBrightness: values.backdrop,
    logoDensity: values.logoDensity,
    plaqueDensity: values.plaqueDensity,
    titleDensity: values.titleDensity,
    labelDensity: values.labelDensity,
  });

  overlay = createQuakeGlyphUiOverlay({
    host: glyphHost as HTMLElement,
    sprites: [],
    menu: screenManifest,
    // The SHIPPED per-element style table — the same builder App.ts calls,
    // with the shipped palette defaults (logo select still applies).
    meshStyles: buildQuakeUiMeshStyles(values, {
      logo: logoPalette,
      text: ELEMENT_PALETTE_DEFAULT,
      plaque: ELEMENT_PALETTE_DEFAULT,
      title: ELEMENT_PALETTE_DEFAULT,
      labels: ELEMENT_PALETTE_DEFAULT,
      // The bar draws on the scene ramp and the readouts on "dense" — the
      // same split App.ts ships (see its palette resolution).
      hudBar: palette,
      hudArt: ELEMENT_PALETTE_DEFAULT,
    }),
    manifestTextDensity: values.textDensity,
    consoleTextDensity: values.consoleDensity,
    hudBarDensity: values.hudBarDensity,
    hudArtDensity: values.hudArtDensity,
    hudReadoutGroundTexels: values.hudArtGroundTexels,
    // The HUD toggle: the overlay's chrome gate is bypassed so the status
    // bar composites into the landing preview.
    forceHud: hudPreview,
    ...sharedOverlayOptions(),
  });
}

function remount(): void {
  overlay?.dispose();
  overlay = null;
  glyphHost.textContent = "";

  if (source === "screen") {
    remountScreen();
    renderSourcePane();
    syncUrl();
    return;
  }
  screenManifest = null;

  const box = elementBox();
  const holder = document.createElement("div");
  holder.style.cssText =
    "position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);" +
    `width:${box.w}px;height:${box.h}px;`;

  if (source === "text") {
    // One run div per line — the overlay's textArt path reads each run's
    // textContent and box, exactly like the game's bitmap runs. Hidden via
    // `visibility` so the browser never paints the raw text (the boxes still
    // measure), matching how the game authors its runs.
    for (const [i, line] of labText.split("\n").entries()) {
      if (!line.length) continue;
      const run = document.createElement("div");
      run.className = "lab-text-run";
      run.textContent = line;
      run.style.cssText =
        `position:absolute;left:0;top:${i * textGlyphPx}px;` +
        `width:${line.length * textGlyphPx}px;height:${textGlyphPx}px;` +
        "visibility:hidden;white-space:pre;";
      holder.appendChild(run);
    }
  } else {
    const url = source === "custom" ? customUrl : IMAGE_PRESETS[source]?.url;
    if (!url) {
      glyphHost.appendChild(holder);
      renderSourcePane();
      return;
    }
    const img = document.createElement("img");
    img.id = "lab-sprite";
    img.src = url;
    img.style.cssText = "position:absolute;inset:0;width:100%;height:100%;";
    holder.appendChild(img);
  }
  glyphHost.appendChild(holder);

  overlay = createQuakeGlyphUiOverlay({
    host: glyphHost as HTMLElement,
    sprites:
      source === "text"
        ? []
        : [{
            selector: "#lab-sprite",
            layer: 1,
            fit: "contain",
            density: values.logoDensity,
            segment,
            styleTag: "logo",
          }],
    // The previewed element's per-mesh style — identical wiring to App.ts's
    // style table, so the lab previews exactly what a styled game element
    // will render. `ambient` now reaches glyphcss as the mesh's own ambient
    // light (chars follow it), and `colorBoost` mirrors the game's
    // lab-session residual. NOTE the semantics shift (2026-08): the "logo
    // ambient" slider genuinely drives glyph choice now — before the
    // per-mesh ambient landed in glyphcss, chars followed the SCENE ambient
    // slider instead; to reproduce a pre-change lab session, set this
    // slider to that session's scene ambient value.
    meshStyles: {
      logo: {
        palette: logoPalette,
        ambient: values.logoAmbient,
        gamma: values.logoGamma,
        saturation: values.logoSaturation,
        colorBoost: Math.max(1, 1.65 / values.logoAmbient),
        occlusionMarginPx: 0, // contour claims, the game styles' shipped default
      },
    },
    textArt:
      source === "text"
        ? [{ selector: ".lab-text-run", layer: 1, density: values.consoleDensity }]
        : undefined,
    ...sharedOverlayOptions(),
  });

  renderSourcePane();
  syncUrl();
}

// ── Source pane ──────────────────────────────────────────────────────────────
/** One boot-console/version line composed from the conchars sheet — the same
 *  source pixels the glyph pipeline samples, scaled with pixelated sampling. */
function concharsLineCanvas(line: string, glyphPx: number): HTMLCanvasElement | null {
  if (!concharsImg || !line.length) return null;
  const canvas = document.createElement("canvas");
  canvas.width = line.length * 8;
  canvas.height = 8;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  const cell = concharsImg.naturalWidth / CONCHARS_GRID;
  for (let i = 0; i < line.length; i++) {
    const code = line.charCodeAt(i) & 127;
    if (code === 32) continue;
    const gu = code & (CONCHARS_GRID - 1);
    const gv = code >> 4;
    ctx.drawImage(concharsImg, gu * cell, gv * cell, cell, cell, i * 8, 0, 8, 8);
  }
  canvas.style.cssText =
    "position:absolute;image-rendering:pixelated;" +
    `width:${line.length * glyphPx}px;height:${glyphPx}px;`;
  return canvas;
}

/**
 * Ground truth for the "complete first screen" source: the manifest's OWN
 * sprite defs placed as plain `<img>`s (chrome via `place`, landing sprites
 * via the 320x200 frame transform), the boot console and version tag from
 * the conchars sheet — the same inputs the glyph pane rasterizes.
 */
function renderScreenSourcePane(): void {
  srcContent.style.left = "0";
  srcContent.style.top = "0";
  srcContent.style.transform = "none";
  srcContent.style.width = "100%";
  srcContent.style.height = "100%";
  srcContent.style.background = "#000";
  srcContent.style.overflow = "hidden";
  srcContent.textContent = "";
  const manifest = screenManifest;
  if (!manifest) return;
  const st = getQuakeMenuSceneState();
  const w = srcContent.clientWidth || 1;
  const h = srcContent.clientHeight || 1;
  const frame = quakeMenuSceneFrame(w, h);
  const sx = frame.w / QUAKE_MENU_SCENE_FRAME_W;
  const sy = frame.h / QUAKE_MENU_SCENE_FRAME_H;

  const addSprite = (
    def: QuakeMenuSceneSpriteDef,
    r: { x: number; y: number; w: number; h: number },
  ): void => {
    const wrap = document.createElement("div");
    wrap.style.cssText =
      `position:absolute;left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;overflow:hidden;`;
    const img = document.createElement("img");
    img.src = def.texture;
    const frames = def.sheet?.frames ?? 1;
    let frameIndex = def.frame ?? 0;
    if (def.role === "label" && def.item === st.activeItem) frameIndex = 1;
    if (def.sheet?.axis === "y") {
      img.style.cssText =
        `position:absolute;left:0;top:${-frameIndex * 100}%;width:100%;height:${frames * 100}%;`;
    } else if (def.sheet?.axis === "x") {
      img.style.cssText =
        `position:absolute;left:${-frameIndex * 100}%;top:0;width:${frames * 100}%;height:100%;`;
    } else {
      img.style.cssText =
        "position:absolute;inset:0;width:100%;height:100%;" +
        `object-fit:${def.fit === "cover" ? "cover" : "fill"};`;
    }
    const disabled = def.item !== undefined && st.disabledItems.includes(def.item);
    const dim = (def.brightness ?? 1) * (disabled ? manifest.dimmedBrightness : 1);
    if (dim < 1) img.style.filter = `brightness(${dim})`;
    wrap.appendChild(img);
    srcContent.appendChild(wrap);
  };

  for (const def of manifest.chrome) {
    const r = def.place?.(w, h);
    if (r) addSprite(def, r);
  }
  const landing = manifest.screens.landing;
  if (landing) {
    for (const def of landing.sprites) {
      if (def.role === "cursor" && def.item !== st.activeItem) continue;
      const r = def.rect;
      if (!r) continue;
      addSprite(def, {
        x: frame.x + r.x * sx,
        y: frame.y + r.y * sy,
        w: r.w * sx,
        h: r.h * sy,
      });
    }
  }

  // Boot console + version tag, per the overlay's viewport-anchored layout.
  let top = QUAKE_CONSOLE_TOP;
  for (const line of st.consoleLines) {
    const canvas = concharsLineCanvas(line, QUAKE_CONSOLE_GLYPH);
    if (canvas) {
      canvas.style.left = `${QUAKE_CONSOLE_LEFT}px`;
      canvas.style.top = `${top}px`;
      srcContent.appendChild(canvas);
    }
    top += QUAKE_CONSOLE_PITCH;
  }
  const version = st.texts["version"];
  if (version) {
    const pos = quakeMenuVersionPos(w);
    const canvas = concharsLineCanvas(version, pos.h);
    if (canvas) {
      canvas.style.left = `${pos.x}px`;
      canvas.style.top = `${pos.y}px`;
      canvas.style.opacity = "0.45";
      srcContent.appendChild(canvas);
    }
  }

  // HUD ground truth (bar art only — icons/digits are the glyph pane's job).
  if (hudPreview) {
    const hf = quakeHudSceneFrame(w, h);
    const bar = document.createElement("img");
    bar.src = QUAKE_HUD_BASE_URL;
    bar.style.cssText =
      `position:absolute;left:${hf.x}px;top:${hf.y}px;width:${hf.w}px;height:${hf.h}px;` +
      "image-rendering:pixelated;filter:brightness(0.55);";
    srcContent.appendChild(bar);
  }
}

function renderSourcePane(): void {
  if (source === "screen") {
    renderScreenSourcePane();
    return;
  }
  srcContent.style.background = "";
  srcContent.style.overflow = "";
  const box = elementBox();
  srcContent.style.left = "50%";
  srcContent.style.top = "50%";
  srcContent.style.transform = "translate(-50%,-50%)";
  srcContent.style.width = `${box.w}px`;
  srcContent.style.height = `${box.h}px`;
  srcContent.textContent = "";

  if (source === "text") {
    // Compose the text from the conchars sheet at 8px cells, then let CSS
    // scale it to the display size with pixelated sampling — the same source
    // pixels the glyph pipeline samples.
    const lines = labText.split("\n");
    const cols = Math.max(1, ...lines.map((l) => l.length));
    const canvas = document.createElement("canvas");
    canvas.width = cols * 8;
    canvas.height = lines.length * 8;
    const ctx = canvas.getContext("2d");
    if (ctx && concharsImg) {
      ctx.imageSmoothingEnabled = false;
      const cell = concharsImg.naturalWidth / CONCHARS_GRID;
      for (const [row, line] of lines.entries()) {
        for (let i = 0; i < line.length; i++) {
          const code = line.charCodeAt(i) & 127;
          if (code === 32) continue;
          const gu = code & (CONCHARS_GRID - 1);
          const gv = code >> 4;
          ctx.drawImage(
            concharsImg,
            gu * cell, gv * cell, cell, cell,
            i * 8, row * 8, 8, 8,
          );
        }
      }
    }
    srcContent.appendChild(canvas);
    return;
  }

  const url = source === "custom" ? customUrl : IMAGE_PRESETS[source]?.url;
  if (!url) {
    srcContent.textContent = "drop an image anywhere, or use the file picker";
    return;
  }
  const img = document.createElement("img");
  img.src = url;
  srcContent.appendChild(img);
}

// ── Controls ─────────────────────────────────────────────────────────────────
function buildControls(): void {
  controlsEl.textContent = "";
  const h1 = document.createElement("h1");
  h1.textContent = "glyph lab";
  controlsEl.appendChild(h1);

  // Source picker
  addHeader("Source");
  const srcSel = document.createElement("select");
  const opts: [SourceKind, string][] = [
    ["logo", IMAGE_PRESETS.logo!.label],
    ["text", "bitmap-font text (conchars)"],
    ["plaque", IMAGE_PRESETS.plaque!.label],
    ["title", IMAGE_PRESETS.title!.label],
    ["label", IMAGE_PRESETS.label!.label],
    ["screen", "complete first screen (landing)"],
    ["custom", "custom image (drop / pick)"],
  ];
  for (const [value, label] of opts) {
    const o = document.createElement("option");
    o.value = value;
    o.textContent = label;
    if (value === source) o.selected = true;
    srcSel.appendChild(o);
  }
  srcSel.onchange = () => {
    source = srcSel.value as SourceKind;
    buildControls();
    scheduleRemount();
  };
  controlsEl.appendChild(srcSel);

  if (source === "custom") {
    const file = document.createElement("input");
    file.type = "file";
    file.accept = "image/*";
    file.style.marginTop = "6px";
    file.onchange = () => {
      const f = file.files?.[0];
      if (f) setCustomImage(f);
    };
    controlsEl.appendChild(file);
  }

  if (source === "text") {
    const ta = document.createElement("textarea");
    ta.value = labText;
    ta.spellcheck = false;
    ta.style.marginTop = "6px";
    ta.oninput = () => {
      labText = ta.value;
      scheduleRemount();
    };
    controlsEl.appendChild(ta);
    addSlider("source glyph size on screen (px)", 6, 96, 1, textGlyphPx, (v) => {
      textGlyphPx = v;
      scheduleRemount();
    });
  } else if (source === "screen") {
    addCheckbox("render HUD bar (in-game status bar, off as shipped)", hudPreview, (v) => {
      hudPreview = v;
      scheduleRemount();
    });
  } else {
    addSlider("element display width (px)", 120, 1600, 10, displayW, (v) => {
      displayW = v;
      scheduleRemount();
    });
    addCheckbox("segment opaque regions (game default)", segment, (v) => {
      segment = v;
      scheduleRemount();
    });
  }

  // Render mode — the ASCII-legal glyphcss scene modes (asciiGlyphPolicy):
  // solid ships; ink remaps its five non-ASCII oriented glyphs to ASCII;
  // wireframe draws palette tiers only (junction pass never enabled).
  addHeader("Render mode");
  const modeSel = document.createElement("select");
  for (const [value, label] of [
    ["solid", "solid (game default)"],
    ["ink", "ink — outline/edge render (ASCII-remapped)"],
    ["wireframe", "wireframe — palette-tier strokes"],
  ] as const) {
    const o = document.createElement("option");
    o.value = value;
    o.textContent = label;
    if (value === sceneMode) o.selected = true;
    modeSel.appendChild(o);
  }
  modeSel.onchange = () => {
    sceneMode = sanitizeQuakeGlyphUiSceneMode(modeSel.value) ?? "solid";
    scheduleRemount();
  };
  controlsEl.appendChild(modeSel);

  // Palette / encoding
  addHeader("Glyph palette / encoding");
  const palSel = document.createElement("select");
  // ASCII ONLY. Non-ASCII palettes are not offered here at all — not even as a
  // comparison baseline. asciiQuake renders printable ASCII and nothing else, so
  // the lab must not be able to show something the game can never ship.
  for (const name of Object.keys(WIREFRAME_PALETTES).filter(isAsciiOnlyGlyphPalette)) {
    const o = document.createElement("option");
    o.value = name;
    o.textContent = name === "detail" ? "detail (game default)" : name;
    if (name === palette) o.selected = true;
    palSel.appendChild(o);
  }
  palSel.onchange = () => {
    palette = palSel.value;
    scheduleRemount();
  };
  controlsEl.appendChild(palSel);
  // The LOGO mesh's own ramp (per-mesh override; images preview with it).
  const logoPalSel = document.createElement("select");
  logoPalSel.style.marginTop = "6px";
  for (const name of Object.keys(WIREFRAME_PALETTES).filter(isAsciiOnlyGlyphPalette)) {
    const o = document.createElement("option");
    o.value = name;
    o.textContent = `logo: ${name}${name === LOGO_PALETTE_DEFAULT ? " (game default)" : ""}`;
    if (name === logoPalette) o.selected = true;
    logoPalSel.appendChild(o);
  }
  logoPalSel.onchange = () => {
    logoPalette = logoPalSel.value;
    scheduleRemount();
  };
  controlsEl.appendChild(logoPalSel);
  const encSel = document.createElement("select");
  encSel.style.marginTop = "6px";
  for (const name of ["atlas", "spans"] as const) {
    const o = document.createElement("option");
    o.value = name;
    o.textContent = `colorEncoding: ${name}${name === "atlas" ? " (game default)" : ""}`;
    if (name === encoding) o.selected = true;
    encSel.appendChild(o);
  }
  encSel.onchange = () => {
    encoding = encSel.value as "atlas" | "spans";
    scheduleRemount();
  };
  controlsEl.appendChild(encSel);

  // Spec-driven knobs, grouped exactly like the in-game panel.
  let currentGroup = "";
  for (const knob of QUAKE_GLYPH_UI_TUNING_KNOBS) {
    if (knob.group !== currentGroup) {
      currentGroup = knob.group;
      addHeader(knob.group);
      if (knob.group === "Menu density") {
        const note = document.createElement("div");
        note.style.cssText = "color:#6f6f7c;font-size:10px;margin-bottom:2px;";
        note.textContent =
          "images use “corner logo density”; text uses “boot console density”";
        controlsEl.appendChild(note);
      }
    }
    addSlider(`${knob.label} (${knob.param})`, knob.min, knob.max, knob.step,
      values[knob.key]!, (v) => {
        values[knob.key] = v;
        scheduleRemount();
      });
  }

  // Copy-out
  addHeader("Transfer to game");
  const btn = document.createElement("button");
  btn.textContent = "copy game URL query";
  const out = document.createElement("div");
  out.id = "copy-out";
  btn.onclick = () => {
    const qs = gameQueryString();
    out.textContent = qs;
    void navigator.clipboard?.writeText(qs).catch(() => {});
  };
  controlsEl.appendChild(btn);
  controlsEl.appendChild(out);

  const reset = document.createElement("button");
  reset.textContent = "reset all to shipped defaults";
  reset.onclick = () => {
    for (const knob of QUAKE_GLYPH_UI_TUNING_KNOBS) values[knob.key] = knob.def;
    palette = "detail";
    logoPalette = LOGO_PALETTE_DEFAULT;
    encoding = "atlas";
    sceneMode = "solid";
    hudPreview = false;
    buildControls();
    scheduleRemount();
  };
  controlsEl.appendChild(reset);
}

function addHeader(text: string): void {
  const h = document.createElement("h2");
  h.textContent = text;
  controlsEl.appendChild(h);
}

function addSlider(
  label: string, min: number, max: number, step: number, value: number,
  onInput: (v: number) => void,
): void {
  const wrap = document.createElement("div");
  wrap.className = "knob";
  const lab = document.createElement("label");
  lab.textContent = label;
  const input = document.createElement("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  const output = document.createElement("output");
  output.textContent = String(value);
  input.oninput = () => {
    const v = Number(input.value);
    output.textContent = String(v);
    onInput(v);
  };
  wrap.append(lab, input, output);
  controlsEl.appendChild(wrap);
}

function addCheckbox(label: string, value: boolean, onInput: (v: boolean) => void): void {
  const wrap = document.createElement("div");
  wrap.style.margin = "4px 0";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = value;
  input.style.width = "auto";
  input.onchange = () => onInput(input.checked);
  const lab = document.createElement("label");
  lab.style.color = "#a8a8b4";
  lab.append(input, ` ${label}`);
  wrap.appendChild(lab);
  controlsEl.appendChild(wrap);
}

function setCustomImage(file: File): void {
  if (customUrl?.startsWith("blob:")) URL.revokeObjectURL(customUrl);
  customUrl = URL.createObjectURL(file);
  naturalSizes.delete(customUrl);
  source = "custom";
  buildControls();
  scheduleRemount();
}

// ── URL round-trips ──────────────────────────────────────────────────────────
/** Query string for the GAME, containing only params that differ from the
 *  shipped defaults — paste onto the game URL (or use `?debug=true&…`). */
function gameQueryString(): string {
  const qs = new URLSearchParams();
  qs.set("debug", "true");
  for (const knob of QUAKE_GLYPH_UI_TUNING_KNOBS) {
    if (values[knob.key] !== knob.def) qs.set(knob.param, String(values[knob.key]));
  }
  if (palette !== "detail") qs.set("glyphImagePalette", palette);
  if (logoPalette !== LOGO_PALETTE_DEFAULT) qs.set("glyphImageLogoPalette", logoPalette);
  if (encoding !== "atlas") qs.set("glyphImageEncoding", encoding);
  return `?${qs.toString()}`;
}

/** Keep the LAB's own URL shareable/reload-safe. */
function syncUrl(): void {
  const qs = new URLSearchParams();
  for (const knob of QUAKE_GLYPH_UI_TUNING_KNOBS) {
    if (values[knob.key] !== knob.def) qs.set(knob.param, String(values[knob.key]));
  }
  if (palette !== "detail") qs.set("glyphImagePalette", palette);
  if (logoPalette !== LOGO_PALETTE_DEFAULT) qs.set("glyphImageLogoPalette", logoPalette);
  if (encoding !== "atlas") qs.set("glyphImageEncoding", encoding);
  if (source !== "logo") qs.set("labSource", source);
  if (displayW !== 620) qs.set("labW", String(displayW));
  if (source === "text") {
    qs.set("labText", labText);
    qs.set("labGlyphPx", String(textGlyphPx));
  }
  if (!segment) qs.set("labSegment", "0");
  if (sceneMode !== "solid") qs.set("labSceneMode", sceneMode);
  if (hudPreview) qs.set("labHud", "1");
  const str = qs.toString();
  history.replaceState(null, "", str ? `?${str}` : location.pathname);
}

// ── Readouts ─────────────────────────────────────────────────────────────────
interface LayerStat {
  fontPx: number;
  cellW: number;
  cellH: number;
  cols: number;
  rows: number;
  inkPct: number;
  isBase: boolean;
}

function measureLayers(): LayerStat[] {
  const surface = glyphHost.querySelector(".quake-glyph-ui");
  if (!surface) return [];
  const hostRect = glyphHost.getBoundingClientRect();
  const stats: LayerStat[] = [];
  for (const pre of surface.querySelectorAll("pre")) {
    const text = pre.textContent ?? "";
    if (!text) continue;
    const lines = text.split("\n");
    const rows = lines.length;
    let cols = 0;
    let ink = 0;
    for (const line of lines) {
      if (line.length > cols) cols = line.length;
      for (let i = 0; i < line.length; i++) if (line[i] !== " ") ink++;
    }
    if (!cols) continue;
    const fontPx = parseFloat(getComputedStyle(pre).fontSize);
    const rect = pre.getBoundingClientRect();
    stats.push({
      fontPx,
      cellW: cols ? rect.width / cols : 0,
      cellH: rows ? rect.height / rows : 0,
      cols,
      rows,
      inkPct: (100 * ink) / (cols * rows),
      // The base layer's pre spans (approximately) the whole host — its last
      // row/col can undershoot by up to a cell, so classify by coverage
      // ratio, not a pixel tolerance. Detail layers are bbox-fitted to their
      // sprites, far smaller than the host here.
      isBase:
        rect.width >= hostRect.width * 0.9 && rect.height >= hostRect.height * 0.9,
    });
  }
  return stats.sort((a, b) => b.fontPx - a.fontPx);
}

function fmt(n: number, digits = 2): string {
  return Number.isFinite(n) ? n.toFixed(digits) : "–";
}

function renderReadouts(): void {
  const stats = measureLayers();
  const dpr = window.devicePixelRatio || 1;
  const box = elementBox();
  const detail = stats.find((s) => !s.isBase) ?? stats[0];

  let html = `<div id="keyfacts">devicePixelRatio <b>${dpr}</b>`;
  if (detail) {
    const devW = detail.cellW * dpr;
    const devH = detail.cellH * dpr;
    const across = box.w / detail.cellW;
    html += ` · detail cell <b>${fmt(detail.cellW)}×${fmt(detail.cellH)}</b> css px`
      + ` = <b class="${devW < 2 || devH < 2 ? "warn" : "ok"}">${fmt(devW)}×${fmt(devH)}</b> device px`
      + ` · <b>${fmt(across, 0)}</b> cells across the element`;
    if (source === "text") {
      html += ` · <b>${fmt(textGlyphPx / detail.cellW, 1)}</b> cells per source glyph`;
    }
    if (devW < 2 || devH < 2) {
      html += `<div class="warn">⚠ detail cells are below 2 device px — glyph SHAPES cannot`
        + ` resolve; only cell colour survives. More density buys nothing here.</div>`;
    }
    if (detail.cols >= 1024 || detail.rows >= 1024) {
      html += `<div class="warn">⚠ at glyphcss's 1024-cells-per-dimension cap — extra density is`
        + ` silently discarded.</div>`;
    }
  }
  html += `</div><table><tr><th>layer</th><th>font px</th><th>cell css</th>`
    + `<th>cell device</th><th>grid</th><th>ink %</th></tr>`;
  for (const s of stats) {
    html += `<tr><td>${s.isBase ? "base (backdrop)" : "detail"}</td>`
      + `<td>${fmt(s.fontPx)}</td>`
      + `<td>${fmt(s.cellW)}×${fmt(s.cellH)}</td>`
      + `<td class="${s.cellW * dpr < 2 && !s.isBase ? "warn" : ""}">${fmt(s.cellW * dpr)}×${fmt(s.cellH * dpr)}</td>`
      + `<td>${s.cols}×${s.rows}</td><td>${fmt(s.inkPct, 1)}</td></tr>`;
  }
  html += "</table>";
  readoutMain.innerHTML = html;
}

setInterval(renderReadouts, 400);

// ── Loupe ────────────────────────────────────────────────────────────────────
const LOUPE_ZOOM = 6;
let loupeStale = true;
setInterval(() => { loupeStale = true; }, 500);
glyphPaneBody.addEventListener("mousemove", (ev) => {
  const surface = glyphHost.querySelector(".quake-glyph-ui");
  if (!surface) return;
  const hostRect = glyphHost.getBoundingClientRect();
  if (loupeStale) {
    loupeStale = false;
    loupeInner.style.width = `${hostRect.width}px`;
    loupeInner.style.height = `${hostRect.height}px`;
    loupeInner.innerHTML = surface.outerHTML;
  }
  const x = ev.clientX - hostRect.left;
  const y = ev.clientY - hostRect.top;
  const lw = loupe.clientWidth;
  const lh = loupe.clientHeight;
  loupeInner.style.transform =
    `translate(${lw / 2 - x * LOUPE_ZOOM}px, ${lh / 2 - y * LOUPE_ZOOM}px) scale(${LOUPE_ZOOM})`;
});

// ── Drag & drop ──────────────────────────────────────────────────────────────
window.addEventListener("dragover", (ev) => {
  ev.preventDefault();
  document.body.classList.add("dragging");
});
window.addEventListener("dragleave", (ev) => {
  if (ev.relatedTarget === null) document.body.classList.remove("dragging");
});
window.addEventListener("drop", (ev) => {
  ev.preventDefault();
  document.body.classList.remove("dragging");
  const file = ev.dataTransfer?.files?.[0];
  if (file && file.type.startsWith("image/")) setCustomImage(file);
});

// ── Boot ─────────────────────────────────────────────────────────────────────
buildControls();
remount();
// Re-place the element when the pane resizes (the overlay itself re-syncs its
// grid via its own ResizeObserver; this keeps OUR centring + readouts honest).
new ResizeObserver(() => scheduleRemount()).observe(glyphPaneBody);

export {}; // module scope
