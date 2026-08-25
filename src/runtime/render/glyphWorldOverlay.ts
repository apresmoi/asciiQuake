import { createGlyphPerspectiveCamera, createGlyphScene } from "glyphcss";
import type { GlyphMeshHandle, GlyphMeshTransform } from "glyphcss";
import { BASE_TILE, type Vec3 } from "@layoutit/polycss";

/**
 * Glyph world overlay — renders the prepared world geometry as ASCII art into a
 * `<pre>` that sits over the polycss viewport.
 *
 * For the first glyphcss milestone the polycss engine still owns all game logic
 * (movement, controls, collision, camera math, entities). This overlay mirrors
 * the world surfaces as ASCII driven by the live camera eye + orientation.
 *
 * Camera model: glyph's perspective camera uses polycss-native units (`zoom` =
 * CSS px per world unit, `perspective` = CSS px) and projects with MEASURED cell
 * metrics, so feeding it polycss's OWN `zoom`/`perspective` makes the glyph
 * projection pixel-identical to polycss (glyphcss projection-conformance test) —
 * no FOV magic. cssQuake mirrors polycss's own first-person target, because the
 * controls place it at `perspective / BASE_TILE` in front of the eye.
 */

const DEG = Math.PI / 180;

export interface QuakeGlyphWorldOverlayOptions {
  /** Element the overlay is inserted into (the #quake-app container). */
  readonly host: HTMLElement;
  /** Insert the overlay before this child of `host` (e.g. the viewmodel layer). */
  readonly insertBefore?: HTMLElement | null;
  /** CSS-perspective distance in virtual px (FOV). */
  readonly perspective?: number;
  /** Camera zoom (scale). */
  readonly zoom?: number;
  /** Supersample AA factor (1 = off). Tunable via `?ssaa=` for comparison.
   *  When unset it auto-scales with detail: coarse grids supersample (cheap, good
   *  coverage AA), fine grids drop to 1 (already high-res; SS there just costs fps). */
  readonly supersample?: number;
  /** Named glyph ramp palette (intensity → char). Defaults to the dense "detail"
   *  ramp for maximum tonal gradation. Tunable via `?glyphPalette=`. */
  readonly glyphPalette?: string;
  /** glyphcss scene render mode. "solid" (default) shades every covered cell from
   *  the ramp; "wireframe" rasterizes polygon edges only; "voxel"/"ink" are the
   *  other glyphcss modes. `?glyphSceneMode=`. NOTE: braille needs "wireframe". */
  readonly sceneMode?: QuakeGlyphSceneMode;
  /** Character encoding for rasterized output. "ascii" (default) is the ramp/rule
   *  encoding; "braille" packs a 2x4 subcell dot grid into U+2800..U+28FF and is a
   *  documented NO-OP outside wireframe mode; "halfblock"/"quadrant" pack 2 or 4
   *  independently coloured subcells per cell and are solid-mode-only.
   *  `?glyphCharMode=`. */
  readonly charMode?: QuakeGlyphCharMode;
  /** Row-wise colour-run merge tolerance (redmean distance, range 0..765 — NOT
   *  0..255). A run keeps extending while the next cell's colour stays within this
   *  distance of the run's anchor, emitting one `<span>` for the whole run. 0 =
   *  off (byte-identical). Spans are what actually gate framerate for coloured
   *  output, and Quake's per-face flat colour is the case glyphcss measures the
   *  biggest win on. `?glyphColorTolerance=`. */
  readonly colorTolerance?: number;
  /** Hidden-line removal for the wireframe/braille path — "hide" depth-tests each
   *  stroke against a solid prepass so far edges stop painting over near ones.
   *  No-op in solid mode. `?glyphHiddenLines=hide`. */
  readonly hiddenLines?: "show" | "hide";
  /** Default detail multiplier for entity meshes (monsters/pickups/weapon) — they
   *  render at this × the world's glyph density in their own depth-occluded layer,
   *  so the cheap low-res world stays fast while entities read crisply. 1 = off.
   *  Movers stay at base density. `?glyphEntityDensity=`. */
  readonly entityDensity?: number;
  /** DEBUG: render density entities transparent (no occlusion mask) to isolate a
   *  placement bug from an occlusion bug. `?glyphEntityTransparent=1`. */
  readonly entityTransparent?: boolean;
  /** DEBUG: outline each detail `<pre>` to see its placement. `?glyphEntityOutline=1`. */
  readonly entityOutline?: boolean;
  /** BSP potentially-visible-set lookup: given the player eye (the same poly-frame
   *  origin the overlay camera uses), returns the set of visible leaf indexes, or
   *  null when there's no PVS for that point (→ render everything). World polygons
   *  whose leaves are all outside the set are culled before rasterizing — the bulk
   *  of an enclosed Quake level is then never projected. Absent → no cull. */
  readonly pvsVisibleLeavesAt?: (eye: Vec3) => Set<number> | null;
  /** Temporal AA blend (0 = off, history weight). Tunable via `?glyphTaa=`. */
  readonly temporalBlend?: number;
  /** Character cell size in px (bigger = fewer cells = faster). `?glyphCell=`. */
  readonly cellPx?: number;
  /** Line height in px (vertical cell pitch). Defaults to ~0.6× cellPx. `?glyphLine=`. */
  readonly lineHeight?: number;
  /** Initial composite mode (glyph/poly/both). Default "glyph". `?glyphComposite=`. */
  readonly composite?: QuakeGlyphComposite;
  /** The polycss world subtree (the transformed scene root holding every textured
   *  polygon). In "glyph" composite the opaque ASCII covers it completely, so we
   *  `display:none` it — polycss then skips style/layout/paint for the whole world
   *  instead of rasterizing thousands of hidden DOM polygons every frame. The
   *  camera element itself stays live (focus, pointer-lock, controls), and the
   *  layer comes straight back for "poly"/"both". */
  readonly polyWorldLayer?: HTMLElement | null;
  /** FOV scale. Default 1 (polycss-native projection needs no scaling). `?glyphFovScale=`. */
  readonly fovScale?: number;
  /** Flatten colour variation toward a common tone (0..1) to kill scroll crawl. */
  readonly flat?: number;
  /** Colour brighten multiplier for the dark baked Quake colours. */
  readonly brighten?: number;
  /** Ambient light (the floor of brightness; baked colours are the truth). `?glyphAmbient=`. */
  readonly ambientLight?: number;
  /** Directional light intensity (orientation shading for ASCII shape). `?glyphDir=`. */
  readonly directionalLight?: number;
  /**
   * Depth-test deadband (0 = off). Near-coplanar world surfaces (overlapping
   * brushes, water over its floor) resolve by paint order instead of z-fighting
   * the depth buffer as the camera moves — glyph's equivalent of polycss DOM
   * stacking. Tunable via `?glyphEps=`. */
  readonly depthEpsilon?: number;
  /** Show an on-screen readout of eye position + orientation (`?glyphDebug=1`). */
  readonly debug?: boolean;
  /** Freeze the camera at [eyeX,eyeY,eyeZ,rotX,rotY] for exact repro (`?glyphView=`). */
  readonly fixedView?: readonly [number, number, number, number, number] | null;
}

