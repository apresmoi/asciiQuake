import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function importTsModule(specifier, options = {}) {
  const entryPoint = path.resolve(projectRoot, specifier);
  const result = await build({
    bundle: true,
    define: options.define,
    entryPoints: [entryPoint],
    format: "esm",
    // Asset imports (the scene manifest imports its sprite sheets) bundle as
    // data URLs — tests never fetch them, they only need the module to load.
    loader: { ".png": "dataurl", ".svg": "dataurl" },
    logLevel: "silent",
    platform: "node",
    target: "node22",
    write: false,
  });
  const code = result.outputFiles[0]?.text;
  if (!code) throw new Error(`Failed to bundle ${specifier}`);
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}
