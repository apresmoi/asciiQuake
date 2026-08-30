import { createGlyphOrthographicCamera, createGlyphScene, quantizeGlyphAtlasPalette, type GlyphFontAtlas } from "glyphcss";
import type { Polygon } from "@layoutit/polycss";
import {
  remapQuakeInkGlyphsToAscii,
  type QuakeGlyphUiSceneMode,
} from "../app/asciiGlyphPolicy";
import {
  QUAKE_MENU_SCENE_FRAME_W,
  QUAKE_MENU_SCENE_FRAME_H,
  QUAKE_CONSOLE_GAP,
  QUAKE_CONSOLE_GLYPH,
  QUAKE_CONSOLE_LEFT,
  QUAKE_CONSOLE_PITCH,
  QUAKE_CONSOLE_PROGRESS_H,
  QUAKE_CONSOLE_TOP,
  QUAKE_MENU_LEVEL_CODE_X,
  QUAKE_MENU_LEVEL_TITLE_X,
  QUAKE_MENU_MP_FAILURE_TEXTS,
  quakeConsoleProgressWidth,
  quakeMenuLevelRowY,
  quakeMenuSceneFrame,
  quakeMenuSceneHotspotsFor,
  quakeMenuVersionPos,
  quakeNotifyLayout,
  type QuakeMenuSceneManifest,
  type QuakeMenuSceneSpriteDef,
  type QuakeMenuSceneTextDef,
} from "./menuSceneManifest";
import { getQuakeMenuSceneState, subscribeQuakeMenuSceneState } from "../menuSceneState";
import { QUAKE_HUD_SLOT_DEFINITIONS, QUAKE_HUD_STATUS_ROW_Y } from "../hud";
import {
  QUAKE_HUD_BACKGROUND,
  QUAKE_HUD_BASE_URL,
  QUAKE_HUD_CROSSHAIR_GRID,
  QUAKE_HUD_CROSSHAIR_SHEET,
  QUAKE_HUD_CROSSHAIR_VARIANTS,
  QUAKE_HUD_DIGIT_FRAMES,
  QUAKE_HUD_DIGIT_W,
  QUAKE_HUD_ICONS_SHEET_H,
  QUAKE_HUD_ICONS_SHEET_W,
  QUAKE_HUD_ICONS_URL,
  QUAKE_HUD_NUMBERS_DAMAGE_URL,
  QUAKE_HUD_NUMBERS_URL,
  QUAKE_HUD_READOUTS,
  QUAKE_HUD_SCENE_FRAME_H,
  QUAKE_HUD_SCENE_FRAME_W,
  quakeHudCrosshairSize,
  quakeHudSceneFrame,
} from "./hudSceneManifest";

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
  /** Per-mesh style tag — see {@link QuakeGlyphUiSpriteRule.styleTag}. */
  readonly styleTag?: string;
}

/** Matches sprites by selector, so elements created LATER are still adopted. */
export interface QuakeGlyphUiSpriteRule {
  readonly selector: string;
  readonly layer?: number;
  readonly fit?: "cover" | "contain" | "css";
  /**
   * Per-mesh STYLE tag: quads with the same tag form their own glyphcss mesh
   * (named by the tag), styled by the overlay's `meshStyles[tag]` — its own
   * glyph palette and tone, nothing else's. See {@link QuakeGlyphMeshStyle}.
   */
  readonly styleTag?: string;
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
   * Published after every render: the scene's opaque per-cell coverage (the
   * segmented menu art, the HUD art, the crosshair — everything that owns the
   * shared occlusion id-map; text and unsegmented sprites excluded), or `null`
   * when nothing opaque is on screen. The app feeds it to the WORLD overlay's
   * `setUiOcclusion`, joining the two stacked scenes into one occlusion
   * domain: the world blanks under the Esc menu exactly the way the landing
   * backdrop blanks under the same art.
   */
  readonly onCoverage?: (coverage: import("glyphcss").GlyphOcclusionCoverage | null) => void;
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
   *
   * Applies to the ART (detail) layers only — the backdrop has its own curve,
   * {@link backdropGamma}. One shared curve was tried first and broke the
   * depth cue: `transformCells` runs once per glyphcss layer, and a sub-1
   * exponent lifts dark cells proportionally MORE than bright ones, so the
   * deliberately-dim backdrop gained more than the art and read as sitting in
   * front of the menu (measured: art:backdrop luminance ratio 2.5 -> 1.6).
   */
  readonly gamma?: number;
  /**
   * Tone-curve exponent for the BACKDROP (the base, density-1 layer) —
   * same curve as {@link gamma}, separate strength. Keeping this milder than
   * `gamma` preserves the front/back separation while still lifting the
   * backdrop out of the murk. Defaults to `gamma` (uniform lift).
   */
  readonly backdropGamma?: number;
  /**
   * Levels for the ART (detail) layers, applied to the tone curve's target
   * luminance: `t' = (t - blackPoint) / (whitePoint - blackPoint)`, clamped.
   * Raising the black point crushes near-black cells to true black; lowering
   * the white point pushes the art's brights to full — together they are the
   * dynamic-range stretch the gamma curve alone cannot express (a sub-1
   * gamma only ever LIFTS, so the composite reads flat: nothing on screen is
   * actually black and nothing is actually bright). Defaults 0/1 = off.
   * `?glyphImageBlack=` / `?glyphImageWhite=`.
   */
  readonly blackPoint?: number;
  readonly whitePoint?: number;
  /** Same levels for the BACKDROP (base) layer — the lever for "the menu's
   *  range is lost": the backdrop's midtone noise floor is what a black
   *  point crushes. `?glyphImageBackdropBlack=` / `?glyphImageBackdropWhite=`. */
  readonly backdropBlackPoint?: number;
  readonly backdropWhitePoint?: number;
  /**
   * Ink-coverage compensation strength, 0..1 (default 0 = off). Applied to
   * the ART/TEXT detail layers after their tone lift.
   *
   * An ASCII cell's perceived luminance is its colour TIMES its glyph's ink
   * coverage: a sparse ramp character (`.`, `:`, `-`) inks a small fraction
   * of its cell, so the eye averages that ink against the black ground and
   * the cell reads far darker than its nominal colour — the measured reason
   * the conchars text quads (thin 1px strokes → sparse glyphs) looked dim
   * next to the dense-glyph art around them. Compensation scales each cell's
   * RGB up in inverse proportion to its glyph's coverage (bounded, hue-
   * preserving, capped so no channel clips), so perceived luminance tracks
   * the intended colour; glyphs that already fill their cell get ~1.0 and
   * dense areas do not blow out. Coverage per glyph is measured ONCE on a
   * canvas and memoized — never per cell per frame.
   *
   * Deliberately NOT applied to the base (backdrop) layer: the backdrop's
   * sparse glyphs are the art/backdrop depth cue, and compensating them
   * would lift the backdrop back into the art's range.
   */
  readonly inkCompensation?: number;
  /**
   * Brightness of the text conchars sheet — a hue-preserving gamma below 1,
   * exactly like {@link gamma} but applied ONCE to the sheet the text quads
   * sample rather than to rendered cells. Scoped to text because only the text
   * path samples this sheet, so raising it cannot touch the art or backdrop.
   * `?glyphImageTextGamma=`.
   */
  readonly textGamma?: number;
  /**
   * Saturation of that same sheet. 1 leaves it alone; above 1 pushes each
   * channel away from the pixel's luma, which is what "more vibrant" means
   * here — brightness alone washes toward grey because Quake's conchars are
   * near-neutral to begin with. `?glyphImageTextSaturation=`.
   */
  readonly textSaturation?: number;
  readonly glyphPalette?: string;
  /**
   * PER-MESH palette + tone overrides, keyed by style tag (a manifest sprite's
   * `styleTag`, or a sprite rule's). Quads carrying a tag are grouped into
   * their own glyphcss mesh named by the tag, and:
   *
   *  - `palette` rasterizes that mesh against its OWN glyph ramp (glyphcss's
   *    per-mesh `glyphPalette`, additive in the linked build). The scene's
   *    ramp is attached when the style declares none, which also guarantees
   *    the styled mesh gets its own layer even at density 1.
   *  - `ambient` is the mesh's EFFECTIVE ambient, passed to glyphcss as the
   *    mesh's own `ambientIntensity` (additive in the linked build): glyph
   *    choice AND raster colours land exactly where a scene-wide ambient of
   *    that value would put them. (The old tint-ratio scheme is gone —
   *    measured, the texture path never fed the material tint into glyph
   *    choice.) `colorBoost` optionally rescales the colours post-raster to
   *    replay the glyph lab's residual — see its doc.
   *  - `gamma`/`saturation`/`black`/`white`/`inkComp` replace the art-layer
   *    lift for that mesh's grid in `transformCells` (identified by
   *    glyphcss's layer info); `strokePx` restyles the mesh's own `<pre>`;
   *    `sheetGamma`/`sheetSaturation` pick a pre-lifted conchars variant for
   *    the style's text runs; `occlusionMode`/`occlusionPad` shape its id-map
   *    claim.
   *
   * Shipped use (2026-08 retune): the corner logo, the shared conchars "text"
   * profile (boot console + menu rows), the menu plaque, the title art and
   * the landing label sheets each carry one user-tuned row while the
   * remaining art and the backdrop keep the scene-wide tone.
   */
  readonly meshStyles?: Readonly<Record<string, QuakeGlyphMeshStyle>>;
  /**
   * Art-layer vibrancy (1 = neutral). Composed after the art `gamma` lift,
   * exactly like {@link textSaturation} for the conchars sheet: each channel
   * is pushed away from the cell's own luma. Never touches the backdrop or
   * the text sheet. `?glyphImageSaturation=`.
   */
  readonly saturation?: number;
  /**
   * `-webkit-text-stroke` width (px) for the scene surface. ASCII letterforms
   * ink only a fraction of their cell — at this overlay's detail-layer font
   * sizes (~2px) barely a fifth — so the art reads far darker than the same
   * colours in a solid render. The sub-pixel stroke fattens every glyph while
   * COLR atlas output keeps per-glyph palette colours (and span output keeps
   * per-span colours via currentColor). Measured against the cssquake.wtf
   * reference menu: +50-90% perceived luminance, hue preserved. 0 disables.
   * `?glyphImageStroke=` overrides.
   */
  readonly strokePx?: number;
  /** Final-string encode strategy. Defaults to `atlas`, as the world does. */
  readonly colorEncoding?: "atlas" | "spans";
  /**
   * Font atlas the `atlas` encoding maps against. The app passes glyphcss's
   * ASCII-only variant (94 printable-ASCII glyphs, 68 palette slots vs the
   * universal atlas's 212/30). This UI renders nothing but `detail`-ramp
   * ASCII, and the 30-slot budget was the measured cause of the menu art's
   * desaturation and its page-to-page colour shift: a full screen of backdrop
   * greys outvoted the art's bronzes in the median cut, and every navigation
   * retrained the palette. 68 slots more than doubles the colour resolution
   * the same quantizer works with.
   */
  readonly fontAtlas?: GlyphFontAtlas;
  /**
   * Selectors whose `::before` art is MATERIALIZED into a real element so it can
   * be converted. A pseudo-element cannot be selected or measured —
   * `querySelectorAll` never returns it and it has no `getBoundingClientRect` —
   * so the overlay is blind to it and it keeps painting as HTML. The panel
   * plaque and every menu button's selection cursor are authored this way.
   */
  readonly pseudoSelectors?: readonly string[];
  /**
   * Texture URL per pseudo selector, read when the pseudo's own computed
   * `background-image` is blanked by the suppressing CSS.
   */
  readonly pseudoTextures?: Readonly<Record<string, string>>;
  /**
   * Declarative menu scene. Screens listed here render from DATA — geometry
   * from the manifest's 320x200 frame, visibility/selection from the shared
   * menu scene state — with no DOM reads at all. Screens NOT in the manifest
   * keep being discovered through the selector rules above, which is what
   * makes the migration stageable: the landing menu can be manifest-driven
   * while the panels are still traced.
   */
  readonly menu?: QuakeMenuSceneManifest;
  /**
   * glyphcss render mode for the WHOLE UI scene (default "solid" — the
   * shipped path, byte-identical when omitted). "ink" (silhouette/crease
   * edges) and "wireframe" (palette-tier strokes) exist for the glyph lab's
   * render-mode comparison. ASCII policy: sanitize upstream through
   * `sanitizeQuakeGlyphUiSceneMode` — ink is legal only because this
   * overlay's `transformCells` hook remaps ink's five non-ASCII oriented
   * glyphs to ASCII before encoding (see QUAKE_INK_ASCII_GLYPH_REMAP), and
   * wireframe only because `wireframeJunctions` is never enabled here.
   */
  readonly sceneMode?: QuakeGlyphUiSceneMode;
  /**
   * Draw the gameplay HUD (status bar art, icons, digit readouts, crosshair)
   * even while the menu chrome is up. Shipped behavior (`undefined`/false):
   * the HUD renders only in-game (`state.chrome === false` and no blocking
   * body class). The glyph lab sets this to preview the complete landing
   * screen with the HUD bar composited in.
   */
  readonly forceHud?: boolean;
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
  /**
   * Text rendered as ART: each matched element's characters become textured
   * quads sampling Quake's conchars sheet (one 8x8 glyph cell per character),
   * instead of being stamped as grid characters.
   *
   * This is the SIZED text path — the fix for text whose size is authored by
   * CSS (`--quake-bitmap-glyph-size`: 12..40px) rather than by the grid. A
   * stamped character occupies exactly one grid cell (~8px), so stamping the
   * boot log, the panel labels and the multiplayer form shrank them all to a
   * third of their size and broke their alignment with the art around them
   * (the measured regression). A conchars quad keeps the exact box layout
   * gave the character, so size, alignment and wrapping all match the HTML
   * rendering this replaces — while the paint stays in the glyph scene.
   *
   * Rules are matched FIRST WINS per element, so a specific rule (the
   * display-size titles) can override the catch-all run rule without
   * emitting the element twice. `brightness` scales the sheet's texels the
   * same way sprite rules do; the element's own accumulated CSS `opacity`
   * and `filter: brightness()` — the disabled-row dim and the hover lift —
   * are folded in per element on top of it.
   *
   * `glyphScale` sizes the drawn glyph INSIDE its layout cell (default 1 =
   * fill the cell). A conchars glyph inks nearly its whole 8x8 cell, while
   * the character cells this path replaces held browser glyphs with real
   * air around them (a ~10px cap in a 16px cell) — so at scale 1 the text
   * reads optically LARGER than the shipped look and adjacent lines nearly
   * touch (the measured "font is bigger than it should" break). ~0.8 draws
   * each glyph centred at the size the shipped text inked.
   * Elements matched here are excluded from `textSelectors` stamping.
   */
  readonly textArt?: readonly {
    selector: string;
    layer: number;
    density?: number;
    brightness?: number;
    glyphScale?: number;
  }[];
  /** Detail density for MANIFEST text (`?glyphImageTextDensity=`), default 10 —
   *  same meaning as a textArt rule's `density`. */
  readonly manifestTextDensity?: number;
  /** Detail density for the BOOT CONSOLE text alone
   *  (`?glyphImageConsoleDensity=`), defaulting to `manifestTextDensity`.
   *  The boot log is the largest text block on screen and the one the shared
   *  density shortchanges most visibly; a separate knob lets it be raised
   *  without paying for every menu row. */
  readonly consoleTextDensity?: number;
}

