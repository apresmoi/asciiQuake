/**
 * The page shell, as data. Its three semantic surfaces group gameplay,
 * interface, and project links; menus and HUD art still render from scene
 * state inside the GlyphCSS overlay rather than expanding the DOM.
 */
export interface QuakeAppDomElements {
  app: HTMLElement;
  game: HTMLElement;
  interfaceLayer: HTMLElement;
  social: HTMLElement;
  /** World renderer input mount. */
  scene: HTMLElement | null;
  /** Viewmodel renderer mount. */
  weapon: HTMLElement | null;
  /** Gameplay impact-particle pool layer. */
  impactParticlesLayer: HTMLElement | null;
  /** Gameplay layer: tint overlays, intermission, scoreboard mount. */
  hud: HTMLElement | null;
  bonusOverlay: HTMLElement | null;
  damageOverlay: HTMLElement | null;
  /** Intermission card root — its content is built at show time. */
  intermission: HTMLElement | null;
}

export function queryQuakeAppDom(): QuakeAppDomElements {
  return {
    app: requiredQuakeElement("quake-app"),
    game: requiredQuakeElement("quake-game"),
    interfaceLayer: requiredQuakeElement("quake-interface"),
    social: requiredQuakeElement("quake-social"),
    scene: quakeElement("quake-scene"),
    weapon: quakeElement("quake-weapon"),
    impactParticlesLayer: quakeElement("quake-impact-particles"),
    hud: quakeElement("quake-hud"),
    bonusOverlay: quakeElement("quake-bonus-overlay"),
    damageOverlay: quakeElement("quake-damage-overlay"),
    intermission: quakeElement("quake-intermission"),
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
