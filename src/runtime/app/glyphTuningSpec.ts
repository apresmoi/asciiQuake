/**
 * The glyph renderer's tuning knobs as DATA: one row per knob, carrying the
 * URL parameter name, the slider range and the shipped default.
 *
 * Two consumers read this table so it exists at all:
 *  - App.ts resolves each knob's startup value from the URL through it
 *    (replacing the hand-repeated `quakeUrlNumberParam(..) ?? default` calls
 *    for the knobs the tuning panel owns), and
 *  - the `?debug` tuning panel builds its sliders from the same rows, so the
 *    panel's ranges/defaults can never drift from what the app actually
 *    parses, and its "copy URL" button knows every param name and which
 *    values differ from the defaults.
 */
export interface QuakeGlyphTuningKnob {
  /** Key in the resolved values record (and the overlay option it feeds). */
  readonly key: string;
  /** URL query parameter, e.g. `?glyphImageAmbient=`. */
  readonly param: string;
  /** Slider label in the tuning panel. */
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  /** Shipped default — the value used when the param is absent. */
  readonly def: number;
  /** Panel section header this knob sorts under. */
  readonly group: string;
}

export type QuakeGlyphTuningValues = Record<string, number>;

/** The UI/menu glyph scene (glyphUiOverlay) — menus, boot console, HUD art. */
export const QUAKE_GLYPH_UI_TUNING_KNOBS: readonly QuakeGlyphTuningKnob[] = [
  // ── Densities (cells per base cell — resolution of each detail layer) ──
  { key: "density", param: "glyphImageDensity", label: "art density", min: 1, max: 8, step: 1, def: 4, group: "Menu density" },
  // The logo and boot console get a FAR wider range than the shared art
  // density: both are small elements, so high density is cheap, and their
  // real ceilings are glyphcss's detail-grid cap (1024 cells per dimension —
  // ~27x for the logo's box at 1600px, ~13x for a full-width console block;
  // beyond it density silently stops getting finer) and the display's own
  // pixels (cells below one device pixel blur to grey). 32 comfortably
  // covers both limits on any display.
  //
  // Defaults, measured 2026-08 (screenshot comparison at DPR 1 and 2): the
  // logo at the old shared density 4 was illegible on every display — the
  // wordmark resolves from ~8 (DPR 1) and keeps improving to ~16 on DPR 2,
  // regressing to grey once cells drop below a device pixel. The spec's
  // literal is the DPR-1 value; App.ts raises it to 16 on high-DPI displays
  // when the URL doesn't pin one. The console plateaus at ~14 everywhere
  // (the 1024-cell cap coarsens a full-width console block to ~13 effective).
  //
  // 2026-08 retune (user, glyph lab): the shipped logo is the COARSE dense-ramp
  // look the user tuned at `?glyphImageCells=13000&glyphImageLogoDensity=2` in
  // the lab. The density below was matched EMPIRICALLY, by cells-across-the-logo
  // in the running game, NOT by scaling the cell budget.
  //
  // A budget-ratio formula (2·sqrt(13000/24000) = 1.472) was tried first and is
  // WRONG: `glyphImageCells` is a budget over the HOST AREA, and the lab's host
  // is the ~267px preview box while the game's is the full viewport, so the two
  // base cells are unrelated and no ratio transfers between them. Measured, that
  // default rendered the logo at half the lab's resolution per axis — 60x10
  // cells and 43 ink cells against the lab's 130x19 and 683.
  //
  // The old DPR-based lift (8 → 16 on high-DPI) is gone: this look is
  // deliberately chunky, nowhere near the sub-device-pixel regime it escaped.
  { key: "logoDensity", param: "glyphImageLogoDensity", label: "corner logo density", min: 1, max: 32, step: 0.01, def: 2.92, group: "Menu density" },
  { key: "textDensity", param: "glyphImageTextDensity", label: "menu text density", min: 1, max: 16, step: 1, def: 10, group: "Menu density" },
  // Per-element art densities (2026-08 retune, glyph lab): each element was
  // tuned by the user on its OWN lab grid, so its density is matched
  // EMPIRICALLY — cells-across-the-element in the game equal to the lab render
  // at the user's URL — never derived from a budget ratio (`glyphImageCells`
  // budgets the HOST area, and the lab host is not the game viewport; deriving
  // the logo's density that way was a measured half-resolution bug).
  { key: "plaqueDensity", param: "glyphImagePlaqueDensity", label: "menu plaque density", min: 1, max: 32, step: 0.01, def: 11.8, group: "Menu density" },
  { key: "titleDensity", param: "glyphImageTitleDensity", label: "menu title density", min: 1, max: 32, step: 0.01, def: 3.34, group: "Menu density" },
  { key: "labelDensity", param: "glyphImageLabelDensity", label: "menu label density", min: 1, max: 32, step: 0.01, def: 2.77, group: "Menu density" },
  // Matched EMPIRICALLY (2026-08, user lab session `?glyphImageCells=2000&
  // glyphImageConsoleDensity=7...`): equal cells-per-conchars-glyph, measured
  // in both renders at 1600x900 — NOT derived from any budget ratio (the lab
  // budget spans a different host). Fractional: rounding broke the match.
  { key: "consoleDensity", param: "glyphImageConsoleDensity", label: "boot console density", min: 1, max: 32, step: 0.01, def: 4.06, group: "Menu density" },
  { key: "maxCells", param: "glyphImageCells", label: "base grid budget", min: 2000, max: 120000, step: 1000, def: 24_000, group: "Menu density" },
  { key: "minCellPx", param: "glyphImageCell", label: "min cell px", min: 2, max: 24, step: 1, def: 3, group: "Menu density" },
  // ── Art tone (the detail layers: plaque, titles, labels, logo) ──
  { key: "ambient", param: "glyphImageAmbient", label: "ambient", min: 0.2, max: 6, step: 0.05, def: 3.0, group: "Menu tone" },
  { key: "gamma", param: "glyphImageGamma", label: "art gamma (lower = brighter)", min: 0.2, max: 1, step: 0.01, def: 0.4, group: "Menu tone" },
  { key: "saturation", param: "glyphImageSaturation", label: "art saturation", min: 0, max: 4, step: 0.05, def: 1.4, group: "Menu tone" },
  { key: "black", param: "glyphImageBlack", label: "art black point", min: 0, max: 0.5, step: 0.005, def: 0, group: "Menu tone" },
  { key: "white", param: "glyphImageWhite", label: "art white point", min: 0.5, max: 1, step: 0.005, def: 1, group: "Menu tone" },
  { key: "inkComp", param: "glyphImageInkComp", label: "ink compensation", min: 0, max: 1, step: 0.05, def: 1, group: "Menu tone" },
  { key: "stroke", param: "glyphImageStroke", label: "glyph stroke px", min: 0, max: 2, step: 0.05, def: 0.6, group: "Menu tone" },
  // ── Backdrop tone (the base layer: menu background art) ──
  { key: "backdrop", param: "glyphImageBackdrop", label: "backdrop brightness", min: 0, max: 1, step: 0.02, def: 0.6, group: "Backdrop tone" },
  { key: "backdropGamma", param: "glyphImageBackdropGamma", label: "backdrop gamma", min: 0.2, max: 1, step: 0.01, def: 0.6, group: "Backdrop tone" },
  { key: "backdropBlack", param: "glyphImageBackdropBlack", label: "backdrop black point", min: 0, max: 0.5, step: 0.005, def: 0, group: "Backdrop tone" },
  { key: "backdropWhite", param: "glyphImageBackdropWhite", label: "backdrop white point", min: 0.5, max: 1, step: 0.005, def: 1, group: "Backdrop tone" },
  // ── Conchars text (menu rows, boot console, notify) ──
  { key: "textGamma", param: "glyphImageTextGamma", label: "text gamma (lower = brighter)", min: 0.2, max: 1, step: 0.01, def: 0.38, group: "Text tone" },
  { key: "textSaturation", param: "glyphImageTextSaturation", label: "text saturation", min: 0, max: 4, step: 0.05, def: 1.35, group: "Text tone" },
  // ── Corner logo tone (logo detail layer ONLY — never the other art) ──
  // The user-tuned logo look (glyph lab, 2026-08): ambient 1.65, gamma 1
  // (no lift), saturation 1.1, on the `dense` ramp
  // (`?glyphImageLogoPalette=`, default "dense"). These are the same values
  // the user dialled in scene-wide (`?glyphImageAmbient=1.65&glyphImageGamma=1&
  // glyphImageSaturation=1.1`) but scoped to the logo's own mesh, so the
  // menu art, backdrop and console keep the shipped scene tone above.
  { key: "logoAmbient", param: "glyphImageLogoAmbient", label: "logo ambient", min: 0.2, max: 6, step: 0.05, def: 1.65, group: "Logo tone" },
  { key: "logoGamma", param: "glyphImageLogoGamma", label: "logo gamma (lower = brighter)", min: 0.2, max: 1, step: 0.01, def: 1, group: "Logo tone" },
  { key: "logoSaturation", param: "glyphImageLogoSaturation", label: "logo saturation", min: 0, max: 4, step: 0.05, def: 1.1, group: "Logo tone" },
  // Occlusion margin (glyphcss contour claims via the style table): screen px
  // of alpha-contour-following ground around the ink. Contour claims are also
  // the anti-theft fix (every ink-bearing cell claims); the base-cell pad
  // that preceded them read as a fat square halo and is gone.
  { key: "logoOcclusionMargin", param: "glyphImageLogoOcclusionMargin", label: "logo occlusion margin px", min: 0, max: 8, step: 0.25, def: 2, group: "Logo tone" },

  // ── Per-element tone (2026-08 retune, glyph lab) ──
  // Each group reproduces one lab session the user signed off. The values are
  // the session's EFFECTIVE composite, not the raw URL: the lab's styled
  // branch applies its own gamma/saturation defaults (1 / 1.1) over sprite
  // sources regardless of the scene sliders, so that is what the user SAW —
  // and matching the lab render is the contract. Ambients reach glyphcss as
  // each mesh's own `ambientIntensity` (glyph choice follows them exactly);
  // an element that leaves a knob at its shipped default inherits the scene.
  //
  // Conchars text — ONE tone profile for every menu-scene conchars run: the
  // boot console AND the menu row text (options/help/level rows, the version
  // tag). They are the same font drawn through the same `drawGlyphRun` path,
  // so they share a profile by design (user, 2026-08: "the text of the menus
  // like options should use the same as the boot sequence font"). Seeded from
  // the user's console lab session `?glyphImageCells=2000
  // &glyphImageConsoleDensity=7&glyphImageAmbient=0.8&glyphImageGamma=1
  // &glyphImageSaturation=1.25&glyphImageStroke=0.3&glyphImageTextGamma=0.37
  // &glyphImageTextSaturation=1.45&glyphImagePalette=dense`. Densities stay
  // per element (`textDensity` / `consoleDensity` above). The pre-existing
  // `textGamma`/`textSaturation` sheet knobs keep their meaning and defaults
  // for UNstyled runs (intermission bitmap text); the styled profile carries
  // its own sheet pair below.
  { key: "textAmbient", param: "glyphImageTextAmbient", label: "text ambient", min: 0.2, max: 6, step: 0.05, def: 0.8, group: "Text profile" },
  { key: "textCellGamma", param: "glyphImageTextCellGamma", label: "text cell gamma (lower = brighter)", min: 0.2, max: 1, step: 0.01, def: 1, group: "Text profile" },
  { key: "textCellSaturation", param: "glyphImageTextCellSaturation", label: "text cell saturation", min: 0, max: 4, step: 0.05, def: 1.25, group: "Text profile" },
  { key: "textSheetGamma", param: "glyphImageTextSheetGamma", label: "text sheet gamma", min: 0.2, max: 1, step: 0.01, def: 0.37, group: "Text profile" },
  { key: "textSheetSaturation", param: "glyphImageTextSheetSaturation", label: "text sheet saturation", min: 0, max: 4, step: 0.05, def: 1.45, group: "Text profile" },
  { key: "textStroke", param: "glyphImageTextStroke", label: "text glyph stroke px", min: 0, max: 2, step: 0.05, def: 0.3, group: "Text profile" },
  { key: "textInkComp", param: "glyphImageTextInkComp", label: "text ink compensation", min: 0, max: 1, step: 0.05, def: 1, group: "Text profile" },
  { key: "textOcclusionMargin", param: "glyphImageTextOcclusionMargin", label: "text occlusion margin px", min: 0, max: 8, step: 0.25, def: 2, group: "Text profile" },

  // Menu plaque — lab `?glyphImageCells=4000&glyphImageCell=4
  // &glyphImageAmbient=0.9&glyphImageBlack=0.01&glyphImageStroke=0.75
  // &glyphImagePalette=dense` (sprite source: styled branch, gamma 1 / sat 1.1).
  { key: "plaqueAmbient", param: "glyphImagePlaqueAmbient", label: "plaque ambient", min: 0.2, max: 6, step: 0.05, def: 0.9, group: "Plaque tone" },
  { key: "plaqueGamma", param: "glyphImagePlaqueGamma", label: "plaque gamma (lower = brighter)", min: 0.2, max: 1, step: 0.01, def: 1, group: "Plaque tone" },
  { key: "plaqueSaturation", param: "glyphImagePlaqueSaturation", label: "plaque saturation", min: 0, max: 4, step: 0.05, def: 1.1, group: "Plaque tone" },
  { key: "plaqueBlack", param: "glyphImagePlaqueBlack", label: "plaque black point", min: 0, max: 0.5, step: 0.005, def: 0.01, group: "Plaque tone" },
  { key: "plaqueStroke", param: "glyphImagePlaqueStroke", label: "plaque glyph stroke px", min: 0, max: 2, step: 0.05, def: 0.75, group: "Plaque tone" },
  { key: "plaqueInkComp", param: "glyphImagePlaqueInkComp", label: "plaque ink compensation", min: 0, max: 1, step: 0.05, def: 1, group: "Plaque tone" },
  { key: "plaqueOcclusionMargin", param: "glyphImagePlaqueOcclusionMargin", label: "plaque occlusion margin px", min: 0, max: 8, step: 0.25, def: 2, group: "Plaque tone" },

  // Menu title — lab `?glyphImageCells=3000&glyphImageCell=2
  // &glyphImageAmbient=0.55&glyphImageBlack=0.01&glyphImageInkComp=0.2
  // &glyphImageStroke=0.75&glyphImagePalette=dense` (sprite source).
  { key: "titleAmbient", param: "glyphImageTitleAmbient", label: "title ambient", min: 0.2, max: 6, step: 0.05, def: 0.55, group: "Title tone" },
  { key: "titleGamma", param: "glyphImageTitleGamma", label: "title gamma (lower = brighter)", min: 0.2, max: 1, step: 0.01, def: 1, group: "Title tone" },
  { key: "titleSaturation", param: "glyphImageTitleSaturation", label: "title saturation", min: 0, max: 4, step: 0.05, def: 1.1, group: "Title tone" },
  { key: "titleBlack", param: "glyphImageTitleBlack", label: "title black point", min: 0, max: 0.5, step: 0.005, def: 0.01, group: "Title tone" },
  { key: "titleStroke", param: "glyphImageTitleStroke", label: "title glyph stroke px", min: 0, max: 2, step: 0.05, def: 0.75, group: "Title tone" },
  { key: "titleInkComp", param: "glyphImageTitleInkComp", label: "title ink compensation", min: 0, max: 1, step: 0.05, def: 0.2, group: "Title tone" },
  { key: "titleOcclusionMargin", param: "glyphImageTitleOcclusionMargin", label: "title occlusion margin px", min: 0, max: 8, step: 0.25, def: 2, group: "Title tone" },

  // Menu label sheet — identical lab tone to the title (only its grid differs:
  // `?glyphImageCells=10000&glyphImageCell=2`), so the tone rows match and the
  // density above is its own.
  { key: "labelAmbient", param: "glyphImageLabelAmbient", label: "label ambient", min: 0.2, max: 6, step: 0.05, def: 0.55, group: "Label tone" },
  { key: "labelGamma", param: "glyphImageLabelGamma", label: "label gamma (lower = brighter)", min: 0.2, max: 1, step: 0.01, def: 1, group: "Label tone" },
  { key: "labelSaturation", param: "glyphImageLabelSaturation", label: "label saturation", min: 0, max: 4, step: 0.05, def: 1.1, group: "Label tone" },
  { key: "labelBlack", param: "glyphImageLabelBlack", label: "label black point", min: 0, max: 0.5, step: 0.005, def: 0.01, group: "Label tone" },
  { key: "labelStroke", param: "glyphImageLabelStroke", label: "label glyph stroke px", min: 0, max: 2, step: 0.05, def: 0.75, group: "Label tone" },
  { key: "labelInkComp", param: "glyphImageLabelInkComp", label: "label ink compensation", min: 0, max: 1, step: 0.05, def: 0.2, group: "Label tone" },
  { key: "labelOcclusionMargin", param: "glyphImageLabelOcclusionMargin", label: "label occlusion margin px", min: 0, max: 8, step: 0.25, def: 2, group: "Label tone" },

  // ── Gameplay HUD ───────────────────────────────────────────────────────────
  // The status bar and its readouts, split into TWO profiles because they
  // want opposite treatments: the bar is a busy 320x24 texture that has to
  // sit back, and the digits/icons on top of it have to come forward.
  //
  // Both were code constants until now (HUD_BAR_AMBIENT / HUD_*_DENSITY in
  // glyphUiOverlay) with no lab session behind them, and no style-table row —
  // which is why the digits were never tunable. They are rows now, with the
  // same knob-per-lever shape as every menu element, so the lab drives them.
  //
  // Defaults measured 2026-08 (in-game screenshots at 1600x900 DPR 1 and
  // 846x411 DPR 2.625, e1m1, fresh spawn). At the old settings the readouts'
  // ink sat at Weber 0.23-0.38 against the bar showing through their own
  // footprint, with only ~50% of each digit's footprint rendering any ink at
  // all — the numbers read as darker blotches in orange noise, which is the
  // reported "not visible by contrast".
  //
  // BAR: the levels operate in POST-AMBIENT space; the bar's post-ambient
  // mean is only 17.7/255 = 0.069, so ANY black point above ~0.069 crushes the
  // majority of the bar (at black 0.08, 6506 of 7680 texels — 84.71% — were
  // forced to exact black). The bar's quiet look comes from the load-bearing
  // 0.55 ambient alone, and its tone curve stays at identity (gamma 1, black 0,
  // white 1, sat 1) so liftCellColors takes its identity early return.
  // Warning: raising hudBarBlack re-introduces the crushed black slab.
  // Ink compensation and stroke restore the scene-inherited defaults that
  // explicit zeros silently dropped; setting either back to 0 fades the bar.
  { key: "hudBarDensity", param: "glyphImageHudBarDensity", label: "hud bar density", min: 1, max: 8, step: 0.01, def: 2, group: "HUD bar tone" },
  { key: "hudBarAmbient", param: "glyphImageHudBarAmbient", label: "hud bar ambient", min: 0.1, max: 6, step: 0.05, def: 0.55, group: "HUD bar tone" },
  { key: "hudBarGamma", param: "glyphImageHudBarGamma", label: "hud bar gamma (lower = brighter)", min: 0.2, max: 1, step: 0.01, def: 1, group: "HUD bar tone" },
  { key: "hudBarSaturation", param: "glyphImageHudBarSaturation", label: "hud bar saturation", min: 0, max: 4, step: 0.05, def: 1, group: "HUD bar tone" },
  { key: "hudBarBlack", param: "glyphImageHudBarBlack", label: "hud bar black point", min: 0, max: 0.5, step: 0.005, def: 0, group: "HUD bar tone" },
  { key: "hudBarWhite", param: "glyphImageHudBarWhite", label: "hud bar white point", min: 0.5, max: 1, step: 0.005, def: 1, group: "HUD bar tone" },
  { key: "hudBarStroke", param: "glyphImageHudBarStroke", label: "hud bar glyph stroke px", min: 0, max: 2, step: 0.05, def: 0.6, group: "HUD bar tone" },
  { key: "hudBarInkComp", param: "glyphImageHudBarInkComp", label: "hud bar ink compensation", min: 0, max: 1, step: 0.05, def: 1, group: "HUD bar tone" },

  // ART (readout digits + status icons): the digit sheet is uniformly DARK —
  // measured, dist/q/hud-numbers.png has mean ink luma 41.5 and max 107.7
  // (37.9% opaque, alpha strictly binary) — so at the scene ambient the darker
  // half of every digit fell below the ramp's first step and rendered as spaces,
  // which is the "only fragments survived" reading. The ambient here is the
  // direct fix: it multiplies the texel luma that picks the glyph, so it buys
  // coverage AND colour at once. The stroke thickens what does render.
  { key: "hudArtDensity", param: "glyphImageHudArtDensity", label: "hud art density", min: 1, max: 8, step: 0.01, def: 4, group: "HUD art tone" },
  { key: "hudArtAmbient", param: "glyphImageHudArtAmbient", label: "hud art ambient", min: 0.1, max: 8, step: 0.05, def: 5.5, group: "HUD art tone" },
  { key: "hudArtGamma", param: "glyphImageHudArtGamma", label: "hud art gamma (lower = brighter)", min: 0.2, max: 1, step: 0.01, def: 0.7, group: "HUD art tone" },
  { key: "hudArtSaturation", param: "glyphImageHudArtSaturation", label: "hud art saturation", min: 0, max: 4, step: 0.05, def: 1.3, group: "HUD art tone" },
  { key: "hudArtBlack", param: "glyphImageHudArtBlack", label: "hud art black point", min: 0, max: 0.5, step: 0.005, def: 0, group: "HUD art tone" },
  { key: "hudArtStroke", param: "glyphImageHudArtStroke", label: "hud art glyph stroke px", min: 0, max: 2, step: 0.05, def: 0.8, group: "HUD art tone" },
  { key: "hudArtInkComp", param: "glyphImageHudArtInkComp", label: "hud art ink compensation", min: 0, max: 1, step: 0.05, def: 1, group: "HUD art tone" },
  // The readouts' quiet ground, in SOURCE TEXELS of the 24-texel digit cell —
  // see hudReadoutGroundSheet.ts for why this is baked into the sheet's alpha
  // instead of being a glyphcss contour margin (the fully opaque bar owns
  // every cell a contour margin could have taken).
  { key: "hudArtGroundTexels", param: "glyphImageHudArtGround", label: "hud readout ground texels", min: 0, max: 6, step: 0.25, def: 2, group: "HUD art tone" },
] as const;

