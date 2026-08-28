const QUAKE_BITMAP_TEXT_SIZES = {
  copy: 16,
  label: 16,
  key: 14,
  title: 40,
} as const;

const QUAKE_BITMAP_TEXT_SELECTOR = [
  ".quake-bm",
  ".quake-bm-copy",
  ".quake-bm-label",
  ".quake-bm-key",
  ".quake-bm-title",
  ".quake-bitmap-host",
].join(", ");

const QUAKE_BITMAP_TEXT_CONFIG_CLASSES = [
  "quake-bm",
  "quake-bm-copy",
  "quake-bm-label",
  "quake-bm-key",
  "quake-bm-title",
  "quake-bm-alt",
  "quake-bm-anywhere",
  "quake-bm-email",
];

type QuakeBitmapTextSize = keyof typeof QUAKE_BITMAP_TEXT_SIZES;
type QuakeBitmapTextWrap = "word" | "anywhere" | "email";

interface QuakeBitmapTextOptions {
  alt: boolean;
  size: QuakeBitmapTextSize;
  wrap: QuakeBitmapTextWrap;
}

const quakeBitmapTextOptionsByElement = new WeakMap<HTMLElement, QuakeBitmapTextOptions>();

export function mountQuakeBitmapText(root: ParentNode = document): void {
  if (root instanceof HTMLElement && shouldRenderQuakeBitmapTextElement(root)) {
    renderQuakeBitmapTextElement(root);
  }
  for (const element of root.querySelectorAll<HTMLElement>(QUAKE_BITMAP_TEXT_SELECTOR)) {
    renderQuakeBitmapTextElement(element);
  }
}

/**
 * The text this element should render, safe to re-read after conversion.
 *
 * Converting is not a one-shot: the overlay re-runs it when the menu rebuilds.
 * After the first pass the element holds a `.quake-bitmap-source` span AND the
 * per-character bitmap, so `element.textContent` returns the text TWICE, and
 * each extra pass doubled it again — measured on the multiplayer panel as
 * "Name" -> "NameNameNameNa" with 8 character spans, and "GO BACK" rendering
 * twice on the button. Reading the source span back makes re-conversion a
 * no-op instead.
 */
function readBitmapSourceText(element: HTMLElement): string {
  const source = element.querySelector(":scope > .quake-bitmap-source");
  return normalizeBitmapText((source ?? element).textContent ?? "");
}

function renderQuakeBitmapTextElement(element: HTMLElement): void {
  const text = readBitmapSourceText(element);
  const options = quakeBitmapTextOptionsByElement.get(element) ?? parseBitmapTextOptions(element);
  quakeBitmapTextOptionsByElement.set(element, options);
  stripBitmapTextMetadata(element);
  element.classList.add("quake-bitmap-host");
  if (!text) return;

  const source = document.createElement("span");
  source.className = "quake-bitmap-source";
  source.textContent = text;

  const bitmap = createQuakeBitmapText(text, options);

  element.textContent = "";
  element.append(source, bitmap);
}

function createQuakeBitmapText(
  text: string,
  options: { alt: boolean; size: QuakeBitmapTextSize; wrap: QuakeBitmapTextWrap },
): HTMLElement {
  const container = document.createElement("span");
  container.className = `quake-bitmap-text quake-bitmap-text--${options.size} quake-bitmap-text--${options.wrap}`;
  container.setAttribute("aria-hidden", "true");

  if (options.wrap === "anywhere") {
    for (const char of text) container.append(createQuakeBitmapGlyph(char, options.alt));
    return container;
  }

  if (options.wrap === "email") {
    for (const segment of splitEmailBitmapText(text)) {
      container.append(createQuakeBitmapWord(segment, options.alt));
    }
    return container;
  }

  for (const word of text.split(" ")) {
    if (!word) continue;
    container.append(createQuakeBitmapWord(word, options.alt));
  }

  return container;
}

/** Set by the app when the ASCII backend is active. */
let quakeBitmapTextRendersAsCharacters = false;

