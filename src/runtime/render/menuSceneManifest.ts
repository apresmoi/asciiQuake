/**
 * Declarative scene definition for the menu screens — the glyph overlay's
 * SOURCE OF TRUTH for what to draw, replacing the old tracer that discovered
 * sprites by measuring the live HTML (`getBoundingClientRect` for position,
 * computed `background-image` for the texture). Positions, textures, sheet
 * frames and layering are data here; the DOM contributes nothing.
 *
 * ── Coordinate frame ─────────────────────────────────────────────────────────
 * Sprites are authored in Quake's own 320x200 virtual menu screen ("q-units"),
 * the exact frame the menu CSS uses (`--quake-main-menu-px = width/320`,
 * `cqw` units against a 320/200 aspect card). `quakeMenuSceneFrame()` maps that
 * frame into the host with the same responsive rule the CSS applies, so every
 * rect below is RESOLUTION-INDEPENDENT: a rect of {x:72, y:32, w:218, h:20}
 * means "72/320 of the card from the left, 32/200 from the top" at any size.
 *
 * The numbers were EXTRACTED from the shipped menu CSS (index.html inline
 * styles and quake.css, which author the same values in cqw /
 * `--quake-main-menu-px` units) and verified against the live DOM's bounding
 * rects — they are not hand-authored art direction. Sources, per sprite, are
 * noted inline.
 */

// Sprite-sheet and art textures. Imported so the bundler owns the URLs; the
// `/q/` textures are prepared public assets addressed the same way App.ts
// addresses them.
import landingSinglePlayerSheet from "../../assets/main-menu-single-player-sprite.png";
import landingMultiplayerSheet from "../../assets/main-menu-multiplayer-sprite.png";
import landingOptionsSheet from "../../assets/main-menu-options-sprite.png";
import landingHelpSheet from "../../assets/main-menu-help-sprite.png";
import landingQuitSheet from "../../assets/main-menu-quit-sprite.png";
import landingCursorSheet from "../../assets/main-menu-cursor-baked.png";
import asciiQuakeLogo from "../../assets/cssquake-logo.png";
// The single-player panel's label art, BAKED to real image sheets from the
// `<svg class="quake-menu-svg-defs">` path data that used to live in the
// markup (rasterized once at the art's own 1:1 pixel grid; a 3-frame vertical
// sheet: NEW GAME / LOAD / SAVE, plus the standalone LEVEL SELECT frame). This
// is what frees the DOM from the 65-path SVG defs block.
import singlePlayerLabelSheet from "../../assets/menu-single-player-labels.png";
import levelSelectLabel from "../../assets/menu-level-select-label.png";

import type { QuakeMenuSceneScreen } from "../menuSceneState";

/** Reference frame the sprite rects are authored in (Quake's menu screen). */
export const QUAKE_MENU_SCENE_FRAME_W = 320;
export const QUAKE_MENU_SCENE_FRAME_H = 200;

export interface QuakeMenuSceneRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface QuakeMenuSceneSpriteDef {
  readonly id: string;
  readonly texture: string;
  /** Box in q-units of the 320x200 frame (screen sprites). */
  readonly rect?: QuakeMenuSceneRect;
  /**
   * Host-anchored placement (chrome sprites): resolves the box in host px.
   * Present instead of `rect` for art positioned against the viewport rather
   * than the menu card — the backdrop and the corner logo.
   */
  readonly place?: (hostW: number, hostH: number) => QuakeMenuSceneRect;
  /** Paint order, same z scale as the overlay's DOM-traced sprites. */
  readonly layer: number;
  /** Detail-layer multiplier — same semantics as the sprite rules. */
  readonly density?: number;
  /** Split into per-region quads so occlusion hugs the artwork. */
  readonly segment?: boolean;
  /**
   * Sprite sheet: `frames` equal windows along `axis`. The drawn frame is
   * `frame` (default 0) unless selection state (`item` active on a label) or
   * `animate` (a cursor) picks another.
   */
  readonly sheet?: { readonly frames: number; readonly axis: "x" | "y" };
  /** Fixed sheet frame for sprites that always show one window (the
   *  single-player labels share one 3-frame sheet). */
  readonly frame?: number;
  /** Cycle the sheet frame on a clock — the spinning selection cursor. */
  readonly animate?: { readonly periodMs: number };
  /**
   * Item id this sprite belongs to. Labels switch to sheet frame 1 while their
   * item is active; `role: "cursor"` sprites draw ONLY on the active item.
   * Items listed in the scene state's `disabledItems` render dimmed.
   */
  readonly item?: string;
  readonly role?: "art" | "label" | "cursor";
  /** Flat brightness 0..1 (default 1) — the backdrop dim lives here. */
  readonly brightness?: number;
  /** How the texture maps into the box (default "stretch"). */
  readonly fit?: "stretch" | "cover";
}

