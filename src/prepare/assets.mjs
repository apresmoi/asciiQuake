import { build } from "esbuild";
import { execSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, chmod, copyFile, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { availableParallelism, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";

import {
  deriveQuakeGameLogicModelPreloads,
  deriveQuakeGameLogicSoundPreloads,
} from "./gameLogicPreloads.mjs";
import {
  buildQuakeGlyphGeometry,
  buildQuakeGlyphMovers,
  buildQuakeGlyphFaceLeaves,
  buildQuakeTexturedStandaloneGlyphGeometry,
} from "./glyphGeometry.mjs";
import { prepareQuakeEffectSprites } from "./effectSprites.mjs";
import {
  QUAKE_PREPARED_SCENE_MODES,
  quakePreparedSceneModeOutputPath,
  quakePreparedSceneVariant,
} from "./sceneVariants.mjs";
import { QUAKE_UNIT_SCALE } from "../quakeScale.js";

const require = createRequire(import.meta.url);
const { path7z } = require("7z-bin");
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "../..");
const generatedPublicDir = process.env.QUAKE_GENERATED_PUBLIC_DIR?.trim()
  ? path.resolve(projectRoot, process.env.QUAKE_GENERATED_PUBLIC_DIR.trim())
  : path.join(projectRoot, "build/generated/public");
const quakePublicPath = "/q";
const quakeOutputDir = path.join(generatedPublicDir, quakePublicPath.slice(1));
const explicitQuakeAssetVersion = normalizeQuakeAssetVersion(process.env.QUAKE_ASSET_VERSION);
const quakeAssetRootMode = normalizeQuakeAssetRootMode(process.env.QUAKE_ASSET_ROOT_MODE);
const quakeUseVersionedAssetRoot = shouldUseVersionedQuakeAssetRoot({
  explicitAssetVersion: explicitQuakeAssetVersion,
  mode: quakeAssetRootMode,
});
const quakeAssetVersion = quakeUseVersionedAssetRoot
  ? explicitQuakeAssetVersion || asciiQuakeAssetVersion()
  : "";
const quakeAssetPublicPath = quakeUseVersionedAssetRoot
  ? `${quakePublicPath}/${quakeAssetVersion}`
  : quakePublicPath;
const quakeTexturePublicPath = `${quakeAssetPublicPath}/t`;
const quakeAssetOutputDir = quakeUseVersionedAssetRoot
  ? path.join(quakeOutputDir, quakeAssetVersion)
  : quakeOutputDir;
const legacyQuakeOutputDir = path.join(generatedPublicDir, "local/quake");
const socialImageOutputBaseName = "cssquake-social-20260701";
const socialImageStaticPublicAssets = [
  [
    path.join(projectRoot, "src/assets/cssquake-social.png"),
    path.join(generatedPublicDir, `assets/${socialImageOutputBaseName}.png`),
  ],
  [
    path.join(projectRoot, "src/assets/cssquake-social.webp"),
    path.join(generatedPublicDir, `assets/${socialImageOutputBaseName}.webp`),
  ],
];
const staticPublicAssets = [
  ...socialImageStaticPublicAssets,
  [path.join(projectRoot, "src/assets/favicon.ico"), path.join(generatedPublicDir, "favicon.ico")],
  [path.join(projectRoot, "src/site/robots.txt"), path.join(generatedPublicDir, "robots.txt")],
  [path.join(projectRoot, "src/site/sitemap.xml"), path.join(generatedPublicDir, "sitemap.xml")],
];
const menuTitleLevelSelectSourcePath = path.join(projectRoot, "src/assets/menu-title-level-select-source.png");
const sourcePortConbackSourcePath = path.join(projectRoot, "src/assets/source-port-conback.png");
const menuTitleHelpSourcePath = path.join(projectRoot, "src/assets/menu-title-help-source.png");
const quakeMapNames = ["start", "e1m1", "e1m2", "e1m3", "e1m4", "e1m5", "e1m6", "e1m7", "e1m8"];
const quakeStartMap = "e1m1";
const quakeSelectableMapNames = new Set(quakeMapNames.filter((mapName) => mapName !== "start"));
const quakeMapTitles = new Map([
  ["start", "Introduction"],
  ["e1m1", "the Slipgate Complex"],
  ["e1m2", "Castle of the Damned"],
  ["e1m3", "the Necropolis"],
  ["e1m4", "the Grisly Grotto"],
  ["e1m5", "Gloom Keep"],
  ["e1m6", "The Door To Chthon"],
  ["e1m7", "The House of Chthon"],
  ["e1m8", "Ziggurat Vertigo"],
]);
const mapOutputPaths = new Map(quakeMapNames.map((mapName) => [
  `maps/${mapName}.bsp`,
  path.join(quakeOutputDir, `${mapName}.json`),
]));
const manifestOutputPath = path.join(quakeOutputDir, "manifest.json");
const hudOutputPath = path.join(quakeOutputDir, "hud.png");
const hudBaseOutputPath = path.join(quakeOutputDir, "hud-base.png");
const hudInventoryOutputPath = path.join(quakeOutputDir, "hud-inventory.png");
const hudIconsOutputPath = path.join(quakeOutputDir, "hud-icons.png");
const hudNumbersOutputPath = path.join(quakeOutputDir, "hud-numbers.png");
const hudDamageNumbersOutputPath = path.join(quakeOutputDir, "hud-numbers-damage.png");
const mainMenuOutputPath = path.join(quakeOutputDir, "main-menu.png");
const mainMenuPlaqueOutputPath = path.join(quakeOutputDir, "main-menu-plaque.png");
const mainMenuTitleOutputPath = path.join(quakeOutputDir, "main-menu-title.png");
const mainMenuMultiplayerOutputPath = path.join(quakeOutputDir, "main-menu-multiplayer.png");
const intermissionCompleteOutputPath = path.join(quakeOutputDir, "intermission-complete.png");
const intermissionLabelsOutputPath = path.join(quakeOutputDir, "intermission-labels.png");
const intermissionNumbersOutputPath = path.join(quakeOutputDir, "intermission-numbers.png");
const mainMenuActiveOutputPath = path.join(quakeOutputDir, "main-menu-active.png");
const mainMenuActiveOutputPaths = [
  mainMenuActiveOutputPath,
  path.join(quakeOutputDir, "main-menu-active-level-select.png"),
  path.join(quakeOutputDir, "main-menu-active-options.png"),
  path.join(quakeOutputDir, "main-menu-active-help.png"),
];
const mainMenuCursorOutputPath = path.join(quakeOutputDir, "main-menu-cursor.png");
const mainMenuBackgroundOutputPath = path.join(quakeOutputDir, "menu-background.png");
const singlePlayerMenuOutputPath = path.join(quakeOutputDir, "single-player-menu.png");
const aboutOutputPath = path.join(quakeOutputDir, "about.png");
const menuPanelTextureOutputPath = path.join(quakeOutputDir, "menu-panel-texture.png");
const QUAKE_MENU_PANEL_TEXTURE_NAMES = [
  "wbrick1_5",
  "wiz1_4",
  "stone1_3",
  "wizmet1_2",
];
const menuTitleLevelSelectOutputPath = path.join(quakeOutputDir, "menu-title-level-select.png");
const menuTitleSinglePlayerOutputPath = path.join(quakeOutputDir, "menu-title-single-player.png");
const menuTitleOptionsOutputPath = path.join(quakeOutputDir, "menu-title-options.png");
const menuTitleHelpOutputPath = path.join(quakeOutputDir, "menu-title-help.png");
const concharsOutputPath = path.join(quakeOutputDir, "conchars.png");
const weaponOutputPath = path.join(quakeOutputDir, "weapon.json");
const weaponModelOutputDir = path.join(quakeOutputDir, "w");
const pickupOutputPath = path.join(quakeOutputDir, "pickups.json");
const progsOutputPath = path.join(quakeOutputDir, "progs.json");
const soundManifestOutputPath = path.join(quakeOutputDir, "sounds.json");
const effectSpritesOutputPath = path.join(quakeOutputDir, "effects.json");
const sourceProgramFactsInputPath = path.join(projectRoot, "src/generated/quakeProgramFacts.json");
const QUAKE_DEFAULT_WEAPON_VIEWMODEL_PATH = "progs/v_shot.mdl";
const sourcePath = path.join(projectRoot, "src/prepare/scene.ts");
const textureOutputDir = path.join(quakeAssetOutputDir, "t");
const soundOutputDir = path.join(quakeOutputDir, "s");
const effectSpritesOutputDir = path.join(quakeAssetOutputDir, "e");
const quakePrepareConcurrency = Number.parseInt(process.env.QUAKE_PREPARE_CONCURRENCY ?? "", 10);
const quakePrepareModelConcurrency = Number.parseInt(process.env.QUAKE_PREPARE_MODEL_CONCURRENCY ?? "", 10);
const quakePrepareCi = normalizedEnvFlag(process.env.CI);
const quakePreparePriorityScheduling = process.env.QUAKE_PREPARE_PRIORITY_SCHEDULING === "1" ||
  (quakePrepareCi && process.env.QUAKE_PREPARE_PRIORITY_SCHEDULING !== "0");
const quakePrepareTiming = process.env.QUAKE_PREPARE_TIMING === "1";
const quakePrepareDetailedTiming = process.env.QUAKE_PREPARE_DETAILED_TIMING === "1";
const quakePrepareMapOnly = process.env.QUAKE_PREPARE_MAP_ONLY === "1";
const quakePrepareMapNames = new Set(
  (process.env.QUAKE_PREPARE_MAPS ?? "")
    .split(",")
    .map((mapName) => mapName.trim().toLowerCase())
    .filter(Boolean),
);
const quakePrepareOnly = normalizeQuakePrepareOnly(process.env.QUAKE_PREPARE_ONLY ?? "");
const quakePrepareModelsOnly = quakePrepareOnly === "models";
const quakePrepareWeaponOnly = quakePrepareOnly === "weapon";
const quakePrepareManifestOnly = quakePrepareOnly === "manifest";
const quakePrepareModelOnly = parseQuakePrepareModelOnly(process.env.QUAKE_PREPARE_MODEL_ONLY ?? "");
const quakePrepareReferencedModelsOnly = process.env.QUAKE_PREPARE_REFERENCED_MODELS_ONLY !== "0";
const quakePrepareMapOnlyAllowNewManifest = process.env.QUAKE_PREPARE_MAP_ONLY_ALLOW_NEW_MANIFEST === "1";
const quakeAliasRebakeMerge = process.env.QUAKE_ALIAS_REBAKE_MERGE === "1";
const quakeAliasRebakeMergeAffineEpsilon = Number.parseFloat(
  process.env.QUAKE_ALIAS_REBAKE_MERGE_AFFINE_EPSILON ?? "",
);
const quakeLightmapBake = process.env.QUAKE_LIGHTMAP_BAKE !== "0";
const quakeLightmapBakeDetailTarget = Number.parseFloat(process.env.QUAKE_LIGHTMAP_BAKE_DETAIL_TARGET ?? "");
const quakeLightmapBakeLightSupersample = Number.parseInt(process.env.QUAKE_LIGHTMAP_BAKE_LIGHT_SUPERSAMPLE ?? "", 10);
const quakeLightmapBakeMaxSide = Number.parseInt(process.env.QUAKE_LIGHTMAP_BAKE_MAX_SIDE ?? "", 10);
const quakeLightmapBakeMaxTotalTexels = Number.parseInt(process.env.QUAKE_LIGHTMAP_BAKE_MAX_TOTAL_TEXELS ?? "", 10);
const quakeLightmapBakeMinDisplaySide = Number.parseFloat(process.env.QUAKE_LIGHTMAP_BAKE_MIN_DISPLAY_SIDE ?? "");
const quakeLightmapBakeMinTextureScale = Number.parseFloat(process.env.QUAKE_LIGHTMAP_BAKE_MIN_TEXTURE_SCALE ?? "");
const quakeLightmapBakeMinTextureSide = Number.parseInt(process.env.QUAKE_LIGHTMAP_BAKE_MIN_TEXTURE_SIDE ?? "", 10);
const quakeLightmapBakeTextureFallbackOverlay = process.env.QUAKE_LIGHTMAP_BAKE_TEXTURE_FALLBACK_OVERLAY === "1";
const quakeLightmapBakeTextureFallbackOverlayMaxExtraRatio = Number.parseFloat(
  process.env.QUAKE_LIGHTMAP_BAKE_TEXTURE_FALLBACK_OVERLAY_RATIO ?? "",
);
const quakeLightmapBakeTextureFallbackOverlayMaxSide = Number.parseInt(
  process.env.QUAKE_LIGHTMAP_BAKE_TEXTURE_FALLBACK_OVERLAY_MAX_SIDE ?? "",
  10,
);
const quakeLightmapBakeMergedOverlay = process.env.QUAKE_LIGHTMAP_BAKE_MERGED_OVERLAY === "1";
const quakeLightmapBakeMergedOverlayMaxExtraRatio = Number.parseFloat(
  process.env.QUAKE_LIGHTMAP_BAKE_MERGED_OVERLAY_RATIO ?? "",
);
const quakeLightmapBakeMergedOverlayMaxSide = Number.parseInt(
  process.env.QUAKE_LIGHTMAP_BAKE_MERGED_OVERLAY_MAX_SIDE ?? "",
  10,
);
const quakeLightmapBakeMinRange = Number.parseFloat(process.env.QUAKE_LIGHTMAP_BAKE_MIN_RANGE ?? "");
const quakeLightmapOverlay = process.env.QUAKE_LIGHTMAP_OVERLAY === "1";
const quakeLightmapOverlayMaxExtraRatio = Number.parseFloat(process.env.QUAKE_LIGHTMAP_OVERLAY_MAX_EXTRA_RATIO ?? "");
const quakeLightmapOverlayMaxSide = Number.parseInt(process.env.QUAKE_LIGHTMAP_OVERLAY_MAX_SIDE ?? "", 10);
const quakeLightmapOverlayMinRange = Number.parseFloat(process.env.QUAKE_LIGHTMAP_OVERLAY_MIN_RANGE ?? "");
const EXPECTED_RESOURCE_SIZE = 9_086_574;
const EXPECTED_RESOURCE_SHA256 = "c192c9c71bee41750dd7d14c99378766d61e077977b9d13d1a457b8d9eabe34a";
const QUAKE_HUD_TRANSPARENT = 255;
const QUAKE_HUD_WIDTH = 320;
const QUAKE_HUD_HEIGHT = 24;
const QUAKE_HUD_ICON_SLOT_SIZE = 24;
const QUAKE_HUD_ICON_QPICS = [
  "sb_armor1",
  "sb_armor2",
  "sb_armor3",
  "face1",
  "face_invis",
  "face_invul2",
  "face_inv2",
  "face_quad",
  "sb_shells",
  "sb_nails",
  "sb_rocket",
  "sb_cells",
  "sb_key1",
  "sb_key2",
  "sb_invis",
  "sb_invuln",
  "sb_suit",
  "sb_quad",
];
const QUAKE_MENU_WIDTH = 320;
const QUAKE_MENU_HEIGHT = 200;
const QUAKE_ABOUT_WIDTH = 320;
const QUAKE_ABOUT_HEIGHT = 200;
const QUAKE_MENU_FRAME_COUNT = 6;
const QUAKE_MENU_CURSOR_WIDTH = 16;
const QUAKE_MENU_CURSOR_HEIGHT = 24;
const QUAKE_MAIN_MENU_ITEM_X = 72;
const QUAKE_MAIN_MENU_ROW_HEIGHT = 20;
const QUAKE_MAIN_MENU_ACTIVE_ROW_WIDTH = 240;
const QUAKE_MAIN_MENU_ROW_TOPS = [28, 52, 76, 100, 126];
const QUAKE_MAIN_MENU_LEVEL_LABEL = "LEVEL SELECT";
const QUAKE_MAIN_MENU_LEVEL_LABEL_SCALE = 2;
const QUAKE_PICKUP_MODEL_SCALE = QUAKE_UNIT_SCALE;
const QUAKE_WEAPON_MODEL_PIVOT = parseQuakeWeaponModelPivot(process.env.QUAKE_WEAPON_MODEL_PIVOT);
const QUAKE_ENEMY_ALIAS_MODEL_RENDER_SCALE = 4;
const QUAKE_PLAYER_ALIAS_MODEL_RENDER_SCALE = 4;
const QUAKE_ALIAS_MERGE_MAX_NONPLANAR_DISTANCE = 0.03;
const QUAKE_ALIAS_MERGE_UV_EPSILON = 1e-6;
const QUAKE_ALIAS_MERGE_GEOMETRY_EPSILON = 1e-8;
const QUAKE_ALIAS_REBAKE_MERGE_AFFINE_EPSILON = Number.isFinite(quakeAliasRebakeMergeAffineEpsilon)
  ? Math.max(0, quakeAliasRebakeMergeAffineEpsilon)
  : 0.0025;
const QUAKE_ALIAS_SKIN_PADDING_RADIUS = 4;
const QUAKE_ALIAS_SKIN_FILLER_INDEX = 208;
const QUAKE_KNIGHT_MODEL_PATH = "progs/knight.mdl";
const QUAKE_BACKPACK_MODEL_PATH = "progs/backpack.mdl";
const QUAKE_LAVABALL_MODEL_PATH = "progs/lavaball.mdl";
const QUAKE_KNIGHT_SWORD_TRIANGLE_INDICES = new Set([
  11, 48, 64, 88, 91, 104, 105, 107, 110, 112, 114, 118, 134, 151, 164, 193, 197, 199, 201, 204,
]);
const QUAKE_BACKPACK_STRAP_NO_MERGE_TRIANGLE_INDICES = new Set([89, 108]);
const QUAKE_KNIGHT_SWORD_SUBDIVISION_LEVELS = 0;
const QUAKE_KNIGHT_STAND_SWORD_FORWARD_OFFSET = 8;
const QUAKE_PICKUP_MODEL_PATHS = {
  item_armor1: "progs/armor.mdl",
  item_armor2: "progs/armor.mdl",
  item_key1: "progs/w_s_key.mdl",
  item_key2: "progs/w_g_key.mdl",
  item_artifact_super_damage: "progs/quaddama.mdl",
  item_artifact_invulnerability: "progs/invulner.mdl",
  item_artifact_envirosuit: "progs/suit.mdl",
  item_artifact_invisibility: "progs/invisibl.mdl",
  weapon_nailgun: "progs/g_nail.mdl",
  weapon_supernailgun: "progs/g_nail2.mdl",
  weapon_supershotgun: "progs/g_shot.mdl",
  weapon_grenadelauncher: "progs/g_rock.mdl",
  weapon_rocketlauncher: "progs/g_rock2.mdl",
  key_silver: "progs/w_s_key.mdl",
  key_gold: "progs/w_g_key.mdl",
};
const QUAKE_PICKUP_BSP_MODEL_PATHS = [
  "maps/b_batt0.bsp",
  "maps/b_batt1.bsp",
  "maps/b_bh10.bsp",
  "maps/b_bh100.bsp",
  "maps/b_bh25.bsp",
  "maps/b_nail0.bsp",
  "maps/b_nail1.bsp",
  "maps/b_rock0.bsp",
  "maps/b_rock1.bsp",
  "maps/b_shell0.bsp",
  "maps/b_shell1.bsp",
  "maps/b_exbox2.bsp",
  "maps/b_explob.bsp",
];
const QUAKE_MONSTER_MODEL_PATHS = {
  monster_army: "progs/soldier.mdl",
  monster_dog: "progs/dog.mdl",
  monster_enforcer: "progs/enforcer.mdl",
  monster_fish: "progs/fish.mdl",
  monster_knight: "progs/knight.mdl",
  monster_ogre: "progs/ogre.mdl",
  monster_wizard: "progs/wizard.mdl",
  monster_zombie: "progs/zombie.mdl",
  monster_demon1: "progs/demon.mdl",
  monster_hell_knight: "progs/hknight.mdl",
  monster_shalrath: "progs/shalrath.mdl",
  monster_shambler: "progs/shambler.mdl",
  monster_tarbaby: "progs/tarbaby.mdl",
  monster_boss: "progs/boss.mdl",
  monster_oldone: "progs/oldone.mdl",
};
const QUAKE_ANIMATED_MONSTER_ALIAS_MODEL_PATHS = [
  "progs/boss.mdl",
  "progs/demon.mdl",
  "progs/dog.mdl",
  "progs/knight.mdl",
  "progs/ogre.mdl",
  "progs/shambler.mdl",
  "progs/soldier.mdl",
  "progs/wizard.mdl",
  "progs/zombie.mdl",
];
const QUAKE_MULTIPLAYER_PLAYER_ALIAS_MODEL_PATHS = [
  "progs/player.mdl",
  "progs/h_player.mdl",
];
const QUAKE_ANIMATED_PLAYER_ALIAS_MODEL_PATHS = [
  "progs/player.mdl",
];
const QUAKE_PROJECTILE_ALIAS_MODEL_PATHS = [
  "progs/bolt.mdl",
  "progs/grenade.mdl",
  "progs/k_spike.mdl",
  "progs/laser.mdl",
  "progs/lavaball.mdl",
  "progs/missile.mdl",
  "progs/s_spike.mdl",
  "progs/spike.mdl",
  "progs/v_spike.mdl",
  "progs/w_spike.mdl",
  "progs/zom_gib.mdl",
];
const QUAKE_MONSTER_PROJECTILE_MODEL_PATHS = {
  monster_boss: "progs/lavaball.mdl",
  monster_hell_knight: "progs/k_spike.mdl",
  monster_ogre: "progs/grenade.mdl",
  monster_shalrath: "progs/v_spike.mdl",
  monster_wizard: "progs/w_spike.mdl",
  monster_zombie: "progs/zom_gib.mdl",
};

const tempDir = await mkdtemp(path.join(tmpdir(), "asciiquake-preparse-"));
const preparedSceneModulePath = path.join(tempDir, "quakePreparedScene.mjs");
const sharewareDownloadPath = path.join(tempDir, "quake-shareware-download");
const sharewareExtractDir = path.join(tempDir, "quake-shareware");
const resourcePath = path.join(tempDir, "resource.1");
const extractedPakPath = path.join(tempDir, "ID1/PAK0.PAK");
const textureFileUrlByHash = new Map();
const texturePngByPublicPath = new Map();

function normalizeQuakeAssetVersion(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "";
  if (!/^[a-zA-Z0-9._-]+$/.test(normalized)) {
    throw new Error(`Unsafe QUAKE_ASSET_VERSION ${JSON.stringify(value)}.`);
  }
  return normalized;
}

function normalizeQuakeAssetRootMode(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized || normalized === "auto") return "auto";
  if (["local", "dev", "development", "unversioned"].includes(normalized)) return "local";
  if (["versioned", "deploy", "deployment", "production"].includes(normalized)) return "versioned";
  throw new Error(
    `Unsupported QUAKE_ASSET_ROOT_MODE ${JSON.stringify(value)}. ` +
    `Use "local", "versioned", or leave it unset for auto.`,
  );
}

