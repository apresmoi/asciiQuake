/**
 * The SHIPPED per-element style table (2026-08 retune, glyph lab), as a
 * builder shared by App.ts (the game) and src/lab/main.ts (the glyph lab's
 * "complete first screen" preview) — one source of truth, so the lab can
 * never preview a drifted copy of what the game renders.
 *
 * One row per user-tuned element, keyed by its mesh styleTag. Each row
 * reproduces that element's approved LAB SESSION (see glyphTuningSpec.ts's
 * tone groups): `ambient` reaches glyphcss as the mesh's own ambient light
 * (glyph choice tracks it exactly), and `colorBoost` replays the lab's
 * styled-branch residual — the lab composes colours ×(1.65/scene ambient)
 * over every sprite it previews, so an element tuned there at ambient A was
 * approved with colours ×max(1, 1.65/A). Sprite rows use it; the console row
 * doesn't (its lab path had no residual).
 *
 * Palettes are passed in BY THE CALLER and must already be sanitized through
 * `sanitizeQuakeGlyphPalette` (ASCII-only policy, asciiGlyphPolicy.ts).
 */
import type { QuakeGlyphMeshStyle } from "../render/glyphUiOverlay";
import type { QuakeGlyphTuningValues } from "./glyphTuningSpec";

/** Per-element glyph ramp choices (each `"dense"` as shipped by default). */
export interface QuakeUiMeshPalettes {
  readonly logo: string;
  readonly text: string;
  readonly plaque: string;
  readonly title: string;
  readonly labels: string;
  /** Gameplay status bar art. */
  readonly hudBar: string;
  /** Gameplay readout digits and status icons. */
  readonly hudArt: string;
}

export function buildQuakeUiMeshStyles(
  t: QuakeGlyphTuningValues,
  palettes: QuakeUiMeshPalettes,
): Readonly<Record<string, QuakeGlyphMeshStyle>> {
  return {
    logo: {
      palette: palettes.logo,
      ambient: t.logoAmbient,
      gamma: t.logoGamma,
      saturation: t.logoSaturation,
      colorBoost: Math.max(1, 1.65 / t.logoAmbient),
      occlusionMarginPx: t.logoOcclusionMargin,
    },
    // ONE profile for every conchars run — boot console AND menu row text
    // (same font, same path; see drawGlyphRun). Seeded from the user's
    // console lab session; densities stay per element.
    text: {
      palette: palettes.text,
      ambient: t.textAmbient,
      gamma: t.textCellGamma,
      saturation: t.textCellSaturation,
      inkComp: t.textInkComp,
      strokePx: t.textStroke,
      sheetGamma: t.textSheetGamma,
      sheetSaturation: t.textSheetSaturation,
      occlusionMarginPx: t.textOcclusionMargin,
    },
    plaque: {
      palette: palettes.plaque,
      ambient: t.plaqueAmbient,
      gamma: t.plaqueGamma,
      saturation: t.plaqueSaturation,
      black: t.plaqueBlack,
      inkComp: t.plaqueInkComp,
      strokePx: t.plaqueStroke,
      colorBoost: Math.max(1, 1.65 / t.plaqueAmbient),
      occlusionMarginPx: t.plaqueOcclusionMargin,
    },
    title: {
      palette: palettes.title,
      ambient: t.titleAmbient,
      gamma: t.titleGamma,
      saturation: t.titleSaturation,
      black: t.titleBlack,
      inkComp: t.titleInkComp,
      strokePx: t.titleStroke,
      colorBoost: Math.max(1, 1.65 / t.titleAmbient),
      occlusionMarginPx: t.titleOcclusionMargin,
    },
    labels: {
      palette: palettes.labels,
      ambient: t.labelAmbient,
      gamma: t.labelGamma,
      saturation: t.labelSaturation,
      black: t.labelBlack,
      inkComp: t.labelInkComp,
      strokePx: t.labelStroke,
      colorBoost: Math.max(1, 1.65 / t.labelAmbient),
      occlusionMarginPx: t.labelOcclusionMargin,
    },
    // ── The gameplay HUD's two profiles ──
    // These carry NO `colorBoost`: the lab's styled-branch residual exists to
    // reproduce a session that previewed a sprite through the logo path, and
    // the HUD is measured in the running game against the bar it sits on, not
    // previewed as an isolated sprite. Adding a boost here would brighten the
    // digits by a factor that means nothing for this element.
    //
    // Nor an `occlusionMarginPx`: a contour margin cannot take a cell from
    // another opaque detail mesh in glyphcss 0.1.6, and the bar is exactly
    // that (see hudReadoutGroundSheet.ts). Both rows keep the default "alpha"
    // claim, which is what already lets the digits blank the bar under their
    // own ink; the margin around that ink comes from the derived sheet.
    "hud-bar": {
      palette: palettes.hudBar,
      ambient: t.hudBarAmbient,
      gamma: t.hudBarGamma,
      saturation: t.hudBarSaturation,
      black: t.hudBarBlack,
      white: t.hudBarWhite,
      inkComp: t.hudBarInkComp,
      strokePx: t.hudBarStroke,
    },
    "hud-art": {
      palette: palettes.hudArt,
      ambient: t.hudArtAmbient,
      gamma: t.hudArtGamma,
      saturation: t.hudArtSaturation,
      black: t.hudArtBlack,
      inkComp: t.hudArtInkComp,
      strokePx: t.hudArtStroke,
    },
  };
}