export interface QuakeMenuSceneScreenDef {
  readonly sprites: readonly QuakeMenuSceneSpriteDef[];
  /** Text rows drawn as conchars quads — geometry HERE, dynamic words in the
   *  scene state's `texts` (looked up by `key`). */
  readonly texts?: readonly QuakeMenuSceneTextDef[];
  /** Interactive regions, in keyboard order. The controller hit-tests and
   *  walks these; the overlay draws the spinner cursor on the active one. */
  readonly hotspots?: readonly QuakeMenuSceneHotspot[];
}

/**
 * One row of conchars text in the 320x200 frame. `h` is the glyph size AND
 * the per-character advance (conchars glyphs are square, 8x8 on the classic
 * screen). Text is drawn uppercased, exactly as the shipped CSS's
 * `text-transform: uppercase` rendered the runs this replaces.
 *
 * The positions below were EXTRACTED from the live shipped DOM (one
 * measurement pass, 1600x900, 2026-08-29): every `.quake-bitmap-run` box was
 * read with getBoundingClientRect and converted to q-units of the same
 * 320x200 frame the sprite rects use. They are baked literals, not
 * hand-authored layout.
 */
export interface QuakeMenuSceneTextDef {
  readonly id: string;
  /** Anchor: left edge, or centre/right edge under `align`. */
  readonly x: number;
  readonly y: number;
  /** Glyph size (height = advance), q-units. */
  readonly h: number;
  /** Static string (drawn as-is, uppercased). */
  readonly text?: string;
  /** Dynamic string: scene state `texts[key]`. */
  readonly key?: string;
  /** Sample the conchars ALT (bronze) row. */
  readonly alt?: boolean;
  /** Item id: dims with `disabledItems`, brightens while active. */
  readonly item?: string;
  /** Draw ONLY while `item` is in `disabledItems` (the coming-soon note). */
  readonly showWhenDisabled?: boolean;
  readonly align?: "left" | "center" | "right";
  readonly brightness?: number;
  readonly layer?: number;
}

export interface QuakeMenuSceneHotspot {
  readonly id: string;
  readonly rect: QuakeMenuSceneRect;
  /** Spinner-cursor anchor (conchars cols 12/13 at 500ms — the CSS
   *  `quake-menu-option-cursor-frame` animation as data). Absent = the screen
   *  draws its own cursor art (the landing/single-player sheet cursor). */
  readonly spinner?: { readonly x: number; readonly y: number; readonly h: number };
}

export interface QuakeMenuSceneManifest {
  /**
   * Sprites drawn whenever the overlay's host is visible, independent of the
   * active screen: the menu backdrop and the asciiQuake logo. Host-anchored —
   * their rects are computed against the host box, not the 320x200 frame.
   */
  readonly chrome: readonly QuakeMenuSceneSpriteDef[];
  readonly screens: Partial<Record<QuakeMenuSceneScreen, QuakeMenuSceneScreenDef>>;
  /** Dim factor applied to items while pending/disabled (CSS: opacity 0.46). */
  readonly dimmedBrightness: number;
}

/**
 * The menu card's box inside the host, in px — the CSS sizing rule as data:
 *
 *   width  = min(860px, 100vw - 64px, 150dvh - 52px)     (index.html/quake.css)
 *            max-width 680px  → min(100vw - 24px, 150dvh - 52px)
 *            max-height 560px → min(860px, 100vw - 64px, 132dvh - 45px)
 *   aspect-ratio 320/200, centered (grid place-items: center),
 *   transform: translateY(13.5%)  (6.5% under the max-height 560px query).
 */
