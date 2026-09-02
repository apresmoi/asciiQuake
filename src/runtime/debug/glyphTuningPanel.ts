/**
 * `?debug` live tuning panel — a DISPOSABLE, deliberately off-theme floating
 * strip of sliders on the right edge, one per glyph tuning knob (see
 * glyphTuningSpec.ts). It exists to find better defaults by eye: drag a
 * slider, watch the render change, then "copy URL" to pin the current
 * combination as query params that reproduce it exactly.
 *
 * Loaded lazily from App.ts only when `?debug` is present, so the normal
 * path never pays for it — no DOM, no module cost.
 */
import type { QuakeGlyphTuningKnob, QuakeGlyphTuningValues } from "../app/glyphTuningSpec";

/** A non-numeric knob rendered as a dropdown (e.g. the glyph ramp palette). */
export interface QuakeGlyphTuningSelect {
  /** Key in the section's `selectValues` record. */
  readonly key: string;
  /** URL query parameter, e.g. `?glyphPalette=`. */
  readonly param: string;
  readonly label: string;
  /** Choices, in listed order. Callers pass only ASCII-legal choices here —
   *  the panel offers exactly what it is given (see asciiGlyphPolicy.ts). */
  readonly options: readonly string[];
  /** Shipped default — used by "changed?" detection and reset. */
  readonly def: string;
}

export interface QuakeGlyphTuningSection {
  readonly title: string;
  readonly knobs: readonly QuakeGlyphTuningKnob[];
  /** Live values record — MUTATED in place as sliders move, so the caller's
   *  own reference stays current. */
  readonly values: QuakeGlyphTuningValues;
  /** Dropdown knobs, rendered above the sliders. */
  readonly selects?: readonly QuakeGlyphTuningSelect[];
  /** Live values for `selects` — MUTATED in place, like `values`. */
  readonly selectValues?: Record<string, string>;
  /** Per-key default overrides for "changed?" detection (e.g. the world cell
   *  size, whose real default is budget-derived, not the spec literal). */
  readonly defaults?: Readonly<Record<string, number>>;
  /** Re-apply callback, invoked debounced after slider movement. */
  readonly apply: (values: QuakeGlyphTuningValues) => void;
  readonly debounceMs?: number;
}

const PANEL_ID = "quake-glyph-tuning-panel";