export function setQuakeBitmapTextAsCharacters(enabled: boolean): void {
  quakeBitmapTextRendersAsCharacters = enabled;
}

function createQuakeBitmapWord(text: string, alt: boolean): HTMLElement {
  const wordElement = document.createElement("span");
  wordElement.className = "quake-bitmap-word";
  for (const char of text) wordElement.append(createQuakeBitmapGlyph(char, alt));
  return wordElement;
}

/**
 * Render bitmap text as real characters rather than sprite-sheet slices.
 *
 * The ASCII backend turns the rest of the UI's art into glyphs, and this text is
 * the one thing that was already characters before it was ever an image —
 * `char.charCodeAt(0)` picks the cell, so the letter is the input. Reconstructing
 * a letter out of an image of that letter costs one element and one texture
 * window PER CHARACTER (808 of them on the menu screen), and at the shared grid's
 * cell size each 16x16 source glyph lands on ~2x3 cells, so it comes out as
 * unreadable blocks. Emitting the character directly is sharper AND free.
 *
 * `alt` is Quake's high-bit "brown" variant of the same glyph, so it stays a
 * styling hook rather than a different character.
 */
function createQuakeBitmapGlyphAsText(char: string, alt: boolean): HTMLElement {
  const element = document.createElement("span");
  element.className = alt ? "quake-bitmap-char quake-bitmap-char-alt" : "quake-bitmap-char";
  element.textContent = char;
  return element;
}

function createQuakeBitmapGlyph(char: string, alt: boolean): HTMLElement {
  if (quakeBitmapTextRendersAsCharacters) return createQuakeBitmapGlyphAsText(char, alt);
  const glyph = (char.charCodeAt(0) & 127) + (alt ? 128 : 0);
  const col = glyph & 15;
  const row = glyph >> 4;
  const element = document.createElement("span");
  element.className = `quake-bitmap-glyph quake-bitmap-col-${col} quake-bitmap-row-${row}`;
  return element;
}

function parseBitmapTextSize(value: string | undefined): QuakeBitmapTextSize {
  return value === "label" || value === "key" || value === "title" ? value : "copy";
}

function parseBitmapTextWrap(value: string | undefined): QuakeBitmapTextWrap {
  if (value === "anywhere" || value === "email") return value;
  return "word";
}

function parseBitmapTextOptions(element: HTMLElement): QuakeBitmapTextOptions {
  return {
    alt: element.classList.contains("quake-bm-alt"),
    size: parseBitmapTextSize(bitmapTextClassSize(element)),
    wrap: parseBitmapTextWrap(bitmapTextClassWrap(element)),
  };
}

function shouldRenderQuakeBitmapTextElement(element: HTMLElement): boolean {
  return hasBitmapTextConfigClass(element) ||
    quakeBitmapTextOptionsByElement.has(element) ||
    element.classList.contains("quake-bitmap-host");
}

function stripBitmapTextMetadata(element: HTMLElement): void {
  element.classList.remove(...QUAKE_BITMAP_TEXT_CONFIG_CLASSES);
}

function hasBitmapTextConfigClass(element: HTMLElement): boolean {
  return QUAKE_BITMAP_TEXT_CONFIG_CLASSES.some((className) => element.classList.contains(className));
}

function bitmapTextClassSize(element: HTMLElement): string | undefined {
  if (element.classList.contains("quake-bm-title")) return "title";
  if (element.classList.contains("quake-bm-label")) return "label";
  if (element.classList.contains("quake-bm-key")) return "key";
  if (element.classList.contains("quake-bm-copy")) return "copy";
  return undefined;
}

function bitmapTextClassWrap(element: HTMLElement): string | undefined {
  if (element.classList.contains("quake-bm-anywhere")) return "anywhere";
  if (element.classList.contains("quake-bm-email")) return "email";
  return undefined;
}

function splitEmailBitmapText(text: string): string[] {
  const at = text.indexOf("@");
  if (at < 0) return [text];
  return [text.slice(0, at + 1), text.slice(at + 1)].filter(Boolean);
}

function normalizeBitmapText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
