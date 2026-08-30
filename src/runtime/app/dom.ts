/**
 * The page shell, as data. The shell is FLAT now: engine mounts, the gameplay
 * tint/intermission layer, the multiplayer form's native controls and the
 * corner links — everything else (menus, panels, HUD anchors, the loading
 * overlay, bitmap text) renders from the scene manifest + scene state inside
 * the glyph overlay's `<pre>` layers, so no element exists for it.
 */
export interface QuakeAppDomElements {
  app: HTMLElement;
  /** polycss world mount. */
  scene: HTMLElement | null;
  /** polycss viewmodel mount. */
  weapon: HTMLElement | null;
  /** Gameplay impact-particle pool layer. */
  impactParticlesLayer: HTMLElement | null;
  /** Gameplay layer: tint overlays, intermission, scoreboard mount. */
  hud: HTMLElement | null;
  bonusOverlay: HTMLElement | null;
  damageOverlay: HTMLElement | null;
  /** Intermission card root — its content is built at show time. */
  intermission: HTMLElement | null;
  /** The multiplayer form's NATIVE controls (positioned by the menu
   *  controller over their manifest rects). */
  multiplayerNameInput: HTMLInputElement | null;
  multiplayerColorInput: HTMLInputElement | null;
  multiplayerMapSelect: HTMLSelectElement | null;
  multiplayerFragLimitInput: HTMLInputElement | null;
  multiplayerMaxPlayersInput: HTMLInputElement | null;
}

export function queryQuakeAppDom(): QuakeAppDomElements {
  return {
    app: requiredQuakeElement("quake-app"),
    scene: quakeElement("quake-scene"),
    weapon: quakeElement("quake-weapon"),
    impactParticlesLayer: quakeElement("quake-impact-particles"),
    hud: quakeElement("quake-hud"),
    bonusOverlay: quakeElement("quake-bonus-overlay"),
    damageOverlay: quakeElement("quake-damage-overlay"),
    intermission: quakeElement("quake-intermission"),
    multiplayerNameInput: quakeElement("quake-multiplayer-name"),
    multiplayerColorInput: quakeElement("quake-multiplayer-color"),
    multiplayerMapSelect: quakeElement("quake-multiplayer-map"),
    multiplayerFragLimitInput: quakeElement("quake-multiplayer-fraglimit"),
    multiplayerMaxPlayersInput: quakeElement("quake-multiplayer-maxplayers"),
  };
}

export function addQuakeBodyClasses(...classNames: string[]): void {
  document.body.classList.add(...classNames);
}

export function removeQuakeBodyClasses(...classNames: string[]): void {
  document.body.classList.remove(...classNames);
}

export function setQuakeBodyClass(className: string, active: boolean): void {
  document.body.classList.toggle(className, active);
}

export function hasQuakeBodyClass(className: string): boolean {
  return document.body.classList.contains(className);
}

function quakeElement<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function requiredQuakeElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = quakeElement<T>(id);
  if (!element) throw new Error(`Missing cssQuake shell element #${id}.`);
  return element;
}
