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
    if (quakeBitmapTextRendersAsCharacters) {
      // One run for the whole line: anywhere-wrapped callers (notify,
      // centerprint) pre-chunk their text to line length, so the run never
      // wraps and stays a single grid row for the overlay to stamp.
      container.append(createQuakeBitmapRun(text, options.alt));
      return container;
    }
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
  if (quakeBitmapTextRendersAsCharacters) return createQuakeBitmapRun(text, alt);
  const wordElement = document.createElement("span");
  wordElement.className = "quake-bitmap-word";
  for (const char of text) wordElement.append(createQuakeBitmapGlyph(char, alt));
  return wordElement;
}

/**
 * ASCII backend: one element per word-run of text, carrying the words as a
 * plain text node for the glyph overlay to stamp INTO the character grid.
 *
 * This replaces the span-per-character output (`createQuakeBitmapGlyphAsText`)
 * that put ~1,470 `.quake-bitmap-char` elements over the menu as HTML painted
 * ON TOP of the grid. A run keeps the exact box the character row occupied
 * (explicit `width = chars x glyph size`, the word wrapper's own height), so
 * every flex layout, hit target and wrap point stays put — but the paint moves
 * into the shared `<pre>`: the run itself is visibility-hidden whenever the
 * glyph UI host is up (see quake.css) and the overlay's `stampText` draws its
 * text on the cells its box covers.
 */
function createQuakeBitmapRun(text: string, alt: boolean): HTMLElement {
  const run = document.createElement("span");
  run.className = alt ? "quake-bitmap-word quake-bitmap-run quake-bitmap-run-alt" : "quake-bitmap-word quake-bitmap-run";
  run.textContent = text;
  run.style.width = `calc(${text.length} * var(--quake-bitmap-glyph-size))`;
  return run;
}

function createQuakeBitmapGlyph(char: string, alt: boolean): HTMLElement {
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
