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
 * `#quake-classic-hud`'s sizing rule as data:
 * `width: min(max(320px, 83.2vh), 100vw)`, aspect 320/24, centred, bottom 0.
 */
export function quakeHudSceneFrame(
  hostW: number,
  hostH: number,
): { x: number; y: number; w: number; h: number } {
  const w = Math.min(Math.max(320, 0.832 * hostH), hostW);
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
