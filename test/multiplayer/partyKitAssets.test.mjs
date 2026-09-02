import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../../", import.meta.url);
const mapNames = ["start", "e1m1", "e1m2", "e1m3", "e1m4", "e1m5", "e1m6", "e1m7", "e1m8"];

test("PartyKit serves compact authoritative movement assets for every multiplayer map", async () => {
  const config = JSON.parse(await readFile(new URL("partykit.json", projectRoot), "utf8"));
  assert.equal(config.serve, "src/generated/partykit");

  for (const mapName of mapNames) {
    const assetUrl = new URL(`src/generated/partykit/q/${mapName}.deathmatch.json`, projectRoot);
    const [assetText, assetStat] = await Promise.all([
      readFile(assetUrl, "utf8"),
      stat(assetUrl),
    ]);
    const asset = JSON.parse(assetText);
    assert.equal(asset.version, 1, `${mapName} server asset version`);
    assert.ok(asset.collision?.clipNodes?.length > 0, `${mapName} clip nodes`);
    assert.ok(asset.collision?.runtime?.brushes?.length > 0, `${mapName} runtime brushes`);
    assert.ok(asset.collision?.runtime?.groundGrid, `${mapName} ground grid`);
    assert.ok(asset.gameplayDefinitions?.deathmatchSpawns?.length > 0, `${mapName} deathmatch spawns`);
    assert.ok(assetStat.size < 1_000_000, `${mapName} server asset must stay compact`);
  }
});
