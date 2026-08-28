import { createGlyphOrthographicCamera, createGlyphScene } from "glyphcss";
import type { Polygon } from "@layoutit/polycss";

/**
 * Renders a whole screen of sprite art as ONE ASCII image.
 *
 * Every sprite is a textured quad in a SINGLE glyphcss scene — one `<pre>`, one
 * character grid, one render. Layering is done in the Z axis and resolved by the
 * rasterizer's own depth test, which is what makes this a composite rather than
 * a collage: sprites land on the same cells as the backdrop behind them, so the
 * result reads as a single ASCII picture.
 *
 * The alternative — a scene per sprite — was built first and was wrong. Each got
 * its own grid at its own cell size (measured: an 11px-cell backdrop under 3px-
 * cell sprites), so the art never aligned, nothing could blend across a sprite
 * boundary, and five visible sprites cost five renders per frame.
 *
 * Coordinate frame, following glyphcss's own image example: world X is screen-
 * DOWN, world Y is screen-RIGHT, and the orthographic camera at `rotX: 0,
 * rotY: 0` maps world units to CSS pixels through `zoom`. Pinning `zoom` to the
 * host's pixel size lets a sprite's CSS box be placed in world space directly.
 */
export interface QuakeGlyphUiSprite {
  /** Element supplying the art and the layout box. `<img>` or CSS background. */
  readonly element: HTMLElement;
  /** Paint order. Higher sits in front; resolved by the scene's depth test. */
  readonly layer?: number;
  /** Detail-layer multiplier — see {@link QuakeGlyphUiSpriteRule.density}. */
  readonly density?: number;
  /** Explicit texture URL — see {@link QuakeGlyphUiSpriteRule.texture}. */
  readonly texture?: string;
  /** Split the art into one quad per connected opaque region — see the rule. */
  readonly segment?: boolean;
  /** Per-sprite brightness, 0..1 — see {@link QuakeGlyphUiSpriteRule.brightness}. */
  readonly brightness?: number;
  /**
   * How the art maps into the box.
   * - `contain` — whole image, its own aspect (an `<img>`).
   * - `cover` — crop to fill, centred (`background-size: cover`).
   * - `css` — read the element's live `background-size`/`background-position` and
   *   reproduce them. Needed for sprite SHEETS: Quake's menu labels are two
   *   frames stacked vertically, selected by `background-position: 0 0` (normal)
   *   vs `0 100%` (highlighted), so the UV window has to follow the selection.
   */
  readonly fit?: "cover" | "contain" | "css";
}

/** Matches sprites by selector, so elements created LATER are still adopted. */
export interface QuakeGlyphUiSpriteRule {
  readonly selector: string;
  readonly layer?: number;
  readonly fit?: "cover" | "contain" | "css";
  /**
   * Render this sprite at N x the shared grid's resolution, in its own glyphcss
   * detail layer (`cell = base cell / density`, same on-screen size). This is the
   * same mechanism the world overlay uses to keep monsters and pickups crisp
   * over a cheap coarse world.
   *
   * It is the right answer for small art: a title or a menu label occupies a
   * handful of cells at the backdrop's resolution, and raising the SHARED budget
   * to fix that pays for every cell of a full-viewport backdrop that gains
   * nothing. Each distinct density costs one extra `<pre>` — but a library detail
   * layer, aligned to the base grid and depth-occluded by it, not the ad-hoc
   * separate scene this file replaced.
   */
  readonly density?: number;
  /**
   * Split the art into one quad per connected OPAQUE region instead of a single
   * rectangle, cutting along the transparent pixels.
   *
   * This is what makes `density` usable. A detail layer blanks every base cell
   * under its box, so one quad spanning a whole word punches an opaque rectangle
   * through the backdrop — the gaps between letters included. Segmenting first
   * means each letter carries its own tight quad, so only the letter's own box
   * is blanked and the backdrop shows through everywhere between them.
   */
  readonly segment?: boolean;
  /**
   * Brightness for this sprite, 0..1 (default 1 = the source as authored).
   *
   * The rasterizer multiplies each sampled texel by the polygon's flat colour
   * (`texel x base / 255`), so a grey base dims the art — and because texel
   * luminance also folds into the GLYPH choice, dimming pushes a cell down the
   * intensity ramp to a sparser character, not just a darker one. That is what
   * buys contrast here: the backdrop drops to faint punctuation while the art on
   * top keeps dense glyphs, instead of both sitting in the same mid range.
   */
  readonly brightness?: number;
}