export function quakeMenuSceneFrame(
  hostW: number,
  hostH: number,
): { x: number; y: number; w: number; h: number } {
  const shortViewport = hostH <= 560;
  const narrowViewport = hostW <= 680;
  const w = Math.max(
    1,
    Math.min(
      narrowViewport ? Number.POSITIVE_INFINITY : 860,
      hostW - (narrowViewport ? 24 : 64),
      shortViewport ? 1.32 * hostH - 45 : 1.5 * hostH - 52,
    ),
  );
  const h = (w * QUAKE_MENU_SCENE_FRAME_H) / QUAKE_MENU_SCENE_FRAME_W;
  const offsetY = (shortViewport ? 0.065 : 0.135) * h;
  return { x: (hostW - w) / 2, y: (hostH - h) / 2 + offsetY, w, h };
}

/**
 * The asciiQuake logo's box, in host px — from `.asciiquake-logo`'s CSS:
 * `top: 8px; left: 8px; height: min(45px, (100vw - 92px) * 0.1951)`, width by
 * the source's aspect (1343x262, the img's intrinsic size).
 */
export function quakeMenuSceneLogoRect(hostW: number): QuakeMenuSceneRect {
  const h = Math.max(0, Math.min(45, (hostW - 92) * 0.1951));
  return { x: 8, y: 8, w: (h * 1343) / 262, h };
}

/**
 * The landing menu rows, all from the shipped CSS (see file doc): the list
 * starts at (72, 32) q-units (left 22.5cqw, top 10cqw), rows are 20 q-units
 * tall (min-height 6.25cqw, gap 0). Label sizes/offsets are the CSS custom
 * properties `--quake-main-menu-label-{width,height,offset-y}`; each label is
 * a two-frame sheet stacked vertically (frame 1 = highlighted). The cursor is
 * 16x24 q-units (5cqw x 7.5cqw), its right edge 2 q-units (0.625cqw) left of
 * the item, on a six-frame horizontal sheet spun at 600ms/turn.
 */
const LANDING_LIST_X = 72;
const LANDING_LIST_Y = 32;
const LANDING_ROW_H = 20;
const LANDING_CURSOR_W = 16;
const LANDING_CURSOR_H = 24;
const LANDING_CURSOR_GAP = 2;

interface LandingItemSpec {
  readonly id: string;
  readonly sheet: string;
  readonly w: number;
  readonly h: number;
  readonly offsetY: number;
}

const LANDING_ITEMS: readonly LandingItemSpec[] = [
  { id: "single-player", sheet: landingSinglePlayerSheet, w: 218, h: 20, offsetY: 0 },
  { id: "multiplayer", sheet: landingMultiplayerSheet, w: 190, h: 18, offsetY: 2 },
  { id: "options", sheet: landingOptionsSheet, w: 123, h: 18, offsetY: 2 },
  { id: "help", sheet: landingHelpSheet, w: 75, h: 16, offsetY: 2 },
  { id: "quit", sheet: landingQuitSheet, w: 70, h: 20, offsetY: 3 },
];

/* ── Panel row layout, extracted from the shipped DOM (see QuakeMenuSceneTextDef doc) ── */
/** Panel rows: label column and value column, 8-q-unit glyphs. */
export const QUAKE_MENU_ROW_LABEL_X = 56;
export const QUAKE_MENU_ROW_VALUE_X = 220;
export const QUAKE_MENU_ROW_H = 8;
const ROW_HIT: (y: number) => QuakeMenuSceneRect = (y) => ({ x: 16, y, w: 288, h: 8 });
const ROW_SPINNER = (y: number) => ({ x: QUAKE_MENU_ROW_LABEL_X - 10, y, h: 8 });
/** Back button, options/help placement (measured 16, 166.4). */
const BACK_TEXT: QuakeMenuSceneTextDef = { id: "back", x: 16, y: 166.4, h: 8, text: "Back", alt: true, item: "back" };
const BACK_HOTSPOT: QuakeMenuSceneHotspot = { id: "back", rect: { x: 16, y: 166.4, w: 32, h: 8 }, spinner: { x: 6, y: 166.4, h: 8 } };

