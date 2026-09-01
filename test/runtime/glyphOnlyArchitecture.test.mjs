import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const projectRoot = path.resolve(import.meta.dirname, "../..");
const forbiddenTerms = [
  ["poly", "css"].join(""),
  ["render", "bundle"].join(""),
];

test("runtime and preparation remain GlyphCSS-only", async () => {
  const packageJson = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8"));
  assert.equal(typeof packageJson.dependencies?.glyphcss, "string", "glyphcss must remain the render dependency");

  const files = [
    path.join(projectRoot, "package.json"),
    path.join(projectRoot, "pnpm-lock.yaml"),
    path.join(projectRoot, "README.md"),
    path.join(projectRoot, "index.html"),
    ...await sourceFiles(path.join(projectRoot, "src")),
    ...await sourceFiles(path.join(projectRoot, ".github")),
  ];
  const violations = [];
  for (const file of files) {
    const content = (await readFile(file, "utf8")).toLowerCase();
    for (const term of forbiddenTerms) {
      if (content.includes(term)) violations.push(`${path.relative(projectRoot, file)} contains ${term}`);
    }
  }
  assert.deepEqual(violations, []);

  const engine = await readFile(path.join(projectRoot, "src/runtime/render/engine.ts"), "utf8");
  assert.match(engine, /createGlyphFirstPersonControls/);
  assert.match(engine, /createGlyphPerspectiveCamera/);
});

test("the page shell groups game, interface, and social surfaces", async () => {
  const html = await readFile(path.join(projectRoot, "index.html"), "utf8");

  assert.match(html, /<main id="quake-game">[\s\S]*id="quake-scene"[\s\S]*id="quake-weapon"[\s\S]*id="quake-impact-particles"[\s\S]*<\/main>/);
  assert.match(html, /<section id="quake-interface"[\s\S]*id="quake-hud"[\s\S]*<\/section>/);
  assert.match(html, /<nav id="quake-social"[\s\S]*class="btn-github"[\s\S]*class="quake-id-software-link"[\s\S]*class="quake-css-logo"[\s\S]*<\/nav>/);
  assert.doesNotMatch(html, /id="quake-multiplayer-(?:name|color|map|fraglimit|maxplayers)"/);
});

test("the intermission backdrop dims behind the Glyph UI", async () => {
  const css = await readFile(path.join(projectRoot, "src/quake.css"), "utf8");
  const app = await readFile(path.join(projectRoot, "src/App.ts"), "utf8");

  assert.match(css, /\.quake-glyph-render \.quake-intermission-scrim\s*\{[^}]*background:\s*transparent/s);
  assert.match(css, /\.quake-glyph-render #quake-interface\.quake-intermission-visible #quake-glyph-ui-host\s*\{[^}]*background:\s*rgba\(0,\s*0,\s*0,\s*0\.65\)/s);
  assert.match(app, /createQuakeIntermissionFlow\(\{[\s\S]*?onBackdropVisibilityChange:\s*\(visible\)\s*=>\s*\{[\s\S]*?quakeInterface\.classList\.toggle\("quake-intermission-visible", visible\);[\s\S]*?\}/);
});

async function sourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const resolved = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(resolved));
    else if (entry.isFile() && /\.(?:c|css|html|js|json|md|mjs|ts|yaml|yml)$/.test(entry.name)) files.push(resolved);
  }
  return files;
}
