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
  panel.style.cssText =
    "position:fixed;top:8px;right:8px;z-index:2147483646;width:320px;max-height:calc(100vh - 16px);" +
    "overflow:auto;background:#1c1c1f;color:#ddd;font:11px/1.5 Menlo,Consolas,monospace;" +
    "border:1px solid #555;border-radius:6px;padding:8px 10px 10px;box-shadow:0 4px 24px rgba(0,0,0,.6);" +
    "pointer-events:auto;user-select:none";
  // Keep panel interaction out of the game's window-level listeners: a slider
  // arrow-key nudge must not move the menu selection, a click must not fire
  // the weapon. (stopPropagation on the bubble path is enough for the game's
  // window/document listeners.)
  for (const type of ["keydown", "keyup", "keypress", "pointerdown", "pointerup", "mousedown", "mouseup", "click", "wheel"]) {
    panel.addEventListener(type, (e) => e.stopPropagation());
  }

  const header = document.createElement("div");
  header.style.cssText = "display:flex;gap:6px;align-items:center;margin-bottom:6px";
  const title = document.createElement("span");
  title.textContent = "glyph tuning";
  title.style.cssText = "font-weight:bold;color:#8f8;flex:1";
  header.appendChild(title);

  const mkButton = (label: string, onClick: () => void): HTMLButtonElement => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.style.cssText =
      "background:#333;color:#ddd;border:1px solid #666;border-radius:3px;" +
      "font:10px Menlo,Consolas,monospace;padding:2px 6px;cursor:pointer";
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
  copyOut.style.cssText =
    "width:100%;box-sizing:border-box;background:#111;color:#9c9;border:1px solid #444;" +
    "border-radius:3px;font:9px Menlo,monospace;padding:2px 4px;margin:4px 0 6px;display:none";
  copyOut.addEventListener("focus", () => copyOut.select());
  function showCopyUrl(): void {
    const url = currentUrl();
    copyOut.style.display = "block";
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
    sectionTitle.style.cssText = "color:#7af;margin:8px 0 2px;font-weight:bold";
    panel.appendChild(sectionTitle);

    for (const sel of section.selects ?? []) {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;gap:4px;align-items:center;margin:2px 0 4px";
      const name = document.createElement("span");
      name.textContent = sel.label;
      name.title = `?${sel.param}=  (default ${sel.def})`;
      name.style.cssText = "flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
      const select = document.createElement("select");
      select.style.cssText =
        "background:#111;color:#ddd;border:1px solid #555;border-radius:3px;" +
        "font:10px Menlo,Consolas,monospace;padding:1px 2px;max-width:140px";
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
        g.style.cssText = "color:#999;margin:6px 0 1px;border-bottom:1px solid #333";
        panel.appendChild(g);
      }

      const row = document.createElement("div");
      row.style.cssText = "margin:2px 0 4px";
      const label = document.createElement("div");
      label.style.cssText = "display:flex;gap:4px;align-items:center";
      const name = document.createElement("span");
      name.textContent = knob.label;
      name.title = `?${knob.param}=  (default ${trim(section.defaults?.[knob.key] ?? knob.def)})`;
      name.style.cssText = "flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
      const readout = document.createElement("span");
      readout.style.cssText = "color:#ff8;min-width:44px;text-align:right";
      readout.textContent = trim(section.values[knob.key] ?? knob.def);
      const reset = mkButton("<", () => {
        setValue(section, knob, section.defaults?.[knob.key] ?? knob.def);
        scheduleApply(section);
      });
      reset.title = "reset to default";
      reset.style.padding = "0 4px";
      label.append(name, readout, reset);

      const range = document.createElement("input");
      range.type = "range";
      range.min = String(knob.min);
      range.max = String(knob.max);
      range.step = String(knob.step);
      range.value = String(section.values[knob.key] ?? knob.def);
      range.style.cssText = "width:100%;margin:0;accent-color:#7af";
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
  note.style.cssText = "color:#777;margin-top:6px";
  note.textContent = "disposable panel - copy URL pins the current values as query params";
  panel.appendChild(note);

  document.body.appendChild(panel);
}