/** The world glyph scene (glyphWorldOverlay) — gameplay ASCII.
 *
 * Tone defaults (2026-08 retune vs cssquake.wtf, e1m1): measured per-SEGMENT
 * (walls / entities / viewmodel) across 10 poses, the old `brighten 6.5 +
 * gamma 0.7` put the glyph INK at 2.0-2.6x the reference's surface luminance
 * at every pose — the whole-frame block mean matched, but the eye reads the
 * ink, so the game looked much brighter than the reference. The shipped
 * values land ink at ~1.4x reference surface tone (block mean ~0.8x, the
 * glyph medium's tradeoff) with the `dense` ramp carrying coverage. Ambient
 * 0.8 / dir 0.25: the reference's lighting is fully baked into face colours,
 * so the old dir 0.6 orientation shading double-darkened shadow-facing walls
 * (measured worst at the e1m1 start-hall door: block mean 31 vs reference 51). */
export const QUAKE_GLYPH_WORLD_TUNING_KNOBS: readonly QuakeGlyphTuningKnob[] = [
  { key: "brighten", param: "glyphBright", label: "brighten (linear)", min: 1, max: 12, step: 0.1, def: 2.0, group: "World tone" },
  { key: "gamma", param: "glyphGamma", label: "gamma (lower = brighter)", min: 0.2, max: 1, step: 0.01, def: 1, group: "World tone" },
  { key: "black", param: "glyphBlack", label: "black point", min: 0, max: 0.5, step: 0.005, def: 0, group: "World tone" },
  { key: "white", param: "glyphWhite", label: "white point", min: 0.5, max: 1, step: 0.005, def: 1, group: "World tone" },
  { key: "flat", param: "glyphFlat", label: "flatten colours", min: 0, max: 1, step: 0.02, def: 0, group: "World tone" },
  { key: "stroke", param: "glyphStroke", label: "glyph stroke px", min: 0, max: 2, step: 0.05, def: 0.4, group: "World tone" },
  { key: "ambient", param: "glyphAmbient", label: "ambient light", min: 0, max: 1, step: 0.02, def: 0.8, group: "World light" },
  { key: "dir", param: "glyphDir", label: "directional light", min: 0, max: 1, step: 0.02, def: 0.25, group: "World light" },
  { key: "cell", param: "glyphCell", label: "cell px (detail)", min: 6, max: 40, step: 1, def: 12, group: "World grid" },
] as const;

