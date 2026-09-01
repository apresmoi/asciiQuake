import type { QuakeShootablesDebugStats } from "../shootables";
import type { QuakeWorldDebugStats } from "../world";

const QUAKE_DEBUG_PANEL_STATS_MS = 250;

type QuakeDebugView = {
  origin: [number, number, number];
  rotX: number;
  rotY: number;
};

export interface QuakeDebugPanelFlowOptions {
  clearDebugUrlParams: () => void;
  currentMapName: () => string;
  currentView: () => QuakeDebugView;
  debugEnabledOption: HTMLInputElement | null;
  debugEnableAnimationsOption: HTMLInputElement | null;
  debugPanel: HTMLElement | null;
  debugShowFpsOption: HTMLInputElement | null;
  debugShowLabelsOption: HTMLInputElement | null;
  debugShowMenuOption: HTMLInputElement | null;
  debugShowOutlinesOption: HTMLInputElement | null;
  debugStack: HTMLElement | null;
  debugShowTexturesOption: HTMLInputElement | null;
  debugStatElements: ReadonlyMap<string, HTMLElement>;
  hideMainMenu: () => void;
  initialHideTextures: boolean;
  initialAnimationsEnabled: boolean;
  initialMode: boolean;
  initialShowFps: boolean;
  initialShowLabels: boolean;
  initialShowMenu: boolean;
  initialShowOutlines: boolean;
  pickupMeshCounts: () => { active: number; total: number };
  removeBodyClasses: (...classNames: string[]) => void;
  setBodyClass: (className: string, enabled: boolean) => void;
  setEnemyAnimationsEnabled: (enabled: boolean) => void;
  shootablesStats: () => QuakeShootablesDebugStats;
  showMainMenu: () => void;
  syncInteractionPresentation: () => void;
  syncPointerTraceAccessors: () => void;
  syncStatsOverlayAvailability: () => void;
  viewUrlFor: (mapName: string, view: QuakeDebugView) => URL;
  worldStats: () => QuakeWorldDebugStats;
}

export interface QuakeDebugPanelFlow {
  handleEnabledOptionChange: (event: Event) => void;
  handleEnableAnimationsOptionChange: (event: Event) => void;
  handleShowFpsOptionChange: (event: Event) => void;
  handleShowLabelsOptionChange: (event: Event) => void;
  handleShowMenuOptionChange: (event: Event) => void;
  handleShowOutlinesOptionChange: (event: Event) => void;
  handleShowTexturesOptionChange: (event: Event) => void;
  isModeEnabled: () => boolean;
  showOutlinesEnabled: () => boolean;
  setMode: (enabled: boolean) => void;
  setEnemyAnimationsEnabled: (enabled: boolean) => void;
  setShowFps: (enabled: boolean) => void;
  setShowLabels: (enabled: boolean) => void;
  setShowMenu: (visible: boolean) => void;
  setShowMenuOption: (visible: boolean) => void;
  setShowOutlines: (enabled: boolean) => void;
  setShowTextures: (enabled: boolean) => void;
  showFpsEnabled: () => boolean;
  stopStats: () => void;
  syncControls: () => void;
  syncPanelVisibility: () => void;
  syncRenderOptions: () => void;
  toggleMode: () => boolean;
  toggleOutlineTextureMode: () => boolean;
}

