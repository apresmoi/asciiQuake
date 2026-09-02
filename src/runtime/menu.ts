import {
  getQuakeMenuSceneState,
  updateQuakeMenuSceneState,
  updateQuakeMenuSceneTexts,
  type QuakeMenuSceneLevel,
  type QuakeMenuSceneScreen,
} from "./menuSceneState";
import {
  QUAKE_MENU_SCENE_FRAME_H,
  QUAKE_MENU_SCENE_FRAME_W,
  quakeMenuMultiplayerControlRect,
  quakeMenuSceneFrame,
  quakeMenuSceneHotspotsFor,
  type QuakeMenuSceneHotspot,
  type QuakeMenuSceneManifest,
} from "./render/menuSceneManifest";

/**
 * The menu controller, DOM-free.
 *
 * The old controller owned a tree of panels, buttons, checkboxes and focus —
 * the glyph overlay then traced that tree to know what to draw. This one owns
 * only DATA: which screen is up, which item is active, what each option row's
 * value reads. The overlay draws that state from the scene manifest, and this
 * controller resolves pointer input against the SAME manifest hotspots the
 * overlay uses for its cursor, so hit-testing and rendering cannot disagree.
 *
 * The only elements it touches are the multiplayer form's five NATIVE
 * controls (text entry, the colour picker, the map dropdown — genuinely
 * native behaviour), which it positions over their manifest rects while the
 * multiplayer screen is up.
 */

interface QuakeMenuControls {
  update(partial: { moveEnabled?: boolean }): void;
  lock(): void;
  addEventListener(type: "start" | "end", listener: () => void): void;
  removeEventListener(type: "start" | "end", listener: () => void): void;
}

/** One options-screen row: id matches the manifest layout row, value/activate
 *  bind it to the app state it controls. */
export interface QuakeMenuOptionRow {
  readonly id: string;
  value(): string;
  activate(direction: number): void;
}

export interface QuakeMenuMultiplayerControlBinding {
  /** Hotspot/item id ("mp-name" … "mp-maxplayers"), in field-row order. */
  readonly id: string;
  readonly element: HTMLElement;
}

export interface QuakeMenuController {
  showMainMenu(): void;
  hideMainMenu(): void;
  showMultiplayerFailure(title: string): void;
  isMainMenuOpen(): boolean;
  isMenuPanelOpen(): boolean;
  setCurrentLevel(mapName: string): void;
  handleKeyDown(event: KeyboardEvent): boolean;
  focusCurrent(): void;
  /** Re-push option row values into the scene state (a value changed). */
  syncOptionTexts(): void;
  dispose(): void;
}

export interface QuakeMenuControllerOptions {
  enabled: boolean;
  host: HTMLElement;
  controls: QuakeMenuControls;
  manifest: QuakeMenuSceneManifest;
  optionRows?: () => readonly QuakeMenuOptionRow[];
  levels?: () => readonly QuakeMenuSceneLevel[];
  multiplayerControls?: () => readonly QuakeMenuMultiplayerControlBinding[];
  mountMultiplayerControls?(): void;
  unmountMultiplayerControls?(): void;
  onMultiplayerSubmit?(): void;
  onSelectNewGame?(): void | Promise<void>;
  onShowMultiplayer?(): void;
  onLoadGame?(): void | Promise<void>;
  onSaveGame?(): void | Promise<void>;
  onSelectLevel?(mapName: string): void | Promise<void>;
  onSelectQuit?(): void;
  canLoadGame?(): boolean;
  canSaveGame?(): boolean;
  isMultiplayerEnabled?(): boolean;
  isQuitEnabled?(): boolean;
  onMenuVisibilityChange?(visible: boolean): void;
  onMenuPauseChange?(paused: boolean): void;
  onResumeMainMenuFromEscape?(): void;
  shouldResumeMainMenuOnEscape?(): boolean;
  shouldOpenMainMenuOnControlsEnd?(): boolean;
  clearCrosshairTarget(): void;
  syncCrosshairTarget(): void;
}