export interface QuakeGlyphUiOverlayOptions {
  /** Element the shared grid covers — its box is the ASCII canvas. */
  readonly host: HTMLElement;
  /**
   * Selector rules, rescanned as the DOM changes. Rules rather than resolved
   * elements because much of this UI is built after startup: the boot log alone
   * appends 808 sprite-sheet spans, none of which exist when this mounts.
   */
  readonly sprites: readonly QuakeGlyphUiSpriteRule[];
  /** Ceiling on total cells; the cell grows until the grid fits. */
  readonly maxCells?: number;
  /** Smallest cell in px. The floor on how fine the art can get. */
  readonly minCellPx?: number;
  /**
   * Scene ambient intensity — the headroom every sprite's `brightness` scales
   * DOWN from. Above 1 it lifts the art past the source's own luminance, which
   * Quake's menu art needs: it is dark bronze on near-black, and at ambient 1 the
   * whole screen sits in the ramp's sparse low end with nothing to separate art
   * from backdrop. Raising this and dimming the backdrop is what creates the
   * contrast; brightness alone cannot, because a tint can only attenuate.
   */
  readonly ambient?: number;
  /**
   * Tone-curve exponent applied to every cell colour AFTER rasterization,
   * hue-preserving (RGB scaled by lumaOut/lumaIn, capped so no channel clips).
   * Below 1 lifts the dark and mid tones the way a display gamma does — the
   * lever `ambient` cannot be: ambient is a LINEAR multiplier, so pushing it
   * high enough to rescue the shadows drives the art's bright texels past 255
   * per channel and washes the bronze to grey-white (measured at ambient 3.0:
   * the plaque reads as monochrome). A curve spends its lift where the source
   * is dark and tapers to nothing at the top, so highlights keep their hue.
   * Default 1 = off.
   */
  readonly gamma?: number;
  readonly glyphPalette?: string;
  /** Final-string encode strategy. Defaults to `atlas`, as the world does. */
  readonly colorEncoding?: "atlas" | "spans";
  /**
   * Selectors whose `::before` art is MATERIALIZED into a real element so it can
   * be converted. A pseudo-element cannot be selected or measured —
   * `querySelectorAll` never returns it and it has no `getBoundingClientRect` —
   * so the overlay is blind to it and it keeps painting as HTML. The panel
   * plaque and every menu button's selection cursor are authored this way.
   */
  readonly pseudoSelectors?: readonly string[];
  /**
   * Texture URL for a rule, when the element's own `background-image` cannot be
   * read.
   *
   * The CSS that stops the HTML art painting (needed pre-paint, or the PNG
   * flashes before the overlay mounts) sets `background-image: none`, which is
   * also where the overlay would otherwise LEARN the texture — blanking it made
   * the backdrop and plaque render as empty black. Declaring the URL here breaks
   * that circular dependency: CSS can suppress the paint from the first frame
   * while the overlay still knows what to draw.
   */
  readonly texture?: string;
  /**
   * Selectors for DOM text that should be STAMPED INTO the glyph grid instead of
   * being painted by the browser.
   *
   * This is what collapses the UI to a single `<pre>`. The art is already
   * textured quads; the words were still real DOM (the boot log alone is ~190
   * spans, an open Options panel ~435). Stamping them through glyphcss's
   * post-rasterize `transformCells` hook — which mutates the final grid just
   * before the one `<pre>` write — puts them on the same character grid as the
   * art, so the whole screen is one ASCII image.
   */
  readonly textSelectors?: readonly string[];
}

export interface QuakeGlyphUiOverlay {
  readonly element: HTMLElement;
  sync(): void;
  dispose(): void;
}

/** `rgb(r, g, b)` from getComputedStyle → `#rrggbb` for the cell grid. */
function rgbToHex(value: string): string {
  const m = /rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(value);
  if (!m) return "#c8c8c8";
  const h = (n: string) => Number(n).toString(16).padStart(2, "0");
  return `#${h(m[1]!)}${h(m[2]!)}${h(m[3]!)}`;
}

const DEFAULT_MAX_CELLS = 24_000;
const DEFAULT_MIN_CELL_PX = 3;
/** Monospace advance as a fraction of font size (measured, as elsewhere). */
const CELL_ASPECT = 0.606;
/**
 * World-Z step between layers. Only the ORDER matters — the depth test compares
 * magnitudes, and the quads never intersect — so this just has to exceed the
 * depth epsilon without pushing a quad behind the camera.
 */
const LAYER_STEP = 0.5;


/** Longest edge used when labelling. Bboxes only need to be approximately right,
 *  and a 1343px logo does not deserve a 350k-pixel flood fill. */
const SEGMENT_MAX_EDGE = 384;
/** Alpha at or below which a source pixel counts as empty. */
const SEGMENT_ALPHA_MIN = 8;
/** Regions this close (in sample cells) are merged — keeps a dotted letter or an
 *  accent from splintering into a dozen quads. */
const SEGMENT_GAP = 1;

/**
 * Connected opaque regions of an image, as normalized (0..1) UV boxes.
 *
 * Two-pass scan with union-find over an 8-connected neighbourhood, dilated by
 * `SEGMENT_GAP` so a letter's disconnected parts (the dot on an `i`, an antialiased
 * hairline) stay one region rather than becoming separate quads.
 */
