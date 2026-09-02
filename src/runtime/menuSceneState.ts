/**
 * The menu's presentation state as DATA, shared between the code that OWNS the
 * state (the menu controller, the loading flow) and the glyph overlay that
 * draws the menu from the scene manifest.
 *
 * This store exists to invert the overlay's old relationship with the DOM: it
 * used to *discover* what to draw by measuring live elements (bounding rects,
 * computed backgrounds, class toggles watched on a poll), so deleting a single
 * element deleted the instruction to draw that art. With the manifest holding
 * the geometry and this store holding the state, the DOM is no longer an
 * input to rendering — the controller pushes "landing menu, item 2 active"
 * and the overlay draws that from data.
 *
 * Deliberately a plain module-level singleton: the menu is a singleton, the
 * overlay is a singleton, and threading a store instance through the six
 * modules that touch menu state would be plumbing for its own sake.
 */

export type QuakeMenuSceneScreen =
  | "landing"
  | "single-player"
  | "multiplayer"
  | "options"
  | "help"
  | "level-select";

export interface QuakeMenuSceneState {
  /** Which menu screen is up, or null when no menu surface is visible. */
  readonly screen: QuakeMenuSceneScreen | null;
  /** Selected item id on the active screen (the landing actions, panel buttons). */
  readonly activeItem: string | null;
  /** Item ids rendered dimmed and skipped by selection. */
  readonly disabledItems: readonly string[];
  /** Startup "pending" dim: items at reduced brightness, no cursor. */
  readonly pending: boolean;
  /** Startup deferral: the landing menu exists but must not render yet. */
  readonly deferred: boolean;
  /** Multiplayer panel showing its failure card instead of the form. */
  readonly multiplayerFailure: boolean;
  /**
   * Whether the scene's CHROME (menu backdrop + corner logo) is up. Mirrors the
   * loading overlay's visibility — the backdrop belongs to the pre-game menu
   * and loading screens, never to gameplay: the in-game Esc menu draws its
   * sprites straight over the world, exactly as the HTML menu painted over the
   * scene. Owned by the loading flow, which owns the overlay's `hidden` flag.
   */
  readonly chrome: boolean;
  /** The gameplay HUD's presentation state — see {@link QuakeHudSceneState}. */
  readonly hud: QuakeHudSceneState;
  /** Multiplayer scoreboard drawn by the glyph scene, never as visible HTML. */
  readonly scoreboard: QuakeMultiplayerScoreboardSceneState;
  /**
   * Dynamic strings by key, drawn by the manifest text defs (`key` lookups):
   * option values ("opt:<rowId>"), the version tag ("version"), the
   * multiplayer failure title ("mp:failure"). Positions live in the manifest;
   * only the words live here.
   */
  readonly texts: Readonly<Record<string, string>>;
  /** Boot/loading console lines, newest last — drawn viewport-anchored. */
  readonly consoleLines: readonly string[];
  /** Action line under the console (asset-regeneration hint), or null. */
  readonly consoleAction: string | null;
  /** Loading progress 0..1 for the console progress bar, or null = hidden. */
  readonly consoleProgress: number | null;
  /** Death presentation: the console shows its lines huge and centred. */
  readonly consoleDeath: boolean;
  /** Level-select rows, in menu order. */
  readonly levels: readonly QuakeMenuSceneLevel[];
  /** Gameplay notify lines (top-left) and centerprint lines (centred). */
  readonly notifyLines: readonly string[];
  readonly centerLines: readonly string[];
  /** Item id whose NATIVE control has focus — its glyph cursor pauses. */
  readonly editingItem: string | null;
}

export interface QuakeMenuSceneLevel {
  readonly map: string;
  /** "E1M1" — the alt-coloured code column. */
  readonly code: string;
  /** "The Slipgate Complex" — the title column. */
  readonly title: string;
  readonly current: boolean;
}

/**
 * The classic status bar and crosshair as DATA, pushed by the code that owns
 * each piece (hud.ts computes slots/readouts from the inventory, the HUD flow
 * owns the damage cue, the options flow owns the crosshair choice). The glyph
 * overlay draws the HUD from this — the HTML HUD elements' `hidden` flags and
 * CSS variables are no longer an input to rendering.
 */
export interface QuakeHudSceneState {
  /** Ids of the visible status-bar slots (hud.ts's QuakeHudSlotId values). */
  readonly slots: readonly string[];
  /** 3-character right-aligned readouts, exactly as the digits render them. */
  readonly armor: string;
  readonly health: string;
  readonly ammo: string;
  /** Damage cue: the health readout uses the damage-flash number sheet. */
  readonly damage: boolean;
  /** Crosshair variant ("off" hides it). Matches the options flow's values. */
  readonly crosshair: string;
}