/** Quake's console character sheet: a 16x16 grid of glyph cells; the high bit
 *  selects the brown "alt" variant baked into the lower half. */
const CONCHARS_URL = "/q/conchars.png";
const CONCHARS_GRID = 16;
/** 1x1 opaque white PNG — the texture for SOLID quads (progress bar, input
 *  borders): the rasterizer needs a texture, and a white texel times the
 *  quad's tint IS the flat colour. */
const SOLID_TEXTURE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4//8/AwAI/AL+p5qgoAAAAABJRU5ErkJggg==";
/** Spinner cursor frames: conchars cells 12 and 13, 250ms each — the CSS
 *  `quake-menu-option-cursor-frame` animation as data. */
const SPINNER_FRAME_MS = 250;
const SPINNER_GLYPHS = [12, 13] as const;
function spinnerGlyph(now: number): number {
  return SPINNER_GLYPHS[Math.floor(now / SPINNER_FRAME_MS) % SPINNER_GLYPHS.length]!;
}

/** One mesh's style override — see {@link QuakeGlyphUiOverlayOptions.meshStyles}. */
export interface QuakeGlyphMeshStyle {
  /** Glyph ramp palette name (sanitize upstream — ASCII-only policy). */
  readonly palette?: string;
  /**
   * Effective ambient for this mesh — passed to glyphcss as the mesh's OWN
   * `ambientIntensity` (additive in the linked build), so glyph choice AND
   * raster colours track it exactly as a scene-wide ambient of this value
   * would. (The old tint-ratio mechanism is gone: measured, the texture
   * path's tint never drove glyph choice — see emitQuad.) Scene ambient when
   * omitted.
   */
  readonly ambient?: number;
  /** Tone-curve exponent for this mesh's grid (art `gamma` when omitted). */
  readonly gamma?: number;
  /** Vibrancy for this mesh's grid (art `saturation` when omitted). */
  readonly saturation?: number;
  /** Levels for this mesh's grid (art black/white points when omitted). */
  readonly black?: number;
  readonly white?: number;
  /**
   * Post-raster linear colour scale (clip-capped, hue-preserving; 1 = none).
   * Exists to reproduce the glyph lab's styled-branch residual — the lab
   * composes `logoAmbient(1.65) / scene ambient` over every sprite it
   * previews, so a game element tuned there at scene ambient A was SEEN with
   * colours ×(1.65/A). Set `max(1, 1.65/ambient)` to match that session.
   */
  readonly colorBoost?: number;
  /** Ink-coverage compensation strength for this mesh's grid (the scene's
   *  `inkCompensation` when omitted). */
  readonly inkComp?: number;
  /**
   * `-webkit-text-stroke` width (px) for this mesh's OWN `<pre>` (overrides
   * the inherited scene-wide `strokePx`). Applied via the layer's
   * `data-glyph-mesh-id` attribute (additive in the linked glyphcss build).
   */
  readonly strokePx?: number;
  /** Conchars-sheet tone for THIS style's text runs: the run samples a sheet
   *  variant pre-lifted with these instead of the scene's `textGamma` /
   *  `textSaturation`. Only meaningful for text-run styles (the boot
   *  console); art sprites never sample the sheet. */
  readonly sheetGamma?: number;
  readonly sheetSaturation?: number;
  /**
   * How this mesh claims cells in the shared occlusion id-map. The history
   * that shaped these modes (all user-adjudicated): rectangular plates around
   * whole labels were rejected; fully alpha-tight claims were rejected too —
   * they let the backdrop paint through every partial-alpha cell AND, at the
   * id-map's base-cell granularity, let an opaque backdrop STEAL a fine
   * mesh's boundary cells outright (measured on the corner logo: 215 of ~650
   * ink cells survived; the lab, with no backdrop, keeps them all).
   *
   *  - "alpha" (default): today's alpha-aware claims.
   *  - "plate": full triangle-footprint claims (glyphcss `occlusionClaim:
   *    "geometry"`) — a solid ground under the artwork's segmented regions.
   *  - "none": opt out entirely (`transparent: true`) — the backdrop paints
   *    through everywhere; kept as a comparison mode.
   */
  readonly occlusionMode?: "alpha" | "plate" | "none";
  /**
   * Contour margin in SCREEN PX (glyphcss `occlusionContourPx`, additive).
   * Any defined value — 0 included — switches the mesh to CONTOUR claims:
   * the id-map is rastered at a finer internal resolution so every output
   * cell containing this mesh's ink claims (the anti-theft guarantee), and
   * the margin is stamped around the ink in that fine map, so the ground
   * follows the artwork's alpha contour instead of growing whole ~10px base
   * cells (glyphcss's earlier `occlusionDilate` pad — measured as a fat
   * square-kernel halo, rejected, and dropped from the library in 0.1.6). The ground the backdrop actually loses is still
   * quantized to base cells — the id-map's hard floor — so margins below one
   * base cell differ only in which borderline cells claim. Ignored by
   * "none".
   */
  readonly occlusionMarginPx?: number;
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
  const manifestTextDensity = Math.max(1, Math.round(options.manifestTextDensity ?? 10));
  // Fractional on purpose (like the manifest densities): the console density
  // is matched EMPIRICALLY to the user's lab session, and rounding it broke
  // the match by up to 12% (glyphcss densities are fractional; see
  // glyphTuningSpec.ts's consoleDensity row).
  const consoleTextDensity = Math.max(1, options.consoleTextDensity ?? Math.round(manifestTextDensity));

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
        styleTag: rule.styleTag,
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
  // Coverage, not colour — see the `strokePx` option doc.
  const strokePx = Math.max(0, Math.min(2, options.strokePx ?? 0.6));
  if (strokePx > 0) surface.style.setProperty("-webkit-text-stroke", `${strokePx}px currentColor`);
  hostEl.insertBefore(surface, hostEl.firstChild);

  /**
   * Opaque ground under the status bar. A glyph layer alone cannot be opaque —
   * cells paint characters, and whatever sits behind the `<pre>` (during play,
   * the world's own ASCII) shows between the strokes. The HTML bar solved this
   * with `background: #050302` on `#quake-classic-hud`; this div is that same
   * ground, sized to the HUD frame each sync and stacked before the scene's
   * `<pre>`s so all glyphs draw above it.
   */
  const hudBacking = document.createElement("div");
  hudBacking.className = "quake-glyph-ui-hud-backing";
  hudBacking.style.cssText =
    `position:absolute;display:none;pointer-events:none;background:${QUAKE_HUD_BACKGROUND}`;
  hostEl.insertBefore(hudBacking, surface);