/** The UI density knobs whose defaults are EMPIRICAL matches to the user's
 *  2026-08 lab sessions (see each row's comment above). They all express
 *  "cells per base cell", so their approved look is really a detail-cell size
 *  in DEVICE pixels — the quantity `adaptQuakeUiDensitiesToDisplay` preserves. */
export const QUAKE_GLYPH_UI_DENSITY_KEYS = [
  "density",
  "logoDensity",
  "textDensity",
  "plaqueDensity",
  "titleDensity",
  "labelDensity",
  "consoleDensity",
] as const;

/** Monospace advance fraction — the same measured constant the overlay and
 *  App.ts use to convert a cell budget into a cell size. */
const QUAKE_GLYPH_UI_CELL_ASPECT = 0.606;

/** The UI base cell in DEVICE px at the 2026-08 tuning sessions: 1600x900,
 *  DPR 2 → fitted sqrt(1600*900 / (0.606 * 24000)) = 9.95 CSS px = 19.9. */
export const QUAKE_GLYPH_UI_TUNING_BASE_CELL_DEVICE_PX = 19.9;

/**
 * Make the per-element densities viewport/DPR aware: on displays whose UI
 * base cell is SMALLER (in device px) than the 1600x900/DPR-2 cell the
 * densities were tuned on, scale them down proportionally so every detail
 * cell keeps its approved DEVICE-pixel size instead of shrinking into the
 * sub-device-pixel grey-mush regime.
 *
 * Measured need (iPhone-14-class, 390x844, DPR 3): the base cell fits at
 * 4.76 CSS px = 14.3 device px — 72% of the tuning session's 19.9 — which
 * put the plaque's detail cells at 1.21 device px (approved: 1.69; rendered:
 * unreadable mush) and the title's at 4.27 (approved: 5.96). The factor
 * min(1, baseDevicePx / 19.9) restores exactly the approved sizes; on the
 * tuning display itself it is 1.0, so desktop renders are bit-identical.
 *
 * URL-pinned knobs are the user's explicit choice and are never scaled.
 * Mutates `values` in place; call between resolve and mount.
 */