/** OPTIONS rows: group titles at y 32/71, rows on the measured 8-unit grid.
 *  Row ids match the option row model the controller builds. */
export interface QuakeMenuOptionsRowLayout { readonly id: string; readonly label: string; readonly y: number; readonly group?: never }
const OPTIONS_GROUPS: readonly { title: string; y: number }[] = [
  { title: "Debug", y: 32 },
  { title: "Gameplay", y: 71 },
];
export const QUAKE_MENU_OPTIONS_ROWS: readonly { id: string; label: string; y: number }[] = [
  { id: "show-outlines", label: "Show outlines", y: 42 },
  { id: "show-stats", label: "Show stats panel", y: 50 },
  { id: "show-fps", label: "Show FPS panel", y: 58 },
  { id: "crosshair", label: "Crosshair", y: 81 },
  { id: "dynamic-lighting", label: "Dynamic lighting", y: 89 },
  { id: "render-mode", label: "ASCII render", y: 97 },
  { id: "glyph-detail", label: "ASCII detail", y: 105 },
  { id: "glyph-palette", label: "ASCII glyphs", y: 113 },
  { id: "mute-sounds", label: "Mute sounds", y: 121 },
  { id: "show-particles", label: "Show particles", y: 129 },
  { id: "show-enemies", label: "Show enemies", y: 137 },
  { id: "disable-damage", label: "Disable damage", y: 145 },
  { id: "disable-movement", label: "Disable movement", y: 153 },
  { id: "disable-attacks", label: "Disable attacks", y: 161 },
  { id: "invert-mouse", label: "Invert mouse", y: 169 },
];

function optionsTexts(): QuakeMenuSceneTextDef[] {
  const texts: QuakeMenuSceneTextDef[] = OPTIONS_GROUPS.map((g) => ({
    id: `options-group-${g.y}`, x: QUAKE_MENU_ROW_LABEL_X, y: g.y, h: 8, text: g.title, alt: true,
  }));
  for (const row of QUAKE_MENU_OPTIONS_ROWS) {
    texts.push({ id: `opt-label-${row.id}`, x: QUAKE_MENU_ROW_LABEL_X, y: row.y, h: 8, text: row.label, item: row.id });
    texts.push({ id: `opt-value-${row.id}`, x: QUAKE_MENU_ROW_VALUE_X, y: row.y, h: 8, key: `opt:${row.id}`, alt: true, item: row.id });
  }
  texts.push(BACK_TEXT);
  return texts;
}
function optionsHotspots(): QuakeMenuSceneHotspot[] {
  return [
    ...QUAKE_MENU_OPTIONS_ROWS.map((row) => ({ id: row.id, rect: ROW_HIT(row.y), spinner: ROW_SPINNER(row.y) })),
    BACK_HOTSPOT,
  ];
}

/** HELP rows: static labels and key values on the same grid. */
const HELP_ROWS: readonly { label: string; value: string; y: number }[] = [
  { label: "Move", value: "WASD", y: 42 },
  { label: "Look", value: "Mouse", y: 50 },
  { label: "Fire", value: "Click", y: 58 },
  { label: "Jump", value: "Space", y: 66 },
  { label: "Run", value: "Shift", y: 74 },
  { label: "Crouch", value: "Ctrl", y: 82 },
  { label: "Navigate", value: "Arrows", y: 105 },
  { label: "Select", value: "Enter", y: 113 },
  { label: "Back", value: "Esc", y: 121 },
];
function helpTexts(): QuakeMenuSceneTextDef[] {
  const texts: QuakeMenuSceneTextDef[] = [
    { id: "help-group-gameplay", x: QUAKE_MENU_ROW_LABEL_X, y: 32, h: 8, text: "Gameplay", alt: true },
    { id: "help-group-menu", x: QUAKE_MENU_ROW_LABEL_X, y: 95, h: 8, text: "Menu", alt: true },
  ];
  HELP_ROWS.forEach((row, i) => {
    texts.push({ id: `help-label-${i}`, x: QUAKE_MENU_ROW_LABEL_X, y: row.y, h: 8, text: row.label });
    texts.push({ id: `help-value-${i}`, x: QUAKE_MENU_ROW_VALUE_X, y: row.y, h: 8, text: row.value, alt: true });
  });
  texts.push(BACK_TEXT);
  return texts;
}

