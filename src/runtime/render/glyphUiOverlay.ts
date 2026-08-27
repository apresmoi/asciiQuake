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

export interface QuakeGlyphUiOverlayOptions {
  /** Element the shared grid covers — its box is the ASCII canvas. */
  readonly host: HTMLElement;
  readonly sprites: readonly QuakeGlyphUiSprite[];
  /** Ceiling on total cells; the cell grows until the grid fits. */
  readonly maxCells?: number;
  /** Smallest cell in px. The floor on how fine the art can get. */
  readonly minCellPx?: number;
  readonly glyphPalette?: string;
}

export interface QuakeGlyphUiOverlay {
  readonly element: HTMLElement;
  sync(): void;
  dispose(): void;
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

interface SpriteState {
  readonly sprite: QuakeGlyphUiSprite;
  readonly isImg: boolean;
  readonly url: string;
  natural: { w: number; h: number } | null;
}

export function createQuakeGlyphUiOverlay(
  options: QuakeGlyphUiOverlayOptions,
): QuakeGlyphUiOverlay {
  const { host: hostEl } = options;
  const maxCells = Math.max(256, options.maxCells ?? DEFAULT_MAX_CELLS);
  const minCellPx = Math.max(2, options.minCellPx ?? DEFAULT_MIN_CELL_PX);

  function readUrl(el: HTMLElement, isImg: boolean): string {
    if (isImg) return (el as HTMLImageElement).currentSrc || (el as HTMLImageElement).src;
    const bg = getComputedStyle(el).backgroundImage;
    return /url\((["']?)(.*?)\1\)/.exec(bg)?.[2] ?? "";
  }

  // Capture every URL BEFORE hiding any art: hiding clears `background-image`,
  // and reading it afterwards yields "none".
  const states: SpriteState[] = options.sprites.map((sprite) => {
    const isImg = sprite.element instanceof HTMLImageElement;
    return { sprite, isImg, url: readUrl(sprite.element, isImg), natural: null };
  });

  const surface = document.createElement("div");
  surface.className = "quake-glyph-ui";
  surface.setAttribute("aria-hidden", "true");
  surface.style.position = "absolute";
  surface.style.inset = "0";
  surface.style.pointerEvents = "none";
  surface.style.overflow = "hidden";
  hostEl.insertBefore(surface, hostEl.firstChild);

  for (const s of states) {
    if (s.isImg) s.sprite.element.style.visibility = "hidden";
    else s.sprite.element.style.backgroundImage = "none";
  }

  const camera = createGlyphOrthographicCamera({ rotX: 0, rotY: 0, zoom: 1 });
  const scene = createGlyphScene(surface, {
    mode: "solid",
    glyphPalette: options.glyphPalette ?? "detail",
    useColors: true,
    autoSize: true,
    doubleSided: true,
    camera,
    // Flat art: the glyph must track texel luminance, not a light rig.
    directionalLight: { direction: [0, 0, 1], intensity: 0 },
    ambientLight: { intensity: 1 },
  });

  let mesh: { dispose(): void } | null = null;

  function buildPolygons(hostBox: DOMRect): Polygon[] {
    const polys: Polygon[] = [];
    // World units are CSS px (zoom is pinned to 1 below), with the origin at the
    // host's centre — so a sprite's screen box maps straight into world space.
    const cx = hostBox.width / 2;
    const cy = hostBox.height / 2;

    states.forEach((s, i) => {
      if (!s.natural || !s.url) return;
      const box = s.sprite.element.getBoundingClientRect();
      if (!box.width || !box.height) return;

      const left = box.left - hostBox.left;
      const top = box.top - hostBox.top;
      // X is screen-DOWN, Y is screen-RIGHT.
      const x0 = top - cy, x1 = top + box.height - cy;
      const y0 = left - cx, y1 = left + box.width - cx;
      const z = (s.sprite.layer ?? i) * LAYER_STEP;

      const fit = s.sprite.fit ?? (s.isImg ? "contain" : "cover");
      let u0 = 0, u1 = 1, v0 = 0, v1 = 1;
      if (fit === "css") {
        // Reproduce the element's own background mapping. Only the forms Quake
        // actually uses are handled — a percentage/`auto` size plus a
        // percentage position — and anything else falls through to `cover`.
        const cs = getComputedStyle(s.sprite.element);
        const [sizeW, sizeH] = cs.backgroundSize.split(" ");
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
        const [posX, posY] = cs.backgroundPosition.split(" ");
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

      polys.push({
        vertices: [[x0, y0, z], [x0, y1, z], [x1, y1, z], [x1, y0, z]],
        texture: s.url,
        uvs: [[u0, v1], [u1, v1], [u1, v0], [u0, v0]],
        color: "#ffffff",
      } as unknown as Polygon);
    });
    return polys;
  }

  function sync(): void {
    const hostBox = hostEl.getBoundingClientRect();
    if (!hostBox.width || !hostBox.height) return;

    // Cell grows until the grid fits the budget: cells = area / (aspect * px^2).
    const fitted = Math.sqrt((hostBox.width * hostBox.height) / (CELL_ASPECT * maxCells));
    const cellPx = Math.max(minCellPx, fitted);
    surface.style.fontSize = `${cellPx}px`;
    surface.style.lineHeight = `${cellPx}px`;
    scene.fit();

    // World units ARE CSS px, so the ortho camera maps 1:1 and every sprite's
    // box can be used verbatim above.
    camera.zoom = 1;

    const polys = buildPolygons(hostBox);
    mesh?.dispose();
    mesh = polys.length ? scene.add(polys) : null;
    scene.rerender();
  }

  // Natural sizes gate the UV maths; resolve them all, then draw once.
  let pending = states.length;
  const done = () => { if (--pending <= 0) sync(); };
  for (const s of states) {
    if (!s.url) { done(); continue; }
    const el = s.sprite.element as HTMLImageElement;
    if (s.isImg && el.naturalWidth) {
      s.natural = { w: el.naturalWidth, h: el.naturalHeight };
      done();
      continue;
    }
    const probe = new Image();
    probe.onload = () => { s.natural = { w: probe.naturalWidth || 1, h: probe.naturalHeight || 1 }; done(); };
    probe.onerror = done;
    probe.src = s.url;
  }

  const onResize = () => sync();
  window.addEventListener("resize", onResize);
  // Menu panels mount hidden, so a sprite's box is 0x0 until its panel opens.
  const boxObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => sync()) : null;
  if (boxObserver) {
    boxObserver.observe(hostEl);
    for (const s of states) boxObserver.observe(s.sprite.element);
  }
  // A `css`-fit sprite's UV window comes from its computed background, and the
  // menu swaps `background-position` by toggling a class on an ANCESTOR
  // (`.quake-main-menu-item-active`). Watch class changes across the host so the
  // highlighted frame actually follows the selection.
  const classObserver = states.some((s) => s.sprite.fit === "css") && typeof MutationObserver !== "undefined"
    ? new MutationObserver(() => sync())
    : null;
  classObserver?.observe(hostEl, { subtree: true, attributes: true, attributeFilter: ["class"] });
  requestAnimationFrame(sync);

  return {
    element: surface,
    sync,
    dispose(): void {
      window.removeEventListener("resize", onResize);
      boxObserver?.disconnect();
      classObserver?.disconnect();
      mesh?.dispose();
      scene.destroy();
      surface.remove();
      for (const s of states) {
        if (s.isImg) s.sprite.element.style.visibility = "";
        else s.sprite.element.style.backgroundImage = "";
      }
    },
  };
}