export function adaptQuakeUiDensitiesToDisplay(
  values: QuakeGlyphTuningValues,
  params: URLSearchParams,
  display: { hostW: number; hostH: number; dpr: number },
): void {
  const maxCells = Math.max(256, values.maxCells ?? 24_000);
  const minCellPx = Math.max(2, values.minCellPx ?? 3);
  const fitted = Math.sqrt(
    (Math.max(1, display.hostW) * Math.max(1, display.hostH)) / (QUAKE_GLYPH_UI_CELL_ASPECT * maxCells),
  );
  const baseDevicePx = Math.max(minCellPx, fitted) * Math.max(0.5, display.dpr || 1);
  const factor = Math.min(1, baseDevicePx / QUAKE_GLYPH_UI_TUNING_BASE_CELL_DEVICE_PX);
  if (factor >= 1) return;
  const densityKeys = new Set<string>(QUAKE_GLYPH_UI_DENSITY_KEYS);
  for (const knob of QUAKE_GLYPH_UI_TUNING_KNOBS) {
    if (!densityKeys.has(knob.key)) continue;
    // A URL-pinned knob (present and valid — the same acceptance rule the
    // resolver applies) stays the user's literal value.
    const raw = params.get(knob.param);
    const parsed = raw === null ? Number.NaN : Number.parseFloat(raw);
    if (Number.isFinite(parsed) && parsed >= knob.min && parsed <= knob.max) continue;
    values[knob.key] = Math.max(knob.min, values[knob.key]! * factor);
  }
}

/**
 * Resolve every knob's startup value: the URL param when present and inside
 * the knob's range, the shipped default otherwise — the same contract
 * App.ts's `quakeUrlNumberParam(...) ?? default` expressed per call site.
 */
export function readQuakeGlyphTuningValues(
  knobs: readonly QuakeGlyphTuningKnob[],
  params: URLSearchParams,
): QuakeGlyphTuningValues {
  const values: QuakeGlyphTuningValues = {};
  for (const knob of knobs) {
    const raw = params.get(knob.param);
    const parsed = raw === null ? Number.NaN : Number.parseFloat(raw);
    values[knob.key] =
      Number.isFinite(parsed) && parsed >= knob.min && parsed <= knob.max ? parsed : knob.def;
  }
  return values;
}