function segmentOpaqueRegions(img: HTMLImageElement): { u0: number; v0: number; u1: number; v1: number }[] | null {
  const nw = img.naturalWidth || img.width;
  const nh = img.naturalHeight || img.height;
  if (!nw || !nh) return null;
  const scale = Math.min(1, SEGMENT_MAX_EDGE / Math.max(nw, nh));
  const w = Math.max(1, Math.round(nw * scale));
  const h = Math.max(1, Math.round(nh * scale));

  let data: Uint8ClampedArray;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return null;   // tainted canvas — fall back to a single quad
  }

  const n = w * h;
  const solid = new Uint8Array(n);
  for (let i = 0; i < n; i++) solid[i] = data[i * 4 + 3]! > SEGMENT_ALPHA_MIN ? 1 : 0;

  const parent = new Int32Array(n).fill(-1);
  const find = (a: number): number => { let r = a; while (parent[r]! >= 0) r = parent[r]!; while (parent[a]! >= 0) { const nx = parent[a]!; parent[a] = r; a = nx; } return r; };
  const union = (a: number, b: number): void => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!solid[i]) continue;
      for (let dy = -SEGMENT_GAP; dy <= SEGMENT_GAP; dy++) {
        for (let dx = -SEGMENT_GAP; dx <= SEGMENT_GAP; dx++) {
          const ny = y + dy, nx = x + dx;
          if (ny < 0 || nx < 0 || ny >= h || nx >= w) continue;
          const j = ny * w + nx;
          if (j < i && solid[j]) union(i, j);
        }
      }
    }
  }

  const boxes = new Map<number, { x0: number; y0: number; x1: number; y1: number }>();
  for (let i = 0; i < n; i++) {
    if (!solid[i]) continue;
    const r = find(i);
    const x = i % w, y = (i / w) | 0;
    const b = boxes.get(r);
    if (!b) boxes.set(r, { x0: x, y0: y, x1: x, y1: y });
    else { if (x < b.x0) b.x0 = x; if (y < b.y0) b.y0 = y; if (x > b.x1) b.x1 = x; if (y > b.y1) b.y1 = y; }
  }
  if (!boxes.size) return null;

  // Expand by half a sample cell so a region cannot clip its own edge pixels.
  return [...boxes.values()].map((b) => ({
    u0: Math.max(0, b.x0 / w), v0: Math.max(0, b.y0 / h),
    u1: Math.min(1, (b.x1 + 1) / w), v1: Math.min(1, (b.y1 + 1) / h),
  }));
}

interface SpriteState {
  readonly sprite: QuakeGlyphUiSprite;
  readonly isImg: boolean;
  readonly url: string;
  natural: { w: number; h: number } | null;
  /** Connected opaque regions in normalized (0..1) source coordinates. */
  regions: { u0: number; v0: number; u1: number; v1: number }[] | null;
}