  /**
   * Hue-preserving tone lift for the final cell grid — see the `gamma` option.
   *
   * Runs on hex strings, so results are memoized: a frame has tens of
   * thousands of cells but only a few hundred distinct colours (the sources
   * are palettized Quake art), and the map is stable across frames.
   */
  // The scene's ambient intensity — also the denominator a style's per-mesh
  // `ambient` is expressed against (see `meshStyles` / emitQuad).
  const sceneAmbient = Math.max(0.0001, options.ambient ?? 1.4);
  const artGamma = Math.min(1, Math.max(0.2, options.gamma ?? 1));
  const backdropGamma = Math.min(1, Math.max(0.2, options.backdropGamma ?? artGamma));
  // Art-only vibrancy, composed after the gamma lift exactly like the text
  // sheet's saturation (push each channel away from the cell's own luma).
  // Measured against the reference menu: our lifted bronzes sat at R/G ~1.14
  // where the reference art reads ~1.37 — the quantized-and-lifted art keeps
  // its luminance but loses chroma, and this puts it back. The backdrop is
  // near-neutral concrete, so it stays un-saturated on purpose.
  // `?glyphImageSaturation=`.
  const artSaturation = Math.min(4, Math.max(0, options.saturation ?? 1.4));
  // Levels (see the `blackPoint`/`whitePoint` option docs): applied to the
  // curve's target luminance, per layer group like the gammas.
  const artBlack = Math.min(0.5, Math.max(0, options.blackPoint ?? 0));
  const artWhite = Math.min(1, Math.max(artBlack + 0.05, options.whitePoint ?? 1));
  const backdropBlack = Math.min(0.5, Math.max(0, options.backdropBlackPoint ?? 0));
  const backdropWhite = Math.min(1, Math.max(backdropBlack + 0.05, options.backdropWhitePoint ?? 1));
  const artLiftCache = new Map<string, string>();
  const backdropLiftCache = new Map<string, string>();
  /** One lift cache per styled mesh (tag → cache) — a style's gamma/saturation
   *  differ from the art layers', so its colours memoize separately and join
   *  the pinned-palette universe alongside them. */
  const styleLiftCaches = new Map<string, Map<string, string>>();
  function styleLiftCache(tag: string): Map<string, string> {
    let cache = styleLiftCaches.get(tag);
    if (!cache) styleLiftCaches.set(tag, (cache = new Map()));
    return cache;
  }
  function liftCellColors(
    grid: { char: string[]; color: (string | null)[] },
    gamma: number,
    liftCache: Map<string, string>,
    saturation = 1,
    black = 0,
    white = 1,
  ): void {
    if (gamma >= 1 && saturation === 1 && black <= 0 && white >= 1) return;
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
          // Target luminance: the gamma curve's output, then the levels
          // stretch — black point crushes the floor to true black, white
          // point pushes the top to full. Then scale toward that target, but
          // never past the point where the largest channel would clip — that
          // cap is what keeps a bright bronze from washing to white.
          const t = Math.min(1, Math.max(0,
            (Math.pow(luma / 255, gamma) - black) / (white - black)));
          const scale = Math.min(
            (255 * t) / luma,
            255 / Math.max(r, g, b),
          );
          let nr = r * scale, ng = g * scale, nb = b * scale;
          if (saturation !== 1) {
            const l = 0.2126 * nr + 0.7152 * ng + 0.0722 * nb;
            nr = l + (nr - l) * saturation;
            ng = l + (ng - l) * saturation;
            nb = l + (nb - l) * saturation;
          }
          const h = (v: number) =>
            Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
          lifted = `#${h(nr)}${h(ng)}${h(nb)}`;
        }
        liftCache.set(hex, lifted);
      }
      colors[i] = lifted;
    }
  }

  // PINNED atlas palette — same rationale as the world overlay's: the scene's
  // pooled quantizer trains on whatever happens to be on screen when its
  // drift/clock gates open, which both left the first render on a stale
  // palette and retrained on every navigation (the measured page-to-page
  // colour shift, and the backdrop outvoting the art's bronzes). This overlay
  // already memoizes every DISTINCT final colour it produces (the lift caches
  // above, plus the stamped DOM-text colours), so that union IS the colour
  // universe — quantize it once per growth spurt and pin it: stable across
  // screens, each distinct colour votes once (rare brights keep their slots).
  const pinnedPaletteBudget = Math.max(1, options.fontAtlas?.maxPaletteSize ?? 68);
  const stampedColors = new Set<string>();
  let paletteUniverseCount = -1;
  let uiPaletteTimer = 0;
  function styleCacheSizes(): number {
    let n = 0;
    for (const cache of styleLiftCaches.values()) n += cache.size;
    return n;
  }
  function schedulePinnedUiPalette(): void {
    if ((options.colorEncoding ?? "atlas") !== "atlas") return;
    const size = artLiftCache.size + backdropLiftCache.size + stampedColors.size + styleCacheSizes();
    // No lifted colours yet (identity gammas keep the caches empty): leave the
    // scene on its pooled quantizer rather than pinning a text-only palette.
    if (size === 0 || size === paletteUniverseCount || uiPaletteTimer) return;
    // Coalesce a screen's worth of new colours into one rebuild.
    uiPaletteTimer = window.setTimeout(() => {
      uiPaletteTimer = 0;
      const now = artLiftCache.size + backdropLiftCache.size + stampedColors.size + styleCacheSizes();
      if (now === paletteUniverseCount || !sceneApi) return;
      paletteUniverseCount = now;
      const colors = [...new Set([
        ...artLiftCache.values(),
        ...backdropLiftCache.values(),
        ...stampedColors,
        ...[...styleLiftCaches.values()].flatMap((cache) => [...cache.values()]),
      ])];
      sceneApi.setOptions({
        atlasPalette: quantizeGlyphAtlasPalette(colors.map(() => "x"), colors, colors.length, pinnedPaletteBudget),
      });
    }, 150);
  }

  /** Linear per-cell colour multiply (hue-preserving, capped so no channel
   *  clips), memoized like the lifts — the post-raster half of a per-mesh
   *  `ambient` that exceeds the scene's (see `meshStyles`). */
  function scaleGridColors(
    grid: { char: string[]; color: (string | null)[] },
    factor: number,
    cache: Map<string, string>,
  ): void {
    const colors = grid.color;
    for (let i = 0; i < colors.length; i++) {
      const hex = colors[i];
      if (!hex) continue;
      let scaled = cache.get(hex);
      if (scaled === undefined) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const max = Math.max(r, g, b);
        const f = max > 0 ? Math.min(factor, 255 / max) : 1;
        const h = (v: number) => Math.round(v * f).toString(16).padStart(2, "0");
        scaled = `#${h(r)}${h(g)}${h(b)}`;
        cache.set(hex, scaled);
      }
      colors[i] = scaled;
    }
  }

  /**
   * Ink-coverage compensation — see the `inkCompensation` option.
   *
   * Coverage is measured by rasterizing each glyph once into a monospace
   * cell (advance x font-size, the same aspect the `<pre>` renders) and
   * summing alpha; the factor for a glyph is `refCoverage / coverage`,
   * where the reference is the densest probe glyph, clamped to a bounded
   * boost. Strength interpolates the factor toward 1. Results memoize per
   * glyph and per (glyph, colour) pair, so a frame's cost is map lookups.
   */
  const inkCompStrength = Math.max(0, Math.min(1, options.inkCompensation ?? 0));
  const INK_COMP_MAX_BOOST = 3.5;
  const INK_COMP_PROBE_GLYPHS = "@#$%&MW80";
  const inkCoverageByGlyph = new Map<string, number>();
  const inkCompCache = new Map<string, string>();
  let inkCanvas: { ctx: CanvasRenderingContext2D; w: number; h: number } | null | undefined;
  let inkCoverageRef: number | null = null;

  function inkCoverageCanvas(): { ctx: CanvasRenderingContext2D; w: number; h: number } | null {
    if (inkCanvas !== undefined) return inkCanvas;
    try {
      const font = `32px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace`;
      const canvas = document.createElement("canvas");
      const probe = canvas.getContext("2d", { willReadFrequently: true });
      if (!probe) return (inkCanvas = null);
      probe.font = font;
      const w = Math.max(1, Math.ceil(probe.measureText("M").width));
      canvas.width = w;
      canvas.height = 32;
      // Sizing the canvas resets context state — set the font again.
      probe.font = font;
      probe.fillStyle = "#ffffff";
      probe.textBaseline = "alphabetic";
      inkCanvas = { ctx: probe, w, h: 32 };
    } catch {
      inkCanvas = null;
    }
    return inkCanvas;
  }

  function glyphInkCoverage(glyph: string): number {
    const cached = inkCoverageByGlyph.get(glyph);
    if (cached !== undefined) return cached;
    let coverage = 1;
    const c = inkCoverageCanvas();
    if (c) {
      c.ctx.clearRect(0, 0, c.w, c.h);
      c.ctx.fillText(glyph, 0, Math.round(c.h * 0.8));
      const data = c.ctx.getImageData(0, 0, c.w, c.h).data;
      let ink = 0;
      for (let i = 3; i < data.length; i += 4) ink += data[i]!;
      coverage = ink / (255 * c.w * c.h);
    }
    coverage = Math.max(coverage, 0.01);
    inkCoverageByGlyph.set(glyph, coverage);
    return coverage;
  }

  function inkCompFactor(glyph: string, strength: number): number {
    if (inkCoverageRef === null) {
      let ref = 0;
      for (const probe of INK_COMP_PROBE_GLYPHS) ref = Math.max(ref, glyphInkCoverage(probe));
      inkCoverageRef = Math.max(ref, 0.05);
    }
    const raw = Math.min(INK_COMP_MAX_BOOST, inkCoverageRef / glyphInkCoverage(glyph));
    return 1 + strength * (Math.max(1, raw) - 1);
  }

  /** `strengthOverride`: a styled mesh's own strength (see `meshStyles`);
   *  scene `inkCompensation` when omitted. */
  function compensateInkCoverage(grid: { char: string[]; color: (string | null)[] }, strengthOverride?: number): void {
    const strength = strengthOverride !== undefined
      ? Math.max(0, Math.min(1, strengthOverride))
      : inkCompStrength;
    if (strength <= 0) return;
    const chars = grid.char;
    const colors = grid.color;
    for (let i = 0; i < colors.length; i++) {
      const hex = colors[i];
      const glyph = chars[i];
      if (!hex || !glyph || glyph === " ") continue;
      const key = strength === inkCompStrength ? glyph + hex : `${strength}\u0000${glyph}${hex}`;
      let compensated = inkCompCache.get(key);
      if (compensated === undefined) {
        const factor = inkCompFactor(glyph, strength);
        if (factor <= 1.001) compensated = hex;
        else {
          const r = parseInt(hex.slice(1, 3), 16);
          const g = parseInt(hex.slice(3, 5), 16);
          const b = parseInt(hex.slice(5, 7), 16);
          const max = Math.max(r, g, b);
          // Hue-preserving: one shared scale, capped so no channel clips —
          // a boosted amber stays amber instead of washing to white.
          const scale = max > 0 ? Math.min(factor, 255 / max) : 1;
          const h = (v: number) => Math.round(v * scale).toString(16).padStart(2, "0");
          compensated = `#${h(r)}${h(g)}${h(b)}`;
        }
        inkCompCache.set(key, compensated);
      }
      colors[i] = compensated;
    }
  }

  /**
   * Whether a `transformCells` grid is the BASE layer's.
   *
   * glyphcss invokes the hook once per layer: the base render (the full-host
   * grid — here, the backdrop) and each detail layer (a bbox-clipped grid at
   * `base cell / density` — here, all the art, density > 1). The hook receives
   * no layer id, but the base grid's dimensions are exactly the scene's
   * live `cols`/`rows`, while a detail grid is its sprites' bounding box at
   * densityx resolution — for these menus never the same shape. (`sceneApi`
   * is null only for renders issued during scene construction, before any
   * mesh exists, when the only layer IS the base.)
   */
  let sceneApi: { getOptions(): { cols: number; rows: number } } | null = null;
  function isBaseGrid(grid: { cols: number; rows: number }): boolean {
    if (!sceneApi) return true;
    const opts = sceneApi.getOptions();
    return grid.cols === opts.cols && grid.rows === opts.rows;
  }

  /**
   * The HUD bar's tone, as a per-mesh ambient. The bar ships dimmed so the
   * readouts on top can separate from its busy texture — but the dim used to
   * ride the quad's material colour (`brightness: 0.55`), and glyphcss's
   * texture path folds ONLY texel luminance and the mesh's ambient into glyph
   * choice (see the measured note on emitQuad), so the tint never reached the
   * ramp. Measured (2026-08, isolated-mesh screenshots at 1280/1920/800):
   * the bar rendered DENSE at the scene ambient (3.0) while the dark digit
   * sheets rendered sparse — the exact inversion the dim was added to
   * prevent, seen as the readouts sitting in bright noise ("the alpha doesn't
   * seem right"). The dim now enters the raster as this mesh ambient, the
   * same channel every style-table row uses, dimming glyph choice AND colours.
   */
  const HUD_BAR_AMBIENT = 0.55;

  /**
   * Built-in style rows for meshes the per-element style TABLE does not own
   * (yet): the HUD draws its own sheets and its tone comes from code
   * constants, not an approved lab session. A `meshStyles` row with the same
   * tag (a future lab-tuned HUD profile) overrides the built-in wholesale.
   */
  const BUILTIN_MESH_STYLES: Readonly<Record<string, QuakeGlyphMeshStyle>> = {
    "hud-bar": { ambient: HUD_BAR_AMBIENT },
  };
  /** The style for a tagged mesh: the style table's row, else the built-in. */
  function meshStyle(tag: string | undefined): QuakeGlyphMeshStyle | undefined {
    if (tag === undefined) return undefined;
    return options.meshStyles?.[tag] ?? BUILTIN_MESH_STYLES[tag];
  }

  const camera = createGlyphOrthographicCamera({ rotX: 0, rotY: 0, zoom: 1 });
  // ASCII policy note: `wireframeJunctions` must NEVER be passed here — the
  // junction resolve pass is glyphcss's one wireframe path that emits
  // box-drawing (non-ASCII) glyphs. The policy test asserts this file never
  // names the option.
  const sceneMode: QuakeGlyphUiSceneMode = options.sceneMode ?? "solid";
  const scene = createGlyphScene(surface, {
    mode: sceneMode,
    glyphPalette: options.glyphPalette ?? "detail",
    useColors: true,
    // Same encoder the world overlay uses: one text node of PUA code points
    // painted by the COLR/CPAL colour font, instead of a <span> per colour run.
    colorEncoding: options.colorEncoding ?? "atlas",
    fontAtlas: options.fontAtlas,
    autoSize: true,
    doubleSided: true,
    camera,
    // Flat art: the glyph must track texel luminance, not a light rig.
    // Runs once per LAYER (see `isBaseGrid`): the backdrop gets its own,
    // milder curve so the art keeps reading as sitting in front of it, and
    // DOM text — whose coordinate math and screen-authored colours assume the
    // full-host grid — is stamped into the base grid only, AFTER its lift.
    transformCells: (grid, layer) => {
      // Ink mode's ASCII guarantee (asciiGlyphPolicy.ts): the ink rasterizer
      // draws from a fixed oriented set with five non-ASCII members, so every
      // ink grid is remapped to ASCII stand-ins BEFORE any other cell work.
      // This hook runs once per layer on the final glyph buffer — nothing
      // encodes without passing through it.
      if (sceneMode === "ink") remapQuakeInkGlyphsToAscii(grid.char);
      // A STYLED mesh's grid gets its own tone: glyphcss names each detail
      // layer with its mesh id (the style tag), so this is exact per-mesh
      // identification, not a shape heuristic. Levels and ink compensation
      // stay the art layers' — only ambient overflow, gamma and saturation
      // are overridden (see `meshStyles`).
      const styledMesh = layer?.mesh;
      const style = meshStyle(styledMesh);
      if (style && styledMesh !== undefined) {
        // The raster already ran under the style's own ambient (glyphcss
        // per-mesh `ambientIntensity`). `colorBoost` is the only linear scale
        // left up here — the lab-session residual (see its doc), applied
        // BEFORE the tone curve, hue-preserving and clip-capped.
        const boost = style.colorBoost ?? 1;
        if (boost > 1.001) scaleGridColors(grid, boost, styleLiftCache(styledMesh + "\u0000amb"));
        liftCellColors(
          grid,
          Math.min(1, Math.max(0.2, style.gamma ?? artGamma)),
          styleLiftCache(styledMesh),
          Math.min(4, Math.max(0, style.saturation ?? artSaturation)),
          Math.min(0.5, Math.max(0, style.black ?? artBlack)),
          Math.min(1, Math.max(0.05, style.white ?? artWhite)),
        );
        compensateInkCoverage(grid, style.inkComp);
      } else if (isBaseGrid(grid)) {
        liftCellColors(grid, backdropGamma, backdropLiftCache, 1, backdropBlack, backdropWhite);
        stampText(grid);
      } else {
        liftCellColors(grid, artGamma, artLiftCache, artSaturation, artBlack, artWhite);
        // Detail layers only: the backdrop's sparse glyphs are a deliberate
        // depth cue, so the base grid is never coverage-compensated.
        compensateInkCoverage(grid);
      }
      schedulePinnedUiPalette();
    },
    directionalLight: { direction: [0, 0, 1], intensity: 0 },
    ambientLight: { intensity: sceneAmbient },
  });
  sceneApi = scene;

  const meshes = new Map<string, { setPolygons(p: Polygon[]): void; dispose(): void }>();
  let lastKey = "";

  /** `#rrggbb` scaled by a 0..1 factor — approximates the CSS `opacity` that
   *  dims disabled rows, which a stamped cell colour cannot express directly. */
  function scaleHex(hex: string, factor: number): string {
    if (factor >= 1) return hex;
    const h = (o: number) =>
      Math.round(parseInt(hex.slice(o, o + 2), 16) * factor).toString(16).padStart(2, "0");
    return `#${h(1)}${h(3)}${h(5)}`;
  }

  /**
   * Draw the page's text into the rasterized grid.
   *
   * Runs inside the render, on the final `CellGrid`, so the words land in the
   * SAME `<pre>` as the art rather than sitting above it as DOM. Each matched
   * element is one single-row RUN of text (`.quake-bitmap-run`, built by
   * bitmapText in ASCII mode): its screen box maps to a starting cell and its
   * characters are written across from there, one per cell, so the text keeps
   * the layout CSS already computed for it while the paint happens here.
   *
   * `visibility: hidden` elements are stamped ON PURPOSE — that is exactly how
   * the runs are authored (the CSS hides them so the grid is their only
   * painter, while their boxes keep driving layout and hit targets). Collapsed
   * panels never stamp because `display: none` zeroes their boxes.
   */
  function stampText(grid: { cols: number; rows: number; char: string[]; color: (string | null)[] }): void {
    const selectors = options.textSelectors;
    if (!selectors?.length) return;
    const box = hostEl.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const cw = box.width / grid.cols;
    const ch = box.height / grid.rows;

    /** Write one run of characters at (row, col), skipping spaces so the art
     *  behind keeps its cells. Returns the column after the last character. */
    const write = (row: number, col: number, text: string, colour: string): number => {
      stampedColors.add(colour);
      if (row < 0 || row >= grid.rows) return col + text.length;
      for (let i = 0; i < text.length; i++) {
        const c = col + i;
        if (c < 0 || c >= grid.cols) continue;
        const raw = text[i]!;
        if (raw === " ") continue;   // don't punch holes in the art behind
        // ASCII-only policy (see asciiGlyphPolicy.ts): this is the ONE path
        // that writes a DOM-sourced character straight into a cell, so a
        // non-ASCII char must degrade here — "?" — never reach the grid.
        const glyph = raw.codePointAt(0)! < 0x80 ? raw : "?";
        const idx = row * grid.cols + c;
        grid.char[idx] = glyph;
        grid.color[idx] = colour;
      }
      return col + text.length;
    };

    /** Effective colour: computed colour times the accumulated `opacity` that
     *  dims disabled rows — the compositor applied it for HTML, a stamped cell
     *  must fold it into the colour. The dimming classes sit on the row or its
     *  immediate wrappers, so a short ancestor walk suffices. */
    const runColour = (node: HTMLElement, style: CSSStyleDeclaration): string => {
      let opacity = parseFloat(style.opacity) || 1;
      let ancestor = node.parentElement;
      for (let depth = 0; ancestor && depth < 6; depth++, ancestor = ancestor.parentElement) {
        const o = parseFloat(getComputedStyle(ancestor).opacity);
        if (o < 1) opacity *= o;
      }
      return scaleHex(rgbToHex(style.color), opacity);
    };

    for (const selector of selectors) {
      let nodes: NodeListOf<Element>;
      try { nodes = document.querySelectorAll(selector); } catch { continue; }

      /**
       * Word runs are REFLOWED per visual line, not stamped at their own boxes.
       * The HTML lays words out for 16px character cells while a grid cell is
       * a third of that, so stamping each word at its own box position tears a
       * sentence apart with giant gaps (measured: "QUAKE      (C)      1996").
       * Instead, runs are grouped by their `.quake-bitmap-text` container and
       * visual line (box top), and each line's words are written contiguously
       * from the line's own starting cell with single spaces between them —
       * the container keeps its position and its wrap points, the words keep
       * grid-correct spacing.
       */
      const lines = new Map<string, { row: number; col: number; parts: { text: string; colour: string }[] }>();
      let lineSeq = 0;
      const lineKeys = new Map<Element, Map<number, string>>();

      for (const node of nodes) {
        if (!(node instanceof HTMLElement)) continue;
        // Rendered as conchars art instead — see `textArt`.
        if (options.textArt?.some((rule) => { try { return node.matches(rule.selector); } catch { return false; } })) continue;
        let text = node.textContent;
        if (!text || !text.trim()) continue;
        const r = node.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const style = getComputedStyle(node);
        if (style.display === "none") continue;
        if (style.textTransform === "uppercase") text = text.toUpperCase();
        const colour = runColour(node, style);
        const col = Math.round((r.left - box.left) / cw);
        const row = Math.round((r.top - box.top + r.height / 2) / ch);

        const container = node.closest(".quake-bitmap-text");
        if (!container) {
          // Plain text element (the version tag): stamp at its own box.
          write(row, col, text, colour);
          continue;
        }
        let byRow = lineKeys.get(container);
        if (!byRow) lineKeys.set(container, (byRow = new Map()));
        let key = byRow.get(row);
        if (key === undefined) {
          key = String(lineSeq++);
          byRow.set(row, key);
          lines.set(key, { row, col, parts: [] });
        }
        lines.get(key)!.parts.push({ text, colour });
      }

      for (const line of lines.values()) {
        let col = line.col;
        for (let i = 0; i < line.parts.length; i++) {
          const part = line.parts[i]!;
          col = write(line.row, col, part.text, part.colour);
          // Single space between words — except after an email's user half,
          // whose split is purely a wrap affordance, not a word break.
          if (!part.text.endsWith("@")) col += 1;
        }
      }
    }
  }

  /**
   * Polygons grouped into one glyphcss mesh per (density, occluding) pair.
   *
   * Segmented density sprites go in an OPAQUE mesh: their quads hug the art's
   * opaque regions, so glyphcss's occlusion id-map blanks the backdrop only
   * under the artwork itself — the art sits on black exactly like a world
   * entity, and the bright backdrop cannot leak through the letterforms.
   * UNSEGMENTED density sprites stay in a `transparent` mesh (no occlusion):
   * for a full-rectangle quad, occluding would punch the rectangular black
   * box around the art that transparency was added to fix. So a sprite whose
   * segmentation fails degrades to the leak, never to the box.
   */
  interface PolyGroup { density: number; transparent: boolean; styleTag?: string; polys: Polygon[] }

  /** Everything one textured quad needs, source-agnostic: the DOM tracer and
   *  the manifest renderer both funnel through here, so grouping, occlusion
   *  policy and the segmented emission behave identically for both.
   *
   *  `u0..v1` is the visible source window in IMAGE space — v grows DOWN the
   *  image, exactly like `background-position` percentages and the segmenter's
   *  region boxes. glyphcss samples OBJ-style (v = 0 at the image's BOTTOM),
   *  so emission flips V once, here and only here. The previous code flipped
   *  by assigning the window's raw values to swapped corners, which is only
   *  equivalent for full or centre-symmetric windows (v0 + v1 = 1) — every
   *  full-image sprite and `cover` crop rendered fine while a sprite SHEET's
   *  asymmetric frame window drew the mirror-image frame: measured on the
   *  landing labels as the active item showing the sheet's NORMAL frame, and
   *  on the single-player panel as NEW GAME/LOAD/SAVE drawing in reverse
   *  order. */
  interface QuadEmit {
    x0: number; x1: number; y0: number; y1: number; z: number;
    url: string;
    u0: number; u1: number; v0: number; v1: number;
    regions: { u0: number; v0: number; u1: number; v1: number }[] | null;
    density: number;
    brightness: number;
    /** Explicit tint (a SOLID quad's flat colour); overrides the grey. */
    tint?: string;
    /** Style-override tag — see `meshStyles`. Tagged quads get their own mesh. */
    styleTag?: string;
  }

  function emitQuad(groups: Map<string, PolyGroup>, q: QuadEmit): void {
    // A style's `ambient` no longer rides the tint. MEASURED (2026-08, glyph
    // histograms at 1600×900): glyphcss's texture path folds ONLY the texel's
    // luminance into glyph choice — the quad's material colour tints the cell
    // colour and never the character — so the old tint-ratio scheme silently
    // did nothing to the ramp. Per-mesh ambient now enters the raster itself
    // via glyphcss's per-mesh `ambientIntensity` (see the styled transform in
    // sync()), which drives glyph choice AND colours exactly like a scene
    // ambient of that value. The tint carries only the sprite's brightness.
    const level = Math.max(0, Math.min(1, q.brightness));
    const channel = Math.round(255 * level).toString(16).padStart(2, "0");
    const tint = q.tint ?? `#${channel}${channel}${channel}`;
    const spanU = q.u1 - q.u0, spanV = q.v1 - q.v0;
    const segmented = !!q.regions && q.density > 1 && spanU > 0 && spanV > 0;
    // A tagged quad's mesh is its own: the tag joins the key so the mesh can
    // carry its per-mesh palette and be identified by the transformCells hook.
    const key = `d${q.density}${q.density > 1 && !segmented ? "t" : ""}${q.styleTag ? `/${q.styleTag}` : ""}`;
    const target = (groups.get(key)
      ?? groups.set(key, {
        density: q.density,
        transparent: q.density > 1 && !segmented,
        ...(q.styleTag ? { styleTag: q.styleTag } : {}),
        polys: [],
      }).get(key)!)
      .polys;

    // Segmented art emits a tight quad per connected opaque region instead of
    // one rectangle, so the transparent gaps between letters belong to no quad
    // and the occlusion id-map cannot blank the backdrop through them.
    if (segmented) {
      for (const r of q.regions!) {
        // Region UVs are ABSOLUTE source coordinates, but only the part inside
        // this sprite's visible window exists on screen — a sprite SHEET's
        // hidden frame contributes regions too, and drawing those would stamp
        // both frames into the box. Clip to the window, then work in
        // window-relative fractions.
        const cu0 = Math.max(r.u0, q.u0), cu1 = Math.min(r.u1, q.u1);
        const cv0 = Math.max(r.v0, q.v0), cv1 = Math.min(r.v1, q.v1);
        if (cu0 >= cu1 || cv0 >= cv1) continue;
        const fu0 = (cu0 - q.u0) / spanU, fu1 = (cu1 - q.u0) / spanU;
        const fv0 = (cv0 - q.v0) / spanV, fv1 = (cv1 - q.v0) / spanV;
        // Place the region proportionally inside the element's box; the screen
        // TOP of the region samples the image row `cv0`, flipped into the
        // sampler's bottom-up V (see the QuadEmit doc).
        const rx0 = q.x0 + (q.x1 - q.x0) * fv0, rx1 = q.x0 + (q.x1 - q.x0) * fv1;
        const ry0 = q.y0 + (q.y1 - q.y0) * fu0, ry1 = q.y0 + (q.y1 - q.y0) * fu1;
        target.push({
          vertices: [[rx0, ry0, q.z], [rx0, ry1, q.z], [rx1, ry1, q.z], [rx1, ry0, q.z]],
          texture: q.url,
          uvs: [[cu0, 1 - cv0], [cu1, 1 - cv0], [cu1, 1 - cv1], [cu0, 1 - cv1]],
          color: tint,
        } as unknown as Polygon);
      }
      return;
    }

    target.push({
      vertices: [[q.x0, q.y0, q.z], [q.x0, q.y1, q.z], [q.x1, q.y1, q.z], [q.x1, q.y0, q.z]],
      texture: q.url,
      // Screen top (x0) samples image row v0 — flipped into bottom-up V.
      uvs: [[q.u0, 1 - q.v0], [q.u1, 1 - q.v0], [q.u1, 1 - q.v1], [q.u0, 1 - q.v1]],
      // Doubles as this sprite's brightness tint — see `brightness` on the rule.
      color: tint,
    } as unknown as Polygon);
  }

  /**
   * Texture facts for MANIFEST sprites, keyed by URL — the manifest's stand-in
   * for the DOM tracer's per-element `SpriteState`. Resolved once per texture:
   * natural size for UV math, opaque regions for segmented occlusion.
   */
  interface MenuTextureState {
    natural: { w: number; h: number } | null;
    regions: { u0: number; v0: number; u1: number; v1: number }[] | null;
  }
  const menuTextures = new Map<string, MenuTextureState>();
  function menuTexture(url: string, segment: boolean): MenuTextureState {
    let tex = menuTextures.get(url);
    if (!tex) {
      const created: MenuTextureState = { natural: null, regions: null };
      tex = created;
      menuTextures.set(url, created);
      const probe = new Image();
      probe.onload = () => {
        created.natural = { w: probe.naturalWidth || 1, h: probe.naturalHeight || 1 };
        if (segment) created.regions = segmentOpaqueRegions(probe);
        adoptedSinceDraw = true; // new art: redraw past the throttle and change key
        queueSync();
      };
      probe.src = url;
    }
    return tex;
  }

  /** The manifest cursor's current sheet frame — a pure function of the clock,
   *  so the frame watcher can tick the spin without any DOM reads. */
  function menuAnimationFrame(def: QuakeMenuSceneSpriteDef, now: number): number {
    if (!def.animate || !def.sheet) return 0;
    return Math.floor(now / (def.animate.periodMs / def.sheet.frames)) % def.sheet.frames;
  }

  /**
   * Draw the declarative menu scene — geometry from the manifest, visibility
   * and selection from the shared menu scene state. No DOM is consulted: this
   * is the inversion of the tracer above, and screens covered here must NOT
   * also appear in the selector rules.
   */
  function emitMenuScene(groups: Map<string, PolyGroup>, hostBox: DOMRect): void {
    const manifest = options.menu;
    if (!manifest) return;
    const st = getQuakeMenuSceneState();
    const cx = hostBox.width / 2;
    const cy = hostBox.height / 2;
    const now = performance.now();

    const drawSprite = (
      def: QuakeMenuSceneSpriteDef,
      box: { x: number; y: number; w: number; h: number },
    ): void => {
      if (box.w <= 0 || box.h <= 0) return;
      const tex = menuTexture(def.texture, !!def.segment);
      if (!tex.natural) return; // draws on the sync queued by the probe
      const disabled = !!def.item && st.disabledItems.includes(def.item);
      const isActive = !!def.item && def.item === st.activeItem && !disabled;
      let frame = def.frame ?? 0;
      if (def.role === "cursor") {
        // The selection cursor exists only on the active item, and never while
        // the menu is pending (matching the old CSS's pending rule).
        if (!isActive || st.pending) return;
        frame = menuAnimationFrame(def, now);
      } else if (def.role === "label" && isActive) {
        frame = 1; // the sheet's highlighted frame
      }
      let u0 = 0, u1 = 1, v0 = 0, v1 = 1;
      if (def.sheet) {
        const f0 = frame / def.sheet.frames;
        const f1 = (frame + 1) / def.sheet.frames;
        if (def.sheet.axis === "y") { v0 = f0; v1 = f1; }
        else { u0 = f0; u1 = f1; }
      } else if (def.fit === "cover" && tex.natural) {
        // Crop the overflowing axis, centred — CSS `background-size: cover`.
        const boxAspect = box.w / box.h;
        const imgAspect = tex.natural.w / tex.natural.h;
        if (imgAspect > boxAspect) {
          const f = boxAspect / imgAspect;
          u0 = (1 - f) / 2; u1 = (1 + f) / 2;
        } else {
          const f = imgAspect / boxAspect;
          v0 = (1 - f) / 2; v1 = (1 + f) / 2;
        }
      }
      let brightness = def.brightness ?? 1;
      if (def.item && (st.pending || disabled)) brightness *= manifest.dimmedBrightness;
      emitQuad(groups, {
        x0: box.y - cy, x1: box.y + box.h - cy,
        y0: box.x - cx, y1: box.x + box.w - cx,
        z: def.layer * LAYER_STEP,
        url: def.texture, u0, u1, v0, v1,
        regions: tex.regions,
        // Fractional on purpose: glyphcss detail cells are base/density with
        // no rounding, and the logo's shipped density is 1.472 (see the
        // manifest's logo def).
        density: Math.max(1, def.density ?? 1),
        brightness,
        styleTag: def.styleTag,
      });
    };

    // Chrome: host-anchored, up whenever the loading overlay is (the state's
    // `chrome` flag mirrors it). NOT whenever the host is visible — the host is
    // persistent now, and the in-game Esc menu draws its sprites straight over
    // the world with no backdrop, exactly as the HTML menu painted.
    if (st.chrome) {
      for (const def of manifest.chrome) {
        if (def.place) drawSprite(def, def.place(hostBox.width, hostBox.height));
      }
    }

    const screenDef = st.screen && !st.deferred ? manifest.screens[st.screen] : undefined;
    if (!screenDef) return;
    // The multiplayer FAILURE card replaces the form on a bare card with no
    // plaque or header (the CSS hides both) — draw no panel art there.
    if (st.screen === "multiplayer" && st.multiplayerFailure) return;
    const frame = quakeMenuSceneFrame(hostBox.width, hostBox.height);
    const sx = frame.w / QUAKE_MENU_SCENE_FRAME_W;
    const sy = frame.h / QUAKE_MENU_SCENE_FRAME_H;
    for (const def of screenDef.sprites) {
      if (!def.rect) continue;
      drawSprite(def, {
        x: frame.x + def.rect.x * sx,
        y: frame.y + def.rect.y * sy,
        w: def.rect.w * sx,
        h: def.rect.h * sy,
      });
    }
  }

  /**
   * Whether the gameplay HUD may draw. The slot/readout/crosshair CONTENT is
   * pure scene-state data, but overall visibility follows the same body
   * classes that gated the HTML HUD (`quake.css` hides `#quake-classic-hud`
   * under each of these) — they are toggled from half a dozen flows, so the
   * overlay reads them directly rather than plumbing six more mirrors. The
   * classes are folded into the frame watcher's signature below, so a flip
   * redraws within its 100ms poll.
   */
  function hudBodyClassesAllow(): boolean {
    const cl = document.body.classList;
    return (
      !cl.contains("quake-loading") &&
      !cl.contains("quake-menu-unlocked") &&
      !cl.contains("quake-dead") &&
      !cl.contains("quake-level-complete")
    );
  }

  /** HUD densities, per element as the elements need them. The BAR art spans
   *  most of the viewport width — density 2 keeps its detail layer inside a
   *  sane cell count where 4 would not, and its role is a dark ground anyway.
   *  The icons, digits and crosshair are small and must read: density 4. */
  const HUD_BAR_DENSITY = 2;
  const HUD_ART_DENSITY = 4;
  // The bar's dim itself lives in HUD_BAR_AMBIENT (a per-mesh ambient via the
  // "hud-bar" built-in style): a material-colour dim never reaches glyph
  // choice, so dimming through `brightness` left the bar dense — see the
  // constant's doc for the measurements.

  /**
   * The gameplay HUD — the classic status bar and the crosshair — drawn from
   * the scene state's `hud` slice and hud.ts's slot definition table, in the
   * same glyph scene as everything else. Geometry comes from hudSceneManifest
   * (the shipped CSS's sizing rules as data); no HUD DOM is read.
   */
  function emitHudScene(groups: Map<string, PolyGroup>, hostBox: DOMRect): void {
    const st = getQuakeMenuSceneState();
    // `forceHud` (the glyph lab's landing+HUD preview) bypasses both gates;
    // the shipped path is untouched when the option is absent.
    if (!options.forceHud && (st.chrome || !hudBodyClassesAllow())) return;
    const hud = st.hud;
    const cx = hostBox.width / 2;
    const cy = hostBox.height / 2;
    const frame = quakeHudSceneFrame(hostBox.width, hostBox.height);
    const s = frame.w / QUAKE_HUD_SCENE_FRAME_W;

    /** One quad in hud units (320x24 frame) with an explicit source window. */
    const quad = (
      x: number, y: number, w: number, h: number,
      url: string, u0: number, u1: number, v0: number, v1: number,
      layer: number, density: number, styleTag?: string,
    ): void => {
      const tex = menuTexture(url, true);
      if (!tex.natural) return; // draws on the sync queued by the probe
      emitQuad(groups, {
        x0: frame.y + y * s - cy, x1: frame.y + (y + h) * s - cy,
        y0: frame.x + x * s - cx, y1: frame.x + (x + w) * s - cx,
        z: layer * LAYER_STEP,
        url, u0, u1, v0, v1,
        regions: tex.regions,
        density,
        brightness: 1,
        ...(styleTag ? { styleTag } : {}),
      });
    };

    // The bar art (`hud-base.png`), the full 320x24 frame, dimmed as a ground
    // through its mesh's own ambient (the "hud-bar" built-in style row).
    quad(
      0, 0, QUAKE_HUD_SCENE_FRAME_W, QUAKE_HUD_SCENE_FRAME_H, QUAKE_HUD_BASE_URL,
      0, 1, 0, 1, 1, HUD_BAR_DENSITY, "hud-bar",
    );

    // Visible slots, from hud.ts's own definition table. The HTML frame is
    // shifted up one row height and clipped by the bar's `overflow: hidden`,
    // which today clips the inventory-row slots (keys/powerups) out entirely —
    // reproduced here by skipping anything above the bar.
    for (const id of hud.slots) {
      const def = QUAKE_HUD_SLOT_DEFINITIONS.find((d) => d.id === id);
      if (!def) continue;
      const y = def.y - QUAKE_HUD_STATUS_ROW_Y;
      if (y + def.height <= 0) continue;
      quad(
        def.x, y, def.width, def.height,
        QUAKE_HUD_ICONS_URL,
        def.sourceX / QUAKE_HUD_ICONS_SHEET_W,
        (def.sourceX + def.width) / QUAKE_HUD_ICONS_SHEET_W,
        def.sourceY / QUAKE_HUD_ICONS_SHEET_H,
        (def.sourceY + def.height) / QUAKE_HUD_ICONS_SHEET_H,
        2, HUD_ART_DENSITY,
      );
    }

    // The readouts: three 24-wide digit cells each, sheet frame per digit.
    // The health readout swaps to the damage sheet while the cue is active.
    for (const readout of QUAKE_HUD_READOUTS) {
      const value = readout.id === "armor" ? hud.armor : readout.id === "health" ? hud.health : hud.ammo;
      const url = readout.id === "health" && hud.damage
        ? QUAKE_HUD_NUMBERS_DAMAGE_URL
        : QUAKE_HUD_NUMBERS_URL;
      for (let i = 0; i < 3; i++) {
        const char = value[i] ?? " ";
        if (char < "0" || char > "9") continue;
        const digit = char.charCodeAt(0) - 48;
        quad(
          readout.x + i * QUAKE_HUD_DIGIT_W, 0, QUAKE_HUD_DIGIT_W, QUAKE_HUD_SCENE_FRAME_H,
          url,
          digit / QUAKE_HUD_DIGIT_FRAMES, (digit + 1) / QUAKE_HUD_DIGIT_FRAMES,
          0, 1,
          3, HUD_ART_DENSITY,
        );
      }
    }

    // The crosshair: a conchars-sheet cell centred on the EXACT host centre,
    // offset by the variant's own centring translate (from the CSS).
    const variant = QUAKE_HUD_CROSSHAIR_VARIANTS[hud.crosshair];
    if (variant) {
      const size = quakeHudCrosshairSize(hostBox.height);
      const tex = menuTexture(QUAKE_HUD_CROSSHAIR_SHEET, true);
      if (tex.natural) {
        const left = hostBox.width / 2 + variant.tx * size;
        const top = hostBox.height / 2 + variant.ty * size;
        emitQuad(groups, {
          x0: top - cy, x1: top + size - cy,
          y0: left - cx, y1: left + size - cx,
          z: 4 * LAYER_STEP,
          url: QUAKE_HUD_CROSSHAIR_SHEET,
          u0: variant.col / QUAKE_HUD_CROSSHAIR_GRID,
          u1: (variant.col + 1) / QUAKE_HUD_CROSSHAIR_GRID,
          v0: variant.row / QUAKE_HUD_CROSSHAIR_GRID,
          v1: (variant.row + 1) / QUAKE_HUD_CROSSHAIR_GRID,
          regions: tex.regions,
          density: HUD_ART_DENSITY,
          brightness: 1,
        });
      }
    }
  }

  /**
   * Display-size bitmap text as conchars ART (see the `textArt` option): one
   * textured quad per character, its UV window the glyph's cell in the sheet.
   * The run elements are visibility-hidden like all stamped text; their boxes
   * still come from layout, so the art lands exactly where the HTML text was.
   */
  /**
   * The conchars sheet PRE-BRIGHTENED for text use (hue-preserving gamma
   * lift per texel, capped so no channel clips), built once and served as a
   * data URL.
   *
   * Measured: the sheet's glyph strokes average #5f5f5f (alt row #64331f) —
   * the source is dim, so cells sampling it start low, and a low luminance
   * ALSO buys a sparse ramp character, which is most of why the text quads
   * read ghostly next to the art. Lifting the texels attacks both at once:
   * brighter colour AND a denser glyph choice. Amber stays amber — the same
   * clip-capped scale `liftCellColors` uses.
   */
  const TEXT_SHEET_GAMMA = Math.min(1, Math.max(0.2, options.textGamma ?? 0.5));
  const TEXT_SHEET_SATURATION = Math.min(4, Math.max(0, options.textSaturation ?? 1));
  /** Pre-lifted conchars variants, keyed `gamma/saturation` — the scene pair
   *  plus one per styled text run that overrides the sheet tone (the boot
   *  console). Each variant is built once; `null` = build in flight. */
  const textSheetVariants = new Map<string, string | null>();
  function ensureTextSheetVariant(gammaRaw: number, saturationRaw: number): string | null {
    const gamma = Math.min(1, Math.max(0.2, gammaRaw));
    const saturation = Math.min(4, Math.max(0, saturationRaw));
    const key = `${gamma}/${saturation}`;
    const existing = textSheetVariants.get(key);
    if (existing !== undefined) return existing;
    textSheetVariants.set(key, null);
    const img = new Image();
    const fallback = () => {
      textSheetVariants.set(key, CONCHARS_URL);
      adoptedSinceDraw = true;
      queueSync();
    };
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) { fallback(); return; }
        ctx.drawImage(img, 0, 0);
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = image.data;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] === 0) continue;
          const r = d[i]!, g = d[i + 1]!, b = d[i + 2]!;
          const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          if (luma <= 0) continue;
          const scale = Math.min(
            (255 * Math.pow(luma / 255, gamma)) / luma,
            255 / Math.max(r, g, b),
          );
          let nr = r * scale, ng = g * scale, nb = b * scale;
          if (saturation !== 1) {
            // Push each channel away from the pixel's own luma. Done AFTER the
            // gamma lift so the two compose: brightness first, then vibrancy.
            const l = 0.2126 * nr + 0.7152 * ng + 0.0722 * nb;
            nr = l + (nr - l) * saturation;
            ng = l + (ng - l) * saturation;
            nb = l + (nb - l) * saturation;
          }
          const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
          d[i] = clamp(nr);
          d[i + 1] = clamp(ng);
          d[i + 2] = clamp(nb);
        }
        ctx.putImageData(image, 0, 0);
        textSheetVariants.set(key, canvas.toDataURL("image/png"));
        adoptedSinceDraw = true;
        queueSync();
      } catch {
        fallback(); // tainted canvas — draw the raw sheet rather than nothing
      }
    };
    img.onerror = fallback;
    img.src = CONCHARS_URL;
    return null;
  }
  /** The scene-toned sheet (`textGamma`/`textSaturation`) — every text run
   *  that carries no sheet-tone style. */
  function ensureTextSheet(): string | null {
    return ensureTextSheetVariant(TEXT_SHEET_GAMMA, TEXT_SHEET_SATURATION);
  }

  function emitTextArt(groups: Map<string, PolyGroup>, hostBox: DOMRect): void {
    const rules = options.textArt;
    if (!rules?.length) return;
    const sheetUrl = ensureTextSheet();
    if (!sheetUrl) return; // draws on the sync queued when the sheet is ready
    const cx = hostBox.width / 2;
    const cy = hostBox.height / 2;

    /** Accumulated CSS dimming for one run: its own and its ancestors'
     *  `opacity` (the disabled-row dim) times any `filter: brightness()`
     *  (the multiplayer rows' hover lift). The compositor applied these to
     *  the HTML text; a textured quad must fold them into its tint. The
     *  dimming classes sit on the row or its immediate wrappers, so a short
     *  ancestor walk suffices — same depth the stamped path used. */
    const nodeDim = (node: HTMLElement, style: CSSStyleDeclaration): number => {
      let dim = parseFloat(style.opacity) || 1;
      const fb = /brightness\(([\d.]+)\)/.exec(style.filter);
      if (fb) dim *= parseFloat(fb[1]!);
      let ancestor = node.parentElement;
      for (let depth = 0; ancestor && depth < 6; depth++, ancestor = ancestor.parentElement) {
        const cs = getComputedStyle(ancestor);
        const o = parseFloat(cs.opacity);
        if (o < 1) dim *= o;
        const f = /brightness\(([\d.]+)\)/.exec(cs.filter);
        if (f) dim *= parseFloat(f[1]!);
      }
      return dim;
    };

    // First matching rule wins: the catch-all run rule overlaps the
    // display-size title rule, and emitting an element under both would
    // double every title character.
    const seen = new Set<Element>();
    for (const rule of rules) {
      let nodes: NodeListOf<Element>;
      try { nodes = document.querySelectorAll(rule.selector); } catch { continue; }
      for (const node of nodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (seen.has(node)) continue;
        seen.add(node);
        let text = node.textContent;
        if (!text || !text.trim()) continue;
        const box = node.getBoundingClientRect();
        if (!box.width || !box.height) continue;
        const style = getComputedStyle(node);
        if (style.display === "none") continue;
        // The HTML text painted through `text-transform` — the quads must too.
        if (style.textTransform === "uppercase") text = text.toUpperCase();
        const tex = menuTexture(sheetUrl, true);
        if (!tex.natural) continue;
        const alt = node.classList.contains("quake-bitmap-run-alt");
        const brightness = (rule.brightness ?? 1) * nodeDim(node, style);
        // Honour the nearest clipping ancestor: the multiplayer value runs
        // keep their full box (flex-shrink 0) and their `overflow: hidden`
        // container clips the paint — quads that ignore that draw the value
        // straight past the input's border (measured on the MAP row).
        let clip: DOMRect | null = null;
        for (let a = node.parentElement, d = 0; a && d < 4; d++, a = a.parentElement) {
          const cs = getComputedStyle(a);
          if (cs.overflowX !== "visible" || cs.overflowY !== "visible") {
            clip = a.getBoundingClientRect();
            break;
          }
        }
        const charW = box.width / text.length;
        // The glyph draws centred INSIDE its layout cell at `glyphScale` —
        // see the option doc. `min` keeps it square when a clamped run's
        // cells are narrower than the row height.
        const glyphSide = Math.min(box.height, charW) * Math.max(0.1, Math.min(1, rule.glyphScale ?? 1));
        const padY = (box.height - glyphSide) / 2;
        const padX = (charW - glyphSide) / 2;
        const top = box.top - hostBox.top;
        const z = rule.layer * LAYER_STEP;
        for (let i = 0; i < text.length; i++) {
          const char = text[i]!;
          if (char === " ") continue;
          const glyph = (char.charCodeAt(0) & 127) + (alt ? 128 : 0);
          const gu = glyph & (CONCHARS_GRID - 1);
          const gv = glyph >> 4;
          const left = box.left - hostBox.left + i * charW + padX;
          const cellTop = top + padY;
          // Visible portion after ancestor clipping; a partially clipped
          // glyph shrinks its quad AND its sheet window together.
          let visL = left, visR = left + glyphSide;
          let visT = cellTop, visB = cellTop + glyphSide;
          if (clip) {
            visL = Math.max(visL, clip.left - hostBox.left);
            visR = Math.min(visR, clip.right - hostBox.left);
            visT = Math.max(visT, clip.top - hostBox.top);
            visB = Math.min(visB, clip.bottom - hostBox.top);
            if (visL >= visR || visT >= visB) continue;
          }
          const cw = 1 / CONCHARS_GRID;
          emitQuad(groups, {
            x0: visT - cy, x1: visB - cy,
            y0: visL - cx, y1: visR - cx,
            z,
            url: sheetUrl,
            u0: (gu + (visL - left) / glyphSide) * cw, u1: (gu + (visR - left) / glyphSide) * cw,
            v0: (gv + (visT - cellTop) / glyphSide) * cw, v1: (gv + (visB - cellTop) / glyphSide) * cw,
            regions: tex.regions,
            density: Math.max(1, Math.round(rule.density ?? 1)),
            brightness,
          });
        }
      }
    }
  }

  /**
   * Draw one uppercased run of conchars text at host-px coordinates — the
   * manifest-text replacement for the DOM-traced `emitTextArt` path: the
   * words and their geometry both arrive as DATA, no element is measured.
   * `glyphScale` matches the old rules: display sizes (>=30px) draw at 0.75
   * inside their cell, copy sizes fill it (see the `textArt` option doc).
   */
  const MANIFEST_TEXT_LAYER = 2;
  function drawGlyphRun(
    groups: Map<string, PolyGroup>,
    hostBox: DOMRect,
    text: string,
    leftPx: number,
    topPx: number,
    glyphPx: number,
    opts: { alt?: boolean; brightness?: number; layer?: number; align?: "left" | "center" | "right"; density?: number; styleTag?: string } = {},
  ): void {
    if (!text) return;
    // ONE conchars tone profile for every run this function draws — boot
    // console, menu rows/values, help/level rows, the multiplayer form's
    // labels, notify and centerprint are all the same 8x8 conchars font, so
    // they share the "text" style row by design (user, 2026-08). A caller may
    // still name a different style. HUD readouts draw from their own digit
    // sheets in emitHudScene and are untouched.
    const styleTag = opts.styleTag ?? "text";
    // A styled run with its own sheet tone samples that variant — the tuned
    // conchars lift, scoped so unstyled sheet users (textArt) keep the scene's.
    const runStyle = options.meshStyles?.[styleTag];
    const sheetUrl = runStyle && (runStyle.sheetGamma !== undefined || runStyle.sheetSaturation !== undefined)
      ? ensureTextSheetVariant(
          runStyle.sheetGamma ?? TEXT_SHEET_GAMMA,
          runStyle.sheetSaturation ?? TEXT_SHEET_SATURATION,
        )
      : ensureTextSheet();
    if (!sheetUrl) return; // redraws on the sync queued when the sheet is ready
    const tex = menuTexture(sheetUrl, true);
    if (!tex.natural) return;
    const drawn = text.toUpperCase();
    const advance = glyphPx;
    let left = leftPx;
    if (opts.align === "center") left -= (drawn.length * advance) / 2;
    else if (opts.align === "right") left -= drawn.length * advance;
    const scale = glyphPx >= 30 ? 0.75 : 1;
    const side = glyphPx * scale;
    const pad = (glyphPx - side) / 2;
    const cx = hostBox.width / 2;
    const cy = hostBox.height / 2;
    const z = (opts.layer ?? MANIFEST_TEXT_LAYER) * LAYER_STEP;
    const cw = 1 / CONCHARS_GRID;
    const density = Math.max(1, Math.round(opts.density ?? manifestTextDensity));
    for (let i = 0; i < drawn.length; i++) {
      const char = drawn[i]!;
      if (char === " ") continue;
      const glyph = (char.charCodeAt(0) & 127) + (opts.alt ? 128 : 0);
      const gu = glyph & (CONCHARS_GRID - 1);
      const gv = glyph >> 4;
      const gl = left + i * advance + pad;
      const gt = topPx + pad;
      emitQuad(groups, {
        x0: gt - cy, x1: gt + side - cy,
        y0: gl - cx, y1: gl + side - cx,
        z,
        url: sheetUrl,
        u0: gu * cw, u1: (gu + 1) * cw,
        v0: gv * cw, v1: (gv + 1) * cw,
        regions: tex.regions,
        density,
        brightness: opts.brightness ?? 1,
        styleTag,
      });
    }
  }

  /** A single spinner-cursor glyph (conchars 12/13 ticking at 250ms). */
  function drawSpinner(
    groups: Map<string, PolyGroup>,
    hostBox: DOMRect,
    leftPx: number,
    topPx: number,
    glyphPx: number,
  ): void {
    // Same conchars font as drawGlyphRun — same shared "text" profile (sheet
    // variant included), so the ticking cursor matches the row it sits in.
    const st = options.meshStyles?.["text"];
    const sheetUrl = st && (st.sheetGamma !== undefined || st.sheetSaturation !== undefined)
      ? ensureTextSheetVariant(st.sheetGamma ?? TEXT_SHEET_GAMMA, st.sheetSaturation ?? TEXT_SHEET_SATURATION)
      : ensureTextSheet();
    if (!sheetUrl) return;
    const tex = menuTexture(sheetUrl, true);
    if (!tex.natural) return;
    const glyph = spinnerGlyph(performance.now());
    const gu = glyph & (CONCHARS_GRID - 1);
    const gv = glyph >> 4;
    const cw = 1 / CONCHARS_GRID;
    const cx = hostBox.width / 2;
    const cy = hostBox.height / 2;
    emitQuad(groups, {
      x0: topPx - cy, x1: topPx + glyphPx - cy,
      y0: leftPx - cx, y1: leftPx + glyphPx - cx,
      z: 3 * LAYER_STEP,
      url: sheetUrl,
      u0: gu * cw, u1: (gu + 1) * cw,
      v0: gv * cw, v1: (gv + 1) * cw,
      regions: tex.regions,
      density: manifestTextDensity,
      brightness: 1,
      styleTag: "text",
    });
  }

  /** Flat-colour rectangle (host px) — progress bar, control borders. Density 1:
   *  it lands in the base grid, recolouring cells under it. */
  function drawSolid(
    groups: Map<string, PolyGroup>,
    hostBox: DOMRect,
    x: number, y: number, w: number, h: number,
    color: string,
    layer: number,
  ): void {
    const cx = hostBox.width / 2;
    const cy = hostBox.height / 2;
    emitQuad(groups, {
      x0: y - cy, x1: y + h - cy,
      y0: x - cx, y1: x + w - cx,
      z: layer * LAYER_STEP,
      url: SOLID_TEXTURE,
      u0: 0, u1: 1, v0: 0, v1: 1,
      regions: null,
      density: 1,
      brightness: 1,
      tint: color,
    });
  }

  /**
   * All manifest-owned TEXT: the active screen's rows, the level list, the
   * spinner cursor, the boot console (lines, progress bar, action line, the
   * death card), the version tag, and gameplay notify/centerprint. Geometry
   * comes from the manifest's baked literals + the scene state's words — the
   * DOM contributes nothing (the `.quake-bitmap-run` tracing this replaces
   * served only the intermission card afterwards).
   */
  function emitManifestTexts(groups: Map<string, PolyGroup>, hostBox: DOMRect): void {
    const manifest = options.menu;
    const st = getQuakeMenuSceneState();
    const frame = quakeMenuSceneFrame(hostBox.width, hostBox.height);
    const sx = frame.w / QUAKE_MENU_SCENE_FRAME_W;
    const sy = frame.h / QUAKE_MENU_SCENE_FRAME_H;
    const px = (qx: number) => frame.x + qx * sx;
    const py = (qy: number) => frame.y + qy * sy;

    const screenDef = manifest && st.screen && !st.deferred ? manifest.screens[st.screen] : undefined;
    if (manifest && screenDef) {
      const dimmed = manifest.dimmedBrightness;
      const failure = st.screen === "multiplayer" && st.multiplayerFailure;
      const texts: readonly QuakeMenuSceneTextDef[] = failure
        ? QUAKE_MENU_MP_FAILURE_TEXTS
        : screenDef.texts ?? [];
      for (const def of texts) {
        const disabled = !!def.item && st.disabledItems.includes(def.item);
        if (def.showWhenDisabled && !disabled) continue;
        const value = def.key ? st.texts[def.key] ?? "" : def.text ?? "";
        if (!value) continue;
        let brightness = def.brightness ?? 1;
        if (st.pending || (disabled && !def.showWhenDisabled)) brightness *= dimmed;
        else if (def.item && def.item === st.activeItem) brightness *= 1.28;
        drawGlyphRun(groups, hostBox, value, px(def.x), py(def.y), def.h * sy, {
          alt: def.alt,
          brightness,
          layer: def.layer,
          align: def.align,
        });
      }

      // Level list rows (dynamic — drawn from state, on the measured grid).
      if (st.screen === "level-select") {
        st.levels.forEach((level, i) => {
          const y = py(quakeMenuLevelRowY(i));
          const active = st.activeItem === `level:${i}`;
          const brightness = (st.pending ? dimmed : 1) * (active ? 1.28 : 1) * (level.current ? 1 : 0.92);
          drawGlyphRun(groups, hostBox, level.code, px(QUAKE_MENU_LEVEL_CODE_X), y, 8 * sy, { alt: true, brightness });
          drawGlyphRun(groups, hostBox, level.title, px(QUAKE_MENU_LEVEL_TITLE_X), y, 8 * sy, { brightness });
        });
      }

      // Spinner cursor on the active hotspot (screens without their own
      // cursor art). Suppressed while a native control is being edited —
      // matching the CSS that hid the hover cursor over a focused field.
      if (!st.pending && st.activeItem && st.activeItem !== st.editingItem) {
        const hotspots = quakeMenuSceneHotspotsFor(manifest, st.screen, st.levels.length, st.multiplayerFailure);
        const active = hotspots.find((spot) => spot.id === st.activeItem);
        if (active?.spinner) {
          drawSpinner(groups, hostBox, px(active.spinner.x), py(active.spinner.y), active.spinner.h * sy);
        }
      }
    }

    // ── The boot console (chrome up) or the death card (gameplay) ──
    if (st.consoleDeath && !st.chrome) {
      // "you died": centred, display-size, over the live world (no backdrop).
      const glyph = 40;
      const total = st.consoleLines.length;
      st.consoleLines.forEach((line, i) => {
        drawGlyphRun(groups, hostBox,
          line,
          hostBox.width / 2,
          hostBox.height / 2 + (i - total / 2) * (glyph + 4),
          glyph,
          { align: "center", alt: true });
      });
    } else if (st.chrome) {
      let top = QUAKE_CONSOLE_TOP;
      for (const line of st.consoleLines) {
        drawGlyphRun(groups, hostBox, line, QUAKE_CONSOLE_LEFT, top, QUAKE_CONSOLE_GLYPH, { density: consoleTextDensity });
        top += QUAKE_CONSOLE_PITCH;
      }
      if (st.consoleProgress !== null) {
        // The shipped progress bar as SOLID quads: border, well, fill.
        const w = quakeConsoleProgressWidth(hostBox.width);
        const h = QUAKE_CONSOLE_PROGRESS_H;
        top += QUAKE_CONSOLE_GAP - 2;
        drawSolid(groups, hostBox, QUAKE_CONSOLE_LEFT, top, w, h, "#523821", 1.2);
        drawSolid(groups, hostBox, QUAKE_CONSOLE_LEFT + 2, top + 2, w - 4, h - 4, "#120b07", 1.4);
        const fill = Math.max(0, Math.min(1, st.consoleProgress));
        if (fill > 0) {
          drawSolid(groups, hostBox, QUAKE_CONSOLE_LEFT + 4, top + 4, (w - 8) * fill, h - 8, "#d8893f", 1.6);
        }
        top += h;
      }
      if (st.consoleAction) {
        top += QUAKE_CONSOLE_GAP;
        drawGlyphRun(groups, hostBox, st.consoleAction, QUAKE_CONSOLE_LEFT, top, QUAKE_CONSOLE_GLYPH, { alt: true, density: consoleTextDensity });
      }
      // Version tag beside the logo (the old #asciiquake-version span).
      const version = st.texts["version"];
      if (version) {
        const pos = quakeMenuVersionPos(hostBox.width);
        drawGlyphRun(groups, hostBox, version, pos.x, pos.y, pos.h, { brightness: 0.45 });
      }
    }

    // ── Gameplay text: notify (top-left) and centerprint (centred) ──
    if (!st.chrome && (st.notifyLines.length || st.centerLines.length)) {
      const layout = quakeNotifyLayout(hostBox.width, hostBox.height);
      let ny = layout.notify.y;
      for (const line of st.notifyLines) {
        drawGlyphRun(groups, hostBox, line, layout.notify.x, ny, layout.notify.h);
        ny += layout.notify.h;
      }
      let cyLine = layout.center.y;
      for (const line of st.centerLines) {
        drawGlyphRun(groups, hostBox, line, hostBox.width / 2, cyLine, layout.center.h, { align: "center" });
        cyLine += layout.center.h;
      }
    }
  }

  function buildPolygons(hostBox: DOMRect): Map<string, PolyGroup> {
    const groups = new Map<string, PolyGroup>();
    emitMenuScene(groups, hostBox);
    emitManifestTexts(groups, hostBox);
    emitHudScene(groups, hostBox);
    emitTextArt(groups, hostBox);
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

      emitQuad(groups, {
        x0, x1, y0, y1, z,
        url: s.url, u0, u1, v0, v1,
        regions: s.regions,
        // Fractional on purpose — same contract as the manifest sprites (the
        // lab drives the logo's 1.472 default through this path).
        density: Math.max(1, s.sprite.density ?? 1),
        brightness: s.sprite.brightness ?? 1,
        styleTag: s.sprite.styleTag,
      });
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
    // The surface's own ground follows the chrome: opaque black while the menu
    // backdrop is up (the ground the loading overlay used to provide), fully
    // transparent during play so the world's ASCII shows through. The status
    // bar carries its own opaque backing, matching the HTML bar's background.
    const sceneState = getQuakeMenuSceneState();
    surface.style.background = sceneState.chrome ? "#000000" : "";
    if (!sceneState.chrome && hudBodyClassesAllow()) {
      const hudFrame = quakeHudSceneFrame(hostBox.width, hostBox.height);
      hudBacking.style.display = "block";
      hudBacking.style.left = `${hudFrame.x}px`;
      hudBacking.style.top = `${hudFrame.y}px`;
      hudBacking.style.width = `${hudFrame.w}px`;
      hudBacking.style.height = `${hudFrame.h}px`;
    } else {
      hudBacking.style.display = "none";
    }
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
    for (const [groupKey, group] of groups) {
      key += groupKey + ":";
      for (const poly of group.polys) {
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
    // Ink mode's front-facing test is PROJECTED winding (no doubleSided
    // escape hatch): under this overlay's axis-swapped frame (world X =
    // screen down) the quads' shipped vertex order projects as back-facing,
    // and ink drops every silhouette edge of a back-face — measured as a
    // completely empty render. Reversing each polygon flips the projected
    // winding; solid mode is orientation-agnostic here (`doubleSided: true`),
    // so this runs for ink alone and the shipped path is untouched.
    if (sceneMode === "ink") {
      for (const group of groups.values()) {
        for (const poly of group.polys as unknown as { vertices: unknown[]; uvs?: unknown[] }[]) {
          poly.vertices.reverse();
          poly.uvs?.reverse();
        }
      }
    }
    for (const [groupKey, group] of groups) {
      const existing = meshes.get(groupKey);
      if (existing) existing.setPolygons(group.polys);
      // SEGMENTED density art is OPAQUE: its tight per-region quads feed the
      // shared occlusion id-map, so the base grid draws nothing under the
      // artwork itself (the world-entity "black hole") while the backdrop keeps
      // painting between the regions. UNSEGMENTED density art must stay
      // `transparent` — its quad is the sprite's whole rectangle, and occluding
      // with that punches a rectangular black box around the art. Density 1
      // shares the base grid, where the rasterizer composites texture alpha
      // per cell and no cross-layer occlusion exists.
      else {
        const style = meshStyle(group.styleTag);
        const base = group.density > 1
          ? (group.transparent
            ? { density: group.density, transparent: true as const }
            : { density: group.density })
          : undefined;
        // A styled mesh is named by its tag (that name is what transformCells
        // receives as layer identity) and ALWAYS carries a glyphPalette — the
        // style's own, or the scene's — because a palette-carrying mesh is
        // guaranteed its own layer even at density 1, so the tone override
        // can never silently fold into the base grid. Palette values are
        // sanitized by the caller (ASCII-only policy, asciiGlyphPolicy.ts).
        const transform = group.styleTag
          ? {
              ...(base ?? {}),
              id: group.styleTag,
              glyphPalette: style?.palette ?? options.glyphPalette ?? "detail",
              // Per-mesh ambient — the raster-side carrier for the style's
              // `ambient` (glyph choice AND colours; see QuakeGlyphMeshStyle).
              ...(style?.ambient !== undefined ? { ambientIntensity: style.ambient } : {}),
              // Per-mesh occlusion shaping — see `occlusionMode`/`occlusionPad`.
              // The pad is THE anti-theft fix: it hands the mesh back the
              // partial-alpha boundary cells the backdrop was claiming.
              ...(style?.occlusionMode === "none" ? { transparent: true as const } : {}),
              ...(style?.occlusionMode === "plate" ? { occlusionClaim: "geometry" as const } : {}),
              ...(style?.occlusionMarginPx !== undefined && style.occlusionMode !== "none" && style.occlusionMode !== "plate"
                ? { occlusionContourPx: style.occlusionMarginPx }
                : {}),
            }
          : base;
        meshes.set(groupKey, scene.add(group.polys, transform));
      }
    }
    // A group can empty out (its sprites' panel closed).
    for (const [groupKey, mesh] of meshes) {
      if (!groups.has(groupKey)) { mesh.dispose(); meshes.delete(groupKey); }
    }
    scene.rerender();
    // Per-style glyph stroke: a styled mesh's own `<pre>` (named by glyphcss's
    // `data-glyph-mesh-id` stamp, additive in the linked build) overrides the
    // scene-wide surface stroke. Idempotent inline-style writes; a handful of
    // layers at most.
    if (options.meshStyles) {
      for (const [tag, style] of Object.entries(options.meshStyles)) {
        if (style.strokePx === undefined) continue;
        const px = Math.max(0, Math.min(2, style.strokePx));
        // querySelectorAll: one tag can own several layers (the "text"
        // profile renders at both the menu and console densities).
        for (const layerPre of surface.querySelectorAll<HTMLPreElement>(`pre[data-glyph-mesh-id="${tag}"]`)) {
          layerPre.style.setProperty("-webkit-text-stroke", `${px}px currentColor`);
        }
      }
    }
    // Publish this frame's opaque coverage so the world scene beneath can
    // punch itself out under the menu/HUD art (see the option's doc). The
    // optional call keeps a stale prebundled glyphcss (linked dev) harmless.
    options.onCoverage?.(scene.getOpaqueCoverage?.() ?? null);
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
  /**
   * Whether a mutation happened somewhere this scene draws FROM. Every sprite
   * rule, pseudo host, bitmap-text run and stamped word lives under the menu
   * tree or the loading overlay; the world's own DOM (`#quake-scene`, entity
   * meshes, projectiles) churns constantly during play and none of it feeds
   * this scene. With the host persistent, reacting to that churn would force a
   * full UI rasterize every throttle window through an entire firefight — so
   * mutations outside the UI trees are ignored outright.
   */
  const mutationRoots = ["quake-intermission"]
    .map((id) => document.getElementById(id))
    .filter((el): el is HTMLElement => el !== null);
  function mutationFeedsScene(record: MutationRecord): boolean {
    const target = record.target;
    if (!(target instanceof Node)) return false;
    // Everything else this scene draws is DATA now — only the intermission
    // card still builds DOM the tracer reads. No roots: nothing to watch.
    return mutationRoots.some((root) => root === target || root.contains(target));
  }

  const domObserver = typeof MutationObserver !== "undefined"
    ? new MutationObserver((allRecords) => {
        const records = allRecords.filter(mutationFeedsScene);
        if (!records.length) return;
        // Adoption only matters when nodes were actually ADDED; a class flip on
        // an existing element cannot introduce a new sprite.
        if (records.some((r) => r.addedNodes.length > 0)) rescan();
        // Any childList change can be TEXT: stamped words live in the final
        // grid, so a console line appended or an option value swapped must
        // force a rebuild+rerender even when no sprite geometry moved — the
        // change key only covers polygons, and skipping the render would
        // leave the stale text on screen.
        if (records.some((r) => r.addedNodes.length > 0 || r.removedNodes.length > 0)) {
          adoptedSinceDraw = true;
        }
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
    // The HUD's overall visibility rides on body classes toggled outside any
    // observed subtree — fold them into the poll signature so a flip (death,
    // level complete, pause) redraws within one poll interval.
    let signature = hudBodyClassesAllow() ? "H1|" : "H0|";
    for (const st of states.values()) {
      if (st.sprite.fit !== "css") continue;
      const cs = getComputedStyle(st.sprite.element);
      signature += cs.backgroundPosition + "|" + cs.backgroundSize + ";";
    }
    // The manifest cursor spins on a clock, not on CSS — fold its current
    // frame into the same signature so the spin redraws without DOM reads.
    const manifest = options.menu;
    if (manifest) {
      const menuState = getQuakeMenuSceneState();
      const screenDef = menuState.screen && !menuState.deferred
        ? manifest.screens[menuState.screen]
        : undefined;
      if (screenDef && menuState.activeItem && !menuState.pending) {
        const now = performance.now();
        for (const def of screenDef.sprites) {
          if (def.role !== "cursor" || def.item !== menuState.activeItem || !def.animate) continue;
          signature += `@${def.id}:${menuAnimationFrame(def, now)};`;
        }
        // The text screens' spinner cursor ticks on the same clock.
        const hotspots = quakeMenuSceneHotspotsFor(
          manifest, menuState.screen, menuState.levels.length, menuState.multiplayerFailure,
        );
        const active = hotspots.find((spot) => spot.id === menuState.activeItem);
        if (active?.spinner && menuState.activeItem !== menuState.editingItem) {
          signature += `~${spinnerGlyph(now)};`;
        }
      }
    }
    if (signature === lastFrames) return;
    lastFrames = signature;
    sync(true);
  }
  frameWatch = setInterval(watchSheetFrames, 100);

  // Selection, screen changes, chrome flips and every HUD update arrive as
  // DATA — the shared scene state — not as DOM mutations. Redraw on the next
  // frame; `adoptedSinceDraw` lifts the rebuild throttle so a keypress-driven
  // selection (or a health tick) never waits out the 100ms window.
  // Unconditional: the HUD renders from this state even without a menu manifest.
  const unsubscribeMenuState = subscribeQuakeMenuSceneState(() => {
    adoptedSinceDraw = true;
    queueSync();
  });

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
      options.onCoverage?.(null);
      window.removeEventListener("resize", onResize);
      unsubscribeMenuState?.();
      if (frameWatch) clearInterval(frameWatch);
      if (trailingSync) clearTimeout(trailingSync);
      if (uiPaletteTimer) { window.clearTimeout(uiPaletteTimer); uiPaletteTimer = 0; }
      boxObserver?.disconnect();
      domObserver?.disconnect();
      for (const m of meshes.values()) m.dispose();
      meshes.clear();
      scene.destroy();
      surface.remove();
      hudBacking.remove();
      for (const s of states.values()) {
        if (s.isImg) s.sprite.element.style.visibility = "";
        else s.sprite.element.style.backgroundImage = "";
      }
    },
  };
}