function shouldUseVersionedQuakeAssetRoot({ explicitAssetVersion, mode }) {
  if (mode === "local") return false;
  if (mode === "versioned") return true;
  return Boolean(
    explicitAssetVersion ||
    normalizedEnvFlag(process.env.NETLIFY) ||
    normalizedEnvFlag(process.env.CI) ||
    normalizedEnvFlag(process.env.QUAKE_DEPLOY_BUILD)
  );
}

function asciiQuakeAssetVersion() {
  let baseVersion = "0";
  try {
    const commitCount = execSync("git rev-list --count HEAD", {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (/^\d+$/.test(commitCount)) baseVersion = commitCount;
  } catch {
    // Netlify invalidates each deploy, so a fixed local fallback is still cache-safe there.
  }
  return baseVersion;
}

function normalizeQuakePrepareOnly(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized || normalized === "all") return "";
  if (normalized === "weapon" || normalized === "viewmodel") return "weapon";
  if (normalized === "manifest") return "manifest";
  if (normalized === "model") return "models";
  if (normalized === "models") return "models";
  throw new Error(
    `Unsupported QUAKE_PREPARE_ONLY ${JSON.stringify(value)}. ` +
    `Use "manifest", "weapon", or "models" for focused runs, or leave it unset for the full prepare.`,
  );
}

function parseQuakePrepareModelOnly(value) {
  return new Set(
    String(value ?? "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
}

function parseQuakeWeaponModelPivot(value) {
  const fallback = [1.0, 0, 0];
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  const values = text.split(/[\s,]+/).map(Number);
  return values.length === 3 && values.every(Number.isFinite) ? values : fallback;
}

function quakePrepareModelOnlyMatches(source) {
  if (quakePrepareModelOnly.size === 0) return true;
  const normalized = String(source ?? "").trim().toLowerCase();
  const basename = path.basename(normalized);
  const stem = basename.replace(/\.(?:mdl|bsp)$/i, "");
  return quakePrepareModelOnly.has(normalized) ||
    quakePrepareModelOnly.has(basename) ||
    quakePrepareModelOnly.has(stem);
}

function selectedQuakeMapEntries() {
  if (quakePrepareModelsOnly || quakePrepareWeaponOnly) return [];
  const entries = quakePrepareMapOnly
    ? [...mapOutputPaths].filter(([mapPath]) => quakePrepareMapNames.has(mapNameFromPakPath(mapPath)))
    : [...mapOutputPaths];
  if (entries.length > 0) return entries;
  throw new Error(
    "QUAKE_PREPARE_MAP_ONLY=1 needs at least one map in QUAKE_PREPARE_MAPS, " +
    "for example QUAKE_PREPARE_MAPS=e1m1.",
  );
}

async function readStableQuakeAssetManifestForMapOnly() {
  let text = "";
  try {
    text = await readFile(manifestOutputPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT" && quakePrepareMapOnlyAllowNewManifest) return null;
    if (error?.code === "ENOENT") {
      throw new Error("QUAKE_PREPARE_MAP_ONLY=1 requires an existing full Quake manifest. Run pnpm prepare:quake once first.");
    }
    throw error;
  }
  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch {
    throw new Error("QUAKE_PREPARE_MAP_ONLY=1 found an invalid existing Quake manifest. Run a full pnpm prepare:quake first.");
  }
  if (manifest?.status === "regenerating") {
    if (quakePrepareMapOnlyAllowNewManifest) return null;
    throw new Error("QUAKE_PREPARE_MAP_ONLY=1 found a regenerating manifest. Let the current prepare finish or run a full prepare.");
  }
  if (!Array.isArray(manifest?.maps) || !manifest?.assets) {
    if (quakePrepareMapOnlyAllowNewManifest) return null;
    throw new Error("QUAKE_PREPARE_MAP_ONLY=1 found an incomplete manifest. Run a full pnpm prepare:quake first.");
  }
  return text;
}

async function removeSelectedQuakeMapOutputs(mapEntries) {
  await Promise.all(mapEntries.map(([mapPath]) => rm(mapOutputPaths.get(mapPath), { force: true })));
}

try {
  if (quakePrepareManifestOnly) {
    await writeQuakeAssetManifestFromGeneratedFiles();
  } else {
  const stableManifestJson = quakePrepareMapOnly
    ? await readStableQuakeAssetManifestForMapOnly()
    : "";
  const mapEntriesToPrepare = selectedQuakeMapEntries();
  if (!quakePrepareModelsOnly && !quakePrepareWeaponOnly) {
    await writeQuakeAssetRegenerationManifest({
      mode: quakePrepareMapOnly ? "map-only" : "full",
      mapNames: mapEntriesToPrepare.map(([mapPath]) => mapNameFromPakPath(mapPath)),
    });
  }
  await runPrepareStep("pak", async () => {
    if (process.env.QUAKE_PAK_PATH?.trim()) {
      await copyQuakePakFromPath(process.env.QUAKE_PAK_PATH.trim());
    } else {
      await downloadQuakeResource();
      await verifyQuakeResource();
      await extractQuakePak();
    }
  });
  if (quakePrepareMapOnly) {
    await removeSelectedQuakeMapOutputs(mapEntriesToPrepare);
    await rm(textureOutputDir, { recursive: true, force: true });
    console.log(
      `Preparing map-only Quake assets for ${mapEntriesToPrepare.map(([mapPath]) => mapNameFromPakPath(mapPath)).join(", ")}`,
    );
  } else if (quakePrepareModelsOnly) {
    console.log(
      `Preparing model-only Quake assets` +
      `${quakePrepareModelOnly.size ? ` for ${[...quakePrepareModelOnly].join(", ")}` : ""}`,
    );
  } else if (quakePrepareWeaponOnly) {
    console.log("Preparing weapon-only Quake assets");
  } else {
    await rm(legacyQuakeOutputDir, { recursive: true, force: true });
    await removeLegacyQuakeJsonFiles();
    await removeGeneratedQuakeAssetVersionDirs();
    await rm(textureOutputDir, { recursive: true, force: true });
    await rm(soundOutputDir, { recursive: true, force: true });
    await rm(path.join(quakeAssetOutputDir, "b"), { recursive: true, force: true });
    await rm(path.join(quakeOutputDir, "t"), { recursive: true, force: true });
    await rm(path.join(quakeOutputDir, "b"), { recursive: true, force: true });
    await rm(path.join(quakeOutputDir, "p"), { recursive: true, force: true });
    await rm(path.join(quakeOutputDir, "e"), { recursive: true, force: true });
    await copyStaticPublicAssets();
  }

  await runPrepareStep("scene compiler bundle", () => build({
    entryPoints: [sourcePath],
    outfile: preparedSceneModulePath,
    bundle: true,
    platform: "node",
    format: "esm",
    absWorkingDir: projectRoot,
    logLevel: "silent",
  }));

  const {
    createQuakeSceneFromPreparedScene,
    createQuakePreparedSceneFromPakBuffer,
    parseQuakePakDirectory,
  } = await import(pathToFileURL(preparedSceneModulePath).href);
  const pak = await readFile(extractedPakPath);
  const buffer = pak.buffer.slice(pak.byteOffset, pak.byteOffset + pak.byteLength);
  const sourceProgramFacts = await loadQuakeSourceProgramFacts();

  if (quakePrepareWeaponOnly) {
    const uiAssets = loadQuakeHudAssets(pak, parseQuakePakDirectory);
    const weaponModelOutputPaths = await runPrepareStep(
      "weapon models",
      () => writeQuakeWeaponModelFiles(uiAssets, sourceProgramFacts),
    );
    for (const outputPath of weaponModelOutputPaths) {
      console.log(`Wrote ${path.relative(projectRoot, outputPath)}`);
    }
  } else if (quakePrepareModelsOnly) {
    const uiAssets = loadQuakeHudAssets(pak, parseQuakePakDirectory);
    const programMetadata = buildQuakeProgramMetadata(uiAssets, sourceProgramFacts);
    const pickupModels = await runPrepareStep("model geometry", () => buildQuakePickupModels(
      uiAssets,
      async (mapPath) => createQuakeSceneFromPreparedScene(await createQuakePreparedSceneFromPakBuffer(buffer, {
        encodeTextureUrl: encodeTextureFileUrl,
        gameLogicProgramFacts: sourceProgramFacts,
        mapPath,
      })),
      programMetadata,
      { concurrency: normalizedQuakePrepareModelConcurrency() },
    ));
    const outputPickupModels = quakePrepareModelOnly.size > 0
      ? await mergeQuakePickupModelOutput(pickupModels)
      : pickupModels;
    await mkdir(path.dirname(pickupOutputPath), { recursive: true });
    await writeFile(pickupOutputPath, JSON.stringify(outputPickupModels));
    const modelCount = Object.keys(pickupModels.models).length;
    console.log(`Prepared ${modelCount} model${modelCount === 1 ? "" : "s"}`);
    console.log(`Wrote ${path.relative(projectRoot, pickupOutputPath)}`);
  } else {
    const pakEntrySizeByName = new Map(parseQuakePakDirectory(buffer).map((entry) => [entry.name, entry.size]));
    const preparedMaps = await runPrepareStep("maps", () => mapConcurrentlyByOptionalPriority(
      mapEntriesToPrepare,
      normalizedQuakePrepareConcurrency(),
      (mapEntry) => quakeMapPreparePriority(mapEntry, pakEntrySizeByName),
      async ([mapPath, outputPath]) => {
        const mapName = mapNameFromPakPath(mapPath);
        return runPrepareStep(`map ${mapName}`, async () => {
          const prepared = await runPrepareDetailStep(`map ${mapName} prepared scene`, () =>
            createQuakePreparedSceneFromPakBuffer(buffer, {
              encodeTextureUrl: encodeTextureFileUrl,
              gameLogicProgramFacts: sourceProgramFacts,
              lightmapBake: quakeLightmapBake,
              ...(Number.isFinite(quakeLightmapBakeDetailTarget)
                ? { lightmapBakeDetailTarget: quakeLightmapBakeDetailTarget }
                : {}),
              ...(Number.isFinite(quakeLightmapBakeLightSupersample)
                ? { lightmapBakeLightSupersample: quakeLightmapBakeLightSupersample }
                : {}),
              ...(Number.isFinite(quakeLightmapBakeMaxSide) ? { lightmapBakeMaxSide: quakeLightmapBakeMaxSide } : {}),
              ...(Number.isFinite(quakeLightmapBakeMaxTotalTexels)
                ? { lightmapBakeMaxTotalTexels: quakeLightmapBakeMaxTotalTexels }
                : {}),
              ...(Number.isFinite(quakeLightmapBakeMinDisplaySide)
                ? { lightmapBakeMinDisplaySide: quakeLightmapBakeMinDisplaySide }
                : {}),
              ...(Number.isFinite(quakeLightmapBakeMinTextureScale)
                ? { lightmapBakeMinTextureScale: quakeLightmapBakeMinTextureScale }
                : {}),
              ...(Number.isFinite(quakeLightmapBakeMinTextureSide)
                ? { lightmapBakeMinTextureSide: quakeLightmapBakeMinTextureSide }
                : {}),
              lightmapBakeTextureEncoding: true,
              lightmapBakeTextureFallbackOverlay: quakeLightmapBakeTextureFallbackOverlay,
              ...(Number.isFinite(quakeLightmapBakeTextureFallbackOverlayMaxExtraRatio)
                ? { lightmapBakeTextureFallbackOverlayMaxExtraRatio: quakeLightmapBakeTextureFallbackOverlayMaxExtraRatio }
                : {}),
              ...(Number.isFinite(quakeLightmapBakeTextureFallbackOverlayMaxSide)
                ? { lightmapBakeTextureFallbackOverlayMaxSide: quakeLightmapBakeTextureFallbackOverlayMaxSide }
                : {}),
              lightmapBakeMergedOverlay: quakeLightmapBakeMergedOverlay,
              ...(Number.isFinite(quakeLightmapBakeMergedOverlayMaxExtraRatio)
                ? { lightmapBakeMergedOverlayMaxExtraRatio: quakeLightmapBakeMergedOverlayMaxExtraRatio }
                : {}),
              ...(Number.isFinite(quakeLightmapBakeMergedOverlayMaxSide)
                ? { lightmapBakeMergedOverlayMaxSide: quakeLightmapBakeMergedOverlayMaxSide }
                : {}),
              ...(Number.isFinite(quakeLightmapBakeMinRange) ? { lightmapBakeMinRange: quakeLightmapBakeMinRange } : {}),
              lightmapOverlay: quakeLightmapOverlay,
              ...(Number.isFinite(quakeLightmapOverlayMaxExtraRatio)
                ? { lightmapOverlayMaxExtraRatio: quakeLightmapOverlayMaxExtraRatio }
                : {}),
              ...(Number.isFinite(quakeLightmapOverlayMaxSide) ? { lightmapOverlayMaxSide: quakeLightmapOverlayMaxSide } : {}),
              ...(Number.isFinite(quakeLightmapOverlayMinRange) ? { lightmapOverlayMinRange: quakeLightmapOverlayMinRange } : {}),
              litTextureEncoding: true,
              litTextureEncodingTextureNames: QUAKE_MENU_PANEL_TEXTURE_NAMES,
              mapPath,
            }));
          const menuPanelTextureMap = {
            prepared: {
              label: prepared.label,
              textures: prepared.textures,
              polygons: prepared.polygons,
            },
          };
          const scene = await runPrepareDetailStep(`map ${mapName} scene hydrate`, () =>
            createQuakeSceneFromPreparedScene(prepared));
          const glyphFaceLeaves = buildQuakeGlyphFaceLeaves(prepared.visibility);
          prepared.glyphGeometry = await runPrepareDetailStep(`map ${mapName} glyph geometry`, () =>
            buildQuakeGlyphGeometry(scene.polygons, glyphFaceLeaves));
          prepared.glyphMovers = await runPrepareDetailStep(`map ${mapName} glyph movers`, () =>
            buildQuakeGlyphMovers(scene.polygons));
          return { mapName, mapPath, outputPath, prepared, menuPanelTextureMap };
        });
      },
    ));
  const menuPanelTextureMaps = preparedMaps.map((item) => item.menuPanelTextureMap);

  for (const item of preparedMaps) {
    const { outputPath, prepared } = item;
    const mapName = item.mapName ?? mapNameFromPakPath(item.mapPath);
    item.modeOutputPaths = {};
    item.modeSizes = {};
    for (const mode of QUAKE_PREPARED_SCENE_MODES) {
      const modeOutputPath = quakePreparedSceneModeOutputPath(outputPath, mode);
      const modePrepared = await runPrepareDetailStep(`map ${mapName} ${mode} scene variant`, () =>
        quakePreparedSceneVariant(prepared, mode)
      );
      const preparedJson = await runPrepareDetailStep(`map ${mapName} ${mode} json stringify`, () =>
        JSON.stringify(modePrepared)
      );
      await runPrepareDetailStep(`map ${mapName} ${mode} json mkdir`, () =>
        mkdir(path.dirname(modeOutputPath), { recursive: true })
      );
      await runPrepareDetailStep(`map ${mapName} ${mode} json write`, () => writeFile(modeOutputPath, preparedJson));
      item.modeOutputPaths[mode] = modeOutputPath;
      item.modeSizes[mode] = Buffer.byteLength(preparedJson);
    }
    item.size = item.modeSizes.singleplayer;
  }

  if (quakePrepareMapOnly) {
    await pruneUnreferencedTextureFiles(
      quakePreparedMapOutputPaths(preparedMaps),
      { removeUnreferenced: false },
    );
    await writeFileAtomic(
      manifestOutputPath,
      stableManifestJson
        ? quakeMapOnlyManifestJsonWithSceneVariants(stableManifestJson, preparedMaps)
        : JSON.stringify(buildQuakeAssetManifest(preparedMaps, {}, { models: {} })),
    );
    for (const { modeOutputPaths, modeSizes, prepared, size } of preparedMaps) {
      for (const mode of QUAKE_PREPARED_SCENE_MODES) {
        const outputPath = modeOutputPaths?.[mode];
        const modeSize = modeSizes?.[mode];
        if (!outputPath || !modeSize) continue;
        console.log(`Wrote ${path.relative(projectRoot, outputPath)} (${formatBytes(modeSize)})`);
      }
      console.log(`${prepared.label}: ${prepared.faceCount}/${prepared.sourceFaceCount} faces, ${prepared.textureCount} textures`);
    }
    console.log(
      `${stableManifestJson ? "Restored" : "Wrote"} ${path.relative(projectRoot, manifestOutputPath)} ` +
      "after map-only prepare",
    );
  } else {
    const uiAssets = loadQuakeHudAssets(pak, parseQuakePakDirectory);
    await runPrepareStep("ui assets", async () => {
      await writeFile(hudBaseOutputPath, await buildQuakeHudBasePng(uiAssets));
      await writeFile(hudInventoryOutputPath, await buildQuakeHudInventoryPng(uiAssets));
      await writeFile(hudIconsOutputPath, await buildQuakeHudIconsPng(uiAssets));
      await writeFile(hudNumbersOutputPath, await buildQuakeHudNumbersPng(uiAssets));
      await writeFile(hudDamageNumbersOutputPath, await buildQuakeHudNumbersPng(uiAssets, { damageTint: true }));
      await writeFile(hudOutputPath, await buildQuakeHudPng(uiAssets));
      await writeFile(mainMenuOutputPath, await buildQuakeMainMenuPng(uiAssets));
      await writeFile(mainMenuPlaqueOutputPath, await buildPakQpicCropPng(uiAssets, "gfx/qplaque.lmp", 0, 0, 32, 144));
      await writeFile(mainMenuTitleOutputPath, await buildPakQpicCropPng(uiAssets, "gfx/ttl_main.lmp", 0, 0, 96, 24));
      await writeFile(mainMenuMultiplayerOutputPath, await buildQuakeMainMenuMultiplayerPng(uiAssets));
      await writeFile(intermissionCompleteOutputPath, await buildPakQpicPng(uiAssets, "gfx/complete.lmp"));
      await writeFile(intermissionLabelsOutputPath, await buildPakQpicPng(uiAssets, "gfx/inter.lmp"));
      await writeFile(intermissionNumbersOutputPath, await buildQuakeIntermissionNumbersPng(uiAssets));
    });
    const menuTitlePaletteColors = buildQuakeMenuTitlePaletteColors(uiAssets);
    const mainMenuActivePngs = await buildQuakeMainMenuActivePngs(uiAssets);
    mainMenuActivePngs[1] = await buildCustomMenuTitlePng(menuTitleLevelSelectSourcePath, {
      height: 20,
      paletteColors: menuTitlePaletteColors,
    });
    for (let index = 0; index < mainMenuActivePngs.length; index++) {
      await writeFile(mainMenuActiveOutputPaths[index], mainMenuActivePngs[index]);
    }
    await writeFile(mainMenuCursorOutputPath, await buildQuakeMainMenuCursorPng(uiAssets));
    await writeFile(mainMenuBackgroundOutputPath, await readFile(sourcePortConbackSourcePath));
    await writeFile(singlePlayerMenuOutputPath, await buildPakQpicPng(uiAssets, "gfx/sp_menu.lmp"));
    await writeFile(aboutOutputPath, await buildQuakeAboutPng(uiAssets));
    await writeFile(menuPanelTextureOutputPath, await buildQuakeMenuPanelTexturePng(menuPanelTextureMaps));
    await writeFile(menuTitleLevelSelectOutputPath, await buildCustomMenuTitlePng(menuTitleLevelSelectSourcePath, {
      height: 20,
      paletteColors: menuTitlePaletteColors,
    }));
    await writeFile(menuTitleSinglePlayerOutputPath, await buildPakQpicPng(uiAssets, "gfx/ttl_sgl.lmp"));
    await writeFile(menuTitleOptionsOutputPath, await buildPakQpicPng(uiAssets, "gfx/p_option.lmp"));
    await writeFile(menuTitleHelpOutputPath, await readFile(menuTitleHelpSourcePath));
    await writeFile(concharsOutputPath, await buildQuakeConcharsPng(uiAssets));
    const programMetadata = buildQuakeProgramMetadata(uiAssets, sourceProgramFacts);
    const weaponModelOutputPaths = await runPrepareStep(
      "weapon models",
      () => writeQuakeWeaponModelFiles(uiAssets, sourceProgramFacts),
    );
    await writeFile(progsOutputPath, JSON.stringify(programMetadata));
    const modelPrepareConcurrency = normalizedQuakePrepareModelConcurrency();
    let referencedModelPaths = quakePrepareReferencedModelsOnly
      ? quakeReferencedModelPathsForPreparedMaps(
          preparedMaps,
          programMetadata,
          quakePickupModelCandidatePaths(uiAssets, programMetadata),
        )
      : null;
    if (quakePrepareReferencedModelsOnly && referencedModelPaths.size === 0) {
      console.warn("Referenced model filter found no prepared map model paths; building all model geometry.");
      referencedModelPaths = null;
    }
    const pickupModels = await runPrepareStep("model geometry", () => buildQuakePickupModels(
      uiAssets,
      async (mapPath) => createQuakeSceneFromPreparedScene(await createQuakePreparedSceneFromPakBuffer(buffer, {
        encodeTextureUrl: encodeTextureFileUrl,
        gameLogicProgramFacts: sourceProgramFacts,
        mapPath,
      })),
      programMetadata,
      {
        concurrency: modelPrepareConcurrency,
        referencedModelPaths,
      },
    ));
    await writeFile(pickupOutputPath, JSON.stringify(pickupModels));
    const soundManifest = await runPrepareStep("sounds", () => exportQuakeSounds(pak, parseQuakePakDirectory));
    await writeFile(soundManifestOutputPath, JSON.stringify(soundManifest));
    const effectSprites = await runPrepareStep("effect sprites", () => prepareQuakeEffectSprites({
      outputDir: effectSpritesOutputDir,
      pak,
      parsePakDirectory: parseQuakePakDirectory,
      publicUrlForOutputPath: generatedPublicUrl,
    }));
    await writeFile(effectSpritesOutputPath, JSON.stringify(effectSprites));
    await writeFileAtomic(manifestOutputPath, JSON.stringify(buildQuakeAssetManifest(
      preparedMaps,
      programMetadata,
      pickupModels,
      soundManifest,
      sourceProgramFacts,
      effectSprites,
    )));
    await pruneUnreferencedTextureFiles([
      ...quakePreparedMapOutputPaths(preparedMaps),
      ...weaponModelOutputPaths,
      pickupOutputPath,
    ]);
    for (const { modeOutputPaths, modeSizes, prepared } of preparedMaps) {
      for (const mode of QUAKE_PREPARED_SCENE_MODES) {
        const outputPath = modeOutputPaths?.[mode];
        const size = modeSizes?.[mode];
        if (!outputPath || !size) continue;
        console.log(`Wrote ${path.relative(projectRoot, outputPath)} (${formatBytes(size)})`);
      }
      console.log(`${prepared.label}: ${prepared.faceCount}/${prepared.sourceFaceCount} faces, ${prepared.textureCount} textures`);
    }
    console.log(`Wrote ${path.relative(projectRoot, hudBaseOutputPath)}`);
    console.log(`Wrote ${path.relative(projectRoot, hudInventoryOutputPath)}`);
    console.log(`Wrote ${path.relative(projectRoot, hudIconsOutputPath)}`);
    console.log(`Wrote ${path.relative(projectRoot, hudNumbersOutputPath)}`);
    console.log(`Wrote ${path.relative(projectRoot, hudDamageNumbersOutputPath)}`);
    console.log(`Wrote ${path.relative(projectRoot, hudOutputPath)}`);
    for (const [, outputPath] of socialImageStaticPublicAssets) {
      console.log(`Wrote ${path.relative(projectRoot, outputPath)}`);
    }
    console.log(`Wrote ${path.relative(projectRoot, mainMenuOutputPath)}`);
    console.log(`Wrote ${path.relative(projectRoot, mainMenuPlaqueOutputPath)}`);
    console.log(`Wrote ${path.relative(projectRoot, mainMenuTitleOutputPath)}`);
    console.log(`Wrote ${path.relative(projectRoot, mainMenuMultiplayerOutputPath)}`);
    console.log(`Wrote ${path.relative(projectRoot, intermissionCompleteOutputPath)}`);
    console.log(`Wrote ${path.relative(projectRoot, intermissionLabelsOutputPath)}`);
    console.log(`Wrote ${path.relative(projectRoot, intermissionNumbersOutputPath)}`);
    for (const outputPath of mainMenuActiveOutputPaths) {
      console.log(`Wrote ${path.relative(projectRoot, outputPath)}`);
    }
    console.log(`Wrote ${path.relative(projectRoot, mainMenuCursorOutputPath)}`);
    console.log(`Wrote ${path.relative(projectRoot, singlePlayerMenuOutputPath)}`);
    console.log(`Wrote ${path.relative(projectRoot, aboutOutputPath)}`);
    console.log(`Wrote ${path.relative(projectRoot, menuPanelTextureOutputPath)}`);
    console.log(`Wrote ${path.relative(projectRoot, menuTitleLevelSelectOutputPath)}`);
    console.log(`Wrote ${path.relative(projectRoot, menuTitleSinglePlayerOutputPath)}`);
    console.log(`Wrote ${path.relative(projectRoot, menuTitleOptionsOutputPath)}`);
    console.log(`Wrote ${path.relative(projectRoot, menuTitleHelpOutputPath)}`);
    console.log(`Wrote ${path.relative(projectRoot, concharsOutputPath)}`);
    for (const outputPath of weaponModelOutputPaths) {
      console.log(`Wrote ${path.relative(projectRoot, outputPath)}`);
    }
    console.log(`Wrote ${path.relative(projectRoot, progsOutputPath)}`);
    console.log(`Wrote ${path.relative(projectRoot, pickupOutputPath)}`);
    console.log(`Wrote ${path.relative(projectRoot, soundManifestOutputPath)} (${Object.keys(soundManifest.sounds).length} sounds)`);
    console.log(`Wrote ${path.relative(projectRoot, effectSpritesOutputPath)} (${Object.keys(effectSprites.sprites).length} sprites)`);
    console.log(`Wrote ${path.relative(projectRoot, manifestOutputPath)}`);
  }
  }
  }
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

async function runConcurrently(items, concurrency, worker) {
  await mapConcurrently(items, concurrency, async (item, index) => {
    await worker(item, index);
    return undefined;
  });
}

async function mapConcurrently(items, concurrency, worker) {
  const output = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex++;
      output[index] = await worker(items[index], index);
    }
  }));
  return output;
}

async function mapConcurrentlyByPriority(items, concurrency, priority, worker) {
  const output = new Array(items.length);
  const workIndexes = items
    .map((item, index) => ({ index, priority: priority(item, index) }))
    .sort((a, b) => (b.priority - a.priority) || (a.index - b.index));
  let nextWorkIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextWorkIndex < workIndexes.length) {
      const { index } = workIndexes[nextWorkIndex];
      nextWorkIndex++;
      output[index] = await worker(items[index], index);
    }
  }));
  return output;
}