export interface QuakeMultiplayerScoreboardSceneRow {
  readonly clientId: string;
  readonly deaths: number;
  readonly displayName: string;
  readonly frags: number;
  readonly local: boolean;
  readonly pingMs: number | null;
}

export interface QuakeMultiplayerScoreboardSceneState {
  readonly rows: readonly QuakeMultiplayerScoreboardSceneRow[];
  readonly spectatorCount: number;
  readonly visible: boolean;
}

type Listener = () => void;

// Mirrors the boot markup: <body class="quake-menu-open quake-main-menu-pending">
// plus the `quake-main-menu-deferred` class main.ts adds before the app boots.
let state: QuakeMenuSceneState = {
  screen: "landing",
  activeItem: "single-player",
  disabledItems: ["quit"],
  pending: true,
  deferred: true,
  multiplayerFailure: false,
  // The boot markup shows the loading overlay, so the chrome starts up.
  chrome: true,
  hud: {
    slots: [],
    armor: "",
    health: "",
    ammo: "",
    damage: false,
    // The options flow's default (index 1, "plus") — pushed properly the first
    // time the crosshair option is applied.
    crosshair: "plus",
  },
  scoreboard: {
    rows: [],
    spectatorCount: 0,
    visible: false,
  },
  texts: {},
  consoleLines: [],
  consoleAction: null,
  consoleProgress: null,
  consoleDeath: false,
  levels: [],
  notifyLines: [],
  centerLines: [],
  editingItem: null,
};

const listeners = new Set<Listener>();

export function getQuakeMenuSceneState(): QuakeMenuSceneState {
  return state;
}

export function updateQuakeMenuSceneState(partial: Partial<QuakeMenuSceneState>): void {
  const next = { ...state, ...partial };
  if (
    next.screen === state.screen &&
    next.activeItem === state.activeItem &&
    next.pending === state.pending &&
    next.deferred === state.deferred &&
    next.multiplayerFailure === state.multiplayerFailure &&
    next.chrome === state.chrome &&
    hudSceneStatesEqual(next.hud, state.hud) &&
    scoreboardSceneStatesEqual(next.scoreboard, state.scoreboard) &&
    stringArraysEqual(next.disabledItems, state.disabledItems) &&
    next.texts === state.texts &&
    stringArraysEqual(next.consoleLines, state.consoleLines) &&
    next.consoleAction === state.consoleAction &&
    next.consoleProgress === state.consoleProgress &&
    next.consoleDeath === state.consoleDeath &&
    next.levels === state.levels &&
    stringArraysEqual(next.notifyLines, state.notifyLines) &&
    stringArraysEqual(next.centerLines, state.centerLines) &&
    next.editingItem === state.editingItem
  ) {
    return;
  }
  state = next;
  for (const listener of listeners) listener();
}

export function updateQuakeHudSceneState(partial: Partial<QuakeHudSceneState>): void {
  updateQuakeMenuSceneState({ hud: { ...state.hud, ...partial } });
}

/** Merge dynamic strings into `texts` (values are drawn by manifest `key` defs). */
export function updateQuakeMenuSceneTexts(partial: Record<string, string>): void {
  let changed = false;
  for (const [key, value] of Object.entries(partial)) {
    if (state.texts[key] !== value) { changed = true; break; }
  }
  if (!changed) return;
  updateQuakeMenuSceneState({ texts: { ...state.texts, ...partial } });
}

function stringArraysEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function hudSceneStatesEqual(a: QuakeHudSceneState, b: QuakeHudSceneState): boolean {
  return (
    a.armor === b.armor &&
    a.health === b.health &&
    a.ammo === b.ammo &&
    a.damage === b.damage &&
    a.crosshair === b.crosshair &&
    a.slots.length === b.slots.length &&
    a.slots.every((id, i) => id === b.slots[i])
  );
}

function scoreboardSceneStatesEqual(
  a: QuakeMultiplayerScoreboardSceneState,
  b: QuakeMultiplayerScoreboardSceneState,
): boolean {
  return (
    a.visible === b.visible &&
    a.spectatorCount === b.spectatorCount &&
    a.rows.length === b.rows.length &&
    a.rows.every((row, index) => {
      const other = b.rows[index];
      return Boolean(
        other &&
        row.clientId === other.clientId &&
        row.deaths === other.deaths &&
        row.displayName === other.displayName &&
        row.frags === other.frags &&
        row.local === other.local &&
        row.pingMs === other.pingMs
      );
    })
  );
}

export function subscribeQuakeMenuSceneState(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

if (import.meta.env?.DEV) {
  // Dev handle for programmatic screen reveals (verification tooling): lets a
  // script drive the scene state the same way the menu controller does.
  (window as unknown as { __quakeMenuSceneState?: unknown }).__quakeMenuSceneState = {
    get: getQuakeMenuSceneState,
    update: updateQuakeMenuSceneState,
  };
}
