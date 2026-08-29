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
  // Occlusion pad (glyphcss `occlusionDilate` via the style table): id-map
  // cells of claim dilation — the anti-theft fix plus a small letterform-
  // shaped ground. 0 = alpha-tight claims.
  { key: "logoOcclusionPad", param: "glyphImageLogoOcclusionPad", label: "logo occlusion pad", min: 0, max: 4, step: 1, def: 2, group: "Logo tone" },

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
  { key: "textOcclusionPad", param: "glyphImageTextOcclusionPad", label: "text occlusion pad", min: 0, max: 4, step: 1, def: 2, group: "Text profile" },

  // Menu plaque — lab `?glyphImageCells=4000&glyphImageCell=4
  // &glyphImageAmbient=0.9&glyphImageBlack=0.01&glyphImageStroke=0.75
  // &glyphImagePalette=dense` (sprite source: styled branch, gamma 1 / sat 1.1).
  { key: "plaqueAmbient", param: "glyphImagePlaqueAmbient", label: "plaque ambient", min: 0.2, max: 6, step: 0.05, def: 0.9, group: "Plaque tone" },
  { key: "plaqueGamma", param: "glyphImagePlaqueGamma", label: "plaque gamma (lower = brighter)", min: 0.2, max: 1, step: 0.01, def: 1, group: "Plaque tone" },
  { key: "plaqueSaturation", param: "glyphImagePlaqueSaturation", label: "plaque saturation", min: 0, max: 4, step: 0.05, def: 1.1, group: "Plaque tone" },
  { key: "plaqueBlack", param: "glyphImagePlaqueBlack", label: "plaque black point", min: 0, max: 0.5, step: 0.005, def: 0.01, group: "Plaque tone" },
  { key: "plaqueStroke", param: "glyphImagePlaqueStroke", label: "plaque glyph stroke px", min: 0, max: 2, step: 0.05, def: 0.75, group: "Plaque tone" },
  { key: "plaqueInkComp", param: "glyphImagePlaqueInkComp", label: "plaque ink compensation", min: 0, max: 1, step: 0.05, def: 1, group: "Plaque tone" },
  { key: "plaqueOcclusionPad", param: "glyphImagePlaqueOcclusionPad", label: "plaque occlusion pad", min: 0, max: 4, step: 1, def: 2, group: "Plaque tone" },

  // Menu title — lab `?glyphImageCells=3000&glyphImageCell=2
  // &glyphImageAmbient=0.55&glyphImageBlack=0.01&glyphImageInkComp=0.2
  // &glyphImageStroke=0.75&glyphImagePalette=dense` (sprite source).
  { key: "titleAmbient", param: "glyphImageTitleAmbient", label: "title ambient", min: 0.2, max: 6, step: 0.05, def: 0.55, group: "Title tone" },
  { key: "titleGamma", param: "glyphImageTitleGamma", label: "title gamma (lower = brighter)", min: 0.2, max: 1, step: 0.01, def: 1, group: "Title tone" },
  { key: "titleSaturation", param: "glyphImageTitleSaturation", label: "title saturation", min: 0, max: 4, step: 0.05, def: 1.1, group: "Title tone" },
  { key: "titleBlack", param: "glyphImageTitleBlack", label: "title black point", min: 0, max: 0.5, step: 0.005, def: 0.01, group: "Title tone" },
  { key: "titleStroke", param: "glyphImageTitleStroke", label: "title glyph stroke px", min: 0, max: 2, step: 0.05, def: 0.75, group: "Title tone" },
  { key: "titleInkComp", param: "glyphImageTitleInkComp", label: "title ink compensation", min: 0, max: 1, step: 0.05, def: 0.2, group: "Title tone" },
  { key: "titleOcclusionPad", param: "glyphImageTitleOcclusionPad", label: "title occlusion pad", min: 0, max: 4, step: 1, def: 2, group: "Title tone" },

  // Menu label sheet — identical lab tone to the title (only its grid differs:
  // `?glyphImageCells=10000&glyphImageCell=2`), so the tone rows match and the
  // density above is its own.
  { key: "labelAmbient", param: "glyphImageLabelAmbient", label: "label ambient", min: 0.2, max: 6, step: 0.05, def: 0.55, group: "Label tone" },
  { key: "labelGamma", param: "glyphImageLabelGamma", label: "label gamma (lower = brighter)", min: 0.2, max: 1, step: 0.01, def: 1, group: "Label tone" },
  { key: "labelSaturation", param: "glyphImageLabelSaturation", label: "label saturation", min: 0, max: 4, step: 0.05, def: 1.1, group: "Label tone" },
  { key: "labelBlack", param: "glyphImageLabelBlack", label: "label black point", min: 0, max: 0.5, step: 0.005, def: 0.01, group: "Label tone" },
  { key: "labelStroke", param: "glyphImageLabelStroke", label: "label glyph stroke px", min: 0, max: 2, step: 0.05, def: 0.75, group: "Label tone" },
  { key: "labelInkComp", param: "glyphImageLabelInkComp", label: "label ink compensation", min: 0, max: 1, step: 0.05, def: 0.2, group: "Label tone" },
  { key: "labelOcclusionPad", param: "glyphImageLabelOcclusionPad", label: "label occlusion pad", min: 0, max: 4, step: 1, def: 2, group: "Label tone" },
] as const;

/** The world glyph scene (glyphWorldOverlay) — gameplay ASCII. */
export const QUAKE_GLYPH_WORLD_TUNING_KNOBS: readonly QuakeGlyphTuningKnob[] = [
  { key: "brighten", param: "glyphBright", label: "brighten (linear)", min: 1, max: 12, step: 0.1, def: 6.5, group: "World tone" },
  { key: "gamma", param: "glyphGamma", label: "gamma (lower = brighter)", min: 0.2, max: 1, step: 0.01, def: 0.7, group: "World tone" },
  { key: "black", param: "glyphBlack", label: "black point", min: 0, max: 0.5, step: 0.005, def: 0, group: "World tone" },
  { key: "white", param: "glyphWhite", label: "white point", min: 0.5, max: 1, step: 0.005, def: 1, group: "World tone" },
  { key: "flat", param: "glyphFlat", label: "flatten colours", min: 0, max: 1, step: 0.02, def: 0, group: "World tone" },
  { key: "stroke", param: "glyphStroke", label: "glyph stroke px", min: 0, max: 2, step: 0.05, def: 0.4, group: "World tone" },
  { key: "ambient", param: "glyphAmbient", label: "ambient light", min: 0, max: 1, step: 0.02, def: 0.5, group: "World light" },
  { key: "dir", param: "glyphDir", label: "directional light", min: 0, max: 1, step: 0.02, def: 0.6, group: "World light" },
  { key: "cell", param: "glyphCell", label: "cell px (detail)", min: 6, max: 40, step: 1, def: 12, group: "World grid" },
] as const;

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