async function mapConcurrentlyByOptionalPriority(items, concurrency, priority, worker) {
  return quakePreparePriorityScheduling
    ? mapConcurrentlyByPriority(items, concurrency, priority, worker)
    : mapConcurrently(items, concurrency, worker);
}

async function runPrepareStep(label, callback) {
  if (!quakePrepareTiming && !quakePrepareDetailedTiming) return await callback();
  const startMs = Date.now();
  try {
    const result = await callback();
    console.log(`Timed ${label}: ${formatPrepareDuration(Date.now() - startMs)}`);
    return result;
  } catch (error) {
    console.log(`Timed ${label}: failed after ${formatPrepareDuration(Date.now() - startMs)}`);
    throw error;
  }
}

async function runPrepareDetailStep(label, callback) {
  if (!quakePrepareDetailedTiming) return await callback();
  return runPrepareStep(label, callback);
}

function formatPrepareDuration(ms) {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
}

function formatBytes(value) {
  if (!Number.isFinite(value)) return "0 B";
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / 1024 ** 2).toFixed(1)} MiB`;
}

function normalizedQuakePrepareConcurrency(value = quakePrepareConcurrency) {
  const maxParallelism = maxQuakePrepareParallelism();
  if (Number.isFinite(value)) {
    return Math.max(1, Math.min(maxParallelism, Math.trunc(value)));
  }
  return Math.min(3, maxParallelism);
}

function normalizedQuakePrepareModelConcurrency() {
  const maxParallelism = maxQuakePrepareParallelism();
  if (Number.isFinite(quakePrepareModelConcurrency)) {
    return normalizedQuakePrepareConcurrency(quakePrepareModelConcurrency);
  }
  if (Number.isFinite(quakePrepareConcurrency)) {
    return normalizedQuakePrepareConcurrency(quakePrepareConcurrency);
  }
  if (maxParallelism >= 12) return Math.min(6, maxParallelism);
  if (maxParallelism >= 8) return 4;
  return normalizedQuakePrepareConcurrency();
}

function maxQuakePrepareParallelism() {
  const maxParallelism = Math.max(1, availableParallelism());
  return quakePrepareCi ? Math.min(2, maxParallelism) : maxParallelism;
}

function normalizedEnvFlag(value) {
  const normalized = value?.trim().toLowerCase();
  return Boolean(normalized && normalized !== "0" && normalized !== "false");
}

function mapNameFromPakPath(mapPath) {
  return path.basename(mapPath, path.extname(mapPath)).toLowerCase();
}

async function exportQuakeSounds(pak, parsePakDirectory) {
  const sounds = {};
  const entries = parsePakDirectory(pak)
    .filter(isQuakeSoundEntry)
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const key = quakeSoundManifestKey(entry.name);
    const outputPath = path.join(soundOutputDir, ...key.split("/"));
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, pak.subarray(entry.offset, entry.offset + entry.size));
    sounds[key] = generatedPublicUrl(outputPath);
  }

  return {
    version: 1,
    sounds,
  };
}

function isQuakeSoundEntry(entry) {
  return /^sound\/[^.].*\.wav$/i.test(entry.name) &&
    !entry.name.split("/").some((part) => part === ".." || part === "");
}

function quakeSoundManifestKey(pakPath) {
  return pakPath.replace(/^sound\//i, "").toLowerCase();
}

async function loadQuakeSourceProgramFacts() {
  try {
    const text = await readFile(sourceProgramFactsInputPath, "utf8");
    const facts = JSON.parse(text);
    if (!facts || typeof facts !== "object" || !facts.entities || typeof facts.entities !== "object") {
      throw new Error("Invalid Quake source program facts JSON.");
    }
    return facts;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function buildQuakeAssetManifest(
  preparedMaps,
  programMetadata,
  pickupModels,
  soundManifest,
  sourceProgramFacts = null,
  effectSprites = null,
) {
  const preparedModelPaths = new Set(Object.keys(pickupModels?.models ?? {}));
  const preparedSoundPaths = new Set(Object.keys(soundManifest?.sounds ?? {}));
  const maps = preparedMaps.map(({ mapName, mapPath, outputPath, prepared, modeOutputPaths }) => {
    const hasGameLogicFacts = Boolean(prepared?.gameLogic);
    const gameLogicModelPaths = quakeGameLogicMapModelPaths(prepared, preparedModelPaths);
    const gameLogicSoundPaths = quakeGameLogicMapSoundPaths(prepared, preparedSoundPaths);
    const modelPaths = hasGameLogicFacts
      ? gameLogicModelPaths
      : quakeMapModelPaths(outputPath, preparedMaps, programMetadata)
        .filter((modelPath) => preparedModelPaths.has(modelPath));
    for (const playerModelPath of quakeMultiplayerPlayerModelPathsFromPreparedModels(preparedModelPaths)) {
      if (!modelPaths.includes(playerModelPath)) modelPaths.push(playerModelPath);
    }
    modelPaths.sort();
    const sceneUrls = Object.fromEntries(
      Object.entries(modeOutputPaths ?? { singleplayer: outputPath })
        .map(([mode, modeOutputPath]) => [mode, generatedPublicUrl(modeOutputPath)]),
    );
    return {
      mapName,
      title: quakeMapTitles.get(mapName) ?? mapName.toUpperCase(),
      pakPath: mapPath,
      sceneUrl: sceneUrls.singleplayer ?? generatedPublicUrl(outputPath),
      ...(sceneUrls.deathmatch ? { sceneUrls } : {}),
      selectable: quakeSelectableMapNames.has(mapName),
      modelPaths,
      ...(gameLogicSoundPaths.length ? { soundPaths: gameLogicSoundPaths } : {}),
    };
  });
  const mapNames = new Set(maps.map((map) => map.mapName));
  const assets = {
    weaponModelUrl: generatedPublicUrl(weaponOutputPath),
    weaponModelUrls: quakeWeaponModelUrlMap(sourceProgramFacts),
    pickupModelsUrl: generatedPublicUrl(pickupOutputPath),
    programMetadataUrl: generatedPublicUrl(progsOutputPath),
    soundManifestUrl: generatedPublicUrl(soundManifestOutputPath),
    ...(effectSprites ? { effectSpritesUrl: generatedPublicUrl(effectSpritesOutputPath) } : {}),
  };
  return {
    version: 1,
    assetRoot: quakePublicPath,
    startMap: mapNames.has(quakeStartMap) ? quakeStartMap : maps[0]?.mapName ?? quakeStartMap,
    maps,
    assets,
  };
}

function quakePreparedMapOutputPaths(preparedMaps) {
  return preparedMaps.flatMap((item) =>
    item.modeOutputPaths
      ? Object.values(item.modeOutputPaths)
      : [item.outputPath]
  );
}

function quakeMapOnlyManifestJsonWithSceneVariants(stableManifestJson, preparedMaps) {
  const manifest = JSON.parse(stableManifestJson);
  const mapsByName = new Map(preparedMaps.map((item) => [item.mapName, item]));
  manifest.maps = manifest.maps.map((map) => {
    const item = mapsByName.get(map.mapName);
    if (!item) return map;
    const sceneUrls = Object.fromEntries(
      Object.entries(item.modeOutputPaths ?? { singleplayer: item.outputPath })
        .map(([mode, outputPath]) => [mode, generatedPublicUrl(outputPath)]),
    );
    return {
      ...map,
      sceneUrl: sceneUrls.singleplayer ?? map.sceneUrl,
      ...(sceneUrls.deathmatch
        ? { sceneUrls: { ...quakeManifestMapSceneUrls(map), ...sceneUrls } }
        : {}),
    };
  });
  return JSON.stringify(manifest);
}

function quakeManifestMapSceneUrls(map) {
  return map?.sceneUrls && typeof map.sceneUrls === "object" && !Array.isArray(map.sceneUrls)
    ? map.sceneUrls
    : {};
}

function quakeMultiplayerPlayerModelPathsFromPreparedModels(preparedModelPaths) {
  return QUAKE_MULTIPLAYER_PLAYER_ALIAS_MODEL_PATHS
    .filter((modelPath) => preparedModelPaths.has(modelPath));
}

async function writeQuakeAssetManifestFromGeneratedFiles() {
  const [programMetadata, pickupModels, soundManifest, effectSprites] = await Promise.all([
    readQuakeGeneratedJson(progsOutputPath, "program metadata"),
    readQuakeGeneratedJson(pickupOutputPath, "pickup models"),
    readQuakeGeneratedJson(soundManifestOutputPath, "sound manifest"),
    readOptionalQuakeGeneratedJson(effectSpritesOutputPath, "effect sprites"),
  ]);
  const sourceProgramFacts = await loadQuakeSourceProgramFacts();
  const preparedMaps = [];
  for (const [mapPath, outputPath] of mapOutputPaths) {
    const modeOutputPaths = { singleplayer: outputPath };
    const deathmatchOutputPath = quakePreparedSceneModeOutputPath(outputPath, "deathmatch");
    if (await generatedFileExists(deathmatchOutputPath)) {
      modeOutputPaths.deathmatch = deathmatchOutputPath;
    }
    preparedMaps.push({
      mapName: mapNameFromPakPath(mapPath),
      mapPath,
      outputPath,
      modeOutputPaths,
      prepared: await readQuakeGeneratedJson(outputPath, `${mapNameFromPakPath(mapPath)} map`),
    });
  }
  await writeFileAtomic(manifestOutputPath, JSON.stringify(buildQuakeAssetManifest(
    preparedMaps,
    programMetadata,
    pickupModels,
    soundManifest,
    sourceProgramFacts,
    effectSprites,
  )));
  console.log(`Wrote ${path.relative(projectRoot, manifestOutputPath)} from existing generated assets`);
}

async function readOptionalQuakeGeneratedJson(outputPath, label) {
  try {
    return await readQuakeGeneratedJson(outputPath, label);
  } catch (error) {
    if (error?.message?.startsWith?.(`Missing generated ${label} `)) return null;
    throw error;
  }
}

async function generatedFileExists(outputPath) {
  try {
    await access(outputPath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function readQuakeGeneratedJson(outputPath, label) {
  try {
    return JSON.parse(await readFile(outputPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(
        `Missing generated ${label} at ${path.relative(projectRoot, outputPath)}. ` +
        "Run the relevant prepare step first.",
      );
    }
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid generated ${label} JSON at ${path.relative(projectRoot, outputPath)}: ${error.message}`);
    }
    throw error;
  }
}

async function mergeQuakePickupModelOutput(pickupModels) {
  let existing = { models: {} };
  try {
    existing = JSON.parse(await readFile(pickupOutputPath, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return {
    ...existing,
    models: {
      ...(existing.models ?? {}),
      ...(pickupModels.models ?? {}),
    },
  };
}

function quakeGameLogicMapModelPaths(prepared, preparedModelPaths) {
  if (!prepared?.gameLogic) return [];
  return deriveQuakeGameLogicModelPreloads(prepared.gameLogic, {
    preparedModelPaths,
  }).modelPaths;
}

function quakeGameLogicMapSoundPaths(prepared, preparedSoundPaths) {
  if (!prepared?.gameLogic || preparedSoundPaths.size === 0) return [];
  return deriveQuakeGameLogicSoundPreloads(prepared.gameLogic, {
    preparedSoundPaths,
  }).soundPaths;
}

function quakeReferencedModelPathsForPreparedMaps(preparedMaps, programMetadata, candidateModelPaths) {
  const candidateByPath = new Map(
    [...candidateModelPaths].map((modelPath) => [modelPath.toLowerCase(), modelPath]),
  );
  const preparedModelPaths = new Set(candidateByPath.keys());
  const referencedModelPaths = new Set();
  for (const { outputPath, prepared } of preparedMaps) {
    const mapModelPaths = new Set(quakeMapModelPaths(outputPath, preparedMaps, programMetadata));
    if (prepared?.gameLogic) {
      for (const modelPath of quakeGameLogicMapModelPaths(prepared, preparedModelPaths)) {
        mapModelPaths.add(modelPath);
      }
    }
    for (const modelPath of mapModelPaths) {
      const candidate = candidateByPath.get(modelPath.toLowerCase());
      if (candidate) referencedModelPaths.add(candidate);
    }
  }
  for (const modelPath of quakeMultiplayerPlayerModelPathsFromCandidates(candidateByPath)) {
    referencedModelPaths.add(modelPath);
  }
  for (const modelPath of quakePlayerWeaponProjectileModelPathsFromCandidates(candidateByPath, programMetadata)) {
    referencedModelPaths.add(modelPath);
  }
  return referencedModelPaths;
}

function quakeMultiplayerPlayerModelPathsFromCandidates(candidateByPath) {
  return QUAKE_MULTIPLAYER_PLAYER_ALIAS_MODEL_PATHS
    .map((modelPath) => candidateByPath.get(modelPath.toLowerCase()))
    .filter(Boolean);
}

function quakePlayerWeaponProjectileModelPathsFromCandidates(candidateByPath, programMetadata) {
  return (programMetadata?.sourcePlayerProjectileModelPaths ?? [])
    .map((modelPath) => candidateByPath.get(modelPath.toLowerCase()))
    .filter(Boolean);
}

async function writeQuakeAssetRegenerationManifest({ mode = "full", mapNames = [] } = {}) {
  await mkdir(quakeOutputDir, { recursive: true });
  await writeFileAtomic(manifestOutputPath, JSON.stringify({
    version: 1,
    status: "regenerating",
    mode,
    ...(mapNames.length ? { maps: mapNames } : {}),
    assetRoot: quakePublicPath,
    message: mode === "map-only"
      ? `Quake map assets are regenerating (${mapNames.join(", ")}). Wait for pnpm prepare:quake to finish, then reload.`
      : "Quake assets are regenerating. Wait for pnpm prepare:quake to finish, then reload.",
    startedAt: new Date().toISOString(),
  }));
}

async function writeFileAtomic(outputPath, contents) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const tempPath = path.join(
    path.dirname(outputPath),
    `.${path.basename(outputPath)}.${process.pid}.${Date.now()}.tmp`,
  );
  await writeFile(tempPath, contents);
  await rename(tempPath, outputPath);
}

function quakeMapModelPaths(outputPath, preparedMaps, programMetadata) {
  const prepared = preparedMaps.find((item) => item.outputPath === outputPath)?.prepared;
  const modelPaths = new Set();
  for (const entity of prepared?.entities ?? []) {
    for (const modelPath of quakeEntityModelPaths(entity, programMetadata)) {
      modelPaths.add(modelPath);
    }
  }
  return [...modelPaths].sort();
}

function quakeEntityModelPaths(entity, programMetadata) {
  const paths = [];
  if (isQuakePickupClassname(entity.classname)) {
    const modelPath = quakePickupEntityModelPath(entity, programMetadata);
    const fallbackModelPath = QUAKE_PICKUP_MODEL_PATHS[entity.classname];
    if (modelPath) paths.push(modelPath);
    if (fallbackModelPath && fallbackModelPath !== modelPath) paths.push(fallbackModelPath);
  }
  if (entity.classname === "misc_explobox") paths.push("maps/b_explob.bsp");
  if (entity.classname === "misc_explobox2") paths.push("maps/b_exbox2.bsp");
  if (entity.classname.startsWith("monster_")) {
    const bodyModelPath = quakeMonsterEntityModelPath(entity, programMetadata);
    const projectileModelPath = QUAKE_MONSTER_PROJECTILE_MODEL_PATHS[entity.classname];
    if (bodyModelPath) paths.push(bodyModelPath);
    if (projectileModelPath) paths.push(projectileModelPath);
  }
  return paths.filter(isPreparedModelPath);
}

function isPreparedModelPath(modelPath) {
  return /^(maps|progs)\/.+\.(bsp|mdl)$/i.test(modelPath);
}

function isQuakePickupClassname(classname) {
  return classname.startsWith("item_") ||
    classname.startsWith("weapon_") ||
    classname.startsWith("ammo_") ||
    classname.startsWith("key_");
}

function quakePickupEntityModelPath(entity, programMetadata) {
  const programModels = quakeProgramModelPathsForEntity(entity, programMetadata);
  const spawnflags = quakeEntitySpawnflags(entity);
  const large = Boolean(spawnflags & 1);
  if (entity.classname === "item_health") {
    if (spawnflags & 2) return quakeProgramModelPathMatching(programModels, "maps/b_bh100.bsp") ?? "maps/b_bh100.bsp";
    return spawnflags & 1
      ? quakeProgramModelPathMatching(programModels, "maps/b_bh10.bsp") ?? "maps/b_bh10.bsp"
      : quakeProgramModelPathMatching(programModels, "maps/b_bh25.bsp") ?? "maps/b_bh25.bsp";
  }
  if (entity.classname === "item_shells" || entity.classname === "ammo_shells") {
    return large
      ? quakeProgramModelPathMatching(programModels, "maps/b_shell1.bsp") ?? "maps/b_shell1.bsp"
      : quakeProgramModelPathMatching(programModels, "maps/b_shell0.bsp") ?? "maps/b_shell0.bsp";
  }
  if (entity.classname === "item_spikes" || entity.classname === "ammo_nails") {
    return large
      ? quakeProgramModelPathMatching(programModels, "maps/b_nail1.bsp") ?? "maps/b_nail1.bsp"
      : quakeProgramModelPathMatching(programModels, "maps/b_nail0.bsp") ?? "maps/b_nail0.bsp";
  }
  if (entity.classname === "item_rockets" || entity.classname === "ammo_rockets") {
    return large
      ? quakeProgramModelPathMatching(programModels, "maps/b_rock1.bsp") ?? "maps/b_rock1.bsp"
      : quakeProgramModelPathMatching(programModels, "maps/b_rock0.bsp") ?? "maps/b_rock0.bsp";
  }
  if (entity.classname === "item_cells" || entity.classname === "ammo_cells") {
    return large
      ? quakeProgramModelPathMatching(programModels, "maps/b_batt1.bsp") ?? "maps/b_batt1.bsp"
      : quakeProgramModelPathMatching(programModels, "maps/b_batt0.bsp") ?? "maps/b_batt0.bsp";
  }
  return quakePreferredProgramPickupModelPath(programModels) ?? QUAKE_PICKUP_MODEL_PATHS[entity.classname];
}

function quakeMonsterEntityModelPath(entity, programMetadata) {
  const programModels = programMetadata?.modelsByClassname?.[entity.classname] ?? [];
  const expected = QUAKE_MONSTER_MODEL_PATHS[entity.classname];
  if (expected && (programModels.length === 0 || programModels.includes(expected))) return expected;
  return programModels.find(isQuakeMonsterBodyModel) ??
    programModels.find((model) => model.startsWith("progs/") && model.endsWith(".mdl")) ??
    expected ??
    null;
}

function quakeProgramModelPathsForEntity(entity, programMetadata) {
  if (!programMetadata) return [];
  return programMetadata.modelsByClassname?.[entity.classname] ??
    programMetadata.modelsByClassname?.[quakeProgramClassnameAlias(entity.classname)] ??
    [];
}

function quakeProgramClassnameAlias(classname) {
  if (classname === "ammo_shells") return "item_shells";
  if (classname === "ammo_nails") return "item_spikes";
  if (classname === "ammo_rockets") return "item_rockets";
  if (classname === "ammo_cells") return "item_cells";
  if (classname === "key_silver") return "item_key1";
  if (classname === "key_gold") return "item_key2";
  return classname;
}

function quakeProgramModelPathMatching(models, expected) {
  const normalized = expected.toLowerCase();
  return models.find((model) => model.toLowerCase() === normalized);
}

function quakePreferredProgramPickupModelPath(models) {
  return models.find((model) => model.startsWith("progs/") && model.endsWith(".mdl")) ??
    models.find((model) => model.startsWith("maps/") && model.endsWith(".bsp"));
}

function quakeEntitySpawnflags(entity) {
  const value = Number(entity.properties?.spawnflags ?? 0);
  return Number.isFinite(value) ? Math.trunc(value) : 0;
}

function generatedPublicUrl(outputPath) {
  return `/${path.relative(generatedPublicDir, outputPath).split(path.sep).join("/")}`;
}

async function copyStaticPublicAssets() {
  await Promise.all(staticPublicAssets.map(async ([sourcePath, outputPath]) => {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await copyFile(sourcePath, outputPath);
  }));
}

async function removeLegacyQuakeJsonFiles() {
  await Promise.all([
    ...quakeMapNames.map((mapName) => rm(path.join(quakeOutputDir, `${mapName}.preparsed.json`), { force: true })),
    rm(path.join(quakeOutputDir, "weapon-shotgun.preparsed.json"), { force: true }),
    rm(path.join(quakeOutputDir, "pickups.preparsed.json"), { force: true }),
    rm(path.join(quakeOutputDir, "progs.preparsed.json"), { force: true }),
  ]);
}

async function removeGeneratedQuakeAssetVersionDirs() {
  let entries;
  try {
    entries = await readdir(quakeOutputDir, { withFileTypes: true });
  } catch {
    entries = [];
  }
  const staleVersionDirs = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || isStableQuakeOutputDir(entry.name)) continue;
    const entryPath = path.join(quakeOutputDir, entry.name);
    if (await isGeneratedQuakeAssetVersionDir(entryPath)) staleVersionDirs.push(entryPath);
  }
  await Promise.all(staleVersionDirs.map((entryPath) => rm(entryPath, { recursive: true, force: true })));
}