/** LEVEL SELECT rows: dynamic (state.levels), on the measured grid. */
export const QUAKE_MENU_LEVEL_LIST_Y = 32;
export const QUAKE_MENU_LEVEL_ROW_H = 8;
export const QUAKE_MENU_LEVEL_CODE_X = 56;
export const QUAKE_MENU_LEVEL_TITLE_X = 112;
export function quakeMenuLevelRowY(index: number): number {
  return QUAKE_MENU_LEVEL_LIST_Y + index * QUAKE_MENU_LEVEL_ROW_H;
}
export function quakeMenuLevelHotspots(levelCount: number): QuakeMenuSceneHotspot[] {
  const spots: QuakeMenuSceneHotspot[] = [];
  for (let i = 0; i < levelCount; i++) {
    const y = quakeMenuLevelRowY(i);
    spots.push({ id: `level:${i}`, rect: { x: 16, y, w: 272, h: 8 }, spinner: { x: QUAKE_MENU_LEVEL_CODE_X - 10, y, h: 8 } });
  }
  spots.push(BACK_HOTSPOT);
  return spots;
}

/** MULTIPLAYER form: measured rows every 16 q-units from y 38.4; labels at
 *  x 72; the NATIVE controls (kept as real inputs — text entry, the colour
 *  picker and the map dropdown are genuinely native) sit at x 166. */
export const QUAKE_MENU_MP_FIELDS: readonly { id: string; label: string }[] = [
  { id: "mp-name", label: "Name" },
  { id: "mp-color", label: "Color" },
  { id: "mp-map", label: "Map" },
  { id: "mp-fraglimit", label: "Fraglimit" },
  { id: "mp-maxplayers", label: "Max Players" },
];
export function quakeMenuMultiplayerFieldRowRect(index: number): QuakeMenuSceneRect {
  return { x: 72, y: 38.4 + index * 16, w: 217.6, h: 13 };
}
/** Box of the native control on field row `index` (the color swatch is 20 wide). */
export function quakeMenuMultiplayerControlRect(index: number): QuakeMenuSceneRect {
  return { x: 166, y: 38.9 + index * 16, w: index === 1 ? 20 : 123.6, h: 12 };
}
const MP_CREATE_RECT: QuakeMenuSceneRect = { x: 74, y: 121.4, w: 97.5, h: 14 };
const MP_BACK_RECT: QuakeMenuSceneRect = { x: 16, y: 179.2, w: 56, h: 8 };
function multiplayerTexts(): QuakeMenuSceneTextDef[] {
  const texts: QuakeMenuSceneTextDef[] = [
    // The panel title is 14-unit bitmap TEXT (not an image), measured at (64, 4).
    { id: "mp-title", x: 64, y: 4, h: 14, text: "Multiplayer", alt: true },
  ];
  QUAKE_MENU_MP_FIELDS.forEach((field, i) => {
    texts.push({ id: `${field.id}-label`, x: 72, y: 41 + i * 16, h: 8, text: field.label, item: field.id });
  });
  texts.push({ id: "mp-create", x: 78.7, y: 124.4, h: 8, text: "Create Room", item: "mp-create" });
  texts.push({ id: "mp-back", x: 16, y: 179.2, h: 8, text: "GO BACK", alt: true, item: "back" });
  // Failure card: the dynamic title, centred like the shipped card.
  return texts;
}
function multiplayerHotspots(): QuakeMenuSceneHotspot[] {
  const spots: QuakeMenuSceneHotspot[] = QUAKE_MENU_MP_FIELDS.map((field, i) => ({
    id: field.id,
    rect: quakeMenuMultiplayerFieldRowRect(i),
    spinner: { x: 60, y: 41 + i * 16, h: 8 },
  }));
  spots.push({ id: "mp-create", rect: MP_CREATE_RECT, spinner: { x: 62, y: 124.4, h: 8 } });
  spots.push({ id: "back", rect: MP_BACK_RECT, spinner: { x: 4, y: 179.2, h: 8 } });
  return spots;
}
/**
 * The active screen's interactive regions — the ONE source both the overlay
 * (spinner cursor placement) and the menu controller (pointer hit-testing,
 * keyboard order) read, so hover, click and the drawn cursor can never
 * disagree. Level rows are dynamic; the multiplayer failure card swaps the
 * form's hotspots for a lone GO BACK.
 */
