import { build } from "esbuild";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "../..");
const preparedRoot = path.join(projectRoot, "build/generated/public/q");
const outputPath = path.join(projectRoot, "src/generated/quakeMultiplayerWorldFacts.json");
const temporaryOutputPath = `${outputPath}.tmp`;
const partyAssetRoot = path.join(projectRoot, "src/generated/partykit/q");
const mapNames = ["start", "e1m1", "e1m2", "e1m3", "e1m4", "e1m5", "e1m6", "e1m7", "e1m8"];

const world = await importTypeScriptModule(path.join(projectRoot, "src/runtime/multiplayer/world.ts"));
const sceneFacts = await importTypeScriptModule(path.join(projectRoot, "src/runtime/multiplayer/sceneFacts.ts"));
const facts = {};
await mkdir(partyAssetRoot, { recursive: true });
for (const mapName of mapNames) {
  const scenePath = path.join(preparedRoot, `${mapName}.deathmatch.json`);
  const scene = JSON.parse(await readFile(scenePath, "utf8"));
  facts[mapName] = world.quakeMultiplayerWorldDefinitionsFromScene(scene, {});
  const partyAsset = {
    version: 1,
    collision: compactCollision(scene.collision),
    playerEyeHeight: scene.spawn.eyeHeight,
    gameplayDefinitions: sceneFacts.quakeMultiplayerGameplayDefinitionsFromScene(scene, {}),
  };
  const partyAssetPath = path.join(partyAssetRoot, `${mapName}.deathmatch.json`);
  const temporaryPartyAssetPath = `${partyAssetPath}.tmp`;
  await writeFile(temporaryPartyAssetPath, `${JSON.stringify(partyAsset)}\n`);
  await rename(temporaryPartyAssetPath, partyAssetPath);
}

await writeFile(temporaryOutputPath, `${JSON.stringify(facts)}\n`);
await rename(temporaryOutputPath, outputPath);
console.log(`Wrote ${path.relative(projectRoot, outputPath)}`);
console.log(`Wrote ${mapNames.length} compact PartyKit movement assets to ${path.relative(projectRoot, partyAssetRoot)}`);

function compactCollision(collision) {
  if (!collision?.runtime || !Array.isArray(collision.clipNodes)) {
    throw new Error("Prepared scene is missing server collision data.");
  }
  return {
    clipNodes: collision.clipNodes,
    nodes: collision.nodes,
    leaves: collision.leaves,
    runtime: collision.runtime,
  };
}

async function importTypeScriptModule(entryPoint) {
  const result = await build({
    bundle: true,
    entryPoints: [entryPoint],
    format: "esm",
    logLevel: "silent",
    platform: "node",
    target: "node22",
    write: false,
  });
  const code = result.outputFiles[0]?.text;
  if (!code) throw new Error(`Failed to bundle ${path.relative(projectRoot, entryPoint)}.`);
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}