export function createQuakeDebugPanelFlow(options: QuakeDebugPanelFlowOptions): QuakeDebugPanelFlow {
  let showMenu = options.initialShowMenu;
  let mode = options.initialMode;
  let enemyAnimationsEnabled = options.initialAnimationsEnabled;
  let showFps = options.initialShowFps;
  let hideTextures = options.initialHideTextures;
  let showOutlines = options.initialShowOutlines;
  let showLabels = options.initialShowLabels;
  let statsTimer: number | null = null;
  // The stats panel's DOM is built LAZILY on first enable — the boot page
  // ships no debug markup at all (the flat-DOM shell), so the aside and its
  // stat rows are created here when debug mode first turns on.
  let debugStack = options.debugStack;
  let debugPanel = options.debugPanel;
  const statElements = new Map(options.debugStatElements);
  const debugStackParent = options.debugStack?.parentNode ?? document.body;
  const debugStackNextSibling = options.debugStack?.nextSibling ?? null;

  function ensurePanelDom(): void {
    if (debugPanel || typeof document === "undefined") return;
    const stack = document.createElement("div");
    stack.id = "quake-debug-stack";
    const aside = document.createElement("aside");
    aside.id = "quake-debug-panel";
    aside.setAttribute("aria-label", "Debug stats");
    aside.innerHTML = `
      <div id="quake-debug-card">
        <header id="quake-debug-header"><h2 id="quake-debug-title">Debug</h2></header>
        <dl id="quake-debug-stats" aria-label="Debug stats">
          <div><dt>Capture</dt><dd data-qstat="capture">-</dd></div>
          <div><dt>Visible</dt><dd data-qstat="visible">-</dd></div>
          <div><dt>DOM</dt><dd data-qstat="dom">-</dd></div>
          <div><dt>Enemies</dt><dd data-qstat="enemies">-</dd></div>
          <div><dt>Pickups</dt><dd data-qstat="pickups">-</dd></div>
        </dl>
        <div id="quake-debug-outline-legend" aria-label="Surface outline legend">
          <span><span class="quake-debug-outline-swatch quake-debug-outline-swatch-world" aria-hidden="true"></span><span>World</span></span>
          <span><span class="quake-debug-outline-swatch quake-debug-outline-swatch-special" aria-hidden="true"></span><span>Special</span></span>
          <span><span class="quake-debug-outline-swatch quake-debug-outline-swatch-movers" aria-hidden="true"></span><span>Objects/items</span></span>
          <span><span class="quake-debug-outline-swatch quake-debug-outline-swatch-enemies" aria-hidden="true"></span><span>Enemies</span></span>
        </div>
      </div>`;
    stack.appendChild(aside);
    for (const element of aside.querySelectorAll<HTMLElement>("[data-qstat]")) {
      const name = element.dataset.qstat;
      if (name) statElements.set(name, element);
    }
    debugStack = stack;
    debugPanel = aside;
  }

  function isModeEnabled(): boolean {
    return mode;
  }

  function showFpsEnabled(): boolean {
    return showFps;
  }

  function setMode(enabled: boolean): void {
    mode = enabled;
    if (options.debugEnabledOption) options.debugEnabledOption.checked = enabled;
    options.syncInteractionPresentation();
    options.syncPointerTraceAccessors();
    syncPanelVisibility();
    if (!enabled) options.clearDebugUrlParams();
  }

  function setShowMenuOption(visible: boolean): void {
    showMenu = visible;
    if (options.debugShowMenuOption) options.debugShowMenuOption.checked = visible;
  }

  function setShowMenu(visible: boolean): void {
    setShowMenuOption(visible);
    if (visible) {
      options.showMainMenu();
    } else {
      options.hideMainMenu();
    }
  }

  function toggleMode(): boolean {
    const enabled = !mode;
    setMode(enabled);
    return enabled;
  }

  function setShowFps(enabled: boolean): void {
    showFps = enabled;
    if (options.debugShowFpsOption) options.debugShowFpsOption.checked = enabled;
    options.syncStatsOverlayAvailability();
  }

  function setEnemyAnimationsEnabled(enabled: boolean): void {
    enemyAnimationsEnabled = enabled;
    if (options.debugEnableAnimationsOption) options.debugEnableAnimationsOption.checked = enabled;
    options.setEnemyAnimationsEnabled(enabled);
  }

  function setShowTextures(enabled: boolean): void {
    hideTextures = !enabled;
    if (options.debugShowTexturesOption) options.debugShowTexturesOption.checked = enabled;
    syncRenderOptions();
  }

  function setShowOutlines(enabled: boolean): void {
    showOutlines = enabled;
    hideTextures = enabled;
    syncRenderOptions();
  }

  function setShowLabels(enabled: boolean): void {
    showLabels = enabled;
    if (options.debugShowLabelsOption) options.debugShowLabelsOption.checked = enabled;
    syncRenderOptions();
  }

  function setOutlineTextureMode(enabled: boolean): void {
    hideTextures = enabled;
    showOutlines = enabled;
    syncRenderOptions();
  }

  function toggleOutlineTextureMode(): boolean {
    const enabled = !(hideTextures && showOutlines);
    setOutlineTextureMode(enabled);
    return enabled;
  }

  function syncRenderOptions(): void {
    const effectiveShowOutlines = showOutlines || hideTextures;
    if (options.debugShowTexturesOption) options.debugShowTexturesOption.checked = !hideTextures;
    if (options.debugShowOutlinesOption) {
      options.debugShowOutlinesOption.checked = effectiveShowOutlines;
      options.debugShowOutlinesOption.disabled = false;
    }
    if (options.debugShowLabelsOption) options.debugShowLabelsOption.checked = showLabels;
    options.setBodyClass("quake-debug-no-textures", hideTextures);
    options.setBodyClass("quake-debug-outlines", effectiveShowOutlines);
    options.setBodyClass("quake-debug-labels", showLabels);
  }

  function syncPanelVisibility(): void {
    if (mode) ensurePanelDom();
    syncDebugStackMounted(mode);
    if (!debugPanel) {
      if (!mode) stopStats();
      return;
    }
    debugPanel.hidden = !mode;
    if (mode) {
      syncPanelStats();
      startStats();
      return;
    }
    stopStats();
  }

  function syncDebugStackMounted(mounted: boolean): void {
    if (!debugStack || !debugStackParent) return;
    if (mounted) {
      if (!debugStack.isConnected) {
        debugStackParent.insertBefore(debugStack, debugStackNextSibling);
      }
      return;
    }
    debugStack.remove();
  }

  function startStats(): void {
    if (statsTimer !== null) return;
    statsTimer = window.setInterval(syncPanelStats, QUAKE_DEBUG_PANEL_STATS_MS);
  }

  function stopStats(): void {
    if (statsTimer === null) return;
    window.clearInterval(statsTimer);
    statsTimer = null;
  }

  function syncPanelStats(): void {
    if (!mode || !debugPanel || debugPanel.hidden) return;
    const worldStats = options.worldStats();
    const shootableStats = options.shootablesStats();
    const view = options.currentView();
    const pickupMeshes = options.pickupMeshCounts();

    setStat("capture", debugCapturePose(options.currentMapName(), view));
    setStat(
      "visible",
      `${debugStatValue(worldStats.visibleLeafCount)} leaves, ${debugStatValue(worldStats.pvsFaceCount)} faces`,
    );
    setStat("dom", debugDomLabel(worldStats));
    setStat("enemies", debugEnemiesLabel(shootableStats));
    setStat("pickups", `${pickupMeshes.active}/${pickupMeshes.total} visible`);
  }

  function debugCapturePose(mapName: string, view: QuakeDebugView): string {
    const value = options.viewUrlFor(mapName, view).searchParams.get("view");
    return value ? `${mapName} | view=${value}` : `${mapName} | view=-`;
  }

  function setStat(name: string, value: string): void {
    const element = statElements.get(name);
    if (element) element.textContent = value;
  }

  function syncControls(): void {
    setShowMenuOption(showMenu);
    setMode(mode);
    syncRenderOptions();
    setShowFps(showFps);
    setEnemyAnimationsEnabled(enemyAnimationsEnabled);
  }

  return {
    handleEnableAnimationsOptionChange: (event) => setEnemyAnimationsEnabled((event.currentTarget as HTMLInputElement).checked),
    handleEnabledOptionChange: (event) => setMode((event.currentTarget as HTMLInputElement).checked),
    handleShowFpsOptionChange: (event) => setShowFps((event.currentTarget as HTMLInputElement).checked),
    handleShowLabelsOptionChange: (event) => setShowLabels((event.currentTarget as HTMLInputElement).checked),
    handleShowMenuOptionChange: (event) => setShowMenu((event.currentTarget as HTMLInputElement).checked),
    handleShowOutlinesOptionChange: (event) => setShowOutlines((event.currentTarget as HTMLInputElement).checked),
    handleShowTexturesOptionChange: (event) => setShowTextures((event.currentTarget as HTMLInputElement).checked),
    isModeEnabled,
    showOutlinesEnabled: () => showOutlines || hideTextures,
    setEnemyAnimationsEnabled,
    setMode,
    setShowFps,
    setShowLabels,
    setShowMenu,
    setShowMenuOption,
    setShowOutlines,
    setShowTextures,
    showFpsEnabled,
    stopStats,
    syncControls,
    syncPanelVisibility,
    syncRenderOptions,
    toggleMode,
    toggleOutlineTextureMode,
  };
}