export function quakeMenuSceneHotspotsFor(
  manifest: QuakeMenuSceneManifest,
  screen: QuakeMenuSceneScreen | null,
  levelCount: number,
  multiplayerFailure = false,
): readonly QuakeMenuSceneHotspot[] {
  if (!screen) return [];
  if (screen === "level-select") return quakeMenuLevelHotspots(levelCount);
  if (screen === "multiplayer" && multiplayerFailure) return QUAKE_MENU_MP_FAILURE_HOTSPOTS;
  return manifest.screens[screen]?.hotspots ?? [];
}

/** The failure card: dynamic title only ("ROOM FULL"), centred. */
export const QUAKE_MENU_MP_FAILURE_TEXTS: readonly QuakeMenuSceneTextDef[] = [
  { id: "mp-failure-title", x: 160, y: 80, h: 14, key: "mp:failure", alt: true, align: "center" },
  { id: "mp-failure-back", x: 16, y: 179.2, h: 8, text: "GO BACK", alt: true, item: "back" },
];
export const QUAKE_MENU_MP_FAILURE_HOTSPOTS: readonly QuakeMenuSceneHotspot[] = [
  { id: "back", rect: MP_BACK_RECT, spinner: { x: 4, y: 179.2, h: 8 } },
];

/* ── Viewport-anchored (host px) text layout: console, version, notify ── */
/** Boot console: left 12px, top 64px, 16px glyphs on an 18px pitch. */
export const QUAKE_CONSOLE_LEFT = 12;
export const QUAKE_CONSOLE_TOP = 64;
export const QUAKE_CONSOLE_GLYPH = 16;
export const QUAKE_CONSOLE_PITCH = 18;
/** Progress bar under the console (min(250px, 72vw) x 14, 8px gap). */
export const QUAKE_CONSOLE_PROGRESS_H = 14;
export const QUAKE_CONSOLE_GAP = 8;
export function quakeConsoleProgressWidth(hostW: number): number {
  return Math.min(250, hostW * 0.72);
}
/** Version tag: right of the logo (measured 247,30 at 1600w), 12px glyphs. */
export function quakeMenuVersionPos(hostW: number): { x: number; y: number; h: number } {
  const logo = quakeMenuSceneLogoRect(hostW);
  return { x: logo.x + logo.w + 8, y: 30, h: 12 };
}
/** Notify: left 8px under the logo (+12), 24px glyphs. Centerprint: centred,
 *  top clamped below the notify stack — the CSS custom properties as data. */
export function quakeNotifyLayout(hostW: number, hostH: number): {
  notify: { x: number; y: number; h: number };
  center: { y: number; h: number };
} {
  const logoH = Math.max(0, Math.min(45, (hostW - 92) * 0.1951));
  const notifyTop = 8 + logoH + 12;
  return {
    notify: { x: 8, y: notifyTop, h: 24 },
    center: { y: Math.max(0.35 * hostH, notifyTop + 96 + 12), h: 28 },
  };
}

export interface QuakeMenuSceneManifestOptions {
  /** Detail-layer density for the art (the app's `?glyphImageDensity=`). */
  readonly density?: number;
  /** Backdrop brightness (the app's `?glyphImageBackdrop=`). */
  readonly backdropBrightness?: number;
  /**
   * Density for the corner logo alone (`?glyphImageLogoDensity=`), defaulting
   * to `density`. The logo is a 1343x262 source drawn ~230x45 px — at the
   * shared art density its strokes fall below one detail cell and the mark
   * is illegible, while raising the SHARED density pays for every sprite.
   * Each distinct density is one extra `<pre>` layer, so a logo-only bump is
   * cheap.
   */
  readonly logoDensity?: number;
}

