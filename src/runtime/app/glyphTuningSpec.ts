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
  { key: "consoleDensity", param: "glyphImageConsoleDensity", label: "boot console density", min: 1, max: 32, step: 1, def: 14, group: "Menu density" },
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
