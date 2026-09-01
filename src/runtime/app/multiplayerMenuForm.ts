export interface QuakeMultiplayerMenuForm {
  readonly form: HTMLFormElement;
  readonly nameInput: HTMLInputElement;
  readonly colorInput: HTMLInputElement;
  readonly mapSelect: HTMLSelectElement;
  readonly fragLimitInput: HTMLInputElement;
  readonly maxPlayersInput: HTMLInputElement;
  mount(): void;
  unmount(): void;
  dispose(): void;
}

/**
 * Owns the menu's only native form controls. The detached form retains field
 * values and listeners without adding anything to the rendered DOM; mount it
 * only for the multiplayer setup screen.
 */
export function createQuakeMultiplayerMenuForm(host: HTMLElement): QuakeMultiplayerMenuForm {
  const form = document.createElement("form");
  form.id = "quake-multiplayer-controls";
  form.setAttribute("aria-label", "Multiplayer setup");

  const nameInput = createInput("quake-multiplayer-name", "text", "Player name");
  nameInput.maxLength = 16;
  nameInput.spellcheck = false;
  nameInput.autocomplete = "nickname";

  const colorInput = createInput("quake-multiplayer-color", "color", "Player color");
  colorInput.value = "#d8893f";

  const mapSelect = document.createElement("select");
  configureControl(mapSelect, "quake-multiplayer-map", "Map");

  const fragLimitInput = createNumberInput("quake-multiplayer-fraglimit", "Frag limit", 1, 100, 20);
  const maxPlayersInput = createNumberInput("quake-multiplayer-maxplayers", "Max players", 2, 4, 4);
  form.append(nameInput, colorInput, mapSelect, fragLimitInput, maxPlayersInput);

  function preventSubmit(event: SubmitEvent): void {
    event.preventDefault();
  }
  form.addEventListener("submit", preventSubmit);

  function mount(): void {
    if (form.parentElement !== host) host.append(form);
  }

  function unmount(): void {
    form.remove();
  }

  function dispose(): void {
    unmount();
    form.removeEventListener("submit", preventSubmit);
  }

  return {
    form,
    nameInput,
    colorInput,
    mapSelect,
    fragLimitInput,
    maxPlayersInput,
    mount,
    unmount,
    dispose,
  };
}

function createInput(id: string, type: string, label: string): HTMLInputElement {
  const input = document.createElement("input");
  input.type = type;
  configureControl(input, id, label);
  return input;
}

function createNumberInput(
  id: string,
  label: string,
  min: number,
  max: number,
  value: number,
): HTMLInputElement {
  const input = createInput(id, "number", label);
  input.min = String(min);
  input.max = String(max);
  input.step = "1";
  input.value = String(value);
  return input;
}

function configureControl(element: HTMLElement, id: string, label: string): void {
  element.id = id;
  element.className = "quake-mp-control";
  element.setAttribute("aria-label", label);
}