export function createQuakeMenuSceneManifest(
  options: QuakeMenuSceneManifestOptions = {},
): QuakeMenuSceneManifest {
  const density = options.density ?? 4;
  const landingSprites: QuakeMenuSceneSpriteDef[] = [
    // Plaque and title: top 1.25cqw (4q), plaque left 5cqw (16q) width 10cqw
    // (32q, art 32x144), title left 35cqw (112q) width 30cqw (96q, art 96x24).
    // RAW `/q/` textures, deliberately the same ones the panels draw, so the
    // plaque is the same colour on every page (the HTML's <img>s carry baked
    // variants; sampling those was the measured cross-page colour shift).
    {
      id: "landing-plaque",
      texture: "/q/main-menu-plaque.png",
      rect: { x: 16, y: 4, w: 32, h: 144 },
      layer: 1,
      density,
      segment: true,
    },
    {
      id: "landing-title",
      texture: "/q/main-menu-title.png",
      rect: { x: 112, y: 4, w: 96, h: 24 },
      layer: 1,
      density,
      segment: true,
    },
  ];
  LANDING_ITEMS.forEach((item, row) => {
    const rowY = LANDING_LIST_Y + row * LANDING_ROW_H;
    landingSprites.push({
      id: `landing-label-${item.id}`,
      texture: item.sheet,
      rect: { x: LANDING_LIST_X, y: rowY + item.offsetY, w: item.w, h: item.h },
      layer: 2,
      density,
      segment: true,
      sheet: { frames: 2, axis: "y" },
      item: item.id,
      role: "label",
    });
    landingSprites.push({
      id: `landing-cursor-${item.id}`,
      texture: landingCursorSheet,
      rect: {
        x: LANDING_LIST_X - LANDING_CURSOR_GAP - LANDING_CURSOR_W,
        y: rowY,
        w: LANDING_CURSOR_W,
        h: LANDING_CURSOR_H,
      },
      layer: 3,
      density,
      segment: true,
      sheet: { frames: 6, axis: "x" },
      animate: { periodMs: 600 },
      item: item.id,
      role: "cursor",
    });
  });

  /**
   * The PANEL screens, all sharing the same 320x200 card (`.quake-menu-card`
   * uses the identical sizing rule the landing frame does). Geometry extracted
   * from the live DOM (see file doc): the plaque `::before` measured
   * 43px/10.75px/86px/387px inside an 860x537.5 card = (16, 4, 32, 144)
   * q-units on every panel; title images sit at y=4 with the per-panel x and
   * size below; the single-player buttons stack at x=72 from y=32 in 20-unit
   * rows with the cursor box at x=54, exactly like the landing list.
   */
  const panelPlaque: QuakeMenuSceneSpriteDef = {
    id: "panel-plaque",
    texture: "/q/main-menu-plaque.png",
    rect: { x: 16, y: 4, w: 32, h: 144 },
    layer: 1,
    density,
    segment: true,
  };
  const panelTitle = (id: string, texture: string, rect: QuakeMenuSceneRect): QuakeMenuSceneSpriteDef => ({
    id, texture, rect, layer: 2, density, segment: true,
  });

  const SP_BUTTONS: readonly { id: string; texture: string; frames: number; frame: number; w: number }[] = [
    { id: "new-game", texture: singlePlayerLabelSheet, frames: 3, frame: 0, w: 232 },
    { id: "level-select", texture: levelSelectLabel, frames: 1, frame: 0, w: 211 },
    { id: "load", texture: singlePlayerLabelSheet, frames: 3, frame: 1, w: 232 },
    { id: "save", texture: singlePlayerLabelSheet, frames: 3, frame: 2, w: 232 },
  ];
  const singlePlayerSprites: QuakeMenuSceneSpriteDef[] = [
    panelPlaque,
    panelTitle("sp-title", "/q/menu-title-single-player.png", { x: 96, y: 4, w: 128, h: 24 }),
  ];
  SP_BUTTONS.forEach((b, row) => {
    const rowY = LANDING_LIST_Y + row * LANDING_ROW_H;
    singlePlayerSprites.push({
      id: `sp-label-${b.id}`,
      texture: b.texture,
      // Every frame of the art is 20 q-units tall at the button's own width.
      rect: { x: LANDING_LIST_X, y: rowY, w: b.w, h: 20 },
      layer: 2,
      density,
      segment: true,
      ...(b.frames > 1 ? { sheet: { frames: b.frames, axis: "y" as const }, frame: b.frame } : {}),
      item: b.id,
    });
    singlePlayerSprites.push({
      id: `sp-cursor-${b.id}`,
      // The RAW cursor sheet, as the panels' pseudo-element art declared it.
      texture: "/q/main-menu-cursor.png",
      rect: {
        x: LANDING_LIST_X - LANDING_CURSOR_GAP - LANDING_CURSOR_W,
        y: rowY,
        w: LANDING_CURSOR_W,
        h: LANDING_CURSOR_H,
      },
      layer: 3,
      density,
      segment: true,
      sheet: { frames: 6, axis: "x" },
      animate: { periodMs: 600 },
      item: b.id,
      role: "cursor",
    });
  });

  return {
    chrome: [
      {
        id: "backdrop",
        texture: "/q/menu-background.png",
        place: (hostW, hostH) => ({ x: 0, y: 0, w: hostW, h: hostH }),
        layer: 0,
        fit: "cover",
        brightness: options.backdropBrightness ?? 0.6,
      },
      {
        id: "logo",
        texture: asciiQuakeLogo,
        place: (hostW) => quakeMenuSceneLogoRect(hostW),
        layer: 3,
        density: Math.max(1, Math.round(options.logoDensity ?? density)),
        segment: true,
      },
    ],
    screens: {
      landing: {
        sprites: landingSprites,
        texts: [
          // "coming soon!" beside the multiplayer row, shown only while the
          // item is disabled — from the CSS note rule (left: 100% + 4q, 5q glyphs).
          {
            id: "landing-coming-soon",
            x: LANDING_LIST_X + 190 + 4,
            y: LANDING_LIST_Y + LANDING_ROW_H + 8,
            h: 5,
            text: "coming soon!",
            alt: true,
            item: "multiplayer",
            showWhenDisabled: true,
          },
        ],
        hotspots: LANDING_ITEMS.map((item, row) => ({
          id: item.id,
          rect: {
            x: LANDING_LIST_X - LANDING_CURSOR_GAP - LANDING_CURSOR_W,
            y: LANDING_LIST_Y + row * LANDING_ROW_H,
            w: LANDING_CURSOR_GAP + LANDING_CURSOR_W + item.w,
            h: LANDING_ROW_H,
          },
        })),
      },
      "single-player": {
        sprites: singlePlayerSprites,
        texts: [BACK_TEXT],
        hotspots: [
          ...SP_BUTTONS.map((b, row) => ({
            id: b.id,
            rect: {
              x: LANDING_LIST_X - LANDING_CURSOR_GAP - LANDING_CURSOR_W,
              y: LANDING_LIST_Y + row * LANDING_ROW_H,
              w: LANDING_CURSOR_GAP + LANDING_CURSOR_W + b.w,
              h: LANDING_ROW_H,
            },
          })),
          BACK_HOTSPOT,
        ],
      },
      multiplayer: {
        sprites: [panelPlaque],
        texts: multiplayerTexts(),
        hotspots: multiplayerHotspots(),
      },
      options: {
        sprites: [panelPlaque, panelTitle("options-title", "/q/menu-title-options.png", { x: 88, y: 4, w: 144, h: 24 })],
        texts: optionsTexts(),
        hotspots: optionsHotspots(),
      },
      help: {
        sprites: [panelPlaque, panelTitle("help-title", "/q/menu-title-help.png", { x: 112, y: 4, w: 96, h: 24 })],
        texts: helpTexts(),
        hotspots: [BACK_HOTSPOT],
      },
      "level-select": {
        sprites: [panelPlaque, panelTitle("level-title", "/q/menu-title-level-select.png", { x: 54.5, y: 4, w: 211, h: 20 })],
        texts: [BACK_TEXT],
        // Level-row hotspots are dynamic — quakeMenuLevelHotspots(levelCount).
      },
    },
    dimmedBrightness: 0.46,
  };
}
