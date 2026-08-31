/**
 * Declarative geometry for the gameplay HUD — the glyph overlay's source of
 * truth for the classic status bar and the crosshair, replacing the HTML HUD's
 * CSS layout the same way menuSceneManifest replaced the menu markup.
 *
 * ── Coordinate frame ─────────────────────────────────────────────────────────
 * The status bar is authored in Quake's native 320x24 frame ("hud units"),
 * exactly the frame the shipped CSS uses (`--quake-hud-px = 100cqw / 320` on a
 * `#quake-classic-hud` sized `min(max(320px, 83.2vh), 100vw)` with aspect-ratio
 * 320/24, centred at the bottom). `quakeHudSceneFrame()` is that sizing rule as
 * data; every rect below is in hud units against it.
 *
 * The slot geometry itself (icon positions and sheet windows) is NOT restated
 * here: hud.ts's QUAKE_HUD_SLOT_DEFINITIONS is already that data, and the
 * overlay draws straight from it. This module carries only what the CSS held —
 * the bar's screen placement, the readout layout, and the crosshair variants.
 */

import crosshairSheet from "../../assets/quake-crosshair-conchars.png";

/** Reference frame the status bar is authored in. */
export const QUAKE_HUD_SCENE_FRAME_W = 320;
export const QUAKE_HUD_SCENE_FRAME_H = 24;

/** Status bar art (`#quake-hud-status-row`'s background). Fully opaque. */
export const QUAKE_HUD_BASE_URL = "/q/hud-base.png";
/** 18-slot icon sheet, 24px per slot — see hud.ts's slot definitions. */
export const QUAKE_HUD_ICONS_URL = "/q/hud-icons.png";
export const QUAKE_HUD_ICONS_SHEET_W = 432;
export const QUAKE_HUD_ICONS_SHEET_H = 24;
/** Digit sheets: ten 24x24 frames. The damage variant flashes on hits. */
export const QUAKE_HUD_NUMBERS_URL = "/q/hud-numbers.png";
export const QUAKE_HUD_NUMBERS_DAMAGE_URL = "/q/hud-numbers-damage.png";
export const QUAKE_HUD_DIGIT_FRAMES = 10;
/** Digit cell in hud units (`.quake-hud-digit`: 24 x full bar height). */
export const QUAKE_HUD_DIGIT_W = 24;

/** Readout x positions in hud units (the CSS `--quake-hud-*-x` variables). */
export const QUAKE_HUD_READOUTS: readonly {
  readonly id: "armor" | "health" | "ammo";
  readonly x: number;
}[] = [
  { id: "armor", x: 24 },
  { id: "health", x: 136 },
  { id: "ammo", x: 248 },
];

/** The HTML bar's own background — the opaque ground the art sits on. */
export const QUAKE_HUD_BACKGROUND = "#050302";

/**
 * The smallest a READOUT may render, in CSS px — Quake's `scr_sbarscale` idea
 * expressed as a floor instead of an integer multiplier.
 *
 * A readout cell is `QUAKE_HUD_SCENE_FRAME_H` hud units square, so this is
 * also the bar's height, and `quakeHudSceneScaleFloorPx()` is the bar width
 * that produces it.
 *
 * ── Why a floor, and why 44 ───────────────────────────────────────────────
 * The shipped rule tied the bar to `83.2vh`, which is the RIGHT rule on a
 * desktop and the wrong one on a phone: a landscape phone's viewport height
 * is a third of a desktop's, so the bar shrank with it and the readouts came
 * out at 25.6 CSS px (measured, 846x411) against 56.2 on 1600x900 — the same
 * ~41% of viewport width, and that proportional-but-tiny result is exactly
 * the complaint. Quake ports answer this with a status-bar scale that grows
 * the bar on small displays rather than holding a fraction; at 846x411's
 * 2220x1080 device pixels QuakeSpasm's integer auto-scale lands the 320-wide
 * bar at roughly 70% of the screen, which is where this floor puts it too.
 *
 * 44 binds whenever `0.832 * hostH` is under the floor width 586.667, i.e.
 * below `hostH ≈ 705.13` CSS px (`44 * 320 / 24 / 0.832`) — shorter
 * desktop/windowed viewports do change. Verified unchanged: 1600x900,
 * 1440x900, 1366x768 and 1280x720 still resolve through the `83.2vh` term.
 * It is a CSS-px floor, not a device-px one, on purpose: DPR already
 * normalizes a CSS px to roughly constant angular size, so DPR belongs to
 * the GLYPH-resolution problem (`adaptQuakeUiDensitiesToDisplay`) and not
 * to how physically large the bar should be.
 */
export const QUAKE_HUD_MIN_READOUT_CSS_PX = 44;

/** The bar width at which a readout is {@link QUAKE_HUD_MIN_READOUT_CSS_PX}. */
export function quakeHudSceneScaleFloorPx(): number {
  return (QUAKE_HUD_MIN_READOUT_CSS_PX * QUAKE_HUD_SCENE_FRAME_W) / QUAKE_HUD_SCENE_FRAME_H;
}

/**
 * `#quake-classic-hud`'s sizing rule as data, plus the small-viewport floor:
 * `width: min(max(320px, 83.2vh, <readout floor>), 100vw)`, aspect 320/24,
 * centred, bottom 0. The `100vw` cap still wins last, so a portrait phone —
 * where even the floor does not fit — stays exactly full-bleed as before.
 */
export function quakeHudSceneFrame(
  hostW: number,
  hostH: number,
): { x: number; y: number; w: number; h: number } {
  const w = Math.min(
    Math.max(320, 0.832 * hostH, quakeHudSceneScaleFloorPx()),
    hostW,
  );
  const h = (w * QUAKE_HUD_SCENE_FRAME_H) / QUAKE_HUD_SCENE_FRAME_W;
  return { x: (hostW - w) / 2, y: hostH - h, w, h };
}

/**
 * Crosshair variants, from `#quake-crosshair`'s CSS: the conchars sheet is a
 * 16x16 glyph grid, `col`/`row` select the cell (the CSS `--quake-crosshair-bg`
 * offsets), and `tx`/`ty` are the centring translate percentages (of the
 * crosshair's own size) each variant applies around the exact screen centre.
 */
export const QUAKE_HUD_CROSSHAIR_SHEET = crosshairSheet;
export const QUAKE_HUD_CROSSHAIR_GRID = 16;
export const QUAKE_HUD_CROSSHAIR_VARIANTS: Readonly<
  Record<string, { col: number; row: number; tx: number; ty: number }>
> = {
  plus: { col: 11, row: 2, tx: -0.5, ty: -0.5 },
  dot: { col: 14, row: 2, tx: -0.28125, ty: -0.6875 },
  x: { col: 8, row: 7, tx: -0.5, ty: -0.5 },
  o: { col: 15, row: 6, tx: -0.5, ty: -0.5 },
  caret: { col: 14, row: 5, tx: -0.5, ty: 0.125 },
  vee: { col: 6, row: 7, tx: -0.58125, ty: -0.40625 },
};

/** Crosshair size in px: the CSS `clamp(8px, 2.08vh, 80px)`. */
export function quakeHudCrosshairSize(hostH: number): number {
  return Math.min(Math.max(8, 0.0208 * hostH), 80);
}