export function createQuakeMenuController(options: QuakeMenuControllerOptions): QuakeMenuController {
  const {
    enabled,
    host,
    controls,
    manifest,
  } = options;

  let startingNewGame = false;
  let loadingGame = false;
  let savingGame = false;
  let loadingLevelMap: string | null = null;
  /** Last active item per screen, so reopening a screen restores selection. */
  const lastActiveByScreen = new Map<QuakeMenuSceneScreen, string>();

  function state() {
    return getQuakeMenuSceneState();
  }

  function currentScreen(): QuakeMenuSceneScreen | null {
    return state().screen;
  }

  function isMainMenuOpen(): boolean {
    return enabled && currentScreen() === "landing";
  }

  function isMenuPanelOpen(): boolean {
    const screen = currentScreen();
    return enabled && screen !== null && screen !== "landing";
  }

  // ── Item model ─────────────────────────────────────────────────────────────

  function disabledItemsFor(screen: QuakeMenuSceneScreen): string[] {
    if (screen === "landing") {
      const disabled: string[] = [];
      if (!options.isQuitEnabled?.()) disabled.push("quit");
      if (!(options.isMultiplayerEnabled?.() ?? true)) disabled.push("multiplayer");
      return disabled;
    }
    if (screen === "single-player") {
      const busy = startingNewGame || loadingGame || savingGame;
      const disabled: string[] = [];
      if (busy) disabled.push("new-game", "level-select");
      if (busy || !options.onLoadGame || !options.canLoadGame?.()) disabled.push("load");
      if (busy || !options.onSaveGame || !options.canSaveGame?.()) disabled.push("save");
      return disabled;
    }
    return [];
  }

  function hotspots(): readonly QuakeMenuSceneHotspot[] {
    const st = state();
    return quakeMenuSceneHotspotsFor(manifest, st.screen, st.levels.length, st.multiplayerFailure);
  }

  /** Selectable item ids on the current screen, in keyboard order. */
  function selectableItems(): string[] {
    const st = state();
    if (!st.screen) return [];
    const disabled = st.disabledItems;
    return hotspots()
      .map((spot) => spot.id)
      .filter((id) => !disabled.includes(id));
  }

  function setActiveItem(item: string | null): void {
    const screen = currentScreen();
    if (screen && item) lastActiveByScreen.set(screen, item);
    updateQuakeMenuSceneState({ activeItem: item });
  }

  function moveSelection(delta: number): void {
    const items = selectableItems();
    if (!items.length) return;
    const current = state().activeItem;
    const index = current ? items.indexOf(current) : -1;
    const next = items[(Math.max(0, index) + delta + items.length) % items.length]!;
    setActiveItem(next);
    syncMultiplayerFocusForItem(next);
  }

  // ── Screen transitions ─────────────────────────────────────────────────────

  function openScreen(screen: QuakeMenuSceneScreen): void {
    controls.update({ moveEnabled: false });
    if (screen === "level-select") refreshLevels();
    if (screen === "options") syncOptionTexts();
    const disabledItems = disabledItemsFor(screen);
    const remembered = lastActiveByScreen.get(screen);
    const wasOpen = currentScreen() !== null;
    updateQuakeMenuSceneState({ screen, disabledItems, editingItem: null });
    const items = selectableItems();
    const active = remembered && items.includes(remembered) ? remembered : items[0] ?? null;
    updateQuakeMenuSceneState({ activeItem: active });
    document.body.classList.add("quake-menu-open");
    syncMultiplayerControls();
    if (!wasOpen) {
      options.onMenuVisibilityChange?.(true);
    }
    options.onMenuPauseChange?.(true);
    options.clearCrosshairTarget();
  }

  function showMainMenu(): void {
    if (!enabled) {
      hideMainMenu();
      return;
    }
    // Showing the menu IS the end of any startup deferral — the route flow
    // clears this on boot, but a caller-driven show must never leave the
    // scene suppressed.
    document.body.classList.remove("quake-main-menu-deferred");
    updateQuakeMenuSceneState({ multiplayerFailure: false, deferred: false });
    openScreen("landing");
  }

  function hideMainMenu(): void {
    controls.update({ moveEnabled: true });
    clearPendingMainMenu();
    const wasOpen = currentScreen() !== null;
    updateQuakeMenuSceneState({ screen: null, activeItem: null, multiplayerFailure: false, editingItem: null });
    document.body.classList.remove("quake-menu-open");
    document.body.classList.remove("quake-menu-pointer");
    syncMultiplayerControls();
    if (wasOpen) {
      options.onMenuVisibilityChange?.(false);
      options.onMenuPauseChange?.(false);
    }
    host.focus({ preventScroll: true });
    options.syncCrosshairTarget();
  }

  function clearPendingMainMenu(): void {
    document.body.classList.remove("quake-main-menu-pending");
    updateQuakeMenuSceneState({ pending: false });
  }

  function startFromMainMenu(): void {
    controls.lock();
    hideMainMenu();
  }

  function closeMenuPanel(): void {
    if (!isMenuPanelOpen()) return;
    if (currentScreen() === "level-select") {
      openScreen("single-player");
      return;
    }
    updateQuakeMenuSceneState({ multiplayerFailure: false });
    showMainMenu();
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  function selectNewGame(): void {
    if (!options.onSelectNewGame) {
      startFromMainMenu();
      return;
    }
    if (startingNewGame) return;
    startingNewGame = true;
    hideMainMenu();
    Promise.resolve(options.onSelectNewGame())
      .then(() => {
        startingNewGame = false;
        clearPendingMainMenu();
        controls.lock();
      })
      .catch((error: unknown) => {
        console.error(error);
        startingNewGame = false;
        clearPendingMainMenu();
        openScreen("single-player");
      });
  }

  function selectLoadGame(): void {
    if (!options.onLoadGame || loadingGame || !options.canLoadGame?.()) return;
    loadingGame = true;
    hideMainMenu();
    Promise.resolve(options.onLoadGame())
      .then(() => {
        loadingGame = false;
        controls.lock();
      })
      .catch((error: unknown) => {
        console.error(error);
        loadingGame = false;
        openScreen("single-player");
      });
  }

  function selectSaveGame(): void {
    if (!options.onSaveGame || savingGame || !options.canSaveGame?.()) return;
    savingGame = true;
    syncSinglePlayerAvailability();
    Promise.resolve(options.onSaveGame())
      .then(() => {
        savingGame = false;
        syncSinglePlayerAvailability();
      })
      .catch((error: unknown) => {
        console.error(error);
        savingGame = false;
        openScreen("single-player");
      });
  }

  function syncSinglePlayerAvailability(): void {
    if (currentScreen() !== "single-player") return;
    updateQuakeMenuSceneState({ disabledItems: disabledItemsFor("single-player") });
  }

  function selectLevel(index: number): void {
    const level = state().levels[index];
    if (!level || !options.onSelectLevel || loadingLevelMap) return;
    loadingLevelMap = level.map;
    hideMainMenu();
    Promise.resolve(options.onSelectLevel(level.map))
      .then(() => {
        loadingLevelMap = null;
        controls.lock();
      })
      .catch((error: unknown) => {
        console.error(error);
        loadingLevelMap = null;
        openScreen("level-select");
      });
  }

  function refreshLevels(): void {
    updateQuakeMenuSceneState({ levels: options.levels?.() ?? [] });
  }

  function setCurrentLevel(_mapName: string): void {
    // Level rows carry a `current` flag computed by the provider — re-pull.
    if (state().levels.length || currentScreen() === "level-select") refreshLevels();
  }

  function syncOptionTexts(): void {
    const rows = options.optionRows?.() ?? [];
    const texts: Record<string, string> = {};
    for (const row of rows) texts[`opt:${row.id}`] = row.value();
    updateQuakeMenuSceneTexts(texts);
  }

  function activateOptionRow(id: string, direction: number): void {
    const row = (options.optionRows?.() ?? []).find((r) => r.id === id);
    if (!row) return;
    row.activate(direction);
    syncOptionTexts();
  }

  function activateItem(item: string | null): void {
    const screen = currentScreen();
    if (!item || !screen) return;
    if (state().disabledItems.includes(item)) return;
    if (item === "back") {
      closeMenuPanel();
      return;
    }
    switch (screen) {
      case "landing":
        if (item === "single-player") openScreen("single-player");
        else if (item === "multiplayer") showMultiplayerPanel();
        else if (item === "options") openScreen("options");
        else if (item === "help") openScreen("help");
        else if (item === "quit" && options.isQuitEnabled?.()) options.onSelectQuit?.();
        return;
      case "single-player":
        if (item === "new-game") selectNewGame();
        else if (item === "level-select") openScreen("level-select");
        else if (item === "load") selectLoadGame();
        else if (item === "save") selectSaveGame();
        return;
      case "options":
        activateOptionRow(item, 1);
        return;
      case "level-select": {
        const match = /^level:(\d+)$/.exec(item);
        if (match) selectLevel(Number(match[1]));
        return;
      }
      case "multiplayer":
        if (item === "mp-create") options.onMultiplayerSubmit?.();
        else focusMultiplayerControl(item);
        return;
      default:
        return;
    }
  }

  // ── Multiplayer native controls ────────────────────────────────────────────

  function multiplayerBindings(): readonly QuakeMenuMultiplayerControlBinding[] {
    return options.multiplayerControls?.() ?? [];
  }

  function showMultiplayerPanel(): void {
    if (!(options.isMultiplayerEnabled?.() ?? true)) return;
    updateQuakeMenuSceneState({ multiplayerFailure: false });
    openScreen("multiplayer");
    options.onShowMultiplayer?.();
    syncMultiplayerControls();
  }

  function showMultiplayerFailure(title: string): void {
    if (!enabled) {
      showMainMenu();
      return;
    }
    updateQuakeMenuSceneTexts({ "mp:failure": title });
    updateQuakeMenuSceneState({ multiplayerFailure: true });
    openScreen("multiplayer");
    updateQuakeMenuSceneState({ activeItem: "back" });
  }

  /** Mount and position native controls only while their screen is visible. */
  function syncMultiplayerControls(): void {
    const st = state();
    const visible = st.screen === "multiplayer" && !st.multiplayerFailure && !st.deferred;
    if (!visible) {
      options.unmountMultiplayerControls?.();
      return;
    }
    options.mountMultiplayerControls?.();
    const bindings = multiplayerBindings();
    if (!bindings.length) return;
    const frame = quakeMenuSceneFrame(window.innerWidth, window.innerHeight);
    const sx = frame.w / QUAKE_MENU_SCENE_FRAME_W;
    const sy = frame.h / QUAKE_MENU_SCENE_FRAME_H;
    bindings.forEach((binding, index) => {
      const el = binding.element;
      const rect = quakeMenuMultiplayerControlRect(index);
      el.style.left = `${frame.x + rect.x * sx}px`;
      el.style.top = `${frame.y + rect.y * sy}px`;
      el.style.width = `${rect.w * sx}px`;
      el.style.height = `${rect.h * sy}px`;
      el.style.fontSize = `${6 * sy}px`;
    });
  }

  function focusMultiplayerControl(item: string): void {
    const binding = multiplayerBindings().find((b) => b.id === item);
    binding?.element.focus({ preventScroll: true });
  }

  function syncMultiplayerFocusForItem(item: string): void {
    if (currentScreen() !== "multiplayer") return;
    if (multiplayerBindings().some((b) => b.id === item)) {
      focusMultiplayerControl(item);
    } else if (document.activeElement instanceof HTMLElement &&
               multiplayerBindings().some((b) => b.element === document.activeElement)) {
      document.activeElement.blur();
    }
  }

  function handleControlFocus(event: FocusEvent): void {
    const binding = multiplayerBindings().find((b) => b.element === event.currentTarget);
    if (!binding) return;
    setActiveItem(binding.id);
    updateQuakeMenuSceneState({ editingItem: binding.id });
  }

  function handleControlBlur(): void {
    updateQuakeMenuSceneState({ editingItem: null });
  }

  // ── Pointer input: hit-test the manifest hotspots ──────────────────────────

  function isNativeInteractive(target: EventTarget | null): boolean {
    return target instanceof Element &&
      target.closest("a, input, select, button, textarea") !== null;
  }

  function itemAtPointer(clientX: number, clientY: number): string | null {
    const st = state();
    if (!st.screen || st.pending || st.deferred) return null;
    const frame = quakeMenuSceneFrame(window.innerWidth, window.innerHeight);
    const sx = frame.w / QUAKE_MENU_SCENE_FRAME_W;
    const sy = frame.h / QUAKE_MENU_SCENE_FRAME_H;
    // REVERSE order: the Back hotspot is listed last and its measured box
    // overlaps the last option row's band — later entries win the overlap,
    // as the later-in-DOM button did in the HTML this replaces.
    for (const spot of [...hotspots()].reverse()) {
      if (st.disabledItems.includes(spot.id)) continue;
      const left = frame.x + spot.rect.x * sx;
      const top = frame.y + spot.rect.y * sy;
      if (
        clientX >= left && clientX <= left + spot.rect.w * sx &&
        clientY >= top && clientY <= top + spot.rect.h * sy
      ) {
        return spot.id;
      }
    }
    return null;
  }

  function insideMenuFrame(clientX: number, clientY: number): boolean {
    const frame = quakeMenuSceneFrame(window.innerWidth, window.innerHeight);
    return clientX >= frame.x && clientX <= frame.x + frame.w &&
      clientY >= frame.y && clientY <= frame.y + frame.h;
  }

  function handlePointerMove(event: PointerEvent): void {
    if (!enabled || !currentScreen()) return;
    if (document.pointerLockElement) return;
    if (isNativeInteractive(event.target)) {
      document.body.classList.remove("quake-menu-pointer");
      return;
    }
    const item = itemAtPointer(event.clientX, event.clientY);
    if (item) {
      if (state().activeItem !== item) setActiveItem(item);
      document.body.classList.add("quake-menu-pointer");
    } else {
      document.body.classList.remove("quake-menu-pointer");
    }
  }

  function handlePointerDown(event: PointerEvent): void {
    if (!enabled || !currentScreen()) return;
    if (document.pointerLockElement) return;
    if (event.button !== 0) return;
    if (isNativeInteractive(event.target)) return;
    if (startingNewGame) return;
    const st = state();
    if (st.pending || st.deferred) return;
    const item = itemAtPointer(event.clientX, event.clientY);
    if (item) {
      event.preventDefault();
      setActiveItem(item);
      activateItem(item);
      return;
    }
    // A click outside the menu card closes a panel (the shipped behaviour);
    // clicks on the landing screen's empty space do nothing.
    if (isMenuPanelOpen() && !insideMenuFrame(event.clientX, event.clientY)) {
      closeMenuPanel();
    }
  }

  function handleWindowResize(): void {
    syncMultiplayerControls();
  }

  // ── Keyboard ───────────────────────────────────────────────────────────────

  function isTextEntryTarget(target: EventTarget | null): boolean {
    const element = target instanceof HTMLElement ? target : null;
    return Boolean(element?.closest('input[type="text"], input[type="number"], input:not([type]), textarea, select'));
  }

  function handleKeyDown(event: KeyboardEvent): boolean {
    if (!enabled) return false;
    const screen = currentScreen();
    if (!screen) return false;
    if (startingNewGame && screen !== "landing") {
      event.preventDefault();
      event.stopPropagation();
      return true;
    }

    const nativeEntry = isTextEntryTarget(event.target);

    switch (event.code) {
      case "Escape":
      case "Backspace":
        if (event.code === "Backspace" && nativeEntry) return false;
        event.preventDefault();
        event.stopPropagation();
        if (screen === "landing") {
          if (options.shouldResumeMainMenuOnEscape?.()) {
            options.onResumeMainMenuFromEscape?.();
            startFromMainMenu();
          }
        } else {
          closeMenuPanel();
        }
        return true;
      case "ArrowDown":
      case "KeyS":
        if (nativeEntry) return false;
        event.preventDefault();
        event.stopPropagation();
        moveSelection(1);
        return true;
      case "ArrowUp":
      case "KeyW":
        if (nativeEntry) return false;
        event.preventDefault();
        event.stopPropagation();
        moveSelection(-1);
        return true;
      case "ArrowLeft":
      case "KeyA":
        if (nativeEntry) return false;
        if (screen === "options") {
          event.preventDefault();
          event.stopPropagation();
          const active = state().activeItem;
          if (active && active !== "back") activateOptionRow(active, -1);
          return true;
        }
        if (screen === "level-select" || screen === "single-player") {
          event.preventDefault();
          event.stopPropagation();
          moveSelection(-1);
          return true;
        }
        return false;
      case "ArrowRight":
      case "KeyD":
        if (nativeEntry) return false;
        if (screen === "options") {
          event.preventDefault();
          event.stopPropagation();
          const active = state().activeItem;
          if (active && active !== "back") activateOptionRow(active, 1);
          return true;
        }
        if (screen === "level-select" || screen === "single-player") {
          event.preventDefault();
          event.stopPropagation();
          moveSelection(1);
          return true;
        }
        return false;
      case "Enter":
      case "Space":
        if (event.code === "Space" && nativeEntry) return false;
        if (event.code === "Enter" && screen === "multiplayer" && nativeEntry) {
          // Implicit form submission, as the shipped <form> behaved.
          event.preventDefault();
          event.stopPropagation();
          options.onMultiplayerSubmit?.();
          return true;
        }
        event.preventDefault();
        event.stopPropagation();
        activateItem(state().activeItem ?? selectableItems()[0] ?? null);
        return true;
      default:
        return false;
    }
  }

  function focusCurrent(): void {
    const st = state();
    if (st.screen === "multiplayer" && st.activeItem &&
        multiplayerBindings().some((b) => b.id === st.activeItem)) {
      focusMultiplayerControl(st.activeItem);
      return;
    }
    host.focus({ preventScroll: true });
  }

  // ── Wiring ─────────────────────────────────────────────────────────────────

  function handleControlsStart(): void {
    hideMainMenu();
  }

  function handleControlsEnd(): void {
    if (options.shouldOpenMainMenuOnControlsEnd && !options.shouldOpenMainMenuOnControlsEnd()) return;
    showMainMenu();
  }

  function dispose(): void {
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerdown", handlePointerDown, { capture: true });
    window.removeEventListener("resize", handleWindowResize);
    for (const binding of multiplayerBindings()) {
      binding.element.removeEventListener("focus", handleControlFocus);
      binding.element.removeEventListener("blur", handleControlBlur);
    }
    options.unmountMultiplayerControls?.();
    controls.removeEventListener("start", handleControlsStart);
    controls.removeEventListener("end", handleControlsEnd);
    document.body.classList.remove("quake-menu-pointer");
  }

  if (enabled) {
    window.addEventListener("pointermove", handlePointerMove);
    // Capture: the camera host owns pointer events for mouselook.
    window.addEventListener("pointerdown", handlePointerDown, { capture: true });
    window.addEventListener("resize", handleWindowResize);
    for (const binding of multiplayerBindings()) {
      binding.element.addEventListener("focus", handleControlFocus);
      binding.element.addEventListener("blur", handleControlBlur);
    }
    controls.addEventListener("start", handleControlsStart);
    controls.addEventListener("end", handleControlsEnd);
    // No state seeding here: the app module is still initializing when this
    // constructor runs, and the row model's getters close over bindings that
    // do not exist yet. The first openScreen() call refreshes everything.
  }

  return {
    showMainMenu,
    hideMainMenu,
    showMultiplayerFailure,
    isMainMenuOpen,
    isMenuPanelOpen,
    setCurrentLevel,
    handleKeyDown,
    focusCurrent,
    syncOptionTexts,
    dispose,
  };
}