export function installQuakeGlyphTuningPanel(sections: readonly QuakeGlyphTuningSection[]): void {
  document.getElementById(PANEL_ID)?.remove();

  const panel = document.createElement("div");
  panel.id = PANEL_ID;
  // Keep panel interaction out of the game's window-level listeners: a slider
  // arrow-key nudge must not move the menu selection, a click must not fire
  // the weapon. (stopPropagation on the bubble path is enough for the game's
  // window/document listeners.)
  for (const type of ["keydown", "keyup", "keypress", "pointerdown", "pointerup", "mousedown", "mouseup", "click", "wheel"]) {
    panel.addEventListener(type, (e) => e.stopPropagation());
  }

  const header = document.createElement("div");
  header.className = "quake-glyph-tuning-header";
  const title = document.createElement("span");
  title.textContent = "glyph tuning";
  title.className = "quake-glyph-tuning-title";
  header.appendChild(title);

  const mkButton = (label: string, onClick: () => void): HTMLButtonElement => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.className = "quake-glyph-tuning-button";
    b.addEventListener("click", onClick);
    return b;
  };

  /** The current settings as URL params: every knob whose value differs from
   *  its default is set on a copy of the live URL; ones at default are
   *  removed. `?debug` is kept, so a pasted URL reopens the panel. */
  function currentUrl(): string {
    const url = new URL(window.location.href);
    for (const section of sections) {
      for (const knob of section.knobs) {
        const def = section.defaults?.[knob.key] ?? knob.def;
        const value = section.values[knob.key] ?? def;
        // Tolerance: slider steps are exact, but float noise from parsing
        // should not turn "default" into "changed".
        if (Math.abs(value - def) > 1e-9) {
          url.searchParams.set(knob.param, trim(value));
        } else {
          url.searchParams.delete(knob.param);
        }
      }
      for (const sel of section.selects ?? []) {
        const value = section.selectValues?.[sel.key] ?? sel.def;
        if (value !== sel.def) {
          url.searchParams.set(sel.param, value);
        } else {
          url.searchParams.delete(sel.param);
        }
      }
    }
    return url.toString();
  }

  const trim = (v: number): string => {
    const s = v.toFixed(4);
    return s.replace(/\.?0+$/, "");
  };

  const copyOut = document.createElement("input");
  copyOut.type = "text";
  copyOut.readOnly = true;
  copyOut.className = "quake-glyph-tuning-copy";
  copyOut.hidden = true;
  copyOut.addEventListener("focus", () => copyOut.select());
  function showCopyUrl(): void {
    const url = currentUrl();
    copyOut.hidden = false;
    copyOut.value = url;
    copyOut.focus();
    copyOut.select();
    void navigator.clipboard?.writeText(url).catch(() => { /* field stays selectable */ });
  }

  header.appendChild(mkButton("copy URL", showCopyUrl));
  header.appendChild(mkButton("reset all", () => {
    for (const section of sections) {
      for (const knob of section.knobs) {
        setValue(section, knob, section.defaults?.[knob.key] ?? knob.def);
      }
      for (const sel of section.selects ?? []) setSelectValue(section, sel, sel.def);
      scheduleApply(section);
    }
  }));
  header.appendChild(mkButton("x", () => panel.remove()));
  panel.appendChild(header);
  panel.appendChild(copyOut);

  const timers = new Map<QuakeGlyphTuningSection, number>();
  function scheduleApply(section: QuakeGlyphTuningSection): void {
    const pending = timers.get(section);
    if (pending) window.clearTimeout(pending);
    timers.set(section, window.setTimeout(() => {
      timers.delete(section);
      try {
        section.apply(section.values);
      } catch (error) {
        // A tuning value must never take the app down — report and move on.
        console.error("glyph tuning apply failed:", error);
      }
    }, section.debounceMs ?? 150));
  }

  // Per-knob UI registry so "reset all" can move the sliders too.
  const inputs = new Map<QuakeGlyphTuningKnob, { range: HTMLInputElement; readout: HTMLSpanElement }>();
  function setValue(section: QuakeGlyphTuningSection, knob: QuakeGlyphTuningKnob, value: number): void {
    section.values[knob.key] = value;
    const ui = inputs.get(knob);
    if (ui) {
      ui.range.value = String(value);
      ui.readout.textContent = trim(value);
    }
  }

  const selectInputs = new Map<QuakeGlyphTuningSelect, HTMLSelectElement>();
  function setSelectValue(section: QuakeGlyphTuningSection, sel: QuakeGlyphTuningSelect, value: string): void {
    if (section.selectValues) section.selectValues[sel.key] = value;
    const ui = selectInputs.get(sel);
    if (ui) ui.value = value;
  }

  for (const section of sections) {
    const sectionTitle = document.createElement("div");
    sectionTitle.textContent = `-- ${section.title} --`;
    sectionTitle.className = "quake-glyph-tuning-section-title";
    panel.appendChild(sectionTitle);

    for (const sel of section.selects ?? []) {
      const row = document.createElement("div");
      row.className = "quake-glyph-tuning-select-row";
      const name = document.createElement("span");
      name.textContent = sel.label;
      name.title = `?${sel.param}=  (default ${sel.def})`;
      name.className = "quake-glyph-tuning-name";
      const select = document.createElement("select");
      select.className = "quake-glyph-tuning-select";
      for (const option of sel.options) {
        const o = document.createElement("option");
        o.value = option;
        o.textContent = option === sel.def ? `${option} (default)` : option;
        select.appendChild(o);
      }
      select.value = section.selectValues?.[sel.key] ?? sel.def;
      select.addEventListener("change", () => {
        if (section.selectValues) section.selectValues[sel.key] = select.value;
        scheduleApply(section);
      });
      selectInputs.set(sel, select);
      row.append(name, select);
      panel.appendChild(row);
    }

    let lastGroup = "";
    for (const knob of section.knobs) {
      if (knob.group !== lastGroup) {
        lastGroup = knob.group;
        const g = document.createElement("div");
        g.textContent = knob.group;
        g.className = "quake-glyph-tuning-group";
        panel.appendChild(g);
      }

      const row = document.createElement("div");
      row.className = "quake-glyph-tuning-knob-row";
      const label = document.createElement("div");
      label.className = "quake-glyph-tuning-knob-label";
      const name = document.createElement("span");
      name.textContent = knob.label;
      name.title = `?${knob.param}=  (default ${trim(section.defaults?.[knob.key] ?? knob.def)})`;
      name.className = "quake-glyph-tuning-name";
      const readout = document.createElement("span");
      readout.className = "quake-glyph-tuning-readout";
      readout.textContent = trim(section.values[knob.key] ?? knob.def);
      const reset = mkButton("<", () => {
        setValue(section, knob, section.defaults?.[knob.key] ?? knob.def);
        scheduleApply(section);
      });
      reset.title = "reset to default";
      reset.classList.add("quake-glyph-tuning-reset-button");
      label.append(name, readout, reset);

      const range = document.createElement("input");
      range.type = "range";
      range.min = String(knob.min);
      range.max = String(knob.max);
      range.step = String(knob.step);
      range.value = String(section.values[knob.key] ?? knob.def);
      range.className = "quake-glyph-tuning-range";
      range.addEventListener("input", () => {
        const value = Number(range.value);
        section.values[knob.key] = value;
        readout.textContent = trim(value);
        scheduleApply(section);
      });

      inputs.set(knob, { range, readout });
      row.append(label, range);
      panel.appendChild(row);
    }
  }

  const note = document.createElement("div");
  note.className = "quake-glyph-tuning-note";
  note.textContent = "disposable panel - copy URL pins the current values as query params";
  panel.appendChild(note);

  document.body.appendChild(panel);
}
