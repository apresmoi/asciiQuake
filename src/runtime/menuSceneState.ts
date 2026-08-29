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
    next.disabledItems.length === state.disabledItems.length &&
    next.disabledItems.every((id, i) => id === state.disabledItems[i])
  ) {
    return;
  }
  state = next;
  for (const listener of listeners) listener();
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
