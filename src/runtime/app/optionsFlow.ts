import { updateQuakeHudSceneState } from "../menuSceneState";
import type { QuakeMenuOptionRow } from "../menu";

export type QuakeCrosshairOption = "off" | "plus" | "dot" | "x" | "o" | "caret" | "vee";

interface QuakeCrosshairDefinition {
  value: QuakeCrosshairOption;
  label: string;
}

const QUAKE_CROSSHAIR_OPTIONS: QuakeCrosshairDefinition[] = [
  { value: "off", label: "off" },
  { value: "plus", label: "+" },
  { value: "dot", label: "." },
  { value: "x", label: "x" },
  { value: "o", label: "o" },
  { value: "caret", label: "^" },
  { value: "vee", label: "v" },
];

/**
 * The options screen as a ROW MODEL — the DOM-free replacement for the old
 * checkbox/cycle-button flow. Each row binds a manifest layout row (by id,
 * see QUAKE_MENU_OPTIONS_ROWS) to the app state it reads and writes; the
 * menu controller walks these rows for keyboard/pointer activation and
 * pushes their `value()` strings into the scene state for the overlay to
 * draw. No checkbox holds state any more — the getters ARE the state.
 */
export interface QuakeOptionsFlowOptions {
  audioMuted(): boolean;
  damageDisabled(): boolean;
  dynamicLightingEnabled(): boolean;
  renderModeIsGlyph(): boolean;
  enemiesDisabled(): boolean;
  enemiesFrozen(): boolean;
  attacksDisabled(): boolean;
  impactParticlesEnabled(): boolean;
  invertMouse(): boolean;
  showOutlines(): boolean;
  statsPanelEnabled(): boolean;
  showFps(): boolean;
  unlockAudio(): void;
  setAudioMuted(muted: boolean): void;
  setDamageDisabled(disabled: boolean): void;
  setDynamicLighting(enabled: boolean): void;
  setRenderMode(glyph: boolean): void;
  setEnemiesDisabled(disabled: boolean): void;
  setEnemiesFrozen(frozen: boolean): void;
  setAttacksDisabled(disabled: boolean): void;
  setImpactParticles(enabled: boolean): void;
  setInvertMouse(invert: boolean): void;
  setShowOutlines(enabled: boolean): void;
  setStatsPanel(enabled: boolean): void;
  setShowFps(enabled: boolean): void;
  setStaticLightingClass(enabled: boolean): void;
  /** Current ASCII-detail level name for display (glyph backend). */
  glyphDetailLabel(): string;
  /** Cycle the ASCII detail level (reloads with the new cell size). */
  cycleGlyphDetail(direction: number): void;
  /** Current glyph-set name for display (glyph backend). */
  glyphPaletteLabel(): string;
  /** Cycle the glyph set — applies live, no reload. */
  cycleGlyphPalette(direction: number): void;
}

export interface QuakeOptionsFlow {
  /** The options screen's rows, in manifest layout order. */
  rows(): readonly QuakeMenuOptionRow[];
  cycleCrosshairOption(direction: number): void;
  setCrosshairOption(value: QuakeCrosshairOption): void;
  crosshairLabel(): string;
  syncControls(): void;
  dispose(): void;
}

export function createQuakeOptionsFlow(options: QuakeOptionsFlowOptions): QuakeOptionsFlow {
  let crosshairOption: QuakeCrosshairOption = "plus";

  function setCrosshairOption(value: QuakeCrosshairOption): void {
    crosshairOption = value;
    const definition = quakeCrosshairDefinition(value);
    // The glyph HUD draws the crosshair from this data ("off" hides it).
    updateQuakeHudSceneState({ crosshair: definition.value });
  }

  function cycleCrosshairOption(direction: number): void {
    const step = direction < 0 ? -1 : 1;
    const index = QUAKE_CROSSHAIR_OPTIONS.findIndex((option) => option.value === crosshairOption);
    const currentIndex = index >= 0 ? index : 1;
    const next = QUAKE_CROSSHAIR_OPTIONS[
      (currentIndex + step + QUAKE_CROSSHAIR_OPTIONS.length) % QUAKE_CROSSHAIR_OPTIONS.length
    ];
    setCrosshairOption(next.value);
  }

  function crosshairLabel(): string {
    return quakeCrosshairDefinition(crosshairOption).label;
  }

  const onOff = (value: boolean) => (value ? "on" : "off");
  const toggle = (id: string, get: () => boolean, set: (next: boolean) => void): QuakeMenuOptionRow => ({
    id,
    value: () => onOff(get()),
    activate: () => set(!get()),
  });

  // Row ids and order match QUAKE_MENU_OPTIONS_ROWS in the scene manifest —
  // the manifest owns each row's position and label, this model its meaning.
  const rowModel: readonly QuakeMenuOptionRow[] = [
    toggle("show-outlines", options.showOutlines, options.setShowOutlines),
    toggle("show-stats", options.statsPanelEnabled, options.setStatsPanel),
    toggle("show-fps", options.showFps, options.setShowFps),
    {
      id: "crosshair",
      value: crosshairLabel,
      activate: (direction) => cycleCrosshairOption(direction),
    },
    toggle("dynamic-lighting", options.dynamicLightingEnabled, (next) => {
      options.setDynamicLighting(next);
      options.setStaticLightingClass(!next);
    }),
    toggle("render-mode", options.renderModeIsGlyph, options.setRenderMode),
    {
      id: "glyph-detail",
      value: options.glyphDetailLabel,
      activate: (direction) => options.cycleGlyphDetail(direction),
    },
    {
      id: "glyph-palette",
      value: options.glyphPaletteLabel,
      activate: (direction) => options.cycleGlyphPalette(direction),
    },
    toggle("mute-sounds", options.audioMuted, (next) => {
      options.unlockAudio();
      options.setAudioMuted(next);
    }),
    toggle("show-particles", options.impactParticlesEnabled, options.setImpactParticles),
    // Shipped mapping preserved: the row's value mirrors the DISABLE flag the
    // old checkbox held, exactly as `#quake-option-disable-enemies` did.
    toggle("show-enemies", options.enemiesDisabled, options.setEnemiesDisabled),
    toggle("disable-damage", options.damageDisabled, options.setDamageDisabled),
    toggle("disable-movement", options.enemiesFrozen, options.setEnemiesFrozen),
    toggle("disable-attacks", options.attacksDisabled, options.setAttacksDisabled),
    toggle("invert-mouse", options.invertMouse, options.setInvertMouse),
  ];

  function syncControls(): void {
    options.setStaticLightingClass(!options.dynamicLightingEnabled());
    setCrosshairOption(crosshairOption);
  }

  return {
    rows: () => rowModel,
    cycleCrosshairOption,
    setCrosshairOption,
    crosshairLabel,
    syncControls,
    dispose: () => {},
  };
}

function quakeCrosshairDefinition(value: QuakeCrosshairOption): QuakeCrosshairDefinition {
  return QUAKE_CROSSHAIR_OPTIONS.find((option) => option.value === value) ?? QUAKE_CROSSHAIR_OPTIONS[1];
}
