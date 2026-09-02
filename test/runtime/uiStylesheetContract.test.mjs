import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const projectRoot = path.resolve(import.meta.dirname, "../..");

test("static app UI presentation lives in quake.css", async () => {
  const files = [
    "src/App.ts",
    "src/runtime/debug/glyphTuningPanel.ts",
    "src/runtime/debug/statsPanel.ts",
    "src/runtime/render/glyphUiOverlay.ts",
    "src/runtime/render/glyphWorldOverlay.ts",
  ];
  for (const file of files) {
    const source = await readFile(path.join(projectRoot, file), "utf8");
    assert.doesNotMatch(source, /style\.cssText/, `${file} must not define static UI presentation inline`);
  }

  const debugPanel = await readFile(
    path.join(projectRoot, "src/runtime/debug/glyphTuningPanel.ts"),
    "utf8",
  );
  const statsPanel = await readFile(
    path.join(projectRoot, "src/runtime/debug/statsPanel.ts"),
    "utf8",
  );
  assert.doesNotMatch(debugPanel, /\.style\./, "the tuning panel must be class-styled");
  assert.doesNotMatch(statsPanel, /\.style\./, "the stats panel must be class-styled");

  const mobile = await readFile(path.join(projectRoot, "src/runtime/mobileControls.ts"), "utf8");
  assert.doesNotMatch(
    mobile,
    /\.style\.(?:position|display|left|top|width|height|marginLeft|marginTop|opacity|transform|pointerEvents|background|border)\s*=/,
    "mobile controls may publish live custom properties, but static presentation belongs in CSS",
  );

  const css = await readFile(path.join(projectRoot, "src/quake.css"), "utf8");
  for (const [selector, declarations] of [
    [".quake-glyph-weapon-host", ["position: absolute", "pointer-events: none"]],
    ["#quake-glyph-ui-host", ["z-index: 2", "overflow: hidden"]],
    [".quake-glyph-ui-hud-backing", ["position: absolute", "background: #050302"]],
    ["#quake-glyph-tuning-panel", ["position: fixed", "width: 320px"]],
    [".dn-stats-overlay", ["position: fixed", "pointer-events: none"]],
    ["#quake-mobile-move-zone .joystick", ["width: 108px", "height: 108px"]],
    [".quake-effect-sprite", ["image-rendering: pixelated", "will-change: transform, opacity"]],
    [".quake-pickup-backface", ["backface-visibility: visible"]],
  ]) {
    const match = new RegExp(`(?:^|\\n)${escapeRegExp(selector)}\\s*\\{([^}]+)\\}`, "s").exec(css);
    assert.ok(match, `${selector} needs a stylesheet rule`);
    for (const declaration of declarations) {
      assert.ok(match[1].includes(declaration), `${selector} needs ${declaration}`);
    }
  }
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