export function createQuakeGlyphUiOverlay(
  options: QuakeGlyphUiOverlayOptions,
): QuakeGlyphUiOverlay {
  const { host: hostEl } = options;
  const maxCells = Math.max(256, options.maxCells ?? DEFAULT_MAX_CELLS);
  const minCellPx = Math.max(2, options.minCellPx ?? DEFAULT_MIN_CELL_PX);

  function readUrl(el: HTMLElement, isImg: boolean, declared?: string): string {
    if (el.dataset.glyphTexture) return el.dataset.glyphTexture;
    if (declared) return declared;
    if (isImg) return (el as HTMLImageElement).currentSrc || (el as HTMLImageElement).src;
    const bg = getComputedStyle(el).backgroundImage;
    return /url\((["']?)(.*?)\1\)/.exec(bg)?.[2] ?? "";
  }

  // Keyed by element so a rescan is idempotent. URLs are captured BEFORE the art
  // is hidden: hiding clears `background-image`, and reading it after yields
  // "none".
  const states = new Map<HTMLElement, SpriteState>();
  let adoptedSinceDraw = false;

  function adopt(el: HTMLElement, rule: QuakeGlyphUiSpriteRule): void {
    if (states.has(el)) return;
    const isImg = el instanceof HTMLImageElement;
    const url = readUrl(el, isImg, rule.texture);
    if (!url) return;
    states.set(el, {
      sprite: {
        element: el, layer: rule.layer, fit: rule.fit, texture: rule.texture,
        density: rule.density, segment: rule.segment, brightness: rule.brightness,
      },
      isImg, url, natural: null, regions: null,
    });
    if (el.dataset.glyphTexture) { /* data anchor: nothing of its own to hide */ }
    else if (isImg) el.style.visibility = "hidden";
    else el.style.backgroundImage = "none";
    adoptedSinceDraw = true;
    resolveNatural(states.get(el)!);
  }

  /**
   * Build a texture from vector art referenced by a plain element.
   *
   * Some menu labels were authored as rendered `<svg>` that `<use>`d a shared
   * pixel-art group — art no `<img>`/`background-image` detector can see, which
   * is exactly why they kept painting as HTML after everything else converted.
   * The markup now carries only a REFERENCE (`data-glyph-svg-art` plus the
   * `viewBox` that crops it), so nothing vector is rendered: the art group is
   * serialized under that viewBox into a data URI and sampled like any texture.
   */
  function materializeSvg(): void {
    for (const selector of options.svgSelectors ?? []) {
      let nodes: NodeListOf<Element>;
      try { nodes = document.querySelectorAll(selector); } catch { continue; }
      for (const node of nodes) {
        if (!(node instanceof HTMLElement) || node.dataset.glyphTexture) continue;
        const artId = node.dataset.glyphSvgArt;
        const viewBox = node.dataset.glyphSvgViewbox;
        const size = node.dataset.glyphSvgSize?.split(" ");
        if (!artId || !viewBox || !size || size.length !== 2) continue;
        const art = document.getElementById(artId);
        if (!art) continue;
        const doc = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" `
          + `width="${size[0]}" height="${size[1]}">${art.outerHTML}</svg>`;
        node.dataset.glyphTexture = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(doc)}`;
      }
    }
  }

  /**
   * Re-resolve a stand-in's box from its host's live `::before`.
   *
   * Copying the geometry once at creation was wrong twice over: a panel is
   * HIDDEN when the overlay first scans it, so container-relative units (`cqw`,
   * the menu's sizing unit) resolve against a zero-size container, and the
   * frozen pixel values then never track a resize. Measured symptom: a plaque
   * stand-in 160x720 inside an 860x538 card, and a 120px-tall cursor on a 54px
   * button. Re-reading on every sync costs a handful of style reads and keeps
   * the stand-in the size the pseudo would actually have been.
   */
  function applyPseudoGeometry(host: HTMLElement, stand: HTMLElement): void {
    const cs = getComputedStyle(host, "::before");
    // Honour the pseudo's own visibility. The selection cursor is `display:none`
    // until its item is active, so a stand-in that ignores that draws a cursor on
    // EVERY button at once — which reads as oversized art everywhere and as a
    // selection that never moves. Zero-sizing it makes `buildPolygons` skip it.
    const shown = cs.display !== "none" && cs.visibility !== "hidden" && cs.content !== "none";
    stand.style.top = cs.top;
    stand.style.left = cs.left;

    // CLAMP to the host's visible area. The plaque is sized in `cqw`, which
    // resolves against the viewport, and the real `::before` is then clipped by
    // the card's `overflow: hidden` — measured 160x720 inside an 860x538 card.
    // A quad drawn at the unclipped size paints the art far outside the card,
    // which is what read as "the image on the left is huge".
    const clip = getComputedStyle(host).overflow !== "visible";
    const offX = parseFloat(cs.left) || 0;
    const offY = parseFloat(cs.top) || 0;
    const wantW = parseFloat(cs.width) || 0;
    const wantH = parseFloat(cs.height) || 0;
    const maxW = clip ? Math.max(0, host.clientWidth - offX) : wantW;
    const maxH = clip ? Math.max(0, host.clientHeight - offY) : wantH;
    stand.style.width = shown ? `${Math.min(wantW, maxW)}px` : "0px";
    stand.style.height = shown ? `${Math.min(wantH, maxH)}px` : "0px";
    // Clipping shows the TOP-LEFT of the art, so the sampled window must shrink
    // to match rather than squashing the whole sprite into the smaller box.
    stand.dataset.glyphClipU = wantW > 0 ? String(Math.min(1, maxW / wantW)) : "1";
    stand.dataset.glyphClipV = wantH > 0 ? String(Math.min(1, maxH / wantH)) : "1";
    stand.dataset.glyphBgSize = cs.backgroundSize;
    stand.dataset.glyphBgPos = cs.backgroundPosition;
  }

  function refreshPseudoGeometry(): void {
    for (const stand of document.querySelectorAll(".quake-glyph-pseudo")) {
      const host = stand.parentElement;
      if (host instanceof HTMLElement && stand instanceof HTMLElement) applyPseudoGeometry(host, stand);
    }
  }

  /** Copy `::before` art onto a real child so a sprite rule can pick it up. */
  function materializePseudo(): void {
    for (const selector of options.pseudoSelectors ?? []) {
      let nodes: NodeListOf<Element>;
      try { nodes = document.querySelectorAll(selector); } catch { continue; }
      for (const node of nodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.querySelector(":scope > .quake-glyph-pseudo")) continue;
        const cs = getComputedStyle(node, "::before");
        // The suppressing CSS blanks `background-image`, so fall back to the
        // rule's declared texture rather than skipping the element.
        const declared = options.pseudoTextures?.[selector];
        const fromCss = cs.backgroundImage !== "none" && !cs.backgroundImage.includes("gradient")
          ? /url\((["']?)(.*?)\1\)/.exec(cs.backgroundImage)?.[2]
          : undefined;
        const url = fromCss ?? declared;
        if (!url) continue;
        const stand = document.createElement("span");
        stand.className = "quake-glyph-pseudo";
        // GEOMETRY ONLY — deliberately no `background-image`. The stand-in is a
        // real element, so any background it carries PAINTS as HTML until the
        // overlay adopts it (a visible flash), and a pseudo's own
        // `background-size` (the cursor's is `600% 100%`) renders wildly
        // oversized at the stand-in's box. The texture rides along as data and
        // is read by `readUrl`, so this element never paints anything.
        stand.dataset.glyphTexture = url;
        stand.dataset.glyphBgSize = cs.backgroundSize;
        stand.dataset.glyphBgPos = cs.backgroundPosition;
        stand.style.cssText = "position:absolute;pointer-events:none;background:none";
        node.appendChild(stand);
        applyPseudoGeometry(node, stand);
      }
    }
  }

  function rescan(): void {
    materializeSvg();
    materializePseudo();
    for (const rule of options.sprites) {
      let nodes: NodeListOf<Element>;
      try {
        nodes = document.querySelectorAll(rule.selector);
      } catch {
        // An unselectable rule (a pseudo-element, a typo) must not take the whole
        // scan down with it — every other sprite would silently stop converting.
        continue;
      }
      for (const node of nodes) if (node instanceof HTMLElement) adopt(node, rule);
    }
  }

  const surface = document.createElement("div");
  surface.className = "quake-glyph-ui";
  surface.setAttribute("aria-hidden", "true");
  surface.style.position = "absolute";
  surface.style.inset = "0";
  surface.style.pointerEvents = "none";
  surface.style.overflow = "hidden";
  hostEl.insertBefore(surface, hostEl.firstChild);

  /**
   * Hue-preserving tone lift for the final cell grid — see the `gamma` option.
   *
   * Runs on hex strings, so results are memoized: a frame has tens of
   * thousands of cells but only a few hundred distinct colours (the sources
   * are palettized Quake art), and the map is stable across frames.
   */
  const gamma = Math.min(1, Math.max(0.2, options.gamma ?? 1));
  const liftCache = new Map<string, string>();
  function liftCellColors(grid: { char: string[]; color: (string | null)[] }): void {
    if (gamma >= 1) return;
    const colors = grid.color;
    for (let i = 0; i < colors.length; i++) {
      const hex = colors[i];
      if (!hex) continue;
      let lifted = liftCache.get(hex);
      if (lifted === undefined) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        if (luma <= 0) lifted = hex;
        else {
          // Scale toward the curve's target luminance, but never past the point
          // where the largest channel would clip — that cap is what keeps a
          // bright bronze from washing to white.
          const scale = Math.min(
            (255 * Math.pow(luma / 255, gamma)) / luma,
            255 / Math.max(r, g, b),
          );
          const h = (v: number) => Math.round(v * scale).toString(16).padStart(2, "0");
          lifted = `#${h(r)}${h(g)}${h(b)}`;
        }
        liftCache.set(hex, lifted);
      }
      colors[i] = lifted;
    }
  }

  const camera = createGlyphOrthographicCamera({ rotX: 0, rotY: 0, zoom: 1 });
  const scene = createGlyphScene(surface, {
    mode: "solid",
    glyphPalette: options.glyphPalette ?? "detail",
    useColors: true,
    // Same encoder the world overlay uses: one text node of PUA code points
    // painted by the COLR/CPAL colour font, instead of a <span> per colour run.
    colorEncoding: options.colorEncoding ?? "atlas",
    autoSize: true,
    doubleSided: true,
    camera,
    // Flat art: the glyph must track texel luminance, not a light rig.
    // Tone-lift the art's cell colours FIRST, then stamp the DOM text — the
    // text's colours are authored for the screen already and must not shift.
    transformCells: (grid) => { liftCellColors(grid); stampText(grid); },
    directionalLight: { direction: [0, 0, 1], intensity: 0 },
    ambientLight: { intensity: Math.max(0, options.ambient ?? 1.4) },
  });

  const meshes = new Map<number, { setPolygons(p: Polygon[]): void; dispose(): void }>();
  let lastKey = "";

  /**
   * Draw the page's text into the rasterized grid.
   *
   * Runs inside the render, on the final `CellGrid`, so the words land in the
   * SAME `<pre>` as the art rather than sitting above it as DOM. Each element's
   * screen box maps to a cell and its characters are written across from there,
   * so the text keeps the layout CSS already computed for it.
   */
  function stampText(grid: { cols: number; rows: number; char: string[]; color: (string | null)[] }): void {
    const selectors = options.textSelectors;
    if (!selectors?.length) return;
    const box = hostEl.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const cw = box.width / grid.cols;
    const ch = box.height / grid.rows;

    for (const selector of selectors) {
      let nodes: NodeListOf<Element>;
      try { nodes = document.querySelectorAll(selector); } catch { continue; }
      for (const node of nodes) {
        if (!(node instanceof HTMLElement)) continue;
        const text = node.textContent;
        if (!text) continue;
        const r = node.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const style = getComputedStyle(node);
        if (style.visibility === "hidden" || style.display === "none") continue;
        const col = Math.round((r.left - box.left) / cw);
        const row = Math.round((r.top - box.top + r.height / 2) / ch);
        if (row < 0 || row >= grid.rows) continue;
        const colour = rgbToHex(style.color);
        for (let i = 0; i < text.length; i++) {
          const c = col + i;
          if (c < 0 || c >= grid.cols) continue;
          const glyph = text[i]!;
          if (glyph === " ") continue;   // don't punch holes in the art behind
          const idx = row * grid.cols + c;
          grid.char[idx] = glyph;
          grid.color[idx] = colour;
        }
      }
    }
  }

  /** Polygons grouped by detail density — one glyphcss mesh per group. */
  function buildPolygons(hostBox: DOMRect): Map<number, Polygon[]> {
    const groups = new Map<number, Polygon[]>();
    // World units are CSS px (zoom is pinned to 1 below), with the origin at the
    // host's centre — so a sprite's screen box maps straight into world space.
    const cx = hostBox.width / 2;
    const cy = hostBox.height / 2;

    let i = 0;
    for (const s of states.values()) {
      const index = i++;
      if (!s.natural || !s.url) continue;
      const box = s.sprite.element.getBoundingClientRect();
      if (!box.width || !box.height) continue;

      const left = box.left - hostBox.left;
      const top = box.top - hostBox.top;
      // X is screen-DOWN, Y is screen-RIGHT.
      const x0 = top - cy, x1 = top + box.height - cy;
      const y0 = left - cx, y1 = left + box.width - cx;
      const z = (s.sprite.layer ?? index) * LAYER_STEP;

      const fit = s.sprite.fit ?? (s.isImg ? "contain" : "cover");
      let u0 = 0, u1 = 1, v0 = 0, v1 = 1;
      const clipU = Number(s.sprite.element.dataset.glyphClipU ?? "1");
      const clipV = Number(s.sprite.element.dataset.glyphClipV ?? "1");
      if (fit === "css") {
        // Reproduce the element's own background mapping. Only the forms Quake
        // actually uses are handled — a percentage/`auto` size plus a
        // percentage position — and anything else falls through to `cover`.
        const cs = getComputedStyle(s.sprite.element);
        // A materialized pseudo carries its sheet window as data: its own
        // computed background is deliberately empty so the stand-in can never
        // paint as HTML.
        const ds = s.sprite.element.dataset;
        const bgSize = ds.glyphBgSize ?? cs.backgroundSize;
        const bgPos = ds.glyphBgPos ?? cs.backgroundPosition;
        const [sizeW, sizeH] = bgSize.split(" ");
        const scale = sizeW.endsWith("%")
          ? (box.width * (parseFloat(sizeW) / 100)) / s.natural.w
          : sizeW.endsWith("px")
            ? parseFloat(sizeW) / s.natural.w
            : box.width / s.natural.w;
        const drawnW = s.natural.w * scale;
        const drawnH = (sizeH && sizeH.endsWith("px") ? parseFloat(sizeH) : s.natural.h * scale);
        // Visible fraction of the source along each axis.
        const fu = Math.min(1, box.width / drawnW);
        const fv = Math.min(1, box.height / drawnH);
        // `background-position` percentage aligns the leftover, not the origin:
        // 0% pins the top/left, 100% the bottom/right.
        const [posX, posY] = bgPos.split(" ");
        const px = posX?.endsWith("%") ? parseFloat(posX) / 100 : 0;
        const py = posY?.endsWith("%") ? parseFloat(posY) / 100 : 0;
        u0 = (1 - fu) * px; u1 = u0 + fu;
        v0 = (1 - fv) * py; v1 = v0 + fv;
      } else if (fit === "cover") {
        // Crop the overflowing axis, centred — CSS `background-size: cover`.
        const boxAspect = box.width / box.height;
        const imgAspect = s.natural.w / s.natural.h;
        if (imgAspect > boxAspect) {
          const f = boxAspect / imgAspect;
          u0 = (1 - f) / 2; u1 = (1 + f) / 2;
        } else {
          const f = imgAspect / boxAspect;
          v0 = (1 - f) / 2; v1 = (1 + f) / 2;
        }
      }

      const level = Math.max(0, Math.min(1, s.sprite.brightness ?? 1));
      const channel = Math.round(255 * level).toString(16).padStart(2, "0");
      const tint = `#${channel}${channel}${channel}`;
      const bucket = Math.max(1, Math.round(s.sprite.density ?? 1));
      const target = groups.get(bucket) ?? groups.set(bucket, []).get(bucket)!;

      // Segmented art emits a tight quad per connected opaque region instead of
      // one rectangle, so the transparent gaps between letters belong to no quad
      // and a detail layer cannot blank the backdrop through them.
      if (s.regions) {
        const spanU = u1 - u0, spanV = v1 - v0;
        for (const r of s.regions) {
          // Region UVs are in SOURCE space; fold them through this sprite's own
          // visible window so a sheet-cropped sprite still lands correctly.
          const ru0 = u0 + r.u0 * spanU, ru1 = u0 + r.u1 * spanU;
          // The quad's V axis is INVERTED relative to image space: the base
          // mapping puts `v1` on the TOP edge. For a full-size quad that cancels
          // out, but a sub-region has to flip explicitly or every letter comes
          // out mirrored vertically.
          const rvTop = v1 - r.v0 * spanV;
          const rvBot = v1 - r.v1 * spanV;
          // And place it proportionally inside the element's box.
          const rx0 = x0 + (x1 - x0) * r.v0, rx1 = x0 + (x1 - x0) * r.v1;
          const ry0 = y0 + (y1 - y0) * r.u0, ry1 = y0 + (y1 - y0) * r.u1;
          target.push({
            vertices: [[rx0, ry0, z], [rx0, ry1, z], [rx1, ry1, z], [rx1, ry0, z]],
            texture: s.url,
            uvs: [[ru0, rvTop], [ru1, rvTop], [ru1, rvBot], [ru0, rvBot]],
            color: tint,
          } as unknown as Polygon);
        }
        continue;
      }

      target.push({
        vertices: [[x0, y0, z], [x0, y1, z], [x1, y1, z], [x1, y0, z]],
        texture: s.url,
        uvs: [[u0, v1], [u1, v1], [u1, v0], [u0, v0]],
        // Doubles as this sprite's brightness tint — see `brightness` on the rule.
        color: tint,
      } as unknown as Polygon);
    }
    return groups;
  }

  /**
   * Rebuild geometry at most this often (ms). Sprite art is static: it moves on
   * resize, on a menu selection, and when new sprites appear — none of which
   * need per-frame attention. Without this, every sync walked every sprite's
   * `getBoundingClientRect()` and rebuilt the polygon list once per frame, which
   * is what took the menu from 120fps to 14fps.
   */
  const REBUILD_INTERVAL_MS = 100;
  let lastBuildAt = 0;
  let trailingSync: ReturnType<typeof setTimeout> | null = null;

  function sync(force = false): void {
    const hostBox = hostEl.getBoundingClientRect();
    if (!hostBox.width || !hostBox.height) return;
    // Stand-ins are sized from their host's live `::before`, which resolves
    // differently once a hidden panel opens — refresh before measuring anything.
    refreshPseudoGeometry();
    const now = performance.now();
    if (!force && !adoptedSinceDraw && now - lastBuildAt < REBUILD_INTERVAL_MS) {
      // DEFER, never drop. Returning here lost the update entirely: hovering a
      // menu item changes its `background-position` to the highlighted frame,
      // and if that sync landed inside the throttle window the new frame was
      // never drawn — the selection appeared frozen even though the DOM had
      // already moved.
      if (!trailingSync) {
        trailingSync = setTimeout(() => { trailingSync = null; sync(); },
                                  REBUILD_INTERVAL_MS - (now - lastBuildAt));
      }
      return;
    }
    if (trailingSync) { clearTimeout(trailingSync); trailingSync = null; }
    lastBuildAt = now;

    // Cell grows until the grid fits the budget: cells = area / (aspect * px^2).
    const fitted = Math.sqrt((hostBox.width * hostBox.height) / (CELL_ASPECT * maxCells));
    const cellPx = Math.max(minCellPx, fitted);
    surface.style.fontSize = `${cellPx}px`;
    surface.style.lineHeight = `${cellPx}px`;
    scene.fit();

    // World units ARE CSS px, so the ortho camera maps 1:1 and every sprite's
    // box can be used verbatim above.
    camera.zoom = 1;

    const groups = buildPolygons(hostBox);
    if (!groups.size) return;

    // Cheap change key: only the numbers that can move. Hashing whole polygon
    // arrays with JSON.stringify was itself slow enough to stall startup.
    let key = "";
    for (const [density, polys] of groups) {
      key += "d" + density + ":";
      for (const poly of polys) {
        const v = poly as unknown as { vertices: number[][]; uvs: number[][] };
        key += v.vertices[0]![0]!.toFixed(1) + "," + v.vertices[0]![1]!.toFixed(1) + ","
          + v.vertices[2]![0]!.toFixed(1) + "," + v.vertices[2]![1]!.toFixed(1) + ","
          + v.uvs[0]![0]!.toFixed(3) + "," + v.uvs[0]![1]!.toFixed(3) + ";";
      }
    }
    if (key === lastKey && !adoptedSinceDraw) return;   // nothing moved or joined
    lastKey = key;
    adoptedSinceDraw = false;

    // Update meshes IN PLACE. Disposing and re-adding restarts glyphcss's async
    // texture load, so every rebuild renders untextured until the images return —
    // seen as the UI blinking on menu selection, and as a grid of `$` in
    // `#ffffff` when rebuilds outpace the loads.
    for (const [density, polys] of groups) {
      const existing = meshes.get(density);
      if (existing) existing.setPolygons(polys);
      else meshes.set(density, scene.add(polys, density > 1
        // `transparent: true` is what makes density usable here. An OPAQUE detail
        // layer blanks every base cell under its box via glyphcss's shared
        // occlusion id-map, so a sprite with a transparent margin punches a hole
        // through the backdrop. A transparent one does not occlude at all, so the
        // art composites over the base grid exactly as it does at density 1 —
        // just sampled finer. (The world overlay uses the same flag for entities.)
        ? { density, transparent: true }
        : undefined));
    }
    // A density group can empty out (its sprites' panel closed).
    for (const [density, mesh] of meshes) {
      if (!groups.has(density)) { mesh.dispose(); meshes.delete(density); }
    }
    scene.rerender();
  }

  // A sprite draws only once its source size is known. Redraws are coalesced
  // into one rAF: the boot log adopts hundreds of glyphs in a burst and must not
  // trigger a render each.
  let syncQueued = false;
  function queueSync(): void {
    if (syncQueued) return;
    syncQueued = true;
    requestAnimationFrame(() => { syncQueued = false; sync(); });
  }

  function resolveNatural(state: SpriteState): void {
    const el = state.sprite.element as HTMLImageElement;
    if (state.isImg && el.naturalWidth) {
      state.natural = { w: el.naturalWidth, h: el.naturalHeight };
      if (state.sprite.segment) state.regions = segmentOpaqueRegions(el);
      queueSync();
      return;
    }
    const probe = new Image();
    probe.onload = () => {
      state.natural = { w: probe.naturalWidth || 1, h: probe.naturalHeight || 1 };
      if (state.sprite.segment) state.regions = segmentOpaqueRegions(probe);
      queueSync();
    };
    probe.src = state.url;
  }

  const onResize = () => sync(true);
  window.addEventListener("resize", onResize);
  const boxObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => queueSync()) : null;
  boxObserver?.observe(hostEl);

  // One observer, two jobs: adopt sprites created after startup, and follow the
  // class toggle that swaps a menu label between its normal and highlighted
  // frames. Scoped to the HOST, not `document.body` — the game toggles classes on
  // body constantly during play, and every one of those was costing a full
  // rescan plus a rebuild of every sprite's geometry. Measured: 120fps -> 14fps.
  //
  // `class`/`childList` only, never `style`: sync() writes inline styles inside
  // this subtree, so watching them would retrigger itself forever.
  const domObserver = typeof MutationObserver !== "undefined"
    ? new MutationObserver((records) => {
        // Adoption only matters when nodes were actually ADDED; a class flip on
        // an existing element cannot introduce a new sprite.
        if (records.some((r) => r.addedNodes.length > 0)) rescan();
        queueSync();
      })
    : null;
  // childList only, and on body because sprites are built all over the page.
  // Attributes are deliberately NOT watched: the game toggles classes constantly
  // during play, and observing them body-wide cost more than the render did
  // (measured: 120fps -> 7fps).
  domObserver?.observe(document.body, { subtree: true, childList: true });

  // A `css`-fit sprite's visible frame comes from its live `background-position`
  // — the menu selection moves by toggling a class on an ANCESTOR, which no
  // affordable observer scope catches (the menu lives under `#quake-menu`, not
  // under this overlay's host). Poll just those few elements instead: it is a
  // handful of `getComputedStyle` reads, versus a body-wide attribute observer.
  let frameWatch: ReturnType<typeof setInterval> | null = null;
  let lastFrames = "";
  function watchSheetFrames(): void {
    let signature = "";
    for (const st of states.values()) {
      if (st.sprite.fit !== "css") continue;
      const cs = getComputedStyle(st.sprite.element);
      signature += cs.backgroundPosition + "|" + cs.backgroundSize + ";";
    }
    if (signature === lastFrames) return;
    lastFrames = signature;
    sync(true);
  }
  frameWatch = setInterval(watchSheetFrames, 100);

  rescan();
  queueSync();


  if (import.meta.env?.DEV) {
    // Dev handle for interaction experiments (hotspot-hosted inputs/buttons).
    (window as unknown as { __quakeGlyphUiScene?: unknown }).__quakeGlyphUiScene = scene;
  }

  return {
    element: surface,
    sync,
    dispose(): void {
      window.removeEventListener("resize", onResize);
      if (frameWatch) clearInterval(frameWatch);
      if (trailingSync) clearTimeout(trailingSync);
      boxObserver?.disconnect();
      domObserver?.disconnect();
      for (const m of meshes.values()) m.dispose();
      meshes.clear();
      scene.destroy();
      surface.remove();
      for (const s of states.values()) {
        if (s.isImg) s.sprite.element.style.visibility = "";
        else s.sprite.element.style.backgroundImage = "";
      }
    },
  };
}