interface GlyphPolygon {
  vertices: Vec3[];
  color: string;
  /** Toggled per frame by the PVS cull; glyphcss skips hidden polygons. */
  hidden?: boolean;
}

/** Per-frame model geometry for an entity (same compact shape as the world). */
export interface QuakeGlyphEntityGeometry {
  polygons: ReadonlyArray<{ v: number[][]; c: string }>;
}

/** World-space placement of an entity mesh (degrees for rotation). */
export interface QuakeGlyphEntityTransform {
  position: readonly [number, number, number];
  /** Euler degrees [rx, ry, rz]; Quake yaw maps to rz. */
  rotation?: readonly [number, number, number];
  /** Uniform factor, or per-axis [sx, sy, sz] (e.g. the non-uniform viewmodel). */
  scale?: number | readonly [number, number, number];
  /** Relative depth bias to win z-fights vs coplanar world geometry (e.g. movers). */
  depthBias?: number;
  /** Per-entity glyph detail multiplier (overrides the overlay's default). */
  density?: number;
  /** Never occluded by the world (glyphcss `transparent`). Quake draws the
   *  viewmodel after a depth clear, so the gun is never swallowed by the wall
   *  the player is standing against — mirror that here. */
  neverOccluded?: boolean;
}

export interface QuakeGlyphWorldGeometry {
  /** `l` = BSP leaf indexes the polygon touches, for the runtime PVS cull. */
  polygons: ReadonlyArray<{ v: number[][]; c: string; l?: number[] }>;
}

/**
 * How the glyph overlay composites against the polycss world rendered underneath
 * (polycss is always the engine; the overlay sits on top). Lets you flip between
 * the two backends live — and overlay them — without reloading:
 *  - "glyph": opaque ASCII over (and hiding) the poly world — normal glyph mode.
 *  - "poly":  overlay hidden → you see the polycss render underneath.
 *  - "both":  ASCII at 50% over the poly world → check the two line up (parity).
 */
export type QuakeGlyphComposite = "glyph" | "poly" | "both";

/** glyphcss scene render modes we expose. */
export type QuakeGlyphSceneMode = "solid" | "wireframe" | "voxel" | "ink";

/** glyphcss cell character encodings. `braille` is wireframe-only; `halfblock`
 *  and `quadrant` are solid-only (see glyphcss docs). */
export type QuakeGlyphCharMode = "ascii" | "braille" | "halfblock" | "quadrant";

export interface QuakeGlyphWorldOverlay {
  readonly element: HTMLElement;
  setGeometry(geometry: QuakeGlyphWorldGeometry | null): void;
  syncCamera(eye: Vec3, rotX: number, rotY: number, target?: Vec3): void;
  /**
   * Register/replace an entity mesh (monster, pickup, projectile, …). Pass the
   * current animation frame's geometry + world transform. Calling again with the
   * same `id` swaps the frame/geometry. Cheap transform-only moves can use
   * {@link setEntityTransform}. Geometry `null` removes the mesh.
   */
  setEntity(id: string, geometry: QuakeGlyphEntityGeometry | null, transform: QuakeGlyphEntityTransform): void;
  /** Update only an entity's world placement (no geometry change) — moving mesh.
   *  Returns false when no mesh is registered under `id` (nothing moved), so the
   *  caller can re-register rather than silently freeze. */
  setEntityTransform(id: string, transform: QuakeGlyphEntityTransform): boolean;
  /** Remove an entity mesh. */
  removeEntity(id: string): void;
  /** Diagnostic: render an exact frozen view (used by the flicker probes). */
  setFixedView(eyeX: number, eyeY: number, eyeZ: number, rotX: number, rotY: number): void;
  setVisible(visible: boolean): void;
  /** Live backend compositing (no reload): glyph / poly / both — see {@link QuakeGlyphComposite}. */
  setComposite(mode: QuakeGlyphComposite): void;
  /** Current composite mode. */
  getComposite(): QuakeGlyphComposite;
  /** Swap the glyph set (intensity ramp) live — no reload. */
  setGlyphPalette(name: string): void;
  /** Swap the cell character encoding live (ascii/braille/halfblock/quadrant).
   *  Selecting `braille` forces wireframe mode, where it is the only mode braille
   *  applies to. */
  setCharMode(mode: QuakeGlyphCharMode): void;
  /** Current character encoding. */
  getCharMode(): QuakeGlyphCharMode;
  /** Swap the glyphcss scene render mode live (solid/wireframe/voxel/ink). */
  setSceneMode(mode: QuakeGlyphSceneMode): void;
  /** Current scene render mode. */
  getSceneMode(): QuakeGlyphSceneMode;
  /** Current glyph set name. */
  getGlyphPalette(): string;
  dispose(): void;
}