function isStableQuakeOutputDir(name) {
  return name === "s" || name === "t" || name === "p" || name === "e";
}

async function isGeneratedQuakeAssetVersionDir(entryPath) {
  let entries;
  try {
    entries = await readdir(entryPath, { withFileTypes: true });
  } catch {
    return false;
  }
  return entries.some((entry) => entry.isDirectory() && (entry.name === "t" || entry.name === "e"));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function pruneUnreferencedTextureFiles(jsonPaths, options = {}) {
  const removeUnreferenced = options.removeUnreferenced !== false;
  const referenced = new Set();
  const textureUrlPattern = new RegExp(`${escapeRegExp(quakeTexturePublicPath)}/([^"'\\\\)\\s]+)`, "g");
  for (const jsonPath of jsonPaths) {
    const text = await readFile(jsonPath, "utf8");
    for (const match of text.matchAll(textureUrlPattern)) {
      if (match[1]) referenced.add(match[1]);
    }
  }

  let written = 0;
  await mkdir(textureOutputDir, { recursive: true });
  for (const file of referenced) {
    const urlPath = `${quakeTexturePublicPath}/${file}`;
    const png = texturePngByPublicPath.get(urlPath);
    if (!png) continue;
    await writeTextureFileIfMissing(path.join(textureOutputDir, file), png);
    written++;
  }

  let removed = 0;
  if (removeUnreferenced) {
    let files;
    try {
      files = await readdir(textureOutputDir);
    } catch {
      files = [];
    }
    for (const file of files) {
      if (referenced.has(file)) continue;
      await rm(path.join(textureOutputDir, file), { force: true });
      removed++;
    }
  }
  if (written > 0) {
    console.log(`Wrote ${written} referenced generated texture files`);
  }
  if (removed > 0) {
    console.log(`Removed ${removed} unreferenced generated texture files`);
  }
}

async function verifyQuakeResource() {
  const resource = await readFile(resourcePath);
  const actualSize = resource.byteLength;
  const actualHash = createHash("sha256").update(resource).digest("hex");
  if (actualSize !== EXPECTED_RESOURCE_SIZE) {
    throw new Error(`Unexpected resource.1 size: expected ${EXPECTED_RESOURCE_SIZE}, got ${actualSize}.`);
  }
  if (actualHash !== EXPECTED_RESOURCE_SHA256) {
    throw new Error(`Unexpected resource.1 SHA-256: expected ${EXPECTED_RESOURCE_SHA256}, got ${actualHash}.`);
  }
  console.log(`Verified Quake 1.06 shareware resource.1 (${actualHash})`);
}

async function extractQuakePak() {
  if (path7z !== "7z") await chmod(path7z, 0o755).catch(() => undefined);
  await run(path7z, [
    "x",
    "-y",
    `-o${tempDir}`,
    resourcePath,
    "ID1/PAK0.PAK",
  ]);
}

async function copyQuakePakFromPath(source) {
  const sourcePath = source.startsWith("file:") ? fileURLToPath(source) : path.resolve(projectRoot, source);
  const pak = await readFile(sourcePath);
  if (readFixedString(pak, 0, 4) !== "PACK") {
    throw new Error(`QUAKE_PAK_PATH does not point to a Quake PAK file: ${source}`);
  }
  await mkdir(path.dirname(extractedPakPath), { recursive: true });
  await writeFile(extractedPakPath, pak);
  console.log(`Using Quake PAK from ${sourcePath}`);
}

async function downloadQuakeResource() {
  const source = process.env.QUAKE_SHAREWARE_URL?.trim();
  if (!source) {
    throw new Error(
      "QUAKE_SHAREWARE_URL is required. Set it to a Quake 1.06 shareware zip URL before running prepare:quake.",
    );
  }

  await downloadSharewareSource(source, sharewareDownloadPath);
  if (await copyIfExpectedQuakeResource(sharewareDownloadPath)) {
    console.log(`Downloaded Quake shareware resource from ${source}`);
    return;
  }

  await mkdir(sharewareExtractDir, { recursive: true });
  if (path7z !== "7z") await chmod(path7z, 0o755).catch(() => undefined);
  await run(path7z, [
    "x",
    "-y",
    `-o${sharewareExtractDir}`,
    sharewareDownloadPath,
  ]);

  const extractedResourcePath = await findFileCaseInsensitive(sharewareExtractDir, "resource.1");
  if (!extractedResourcePath) {
    throw new Error(`Downloaded Quake shareware archive from ${source} did not contain resource.1.`);
  }
  await writeFile(resourcePath, await readFile(extractedResourcePath));
  console.log(`Downloaded Quake shareware archive from ${source}`);
}

async function downloadSharewareSource(source, outputPath) {
  if (source.startsWith("file:")) {
    await writeFile(outputPath, await readFile(fileURLToPath(source)));
    return;
  }
  if (!/^https?:\/\//i.test(source)) {
    await writeFile(outputPath, await readFile(path.resolve(projectRoot, source)));
    return;
  }

  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`Could not download ${source}: HTTP ${response.status} ${response.statusText}`);
  }
  await writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
}

async function copyIfExpectedQuakeResource(inputPath) {
  const resource = await readFile(inputPath);
  if (resource.byteLength !== EXPECTED_RESOURCE_SIZE) return false;
  const hash = createHash("sha256").update(resource).digest("hex");
  if (hash !== EXPECTED_RESOURCE_SHA256) return false;
  await writeFile(resourcePath, resource);
  return true;
}