function debugDomLabel(stats: QuakeWorldDebugStats): string {
  const parts = [`${stats.mountedLeaves}/${stats.totalLeaves} leaves`];
  if (stats.mountedSkyTextureLeaves > 0) parts.push(`${stats.mountedSkyTextureLeaves} sky`);
  if (stats.mountedSpecialTextureLeaves > 0) parts.push(`${stats.mountedSpecialTextureLeaves} *tex`);
  return parts.join(", ");
}

function debugEnemiesLabel(stats: QuakeShootablesDebugStats): string {
  const parts = [
    `${stats.liveEnemyShootables}/${stats.enemyShootables} live`,
    `${stats.visibleEnemyShootables} vis`,
  ];
  const queue = stats.prewarmQueue + stats.animationFramePrewarmQueue;
  if (queue > 0) {
    parts.push(`${queue} queued`);
  } else if (stats.prewarmedEnemyShootables > 0) {
    parts.push(`${stats.prewarmedEnemyShootables} warm`);
  }
  const churn = stats.visibilityChurn;
  const visibleChange = churn.lastVisibleShootablesAdded + churn.lastVisibleShootablesRemoved;
  if (visibleChange > 0) parts.push(`last +${churn.lastVisibleShootablesAdded}/-${churn.lastVisibleShootablesRemoved}`);
  return parts.join(", ");
}

function debugStatValue(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "-";
}