// Tuned for the char-grid resolution (glyph projects to cells, not the px
// viewport, so these differ numerically from polycss while the projection math
// is identical). Larger perspective = wider FOV; larger zoom = closer.
const QUAKE_GLYPH_OVERLAY_PERSPECTIVE = 1400;
const QUAKE_GLYPH_OVERLAY_ZOOM = 50;
// Quake's baked texture colours are very dark; lift them so the ASCII reads.
// (Kept modest: supersampling now fills coverage fully, so over-bright colours
// no longer hide behind sparse sampling — they wash the whole frame out.)
const QUAKE_GLYPH_OVERLAY_BRIGHTEN = 3.6;
// Depth-test deadband for near-coplanar world surfaces (see scene `depthEpsilon`).
// Default OFF: the real grazing-angle z-fighting came from glyphcss dropping the
// perspective-correct zbuf under supersampling (cssQuake runs SS=2), which is now
// fixed in the library — so perspective-correct depth ordering resolves the
// tearing without a deadband. The knob remains (via `?glyphEps=`) for genuinely
// coincident coplanar faces (e.g. a water plane exactly on its floor) where even
// correct depth ties; a small value (~0.01) then lets the last-drawn face win,
// mirroring a CSS/DOM renderer's stacking order.
const QUAKE_GLYPH_OVERLAY_DEPTH_EPSILON = 0;

// Matches src/runtime/app/cameraFeedbackFlow.ts quakeCameraForwardDirection.
function forwardDirection(rotX: number, rotY: number): Vec3 {
  const rx = rotX * DEG;
  const ry = rotY * DEG;
  return [-Math.sin(rx) * Math.cos(ry), -Math.sin(rx) * Math.sin(ry), -Math.cos(rx)];
}

// Blend a colour toward a common Quake-tan reference by `amount` (0..1). Used to
// suppress per-face lit-colour variation that crawls as the floor scrolls.
const QUAKE_GLYPH_FLATTEN_REF: [number, number, number] = [138, 122, 94];
function flattenHex(hex: string, amount: number): string {
  if (amount <= 0) return hex;
  const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) return hex;
  const ch = (slice: string, ref: number) => {
    const v = parseInt(slice, 16) * (1 - amount) + ref * amount;
    return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  };
  return `#${ch(match[1], QUAKE_GLYPH_FLATTEN_REF[0])}${ch(match[2], QUAKE_GLYPH_FLATTEN_REF[1])}${ch(match[3], QUAKE_GLYPH_FLATTEN_REF[2])}`;
}

function brightenHex(hex: string, factor: number): string {
  const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) return hex;
  const channel = (slice: string) => {
    const lifted = Math.round(parseInt(slice, 16) * factor);
    return Math.max(0, Math.min(255, lifted)).toString(16).padStart(2, "0");
  };
  return `#${channel(match[1])}${channel(match[2])}${channel(match[3])}`;
}

