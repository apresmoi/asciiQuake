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

export interface QuakeMenuSceneManifestOptions {
  /** Detail-layer density for the art (the app's `?glyphImageDensity=`). */
  readonly density?: number;
  /** Backdrop brightness (the app's `?glyphImageBackdrop=`). */
  readonly backdropBrightness?: number;
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
        density,
        segment: true,
      },
    ],
    screens: {
      landing: { sprites: landingSprites },
      "single-player": { sprites: singlePlayerSprites },
      // The multiplayer form and every option/help/level row is TEXT — still
      // HTML until the text stage — so these screens' manifest art is the
      // plaque and (where one exists) the title image. The multiplayer title
      // is bitmap text, not an image.
      multiplayer: { sprites: [panelPlaque] },
      options: {
        sprites: [panelPlaque, panelTitle("options-title", "/q/menu-title-options.png", { x: 88, y: 4, w: 144, h: 24 })],
      },
      help: {
        sprites: [panelPlaque, panelTitle("help-title", "/q/menu-title-help.png", { x: 112, y: 4, w: 96, h: 24 })],
      },
      "level-select": {
        sprites: [panelPlaque, panelTitle("level-title", "/q/menu-title-level-select.png", { x: 54.5, y: 4, w: 211, h: 20 })],
      },
    },
    dimmedBrightness: 0.46,
  };
}