async function findFileCaseInsensitive(dir, filename) {
  const wanted = filename.toLowerCase();
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = await findFileCaseInsensitive(entryPath, filename);
      if (found) return found;
    } else if (entry.isFile() && entry.name.toLowerCase() === wanted) {
      return entryPath;
    }
  }
  return undefined;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with code ${code}.`));
      }
    });
  });
}

async function buildQuakeHudNumbersPng(assets, options = {}) {
  const width = 24 * 10;
  const height = 24;
  const rgba = Buffer.alloc(width * height * 4);
  for (let digit = 0; digit <= 9; digit++) {
    drawWadQpicTo(rgba, assets, `num_${digit}`, digit * 24, 0, width, height, QUAKE_HUD_TRANSPARENT);
  }
  if (options.damageTint) tintQuakeHudDamageNumbers(rgba);
  return sharp(rgba, {
    raw: { width, height, channels: 4 },
  }).png().toBuffer();
}

async function buildQuakeIntermissionNumbersPng(assets) {
  const qpics = [
    "num_0",
    "num_1",
    "num_2",
    "num_3",
    "num_4",
    "num_5",
    "num_6",
    "num_7",
    "num_8",
    "num_9",
    "num_colon",
    "num_slash",
    "num_minus",
  ];
  const width = 24 * qpics.length;
  const height = 24;
  const rgba = Buffer.alloc(width * height * 4);
  for (let index = 0; index < qpics.length; index++) {
    drawWadQpicTo(rgba, assets, qpics[index], index * 24, 0, width, height, QUAKE_HUD_TRANSPARENT);
  }
  return sharp(rgba, {
    raw: { width, height, channels: 4 },
  }).png().toBuffer();
}

function tintQuakeHudDamageNumbers(rgba) {
  for (let index = 0; index < rgba.length; index += 4) {
    if (rgba[index + 3] === 0) continue;
    const light = Math.max(rgba[index], rgba[index + 1], rgba[index + 2]);
    rgba[index] = Math.min(255, Math.round(light * 1.15));
    rgba[index + 1] = Math.round(light * 0.16);
    rgba[index + 2] = Math.round(light * 0.08);
  }
}

async function buildQuakeHudBasePng(assets) {
  const rgba = Buffer.alloc(QUAKE_HUD_WIDTH * QUAKE_HUD_HEIGHT * 4);
  drawQpic(rgba, assets, "sbar", 0, 0);
  return sharp(rgba, {
    raw: { width: QUAKE_HUD_WIDTH, height: QUAKE_HUD_HEIGHT, channels: 4 },
  }).png().toBuffer();
}

async function buildQuakeHudInventoryPng(assets) {
  const rgba = Buffer.alloc(QUAKE_HUD_WIDTH * QUAKE_HUD_HEIGHT * 4);
  drawQpic(rgba, assets, "ibar", 0, 0);
  return sharp(rgba, {
    raw: { width: QUAKE_HUD_WIDTH, height: QUAKE_HUD_HEIGHT, channels: 4 },
  }).png().toBuffer();
}

async function buildQuakeHudIconsPng(assets) {
  const width = QUAKE_HUD_ICON_QPICS.length * QUAKE_HUD_ICON_SLOT_SIZE;
  const rgba = Buffer.alloc(width * QUAKE_HUD_HEIGHT * 4);
  for (let index = 0; index < QUAKE_HUD_ICON_QPICS.length; index++) {
    drawWadQpicTo(
      rgba,
      assets,
      QUAKE_HUD_ICON_QPICS[index],
      index * QUAKE_HUD_ICON_SLOT_SIZE,
      0,
      width,
      QUAKE_HUD_HEIGHT,
      QUAKE_HUD_TRANSPARENT,
    );
  }
  return sharp(rgba, {
    raw: { width, height: QUAKE_HUD_HEIGHT, channels: 4 },
  }).png().toBuffer();
}

async function buildQuakeHudPng(assets) {
  const rgba = Buffer.alloc(QUAKE_HUD_WIDTH * QUAKE_HUD_HEIGHT * 4);

  drawQpic(rgba, assets, "sbar", 0, 0);
  drawNumber(rgba, assets, 24, 0, 0, 3);
  drawQpic(rgba, assets, "face1", 112, 0, QUAKE_HUD_TRANSPARENT);
  drawNumber(rgba, assets, 136, 0, 100, 3);
  drawQpic(rgba, assets, "sb_shells", 224, 0, QUAKE_HUD_TRANSPARENT);
  drawNumber(rgba, assets, 248, 0, 25, 3);

  return sharp(rgba, {
    raw: { width: QUAKE_HUD_WIDTH, height: QUAKE_HUD_HEIGHT, channels: 4 },
  }).png().toBuffer();
}

async function buildQuakeMainMenuPng(assets) {
  const rgba = Buffer.alloc(QUAKE_MENU_WIDTH * QUAKE_MENU_HEIGHT * 4);

  drawPakQpicCrop(rgba, assets, "gfx/mainmenu.lmp", 0, 0, 240, QUAKE_MAIN_MENU_ROW_HEIGHT, QUAKE_MAIN_MENU_ITEM_X, QUAKE_MAIN_MENU_ROW_TOPS[0], QUAKE_MENU_WIDTH, QUAKE_MENU_HEIGHT, QUAKE_HUD_TRANSPARENT);
  drawMainMenuLevelSelectLabel(rgba, assets, QUAKE_MAIN_MENU_ITEM_X, QUAKE_MAIN_MENU_ROW_TOPS[1], QUAKE_MENU_WIDTH, QUAKE_MENU_HEIGHT);
  drawPakQpicCrop(rgba, assets, "gfx/mainmenu.lmp", 0, 40, 124, QUAKE_MAIN_MENU_ROW_HEIGHT, QUAKE_MAIN_MENU_ITEM_X, QUAKE_MAIN_MENU_ROW_TOPS[2], QUAKE_MENU_WIDTH, QUAKE_MENU_HEIGHT, QUAKE_HUD_TRANSPARENT);
  drawPakQpicCrop(rgba, assets, "gfx/mainmenu.lmp", 1, 60, 75, QUAKE_MAIN_MENU_ROW_HEIGHT, QUAKE_MAIN_MENU_ITEM_X, QUAKE_MAIN_MENU_ROW_TOPS[3], QUAKE_MENU_WIDTH, QUAKE_MENU_HEIGHT, QUAKE_HUD_TRANSPARENT);
  drawPakQpicCrop(rgba, assets, "gfx/mainmenu.lmp", 0, 84, 70, QUAKE_MAIN_MENU_ROW_HEIGHT, QUAKE_MAIN_MENU_ITEM_X, QUAKE_MAIN_MENU_ROW_TOPS[4], QUAKE_MENU_WIDTH, QUAKE_MENU_HEIGHT, QUAKE_HUD_TRANSPARENT);

  return sharp(rgba, {
    raw: { width: QUAKE_MENU_WIDTH, height: QUAKE_MENU_HEIGHT, channels: 4 },
  }).png().toBuffer();
}

async function buildQuakeMainMenuCursorPng(assets) {
  const width = QUAKE_MENU_CURSOR_WIDTH * QUAKE_MENU_FRAME_COUNT;
  const rgba = Buffer.alloc(width * QUAKE_MENU_CURSOR_HEIGHT * 4);

  for (let frame = 0; frame < QUAKE_MENU_FRAME_COUNT; frame++) {
    drawPakQpic(
      rgba,
      assets,
      `gfx/menudot${frame + 1}.lmp`,
      frame * QUAKE_MENU_CURSOR_WIDTH,
      0,
      width,
      QUAKE_MENU_CURSOR_HEIGHT,
      QUAKE_HUD_TRANSPARENT,
    );
  }

  return sharp(rgba, {
    raw: { width, height: QUAKE_MENU_CURSOR_HEIGHT, channels: 4 },
  }).png().toBuffer();
}

async function buildQuakeMainMenuMultiplayerPng(assets) {
  const width = QUAKE_MAIN_MENU_ACTIVE_ROW_WIDTH;
  const height = QUAKE_MAIN_MENU_ROW_HEIGHT;
  const rgba = Buffer.alloc(width * height * 4);
  drawPakQpicCrop(rgba, assets, "gfx/mainmenu.lmp", 0, 20, 240, height, 0, 0, width, height, QUAKE_HUD_TRANSPARENT);
  const trimmed = trimTransparentRgba(rgba, width, height);
  return sharp(trimmed.rgba, {
    raw: { width: trimmed.width, height: trimmed.height, channels: 4 },
  }).png().toBuffer();
}

async function buildQuakeMainMenuActivePngs(assets) {
  const width = QUAKE_MAIN_MENU_ACTIVE_ROW_WIDTH;
  const height = QUAKE_MAIN_MENU_ROW_HEIGHT;
  const frames = [
    (rgba) => drawPakQpicCrop(rgba, assets, "gfx/mainmenu.lmp", 0, 0, 240, height, 0, 0, width, height, QUAKE_HUD_TRANSPARENT),
    (rgba) => drawMainMenuLevelSelectLabel(rgba, assets, 0, 0, width, height),
    (rgba) => drawPakQpicCrop(rgba, assets, "gfx/mainmenu.lmp", 0, 40, 124, height, 0, 0, width, height, QUAKE_HUD_TRANSPARENT),
    (rgba) => drawPakQpicCrop(rgba, assets, "gfx/mainmenu.lmp", 1, 60, 75, height, 0, 0, width, height, QUAKE_HUD_TRANSPARENT),
  ];

  return Promise.all(frames.map(async (drawFrame) => {
    const rgba = Buffer.alloc(width * height * 4);
    drawFrame(rgba);
    const trimmed = trimTransparentRgba(rgba, width, height);
    return sharp(trimmed.rgba, {
      raw: { width: trimmed.width, height: trimmed.height, channels: 4 },
    }).png().toBuffer();
  }));
}

function drawMainMenuLevelSelectLabel(rgba, assets, x, rowTop, targetWidth, targetHeight) {
  const scale = QUAKE_MAIN_MENU_LEVEL_LABEL_SCALE;
  const y = rowTop + Math.round((QUAKE_MAIN_MENU_ROW_HEIGHT - 8 * scale) / 2);
  drawConcharsTextScaled(
    rgba,
    assets,
    QUAKE_MAIN_MENU_LEVEL_LABEL,
    x,
    y,
    true,
    scale,
    targetWidth,
    targetHeight,
  );
}

function trimTransparentRgba(rgba, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = rgba[(y * width + x) * 4 + 3];
      if (alpha === 0) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < 0 || maxY < 0) {
    return { rgba: Buffer.alloc(4), width: 1, height: 1 };
  }

  const trimmedWidth = maxX - minX + 1;
  const trimmedHeight = maxY - minY + 1;
  const trimmedRgba = Buffer.alloc(trimmedWidth * trimmedHeight * 4);
  for (let y = 0; y < trimmedHeight; y++) {
    const sourceStart = ((minY + y) * width + minX) * 4;
    const sourceEnd = sourceStart + trimmedWidth * 4;
    rgba.copy(trimmedRgba, y * trimmedWidth * 4, sourceStart, sourceEnd);
  }

  return { rgba: trimmedRgba, width: trimmedWidth, height: trimmedHeight };
}

async function buildPakQpicCropPng(assets, pakPath, sourceX, sourceY, width, height) {
  const rgba = Buffer.alloc(width * height * 4);
  drawPakQpicCrop(rgba, assets, pakPath, sourceX, sourceY, width, height, 0, 0, width, height, QUAKE_HUD_TRANSPARENT);
  return sharp(rgba, {
    raw: { width, height, channels: 4 },
  }).png().toBuffer();
}

async function buildPakQpicPng(assets, pakPath) {
  const entry = assets.entries.get(pakPath);
  if (!entry) throw new Error(`Missing Quake qpic ${pakPath}.`);
  const width = assets.pak.readInt32LE(entry.offset);
  const height = assets.pak.readInt32LE(entry.offset + 4);
  const rgba = Buffer.alloc(width * height * 4);
  drawPakQpic(rgba, assets, pakPath, 0, 0, width, height, QUAKE_HUD_TRANSPARENT);
  return sharp(rgba, {
    raw: { width, height, channels: 4 },
  }).png().toBuffer();
}

async function buildCustomMenuTitlePng(sourcePath, options = {}) {
  const height = options.height ?? 20;
  const resized = await sharp(sourcePath)
    .resize({ height, kernel: sharp.kernel.nearest })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rgba = options.paletteColors
    ? snapRgbaToPalette(resized.data, options.paletteColors)
    : resized.data;
  softenCustomMenuTitleTopBand(rgba, resized.info.width, resized.info.height);
  repairCustomMenuTitleFirstSTop(rgba, resized.info.width, resized.info.height);
  repairCustomMenuTitleLArtifacts(rgba, resized.info.width, resized.info.height);

  return sharp(rgba, {
    raw: { width: resized.info.width, height: resized.info.height, channels: 4 },
  })
    .png()
    .toBuffer();
}

function buildQuakeMenuTitlePaletteColors(assets) {
  const width = QUAKE_MAIN_MENU_ACTIVE_ROW_WIDTH;
  const height = QUAKE_MAIN_MENU_ROW_HEIGHT;
  const rgba = Buffer.alloc(width * height * 4);
  const colors = new Map();
  const addColor = (r, g, b) => colors.set(`${r},${g},${b}`, [r, g, b]);
  const collectColors = () => {
    for (let offset = 0; offset < rgba.length; offset += 4) {
      if (rgba[offset + 3] !== 255) continue;
      addColor(rgba[offset], rgba[offset + 1], rgba[offset + 2]);
    }
    rgba.fill(0);
  };

  drawPakQpicCrop(rgba, assets, "gfx/mainmenu.lmp", 0, 0, 240, height, 0, 0, width, height, QUAKE_HUD_TRANSPARENT);
  collectColors();
  drawPakQpicCrop(rgba, assets, "gfx/mainmenu.lmp", 0, 40, 124, height, 0, 0, width, height, QUAKE_HUD_TRANSPARENT);
  collectColors();
  drawPakQpicCrop(rgba, assets, "gfx/mainmenu.lmp", 1, 60, 75, height, 0, 0, width, height, QUAKE_HUD_TRANSPARENT);
  collectColors();

  return [...colors.values()];
}

function snapRgbaToPalette(rgba, paletteColors) {
  const snapped = Buffer.alloc(rgba.length);
  for (let offset = 0; offset < rgba.length; offset += 4) {
    if (rgba[offset + 3] <= 32) continue;
    const [r, g, b] = nearestRgbColor(
      rgba[offset],
      rgba[offset + 1],
      rgba[offset + 2],
      paletteColors,
    );
    snapped[offset] = r;
    snapped[offset + 1] = g;
    snapped[offset + 2] = b;
    snapped[offset + 3] = 255;
  }
  return snapped;
}

function softenCustomMenuTitleTopBand(rgba, width, height) {
  if (height < 7) return;
  const row = 5;
  const sourceRow = 6;
  for (let x = 0; x < width; x++) {
    const offset = (row * width + x) * 4;
    if (rgba[offset + 3] === 0) continue;
    const brightness = rgba[offset] + rgba[offset + 1] + rgba[offset + 2];
    if (brightness <= 230) continue;

    const sourceOffset = (sourceRow * width + x) * 4;
    if (rgba[sourceOffset + 3] === 0) continue;
    rgba[offset] = rgba[sourceOffset];
    rgba[offset + 1] = rgba[sourceOffset + 1];
    rgba[offset + 2] = rgba[sourceOffset + 2];
  }
}

function repairCustomMenuTitleFirstSTop(rgba, width, height) {
  if (width < 18 || height < 2) return;
  const row = 1;
  const pixels = [
    [59, 31, 15, 255],
    [39, 31, 23, 255],
    [175, 99, 47, 255],
    [175, 99, 47, 255],
    [175, 99, 47, 255],
    [175, 99, 47, 255],
    [159, 79, 51, 255],
    [35, 19, 7, 255],
    [0, 0, 0, 0],
    [35, 19, 7, 255],
    [159, 79, 51, 255],
    [159, 79, 51, 255],
    [159, 79, 51, 255],
    [175, 99, 47, 255],
    [159, 79, 51, 255],
    [35, 19, 7, 255],
  ];
  for (let index = 0; index < pixels.length; index++) {
    const offset = (row * width + index + 2) * 4;
    const pixel = pixels[index];
    rgba[offset] = pixel[0];
    rgba[offset + 1] = pixel[1];
    rgba[offset + 2] = pixel[2];
    rgba[offset + 3] = pixel[3];
  }
}

function repairCustomMenuTitleLArtifacts(rgba, width, height) {
  const pixels = [
    [124, 2, 159, 79, 51],
    [40, 9, 87, 43, 23],
    [40, 10, 87, 43, 23],
    [40, 11, 87, 43, 23],
    [43, 8, 75, 35, 19],
    [43, 9, 75, 35, 19],
    [43, 11, 75, 35, 19],
    [43, 12, 75, 35, 19],
    [43, 13, 75, 35, 19],
    [196, 11, 87, 43, 23],
    [197, 9, 87, 43, 23],
    [197, 10, 87, 43, 23],
    [197, 11, 87, 43, 23],
    [198, 9, 87, 43, 23],
    [198, 10, 87, 43, 23],
    [198, 11, 87, 43, 23],
  ];

  for (const [x, y, r, g, b] of pixels) {
    if (x >= width || y >= height) continue;
    const offset = (y * width + x) * 4;
    rgba[offset] = r;
    rgba[offset + 1] = g;
    rgba[offset + 2] = b;
    rgba[offset + 3] = 255;
  }
}

function nearestRgbColor(r, g, b, paletteColors) {
  let nearest = paletteColors[0] ?? [r, g, b];
  let nearestDistance = Infinity;
  for (const color of paletteColors) {
    const distance =
      (r - color[0]) ** 2 +
      (g - color[1]) ** 2 +
      (b - color[2]) ** 2;
    if (distance >= nearestDistance) continue;
    nearest = color;
    nearestDistance = distance;
  }
  return nearest;
}

async function buildQuakeAboutPng(assets) {
  const rgba = Buffer.alloc(QUAKE_ABOUT_WIDTH * QUAKE_ABOUT_HEIGHT * 4);

  drawPakBox(rgba, assets, 24, 22, 272, 156);
  fillIndexedRect(rgba, QUAKE_ABOUT_WIDTH, QUAKE_ABOUT_HEIGHT, assets.palette, 36, 34, 248, 132, 0, 132);

  drawConcharsCentered(rgba, assets, "CSSQUAKE V0.0.1", 38, true);
  drawConcharsCentered(rgba, assets, "GLYPHCSS ASCII QUAKE", 58, true);
  drawConcharsCentered(rgba, assets, "E1M1 BSP SURFACES RENDERED", 78, false);
  drawConcharsCentered(rgba, assets, "AS REAL DOM NODES.", 90, false);
  drawConcharsCentered(rgba, assets, "TEXTURES ARE PACKED INTO CSS", 112, false);
  drawConcharsCentered(rgba, assets, "ATLAS SLICES AND COMPOSITED", 124, false);
  drawConcharsCentered(rgba, assets, "BY THE BROWSER.", 136, false);
  drawConcharsCentered(rgba, assets, "NO WEBGL. NO CANVAS LOOP.", 150, false);
  drawConcharsCentered(rgba, assets, "BACK", 164, true);

  return sharp(rgba, {
    raw: { width: QUAKE_ABOUT_WIDTH, height: QUAKE_ABOUT_HEIGHT, channels: 4 },
  }).png().toBuffer();
}

async function buildQuakeMenuPanelTexturePng(preparedMaps) {
  for (const textureName of QUAKE_MENU_PANEL_TEXTURE_NAMES) {
    const textureBuffer = await findPreparedTextureBuffer(preparedMaps, textureName);
    if (!textureBuffer) continue;
    return sharp(textureBuffer)
      .modulate({ brightness: 1.12, saturation: 0.92 })
      .png({ palette: true })
      .toBuffer();
  }
  throw new Error("Could not find a Quake texture for menu-panel-texture.png.");
}

async function buildQuakeConcharsPng(assets) {
  const width = 128;
  const height = 128;
  const lump = assets.lumps.get("conchars");
  if (!lump || lump.type !== 68) throw new Error("Missing Quake CONCHARS.");

  const rgba = Buffer.alloc(width * height * 4);
  for (let offset = 0; offset < width * height; offset++) {
    const colorIndex = assets.wad.readUInt8(lump.filepos + offset);
    if (colorIndex === 0) continue;
    const paletteOffset = colorIndex * 3;
    const imageOffset = offset * 4;
    rgba[imageOffset] = assets.palette[paletteOffset] ?? 0;
    rgba[imageOffset + 1] = assets.palette[paletteOffset + 1] ?? 0;
    rgba[imageOffset + 2] = assets.palette[paletteOffset + 2] ?? 0;
    rgba[imageOffset + 3] = 255;
  }

  return sharp(rgba, {
    raw: { width, height, channels: 4 },
  }).png().toBuffer();
}

async function findPreparedTextureBuffer(preparedMaps, textureName) {
  const target = textureName.toLowerCase();
  const maps = [
    ...preparedMaps.filter((item) => item.prepared?.label === "maps/e1m2.bsp"),
    ...preparedMaps,
  ];
  for (const { prepared } of maps) {
    for (const polygon of prepared.polygons ?? []) {
      if (String(polygon.data?.["tex"] ?? "").toLowerCase() !== target) continue;
      const texture = typeof polygon.texture === "number"
        ? prepared.textures?.[polygon.texture]
        : polygon.texture;
      if (typeof texture === "string") return readPreparedTextureBuffer(texture);
    }
  }
  return undefined;
}

async function readPreparedTextureBuffer(texture) {
  if (!texture.startsWith(`${quakePublicPath}/`)) return undefined;
  return readGeneratedPublicTextureFile(texture);
}

async function readGeneratedPublicTextureFile(urlPath) {
  return texturePngByPublicPath.get(urlPath) ?? readGeneratedPublicFile(urlPath);
}

async function readGeneratedPublicFile(urlPath, attempts = 8) {
  const filePath = path.join(generatedPublicDir, urlPath.replace(/^\//, ""));
  for (let attempt = 1; ; attempt++) {
    try {
      return await readFile(filePath);
    } catch (error) {
      if (error?.code === "ENOENT" && await restoreGeneratedTextureFile(urlPath, filePath)) continue;
      if (error?.code !== "ENOENT" || attempt >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 25));
    }
  }
}

async function restoreGeneratedTextureFile(urlPath, filePath) {
  const png = texturePngByPublicPath.get(urlPath);
  if (!png) return false;
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, png);
  return true;
}

async function writeQuakeWeaponModelFiles(assets, sourceProgramFacts) {
  const models = await buildQuakeWeaponModels(assets, sourceProgramFacts);
  const primaryModel = models.find((model) => model.source === QUAKE_DEFAULT_WEAPON_VIEWMODEL_PATH) ?? models[0];
  const outputPaths = [];
  await mkdir(path.dirname(weaponOutputPath), { recursive: true });
  await writeFile(weaponOutputPath, JSON.stringify(primaryModel));
  outputPaths.push(weaponOutputPath);
  for (const model of models) {
    if (model.source === QUAKE_DEFAULT_WEAPON_VIEWMODEL_PATH) continue;
    const outputPath = quakeWeaponModelOutputPath(model.source);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, JSON.stringify(model));
    outputPaths.push(outputPath);
  }
  return outputPaths;
}

function buildQuakeWeaponModels(assets, sourceProgramFacts) {
  const muzzleFlashModelPaths = quakePlayerWeaponMuzzleFlashViewModelPaths(sourceProgramFacts);
  return Promise.all(
    quakePlayerWeaponViewModelPaths(sourceProgramFacts)
      .map((modelPath) => buildQuakeWeaponModel(assets, modelPath, {
        muzzleFlash: muzzleFlashModelPaths.has(modelPath),
      })),
  );
}

function quakePlayerWeaponViewModelPaths(sourceProgramFacts) {
  const paths = [];
  const seen = new Set();
  const addPath = (value) => {
    const modelPath = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (!/^progs\/v_[a-z0-9_]+\.mdl$/.test(modelPath) || seen.has(modelPath)) return;
    seen.add(modelPath);
    paths.push(modelPath);
  };
  addPath(QUAKE_DEFAULT_WEAPON_VIEWMODEL_PATH);
  const profiles = sourceProgramFacts?.playerWeapons?.profiles;
  if (profiles && typeof profiles === "object") {
    for (const profile of Object.values(profiles)) {
      addPath(profile?.presentation?.viewModelPath);
    }
  }
  return paths;
}

function quakePlayerWeaponMuzzleFlashViewModelPaths(sourceProgramFacts) {
  const paths = new Set();
  const profiles = sourceProgramFacts?.playerWeapons?.profiles;
  if (!profiles || typeof profiles !== "object") return paths;
  for (const profile of Object.values(profiles)) {
    const modelPath = quakeNormalizedWeaponViewModelPath(profile?.presentation?.viewModelPath);
    if (!modelPath || !quakeWeaponPresentationHasMuzzleFlash(profile?.presentation)) continue;
    paths.add(modelPath);
  }
  return paths;
}

function quakeWeaponPresentationHasMuzzleFlash(presentation) {
  const variants = presentation?.fireAnimation?.variants;
  return Array.isArray(variants) && variants.some((variant) =>
    Array.isArray(variant?.frames) && variant.frames.some((frame) => frame?.muzzleFlash === true),
  );
}

function quakeNormalizedWeaponViewModelPath(value) {
  const modelPath = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^progs\/v_[a-z0-9_]+\.mdl$/.test(modelPath) ? modelPath : "";
}

function quakePlayerWeaponProjectileModelPaths(sourceProgramFacts) {
  const paths = [];
  const seen = new Set();
  const profiles = sourceProgramFacts?.playerWeapons?.profiles;
  if (!profiles || typeof profiles !== "object") return paths;
  const addPath = (value) => {
    const modelPath = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (!/^progs\/.+\.mdl$/.test(modelPath) || seen.has(modelPath)) return;
    seen.add(modelPath);
    paths.push(modelPath);
  };
  for (const profile of Object.values(profiles)) {
    addPath(profile?.projectile?.modelPath);
  }
  return paths;
}

function quakeWeaponModelOutputPath(modelPath) {
  const filename = path.basename(modelPath, path.extname(modelPath))
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_");
  return path.join(weaponModelOutputDir, `${filename}.json`);
}

function quakeWeaponModelUrlMap(sourceProgramFacts) {
  const urls = {};
  for (const modelPath of quakePlayerWeaponViewModelPaths(sourceProgramFacts)) {
    urls[modelPath] = generatedPublicUrl(
      modelPath === QUAKE_DEFAULT_WEAPON_VIEWMODEL_PATH
        ? weaponOutputPath
        : quakeWeaponModelOutputPath(modelPath),
    );
  }
  return urls;
}

async function buildQuakeWeaponModel(
  assets,
  modelPath = QUAKE_DEFAULT_WEAPON_VIEWMODEL_PATH,
  options = {},
) {
  const model = parseQuakeAliasModel(assets, modelPath);
  const idleFrame = model.frames[0];
  const fireFrame = model.frames[1] ?? idleFrame;
  if (!idleFrame) throw new Error("Quake weapon viewmodel has no frames.");
  void fireFrame;
  void options;
  return {
    source: modelPath,
    glyphFrames: buildQuakeWeaponGlyphFrames(assets, model),
  };
}

function buildQuakeWeaponGlyphFrames(assets, model) {
  const brightness = 1.22; // matches the model texture encode brightness (pickup parity)
  const [px, py, pz] = QUAKE_WEAPON_MODEL_PIVOT;
  // Sample the padded skin: the raw skin's
  // unused regions hold filler pixels (including the palette's blue ramp), and
  // triangle-edge UV rounding can land on them — dilation replaces the filler
  // so colours stay within the real skin.
  const skin = quakeAliasPaddedSkin(model);
  return model.frames.slice(0, 2).map((frame) => {
    const vertices = frame.vertices.map((vertex) => {
      const [x, y, z] = quakeWeaponVertex(vertex);
      return [x - px, y - py, z - pz];
    });
    const polygons = model.triangles.map((triangle) => {
      const uvs = triangle.indices.map((index) => quakeAliasUv(model, triangle, index));
      return {
        vertices: triangle.indices.map((index) => vertices[index]),
        uvs,
        color: quakeAliasModelPolygonGlyphColor(
          uvs, skin, model.skinWidth, model.skinHeight, assets.palette, brightness,
        ),
      };
    });
    return buildQuakeGlyphGeometry(polygons);
  });
}

function anchorQuakeWeaponPolygons(polygons) {
  const [px, py, pz] = QUAKE_WEAPON_MODEL_PIVOT;
  return polygons.map((polygon) => ({
    ...polygon,
    vertices: polygon.vertices.map((vertex) => [
      vertex[0] - px,
      vertex[1] - py,
      vertex[2] - pz,
    ]),
  }));
}

async function buildQuakePickupModels(assets, buildBspModel, programMetadata, options = {}) {
  const models = {};
  const modelPathSets = quakePickupModelPathSets(assets, programMetadata);
  const {
    animatedAliasModelPaths,
    projectileAliasModelPaths,
    enemyAliasModelPaths,
    animatedMonsterAliasModelPaths,
    multiplayerPlayerAliasModelPaths,
    animatedPlayerAliasModelPaths,
  } = modelPathSets;
  let aliasModelPaths = new Set(modelPathSets.aliasModelPaths);
  let bspModelPaths = new Set(modelPathSets.bspModelPaths);
  const concurrency = Number.isFinite(options.concurrency)
    ? Math.max(1, Math.trunc(options.concurrency))
    : normalizedQuakePrepareConcurrency();
  const referencedModelPaths = normalizeQuakeModelPathSet(options.referencedModelPaths);
  if (referencedModelPaths) {
    const modelCountBeforeFilter = aliasModelPaths.size + bspModelPaths.size;
    aliasModelPaths = filterQuakeModelPathSet(aliasModelPaths, referencedModelPaths);
    bspModelPaths = filterQuakeModelPathSet(bspModelPaths, referencedModelPaths);
    const modelCountAfterFilter = aliasModelPaths.size + bspModelPaths.size;
    console.log(
      `Referenced model filter: ${modelCountAfterFilter}/${modelCountBeforeFilter} models selected` +
      `${modelCountAfterFilter === modelCountBeforeFilter ? "" : ` (${modelCountBeforeFilter - modelCountAfterFilter} skipped)`}.`,
    );
  }
  if (quakePrepareModelOnly.size > 0) {
    aliasModelPaths = new Set([...aliasModelPaths].filter(quakePrepareModelOnlyMatches));
    bspModelPaths = new Set([...bspModelPaths].filter(quakePrepareModelOnlyMatches));
    if (aliasModelPaths.size === 0 && bspModelPaths.size === 0) {
      throw new Error(
        `QUAKE_PREPARE_MODEL_ONLY did not match any prepared model: ${[...quakePrepareModelOnly].join(", ")}`,
      );
    }
  }
  const aliasModelItems = [];
  for (const source of aliasModelPaths) {
    const model = parseQuakeAliasModel(assets, source);
    if (!model.frames[0]) throw new Error(`${source} has no frames.`);
    const includeAnimationFrames = animatedAliasModelPaths.has(source) ||
      animatedMonsterAliasModelPaths.has(source) ||
      animatedPlayerAliasModelPaths.has(source);
    const renderScale = enemyAliasModelPaths.has(source)
      ? QUAKE_ENEMY_ALIAS_MODEL_RENDER_SCALE
      : multiplayerPlayerAliasModelPaths.has(source)
      ? QUAKE_PLAYER_ALIAS_MODEL_RENDER_SCALE
      : 1;
    const twoSidedTriangleIndices = quakeAliasTwoSidedTriangleIndices(model, source);
    const swordTriangleIndices = quakeAliasSwordTriangleIndices(source);
    const noMergeTriangleIndices = quakeAliasNoMergeTriangleIndices(model, source) ?? swordTriangleIndices;
    const polygonPlan = buildQuakeAliasPolygonPlan(model, twoSidedTriangleIndices, {
      lateTriangleIndices: swordTriangleIndices,
      noMergeTriangleIndices,
    });
    if (polygonPlan.mergedPairCount > 0) {
      console.log(
        `Merged ${source}: ${model.triangles.length} triangles -> ` +
        `${polygonPlan.entries.length} alias polygons (${polygonPlan.mergedPairCount} pairs` +
        `${polygonPlan.rebakedPairCount ? `, ${polygonPlan.rebakedPairCount} rebaked` : ""}).`,
      );
    }
    const animationFrames = model.frames.map((frame) => ({
      name: frame.name,
      polygons: polygonPlan.entries.flatMap((entry) => quakeAliasPolygonsFromPlan(model, frame, entry, { source })),
    }));
    const renderAnimationFrames = renderScale === 1
      ? animationFrames
      : animationFrames.map((frame) => ({
          ...frame,
          polygons: scaleQuakeModelPolygons(frame.polygons, renderScale),
        }));
    const glyphFrames = buildQuakeAliasModelGlyphFrames(renderAnimationFrames, model, assets.palette);
    renderAnimationFrames.forEach((frame, index) => { frame.glyphGeometry = glyphFrames[index]; });
    const prepared = {
      source,
      polygons: renderAnimationFrames[0].polygons,
      glyphGeometry: renderAnimationFrames[0].glyphGeometry,
      ...(includeAnimationFrames && renderAnimationFrames.length > 1 ? { animationFrames: renderAnimationFrames } : {}),
      ...(renderScale !== 1 ? { renderScale } : {}),
      bounds: polygonBounds(animationFrames[0].polygons),
    };
    aliasModelItems.push({ source, prepared });
  }
  const aliasModelResults = await mapConcurrentlyByOptionalPriority(
    aliasModelItems,
    concurrency,
    quakePickupAliasModelPreparePriority,
    async ({ source, prepared }) => runPrepareStep(`model ${source}`, async () => {
      stripQuakePickupModelSourceGeometry(prepared);
      return [source, prepared];
    }),
  );
  for (const result of aliasModelResults) {
    if (!result) continue;
    models[result[0]] = result[1];
  }

  const bspModelResults = await mapConcurrently(
    [...bspModelPaths],
    concurrency,
    async (source) => runPrepareStep(`model ${source}`, async () => {
      const model = await buildBspModel(source);
      const polygons = model.polygons;
      const glyphGeometry = buildQuakeTexturedStandaloneGlyphGeometry(
        polygons,
        await quakeGlyphTextureSamplers(polygons),
      );
      if (!glyphGeometry || glyphGeometry.polygonCount === 0) {
        throw new Error(`BSP pickup model ${source} produced empty glyph geometry (${polygons?.length ?? 0} source polygons).`);
      }
      const prepared = {
        source,
        polygons,
        glyphGeometry,
        bounds: polygonBounds(polygons),
      };
      stripQuakePickupModelSourceGeometry(prepared);
      return [source, prepared];
    }),
  );
  for (const result of bspModelResults) {
    models[result[0]] = result[1];
  }
  return { models };
}

function quakeMapPreparePriority([mapPath], pakEntrySizeByName) {
  return pakEntrySizeByName.get(mapPath) ?? 0;
}

function quakePickupAliasModelPreparePriority({ prepared }) {
  const frames = prepared?.animationFrames;
  if (Array.isArray(frames) && frames.length > 1) {
    const maxFramePolygons = Math.max(...frames.map((frame) => frame?.polygons?.length ?? 0));
    return frames.length * maxFramePolygons;
  }
  return prepared?.polygons?.length ?? 0;
}

function quakePickupModelCandidatePaths(assets, programMetadata) {
  return quakePickupModelPathSets(assets, programMetadata).modelPaths;
}

function quakePickupModelPathSets(assets, programMetadata) {
  const programPickupModels = quakeProgramPickupModelPaths(programMetadata)
    .filter((model) => assets.entries.has(model));
  const programEnemyModels = quakeProgramEnemyModelPaths(programMetadata)
    .filter((model) => assets.entries.has(model));
  const programRuntimeModels = quakeProgramRuntimeModelPaths(programMetadata)
    .filter((model) => assets.entries.has(model));
  const animatedAliasModelPaths = new Set([
    ...Object.values(QUAKE_PICKUP_MODEL_PATHS),
    ...programPickupModels.filter((model) => model.endsWith(".mdl")),
  ].filter((model) => assets.entries.has(model)));
  const projectileAliasModelPaths = new Set(
    QUAKE_PROJECTILE_ALIAS_MODEL_PATHS.filter((model) => assets.entries.has(model)),
  );
  const multiplayerPlayerAliasModelPaths = new Set(
    QUAKE_MULTIPLAYER_PLAYER_ALIAS_MODEL_PATHS.filter((model) => assets.entries.has(model)),
  );
  const animatedPlayerAliasModelPaths = new Set(
    QUAKE_ANIMATED_PLAYER_ALIAS_MODEL_PATHS.filter((model) => multiplayerPlayerAliasModelPaths.has(model)),
  );
  const enemyAliasModelPaths = new Set(
    programEnemyModels
      .filter((model) => model.endsWith(".mdl") &&
        !animatedAliasModelPaths.has(model) &&
        !projectileAliasModelPaths.has(model) &&
        !multiplayerPlayerAliasModelPaths.has(model)),
  );
  const animatedMonsterAliasModelPaths = new Set(
    QUAKE_ANIMATED_MONSTER_ALIAS_MODEL_PATHS.filter((model) => enemyAliasModelPaths.has(model)),
  );
  let aliasModelPaths = new Set([
    ...animatedAliasModelPaths,
    ...enemyAliasModelPaths,
    ...projectileAliasModelPaths,
    ...multiplayerPlayerAliasModelPaths,
    ...programRuntimeModels.filter((model) => model.endsWith(".mdl")),
  ]);
  let bspModelPaths = new Set([
    ...QUAKE_PICKUP_BSP_MODEL_PATHS,
    ...programPickupModels.filter((model) => model.endsWith(".bsp")),
    ...programRuntimeModels.filter((model) => model.endsWith(".bsp")),
  ].filter((model) => assets.entries.has(model)));
  return {
    animatedAliasModelPaths,
    projectileAliasModelPaths,
    enemyAliasModelPaths,
    animatedMonsterAliasModelPaths,
    multiplayerPlayerAliasModelPaths,
    animatedPlayerAliasModelPaths,
    aliasModelPaths,
    bspModelPaths,
    modelPaths: new Set([...aliasModelPaths, ...bspModelPaths]),
  };
}

function normalizeQuakeModelPathSet(modelPaths) {
  if (!modelPaths) return null;
  return new Set([...modelPaths].map((modelPath) => modelPath.toLowerCase()));
}

function filterQuakeModelPathSet(modelPaths, allowedModelPaths) {
  return new Set([...modelPaths].filter((modelPath) => allowedModelPaths.has(modelPath.toLowerCase())));
}

function stripQuakePickupModelSourceGeometry(model) {
  delete model.texture;
  delete model.polygons;
  for (const frame of model.animationFrames ?? []) {
    delete frame.polygons;
  }
}

function quakeProgramPickupModelPaths(programMetadata) {
  if (!programMetadata) return [];
  const paths = [];
  for (const entry of programMetadata.entityFunctions) {
    if (!/^(item|weapon|ammo|key)_/.test(entry.classname)) continue;
    for (const model of entry.models) {
      if (/^(maps|progs)\/.+\.(bsp|mdl)$/i.test(model.path)) paths.push(model.path);
    }
  }
  return [...new Set(paths)];
}

function quakeProgramEnemyModelPaths(programMetadata) {
  if (!programMetadata) return [];
  const paths = [];
  for (const entry of programMetadata.entityFunctions) {
    if (!entry.classname.startsWith("monster_")) continue;
    const models = entry.models.map((model) => model.path).filter((model) => /^progs\/.+\.mdl$/i.test(model));
    const preferred = QUAKE_MONSTER_MODEL_PATHS[entry.classname];
    const modelPath = preferred && models.includes(preferred)
      ? preferred
      : models.find(isQuakeMonsterBodyModel) ?? models[0];
    if (modelPath) paths.push(modelPath);
  }
  return [...new Set(paths)];
}

function quakeProgramRuntimeModelPaths(programMetadata) {
  if (!programMetadata) return [];
  return [...new Set(
    Object.values(programMetadata.sourceRuntimeModelsByClassname ?? {})
      .flatMap((models) => Array.isArray(models) ? models : [])
      .filter((model) => /^(maps|progs)\/.+\.(bsp|mdl)$/i.test(model)),
  )];
}

function isQuakeMonsterBodyModel(modelPath) {
  const filename = path.basename(modelPath).toLowerCase();
  return !filename.startsWith("h_") &&
    !filename.includes("gib") &&
    !["bolt.mdl", "grenade.mdl", "k_spike.mdl", "lavaball.mdl", "laser.mdl", "s_light.mdl", "v_spike.mdl", "w_spike.mdl", "zom_gib.mdl"].includes(filename);
}

function buildQuakeProgramMetadata(assets, sourceProgramFacts = null) {
  const entry = assets.entries.get("progs.dat");
  if (!entry) throw new Error("Missing Quake progs.dat.");
  const progs = assets.pak.subarray(entry.offset, entry.offset + entry.length);
  const header = parseQuakeProgramHeader(progs);
  const stringsOffset = header.ofsStrings;
  const readProgramString = (offset) => readNullTerminatedString(progs, stringsOffset + offset);

  const assetStringByGlobalOffset = new Map();
  for (let i = 0; i < header.numGlobalDefs; i++) {
    const offset = header.ofsGlobalDefs + i * 8;
    const type = progs.readUInt16LE(offset) & 0x7fff;
    if (type !== 1) continue;
    const globalOffset = progs.readUInt16LE(offset + 2);
    const stringOffset = progs.readInt32LE(header.ofsGlobals + globalOffset * 4);
    const value = readProgramString(stringOffset);
    const asset = quakeProgramAssetString(value);
    if (asset) assetStringByGlobalOffset.set(globalOffset, asset);
  }

  const functions = [];
  for (let i = 0; i < header.numFunctions; i++) {
    const offset = header.ofsFunctions + i * 36;
    functions.push({
      index: i,
      firstStatement: progs.readInt32LE(offset),
      name: readProgramString(progs.readInt32LE(offset + 16)),
      file: readProgramString(progs.readInt32LE(offset + 20)),
    });
  }

  const executableFunctions = functions
    .filter((fn) => fn.firstStatement > 0)
    .sort((a, b) => a.firstStatement - b.firstStatement);
  const functionEndByIndex = new Map();
  for (let i = 0; i < executableFunctions.length; i++) {
    functionEndByIndex.set(
      executableFunctions[i].index,
      i + 1 < executableFunctions.length ? executableFunctions[i + 1].firstStatement : header.numStatements,
    );
  }

  const entityFunctions = [];
  const modelsByClassname = {};
  const soundsByClassname = {};
  for (const fn of functions) {
    if (!isQuakeEntityFunctionName(fn.name) || fn.firstStatement <= 0) continue;
    const endStatement = functionEndByIndex.get(fn.index) ?? header.numStatements;
    const models = quakeFunctionAssetReferences(progs, header, fn.firstStatement, endStatement, assetStringByGlobalOffset, "model");
    const sounds = quakeFunctionAssetReferences(progs, header, fn.firstStatement, endStatement, assetStringByGlobalOffset, "sound");
    if (models.length === 0 && sounds.length === 0) continue;
    entityFunctions.push({
      classname: fn.name,
      file: fn.file,
      models,
      ...(sounds.length ? { sounds } : {}),
      dependencies: {
        models,
        sounds,
      },
    });
    if (models.length) modelsByClassname[fn.name] = models.map((entry) => entry.path);
    if (sounds.length) soundsByClassname[fn.name] = sounds.map((entry) => entry.path);
  }

  entityFunctions.sort((a, b) => a.classname.localeCompare(b.classname));
  const sourceFactChecks = sourceProgramFacts
    ? buildQuakeProgramSourceFactChecks(sourceProgramFacts, { modelsByClassname, soundsByClassname })
    : null;
  const sourceRuntimeModelsByClassname = sourceProgramFacts
    ? buildQuakeProgramSourceRuntimeModelsByClassname(sourceProgramFacts)
    : null;
  const sourcePlayerProjectileModelPaths = sourceProgramFacts
    ? quakePlayerWeaponProjectileModelPaths(sourceProgramFacts)
    : [];
  return {
    version: 1,
    crc: header.crc,
    entityFunctions,
    modelsByClassname,
    soundsByClassname,
    ...(sourceRuntimeModelsByClassname ? { sourceRuntimeModelsByClassname } : {}),
    ...(sourcePlayerProjectileModelPaths.length ? { sourcePlayerProjectileModelPaths } : {}),
    ...(sourceFactChecks ? { sourceFactChecks } : {}),
  };
}

function parseQuakeProgramHeader(progs) {
  return {
    version: progs.readInt32LE(0),
    crc: progs.readInt32LE(4),
    ofsStatements: progs.readInt32LE(8),
    numStatements: progs.readInt32LE(12),
    ofsGlobalDefs: progs.readInt32LE(16),
    numGlobalDefs: progs.readInt32LE(20),
    ofsFieldDefs: progs.readInt32LE(24),
    numFieldDefs: progs.readInt32LE(28),
    ofsFunctions: progs.readInt32LE(32),
    numFunctions: progs.readInt32LE(36),
    ofsStrings: progs.readInt32LE(40),
    numStrings: progs.readInt32LE(44),
    ofsGlobals: progs.readInt32LE(48),
    numGlobals: progs.readInt32LE(52),
    entityFields: progs.readInt32LE(56),
  };
}

function quakeProgramAssetString(value) {
  const path = value.trim().toLowerCase();
  if (/^(maps|progs)\/.+\.(bsp|mdl|spr)$/i.test(path)) {
    return { kind: "model", path };
  }
  if (/^(?:sound\/)?[a-z0-9_/-]+\.wav$/i.test(path)) {
    return { kind: "sound", path: path.replace(/^sound\//i, "") };
  }
  return null;
}

function quakeFunctionAssetReferences(progs, header, firstStatement, endStatement, assetStringByGlobalOffset, kind) {
  const assets = [];
  const seen = new Set();
  for (let statement = firstStatement; statement < endStatement; statement++) {
    const offset = header.ofsStatements + statement * 8;
    for (const operandOffset of [offset + 2, offset + 4, offset + 6]) {
      const asset = assetStringByGlobalOffset.get(progs.readInt16LE(operandOffset));
      if (!asset || asset.kind !== kind || seen.has(asset.path)) continue;
      seen.add(asset.path);
      assets.push({ path: asset.path, statement });
    }
  }
  return assets;
}

function buildQuakeProgramSourceFactChecks(sourceProgramFacts, compiledMetadata) {
  const checks = [];
  const mismatches = [];
  let matchedModels = 0;
  let matchedSounds = 0;
  for (const [classname, sourceFact] of Object.entries(sourceProgramFacts.entities ?? {})) {
    const sourceModels = quakeSourceDependencyPaths(sourceFact, "models");
    const sourceSounds = quakeSourceDependencyPaths(sourceFact, "sounds").map((soundPath) => soundPath.replace(/^sound\//i, ""));
    const compiledModels = new Set(compiledMetadata.modelsByClassname[classname] ?? []);
    const compiledSounds = new Set(compiledMetadata.soundsByClassname[classname] ?? []);
    const missingModels = sourceModels.filter((modelPath) => !compiledModels.has(modelPath));
    const missingSounds = sourceSounds.filter((soundPath) => !compiledSounds.has(soundPath));
    matchedModels += sourceModels.length - missingModels.length;
    matchedSounds += sourceSounds.length - missingSounds.length;
    const check = {
      classname,
      sourceModels,
      sourceSounds,
      matchedModels: sourceModels.length - missingModels.length,
      matchedSounds: sourceSounds.length - missingSounds.length,
      missingModels,
      missingSounds,
      status: missingModels.length || missingSounds.length ? "mismatch" : "matched",
    };
    checks.push(check);
    if (check.status === "mismatch") mismatches.push(check);
  }
  return {
    version: 1,
    sourceRevision: sourceProgramFacts.source?.revision ?? "",
    status: mismatches.length ? "mismatch" : "matched",
    checkedClassnames: checks.map((check) => check.classname),
    matchedModels,
    matchedSounds,
    checks,
    mismatches,
  };
}

function quakeSourceDependencyPaths(sourceFact, key) {
  const dependencies = Array.isArray(sourceFact?.dependencies?.[key])
    ? sourceFact.dependencies[key]
    : [];
  return [...new Set(
    dependencies
      .map((dependency) => typeof dependency?.path === "string" ? dependency.path.trim().toLowerCase() : "")
      .filter(Boolean),
  )].sort();
}

function buildQuakeProgramSourceRuntimeModelsByClassname(sourceProgramFacts) {
  const out = {};
  for (const [classname, sourceFact] of Object.entries(sourceProgramFacts?.entities ?? {})) {
    const paths = [
      ...quakeSourceAssetModelPaths(sourceFact?.assetRefs),
      ...Object.values(sourceFact?.callbackFacts ?? {})
        .flatMap((callbackFact) => quakeSourceAssetModelPaths(callbackFact?.assetRefs)),
    ];
    const uniquePaths = [...new Set(paths)].sort();
    if (uniquePaths.length) out[classname] = uniquePaths;
  }
  return out;
}

function quakeSourceAssetModelPaths(assetRefs) {
  if (!Array.isArray(assetRefs)) return [];
  return assetRefs
    .filter((asset) => asset?.kind === "model" || asset?.kind === "bsp")
    .map((asset) => typeof asset?.path === "string" ? asset.path.trim().toLowerCase() : "")
    .filter((path) => /^(maps|progs)\/.+\.(bsp|mdl)$/i.test(path));
}

function isQuakeEntityFunctionName(name) {
  return /^(item|weapon|ammo|key|monster|trigger|func|info|light|misc|path)_/.test(name) ||
    name === "worldspawn";
}

function isQuakeWeaponNozzlePolygon(uvs) {
  const minU = Math.min(...uvs.map((uv) => uv[0]));
  const maxU = Math.max(...uvs.map((uv) => uv[0]));
  const maxV = Math.max(...uvs.map((uv) => uv[1]));
  return maxV < 0.35 && (
    (minU < 0.22 && maxU < 0.22) ||
    (minU > 0.5 && maxU < 0.72)
  );
}

function loadQuakeHudAssets(pak, parsePakDirectory) {
  const entries = new Map(parsePakDirectory(pak).map((entry) => [
    entry.name,
    {
      offset: entry.offset,
      length: entry.size,
    },
  ]));

  const wadEntry = entries.get("gfx.wad");
  const paletteEntry = entries.get("gfx/palette.lmp");
  if (!wadEntry || !paletteEntry) throw new Error("Quake HUD assets are missing from the PAK.");

  const wad = pak.subarray(wadEntry.offset, wadEntry.offset + wadEntry.length);
  if (readFixedString(wad, 0, 4) !== "WAD2") throw new Error("gfx.wad is not a WAD2 file.");
  const numLumps = wad.readInt32LE(4);
  const lumpTableOffset = wad.readInt32LE(8);
  const lumps = new Map();
  for (let i = 0; i < numLumps; i++) {
    const offset = lumpTableOffset + i * 32;
    const name = readFixedString(wad, offset + 16, 16).toLowerCase();
    lumps.set(name, {
      filepos: wad.readInt32LE(offset),
      type: wad.readUInt8(offset + 12),
    });
  }

  return {
    pak,
    entries,
    wad,
    palette: pak.subarray(paletteEntry.offset, paletteEntry.offset + paletteEntry.length),
    lumps,
  };
}

function parseQuakeAliasModel(assets, pakPath) {
  const entry = assets.entries.get(pakPath);
  if (!entry) throw new Error(`Missing Quake alias model ${pakPath}.`);
  const mdl = assets.pak.subarray(entry.offset, entry.offset + entry.length);
  if (readFixedString(mdl, 0, 4) !== "IDPO" || mdl.readInt32LE(4) !== 6) {
    throw new Error(`Unsupported Quake alias model ${pakPath}.`);
  }

  const scale = [mdl.readFloatLE(8), mdl.readFloatLE(12), mdl.readFloatLE(16)];
  const translate = [mdl.readFloatLE(20), mdl.readFloatLE(24), mdl.readFloatLE(28)];
  const numSkins = mdl.readInt32LE(48);
  const skinWidth = mdl.readInt32LE(52);
  const skinHeight = mdl.readInt32LE(56);
  const numVerts = mdl.readInt32LE(60);
  const numTris = mdl.readInt32LE(64);
  const numFrames = mdl.readInt32LE(68);
  let offset = 84;

  let skin = null;
  for (let skinIndex = 0; skinIndex < numSkins; skinIndex++) {
    const type = mdl.readInt32LE(offset);
    offset += 4;
    if (type !== 0) throw new Error(`Grouped Quake alias skins are not supported for ${pakPath}.`);
    if (skinIndex === 0) skin = mdl.subarray(offset, offset + skinWidth * skinHeight);
    offset += skinWidth * skinHeight;
  }
  if (!skin) throw new Error(`Missing skin for Quake alias model ${pakPath}.`);

  const texcoords = [];
  for (let i = 0; i < numVerts; i++) {
    texcoords.push({
      onseam: mdl.readInt32LE(offset),
      s: mdl.readInt32LE(offset + 4),
      t: mdl.readInt32LE(offset + 8),
    });
    offset += 12;
  }

  const triangles = [];
  for (let i = 0; i < numTris; i++) {
    triangles.push({
      facesfront: mdl.readInt32LE(offset),
      indices: [mdl.readInt32LE(offset + 4), mdl.readInt32LE(offset + 8), mdl.readInt32LE(offset + 12)],
    });
    offset += 16;
  }

  const frames = [];
  for (let frameIndex = 0; frameIndex < numFrames; frameIndex++) {
    const type = mdl.readInt32LE(offset);
    offset += 4;
    if (type === 0) {
      const frame = readQuakeAliasSimpleFrame(mdl, offset, numVerts, scale, translate);
      offset = frame.offset;
      frames.push({ name: frame.name, vertices: frame.vertices, normalIndices: frame.normalIndices });
    } else if (type === 1) {
      offset += 8;
      const groupFrameCount = mdl.readInt32LE(offset);
      offset += 4 + groupFrameCount * 4;
      for (let groupFrameIndex = 0; groupFrameIndex < groupFrameCount; groupFrameIndex++) {
        const frame = readQuakeAliasSimpleFrame(mdl, offset, numVerts, scale, translate);
        offset = frame.offset;
        if (groupFrameIndex === 0) {
          frames.push({ name: frame.name, vertices: frame.vertices, normalIndices: frame.normalIndices });
        }
      }
    } else {
      throw new Error(`Unsupported Quake alias frame type ${type} for ${pakPath}.`);
    }
  }

  return { skinWidth, skinHeight, skin, texcoords, triangles, frames };
}

function readQuakeAliasSimpleFrame(mdl, offset, numVerts, scale, translate) {
  offset += 8;
  const name = readFixedString(mdl, offset, 16);
  offset += 16;
  const vertices = [];
  const normalIndices = [];
  for (let i = 0; i < numVerts; i++) {
    vertices.push([
      mdl[offset] * scale[0] + translate[0],
      mdl[offset + 1] * scale[1] + translate[1],
      mdl[offset + 2] * scale[2] + translate[2],
    ]);
    normalIndices.push(mdl[offset + 3] ?? 0);
    offset += 4;
  }
  return { name, offset, vertices, normalIndices };
}

function quakeWeaponVertex(vertex) {
  const [x, y, z] = vertex;
  return [x * 0.16, y * 0.16, z * 0.16];
}

function quakePickupVertex(vertex) {
  const [x, y, z] = vertex;
  return [-x * QUAKE_PICKUP_MODEL_SCALE, -y * QUAKE_PICKUP_MODEL_SCALE, z * QUAKE_PICKUP_MODEL_SCALE];
}

function scaleQuakeModelPolygons(polygons, scale) {
  const scaleVertex = (vertex) => [
    vertex[0] * scale,
    vertex[1] * scale,
    vertex[2] * scale,
  ];
  return polygons.map((polygon) => ({
    ...polygon,
    vertices: polygon.vertices.map(scaleVertex),
    ...(Array.isArray(polygon.textureTriangles) ? {
      textureTriangles: polygon.textureTriangles.map((triangle) => ({
        vertices: triangle.vertices.map(scaleVertex),
        uvs: triangle.uvs.map((uv) => [...uv]),
      })),
    } : {}),
  }));
}

function buildQuakeAliasPolygonPlan(model, twoSidedTriangleIndices, options = {}) {
  const candidateEntries = quakeAliasMergedPolygonCandidates(model, twoSidedTriangleIndices, {
    noMergeTriangleIndices: options.noMergeTriangleIndices,
    rebakeUvSeams: quakeAliasRebakeMerge,
  });
  const candidateCountsByTriangleIndex = new Map();
  for (const entry of candidateEntries) {
    for (const triangleIndex of entry.triangleIndices) {
      candidateCountsByTriangleIndex.set(
        triangleIndex,
        (candidateCountsByTriangleIndex.get(triangleIndex) ?? 0) + 1,
      );
    }
  }

  candidateEntries.sort((a, b) =>
    quakeAliasCandidatePairScore(a, candidateCountsByTriangleIndex) -
      quakeAliasCandidatePairScore(b, candidateCountsByTriangleIndex) ||
    a.triangleIndices[0] - b.triangleIndices[0] ||
    a.triangleIndices[1] - b.triangleIndices[1],
  );

  const mergedTriangleIndices = new Set();
  const mergedEntriesByFirstTriangleIndex = new Map();
  for (const entry of candidateEntries) {
    if (entry.triangleIndices.some((triangleIndex) => mergedTriangleIndices.has(triangleIndex))) continue;
    for (const triangleIndex of entry.triangleIndices) mergedTriangleIndices.add(triangleIndex);
    mergedEntriesByFirstTriangleIndex.set(Math.min(...entry.triangleIndices), entry);
  }

  const entries = [];
  for (let triangleIndex = 0; triangleIndex < model.triangles.length; triangleIndex++) {
    const mergedEntry = mergedEntriesByFirstTriangleIndex.get(triangleIndex);
    if (mergedEntry) {
      entries.push(mergedEntry);
      continue;
    }
    if (mergedTriangleIndices.has(triangleIndex)) continue;
    entries.push(quakeAliasSingleTrianglePlan(model, twoSidedTriangleIndices, triangleIndex));
  }

  const orderedEntries = quakeAliasOrderedPolygonPlanEntries(entries, options.lateTriangleIndices);
  return {
    entries: orderedEntries,
    mergedPairCount: mergedEntriesByFirstTriangleIndex.size,
    rebakedPairCount: orderedEntries.filter((entry) => entry.rebakedTextureTriangles).length,
  };
}

function quakeAliasOrderedPolygonPlanEntries(entries, lateTriangleIndices) {
  if (!lateTriangleIndices?.size) return entries;
  const regularEntries = [];
  const lateEntries = [];
  for (const entry of entries) {
    const bucket = entry.triangleIndices.some((triangleIndex) => lateTriangleIndices.has(triangleIndex))
      ? lateEntries
      : regularEntries;
    bucket.push(entry);
  }
  return [...regularEntries, ...lateEntries];
}

function quakeAliasSingleTrianglePlan(model, twoSidedTriangleIndices, triangleIndex) {
  const triangle = model.triangles[triangleIndex];
  return {
    triangleIndices: [triangleIndex],
    indexOrder: [...triangle.indices],
    uvs: triangle.indices.map((index) => quakeAliasUv(model, triangle, index)),
    ...(twoSidedTriangleIndices.has(triangleIndex) ? { data: { "two-sided": true } } : {}),
  };
}

function quakeAliasMergedPolygonCandidates(model, twoSidedTriangleIndices, options = {}) {
  const edgeTriangleIndices = quakeAliasEdgeTriangleIndices(model.triangles);
  const candidateEntries = [];
  const candidateKeys = new Set();
  for (let triangleIndex = 0; triangleIndex < model.triangles.length; triangleIndex++) {
    const triangle = model.triangles[triangleIndex];
    for (const [a, b] of quakeAliasTriangleEdges(triangle.indices)) {
      const neighborTriangleIndices = edgeTriangleIndices.get(quakeAliasEdgeKey(a, b));
      if (!neighborTriangleIndices || neighborTriangleIndices.length !== 2) continue;
      const otherTriangleIndex = neighborTriangleIndices[0] === triangleIndex
        ? neighborTriangleIndices[1]
        : neighborTriangleIndices[0];
      if (otherTriangleIndex <= triangleIndex) continue;
      if (
        options.noMergeTriangleIndices?.has(triangleIndex) ||
        options.noMergeTriangleIndices?.has(otherTriangleIndex)
      ) {
        continue;
      }
      const candidateKey = `${triangleIndex}:${otherTriangleIndex}`;
      if (candidateKeys.has(candidateKey)) continue;
      candidateKeys.add(candidateKey);
      const mergedEntry = quakeAliasMergedPolygonPlan(
        model,
        twoSidedTriangleIndices,
        triangleIndex,
        otherTriangleIndex,
        options,
      );
      if (mergedEntry) candidateEntries.push(mergedEntry);
    }
  }
  return candidateEntries;
}

function quakeAliasCandidatePairScore(entry, candidateCountsByTriangleIndex) {
  return entry.triangleIndices.reduce(
    (sum, triangleIndex) => sum + (candidateCountsByTriangleIndex.get(triangleIndex) ?? 0),
    0,
  );
}

function quakeAliasMergedPolygonPlan(model, twoSidedTriangleIndices, triangleIndexA, triangleIndexB, options = {}) {
  const triangleA = model.triangles[triangleIndexA];
  const triangleB = model.triangles[triangleIndexB];
  const sharedIndices = triangleA.indices.filter((index) => triangleB.indices.includes(index));
  const uniqueIndices = new Set([...triangleA.indices, ...triangleB.indices]);
  if (sharedIndices.length !== 2 || uniqueIndices.size !== 4) return null;
  const sharedEdgeUvsMatch = quakeAliasSharedEdgeUvsMatch(model, triangleA, triangleB, sharedIndices);
  if (!sharedEdgeUvsMatch && !options.rebakeUvSeams) return null;

  const cycle = quakeAliasBoundaryIndexCycle(triangleA.indices, triangleB.indices);
  if (!cycle) return null;
  const indexOrder = quakeAliasOrientMergedIndexOrder(model, triangleIndexA, triangleIndexB, cycle);
  if (!quakeAliasMergedPolygonFramesAreSafe(model, triangleIndexA, triangleIndexB, indexOrder)) return null;
  if (!sharedEdgeUvsMatch && !quakeAliasMergedPolygonFramesShareAffineShape(model, indexOrder)) return null;

  const twoSided = twoSidedTriangleIndices.has(triangleIndexA) || twoSidedTriangleIndices.has(triangleIndexB);
  return {
    triangleIndices: [triangleIndexA, triangleIndexB],
    indexOrder,
    ...(sharedEdgeUvsMatch
      ? { uvs: indexOrder.map((index) => quakeAliasPlanUv(model, triangleA, triangleB, index)) }
      : {
          rebakedTextureTriangles: true,
          textureTriangles: [
            quakeAliasTextureTrianglePlan(model, triangleA),
            quakeAliasTextureTrianglePlan(model, triangleB),
          ],
        }),
    ...(twoSided ? { data: { "two-sided": true } } : {}),
  };
}

function quakeAliasSharedEdgeUvsMatch(model, triangleA, triangleB, sharedIndices) {
  return sharedIndices.every((index) =>
    quakeAliasSameUv(
      quakeAliasUv(model, triangleA, index),
      quakeAliasUv(model, triangleB, index),
    ),
  );
}

function quakeAliasPlanUv(model, triangleA, triangleB, index) {
  return quakeAliasUv(
    model,
    triangleA.indices.includes(index) ? triangleA : triangleB,
    index,
  );
}

function quakeAliasPolygonsFromPlan(model, frame, entry, options = {}) {
  const polygon = quakeAliasPolygonFromPlan(model, frame, entry, options);
  const subdivisionLevels = quakeAliasPolygonSubdivisionLevels(entry, options.source);
  return subdivisionLevels > 0 ? subdivideQuakeAliasPolygon(polygon, subdivisionLevels) : [polygon];
}

function quakeAliasPolygonFromPlan(model, frame, entry, options = {}) {
  const indexOrder = quakeAliasPolygonWindingOrder(entry.indexOrder);
  const uvs = entry.uvs ? quakeAliasPolygonWindingOrder(entry.uvs) : null;
  return {
    vertices: indexOrder.map((index) => quakeAliasFramePlanVertex(frame, entry, index, options)),
    ...(uvs ? { uvs: uvs.map((uv) => [...uv]) } : {}),
    ...(entry.textureTriangles ? {
      textureTriangles: entry.textureTriangles.map((triangle) => {
        const indices = quakeAliasPolygonWindingOrder(triangle.indices);
        const triangleUvs = quakeAliasPolygonWindingOrder(triangle.uvs);
        return {
          vertices: indices.map((index) => quakeAliasFramePlanVertex(frame, entry, index, options)),
          uvs: triangleUvs.map((uv) => [...uv]),
        };
      }),
    } : {}),
    ...(entry.data ? { data: { ...entry.data } } : {}),
  };
}

// Representative glyph colour for an alias-model polygon: average the model skin
// (palette-indexed) over the polygon's UV samples. Mirrors litTextureFallbackColor
// but per-polygon via UVs (the skin is one texture; different polygons map to
// different regions). Fullbright palette indices (>=224) ignore brightness.
function quakeAliasModelPolygonGlyphColor(uvs, skin, skinWidth, skinHeight, palette, brightness) {
  if (!Array.isArray(uvs) || !uvs.length || !skin || !skinWidth || !skinHeight) return "#808080";
  let r = 0, g = 0, b = 0, n = 0;
  for (const uv of uvs) {
    // UVs are normalized (quakeAliasUv): u = (s+0.5)/w, v = 1 - (t+0.5)/h.
    // Convert back to skin pixel coords (v is flipped).
    let s = Math.round(uv[0] * skinWidth);
    let t = Math.round((1 - uv[1]) * skinHeight);
    s = ((s % skinWidth) + skinWidth) % skinWidth;
    t = ((t % skinHeight) + skinHeight) % skinHeight;
    const paletteIndex = skin[t * skinWidth + s] ?? 0;
    const rgb = paletteRgbAt(palette, paletteIndex);
    const light = paletteIndex >= 224 ? 1 : brightness;
    r += rgb[0] * light; g += rgb[1] * light; b += rgb[2] * light; n++;
  }
  if (!n) return "#808080";
  const hex = (value) => clampByte(value / n).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

// Per-frame glyph geometry for an alias model: vertices from each (renderScale-
// applied) frame, colour sampled from the skin via UVs. Reuses the world
// buildQuakeGlyphGeometry for the compact {v,c} encoding + coordinate rounding.
function buildQuakeAliasModelGlyphFrames(renderAnimationFrames, model, palette) {
  const brightness = 1.22; // matches the model texture encode brightness
  return renderAnimationFrames.map((frame) =>
    buildQuakeGlyphGeometry(
      frame.polygons.map((polygon) => ({
        ...polygon,
        color: quakeAliasModelPolygonGlyphColor(
          polygon.uvs, model.skin, model.skinWidth, model.skinHeight, palette, brightness,
        ),
      })),
    ));
}

function quakeAliasPolygonWindingOrder(values) {
  if (values.length < 3) return [...values];
  return [values[0], ...values.slice(1).reverse()];
}

function quakeAliasFramePlanVertex(frame, entry, index, options = {}) {
  const vertex = quakePickupVertex(frame.vertices[index]);
  if (quakeShouldOffsetKnightStandSword(entry, frame, options.source)) {
    vertex[0] += QUAKE_KNIGHT_STAND_SWORD_FORWARD_OFFSET * QUAKE_PICKUP_MODEL_SCALE;
  }
  return vertex;
}

function quakeShouldOffsetKnightStandSword(entry, frame, source = "") {
  return source === QUAKE_KNIGHT_MODEL_PATH &&
    frame?.name?.startsWith("stand") &&
    entry.triangleIndices.some((triangleIndex) => QUAKE_KNIGHT_SWORD_TRIANGLE_INDICES.has(triangleIndex));
}

function quakeAliasPolygonSubdivisionLevels(entry, source = "") {
  if (source !== QUAKE_KNIGHT_MODEL_PATH) return 0;
  if (!entry.triangleIndices.some((triangleIndex) => QUAKE_KNIGHT_SWORD_TRIANGLE_INDICES.has(triangleIndex))) {
    return 0;
  }
  return QUAKE_KNIGHT_SWORD_SUBDIVISION_LEVELS;
}

function subdivideQuakeAliasPolygon(polygon, levels) {
  if (
    levels <= 0 ||
    polygon.vertices.length !== 3 ||
    polygon.uvs?.length !== 3 ||
    polygon.textureTriangles?.length
  ) {
    return [polygon];
  }
  let polygons = [polygon];
  for (let level = 0; level < levels; level++) {
    polygons = polygons.flatMap(subdivideQuakeAliasTrianglePolygon);
  }
  return polygons;
}

function subdivideQuakeAliasTrianglePolygon(polygon) {
  const [a, b, c] = polygon.vertices;
  const [uvA, uvB, uvC] = polygon.uvs;
  const ab = quakeVectorMidpoint(a, b);
  const bc = quakeVectorMidpoint(b, c);
  const ca = quakeVectorMidpoint(c, a);
  const uvAB = quakeVectorMidpoint(uvA, uvB);
  const uvBC = quakeVectorMidpoint(uvB, uvC);
  const uvCA = quakeVectorMidpoint(uvC, uvA);
  return [
    quakeAliasTrianglePolygonLike(polygon, [a, ab, ca], [uvA, uvAB, uvCA]),
    quakeAliasTrianglePolygonLike(polygon, [ab, b, bc], [uvAB, uvB, uvBC]),
    quakeAliasTrianglePolygonLike(polygon, [ca, bc, c], [uvCA, uvBC, uvC]),
    quakeAliasTrianglePolygonLike(polygon, [ab, bc, ca], [uvAB, uvBC, uvCA]),
  ];
}

function quakeAliasTrianglePolygonLike(source, vertices, uvs) {
  return {
    ...source,
    vertices,
    uvs,
  };
}

function quakeAliasTextureTrianglePlan(model, triangle) {
  return {
    indices: [...triangle.indices],
    uvs: triangle.indices.map((index) => quakeAliasUv(model, triangle, index)),
  };
}

function quakeAliasEdgeTriangleIndices(triangles) {
  const edgeTriangleIndices = new Map();
  for (let triangleIndex = 0; triangleIndex < triangles.length; triangleIndex++) {
    for (const [a, b] of quakeAliasTriangleEdges(triangles[triangleIndex].indices)) {
      const key = quakeAliasEdgeKey(a, b);
      const triangleIndices = edgeTriangleIndices.get(key);
      if (triangleIndices) {
        triangleIndices.push(triangleIndex);
      } else {
        edgeTriangleIndices.set(key, [triangleIndex]);
      }
    }
  }
  return edgeTriangleIndices;
}

function quakeAliasTriangleEdges(indices) {
  return [
    [indices[0], indices[1]],
    [indices[1], indices[2]],
    [indices[2], indices[0]],
  ];
}

function quakeAliasEdgeKey(a, b) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function quakeAliasBoundaryIndexCycle(indicesA, indicesB) {
  const edgeCounts = new Map();
  const edgeEndpoints = new Map();
  for (const indices of [indicesA, indicesB]) {
    for (const [a, b] of quakeAliasTriangleEdges(indices)) {
      const key = quakeAliasEdgeKey(a, b);
      edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
      edgeEndpoints.set(key, [a, b]);
    }
  }

  const boundaryEdges = [...edgeCounts]
    .filter(([, count]) => count === 1)
    .map(([key]) => edgeEndpoints.get(key));
  if (boundaryEdges.length !== 4) return null;

  const adjacency = new Map();
  for (const [a, b] of boundaryEdges) {
    adjacency.set(a, [...(adjacency.get(a) ?? []), b]);
    adjacency.set(b, [...(adjacency.get(b) ?? []), a]);
  }
  if (adjacency.size !== 4 || [...adjacency.values()].some((neighbors) => neighbors.length !== 2)) {
    return null;
  }

  const start = Math.min(...adjacency.keys());
  const cycle = [start];
  let previous = null;
  let current = start;
  for (let step = 0; step < 3; step++) {
    const neighbors = [...adjacency.get(current)].sort((a, b) => a - b);
    const next = neighbors.find((index) => index !== previous);
    if (next === undefined || cycle.includes(next)) return null;
    cycle.push(next);
    previous = current;
    current = next;
  }
  return adjacency.get(current).includes(start) ? cycle : null;
}

function quakeAliasOrientMergedIndexOrder(model, triangleIndexA, triangleIndexB, indexOrder) {
  const frame = model.frames[0];
  const quadNormal = quakePolygonUnitNormal(
    indexOrder.map((index) => quakePickupVertex(frame.vertices[index])),
  );
  const triangleNormalA = quakeAliasTriangleUnitNormal(model, frame, triangleIndexA);
  const triangleNormalB = quakeAliasTriangleUnitNormal(model, frame, triangleIndexB);
  if (!quadNormal || !triangleNormalA || !triangleNormalB) return indexOrder;
  const referenceNormal = quakeVectorNormalize([
    triangleNormalA[0] + triangleNormalB[0],
    triangleNormalA[1] + triangleNormalB[1],
    triangleNormalA[2] + triangleNormalB[2],
  ]);
  if (!referenceNormal || quakeVectorDot(quadNormal, referenceNormal) >= 0) return indexOrder;
  return [indexOrder[0], indexOrder[3], indexOrder[2], indexOrder[1]];
}

function quakeAliasMergedPolygonFramesAreSafe(model, triangleIndexA, triangleIndexB, indexOrder) {
  for (const frame of model.frames) {
    const vertices = indexOrder.map((index) => quakePickupVertex(frame.vertices[index]));
    if (!quakeQuadPlanarEnough(vertices) || !quakeQuadConvexEnough(vertices)) return false;
    const quadNormal = quakePolygonUnitNormal(vertices);
    const triangleNormalA = quakeAliasTriangleUnitNormal(model, frame, triangleIndexA);
    const triangleNormalB = quakeAliasTriangleUnitNormal(model, frame, triangleIndexB);
    if (!quadNormal || !triangleNormalA || !triangleNormalB) return false;
    if (quakeVectorDot(quadNormal, triangleNormalA) <= 0 || quakeVectorDot(quadNormal, triangleNormalB) <= 0) {
      return false;
    }
  }
  return true;
}

function quakeAliasMergedPolygonFramesShareAffineShape(model, indexOrder) {
  const baseFrame = model.frames[0];
  if (!baseFrame) return false;
  const baseVertices = indexOrder.map((index) => quakePickupVertex(baseFrame.vertices[index]));
  const fourthVertexCoords = quakeAffineCoordsInTriangle(
    baseVertices[0],
    baseVertices[1],
    baseVertices[2],
    baseVertices[3],
  );
  if (!fourthVertexCoords) return false;

  for (const frame of model.frames) {
    const vertices = indexOrder.map((index) => quakePickupVertex(frame.vertices[index]));
    const predicted = [
      vertices[0][0] +
        (vertices[1][0] - vertices[0][0]) * fourthVertexCoords[0] +
        (vertices[2][0] - vertices[0][0]) * fourthVertexCoords[1],
      vertices[0][1] +
        (vertices[1][1] - vertices[0][1]) * fourthVertexCoords[0] +
        (vertices[2][1] - vertices[0][1]) * fourthVertexCoords[1],
      vertices[0][2] +
        (vertices[1][2] - vertices[0][2]) * fourthVertexCoords[0] +
        (vertices[2][2] - vertices[0][2]) * fourthVertexCoords[1],
    ];
    if (quakeVectorDistance(predicted, vertices[3]) > QUAKE_ALIAS_REBAKE_MERGE_AFFINE_EPSILON) {
      return false;
    }
  }
  return true;
}

function quakeAffineCoordsInTriangle(a, b, c, point) {
  const ab = quakeVectorSubtract(b, a);
  const ac = quakeVectorSubtract(c, a);
  const ap = quakeVectorSubtract(point, a);
  const abAb = quakeVectorDot(ab, ab);
  const abAc = quakeVectorDot(ab, ac);
  const acAc = quakeVectorDot(ac, ac);
  const apAb = quakeVectorDot(ap, ab);
  const apAc = quakeVectorDot(ap, ac);
  const determinant = abAb * acAc - abAc * abAc;
  if (Math.abs(determinant) <= QUAKE_ALIAS_MERGE_GEOMETRY_EPSILON) return null;
  return [
    (apAb * acAc - apAc * abAc) / determinant,
    (apAc * abAb - apAb * abAc) / determinant,
  ];
}

function quakeAliasTriangleUnitNormal(model, frame, triangleIndex) {
  const triangle = model.triangles[triangleIndex];
  return quakePolygonUnitNormal(triangle.indices.map((index) => quakePickupVertex(frame.vertices[index])));
}

function quakeQuadPlanarEnough(vertices) {
  const normal = quakePolygonUnitNormal(vertices);
  if (!normal) return false;
  const distance = Math.abs(quakeVectorDot(quakeVectorSubtract(vertices[3], vertices[0]), normal));
  return distance <= QUAKE_ALIAS_MERGE_MAX_NONPLANAR_DISTANCE;
}

function quakeQuadConvexEnough(vertices) {
  const normal = quakePolygonUnitNormal(vertices);
  if (!normal) return false;
  const normalAxis = normal.map((value) => Math.abs(value));
  const dropAxis = normalAxis[0] >= normalAxis[1] && normalAxis[0] >= normalAxis[2]
    ? 0
    : normalAxis[1] >= normalAxis[2] ? 1 : 2;
  const points = vertices.map((vertex) => {
    if (dropAxis === 0) return [vertex[1], vertex[2]];
    if (dropAxis === 1) return [vertex[0], vertex[2]];
    return [vertex[0], vertex[1]];
  });

  let sign = 0;
  for (let index = 0; index < points.length; index++) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    const c = points[(index + 2) % points.length];
    const crossZ = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(crossZ) <= QUAKE_ALIAS_MERGE_GEOMETRY_EPSILON) continue;
    const currentSign = Math.sign(crossZ);
    if (sign !== 0 && currentSign !== sign) return false;
    sign = currentSign;
  }
  return sign !== 0;
}

function quakePolygonUnitNormal(vertices) {
  if (vertices.length < 3) return null;
  const normal = quakeVectorCross(
    quakeVectorSubtract(vertices[1], vertices[0]),
    quakeVectorSubtract(vertices[2], vertices[0]),
  );
  return quakeVectorNormalize(normal);
}

function quakeVectorSubtract(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function quakeVectorCross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function quakeVectorDot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function quakeVectorDistance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function quakeVectorMidpoint(a, b) {
  return a.map((value, index) => (value + b[index]) / 2);
}

function quakeVectorNormalize(vector) {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  if (length <= QUAKE_ALIAS_MERGE_GEOMETRY_EPSILON) return null;
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function quakeAliasSameUv(a, b) {
  return Math.abs(a[0] - b[0]) <= QUAKE_ALIAS_MERGE_UV_EPSILON &&
    Math.abs(a[1] - b[1]) <= QUAKE_ALIAS_MERGE_UV_EPSILON;
}

function quakeAliasTwoSidedTriangleIndices(model, source = "") {
  if (source === QUAKE_LAVABALL_MODEL_PATH) return quakeAliasAllTriangleIndices(model);

  const edgeTriangleIndices = new Map();
  for (let triangleIndex = 0; triangleIndex < model.triangles.length; triangleIndex++) {
    const indices = model.triangles[triangleIndex].indices;
    for (const [a, b] of [
      [indices[0], indices[1]],
      [indices[1], indices[2]],
      [indices[2], indices[0]],
    ]) {
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      const triangleIndices = edgeTriangleIndices.get(key);
      if (triangleIndices) {
        triangleIndices.push(triangleIndex);
      } else {
        edgeTriangleIndices.set(key, [triangleIndex]);
      }
    }
  }

  const twoSidedTriangleIndices = new Set();
  for (const triangleIndices of edgeTriangleIndices.values()) {
    if (triangleIndices.length === 2) continue;
    for (const triangleIndex of triangleIndices) twoSidedTriangleIndices.add(triangleIndex);
  }
  const swordTriangleIndices = quakeAliasSwordTriangleIndices(source);
  if (swordTriangleIndices) {
    for (const triangleIndex of swordTriangleIndices) {
      twoSidedTriangleIndices.add(triangleIndex);
    }
  }
  return twoSidedTriangleIndices;
}

function quakeAliasSwordTriangleIndices(source = "") {
  if (source !== QUAKE_KNIGHT_MODEL_PATH) return undefined;
  return QUAKE_KNIGHT_SWORD_TRIANGLE_INDICES;
}

function quakeAliasNoMergeTriangleIndices(model, source = "") {
  if (source === QUAKE_BACKPACK_MODEL_PATH) return QUAKE_BACKPACK_STRAP_NO_MERGE_TRIANGLE_INDICES;
  if (source === QUAKE_LAVABALL_MODEL_PATH) return quakeAliasAllTriangleIndices(model);
  if (source !== QUAKE_KNIGHT_MODEL_PATH) return undefined;
  return QUAKE_KNIGHT_SWORD_TRIANGLE_INDICES;
}

function quakeAliasAllTriangleIndices(model) {
  return new Set(model.triangles.map((_triangle, triangleIndex) => triangleIndex));
}

function polygonBounds(polygons) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const polygon of polygons) {
    for (const vertex of polygon.vertices) {
      min[0] = Math.min(min[0], vertex[0]);
      min[1] = Math.min(min[1], vertex[1]);
      min[2] = Math.min(min[2], vertex[2]);
      max[0] = Math.max(max[0], vertex[0]);
      max[1] = Math.max(max[1], vertex[1]);
      max[2] = Math.max(max[2], vertex[2]);
    }
  }
  return {
    min: min.map((value) => Number.isFinite(value) ? value : 0),
    max: max.map((value) => Number.isFinite(value) ? value : 0),
  };
}

function quakeAliasUv(model, triangle, index) {
  const texcoord = model.texcoords[index];
  const s = !triangle.facesfront && texcoord.onseam ? texcoord.s + model.skinWidth / 2 : texcoord.s;
  return [(s + 0.5) / model.skinWidth, 1 - (texcoord.t + 0.5) / model.skinHeight];
}

// Alias skins can contain bright filler outside UV islands; pad from real UV pixels before atlas bleed samples it.
function quakeAliasPaddedSkin(model, radius = QUAKE_ALIAS_SKIN_PADDING_RADIUS) {
  if (radius <= 0) return model.skin;
  const mask = new Uint8Array(model.skinWidth * model.skinHeight);
  for (const triangle of model.triangles) markQuakeAliasSkinTriangle(mask, model, triangle);
  const padded = dilateIndexedPixels(model.skin, model.skinWidth, model.skinHeight, mask, radius);
  return replaceIndexedFillerPixels(padded, model.skinWidth, model.skinHeight, QUAKE_ALIAS_SKIN_FILLER_INDEX);
}

function markQuakeAliasSkinTriangle(mask, model, triangle) {
  const points = triangle.indices.map((index) => quakeAliasSkinPoint(model, triangle, index));
  const minX = Math.max(0, Math.floor(Math.min(...points.map((point) => point[0]))));
  const maxX = Math.min(model.skinWidth - 1, Math.ceil(Math.max(...points.map((point) => point[0]))));
  const minY = Math.max(0, Math.floor(Math.min(...points.map((point) => point[1]))));
  const maxY = Math.min(model.skinHeight - 1, Math.ceil(Math.max(...points.map((point) => point[1]))));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (pointInTriangle2d(x, y, points)) mask[y * model.skinWidth + x] = 1;
    }
  }
  for (let index = 0; index < points.length; index++) {
    markQuakeAliasSkinLine(mask, model.skinWidth, model.skinHeight, points[index], points[(index + 1) % points.length]);
  }
}

function quakeAliasSkinPoint(model, triangle, index) {
  const texcoord = model.texcoords[index];
  const s = !triangle.facesfront && texcoord.onseam ? texcoord.s + model.skinWidth / 2 : texcoord.s;
  return [s, texcoord.t];
}

function markQuakeAliasSkinLine(mask, width, height, a, b) {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) * 2));
  for (let step = 0; step <= steps; step++) {
    const t = step / steps;
    const x = Math.round(a[0] + (b[0] - a[0]) * t);
    const y = Math.round(a[1] + (b[1] - a[1]) * t);
    if (x >= 0 && x < width && y >= 0 && y < height) mask[y * width + x] = 1;
  }
}

function pointInTriangle2d(x, y, points) {
  const [a, b, c] = points;
  const ab = signedTriangleEdge(x, y, a, b);
  const bc = signedTriangleEdge(x, y, b, c);
  const ca = signedTriangleEdge(x, y, c, a);
  const hasNegative = ab < -1e-6 || bc < -1e-6 || ca < -1e-6;
  const hasPositive = ab > 1e-6 || bc > 1e-6 || ca > 1e-6;
  return !(hasNegative && hasPositive);
}

function signedTriangleEdge(x, y, a, b) {
  return (x - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (y - b[1]);
}

function dilateIndexedPixels(pixels, width, height, sourceMask, radius) {
  const out = Uint8Array.from(pixels);
  let filled = Uint8Array.from(sourceMask);
  for (let pass = 0; pass < radius; pass++) {
    const nextFilled = Uint8Array.from(filled);
    let changed = false;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        if (filled[index]) continue;
        const sourceIndex = nearestFilledNeighborIndex(filled, width, height, x, y);
        if (sourceIndex === -1) continue;
        out[index] = out[sourceIndex];
        nextFilled[index] = 1;
        changed = true;
      }
    }
    if (!changed) break;
    filled = nextFilled;
  }
  return out;
}

function nearestFilledNeighborIndex(filled, width, height, x, y) {
  let bestIndex = -1;
  let bestDistance = Infinity;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const index = ny * width + nx;
      if (!filled[index]) continue;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }
  }
  return bestIndex;
}

function replaceIndexedFillerPixels(pixels, width, height, fillerIndex) {
  const out = Uint8Array.from(pixels);
  let filler = new Uint8Array(out.length);
  let remaining = 0;
  for (let index = 0; index < out.length; index++) {
    if (out[index] !== fillerIndex) continue;
    filler[index] = 1;
    remaining++;
  }
  while (remaining > 0) {
    const nextFiller = Uint8Array.from(filler);
    let changed = false;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        if (!filler[index]) continue;
        const sourceIndex = nearestNonFillerNeighborIndex(filler, width, height, x, y);
        if (sourceIndex === -1) continue;
        out[index] = out[sourceIndex];
        nextFiller[index] = 0;
        remaining--;
        changed = true;
      }
    }
    if (!changed) break;
    filler = nextFiller;
  }
  return out;
}

function nearestNonFillerNeighborIndex(filler, width, height, x, y) {
  let bestIndex = -1;
  let bestDistance = Infinity;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const index = ny * width + nx;
      if (filler[index]) continue;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }
  }
  return bestIndex;
}

function drawQpic(rgba, assets, name, x, y, transparentIndex) {
  drawWadQpicTo(rgba, assets, name, x, y, QUAKE_HUD_WIDTH, QUAKE_HUD_HEIGHT, transparentIndex);
}

function drawWadQpicTo(rgba, assets, name, x, y, targetWidth, targetHeight, transparentIndex) {
  const lump = assets.lumps.get(name);
  if (!lump || lump.type !== 66) throw new Error(`Missing Quake qpic ${name}.`);
  const width = assets.wad.readInt32LE(lump.filepos);
  const height = assets.wad.readInt32LE(lump.filepos + 4);
  const dataOffset = lump.filepos + 8;
  drawIndexedImage(
    rgba,
    assets.palette,
    assets.wad,
    dataOffset,
    width,
    height,
    x,
    y,
    targetWidth,
    targetHeight,
    transparentIndex,
  );
}

function drawPakQpic(rgba, assets, pakPath, x, y, targetWidth, targetHeight, transparentIndex) {
  const entry = assets.entries.get(pakPath);
  if (!entry) throw new Error(`Missing Quake qpic ${pakPath}.`);
  const width = assets.pak.readInt32LE(entry.offset);
  const height = assets.pak.readInt32LE(entry.offset + 4);
  const dataOffset = entry.offset + 8;
  drawIndexedImage(
    rgba,
    assets.palette,
    assets.pak,
    dataOffset,
    width,
    height,
    x,
    y,
    targetWidth,
    targetHeight,
    transparentIndex,
  );
}

function drawIndexedImage(
  rgba,
  palette,
  indexed,
  dataOffset,
  width,
  height,
  x,
  y,
  targetWidth,
  targetHeight,
  transparentIndex,
) {
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const colorIndex = indexed.readUInt8(dataOffset + row * width + col);
      if (transparentIndex !== undefined && colorIndex === transparentIndex) continue;
      setIndexedPixel(rgba, targetWidth, targetHeight, palette, x + col, y + row, colorIndex);
    }
  }
}

function drawPakQpicCrop(
  rgba,
  assets,
  pakPath,
  sourceX,
  sourceY,
  sourceWidth,
  sourceHeight,
  x,
  y,
  targetWidth,
  targetHeight,
  transparentIndex,
) {
  const entry = assets.entries.get(pakPath);
  if (!entry) throw new Error(`Missing Quake qpic ${pakPath}.`);
  const width = assets.pak.readInt32LE(entry.offset);
  const height = assets.pak.readInt32LE(entry.offset + 4);
  const dataOffset = entry.offset + 8;
  const maxX = Math.min(width, sourceX + sourceWidth);
  const maxY = Math.min(height, sourceY + sourceHeight);
  for (let row = sourceY; row < maxY; row++) {
    for (let col = sourceX; col < maxX; col++) {
      const colorIndex = assets.pak.readUInt8(dataOffset + row * width + col);
      if (transparentIndex !== undefined && colorIndex === transparentIndex) continue;
      setIndexedPixel(
        rgba,
        targetWidth,
        targetHeight,
        assets.palette,
        x + col - sourceX,
        y + row - sourceY,
        colorIndex,
      );
    }
  }
}

function tileWadQpic(rgba, assets, name, x, y, width, height) {
  const lump = assets.lumps.get(name);
  if (!lump || lump.type !== 66) throw new Error(`Missing Quake qpic ${name}.`);
  const sourceWidth = assets.wad.readInt32LE(lump.filepos);
  const sourceHeight = assets.wad.readInt32LE(lump.filepos + 4);
  for (let row = y; row < y + height; row += sourceHeight) {
    for (let col = x; col < x + width; col += sourceWidth) {
      drawWadQpicTo(rgba, assets, name, col, row, QUAKE_ABOUT_WIDTH, QUAKE_ABOUT_HEIGHT);
    }
  }
}

function drawPakBox(rgba, assets, x, y, width, height) {
  fillIndexedRect(rgba, QUAKE_ABOUT_WIDTH, QUAKE_ABOUT_HEIGHT, assets.palette, x + 8, y + 8, width - 16, height - 16, 0, 156);
  drawPakQpic(rgba, assets, "gfx/box_tl.lmp", x, y, QUAKE_ABOUT_WIDTH, QUAKE_ABOUT_HEIGHT, QUAKE_HUD_TRANSPARENT);
  drawPakQpic(rgba, assets, "gfx/box_tr.lmp", x + width - 8, y, QUAKE_ABOUT_WIDTH, QUAKE_ABOUT_HEIGHT, QUAKE_HUD_TRANSPARENT);
  drawPakQpic(rgba, assets, "gfx/box_bl.lmp", x, y + height - 8, QUAKE_ABOUT_WIDTH, QUAKE_ABOUT_HEIGHT, QUAKE_HUD_TRANSPARENT);
  drawPakQpic(rgba, assets, "gfx/box_br.lmp", x + width - 8, y + height - 8, QUAKE_ABOUT_WIDTH, QUAKE_ABOUT_HEIGHT, QUAKE_HUD_TRANSPARENT);

  for (let col = x + 8; col < x + width - 8; col += 16) {
    drawPakQpic(rgba, assets, "gfx/box_tm.lmp", col, y, QUAKE_ABOUT_WIDTH, QUAKE_ABOUT_HEIGHT, QUAKE_HUD_TRANSPARENT);
    drawPakQpic(rgba, assets, "gfx/box_bm.lmp", col, y + height - 8, QUAKE_ABOUT_WIDTH, QUAKE_ABOUT_HEIGHT, QUAKE_HUD_TRANSPARENT);
  }

  for (let row = y + 8; row < y + height - 8; row += 8) {
    drawPakQpic(rgba, assets, "gfx/box_ml.lmp", x, row, QUAKE_ABOUT_WIDTH, QUAKE_ABOUT_HEIGHT, QUAKE_HUD_TRANSPARENT);
    drawPakQpic(rgba, assets, "gfx/box_mr.lmp", x + width - 8, row, QUAKE_ABOUT_WIDTH, QUAKE_ABOUT_HEIGHT, QUAKE_HUD_TRANSPARENT);
  }
}

function drawConcharsCentered(rgba, assets, text, y, alt) {
  drawConcharsText(rgba, assets, text, Math.round((QUAKE_ABOUT_WIDTH - text.length * 8) / 2), y, alt);
}

function drawConcharsText(rgba, assets, text, x, y, alt) {
  let cursorX = x;
  for (const char of text) {
    if (char !== " ") drawConchar(rgba, assets, char, cursorX, y, alt);
    cursorX += 8;
  }
}

function drawConcharsTextScaled(rgba, assets, text, x, y, alt, scale, targetWidth, targetHeight) {
  let cursorX = x;
  for (const char of text) {
    if (char !== " ") drawConcharScaled(rgba, assets, char, cursorX, y, alt, scale, targetWidth, targetHeight);
    cursorX += 8 * scale;
  }
}

function drawConchar(rgba, assets, char, x, y, alt) {
  drawConcharScaled(rgba, assets, char, x, y, alt, 1, QUAKE_ABOUT_WIDTH, QUAKE_ABOUT_HEIGHT);
}

function drawConcharScaled(rgba, assets, char, x, y, alt, scale, targetWidth, targetHeight) {
  const lump = assets.lumps.get("conchars");
  if (!lump || lump.type !== 68) throw new Error("Missing Quake CONCHARS.");
  const glyph = (char.charCodeAt(0) & 127) + (alt ? 128 : 0);
  const sourceX = (glyph & 15) * 8;
  const sourceY = (glyph >> 4) * 8;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const colorIndex = assets.wad.readUInt8(lump.filepos + (sourceY + row) * 128 + sourceX + col);
      if (colorIndex === 0) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          setIndexedPixel(
            rgba,
            targetWidth,
            targetHeight,
            assets.palette,
            x + col * scale + dx,
            y + row * scale + dy,
            colorIndex,
          );
        }
      }
    }
  }
}

function drawNumber(rgba, assets, x, y, value, digits) {
  const text = String(Math.trunc(value));
  const clipped = text.length > digits ? text.slice(text.length - digits) : text;
  let cursorX = x + Math.max(0, digits - clipped.length) * 24;
  for (const char of clipped) {
    const name = char === "-" ? "num_minus" : `num_${char}`;
    drawQpic(rgba, assets, name, cursorX, y, QUAKE_HUD_TRANSPARENT);
    cursorX += 24;
  }
}

function setIndexedPixel(rgba, width, height, palette, x, y, colorIndex) {
  if (x < 0 || x >= width || y < 0 || y >= height) return;
  const paletteOffset = colorIndex * 3;
  const imageOffset = (y * width + x) * 4;
  rgba[imageOffset] = palette[paletteOffset] ?? 0;
  rgba[imageOffset + 1] = palette[paletteOffset + 1] ?? 0;
  rgba[imageOffset + 2] = palette[paletteOffset + 2] ?? 0;
  rgba[imageOffset + 3] = 255;
}

function blendIndexedPixel(rgba, width, height, palette, x, y, colorIndex, alpha) {
  if (x < 0 || x >= width || y < 0 || y >= height) return;
  const paletteOffset = colorIndex * 3;
  const imageOffset = (y * width + x) * 4;
  const sourceAlpha = alpha / 255;
  rgba[imageOffset] = clampByte((palette[paletteOffset] ?? 0) * sourceAlpha + rgba[imageOffset] * (1 - sourceAlpha));
  rgba[imageOffset + 1] = clampByte((palette[paletteOffset + 1] ?? 0) * sourceAlpha + rgba[imageOffset + 1] * (1 - sourceAlpha));
  rgba[imageOffset + 2] = clampByte((palette[paletteOffset + 2] ?? 0) * sourceAlpha + rgba[imageOffset + 2] * (1 - sourceAlpha));
  rgba[imageOffset + 3] = 255;
}

function fillIndexedRect(rgba, width, height, palette, x, y, w, h, colorIndex, alpha = 255) {
  const minX = Math.max(0, x);
  const minY = Math.max(0, y);
  const maxX = Math.min(width, x + w);
  const maxY = Math.min(height, y + h);
  for (let row = minY; row < maxY; row++) {
    for (let col = minX; col < maxX; col++) {
      if (alpha >= 255) setIndexedPixel(rgba, width, height, palette, col, row, colorIndex);
      else blendIndexedPixel(rgba, width, height, palette, col, row, colorIndex, alpha);
    }
  }
}

function dimIndexedPixels(rgba, width, height, x, y, w, h, factor) {
  const minX = Math.max(0, x);
  const minY = Math.max(0, y);
  const maxX = Math.min(width, x + w);
  const maxY = Math.min(height, y + h);
  for (let row = minY; row < maxY; row++) {
    for (let col = minX; col < maxX; col++) {
      const offset = (row * width + col) * 4;
      if (rgba[offset + 3] === 0) continue;
      rgba[offset] = clampByte(rgba[offset] * factor);
      rgba[offset + 1] = clampByte(rgba[offset + 1] * factor);
      rgba[offset + 2] = clampByte(rgba[offset + 2] * factor);
    }
  }
}

function clearPixels(rgba, width, height, x, y, w, h) {
  const minX = Math.max(0, x);
  const minY = Math.max(0, y);
  const maxX = Math.min(width, x + w);
  const maxY = Math.min(height, y + h);
  for (let row = minY; row < maxY; row++) {
    for (let col = minX; col < maxX; col++) {
      rgba.fill(0, (row * width + col) * 4, (row * width + col) * 4 + 4);
    }
  }
}

function readFixedString(buffer, offset, length) {
  let out = "";
  for (let i = 0; i < length; i++) {
    const code = buffer[offset + i];
    if (code === 0) break;
    out += String.fromCharCode(code);
  }
  return out;
}

function readNullTerminatedString(buffer, offset) {
  let out = "";
  for (let i = offset; i < buffer.length; i++) {
    const code = buffer[i];
    if (code === 0) break;
    out += String.fromCharCode(code);
  }
  return out;
}

async function encodeTextureFileUrl(input) {
  const png = await encodeTexturePng(input);
  const hash = createHash("sha256").update(png).digest("hex");
  const cached = textureFileUrlByHash.get(hash);
  if (cached) return cached;
  const filename = `${hash}.png`;
  const url = `${quakeTexturePublicPath}/${filename}`;
  texturePngByPublicPath.set(url, png);
  textureFileUrlByHash.set(hash, url);
  return url;
}

async function quakeGlyphTextureSamplers(polygons) {
  const urls = [...new Set((polygons ?? [])
    .map((polygon) => polygon?.texture)
    .filter((url) => typeof url === "string" && url.length > 0))];
  const entries = await Promise.all(urls.map(async (url) => {
    const publicPath = url.split("?", 1)[0];
    let encoded = texturePngByPublicPath.get(url) ?? texturePngByPublicPath.get(publicPath);
    if (!encoded && publicPath.startsWith("/")) {
      try {
        encoded = await readFile(path.join(generatedPublicDir, publicPath.slice(1)));
      } catch {
        return null;
      }
    }
    if (!encoded) return null;
    const decoded = await sharp(encoded).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return [url, {
      width: decoded.info.width,
      height: decoded.info.height,
      data: decoded.data,
    }];
  }));
  return new Map(entries.filter(Boolean));
}

async function writeTextureFileIfMissing(outputPath, png) {
  try {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, png, { flag: "wx" });
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
}

async function encodeTexturePng({ width, height, pixels, palette, brightness, alpha, rgba: sourceRgba }) {
  if (sourceRgba) {
    return sharp(sourceRgba, {
      raw: { width, height, channels: 4 },
    }).png().toBuffer();
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < pixels.length; i++) {
    const paletteIndex = pixels[i] ?? 0;
    const [r, g, b] = paletteRgbAt(palette, paletteIndex);
    const light = paletteIndex >= 224 ? 1 : brightness;
    const offset = i * 4;
    rgba[offset] = clampByte(r * light);
    rgba[offset + 1] = clampByte(g * light);
    rgba[offset + 2] = clampByte(b * light);
    rgba[offset + 3] = alpha?.[i] ?? 255;
  }
  const png = await sharp(rgba, {
    raw: { width, height, channels: 4 },
  }).png().toBuffer();
  return png;
}

function paletteRgbAt(palette, paletteIndex) {
  const entry = palette[paletteIndex];
  if (Array.isArray(entry)) return entry;
  const offset = paletteIndex * 3;
  return [
    palette[offset] ?? 0,
    palette[offset + 1] ?? 0,
    palette[offset + 2] ?? 0,
  ];
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}