export function createQuakeGlyphWorldOverlay(
  options: QuakeGlyphWorldOverlayOptions,
): QuakeGlyphWorldOverlay {
  const perspective = options.perspective ?? QUAKE_GLYPH_OVERLAY_PERSPECTIVE;
  // Character cell size in px. Bigger = fewer cells = much faster. `?glyphCell=`.
  const cellPx = Math.max(6, Math.min(40, options.cellPx ?? 20));
  // Vertical cell pitch (line height). A monospace glyph cell is ~0.6× as wide
  // as the font size, so `line-height = font-size` makes the CELL ~1.67× taller
  // than wide — which throws away over half the vertical resolution and is what
  // made the ASCII look coarse. Default to ~0.6× the font size so cells are
  // roughly SQUARE: ~1.6× more rows = much finer vertical detail at the same
  // font size. (`fovScale = cellPx/lineHeightPx` keeps the framing fixed.)
  // `?glyphLine=` still overrides for manual tuning.
  const lineHeightPx = Math.max(4, Math.min(40, options.lineHeight ?? Math.round(cellPx * 0.6)));
  const zoom = options.zoom ?? QUAKE_GLYPH_OVERLAY_ZOOM;
  // No FOV magic: glyphcss now projects with polycss-native camera units + measured
  // cell metrics, so passing polycss's own `zoom` + `perspective` (see App) makes
  // the projection pixel-identical to polycss. fovScale stays 1.
  // `?glyphFovScale=` only for experiments.
  const fovScale = options.fovScale ?? 1;
  // The glyph render is synchronous in the game loop, so render time = framerate
  // = flicker. A chunky grid (cellPx 20) keeps the framerate high; on TOP of
  // that, 2× supersampling fixes the PROVEN see-through cause — coverage point-
  // sampling, where a cell's single centre sample slides off a small/edge polygon
  // on motion so the surface vanishes and you see the polygon behind it. SS
  // samples 2×2 sub-cells, so small polys/edges register stably. At cell 20 the
  // grid is small enough that SS2 is cheap (~5ms/render, ~190fps render-bound) —
  // the old "SS is slow" was at cell 9/14 (10× more cells). Tunable via `?ssaa=`.
  // Adaptive supersample: SS is the dominant render cost (≈doubles loop time per
  // step) and it's anti-aliasing, NOT detail — detail comes from cell size + the
  // glyph ramp. So at coarse cells SS2 cleans up sub-cell coverage cheaply, but at
  // fine cells (which already resolve sub-cell features) it just halves the fps;
  // drop it there. Explicit `?ssaa=` always wins.
  // "solid" ramp by default: EVERY covered cell is a full block, so surfaces read
  // as flat filled colour (shading carried by the baked-lit colour) — no dithered
  // shade glyphs or black gaps within a wall, which is the "rugged blocks" look.
  // `?glyphPalette=blocks` for the dithered block ramp, `detail` for ASCII letters,
  // `default|ascii` for others. NOTE: scene-level, so entities use it too.
  let glyphPalette = options.glyphPalette ?? "solid";
  // Scene mode + character encoding. Braille (U+2800..U+28FF, a 2x4 dot mask per
  // cell) only applies to WIREFRAME output in glyphcss, so asking for braille
  // without a mode implies wireframe — otherwise it silently renders as plain
  // solid ASCII. `?glyphCharMode=braille` alone is enough to get braille Quake.
  let charMode: QuakeGlyphCharMode = options.charMode ?? "ascii";
  let sceneMode: QuakeGlyphSceneMode =
    options.sceneMode ?? (charMode === "braille" ? "wireframe" : "solid");
  // With no depth reference the wireframe path paints far edges over near ones,
  // which turns a Quake level into unreadable spaghetti. Default braille/wireframe
  // to hidden-line removal; `?glyphHiddenLines=show` opts back out.
  // Colour quantization: merge adjacent cells into one span while their colours
  // stay within this redmean distance. Cheap fidelity-for-spans trade; 0 = off.
  const colorTolerance = Math.max(0, Math.min(765, options.colorTolerance ?? 0));
  const hiddenLines: "show" | "hide" =
    options.hiddenLines ?? (sceneMode === "wireframe" || sceneMode === "ink" ? "hide" : "show");
  // Per-mesh detail multiplier for entities: render them at this × the world's
  // glyph density in their own depth-occluded layer, so a cheap coarse world keeps
  // crisp entities. glyphcss b1e2bb6 fixed detail-layer alignment under our
  // CSS-perspective camera (it scales `fovScale`, not `zoom`). 1 = off. `?glyphEntityDensity=`.
  const entityDensity = Math.max(1, Math.min(4, options.entityDensity ?? 2));
  // Supersample (coverage AA: 2× sub-samples each cell so small polys/edges
  // register stably under motion). DEFAULT 1 (off): it's the single biggest
  // render cost (~2.4× slower at SS2), and with the BLOCKS palette its benefit is
  // marginal — block glyphs FILL the cell, so there's no sub-cell letter shimmer
  // for SS to clean up, and PVS + the resulting higher framerate are the real
  // motion-stability win (per the flicker work: high fps beats SS). Opt back in
  // with `?ssaa=2` (worth it for the letter `detail`/`ascii` palettes). glyphcss
  // composes SS with density (detail layers stay SS=1 internally), so it's safe.
  const supersample = Math.max(1, Math.floor(options.supersample ?? 1));
  // DEBUG: render density entities `transparent` (no occlusion mask) — isolates a
  // PLACEMENT bug (entity drawn at the wrong screen spot) from an OCCLUSION bug
  // (placement right, but the shared id-map only lets it show through a "window").
  // `?glyphEntityTransparent=1`.
  const entityTransparent = options.entityTransparent ?? false;
  // DEBUG: outline each detail <pre> so you can SEE where it's placed vs where the
  // entity should be in the world. `?glyphEntityOutline=1`.
  const entityOutline = options.entityOutline ?? false;
  const temporalBlend = Math.max(0, Math.min(0.9, options.temporalBlend ?? 0));
  const brighten = options.brighten ?? QUAKE_GLYPH_OVERLAY_BRIGHTEN;
  const ambientLight = options.ambientLight ?? 0.5;
  const directionalLight = options.directionalLight ?? 0.6;
  const depthEpsilon = Math.max(0, Math.min(0.1, options.depthEpsilon ?? QUAKE_GLYPH_OVERLAY_DEPTH_EPSILON));
  // The motion "see-through" crawl is per-face lit-colour detail aliasing as the
  // floor scrolls. Blending each colour toward a common tone by `flatten` (0..1)
  // collapses adjacent faces toward the same colour → the crawl can't show. The
  // glyph char (lighting) still gives shape. Tunable via `?glyphFlat=`.
  const flatten = Math.max(0, Math.min(1, options.flat ?? 0));
  // PolyCSS first-person controls define the look target this far in front of
  // the eye, independent of zoom. Mirror that when a live target is not supplied
  // (fixed-view/debug paths).
  const lookOffset = perspective / BASE_TILE;

  const element = document.createElement("div");
  element.className = "quake-glyph-overlay";
  element.style.position = "absolute";
  element.style.inset = "0";
  // Same stacking level as the polycss camera (z-index 1); inserted after it in
  // the DOM so it paints over the textured world, while the viewmodel (2), HUD
  // (3) and menu (5+) layers still render on top.
  element.style.zIndex = "1";
  element.style.overflow = "hidden";
  element.style.background = "#000";
  element.style.fontFamily = '"Menlo", "Consolas", monospace';
  element.style.fontSize = `${cellPx}px`;
  element.style.lineHeight = `${lineHeightPx}px`;
  element.style.letterSpacing = "0";
  element.style.pointerEvents = "none";
  if (options.insertBefore && options.insertBefore.parentElement === options.host) {
    options.host.insertBefore(element, options.insertBefore);
  } else {
    options.host.appendChild(element);
  }
  if (entityOutline) {
    // DEBUG: box each per-entity detail <pre> so its placement is visible.
    const dbg = document.createElement("style");
    dbg.textContent = ".quake-glyph-overlay .glyph-output--detail{outline:1px solid #ff00ff;outline-offset:-1px;}";
    element.appendChild(dbg);
  }

  const camera = createGlyphPerspectiveCamera({ rotX: 90, rotY: 270, zoom, perspective, distance: 0, fovScale });

  const scene = createGlyphScene(element, {
    mode: sceneMode,
    charMode,
    hiddenLines,
    colorTolerance,
    useColors: true,
    autoSize: true,
    // Dense intensity ramp (≈70 levels vs the 10-char default) for smooth tonal
    // gradation — free for colored output (runs coalesce by colour, not glyph).
    glyphPalette,
    // Quake BSP faces aren't all wound toward the viewer; render both sides so
    // none vanish, matching polycss's double-sided CSS rendering.
    doubleSided: true,
    // Supersampled AA: the detailed floor's sub-cell-sized polys otherwise crawl
    // and flip surfaces ("show-through") under motion. 2× cuts that ~70%.
    supersample,
    // Temporal AA blends frames — kills the residual fast-motion edge crawl that
    // supersampling can't reach (cost: a fading motion trail). Tunable.
    temporalBlend,
    // Quake colours are ALREADY baked-lit (the lightmap is in the texture tone),
    // exactly what polycss shows. So keep ambient HIGH (the baked colour is the
    // truth) and the directional contribution SMALL — just enough to shade the
    // ASCII by surface orientation for shape. Too much directional darkens walls
    // whose normals face away from the light, so rotating the camera reveals
    // "super dark" walls that polycss (lightmap-only, no view shading) never has.
    ambientLight: { intensity: ambientLight },
    directionalLight: { intensity: directionalLight, direction: [-0.4, -0.55, -0.65] },
    // Near-coplanar world surfaces (overlapping brushes, a translucent water
    // plane over its floor) z-fight glyph's depth buffer — the per-cell winner
    // flips as the camera moves, tearing a surface in and out. The deadband
    // resolves such ties by paint order (last drawn wins), matching how polycss
    // composites coincident faces via DOM stacking. Tunable via `?glyphEps=`.
    depthEpsilon,
    camera,
  });

  // The scene's autoSize measures the cell box from its <pre> (scene.output), so
  // set the line-height there (not just the container) and re-fit so the row
  // count + projection aspect follow `?glyphLine=`.
  if (options.lineHeight !== undefined) {
    scene.output.style.lineHeight = `${lineHeightPx}px`;
    scene.fit();
  }

  // CRITICAL for parity: glyphcss projects polycss CSS px → glyph cells using the
  // MEASURED cell size, and caches that measurement. If the first measurement runs
  // before this overlay's <pre> is laid out (host size 0), it caches `measured:false`
  // and the projection permanently falls back to a BASE_TILE-sized cell — which
  // blows the FOV out (~139° vs polycss's ~82°). Force a re-fit after layout so the
  // cache holds the real cell metrics. (`scene.fit()` invalidates + re-measures.)
  if (typeof requestAnimationFrame !== "undefined") {
    requestAnimationFrame(() => {
      scene.fit();
      scheduleRender();
    });
  }

  let meshHandle: { dispose(): void } | null = null;
  // PVS cull state: the live world-mesh polygon objects (glyphcss holds these by
  // reference, so flipping `.hidden` reaches the rasterizer) + each polygon's BSP
  // leaves, and the last visible-leaf set applied (skip the per-poly loop when the
  // player hasn't crossed into a new leaf — `visibleLeavesAt` returns a stable set
  // per leaf, so a reference check suffices).
  const pvsVisibleLeavesAt = options.pvsVisibleLeavesAt ?? null;
  let worldPolys: GlyphPolygon[] | null = null;
  let worldLeaves: (number[] | null)[] | null = null;
  let lastVisibleLeaves: Set<number> | null | undefined;

  function setGeometry(geometry: QuakeGlyphWorldGeometry | null): void {
    if (meshHandle) {
      meshHandle.dispose();
      meshHandle = null;
    }
    worldPolys = null;
    worldLeaves = null;
    lastVisibleLeaves = undefined;
    if (!geometry?.polygons?.length) {
      scene.rerender();
      return;
    }
    const polygons: GlyphPolygon[] = geometry.polygons.map((polygon) => ({
      vertices: polygon.v as Vec3[],
      color: flattenHex(brightenHex(polygon.c, brighten), flatten),
    }));
    if (pvsVisibleLeavesAt) {
      worldPolys = polygons;
      worldLeaves = geometry.polygons.map((p) => (Array.isArray(p.l) && p.l.length ? p.l : null));
    }
    meshHandle = scene.add(polygons);
    scene.rerender();
  }

  // Potentially-visible-set cull: hide every world polygon whose leaves are all
  // outside the set visible from the player's current leaf. Recomputed only when
  // that set changes (i.e. on crossing into a new leaf). When there's no PVS for
  // the eye (null — solid/outside), reveal everything once.
  function applyPvsCull(): void {
    if (!pvsVisibleLeavesAt || !worldPolys || !worldLeaves) return;
    const visible = pvsVisibleLeavesAt(latestEye);
    if (visible === lastVisibleLeaves) return;
    lastVisibleLeaves = visible;
    if (!visible) {
      for (const poly of worldPolys) poly.hidden = false;
      return;
    }
    for (let i = 0; i < worldPolys.length; i++) {
      const leaves = worldLeaves[i];
      poly: {
        if (!leaves) { worldPolys[i]!.hidden = false; break poly; }
        for (let k = 0; k < leaves.length; k++) {
          if (visible.has(leaves[k]!)) { worldPolys[i]!.hidden = false; break poly; }
        }
        worldPolys[i]!.hidden = true;
      }
    }
  }

  // Entity meshes (monsters, pickups, projectiles, viewmodel). Each is a glyph
  // mesh placed in world space by its transform; the scene rasterizes them with
  // the world every frame. Keyed by a stable entity id.
  const entities = new Map<string, GlyphMeshHandle>();

  function toGlyphPolygons(geometry: QuakeGlyphEntityGeometry): GlyphPolygon[] {
    return geometry.polygons.map((polygon) => ({
      vertices: polygon.v as Vec3[],
      // Entities keep their own colour variation (no world flatten); just lift
      // the dark baked Quake palette like the world does so they read.
      color: brightenHex(polygon.c, brighten),
    }));
  }

  // Per-mesh detail: render an entity at a higher glyph density than the world
  // (its own finer <pre> layer, depth-occluded vs the world via the shared id-map,
  // which includes even PVS-culled walls so occlusion is correct). Applies to all
  // entities — pickups, the weapon, enemies, projectiles — now that detail-layer
  // alignment under the perspective camera is fixed (glyphcss b1e2bb6).
  // EXCLUDED: movers (doors/plats) — they're world architecture (often large,
  // spanning a doorway), so they belong in the shared grid at the world's detail,
  // not popped into a crisper bbox-fitted layer. A per-entity `transform.density`
  // always overrides.
  function meshDensity(id: string, transform: QuakeGlyphEntityTransform): number | undefined {
    if (transform.density != null) return transform.density > 1 ? transform.density : undefined;
    if (id.startsWith("mover:")) return undefined;
    return entityDensity > 1 ? entityDensity : undefined;
  }

  function toMeshTransform(id: string, transform: QuakeGlyphEntityTransform): GlyphMeshTransform {
    const density = meshDensity(id, transform);
    return {
      id,
      position: [transform.position[0], transform.position[1], transform.position[2]],
      rotation: transform.rotation
        ? [transform.rotation[0], transform.rotation[1], transform.rotation[2]]
        : undefined,
      scale: Array.isArray(transform.scale)
        ? [transform.scale[0], transform.scale[1], transform.scale[2]]
        : (transform.scale as number | undefined),
      ...(transform.depthBias ? { depthBias: transform.depthBias } : {}),
      ...(density ? { density } : {}),
      ...(transform.neverOccluded || (density && entityTransparent) ? { transparent: true } : {}),
    };
  }

  function setEntity(id: string, geometry: QuakeGlyphEntityGeometry | null, transform: QuakeGlyphEntityTransform): void {
    const existing = entities.get(id);
    if (existing) {
      existing.dispose();
      entities.delete(id);
    }
    if (!geometry?.polygons?.length) {
      scheduleRender();
      return;
    }
    entities.set(id, scene.add(toGlyphPolygons(geometry), toMeshTransform(id, transform)));
    scheduleRender();
  }

  function setEntityTransform(id: string, transform: QuakeGlyphEntityTransform): boolean {
    const handle = entities.get(id);
    // No mesh under this id: report it instead of silently doing nothing, so the
    // caller can re-register. A silent no-op here turns any transient drop into a
    // permanent one — the entity freezes/vanishes and never recovers.
    if (!handle) return false;
    handle.setTransform(toMeshTransform(id, transform));
    scheduleRender();
    return true;
  }

  function removeEntity(id: string): void {
    const handle = entities.get(id);
    if (!handle) return;
    handle.dispose();
    entities.delete(id);
    scheduleRender();
  }

  // Optional on-screen readout of the exact camera the overlay is rendering, so a
  // flicker spot can be pinned to precise coordinates (`?glyphDebug=1`).
  let readout: HTMLDivElement | null = null;
  let lastGlyphView = "";
  if (options.debug) {
    readout = document.createElement("div");
    readout.id = "quake-glyph-readout";
    // Attach to <body> (not the overlay) so it escapes the overlay's z-index:1
    // stacking context and paints above the logo/HUD; pin to the bottom-left.
    readout.style.cssText =
      "position:fixed;bottom:6px;left:6px;z-index:2147483647;padding:4px 7px;" +
      "font:12px/1.4 Menlo,monospace;color:#0f0;background:rgba(0,0,0,0.8);" +
      "white-space:pre;pointer-events:auto;cursor:pointer;letter-spacing:0;border:1px solid #0f0;";
    readout.title = "Click to copy a full URL that reproduces this exact view + settings";
    readout.addEventListener("click", () => {
      if (!lastGlyphView) return;
      // Copy a COMPLETE shareable URL: the current page URL (so renderMode,
      // glyphCell, glyphEntityDensity, debug knobs, etc. are preserved) with
      // glyphView set to the exact eye+orientation. Paste it to reproduce the
      // precise view someone is looking at.
      let text = lastGlyphView;
      try {
        const u = new URL(window.location.href);
        u.searchParams.set("renderMode", "glyphcss");
        u.searchParams.set("glyphView", lastGlyphView);
        text = u.toString();
      } catch { /* fall back to the raw glyphView value */ }
      void navigator.clipboard?.writeText(text);
      const prev = readout!.style.background;
      readout!.style.background = "rgba(0,80,0,0.95)";
      window.setTimeout(() => { if (readout) readout.style.background = prev; }, 250);
    });
    document.body.appendChild(readout);
  }

  // When set, the overlay renders this exact view and ignores the live player
  // camera — lets a reported flicker spot be reproduced deterministically
  // (`?glyphView=eyeX,eyeY,eyeZ,rotX,rotY`).
  const fixedView = options.fixedView ?? null;

  let pendingFrame = 0;
  let needsCellRefit = true;
  let composite: QuakeGlyphComposite = options.composite ?? "glyph";
  const polyWorldLayer = options.polyWorldLayer ?? null;
  let latestEye: Vec3 = fixedView ? [fixedView[0], fixedView[1], fixedView[2]] : [0, 0, 0];
  let latestRotX = fixedView ? fixedView[3] : 90;
  let latestRotY = fixedView ? fixedView[4] : 270;
  let latestTarget: Vec3 | null = null;
  function derivedTarget(): Vec3 {
    const forward = forwardDirection(latestRotX, latestRotY);
    return [
      latestEye[0] + forward[0] * lookOffset,
      latestEye[1] + forward[1] * lookOffset,
      latestEye[2] + forward[2] * lookOffset,
    ];
  }
  function renderFrame(): void {
    pendingFrame = 0;
    // In "poly" composite the overlay is hidden (you see polycss underneath), so
    // skip the expensive rasterize entirely — the camera still syncs cheaply.
    if (composite === "poly") return;
    // First real (game-driven) frame is guaranteed post-layout: re-measure the
    // cell so the projection uses the true cell size, not the BASE_TILE fallback
    // (a stale pre-layout measurement blows the FOV out — see the fit below).
    if (needsCellRefit) {
      needsCellRefit = false;
      scene.fit();
    }
    camera.rotX = latestRotX;
    camera.rotY = latestRotY;
    camera.target = latestTarget ?? derivedTarget();
    applyPvsCull();
    scene.rerender();
    if (readout) {
      const f = (n: number) => n.toFixed(2);
      // Raw glyphView value (no `?glyphView=` prefix) so the click handler can
      // splice it into a full URL.
      lastGlyphView = `${f(latestEye[0])},${f(latestEye[1])},${f(latestEye[2])},${f(latestRotX)},${f(latestRotY)}`;
      readout.textContent =
        `eye  ${f(latestEye[0])}, ${f(latestEye[1])}, ${f(latestEye[2])}\n` +
        `rotX ${f(latestRotX)}  rotY ${f(latestRotY)}\n` +
        `?glyphView=${lastGlyphView}   (click → copy full URL)`;
    }
  }
  // Coalesce renders to at most one per animation frame: the camera is applied
  // several times per game frame (origin sync, weapon punch, step smoothing) and
  // entities move/animate independently, but the ASCII rasterize is the heavy
  // part — render once per rAF instead of on every mutation, keeping fps (= the
  // thing that kills flicker) up.
  function scheduleRender(): void {
    if (!pendingFrame) pendingFrame = window.requestAnimationFrame(renderFrame);
  }
  function syncCamera(eye: Vec3, rotX: number, rotY: number, target?: Vec3): void {
    // In fixed-view mode the player camera is ignored; render the frozen view
    // once so the readout/output reflect exactly the requested coordinates.
    if (fixedView) {
      scheduleRender();
      return;
    }
    // `eye` may be a reused array; copy it.
    latestEye = [eye[0], eye[1], eye[2]];
    latestRotX = rotX;
    latestRotY = rotY;
    latestTarget = target ? [target[0], target[1], target[2]] : null;
    scheduleRender();
  }

  function setFixedView(eyeX: number, eyeY: number, eyeZ: number, rotX: number, rotY: number): void {
    latestEye = [eyeX, eyeY, eyeZ];
    latestRotX = rotX;
    latestRotY = rotY;
    latestTarget = null;
    renderFrame();
  }

  // Live backend compositing against the polycss world rendered underneath. No
  // reload: "glyph" = opaque ASCII (hides poly), "poly" = overlay hidden (poly
  // shows), "both" = ASCII at 50% over poly to eyeball parity.
  function setComposite(mode: QuakeGlyphComposite): void {
    composite = mode;
    // Opaque ASCII hides the poly world entirely — don't pay to render it.
    // "poly"/"both" need it back.
    if (polyWorldLayer) polyWorldLayer.style.display = mode === "glyph" ? "none" : "";
    if (mode === "poly") {
      element.style.display = "none";
      return;
    }
    element.style.display = "";
    element.style.opacity = mode === "both" ? "0.5" : "1";
    element.style.background = mode === "both" ? "transparent" : "#000";
    scheduleRender(); // refresh now that we're visible again
  }
  function getComposite(): QuakeGlyphComposite {
    return composite;
  }

  // The glyph set is just an intensity ramp lookup, so glyphcss can swap it on a
  // live scene — no reload, no geometry rebuild.
  function setGlyphPalette(name: string): void {
    if (name === glyphPalette) return;
    glyphPalette = name;
    scene.setOptions({ glyphPalette: name });
    scheduleRender();
  }
  function getGlyphPalette(): string {
    return glyphPalette;
  }

  // Mode/encoding are scene options too, so braille can be toggled live from the
  // console: `__quakeGlyph.setCharMode("braille")`.
  function setCharMode(next: QuakeGlyphCharMode): void {
    if (next === charMode) return;
    charMode = next;
    // Braille is a documented no-op outside wireframe — follow the mode along so
    // the toggle actually shows something.
    if (next === "braille" && sceneMode !== "wireframe") {
      sceneMode = "wireframe";
      scene.setOptions({ mode: sceneMode, hiddenLines: "hide" });
    }
    scene.setOptions({ charMode: next });
    scheduleRender();
  }
  function getCharMode(): QuakeGlyphCharMode {
    return charMode;
  }
  function setSceneMode(next: QuakeGlyphSceneMode): void {
    if (next === sceneMode) return;
    sceneMode = next;
    scene.setOptions({ mode: next });
    scheduleRender();
  }
  function getSceneMode(): QuakeGlyphSceneMode {
    return sceneMode;
  }
  function setVisible(visible: boolean): void {
    setComposite(visible ? "glyph" : "poly");
  }

  function dispose(): void {
    if (pendingFrame) { window.cancelAnimationFrame(pendingFrame); pendingFrame = 0; }
    for (const handle of entities.values()) handle.dispose();
    entities.clear();
    meshHandle?.dispose();
    meshHandle = null;
    scene.destroy();
    readout?.remove();
    element.remove();
  }

  // Apply the initial composite. Always run it (not just for non-default modes):
  // even "glyph" has work to do now — it has to hide the poly world layer.
  setComposite(composite);

  const overlay: QuakeGlyphWorldOverlay = {
    element, setGeometry, syncCamera, setEntity, setEntityTransform, removeEntity, setFixedView,
    setVisible, setComposite, getComposite, setGlyphPalette, getGlyphPalette,
    setCharMode, getCharMode, setSceneMode, getSceneMode, dispose,
  };
  // Dev-only: expose for the flicker probes / coordinate / entity debugging.
  if (import.meta.env?.DEV) {
    (overlay as unknown as { __entityCount?: () => number }).__entityCount = () => entities.size;
    (overlay as unknown as { __entityIds?: () => string[] }).__entityIds = () => [...entities.keys()];
    (overlay as unknown as { __pvsStats?: () => unknown }).__pvsStats = () => ({
      total: worldPolys?.length ?? 0,
      hidden: worldPolys?.filter((p) => p.hidden).length ?? 0,
      visibleLeaves: lastVisibleLeaves === null ? null : lastVisibleLeaves?.size ?? "n/a",
      leafAt: pvsVisibleLeavesAt ? "see set" : "no-pvs",
    });
    (window as unknown as { __quakeGlyphOverlay?: QuakeGlyphWorldOverlay }).__quakeGlyphOverlay = overlay;
    // Parity calibration probe: project a world point through the glyph camera to
    // screen px (mirrors renderFrame's camera setup). Compared to polycss's
    // ground-truth projection to calibrate perspective/zoom.
    (overlay as unknown as { __projectScreen?: (p: Vec3) => [number, number] }).__projectScreen = (p) => {
      camera.rotX = latestRotX;
      camera.rotY = latestRotY;
      camera.target = latestTarget ?? derivedTarget();
      const o = scene.getOptions();
      // Pass the MEASURED cell metrics the same way the render does (glyphcss maps
      // polycss CSS px → cells via the live cell size; without it project() falls
      // back to BASE_TILE/cellAspect and the FOV is wrong).
      const probe = document.createElement("span");
      probe.textContent = Array(20).fill("M").join("\n");
      probe.style.cssText = "position:absolute;visibility:hidden;font:inherit;line-height:inherit;white-space:pre";
      scene.output.appendChild(probe);
      const rc = probe.getBoundingClientRect();
      probe.remove();
      const cellWidth = rc.width, cellHeight = rc.height / 20;
      const hostRect = element.getBoundingClientRect();
      const centerCol = o.cols * 0.5 + (hostRect.width - o.cols * cellWidth) / (2 * cellWidth);
      const centerRow = o.rows * 0.5 + (hostRect.height - o.rows * cellHeight) / (2 * cellHeight);
      const metrics = { cellWidth, cellHeight, centerCol, centerRow };
      const pr = camera.project(p, o.cols, o.rows, o.cellAspect, metrics);
      return [pr[0] * cellWidth, pr[1] * cellHeight];
    };
    (overlay as unknown as { __debugEye?: () => number[] }).__debugEye = () =>
      [latestEye[0], latestEye[1], latestEye[2], latestRotX, latestRotY];
    (overlay as unknown as { __cameraParams?: () => unknown }).__cameraParams = () => ({
      zoom: camera.zoom, perspective: camera.perspective, distance: camera.distance,
      fovScale, lookOffset, target: latestTarget ?? derivedTarget(), cellPx, lineHeightPx, sceneOpts: scene.getOptions(),
    });
  }
  return overlay;
}
