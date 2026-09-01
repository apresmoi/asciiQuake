import type { Polygon, Vec3 } from "glyphcss";
import {
  createQuakeRenderEngine,
  type QuakeMeshHandle,
  type QuakeMeshSource,
  type QuakeRenderMode,
} from "./runtime/render/engine";
import { createQuakeGlyphUiOverlay, type QuakeGlyphUiOverlay } from "./runtime/render/glyphUiOverlay";
import { createQuakeMenuSceneManifest } from "./runtime/render/menuSceneManifest";
import {
  adaptQuakeUiDensitiesToDisplay,
  QUAKE_GLYPH_UI_TUNING_KNOBS,
  QUAKE_GLYPH_WEAPON_TUNING_KNOBS,
  QUAKE_GLYPH_WORLD_TUNING_KNOBS,
  readQuakeGlyphTuningValues,
  type QuakeGlyphTuningValues,
} from "./runtime/app/glyphTuningSpec";
import {
  asciiOnlyGlyphPaletteNames,
  QUAKE_ASCII_GLYPH_PALETTES,
  sanitizeQuakeGlyphCharMode,
  sanitizeQuakeGlyphPalette,
  sanitizeQuakeGlyphSceneMode,
} from "./runtime/app/asciiGlyphPolicy";
import { buildQuakeUiMeshStyles } from "./runtime/app/quakeUiMeshStyles";
import { getQuakeMenuSceneState, updateQuakeMenuSceneState, updateQuakeMenuSceneTexts } from "./runtime/menuSceneState";
import { GLYPH_FONT_ATLAS_ASCII } from "glyphcss";
import {
  createQuakeGlyphWorldOverlay,
  createQuakeGlyphWeaponOverlay,
  QUAKE_GLYPH_OVERLAY_CELL_PX,
  type QuakeGlyphColorEncoding,
  type QuakeGlyphWeaponOverlay,
  type QuakeGlyphWorldOverlay,
} from "./runtime/render/glyphWorldOverlay";
import { QUAKE_RENDER_SUPERSAMPLE } from "./prepare/scene";
import type {
  QuakeEntity,
  QuakeEntityManifestPoint,
  QuakeScene,
  QuakeVertex,
} from "./types/quake";
import { QUAKE_PLAYER_WEAPON_FIRE_FACTS } from "./generated/quakeProgramFacts";
import { createQuakeSoundController, type QuakeSoundEvent } from "./runtime/audio";
import { QUAKE_ALIAS_MODEL_RENDER_YAW_OFFSET } from "./runtime/aliasModelOrientation";
import { mountQuakeBitmapText, setQuakeBitmapTextAsCharacters } from "./runtime/bitmapText";
import {
  QUAKE_COLLISION_UNIT_SCALE,
  QUAKE_PLAYER_MINS_Z,
  QUAKE_PLAYER_VIEW_Z,
  STEP_HEIGHT,
} from "./runtime/constants";
import {
  QUAKE_PMOVE_BACK_SPEED,
  QUAKE_PMOVE_DT_CLAMP,
  QUAKE_PMOVE_FORWARD_SPEED,
  QUAKE_PMOVE_SIDE_SPEED,
  QUAKE_PMOVE_SPEED_KEY_MULTIPLIER,
} from "./runtime/playerPhysics";
import {
  type QuakeCollisionWorld,
  type QuakeTouchedTrigger,
} from "./runtime/collision";
import { isQuakeDebugHooksEnabled } from "./runtime/debug/quakeDebug";
import { createQuakeDebugRecorder } from "./runtime/debug/recording";
import { markQuakeTrace } from "./runtime/debug/traceMarks";
import {
  quakeEntityNumber,
  shouldSpawnQuakeEntityForCurrentGame,
  shouldSpawnQuakeEntityForGameMode,
} from "./runtime/entities";
import {
  applyQuakeInventoryDelta,
  changeQuakeInventoryWeaponByImpulse,
  createQuakeHudElements,
  quakeWeaponForImpulse,
  selectQuakeBestInventoryWeapon,
  type QuakeKey,
  type QuakeWeaponId,
} from "./runtime/hud";
import {
  quakeContentsDamageForWaterLevel,
  quakeContentsIsLiquid,
  quakePlayerWaterLevel,
  type QuakeHazardDamage,
} from "./runtime/hazards";
import {
  QUAKE_LOADING_CONSOLE_PAK_LINE,
  type QuakeLoadingProgressTracker,
  setQuakeLoadingRendererLine,
} from "./runtime/loadingConsole";
import { createQuakeAppRuntimeContext } from "./runtime/app/context";
import {
  addQuakeBodyClasses,
  hasQuakeBodyClass,
  queryQuakeAppDom,
  removeQuakeBodyClasses,
  setQuakeBodyClass,
} from "./runtime/app/dom";
import { createQuakeMultiplayerMenuForm } from "./runtime/app/multiplayerMenuForm";
import {
  createQuakeCameraFeedbackFlow,
  quakeCameraForwardDirection as forwardDirection,
  type QuakeCameraFeedbackFlow,
  type QuakeRenderCameraOriginPolicy,
} from "./runtime/app/cameraFeedbackFlow";
import {
  createQuakeCameraViewFlow,
  quakeInitialCameraViewConfig,
} from "./runtime/app/cameraViewFlow";
import { createQuakeDebugFlyController } from "./runtime/app/debugFly";
import { installQuakeAppDebugApi } from "./runtime/app/debugApi";
import { createQuakeDebugPanelFlow } from "./runtime/app/debugPanelFlow";
import { createQuakeDebugRecordingSnapshotFlow } from "./runtime/app/debugRecordingSnapshotFlow";
import { createQuakeEntityMeshMountFlow } from "./runtime/app/entityMeshMountFlow";
import { createQuakeHudFlow } from "./runtime/app/hudFlow";
import { createQuakeIntermissionFlow } from "./runtime/app/intermissionFlow";
import {
  createQuakeLevelStatsFlow,
  quakeLevelStatsTotalsForEntities,
} from "./runtime/app/levelStatsFlow";
import { createQuakeAppInputController } from "./runtime/app/input";
import { createQuakeGameplayInputFlow } from "./runtime/app/gameplayInputFlow";
import {
  createQuakeEffectSpriteFlow,
  type QuakeEffectSpriteFlow,
} from "./runtime/app/effectSpriteFlow";
import {
  createQuakeImpactParticleFlow,
  type QuakeImpactParticleFlow,
} from "./runtime/app/impactParticleFlow";
import { createQuakeDamageableBrushFlow } from "./runtime/app/damageableBrushFlow";
import { createQuakePowerupFlow } from "./runtime/app/powerupFlow";
import { createQuakeRouteFlow, type QuakeCssView } from "./runtime/app/routeFlow";
import { createQuakeOptionsFlow } from "./runtime/app/optionsFlow";
import { createQuakeLoadingFlow } from "./runtime/app/loadingFlow";
import { createQuakeAssetWarmupFlow } from "./runtime/app/assetWarmupFlow";
import { createQuakeAssetCatalogFlow } from "./runtime/app/assetCatalogFlow";
import { createQuakeStatsOverlayFlow, type QuakeStatsOverlayFlow } from "./runtime/app/statsOverlayFlow";
import { createQuakeSceneMountFlow } from "./runtime/app/sceneMountFlow";
import {
  createQuakeMoverInteractionFlow,
  type QuakeMoverInteractionFlow,
} from "./runtime/app/moverInteractionFlow";
import {
  createQuakeTextPresentationFlow,
  type QuakeTextPresentationFlow,
} from "./runtime/app/textPresentationFlow";
import { createQuakeViewmodelAssetFlow } from "./runtime/app/viewmodelAssetFlow";
import {
  createQuakeWeaponPresentationFlow,
  type QuakeWeaponPresentationFlow,
} from "./runtime/app/weaponPresentationFlow";
import { createQuakeSoundManifestFlow } from "./runtime/app/soundManifestFlow";
import {
  createQuakeCrosshairInteractionFlow,
  type QuakeCrosshairInteractionFlow,
} from "./runtime/app/crosshairInteractionFlow";
import {
  createQuakeEntityActivationFlow,
  type QuakeEntityActivationFlow,
} from "./runtime/app/entityActivationFlow";
import {
  createQuakePlayerLifecycleFlow,
  type QuakePlayerLifecycleFlow,
} from "./runtime/app/playerLifecycleFlow";
import { createQuakePointerGameplayFlow } from "./runtime/app/pointerGameplayFlow";
import {
  QUAKE_ASSET_ROOT,
  QuakeAssetsRegeneratingError,
  createQuakeAppMapLoader,
  fetchQuakeAssetManifest,
  fetchQuakeScene,
  type QuakeAssetManifest,
  type QuakeMapLoadOptions,
  type QuakeSceneMode,
} from "./runtime/app/session";
import { createQuakePointHazardFlow } from "./runtime/app/pointHazardFlow";
import {
  createQuakeLoopbackMultiplayerSession,
  createQuakeMultiplayerCompactInviteValue,
  createQuakeMultiplayerEnvelope,
  createQuakePartySocketMultiplayerSession,
  createQuakeMultiplayerRoomIdFromToken,
  createQuakeMultiplayerRemotePlayerPresenter,
  createQuakeNoopMultiplayerSession,
  decideQuakeMultiplayerLocalCorrection,
  normalizeQuakePartySocketHost,
  parseQuakeMultiplayerCompactInviteParts,
  QUAKE_MULTIPLAYER_COMPACT_MAP_CODE_CAPACITY,
  QUAKE_MULTIPLAYER_COMPACT_MAP_CODE_LENGTH,
  QUAKE_MULTIPLAYER_DEFAULT_CLIENT_MESSAGE_INTERVAL_MS,
  QUAKE_MULTIPLAYER_DEFAULT_REGION,
  QUAKE_MULTIPLAYER_MAX_INPUT_BATCH_SIZE,
  QUAKE_MULTIPLAYER_ROOM_TOKEN_ALPHABET,
  QUAKE_MULTIPLAYER_ROOM_TOKEN_LENGTH,
  QUAKE_MULTIPLAYER_ROOM_TOKEN_PATTERN,
  QUAKE_MULTIPLAYER_MAX_PLAYERS_CAP,
  quakeMultiplayerDeathmatchSpawnOrder,
  quakeMultiplayerDeathmatchWeaponDamage,
  quakeMultiplayerGameplayDefinitionsFromScene,
  quakeMultiplayerPlayerFacesTrigger,
  quakeMultiplayerWorldDefinitionsFromScene,
  type QuakeMultiplayerAuthoritativePickupState,
  type QuakeMultiplayerAuthoritativePlayerState,
  type QuakeMultiplayerInventoryState,
  type QuakeMultiplayerLocalInputIntent,
  type QuakeMultiplayerPickupDefinition,
  type QuakeMultiplayerPlayerPresenceStatus,
  type QuakeMultiplayerProjectileState,
  type QuakeMultiplayerRemoteInterpolationState,
  type QuakeMultiplayerRemoteVisualHandle,
  type QuakeMultiplayerRoomCompatibilityKey,
  type QuakeMultiplayerRoomErrorPayload,
  type QuakeMultiplayerRoomEnvelope,
  type QuakeMultiplayerRoomMatchState,
  type QuakeMultiplayerRoomRejectPayload,
  type QuakeMultiplayerSharedWorldEvent,
  type QuakeMultiplayerWorldDefinition,
  type QuakeMultiplayerWorldIntent,
} from "./runtime/multiplayer";
import { createQuakeMenuController } from "./runtime/menu";
import { createQuakeMoversController } from "./runtime/movers";
import { requestQuakeLandscapeOnMobile } from "./runtime/orientation";
import { createQuakeMonsterStateRunner } from "./runtime/quakeMonsterStateRunner";
import {
  normalizeQuakeUrlAngle,
  quakeUrlRouteIsDirect,
  quakeUrlRouteShouldNormalize,
  type QuakeUrlRoute,
  type QuakeUrlUpdateMode,
  type QuakeUrlView,
} from "./runtime/routeState";
import {
  createQuakePointerTracer,
  quakePointerEventTargetLabel as quakeEventTargetLabel,
  quakePointerUserActivationDetails as quakeUserActivationTraceDetails,
  type QuakePointerTraceDetails,
} from "./runtime/pointerTrace";
import {
  createQuakeShootablesController,
  type QuakeShootablesDebugStats,
  type QuakeShootablesPlayerClearanceOptions,
} from "./runtime/shootables";
import type { QuakeModelFrameSetMotionMaterialOptions } from "./runtime/modelMesh";
import { createCssQuakeSaveSession } from "./runtime/app/saveSession";
import { createQuakeTargetsController } from "./runtime/targets";
import { createQuakeTextController } from "./runtime/text";
import { createQuakeTriggersController } from "./runtime/triggers";
import {
  createQuakeViewmodelController,
  type QuakeViewmodelModel,
} from "./runtime/viewmodel";
import {
  createQuakeWeaponsController,
  quakeProjectileRenderYaw,
  quakeWeaponProjectileModelPath,
  type QuakeWeaponFireEvent,
  type QuakeWeaponFireSoundId,
  type QuakeWeaponShootableTarget,
  type QuakeWeaponWallImpactEffect,
  type QuakeWeaponProjectileVisualHandle,
} from "./runtime/weapons";
import {
  createQuakeWorldController,
} from "./runtime/world";
import {
  createQuakePickupController,
  quakeCanPickupForInventory,
  quakePickupEffectForEntity,
  quakePickupMessageForEntity,
  quakePickupModelFrameSet,
  type QuakePickupEffect,
  type QuakePickupModel,
  type QuakePickupModelAnimationFrame,
  type QuakePickupModelLibrary,
  type QuakeProgramMetadata,
} from "./runtime/pickups";
import {
  createQuakePlayerController,
  type QuakePlayerDeathDetails,
} from "./runtime/player";
import {
  mountQuakeModelFrameSetMesh,
  mountQuakeModelMesh,
  setQuakeModelFrameSetHandleFrame,
  type QuakeModelFrameSet,
} from "./runtime/modelMesh";

declare const __ASCIIQUAKE_VERSION__: string;

const QUAKE_DEBUG_PANEL_STATS_MS = 250;
const QUAKE_DOOR_MESSAGE_COOLDOWN_MS = 2000;
const quakeDom = queryQuakeAppDom();
const {
  app: quakeApp,
  game: quakeGame,
  interfaceLayer: quakeInterface,
  scene: quakeSceneRoot,
  weapon,
  impactParticlesLayer,
  hud: quakeHud,
  bonusOverlay,
  damageOverlay,
  intermission: quakeIntermissionRoot,
} = quakeDom;
const quakeMultiplayerMenuForm = createQuakeMultiplayerMenuForm(quakeInterface);
const {
  nameInput: multiplayerNameInput,
  colorInput: multiplayerColorInput,
  mapSelect: multiplayerMapSelect,
  fragLimitInput: multiplayerFragLimitInput,
  maxPlayersInput: multiplayerMaxPlayersInput,
} = quakeMultiplayerMenuForm;
// Deleted with the HTML shell — typed nulls/empties keep the guarded debug
// code paths compiling until those tools grow scene-drawn equivalents.
const classicHud: HTMLElement | null = null;
const debugRecordingButton: HTMLButtonElement | null = null;
const debugRecordingRow: HTMLElement | null = null;
const debugFlyModeOption: HTMLInputElement | null = null;
const debugStatElements = new Map<string, HTMLElement>();
const quakeText = createQuakeTextController();
const quakeIntermission = createQuakeIntermissionFlow({
  onBackdropVisibilityChange: (visible) => {
    quakeInterface.classList.toggle("quake-intermission-visible", visible);
  },
  renderBitmapText: mountQuakeBitmapText,
  root: quakeIntermissionRoot,
});
const quakeLevelStats = createQuakeLevelStatsFlow();
// No HUD DOM exists: the glyph scene draws the status bar from the scene
// state (emitHudScene); null sources keep hud.ts's sync a data-only push.
const hudElements = createQuakeHudElements({
  root: null,
  armor: null,
  health: null,
  healthDamage: null,
  ammo: null,
});
const QUAKE_LOADING_PREVIEW_ENABLED = import.meta.env.DEV && new URLSearchParams(window.location.search).has("loading");

const QUAKE_PAUSED_TIMER_POLL_MS = 100;

function createQuakeRuntimeRandomSalt(): number {
  const seedOverride = new URLSearchParams(window.location.search).get("rngSeed")?.trim();
  if (seedOverride) {
    const parsed = Number(seedOverride);
    if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 0xffffffff) return parsed >>> 0;
  }
  try {
    const values = new Uint32Array(1);
    globalThis.crypto?.getRandomValues(values);
    if (values[0] !== 0) return values[0] >>> 0;
  } catch (error) {
    markQuakeTrace("runtime-random-salt-fallback", {
      reason: error instanceof Error ? error.message : String(error),
    });
  }
  const fallback = Math.floor(Math.random() * 0x100000000) >>> 0;
  return fallback === 0 ? 0x9e3779b9 : fallback;
}

function quakeUrlBoolean(name: string): boolean {
  const rawValue = new URLSearchParams(window.location.search).get(name);
  if (rawValue === null) return false;
  return quakeFeatureFlagEnabled(rawValue, true);
}

function quakeFeatureFlagEnabled(rawValue: string | undefined, emptyEnabled = false): boolean {
  if (rawValue === undefined) return false;
  const normalized = rawValue.trim().toLowerCase();
  if (normalized === "") return emptyEnabled;
  return normalized === "1" || normalized === "true" || normalized === "on" || normalized === "yes";
}

function quakeUrlNumberParam(
  params: URLSearchParams,
  name: string,
  min: number,
  max: number,
): number | null {
  const rawValue = params.get(name);
  if (rawValue === null) return null;
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return null;
  return Math.max(min, Math.min(max, value));
}

/** Parse `?glyphView=eyeX,eyeY,eyeZ,rotX,rotY` into a fixed glyph camera. */
function quakeParseGlyphView(
  raw: string | null,
): readonly [number, number, number, number, number] | null {
  if (!raw) return null;
  const parts = raw.split(",").map((p) => Number(p.trim()));
  if (parts.length !== 5 || parts.some((n) => !Number.isFinite(n))) return null;
  return [parts[0]!, parts[1]!, parts[2]!, parts[3]!, parts[4]!];
}

function quakeDebugMonsterMotionMaterialPolicy(
  params: URLSearchParams,
): QuakeModelFrameSetMotionMaterialOptions | null {
  if (!import.meta.env.DEV) return null;
  const mode = params.get("debugMonsterMaterial")?.trim().toLowerCase();
  if (!mode || mode === "0" || mode === "false" || mode === "off") return null;
  const policy: QuakeModelFrameSetMotionMaterialOptions = {};
  const ratioOverride = quakeUrlNumberParam(params, "debugMonsterMaterialTextureRatio", 0, 1);
  if (ratioOverride !== null) {
    policy.texturedAreaRatio = ratioOverride;
  } else if (mode === "tail50") {
    policy.texturedAreaRatio = 0.5;
  } else if (mode === "solid") {
    policy.texturedAreaRatio = 0;
  } else {
    policy.texturedAreaRatio = 0.25;
  }
  const restoreDelayMs = quakeUrlNumberParam(params, "debugMonsterMaterialDelayMs", 0, 5000);
  if (restoreDelayMs !== null) policy.restoreDelayMs = restoreDelayMs;
  const restoreChunkIntervalMs = quakeUrlNumberParam(params, "debugMonsterMaterialChunkMs", 0, 1000);
  if (restoreChunkIntervalMs !== null) policy.restoreChunkIntervalMs = restoreChunkIntervalMs;
  return policy;
}

function quakeDebugMonsterPlayerClearancePolicy(
  params: URLSearchParams,
): QuakeShootablesPlayerClearanceOptions | null {
  if (!import.meta.env.DEV) return null;
  const mode = params.get("debugMonsterClearance")?.trim().toLowerCase();
  if (!mode || mode === "0" || mode === "false" || mode === "off") return null;
  const classnames = quakeDebugMonsterPlayerClearanceClassnames(params, mode);
  if (!classnames.length) return null;
  const extraUnits = quakeUrlNumberParam(params, "debugMonsterClearanceUnits", 0, 256) ?? 64;
  return {
    enemyClassnames: classnames,
    extraRadius: extraUnits * QUAKE_COLLISION_UNIT_SCALE,
    useBossAwakeBounds: mode !== "model" && mode !== "boss-model",
  };
}

function quakeDebugMonsterPlayerClearanceClassnames(params: URLSearchParams, mode: string): string[] {
  const explicit = params.get("debugMonsterClearanceClassnames") ??
    params.get("debugMonsterClearanceClasses") ??
    "";
  const explicitClassnames = explicit
    .split(",")
    .map((value) => value.trim())
    .filter((value) => /^monster_[a-z0-9_]+$/i.test(value));
  if (explicitClassnames.length) return [...new Set(explicitClassnames)];
  if (mode === "boss" || mode.startsWith("boss-")) return ["monster_boss"];
  if (mode === "large" || mode === "hull2") return ["monster_ogre", "monster_demon1", "monster_shambler"];
  const aliases: Record<string, string> = {
    demon: "monster_demon1",
    dog: "monster_dog",
    knight: "monster_knight",
    ogre: "monster_ogre",
    shambler: "monster_shambler",
    soldier: "monster_army",
    wizard: "monster_wizard",
    zombie: "monster_zombie",
  };
  if (aliases[mode]) return [aliases[mode]];
  return /^monster_[a-z0-9_]+$/i.test(mode) ? [mode] : [];
}

function quakeDebugMonsterCameraStandoffPolicy(
  params: URLSearchParams,
): QuakeRenderCameraOriginPolicy | null {
  if (!import.meta.env.DEV) return null;
  const mode = params.get("debugMonsterCameraStandoff")?.trim().toLowerCase();
  if (!mode || mode === "0" || mode === "false" || mode === "off") return null;
  const classnames = quakeDebugMonsterClassnamesForMode(
    params,
    mode,
    "debugMonsterCameraStandoffClassnames",
    "debugMonsterCameraStandoffClasses",
  );
  if (!classnames.length) return null;
  const extraUnits = quakeUrlNumberParam(params, "debugMonsterCameraStandoffUnits", 0, 256) ?? 64;
  window.__cssQuakeDebugDomMetadata = true;
  return (origin, rotX, rotY) => quakeDebugMonsterCameraStandoffOrigin(
    origin,
    rotX,
    rotY,
    classnames,
    extraUnits,
  );
}

function quakeDebugMonsterClassnamesForMode(
  params: URLSearchParams,
  mode: string,
  explicitClassnamesKey: string,
  explicitClassesKey: string,
): string[] {
  const explicit = params.get(explicitClassnamesKey) ?? params.get(explicitClassesKey) ?? "";
  const explicitClassnames = explicit
    .split(",")
    .map((value) => value.trim())
    .filter((value) => /^monster_[a-z0-9_]+$/i.test(value));
  if (explicitClassnames.length) return [...new Set(explicitClassnames)];
  if (mode === "boss" || mode.startsWith("boss-")) return ["monster_boss"];
  if (mode === "large" || mode === "hull2") return ["monster_ogre", "monster_demon1", "monster_shambler"];
  const aliases: Record<string, string> = {
    demon: "monster_demon1",
    dog: "monster_dog",
    knight: "monster_knight",
    ogre: "monster_ogre",
    shambler: "monster_shambler",
    soldier: "monster_army",
    wizard: "monster_wizard",
    zombie: "monster_zombie",
  };
  if (aliases[mode]) return [aliases[mode]];
  return /^monster_[a-z0-9_]+$/i.test(mode) ? [mode] : [];
}

function quakeDebugMonsterCameraStandoffOrigin(
  origin: Vec3,
  rotX: number,
  rotY: number,
  classnames: readonly string[],
  extraUnits: number,
): Vec3 {
  const candidate = quakeDebugMonsterCameraStandoffCandidate(origin, rotX, rotY, classnames, extraUnits);
  if (!candidate) return origin;
  if (!quakeDebugMonsterCameraStandoffCandidateValid(origin, candidate.origin)) {
    markQuakeTrace("camera-standoff-blocked", {
      class: candidate.classname,
      distance: candidate.distance,
      entity: candidate.entityIndex,
      target: candidate.targetDistance,
    });
    return origin;
  }
  markQuakeTrace("camera-standoff-apply", {
    class: candidate.classname,
    distance: candidate.distance,
    dx: candidate.origin[0] - origin[0],
    dy: candidate.origin[1] - origin[1],
    entity: candidate.entityIndex,
    target: candidate.targetDistance,
  });
  return candidate.origin;
}

function quakeDebugMonsterCameraStandoffCandidate(
  origin: Vec3,
  rotX: number,
  rotY: number,
  classnames: readonly string[],
  extraUnits: number,
): {
  classname: string;
  distance: number;
  entityIndex: number | null;
  origin: Vec3;
  targetDistance: number;
} | null {
  let best: {
    classname: string;
    distance: number;
    entityIndex: number | null;
    origin: Vec3;
    pressure: number;
    targetDistance: number;
  } | null = null;
  const classSet = new Set(classnames);
  for (const target of shootables.weaponTargets()) {
    const classname = target.entity.classname;
    if (!classSet.has(classname)) continue;
    const enemyOrigin = target.origin;
    const targetDistance = quakeDebugMonsterCameraStandoffDistance(classname, extraUnits);
    const dx = origin[0] - enemyOrigin[0];
    const dy = origin[1] - enemyOrigin[1];
    const distance = Math.hypot(dx, dy);
    const pressure = targetDistance - distance;
    if (pressure <= 0.001) continue;
    const away = distance > 0.0001
      ? [dx / distance, dy / distance]
      : quakeDebugMonsterCameraStandoffFallbackAway(rotX, rotY);
    const candidate: Vec3 = [
      enemyOrigin[0] + away[0] * targetDistance,
      enemyOrigin[1] + away[1] * targetDistance,
      origin[2],
    ];
    if (!best || pressure > best.pressure) {
      best = {
        classname,
        distance,
        entityIndex: target.entity.index,
        origin: candidate,
        pressure,
        targetDistance,
      };
    }
  }
  return best;
}

function quakeDebugMonsterCameraStandoffDistance(classname: string, extraUnits: number): number {
  return (quakeDebugMonsterCameraStandoffBaseUnits(classname) + extraUnits) * QUAKE_COLLISION_UNIT_SCALE;
}

function quakeDebugMonsterCameraStandoffBaseUnits(classname: string): number {
  if (classname === "monster_boss") return 144;
  if (
    classname === "monster_ogre" ||
    classname === "monster_demon1" ||
    classname === "monster_shambler" ||
    classname === "monster_dog"
  ) {
    return 48;
  }
  return 32;
}

function quakeDebugMonsterCameraStandoffFallbackAway(rotX: number, rotY: number): [number, number] {
  const forward = forwardDirection(rotX, rotY);
  const length = Math.hypot(forward[0], forward[1]);
  return length > 0.0001 ? [-forward[0] / length, -forward[1] / length] : [1, 0];
}

function quakeDebugMonsterCameraStandoffCandidateValid(origin: Vec3, candidate: Vec3): boolean {
  if (!currentCollisionWorld) return false;
  if (currentCollisionWorld.contentsAt?.(candidate) === QUAKE_CONTENTS_SOLID) return false;
  const trace = currentCollisionWorld.traceUse?.(origin, candidate);
  if (trace && trace.fraction < 0.999) return false;
  const originLeaf = world.leafIndexAt(origin);
  const candidateLeaf = world.leafIndexAt(candidate);
  return originLeaf === null || candidateLeaf === null || originLeaf === candidateLeaf;
}

function createQuakeMultiplayerLocalClientId(): string {
  const override = new URLSearchParams(window.location.search).get("clientId")?.trim();
  if (override) return `client-${override.replace(/[^a-z0-9_-]/gi, "").slice(0, 32) || "debug"}`;
  const key = "cssquake.multiplayer.clientId";
  try {
    const existing = window.sessionStorage.getItem(key)?.trim();
    if (existing) return existing;
    const next = createQuakeMultiplayerClientId();
    window.sessionStorage.setItem(key, next);
    return next;
  } catch {
    return createQuakeMultiplayerClientId();
  }
}

function createQuakeMultiplayerClientId(): string {
  try {
    const values = new Uint32Array(2);
    globalThis.crypto?.getRandomValues(values);
    if (values[0] || values[1]) {
      return `client-${values[0].toString(36)}${values[1].toString(36)}`;
    }
  } catch {
    // Fall through to Math.random for debug-only transport identity.
  }
  return `client-${Math.random().toString(36).slice(2, 12)}`;
}

function quakeStorageValue(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setQuakeStorageValue(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage is optional; URL state still carries multiplayer identity.
  }
}

/** Default ASCII cell budget — the cap "Normal" holds to on ANY window size.
 *  20k keeps p95 inside the 16.7ms frame budget at 2560x1440 (measured: 42k
 *  cells there pushed p95 to 33ms). Fine/Ultra deliberately exceed it; they are
 *  an explicit "I want more detail and will pay for it" choice. */
const QUAKE_GLYPH_CELL_BUDGET = 20_000;

/** Measured cell width as a fraction of the `<pre>` font size: glyphcss's own
 *  `.glyph-output{font:13px/1}` makes the cell HEIGHT equal the font size, and a
 *  monospace advance is ~0.6x that. Verified against the live grid — cell 12 at
 *  1280x720 measures 176x60, i.e. 7.27px x 12px. */
const QUAKE_GLYPH_CELL_ASPECT = 0.606;

/** The budget the player is currently on. A resize re-derives the px from THIS,
 *  which is the whole point of budgeting: the frame cost stays put when the
 *  window changes instead of quietly scaling with its area. */
let quakeGlyphDetailBudget: number = QUAKE_GLYPH_CELL_BUDGET;

/** `?glyphCell=` pins a literal px and opts out of budgeting (and of the resize
 *  re-fit) — it exists so a bug report can pin an exact grid. A function, not a
 *  const: this block sits above `quakeStartupUrlParams` so the overlay can be
 *  constructed with a budgeted cell, and reading it eagerly here is a TDZ error. */
function quakeGlyphCellIsPinned(): boolean {
  return quakeUrlNumberParam(quakeStartupUrlParams, "glyphCell", 6, 40) !== null;
}

/** Cell size in px that lands closest to `cells` total cells in the current
 *  viewport. From `cells = (W*H) / (aspect * px^2)`, solved for px. */
function quakeGlyphCellForBudget(cells: number): number {
  const host = quakeApp?.getBoundingClientRect();
  const width = host?.width || window.innerWidth || 1280;
  const height = host?.height || window.innerHeight || 720;
  const px = Math.sqrt((width * height) / (QUAKE_GLYPH_CELL_ASPECT * Math.max(1, cells)));
  return Math.max(6, Math.min(40, Math.round(px)));
}


const QUAKE_GLYPH_PALETTE_STORAGE_KEY = "cssquake.glyphPalette";

// Glyph sets (glyphcss ramp palettes) offered in the options menu, in cycle
// order. Each is an intensity ramp, so swapping one is a live scene option —
// no reload, unlike the render-mode/detail switches which rebuild the engine.
// ASCII-ONLY by policy (see asciiGlyphPolicy.ts): the list lives there and is
// filtered through the same checker the URL/storage sanitizer uses, so the
// menu can never cycle onto a Unicode ramp.
const QUAKE_GLYPH_PALETTES = QUAKE_ASCII_GLYPH_PALETTES;

// `?glyphPalette=` wins (shareable/debug), then the persisted choice, then the
// world's shipped default. Both sources pass through the ASCII-only sanitizer:
// a non-ASCII or unknown palette (an old persisted "solid"/"blocks" choice, a
// hand-typed URL) logs and falls back instead of rendering Unicode.
//
// The world defaults to the `dense` ramp (2026-08 lighting retune): its
// 25-37% ink floor carries each cell's energy through COVERAGE, which is what
// let the world tone drop from the old ink-overdriving brighten 6.5 — see
// QUAKE_GLYPH_WORLD_TUNING_KNOBS. An explicit user choice (menu/URL) wins.
const QUAKE_WORLD_GLYPH_PALETTE_DEFAULT = "dense";
function resolveQuakeGlyphPalette(): string {
  const requested =
    new URLSearchParams(window.location.search).get("glyphPalette") ??
    quakeStorageValue(QUAKE_GLYPH_PALETTE_STORAGE_KEY);
  return requested ? sanitizeQuakeGlyphPalette(requested) : QUAKE_WORLD_GLYPH_PALETTE_DEFAULT;
}

function sanitizeQuakeMultiplayerDisplayName(value: string | null | undefined): string {
  const name = (value ?? "").trim().replace(/\s+/g, " ").slice(0, 16);
  return name || "Player";
}

function defaultQuakeMultiplayerDisplayName(clientId: string): string {
  const suffix = clientId.replace(/^client-/i, "").replace(/[^a-z0-9]/gi, "").slice(-4).toUpperCase();
  return suffix ? `Player ${suffix}` : "Player";
}

function sanitizeQuakeMultiplayerRoomId(value: string | null | undefined): string {
  const roomId = (value ?? "").trim().replace(/[^a-z0-9_-]/gi, "").slice(0, 32);
  return /^cssquake-[a-z0-9]+$/i.test(roomId) ? "" : roomId;
}

function sanitizeQuakeMultiplayerColor(value: string | null | undefined): string {
  const color = (value ?? "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "#d8893f";
}

function sanitizeQuakeMultiplayerInteger(
  value: string | null | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number.parseInt((value ?? "").trim(), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function defaultQuakeMultiplayerPartyHost(): string {
  const configuredHost = normalizeQuakePartySocketHost(
    (import.meta.env as { VITE_CSSQUAKE_PARTY_HOST?: string }).VITE_CSSQUAKE_PARTY_HOST,
  );
  if (configuredHost) return configuredHost;
  return normalizeQuakePartySocketHost(import.meta.env.DEV ? "localhost:1999" : window.location.host) ??
    window.location.host;
}

const asciiQuakeVersionLabel = `v${__ASCIIQUAKE_VERSION__}`;
const QUAKE_LOADING_CONSOLE_INITIALIZED_LINE = `=== asciiQuake ${asciiQuakeVersionLabel} initialized ===`;

// Drawn by the glyph overlay beside the logo (quakeMenuVersionPos).
updateQuakeMenuSceneTexts({ version: asciiQuakeVersionLabel });

const QUAKE_JUMP_VELOCITY = 270 * QUAKE_COLLISION_UNIT_SCALE;
const QUAKE_GRAVITY = 800 * QUAKE_COLLISION_UNIT_SCALE;
const QUAKE_CONTENTS_SOLID = -2;
const QUAKE_MOBILE_MOVE_SPEED = 5.4 * QUAKE_RENDER_SUPERSAMPLE;
const QUAKE_DEBUG_FLY_SPEED = 10.8 * QUAKE_RENDER_SUPERSAMPLE;
const QUAKE_DEBUG_FLY_FAST_MULTIPLIER = 3;
const QUAKE_DEBUG_FLY_DT_CLAMP = 0.05;
const quakeCameraViewConfig = quakeInitialCameraViewConfig(QUAKE_RENDER_SUPERSAMPLE);
const QUAKE_MENU_ENABLED = true;
const QUAKE_MONSTER_RUNTIME_ENABLED = true;
const QUAKE_MONSTER_MOUNT_VIEW_DOT_MIN = -0.1;
const quakeStartupUrlParams = new URLSearchParams(window.location.search);
const quakeRenderMode: QuakeRenderMode = "glyphcss";
// The ASCII backend draws bitmap text as real characters rather than conchars
// sprite slices — set before any bitmap text is built.
setQuakeBitmapTextAsCharacters(true);
setQuakeLoadingRendererLine(quakeRenderMode);
const quakeDebugMonsterMotionMaterial = quakeDebugMonsterMotionMaterialPolicy(quakeStartupUrlParams);
const quakeDebugMonsterPlayerClearance = quakeDebugMonsterPlayerClearancePolicy(quakeStartupUrlParams);
const quakeDebugMonsterCameraStandoff = quakeDebugMonsterCameraStandoffPolicy(quakeStartupUrlParams);
const quakeAssetCatalog = createQuakeAssetCatalogFlow();
let quakeEnemiesDisabled = quakeUrlBoolean("disableEnemies");
let quakeDamageDisabled = quakeUrlBoolean("disableDamage");
let quakeEnemiesFrozen = quakeUrlBoolean("freezeEnemies");
let quakeAttacksDisabled = quakeUrlBoolean("disableAttacks");
const quakeDebugPointerTraceConsole = quakeUrlBoolean("debugPointer");
const quakeDebugRecordingPanelEnabled = quakeUrlBoolean("debugRecording");
const quakeInitialDebugFlyMode = quakeUrlBoolean("debugFly");
if (debugRecordingRow) debugRecordingRow.hidden = !quakeDebugRecordingPanelEnabled;
const quakeMultiplayerCompactInvite = parseQuakeMultiplayerCompactInvite(
  quakeStartupUrlParams.get("room"),
  quakeMultiplayerMapNameForCompactMapCode,
);
const quakeDebugMultiplayerMode = quakeStartupUrlParams.get("debugMultiplayer");
const quakeMultiplayerMode = quakeStartupUrlParams.get("multiplayer") ?? (quakeMultiplayerCompactInvite ? "party" : null);
const QUAKE_MULTIPLAYER_DEBUG_REQUESTED = import.meta.env.DEV && quakeDebugMultiplayerMode !== null;
const QUAKE_MULTIPLAYER_DEBUG_HOOKS_ENABLED = isQuakeDebugHooksEnabled();
const QUAKE_MULTIPLAYER_ENABLED = quakeMultiplayerMode !== null || QUAKE_MULTIPLAYER_DEBUG_REQUESTED;
const QUAKE_MULTIPLAYER_MENU_ENABLED = true;
const QUAKE_MULTIPLAYER_DEBUG_POSE_ONLY = QUAKE_MULTIPLAYER_DEBUG_HOOKS_ENABLED &&
  quakeUrlBoolean("debugMultiplayerPoseOnly");
const QUAKE_MULTIPLAYER_DEBUG_INPUT_PAUSED = QUAKE_MULTIPLAYER_DEBUG_HOOKS_ENABLED &&
  quakeUrlBoolean("debugMultiplayerInputPaused");
const QUAKE_MULTIPLAYER_DEFAULT_FRAG_LIMIT = 20;
const QUAKE_MULTIPLAYER_DEFAULT_MAX_PLAYERS = QUAKE_MULTIPLAYER_MAX_PLAYERS_CAP;
const QUAKE_MULTIPLAYER_TRANSPORT =
  quakeMultiplayerMode === "loopback" ||
    (quakeMultiplayerMode === null && QUAKE_MULTIPLAYER_DEBUG_REQUESTED && quakeDebugMultiplayerMode !== "party")
    ? "loopback"
    : "party";
const quakeMultiplayerPartyHostOverride = normalizeQuakePartySocketHost(quakeStartupUrlParams.get("partyHost"));
const QUAKE_MULTIPLAYER_PARTY_HOST = quakeMultiplayerPartyHostOverride ?? defaultQuakeMultiplayerPartyHost();
const QUAKE_MULTIPLAYER_REGION = QUAKE_MULTIPLAYER_DEFAULT_REGION;
const QUAKE_MULTIPLAYER_ROOM_ID = quakeMultiplayerCompactInvite?.roomId ??
  (QUAKE_MULTIPLAYER_DEBUG_REQUESTED ? sanitizeQuakeMultiplayerRoomId(quakeStartupUrlParams.get("room")) : "");
const QUAKE_MULTIPLAYER_LOCAL_CLIENT_ID = QUAKE_MULTIPLAYER_ENABLED
  ? createQuakeMultiplayerLocalClientId()
  : "local";
const QUAKE_MULTIPLAYER_LOCAL_DISPLAY_NAME = sanitizeQuakeMultiplayerDisplayName(
  quakeStartupUrlParams.get("player") ??
    quakeStorageValue("cssquake.multiplayer.name") ??
    defaultQuakeMultiplayerDisplayName(QUAKE_MULTIPLAYER_LOCAL_CLIENT_ID),
);
const QUAKE_MULTIPLAYER_LOCAL_COLOR = sanitizeQuakeMultiplayerColor(
  quakeStartupUrlParams.get("color") ?? quakeStorageValue("cssquake.multiplayer.color"),
);
const QUAKE_MULTIPLAYER_FRAG_LIMIT = sanitizeQuakeMultiplayerInteger(
  quakeStartupUrlParams.get("fraglimit"),
  QUAKE_MULTIPLAYER_DEFAULT_FRAG_LIMIT,
  1,
  100,
);
const QUAKE_MULTIPLAYER_MAX_PLAYERS = sanitizeQuakeMultiplayerInteger(
  quakeStartupUrlParams.get("maxPlayers"),
  QUAKE_MULTIPLAYER_DEFAULT_MAX_PLAYERS,
  2,
  QUAKE_MULTIPLAYER_MAX_PLAYERS_CAP,
);
const QUAKE_MULTIPLAYER_LOOPBACK_REMOTE_CLIENT_ID = "loopback-remote";
const QUAKE_MULTIPLAYER_LOOPBACK_REMOTE_PLAYER_ID = "loopback:remote";
const QUAKE_MULTIPLAYER_INPUT_SAMPLE_MS = 50;
const QUAKE_MULTIPLAYER_INPUT_MIN_SEND_MS = Math.max(
  QUAKE_MULTIPLAYER_INPUT_SAMPLE_MS,
  QUAKE_MULTIPLAYER_DEFAULT_CLIENT_MESSAGE_INTERVAL_MS["client.input"] ?? 0,
);
const QUAKE_MULTIPLAYER_POSE_SAMPLE_MS = 50;
const QUAKE_MULTIPLAYER_HARD_CORRECTION_DISTANCE = 4096 * QUAKE_COLLISION_UNIT_SCALE;
const QUAKE_MULTIPLAYER_SOFT_CORRECTION_DISTANCE = 2048 * QUAKE_COLLISION_UNIT_SCALE;
const QUAKE_MULTIPLAYER_MAX_BLEND_CORRECTION_DISTANCE = 64 * QUAKE_COLLISION_UNIT_SCALE;
const QUAKE_MULTIPLAYER_REMOTE_MODEL_PATHS = ["progs/player.mdl"] as const;
const QUAKE_MULTIPLAYER_DEFAULT_CREATE_MAP = "e1m7";
const QUAKE_MULTIPLAYER_REMOTE_DEFAULT_FRAME = "stand1";
const QUAKE_MULTIPLAYER_REMOTE_RUN_FRAME_PREFIX = "rockrun";
const QUAKE_MULTIPLAYER_REMOTE_PAIN_FRAME_PREFIX = "pain";
const QUAKE_MULTIPLAYER_REMOTE_DEATH_FRAME_PREFIX = "deatha";
const QUAKE_MULTIPLAYER_REMOTE_RUN_FPS = 10;
const QUAKE_MULTIPLAYER_REMOTE_ATTACK_FPS = 10;
const QUAKE_MULTIPLAYER_REMOTE_PAIN_FPS = 10;
const QUAKE_MULTIPLAYER_REMOTE_DEATH_FPS = 10;
const QUAKE_MULTIPLAYER_REMOTE_RUN_SPEED_THRESHOLD = QUAKE_PMOVE_FORWARD_SPEED * 0.1;
const QUAKE_MULTIPLAYER_REMOTE_PLAYER_EYE_HEIGHT = QUAKE_PLAYER_VIEW_Z - QUAKE_PLAYER_MINS_Z;
const QUAKE_MULTIPLAYER_REMOTE_MODEL_ROT_Y_OFFSET = 0;
const QUAKE_MULTIPLAYER_REMOTE_FALLBACK_ROT_Y_OFFSET = 45;
const QUAKE_MULTIPLAYER_REMOTE_ATTACK_FRAME_NAMES_BY_WEAPON: Record<string, readonly string[]> = {
  axe: ["axatt1", "axatt2", "axatt3", "axatt4"],
  shotgun: ["shotatt1", "shotatt2", "shotatt3", "shotatt4", "shotatt5", "shotatt6"],
  supershotgun: ["shotatt1", "shotatt2", "shotatt3", "shotatt4", "shotatt5", "shotatt6"],
  nailgun: ["nailatt1", "nailatt2"],
  supernailgun: ["nailatt1", "nailatt2"],
  grenadelauncher: ["rockatt1", "rockatt2", "rockatt3", "rockatt4", "rockatt5", "rockatt6"],
  rocketlauncher: ["rockatt1", "rockatt2", "rockatt3", "rockatt4", "rockatt5", "rockatt6"],
  lightning: ["light1", "light2"],
};
const quakeMultiplayerScoreboard = QUAKE_MULTIPLAYER_ENABLED && quakeHud
  ? mountQuakeMultiplayerScoreboard(quakeHud)
  : null;
let quakeInvertMouse = false;
let quakeAlwaysRun = true;
let quakeShowGun = true;
let quakeDynamicLighting = true;
let quakeImpactParticles = true;
let quakeMultiplayerSpectating = false;
let quakeMultiplayerSpectatorFollowedPlayerId: string | null = null;
let quakeMultiplayerSpectatorCenterPrint = "";
let quakeMultiplayerSpectatorCount = 0;

function quakeUrlRouteFromLocation(): QuakeUrlRoute {
  return quakeRoute.routeFromLocation();
}

function updateQuakeUrl(mapName: string, mode: QuakeUrlUpdateMode, view: QuakeCssView | null = null): void {
  quakeRoute.updateUrl(mapName, mode, view);
}

function clearQuakeGameRoute(): void {
  quakeRoute.clearGameRoute();
}

function clearQuakeDebugUrlParams(): void {
  quakeRoute.clearDebugUrlParams();
}

function quakeUrlFor(mapName: string, view: QuakeCssView | null = null): URL {
  return quakeRoute.urlFor(mapName, view);
}

function currentQuakeCssView(): QuakeCssView {
  const origin = controls.getOrigin();
  return {
    origin: [origin[0], origin[1], origin[2]],
    rotX: scene.camera.state.rotX ?? 88,
    rotY: scene.camera.state.rotY ?? 270,
  };
}

function shouldSpawnQuakeShootableForCurrentMode(entity: QuakeEntity): boolean {
  if (QUAKE_MULTIPLAYER_ENABLED && entity.classname.startsWith("monster_")) return false;
  return shouldSpawnQuakeEntityForCurrentMode(entity);
}

function shouldSpawnQuakePickupForCurrentMode(entity: QuakeEntity): boolean {
  return shouldSpawnQuakeEntityForCurrentMode(entity);
}

function shouldSpawnQuakeEntityForCurrentMode(entity: QuakeEntity): boolean {
  if (QUAKE_MULTIPLAYER_ENABLED) return shouldSpawnQuakeEntityForGameMode(entity, { deathmatch: true });
  return shouldSpawnQuakeEntityForCurrentGame(entity);
}

function quakeSceneModeForCurrentMode(): QuakeSceneMode {
  return QUAKE_MULTIPLAYER_ENABLED ? "deathmatch" : "singleplayer";
}

function quakeSceneUrlForCurrentMode(mapName: string): string | undefined {
  return quakeAssetCatalog.sceneUrl(mapName, quakeSceneModeForCurrentMode());
}

function currentQuakeViewUrl(): string {
  return quakeRoute.currentViewUrl();
}

async function copyCurrentQuakeViewUrl(): Promise<string> {
  const url = currentQuakeViewUrl();
  await navigator.clipboard?.writeText(url);
  return url;
}

function setQuakeAssetManifest(manifest: QuakeAssetManifest): void {
  quakeAssetCatalog.setManifest(manifest);
  mountQuakeMultiplayerMapSelector();
  menu.setCurrentLevel(currentMapName);
}

interface QuakeMultiplayerMenuState {
  mapName: string;
  roomId: string;
  displayName: string;
  color: string;
  fragLimit: number;
  maxPlayers: number;
}

interface QuakeMultiplayerRoomRejectRecord {
  code: QuakeMultiplayerRoomRejectPayload["code"];
  message: string;
  recoverable: boolean;
  rejectedMessageId?: string;
  retryAfterMs?: number;
  details?: Record<string, unknown>;
}

interface QuakeMultiplayerRoomErrorRecord {
  code: string;
  message: string;
  recoverable: boolean;
  details?: Record<string, unknown>;
}

function mountQuakeMultiplayerMapSelector(): void {
  if (!multiplayerMapSelect) return;
  const selectedMapName = multiplayerMapSelect.value || currentMapName;
  multiplayerMapSelect.replaceChildren();
  for (const level of quakeAssetCatalog.selectableLevels()) {
    const option = document.createElement("option");
    option.value = level.mapName;
    option.textContent = `${level.mapName.toUpperCase()} ${quakeAssetCatalog.mapTitle(level)}`;
    multiplayerMapSelect.append(option);
  }
  multiplayerMapSelect.value = quakeAssetCatalog.sceneUrl(selectedMapName) ? selectedMapName : currentMapName;
}

function quakeMultiplayerDefaultCreateMapName(): string {
  return quakeAssetCatalog.sceneUrl(QUAKE_MULTIPLAYER_DEFAULT_CREATE_MAP)
    ? QUAKE_MULTIPLAYER_DEFAULT_CREATE_MAP
    : currentMapName;
}

let quakeMultiplayerMenuInitialized = false;

function syncQuakeMultiplayerMenu(): void {
  mountQuakeMultiplayerMapSelector();
  if (quakeMultiplayerMenuInitialized) return;
  quakeMultiplayerMenuInitialized = true;
  if (multiplayerNameInput) multiplayerNameInput.value = QUAKE_MULTIPLAYER_LOCAL_DISPLAY_NAME;
  if (multiplayerColorInput) multiplayerColorInput.value = QUAKE_MULTIPLAYER_LOCAL_COLOR;
  if (multiplayerMapSelect) multiplayerMapSelect.value = quakeMultiplayerDefaultCreateMapName();
  if (multiplayerFragLimitInput) multiplayerFragLimitInput.value = String(QUAKE_MULTIPLAYER_FRAG_LIMIT);
  if (multiplayerMaxPlayersInput) multiplayerMaxPlayersInput.value = String(QUAKE_MULTIPLAYER_MAX_PLAYERS);
}

let quakeMultiplayerGeneratedMenuRoom: {
  mapName: string;
  roomId: string;
} | null = null;

function quakeMultiplayerMenuRoomId(
  mapName: string,
  forceNew: boolean,
): string {
  const staticRoomId = quakeMultiplayerStaticRoomIdForMap(mapName);
  if (
    !forceNew &&
    staticRoomId &&
    mapName === currentMapName
  ) {
    return staticRoomId;
  }
  if (
    !forceNew &&
    quakeMultiplayerGeneratedMenuRoom?.mapName === mapName
  ) {
    return quakeMultiplayerGeneratedMenuRoom.roomId;
  }
  const roomId = createQuakeMultiplayerRoomSlug(mapName);
  quakeMultiplayerGeneratedMenuRoom = { mapName, roomId };
  return roomId;
}

function readQuakeMultiplayerMenuState(createRoom: boolean): QuakeMultiplayerMenuState {
  const selectedMapName = multiplayerMapSelect?.value.trim().toLowerCase() ?? "";
  const mapName = selectedMapName && quakeAssetCatalog.mapExists(selectedMapName) ? selectedMapName : currentMapName;
  const roomId = quakeMultiplayerMenuRoomId(mapName, createRoom);
  return {
    mapName,
    roomId,
    displayName: sanitizeQuakeMultiplayerDisplayName(multiplayerNameInput?.value),
    color: sanitizeQuakeMultiplayerColor(multiplayerColorInput?.value),
    fragLimit: sanitizeQuakeMultiplayerInteger(
      multiplayerFragLimitInput?.value,
      QUAKE_MULTIPLAYER_DEFAULT_FRAG_LIMIT,
      1,
      100,
    ),
    maxPlayers: sanitizeQuakeMultiplayerInteger(
      multiplayerMaxPlayersInput?.value,
      QUAKE_MULTIPLAYER_DEFAULT_MAX_PLAYERS,
      2,
      QUAKE_MULTIPLAYER_MAX_PLAYERS_CAP,
    ),
  };
}

function createQuakeMultiplayerRoomSlug(mapName: string): string {
  const suffix = createQuakeMultiplayerRoomToken(QUAKE_MULTIPLAYER_ROOM_TOKEN_LENGTH);
  return sanitizeQuakeMultiplayerRoomId(createQuakeMultiplayerRoomIdFromToken(mapName, suffix)) ||
    `cssquake-${createQuakeMultiplayerRoomToken(QUAKE_MULTIPLAYER_ROOM_TOKEN_LENGTH + 2)}`;
}

function createQuakeMultiplayerRoomToken(length: number): string {
  try {
    const values = new Uint8Array(length);
    globalThis.crypto?.getRandomValues(values);
    if (values.some((value) => value !== 0)) {
      return Array.from(
        values,
        (value) => QUAKE_MULTIPLAYER_ROOM_TOKEN_ALPHABET[value % QUAKE_MULTIPLAYER_ROOM_TOKEN_ALPHABET.length],
      ).join("");
    }
  } catch {
    // Fall through to Math.random for menu-only invite token generation.
  }
  let token = "";
  for (let index = 0; index < length; index++) {
    token += QUAKE_MULTIPLAYER_ROOM_TOKEN_ALPHABET[
      Math.floor(Math.random() * QUAKE_MULTIPLAYER_ROOM_TOKEN_ALPHABET.length)
    ] ?? "q";
  }
  return token;
}

const quakeMultiplayerFallbackRoomIds = new Map<string, string>();

function quakeMultiplayerFallbackRoomId(mapName: string): string {
  const cached = quakeMultiplayerFallbackRoomIds.get(mapName);
  if (cached) return cached;
  const roomId = createQuakeMultiplayerRoomSlug(mapName);
  quakeMultiplayerFallbackRoomIds.set(mapName, roomId);
  return roomId;
}

function quakeMultiplayerStaticRoomIdForMap(mapName: string): string | null {
  if (!QUAKE_MULTIPLAYER_ROOM_ID) return null;
  const normalizedMapName = mapName.trim().toLowerCase();
  if (quakeMultiplayerCompactInvite && normalizedMapName !== quakeMultiplayerCompactInvite.mapName) return null;
  return QUAKE_MULTIPLAYER_ROOM_ID;
}

interface QuakeMultiplayerCompactInvite {
  mapName: string;
  roomId: string;
  token: string;
}

function parseQuakeMultiplayerCompactInvite(
  value: string | null | undefined,
  mapNameForInvite: (mapCode: string) => string | null,
): QuakeMultiplayerCompactInvite | null {
  const invite = parseQuakeMultiplayerCompactInviteParts(value);
  if (!invite) return null;
  const mapName = mapNameForInvite(invite.mapCode);
  if (!mapName || !quakeAssetCatalog.mapExists(mapName)) return null;
  const roomId = createQuakeMultiplayerRoomIdFromToken(mapName, invite.token);
  if (!roomId) return null;
  return {
    mapName,
    roomId,
    token: invite.token,
  };
}

function quakeMultiplayerCompactMapNames(): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const level of quakeAssetCatalog.selectableLevels()) {
    const mapName = level.mapName.trim().toLowerCase();
    if (!mapName || seen.has(mapName)) continue;
    seen.add(mapName);
    names.push(mapName);
  }
  return names.sort((a, b) => a.localeCompare(b));
}

function quakeMultiplayerMapCodeForMapName(mapName: string): string | null {
  const normalizedMapName = mapName.trim().toLowerCase();
  const mapIndex = quakeMultiplayerCompactMapNames().indexOf(normalizedMapName);
  if (mapIndex < 0 || mapIndex >= QUAKE_MULTIPLAYER_COMPACT_MAP_CODE_CAPACITY) return null;
  return mapIndex.toString(36).padStart(QUAKE_MULTIPLAYER_COMPACT_MAP_CODE_LENGTH, "0");
}

function quakeMultiplayerMapNameForCompactMapCode(mapCode: string): string | null {
  const mapIndex = Number.parseInt(mapCode, 36);
  if (!Number.isInteger(mapIndex) || mapIndex < 0 || mapIndex >= QUAKE_MULTIPLAYER_COMPACT_MAP_CODE_CAPACITY) {
    return null;
  }
  return quakeMultiplayerCompactMapNames()[mapIndex] ?? null;
}

function quakeMultiplayerMapNameForCompactInvite(inviteId: string): string | null {
  const invite = parseQuakeMultiplayerCompactInviteParts(inviteId);
  return invite ? quakeMultiplayerMapNameForCompactMapCode(invite.mapCode) : null;
}

function quakeMultiplayerCompactInviteForMenuState(state: QuakeMultiplayerMenuState): string {
  const mapCode = quakeMultiplayerMapCodeForMapName(state.mapName) ?? "00";
  const prefix = `cssquake-${QUAKE_MULTIPLAYER_REGION}-${state.mapName}-`;
  const token = state.roomId.startsWith(prefix) ? state.roomId.slice(prefix.length) : state.roomId;
  const safeToken = QUAKE_MULTIPLAYER_ROOM_TOKEN_PATTERN.test(token)
    ? token.toLowerCase()
    : createQuakeMultiplayerRoomToken(QUAKE_MULTIPLAYER_ROOM_TOKEN_LENGTH);
  return createQuakeMultiplayerCompactInviteValue(mapCode, safeToken) ??
    `${mapCode}${safeToken}au`;
}

function quakeMultiplayerUrlForMenuState(state: QuakeMultiplayerMenuState): URL {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("room", quakeMultiplayerCompactInviteForMenuState(state));
  return url;
}

function persistQuakeMultiplayerMenuState(state: QuakeMultiplayerMenuState): void {
  setQuakeStorageValue("cssquake.multiplayer.name", state.displayName);
  setQuakeStorageValue("cssquake.multiplayer.color", state.color);
}

function startQuakeMultiplayerFromMenu(): void {
  if (!QUAKE_MULTIPLAYER_MENU_ENABLED) return;
  const state = readQuakeMultiplayerMenuState(true);
  persistQuakeMultiplayerMenuState(state);
  const url = quakeMultiplayerUrlForMenuState(state);
  window.location.assign(url.toString());
}

const quakeRenderEngine = createQuakeRenderEngine(quakeRenderMode, quakeGame, {
  camera: {
    perspective: quakeCameraViewConfig.perspective,
    zoom: quakeCameraViewConfig.zoom,
    rotX: 88,
    rotY: 270,
    target: [0, 0, 1.72],
  },
});
const camera = quakeRenderEngine.camera;
const scene = quakeRenderEngine.scene;
const host = quakeRenderEngine.cameraEl;
if (quakeSceneRoot) {
  quakeSceneRoot.appendChild(host);
} else {
  quakeGame.insertBefore(host, weapon);
}
host.tabIndex = 0;

// Both glyph overlays encode against glyphcss's ASCII-only atlas variant:
// 94 printable-ASCII glyphs, which frees the shared PUA budget for 68 palette
// slots instead of the universal atlas's 30. The menus' desaturation and
// page-to-page colour shift were both 30-slot median-cut error; the world and
// UI here only ever emit `detail`-ramp ASCII, so the universal set's Greek/
// braille/box-drawing coverage bought nothing. `?glyphAtlas=universal` opts
// back into the universal atlas for comparison. Configs needing non-ASCII
// glyphs (braille charMode, exotic `?glyphPalette=`) fall back to the span
// encoder — the same fallback they already hit under the universal atlas.
const quakeGlyphFontAtlas = quakeStartupUrlParams.get("glyphAtlas") === "universal"
  ? undefined
  : GLYPH_FONT_ATLAS_ASCII;

// The tuning-panel knobs' startup values: URL param when present, shipped
// default otherwise — resolved through the same spec table the `?debug`
// tuning panel builds its sliders from (see glyphTuningSpec.ts).
const quakeWorldGlyphTuning = readQuakeGlyphTuningValues(QUAKE_GLYPH_WORLD_TUNING_KNOBS, quakeStartupUrlParams);
const quakeUiGlyphTuning = readQuakeGlyphTuningValues(QUAKE_GLYPH_UI_TUNING_KNOBS, quakeStartupUrlParams);
const quakeGlyphWeaponTuning = readQuakeGlyphTuningValues(QUAKE_GLYPH_WEAPON_TUNING_KNOBS, quakeStartupUrlParams);
// Viewport/DPR adaptation for the per-element densities (mobile fix,
// 2026-08): on displays whose base cell is smaller in DEVICE px than the
// 1600x900/DPR-2 tuning display, scale the un-pinned densities down so each
// detail cell keeps its approved device-pixel size (measured on an iPhone-14
// class viewport: plaque cells at 1.21 device px rendered as grey mush; the
// factor restores the approved 1.69). Desktop factor is exactly 1 — no
// change. The `?debug` panel then shows the ADAPTED values as its baseline;
// its per-knob reset restores the desktop literal (debug-only edge).
adaptQuakeUiDensitiesToDisplay(quakeUiGlyphTuning, quakeStartupUrlParams, {
  hostW: window.innerWidth || 1280,
  hostH: window.innerHeight || 720,
  dpr: window.devicePixelRatio || 1,
});
// UI (menu/console/HUD-art) scene ramp palette, `?glyphImagePalette=`.
// ASCII-only sanitized; mutable so the `?debug` panel's palette select can
// swap it live (the UI scene remounts per adjustment anyway).
let quakeUiGlyphPalette = sanitizeQuakeGlyphPalette(quakeStartupUrlParams.get("glyphImagePalette"));
// Corner-logo glyph ramp, `?glyphImageLogoPalette=` — the LOGO's own per-mesh
// palette (glyphcss per-mesh glyphPalette via the overlay's meshStyles),
// default "dense": the user-tuned logo look (glyph lab, 2026-08) alongside the
// logo tone knobs in glyphTuningSpec.ts. Same ASCII-only sanitizer as every
// other palette path; mutable so the `?debug` panel can swap it live. (The old
// DPR-based logo DENSITY lift is gone with the retune — see the spec's
// logoDensity entry: the tuned look is deliberately coarse on every display.)
const QUAKE_LOGO_PALETTE_DEFAULT = "dense";
let quakeUiLogoPalette = quakeStartupUrlParams.get("glyphImageLogoPalette")
  ? sanitizeQuakeGlyphPalette(quakeStartupUrlParams.get("glyphImageLogoPalette"))
  : QUAKE_LOGO_PALETTE_DEFAULT;
// The other per-element ramps (2026-08 retune): boot console, menu plaque,
// menu title, menu label sheet — all tuned to "dense" in the glyph lab, each
// overridable per element. Same ASCII-only sanitizer as every palette path.
const QUAKE_ELEMENT_PALETTE_DEFAULT = "dense";
function quakeElementPalette(param: string): string {
  const raw = quakeStartupUrlParams.get(param);
  return raw ? sanitizeQuakeGlyphPalette(raw) : QUAKE_ELEMENT_PALETTE_DEFAULT;
}
let quakeUiTextPalette = quakeElementPalette("glyphImageTextPalette");
let quakeUiPlaquePalette = quakeElementPalette("glyphImagePlaquePalette");
let quakeUiTitlePalette = quakeElementPalette("glyphImageTitlePalette");
let quakeUiLabelPalette = quakeElementPalette("glyphImageLabelPalette");
// The gameplay HUD's two ramps. The BAR is the one element in the scene whose
// job is to sit back, and "dense" is the wrong ramp for that: measured, the
// bar came back as a solid field of the ramp's heaviest glyphs. It draws on
// the scene's own "detail" ramp instead, which spends its steps on the
// midtones the bar texture actually lives in. The readouts keep "dense" —
// they want every step of coverage they can get.
let quakeUiHudBarPalette = quakeStartupUrlParams.get("glyphImageHudBarPalette")
  ? sanitizeQuakeGlyphPalette(quakeStartupUrlParams.get("glyphImageHudBarPalette"))
  : quakeUiGlyphPalette;
let quakeUiHudArtPalette = quakeElementPalette("glyphImageHudArtPalette");

// GlyphCSS is the renderer; gameplay feeds this retained ASCII scene directly.
const quakeGlyphOverlay: QuakeGlyphWorldOverlay = createQuakeGlyphWorldOverlay({
        host: quakeGame,
        fontAtlas: quakeGlyphFontAtlas,
        insertBefore: weapon,
        // Live-tunable, e.g. ?glyphCell=18&glyphTaa=0.6&ssaa=2&glyphBright=4
        supersample: quakeUrlNumberParam(quakeStartupUrlParams, "ssaa", 1, 4) ?? undefined,
        temporalBlend: quakeUrlNumberParam(quakeStartupUrlParams, "glyphTaa", 0, 0.9) ?? undefined,
        // Budgeted, not fixed: the cell is derived from the viewport so "Normal"
        // costs the same on a laptop and a 4K window. `?glyphCell=` pins the px.
        cellPx: quakeUrlNumberParam(quakeStartupUrlParams, "glyphCell", 6, 40)
          ?? quakeGlyphCellForBudget(quakeGlyphDetailBudget),
        lineHeight: quakeUrlNumberParam(quakeStartupUrlParams, "glyphLine", 4, 40) ?? undefined,
        // GlyphCSS inherits cssQuake's CSS-perspective camera units (zoom = CSS
        // px/unit, perspective = CSS px), so measured cell metrics preserve the
        // original projection without a second FOV conversion.
        perspective: quakeUrlNumberParam(quakeStartupUrlParams, "glyphPersp", 100, 40000) ?? quakeCameraViewConfig.perspective,
        pinPerspective: quakeUrlNumberParam(quakeStartupUrlParams, "glyphPersp", 100, 40000) !== null,
        zoom: quakeUrlNumberParam(quakeStartupUrlParams, "glyphZoom", 0.01, 500) ?? quakeCameraViewConfig.zoom,
        fovScale: quakeUrlNumberParam(quakeStartupUrlParams, "glyphFovScale", 0.1, 10) ?? undefined,
        flat: quakeWorldGlyphTuning.flat,
        brighten: quakeWorldGlyphTuning.brighten,
        // Hue-preserving tone lift after the brighten multiply (below 1 lifts
        // mids/darks, clip guard holds highlights). `?glyphGamma=`.
        gamma: quakeWorldGlyphTuning.gamma,
        // Levels on the tone curve's target luminance (dynamic-range stretch;
        // see the overlay option docs). `?glyphBlack=` / `?glyphWhite=`.
        blackPoint: quakeWorldGlyphTuning.black,
        whitePoint: quakeWorldGlyphTuning.white,
        // Sub-pixel glyph stroke — perceived-luminance coverage boost.
        // `?glyphStroke=` (0 disables).
        strokePx: quakeWorldGlyphTuning.stroke,
        ambientLight: quakeWorldGlyphTuning.ambient,
        directionalLight: quakeWorldGlyphTuning.dir,
        depthEpsilon: quakeUrlNumberParam(quakeStartupUrlParams, "glyphEps", 0, 0.1) ?? undefined,
        // Glyph ramp palette (intensity → char). Defaults to "blocks" (solid
        // block elements → walls read as surfaces, not letters).
        // ?glyphPalette=detail|dense|ascii to compare.
        glyphPalette: resolveQuakeGlyphPalette(),
        // Entity detail multiplier: pickups/weapon/enemies/projectiles render at
        // this × the world's glyph density in their own depth-occluded layer,
        // for crisp entities over a cheap coarse world. Detail-layer alignment
        // under the perspective camera is fixed (glyphcss b1e2bb6). 1 = off;
        // movers stay at world density. `?glyphEntityDensity=`.
        //
        // Default 3, lifted to 4 on high-DPI (2026-08, measured at the 9px world
        // cell): a NEAR soldier spans 19 detail cells across at the old default 2
        // — an unreadable blob — vs 28 at 3 (a recognisable soldier) and 38 at 4
        // (helmet/face/belt resolve). Cost is negligible (PERF_REPORT.md: density
        // 1→2 moved base-raster 2%; entities cover a small screen fraction). The
        // ceiling is glyph legibility, not the budget: at DPR 1 a density-4 cell
        // is 2.25 device px — at the ~2px floor where letterforms carry nothing
        // and the mesh reads as a gridded sprite — while density 3 (3 device px)
        // keeps ASCII glyphs visible, so DPR 1 stays at 3. At DPR 2 a density-4
        // cell is 4.5 device px and strictly sharper; near-entity definition kept
        // improving through 4 with no grey-out (the corner-logo regression regime
        // — sub-DEVICE-pixel cells — is never entered).
        // Lowered one step from 4/3 after the user reported gameplay lag. A static
        // pose could not reproduce it — densities 2/3/4 all sat vsync-locked at
        // ~62fps/16.2ms — but the cell count is real (87k/94k/104k at that pose),
        // and it bites in play, where many entities are visible at once and the
        // PVS churns. Definition still resolves at 3 (a near soldier is 28 cells
        // across vs 19 at density 2); `?glyphEntityDensity=` restores 4.
        entityDensity: quakeUrlNumberParam(quakeStartupUrlParams, "glyphEntityDensity", 1, 4) ??
          (window.devicePixelRatio >= 1.5 ? 3 : 2),
        // DEBUG: ?glyphEntityTransparent=1 drops entity occlusion (isolate placement
        // vs occlusion); ?glyphEntityOutline=1 boxes each detail layer.
        entityTransparent: quakeStartupUrlParams.get("glyphEntityTransparent") === "1",
        entityOutline: quakeStartupUrlParams.get("glyphEntityOutline") === "1",
        // BSP PVS cull: the glyph backend re-projects the whole map every frame,
        // so cull world polygons not in the player's potentially-visible set. The
        // eye is the same camera origin the visibility expects (controls.getOrigin).
        // `?glyphPvs=0` disables.
        pvsVisibleLeavesAt: quakeStartupUrlParams.get("glyphPvs") === "0"
          ? undefined
          : (eye) => currentResult?.visibility?.visibleLeavesAt(eye) ?? null,
        // Diagnostics: ?glyphDebug=1 shows a live eye/orientation readout;
        // ?glyphView=eyeX,eyeY,eyeZ,rotX,rotY freezes the camera there for an
        // exact, reproducible view (to pin a flicker spot to coordinates).
        debug: quakeStartupUrlParams.get("glyphDebug") === "1",
        fixedView: quakeParseGlyphView(quakeStartupUrlParams.get("glyphView")),
        // Cell character encoding, `?glyphCharMode=`. ASCII-only policy: the
        // sanitizer accepts "ascii" alone — glyphcss's braille (Unicode dot
        // patterns) and halfblock/quadrant (block elements) encodings are
        // rejected with a console warning (see asciiGlyphPolicy.ts).
        charMode: sanitizeQuakeGlyphCharMode(quakeStartupUrlParams.get("glyphCharMode")),
        // Scene render mode, `?glyphSceneMode=`. ASCII-only policy: "solid"
        // alone — wireframe/voxel emit box-drawing junctions, ink a fixed
        // non-ASCII oriented set (see asciiGlyphPolicy.ts).
        sceneMode: sanitizeQuakeGlyphSceneMode(quakeStartupUrlParams.get("glyphSceneMode")),
        // Colour-run merge tolerance (redmean 0..765, 0 = off): fewer <span>s per
        // row at the cost of colour fidelity. `?glyphColorTolerance=24`.
        colorTolerance: quakeUrlNumberParam(quakeStartupUrlParams, "glyphColorTolerance", 0, 765) ?? undefined,
        // Final-string encode strategy (glyphcss 0.1.4+). Default "atlas": a frame
        // is one text node of PUA code points painted by glyphcss's COLR/CPAL
        // colour font, instead of a <span> per colour run. `?glyphColorEncoding=spans`
        // restores the legacy span path for comparison.
        colorEncoding: ((e): QuakeGlyphColorEncoding | undefined =>
          e === "atlas" || e === "spans" ? e : undefined)(
          quakeStartupUrlParams.get("glyphColorEncoding"),
        ),
        // Hidden-line removal for wireframe/braille: `?glyphHiddenLines=show|hide`.
        hiddenLines: ((m): "show" | "hide" | undefined => (m === "show" || m === "hide" ? m : undefined))(
          quakeStartupUrlParams.get("glyphHiddenLines"),
        ),
      });

// Dedicated first-person weapon glyph scene. A near-field viewmodel cannot
// live in the world camera (glyphcss clips eyeDepth<=0; scale/reach cancel).
// This overlay mirrors the raster weapon stage's projection and is stacked
// over the world (inside #quake-weapon, z-index 2). The world overlay is
// untouched — pickups/enemies/movers still register there.
const quakeGlyphWeaponCellPinned = quakeUrlNumberParam(quakeStartupUrlParams, "glyphWeaponCell", 6, 40);
const quakeGlyphWeaponOverlay: QuakeGlyphWeaponOverlay = (() => {
        const hostEl = document.createElement("div");
        hostEl.style.cssText =
          "position:absolute;inset:0;pointer-events:none;overflow:hidden;background:transparent";
        weapon.appendChild(hostEl);
        return createQuakeGlyphWeaponOverlay({
          host: hostEl,
          fontAtlas: quakeGlyphFontAtlas,
          perspective: quakeUrlNumberParam(quakeStartupUrlParams, "glyphWeaponPersp", 100, 4000) ?? undefined,
          zoom: quakeUrlNumberParam(quakeStartupUrlParams, "glyphWeaponZoom", 0.01, 500)
            ?? quakeUrlNumberParam(quakeStartupUrlParams, "glyphZoom", 0.01, 500)
            ?? quakeCameraViewConfig.zoom,
          fovScale: quakeUrlNumberParam(quakeStartupUrlParams, "glyphWeaponFovScale", 0.1, 10) ?? undefined,
          cameraBackoffPx: quakeUrlNumberParam(quakeStartupUrlParams, "glyphWeaponBackoff", 0, 4000) ?? undefined,
          center: (() => {
            const x = quakeUrlNumberParam(quakeStartupUrlParams, "glyphWeaponCenterX", 0, 1);
            const y = quakeUrlNumberParam(quakeStartupUrlParams, "glyphWeaponCenterY", 0, 1);
            return x !== null && y !== null ? [x, y] as const : undefined;
          })(),
          cellPx: quakeGlyphWeaponCellPinned
            ?? quakeUrlNumberParam(quakeStartupUrlParams, "glyphCell", 6, 40)
            ?? quakeGlyphCellForBudget(quakeGlyphDetailBudget),
          lineHeight: quakeUrlNumberParam(quakeStartupUrlParams, "glyphLine", 4, 40) ?? undefined,
          glyphPalette: resolveQuakeGlyphPalette(),
          charMode: sanitizeQuakeGlyphCharMode(quakeStartupUrlParams.get("glyphCharMode")),
          sceneMode: sanitizeQuakeGlyphSceneMode(quakeStartupUrlParams.get("glyphSceneMode")),
          colorTolerance: quakeUrlNumberParam(quakeStartupUrlParams, "glyphColorTolerance", 0, 765) ?? undefined,
          colorEncoding: ((e): QuakeGlyphColorEncoding | undefined =>
            e === "atlas" || e === "spans" ? e : undefined)(
            quakeStartupUrlParams.get("glyphColorEncoding"),
          ),
          supersample: quakeUrlNumberParam(quakeStartupUrlParams, "ssaa", 1, 4) ?? undefined,
          brighten: quakeWorldGlyphTuning.brighten,
          gamma: quakeWorldGlyphTuning.gamma,
          blackPoint: quakeWorldGlyphTuning.black,
          whitePoint: quakeWorldGlyphTuning.white,
          strokePx: quakeWorldGlyphTuning.stroke,
          ambientLight: quakeWorldGlyphTuning.ambient,
          directionalLight: quakeWorldGlyphTuning.dir,
        });
      })();
if (quakeGlyphWeaponOverlay) {
  // Align the panel's live values with what we actually constructed (zoom
  // follows the world camera; cell follows the world grid unless pinned;
  // density follows entity density, which is 3 on high-DPI).
  quakeGlyphWeaponTuning.zoom = quakeUrlNumberParam(quakeStartupUrlParams, "glyphWeaponZoom", 0.01, 500)
    ?? quakeUrlNumberParam(quakeStartupUrlParams, "glyphZoom", 0.01, 500)
    ?? quakeCameraViewConfig.zoom;
  quakeGlyphWeaponTuning.cell = quakeGlyphWeaponCellPinned
    ?? quakeUrlNumberParam(quakeStartupUrlParams, "glyphCell", 6, 40)
    ?? quakeGlyphCellForBudget(quakeGlyphDetailBudget);
  quakeGlyphWeaponTuning.density = quakeUrlNumberParam(quakeStartupUrlParams, "glyphWeaponDensity", 1, 4)
    ?? quakeUrlNumberParam(quakeStartupUrlParams, "glyphEntityDensity", 1, 4)
    ?? (window.devicePixelRatio >= 1.5 ? 3 : 2);
}
let quakeApplyGlyphWeaponTuning: ((v: QuakeGlyphTuningValues) => void) | null = null;

// The menu's sprite art AND text rendered as ONE ASCII image: every sprite is a
// textured quad in a single glyphcss scene, layered along Z and composited by
// the rasterizer's depth test. The scene manifest below is ALSO the menu
// controller's hit-map, so it is created once and shared.
//
// The glyph UI scene is the only menu renderer.
const quakeMenuManifest = createQuakeMenuSceneManifest({
  density: quakeUiGlyphTuning.density,
  backdropBrightness: quakeUiGlyphTuning.backdrop,
  logoDensity: quakeUiGlyphTuning.logoDensity,
});
// A dedicated, always-present interface host. Keeping it out of temporary
// loading/menu elements prevents those elements' visibility from collapsing
// the in-game HUD and Esc menu scene.
const quakeGlyphUiHost = document.createElement("div");
quakeGlyphUiHost.id = "quake-glyph-ui-host";
quakeGlyphUiHost.setAttribute("aria-hidden", "true");
quakeGlyphUiHost.style.cssText = "position:absolute;inset:0;z-index:2;pointer-events:none;overflow:hidden";
quakeInterface.appendChild(quakeGlyphUiHost);

let quakeGlyphUiOverlayHandle: QuakeGlyphUiOverlay | null = null;
/**
 * (Re)create the UI glyph scene with a tuning-values record (keys =
 * glyphTuningSpec's UI knobs). Called once at startup with the URL-resolved
 * values; the `?debug` tuning panel calls it again per adjustment — the
 * overlay's options are baked at construction (tone caches, the pre-lifted
 * conchars sheet, manifest densities), so a full dispose+recreate IS the
 * live-update path, and the overlay was built to make that cheap.
 *
 * The overlay gets its OWN manifest instance per mount: `quakeMenuManifest`
 * above stays with the menu controller (hit-map identity), and both are pure
 * functions of the same layout constants, so the geometry cannot diverge —
 * only density/brightness differ.
 */
function mountQuakeGlyphUiOverlay(t: QuakeGlyphTuningValues): void {
  quakeGlyphUiOverlayHandle?.dispose();
  quakeGlyphUiOverlayHandle = createQuakeGlyphUiOverlay({
    host: quakeGlyphUiHost,
    // ONE occlusion domain across the stacked scenes: the UI scene
    // publishes its opaque coverage (Esc menu art, HUD, crosshair) after
    // every render, and both the world and the dedicated weapon scene
    // blank their cells under it — the same effect the landing gets from
    // backdrop + art sharing a scene.
    onCoverage: (coverage) => {
      quakeGlyphOverlay?.setUiOcclusion(coverage);
      quakeGlyphWeaponOverlay?.setUiOcclusion(coverage);
    },
    // The declarative menu scene: every screen, its text and the chrome
    // render from this manifest + the shared menu scene state. No DOM reads.
    menu: createQuakeMenuSceneManifest({
      density: t.density,
      backdropBrightness: t.backdrop,
      logoDensity: t.logoDensity,
      plaqueDensity: t.plaqueDensity,
      titleDensity: t.titleDensity,
      labelDensity: t.labelDensity,
    }),
    maxCells: t.maxCells,
    minCellPx: t.minCellPx,
    glyphPalette: quakeUiGlyphPalette,
    // ── The per-element style table (2026-08 retune, glyph lab) ──
    // One row per user-tuned element, keyed by its mesh styleTag. Each row
    // reproduces that element's approved LAB SESSION (see the spec's tone
    // groups): `ambient` reaches glyphcss as the mesh's own ambient light
    // (glyph choice tracks it exactly), and `colorBoost` replays the lab's
    // styled-branch residual — the lab composes colours ×(1.65/scene ambient)
    // over every sprite it previews, so an element tuned there at ambient A
    // was approved with colours ×max(1, 1.65/A). Sprite rows use it; the
    // console row doesn't (its lab path had no residual). Styled meshes also
    // opt OUT of occlusion (see QuakeGlyphMeshStyle.occlude): measured, the
    // opaque backdrop stole their partial-alpha cells at base-cell
    // granularity and eroded the art (corner logo: 215 of ~650 ink cells
    // survived; the lab keeps them all).
    // The table itself lives in quakeUiMeshStyles.ts, SHARED with the glyph
    // lab's "complete first screen" preview — the lab renders the exact rows
    // the game ships, never a copy. Palettes are the sanitized per-element
    // choices resolved above (ASCII-only policy).
    meshStyles: buildQuakeUiMeshStyles(t, {
      logo: quakeUiLogoPalette,
      text: quakeUiTextPalette,
      plaque: quakeUiPlaquePalette,
      title: quakeUiTitlePalette,
      labels: quakeUiLabelPalette,
      hudBar: quakeUiHudBarPalette,
      hudArt: quakeUiHudArtPalette,
    }),
    // Measured against the cssquake.wtf reference menu (perceived-luminance
    // region stats, 2026-08): 3.0 + the 0.6px glyph stroke + gamma 0.4 +
    // backdropGamma 0.6 lands the banner/plaque within ~70% of the
    // reference where the old 2.0/0.55/0.8 sat at ~35%. The earlier "3.0
    // clips the bronze" observation predates the gamma clip guard, which
    // now holds those channels. `?glyphImageAmbient=`.
    ambient: t.ambient,
    // Hue-preserving tone lift (below 1 brightens; see the overlay's `gamma`
    // doc). This carries the brightness the linear levers cannot: ambient
    // past ~2.4 clips the art's bright channels and washes the bronze grey,
    // while the curve spends its lift on the dark backdrop and midtones.
    gamma: t.gamma,
    // Art-layer vibrancy (see the overlay's `saturation` doc).
    // `?glyphImageSaturation=`.
    saturation: t.saturation,
    // Levels: dynamic-range stretch per layer group (see the overlay docs).
    // `?glyphImageBlack=`/`?glyphImageWhite=` (art),
    // `?glyphImageBackdropBlack=`/`?glyphImageBackdropWhite=` (backdrop).
    blackPoint: t.black,
    whitePoint: t.white,
    backdropBlackPoint: t.backdropBlack,
    backdropWhitePoint: t.backdropWhite,
    // The backdrop's own, MILDER curve. One shared curve lifted the dark
    // backdrop proportionally more than the art, which read as the
    // background sitting in front of the menu. 0.6 keeps the backdrop's
    // concrete texture visible (the reference backdrop reads ~50 perceived
    // luma) while the art's stronger lift + ink compensation stays ahead.
    // `?glyphImageBackdropGamma=`.
    backdropGamma: t.backdropGamma,
    colorEncoding: quakeStartupUrlParams.get("glyphImageEncoding") === "spans" ? "spans" : "atlas",
    fontAtlas: quakeGlyphFontAtlas,
    // The INTERMISSION card is the one surface still built as DOM (it is
    // gameplay-only and assembled at show time): its bitmap runs render as
    // conchars quads exactly as all menu text used to. Everything else is
    // manifest text now (see the overlay's emitManifestTexts).
    textArt: [{
      selector: "#quake-intermission .quake-bitmap-run",
      layer: 2,
      density: t.textDensity,
    }],
    // Manifest text shares the text density knob (`?glyphImageTextDensity=`);
    // the boot console alone can be pushed further (`?glyphImageConsoleDensity=`).
    manifestTextDensity: t.textDensity,
    consoleTextDensity: t.consoleDensity,
    // The gameplay HUD's own densities and the readouts' ground margin —
    // `?glyphImageHudBarDensity=`, `?glyphImageHudArtDensity=`,
    // `?glyphImageHudArtGround=` (see glyphTuningSpec's HUD groups).
    hudBarDensity: t.hudBarDensity,
    hudArtDensity: t.hudArtDensity,
    hudReadoutGroundTexels: t.hudArtGroundTexels,
    // Ink-coverage compensation strength for the art/text detail layers —
    // `?glyphImageInkComp=` (0 disables, 1 full). See the overlay option.
    inkCompensation: t.inkComp,
    // Sub-pixel glyph stroke — perceived-luminance coverage boost for the
    // whole UI scene. `?glyphImageStroke=` (0 disables).
    strokePx: t.stroke,
    // Text-only brightness and vibrancy — both applied once to the conchars
    // sheet the text quads sample, so neither can affect the art or backdrop.
    textGamma: t.textGamma,
    textSaturation: t.textSaturation,
    //
    // The LANDING screen, the backdrop and the corner logo are gone from
    // this list: they render from the scene manifest above. What remains is
    // the not-yet-migrated screens' art, still discovered by tracing.
    sprites: [
      // `?glyphImageDensity=` puts small art in its own higher-density detail
      // layer, and `segment: true` makes that layer OCCLUDE correctly: the
      // sprite is split into one tight quad per connected opaque region, so
      // glyphcss's occlusion id-map blanks the base grid only under the
      // artwork itself (the art sits on clean black, like a world entity)
      // while the backdrop keeps painting between the letterforms. Without
      // segment the quad is the sprite's whole rectangle — occluding punches
      // a black box around the art, so the overlay renders an unsegmented
      // density sprite `transparent` instead, and the bright backdrop then
      // leaks straight through the art's transparent texels.
      // The classic HUD renders from the scene state + hud.ts's slot table
      // now (see the overlay's emitHudScene) — no HUD sprite rules here.
      { selector: ".quake-intermission-value-glyph", layer: 2, fit: "css" },
      { selector: ".quake-glyph-pseudo", layer: 2, fit: "css", density: t.density, segment: true },
    ],
  });
}
mountQuakeGlyphUiOverlay(quakeUiGlyphTuning);

// ── `?debug` live tuning panel ───────────────────────────────────────────────
// A disposable, off-theme floating panel of sliders over every glyph tuning
// knob (see glyphTuningSpec.ts), for finding better defaults by eye. Gated on
// the URL param and loaded lazily so the normal path carries ZERO extra DOM
// and no module cost.
// Live select-values for the panel's palette dropdowns (mutated in place by
// the panel, read by each section's `apply`). ASCII-legal values only — both
// initial values are already sanitized, and `apply` re-sanitizes.
const quakeUiGlyphPanelSelects: Record<string, string> = {
  palette: quakeUiGlyphPalette,
  logoPalette: quakeUiLogoPalette,
  textPalette: quakeUiTextPalette,
  plaquePalette: quakeUiPlaquePalette,
  titlePalette: quakeUiTitlePalette,
  labelPalette: quakeUiLabelPalette,
};
const quakeWorldGlyphPanelSelects: Record<string, string> = {
  palette: quakeGlyphOverlay?.getGlyphPalette() ?? resolveQuakeGlyphPalette(),
};
if (quakeStartupUrlParams.has("debug")) {
  void import("./runtime/debug/glyphTuningPanel").then(({ installQuakeGlyphTuningPanel }) => {
    installQuakeGlyphTuningPanel([
      {
        title: "Menu / UI scene",
        knobs: QUAKE_GLYPH_UI_TUNING_KNOBS,
        values: quakeUiGlyphTuning,
        // Ramp palette dropdown — ASCII-legal palettes only (the policy
        // module enumerates them, so a non-ASCII glyphcss palette can never
        // appear here). `?glyphImagePalette=` pins it via "copy URL".
        selects: [{
          key: "palette",
          param: "glyphImagePalette",
          label: "ramp palette",
          options: asciiOnlyGlyphPaletteNames(),
          def: "detail",
        }, {
          key: "logoPalette",
          param: "glyphImageLogoPalette",
          label: "logo ramp palette",
          options: asciiOnlyGlyphPaletteNames(),
          def: QUAKE_LOGO_PALETTE_DEFAULT,
        }, {
          key: "textPalette",
          param: "glyphImageTextPalette",
          label: "text ramp palette",
          options: asciiOnlyGlyphPaletteNames(),
          def: QUAKE_ELEMENT_PALETTE_DEFAULT,
        }, {
          key: "plaquePalette",
          param: "glyphImagePlaquePalette",
          label: "plaque ramp palette",
          options: asciiOnlyGlyphPaletteNames(),
          def: QUAKE_ELEMENT_PALETTE_DEFAULT,
        }, {
          key: "titlePalette",
          param: "glyphImageTitlePalette",
          label: "title ramp palette",
          options: asciiOnlyGlyphPaletteNames(),
          def: QUAKE_ELEMENT_PALETTE_DEFAULT,
        }, {
          key: "labelPalette",
          param: "glyphImageLabelPalette",
          label: "label ramp palette",
          options: asciiOnlyGlyphPaletteNames(),
          def: QUAKE_ELEMENT_PALETTE_DEFAULT,
        }],
        selectValues: quakeUiGlyphPanelSelects,
        // Recreating the UI scene re-probes textures + re-segments art; keep
        // it off the slider's every input event.
        debounceMs: 180,
        apply: (v) => {
          quakeUiGlyphPalette = sanitizeQuakeGlyphPalette(quakeUiGlyphPanelSelects.palette);
          quakeUiLogoPalette = sanitizeQuakeGlyphPalette(quakeUiGlyphPanelSelects.logoPalette);
          quakeUiTextPalette = sanitizeQuakeGlyphPalette(quakeUiGlyphPanelSelects.textPalette);
          quakeUiPlaquePalette = sanitizeQuakeGlyphPalette(quakeUiGlyphPanelSelects.plaquePalette);
          quakeUiTitlePalette = sanitizeQuakeGlyphPalette(quakeUiGlyphPanelSelects.titlePalette);
          quakeUiLabelPalette = sanitizeQuakeGlyphPalette(quakeUiGlyphPanelSelects.labelPalette);
          mountQuakeGlyphUiOverlay(v);
        },
      },
      ...(quakeGlyphOverlay
        ? [{
            title: "World scene",
            knobs: QUAKE_GLYPH_WORLD_TUNING_KNOBS,
            values: { ...quakeWorldGlyphTuning, cell: quakeGlyphOverlay.getCellPx() },
            // Same ASCII-legal palette dropdown for the world's ramp.
            selects: [{
              key: "palette",
              param: "glyphPalette",
              label: "ramp palette",
              options: asciiOnlyGlyphPaletteNames(),
              def: QUAKE_WORLD_GLYPH_PALETTE_DEFAULT,
            }],
            selectValues: quakeWorldGlyphPanelSelects,
            // The world's budget-derived cell is the real default; the spec's
            // literal is only a fallback. Overriding keeps "copy URL" from
            // pinning a cell the user never touched.
            defaults: { cell: quakeGlyphOverlay.getCellPx() },
            debounceMs: 120,
            apply: (v: QuakeGlyphTuningValues) => {
              quakeGlyphOverlay.setGlyphPalette(
                sanitizeQuakeGlyphPalette(quakeWorldGlyphPanelSelects.palette),
              );
              quakeGlyphOverlay.setTuning({
                brighten: v.brighten,
                gamma: v.gamma,
                blackPoint: v.black,
                whitePoint: v.white,
                flat: v.flat,
                strokePx: v.stroke,
                ambientLight: v.ambient,
                directionalLight: v.dir,
              });
              quakeGlyphWeaponOverlay?.setTuning({
                brighten: v.brighten,
                gamma: v.gamma,
                blackPoint: v.black,
                whitePoint: v.white,
                strokePx: v.stroke,
                ambientLight: v.ambient,
                directionalLight: v.dir,
              });
              quakeGlyphOverlay.setCellPx(v.cell);
              if (quakeGlyphWeaponCellPinned === null) quakeGlyphWeaponOverlay?.setCellPx(v.cell);
            },
          }]
        : []),
      ...(quakeGlyphWeaponOverlay
        ? [{
            title: "Weapon stage",
            knobs: QUAKE_GLYPH_WEAPON_TUNING_KNOBS,
            values: quakeGlyphWeaponTuning,
            defaults: { ...quakeGlyphWeaponTuning },
            debounceMs: 120,
            apply: (v: QuakeGlyphTuningValues) => {
              quakeGlyphWeaponOverlay.setCellPx(v.cell);
              quakeGlyphWeaponOverlay.setProjection({ zoom: v.zoom });
              quakeApplyGlyphWeaponTuning?.(v);
            },
          }]
        : []),
    ]);
  });
}

// Teleport tracer (`?trace=<collector-origin>`): off unless the flag is present.
// Reports camera-path discontinuities over the LAN, because USB debugging kept
// dropping mid-session and a screenshot after the fact never shows the frames
// that caused the jump.
{
  const traceCollector = quakeStartupUrlParams.get("trace");
  if (traceCollector && quakeGlyphOverlay) {
    void import("./runtime/debug/jumpTrace").then(({ startQuakeJumpTrace }) => {
      startQuakeJumpTrace({
        collector: traceCollector,
        readEye: () => (quakeGlyphOverlay as unknown as { __debugEye?: () => number[] }).__debugEye?.() ?? null,
      });
    });
  }
}

setQuakeBodyClass("quake-glyph-render", true);

// Track which mover glyph entities are registered so we can clear stale ones on
// a scene change (entity id = `mover:<entityIndex>`).
let quakeGlyphMoverIds: string[] = [];
function syncQuakeGlyphOverlayGeometry(): void {
  if (!quakeGlyphOverlay) return;
  quakeGlyphOverlay.setGeometry(currentResult?.glyphGeometry ?? null);
  // Phase 4F: register each mover (door/plat/button) as a glyph entity at its
  // base (closed) position; applyState then drives its open/close offset.
  for (const id of quakeGlyphMoverIds) quakeGlyphOverlay.removeEntity(id);
  quakeGlyphMoverIds = [];
  for (const mover of currentResult?.glyphMovers?.movers ?? []) {
    const id = `mover:${mover.entityIndex}`;
    // Use the mover's CURRENT offset, not [0,0,0]: a mover can start displaced
    // (initialOffset — e.g. a plat/bridge that begins at the top), and this is
    // order-independent vs the mover controller's own init pass.
    const offset = movers?.get(mover.entityIndex)?.offset;
    const position: [number, number, number] = offset ? [offset[0], offset[1], offset[2]] : [0, 0, 0];
    quakeGlyphOverlay.setEntity(id, { polygons: mover.polygons }, { position, scale: 1, depthBias: QUAKE_MOVER_GLYPH_DEPTH_BIAS });
    quakeGlyphMoverIds.push(id);
  }
}
// Movers (doors/plats) sit flush in walls/floors, so they're coplanar with the
// static world. The GlyphCSS projection uses a depth buffer, so coplanar surfaces z-fight and the
// mover drops in patches. A tiny depth bias toward the camera makes the mover —
// the active surface — win those cells cleanly.
const QUAKE_MOVER_GLYPH_DEPTH_BIAS = 0.004;
function syncQuakeGlyphMoverOffset(entityIndex: number, offset: Vec3): void {
  quakeGlyphOverlay?.setEntityTransform(`mover:${entityIndex}`, {
    position: [offset[0], offset[1], offset[2]],
    scale: 1,
    depthBias: QUAKE_MOVER_GLYPH_DEPTH_BIAS,
  });
}
let quakeCameraFeedback!: QuakeCameraFeedbackFlow;
const quakeCameraView = createQuakeCameraViewFlow({
  cameraFeedback: () => quakeCameraFeedback,
  getPlayerOrigin: () => getPlayer().currentOrigin(),
  host,
  modelPivot: () => quakeModelPivot,
  playerEyeHeight: () => getPlayer().eyeHeight(),
  playerSpawn: (spawn) => getPlayer().spawn(spawn),
  renderSupersample: QUAKE_RENDER_SUPERSAMPLE,
  scene,
  setCameraLookEnabledBodyClass: (enabled) => setQuakeBodyClass("quake-camera-look-enabled", enabled),
  syncCrosshairTarget: syncQuakeCrosshairTarget,
  syncShootablesVisibility: (origin, force) => shootables.syncVisibility(origin, force),
  syncViewmodelTransform: () => viewmodel.syncTransform(),
  syncWorldVisibility: (force) => world.syncVisibility(force),
});
const quakeRemotePlayers = createQuakeMultiplayerRemotePlayerPresenter({
  localClientId: QUAKE_MULTIPLAYER_LOCAL_CLIENT_ID,
  createVisual: createQuakeRemotePlayerVisual,
  shouldRenderPlayer: (playerState) => playerState.playerId !== quakeMultiplayerSpectatorFollowedPlayerId,
  onPlayerDamaged: (event, playerState) => {
    spawnQuakeMultiplayerRemotePlayerBlood(event, playerState, event.damage);
  },
  onPlayerKilled: (event, playerState) => {
    spawnQuakeMultiplayerRemotePlayerBlood(
      event,
      playerState,
      quakeMultiplayerDeathmatchWeaponDamage(event.damageSource ?? ""),
    );
  },
  now: () => Date.now(),
});
interface QuakeRemoteMultiplayerProjectileVisual {
  handle: QuakeWeaponProjectileVisualHandle;
  ownerPlayerId: string;
  weapon: QuakeWeaponId;
}

const quakeRemoteMultiplayerProjectiles = new Map<string, QuakeRemoteMultiplayerProjectileVisual>();
const quakeLoopbackTrustedSceneMovement = {
  collisionWorld: {
    contentsAt: (point: Vec3) => currentCollisionWorld?.contentsAt?.(point) ?? null,
    floorAt: (x: number, y: number, maxZ?: number, minZ?: number) =>
      currentCollisionWorld?.floorAt(x, y, maxZ, minZ) ?? null,
    resolve: (
      origin: [number, number, number],
      previous: [number, number, number],
      eyeHeight: number,
      currentGroundZ: number,
      forceAir?: boolean,
    ) =>
      currentCollisionWorld?.resolve(origin, previous, eyeHeight, currentGroundZ, forceAir) ?? {
        origin,
        groundZ: currentGroundZ,
        grounded: false,
        touches: [],
      },
    traceUse: (start: Vec3, end: Vec3) => currentCollisionWorld?.traceUse?.(start, end) ?? null,
  },
  playerEyeHeight: QUAKE_PLAYER_VIEW_Z,
};
const quakeMultiplayerSession = QUAKE_MULTIPLAYER_ENABLED
  ? QUAKE_MULTIPLAYER_TRANSPORT === "party"
    ? createQuakePartySocketMultiplayerSession({
      host: QUAKE_MULTIPLAYER_PARTY_HOST,
      roomId: ({ roomKey }) => quakeMultiplayerRoomId(roomKey),
      now: () => Date.now(),
    })
    : createQuakeLoopbackMultiplayerSession({
        now: () => Date.now(),
        includeDefaultSimulatedPlayer: true,
        simulatedPlayers: quakeLoopbackSimulatedPlayers,
        trustedSceneMovement: quakeLoopbackTrustedSceneMovement,
        trustedWorldDefinitions: quakeLoopbackTrustedWorldDefinitions,
      })
  : createQuakeNoopMultiplayerSession();
const disposeQuakeMultiplayerMessages = quakeMultiplayerSession.subscribe((message) => {
  handleQuakeMultiplayerRoomMessage(message);
});
quakeCameraView.syncViewportProjection();
const controls = quakeRenderEngine.createControls({
  eyeHeight: 1.72,
  groundZ: 0,
  moveSpeed: QUAKE_MOBILE_MOVE_SPEED,
  lookSensitivity: 0.12,
  invertY: quakeInvertMouse,
  moveEnabled: false,
  jumpEnabled: false,
  crouchEnabled: false,
  jumpVelocity: QUAKE_JUMP_VELOCITY,
  gravity: 0,
});
quakeCameraView.setFirstPersonControlsMounted(true);
const updateQuakeControls = controls.update.bind(controls);
controls.update = (partial) => {
  updateQuakeControls(partial);
  if (partial.lookEnabled !== undefined) quakeCameraView.setLookEnabled(partial.lookEnabled);
  quakeCameraView.compactCameraInlineStyle();
};
quakeCameraView.compactCameraInlineStyle();

// Mirror the camera to the glyph overlay at the single chokepoint every camera
// update funnels through. The first-person controls call applyCamera() directly
// on locked mouse-look (bypassing the app's camera flow), so wrapping
// applyCamera is the only hook that catches both look and movement.
// The glyph weapon lives in a local screen-space scene, but bob/punch still
// need a live tick on camera updates (incl. direct mouse-look applyCamera).
// `viewmodel` is created later, so route through a mutable hook set after it
// exists.
let quakeGlyphSyncWeapon: (() => void) | null = null;
if (quakeGlyphOverlay) {
  const applyCamera = scene.applyCamera.bind(scene);
  const cameraState = scene.camera.state as { rotX?: number; rotY?: number; target?: Vec3 };
  scene.applyCamera = () => {
    applyCamera();
    quakeGlyphOverlay.syncCamera(
      controls.getOrigin(),
      cameraState.rotX ?? 90,
      cameraState.rotY ?? 270,
      cameraState.target,
    );
    quakeGlyphSyncWeapon?.();
  };
  // Dev: dump the exact glyph state (camera + every mover's live offset) so a
  // bug can be replayed precisely. Call window.__quakeDumpGlyphState() in the
  // console while the bug is on screen; paste the result.
  if (import.meta.env?.DEV) {
    // Dev: hand the live overlay to the console/benchmarks so glyph render cost
    // can be timed against the REAL level geometry and PVS at any view.
    (window as unknown as { __quakeGlyphOverlay?: QuakeGlyphWorldOverlay }).__quakeGlyphOverlay = quakeGlyphOverlay;
    (window as unknown as { __quakeDumpGlyphState?: () => unknown }).__quakeDumpGlyphState = () => {
      const o = controls.getOrigin();
      const f = (n: number) => Math.round(n * 100) / 100;
      const moverOffsets: Record<number, [number, number, number]> = {};
      for (const m of currentResult?.glyphMovers?.movers ?? []) {
        const off = movers?.get(m.entityIndex)?.offset;
        if (off && (off[0] || off[1] || off[2])) moverOffsets[m.entityIndex] = [f(off[0]), f(off[1]), f(off[2])];
      }
      const dump = { view: `${f(o[0])},${f(o[1])},${f(o[2])},${f(cameraState.rotX ?? 90)},${f(cameraState.rotY ?? 270)}`, moverOffsets };
      // eslint-disable-next-line no-console
      console.log("GLYPH STATE:", JSON.stringify(dump));
      return dump;
    };
  }
}
let quakePlayerDead = false;

type QuakePickupControllerHandle = ReturnType<typeof createQuakePickupController>;
type QuakePlayerControllerHandle = ReturnType<typeof createQuakePlayerController>;

let pickups: QuakePickupControllerHandle | null = null;
let player: QuakePlayerControllerHandle | null = null;
let quakeRuntimePickupSerial = 0;

function getPickups(): QuakePickupControllerHandle {
  if (!pickups) throw new Error("Quake pickup controller is not initialized.");
  return pickups;
}

function getPlayer(): QuakePlayerControllerHandle {
  if (!player) throw new Error("Quake player controller is not initialized.");
  return player;
}

let quakeMoverInteractions!: QuakeMoverInteractionFlow;
let quakeTextPresentation!: QuakeTextPresentationFlow;
let quakeWeaponPresentation!: QuakeWeaponPresentationFlow;
let quakeCrosshairInteraction: QuakeCrosshairInteractionFlow | null = null;
let quakeEntityActivation!: QuakeEntityActivationFlow;
let quakePlayerLifecycle!: QuakePlayerLifecycleFlow;
let quakePointerGameplay!: ReturnType<typeof createQuakePointerGameplayFlow>;
const quakeGameplayInput = createQuakeGameplayInputFlow({
  canUseGameplayInput: canUseQuakeGameplayInput,
  changeWeaponByImpulse: changeQuakePlayerWeaponByImpulse,
  clearMobileLookInput: () => quakePointerGameplay.clearMobileLookInput(),
  clearMobileMoveInput: () => quakePointerGameplay.clearMobileMoveInput(),
  debugFlyEnabled: () => quakeDebugFly.isEnabled(),
  player: () => player,
});

const quakeDebugFly = createQuakeDebugFlyController({
  canUseInput: canUseQuakeGameplayInput,
  cameraRotation: () => ({
    rotX: scene.camera.state.rotX ?? 88,
    rotY: scene.camera.state.rotY ?? 270,
  }),
  clearCrouchInput: quakeGameplayInput.clearCrouchInput,
  clearMoveInput: quakeGameplayInput.clearMoveInput,
  controlsOrigin: () => controls.getOrigin(),
  crouchKeyCodes: quakeGameplayInput.crouchKeyCodes,
  dtClamp: QUAKE_DEBUG_FLY_DT_CLAMP,
  fastMultiplier: QUAKE_DEBUG_FLY_FAST_MULTIPLIER,
  initialEnabled: quakeInitialDebugFlyMode,
  isDisposed: () => quakeAppDisposed,
  isEditableTarget: quakeGameplayInput.isEditableTarget,
  jumpVelocity: QUAKE_JUMP_VELOCITY,
  moveKeyCodes: quakeGameplayInput.moveKeyCodes,
  onDisabledAfterActive: respawnQuakePlayerFromFlyMode,
  setBodyClass: setQuakeBodyClass,
  setDebugOrigin: (origin) => getPlayer().setDebugOrigin(origin),
  speed: QUAKE_DEBUG_FLY_SPEED,
  syncOption: (enabled) => {
    if (debugFlyModeOption) debugFlyModeOption.checked = enabled;
  },
  syncView: quakeCameraView.syncDebugFlyView,
  updateControls: (partial) => controls.update(partial),
  viewForward: forwardDirection,
});

const world = createQuakeWorldController({
  getOrigin: () => controls.getOrigin(),
  syncPickupsVisibility: (origin) => getPickups().syncVisibility(origin),
});
const quakeEntityMeshes = createQuakeEntityMeshMountFlow({
  pixelate: (handle) => world.pixelate(handle),
  pointToWorld: quakeCameraView.pointToWorld,
  scene,
  schedulePresentationResync: (handle) => world.schedulePresentationResync(handle),
});

function quakeShootablePrewarmLeavesAt(origin: [number, number, number]): Set<number> | null {
  const visibility = currentResult?.visibility;
  const visibleLeaves = visibility?.visibleLeavesAt(origin) ?? null;
  const metadata = visibility?.metadata;
  if (!visibility || !metadata || !visibleLeaves) return visibleLeaves;
  const leafIndex = visibility.leafIndexAt(origin);
  const leaf = metadata.leaves[leafIndex];
  if (!leaf) return visibleLeaves;
  const prewarmLeaves = new Set(visibleLeaves);
  for (const adjacentLeafIndex of leaf.adjacentLeafIndexes) {
    const adjacentLeaf = metadata.leaves[adjacentLeafIndex];
    if (!adjacentLeaf) continue;
    prewarmLeaves.add(adjacentLeafIndex);
    for (const visibleLeafIndex of adjacentLeaf.visibleLeafIndexes ?? []) {
      prewarmLeaves.add(visibleLeafIndex);
    }
  }
  return prewarmLeaves;
}

const menu = createQuakeMenuController({
  enabled: QUAKE_MENU_ENABLED,
  host,
  controls,
  // The same manifest the overlay draws from — hit-testing and rendering
  // share one geometry source.
  manifest: quakeMenuManifest,
  optionRows: () => quakeOptions.rows(),
  levels: () =>
    quakeAssetCatalog.selectableLevels().map((level) => ({
      map: level.mapName,
      code: level.mapName.toUpperCase(),
      title: quakeAssetCatalog.mapTitle(level),
      current: level.mapName === currentMapName,
    })),
  multiplayerControls: () =>
    ([
      ["mp-name", multiplayerNameInput],
      ["mp-color", multiplayerColorInput],
      ["mp-map", multiplayerMapSelect],
      ["mp-fraglimit", multiplayerFragLimitInput],
      ["mp-maxplayers", multiplayerMaxPlayersInput],
    ] as const)
      .filter((entry): entry is [typeof entry[0], HTMLElement] => entry[1] !== null)
      .map(([id, element]) => ({ id, element })),
  mountMultiplayerControls: quakeMultiplayerMenuForm.mount,
  unmountMultiplayerControls: quakeMultiplayerMenuForm.unmount,
  onMultiplayerSubmit: startQuakeMultiplayerFromMenu,
  onSelectNewGame: startQuakeNewGame,
  onShowMultiplayer: syncQuakeMultiplayerMenu,
  onLoadGame: () => quakeSaveSession.load(),
  onSaveGame: () => quakeSaveSession.save(),
  onSelectLevel: loadQuakeMap,
  onSelectQuit: quitQuakeToMainMenu,
  canLoadGame: () => quakeSaveSession.canLoad(),
  canSaveGame: () => quakeSaveSession.canSave(),
  isMultiplayerEnabled: () => QUAKE_MULTIPLAYER_MENU_ENABLED,
  isQuitEnabled: () => quakeGameplayStarted,
  onMenuVisibilityChange: handleQuakeMenuVisibilityChange,
  onMenuPauseChange: setQuakeMenuPauseState,
  onResumeMainMenuFromEscape: suppressQuakeMainMenuOnResumeControlsEnd,
  shouldResumeMainMenuOnEscape: shouldResumeQuakeMainMenuOnEscape,
  shouldOpenMainMenuOnControlsEnd: shouldOpenQuakeMainMenuOnControlsEnd,
  clearCrosshairTarget: clearQuakeCrosshairTarget,
  syncCrosshairTarget: syncQuakeCrosshairTarget,
});
const quakeRoute = createQuakeRouteFlow<QuakeCssView>({
  applyView: applyQuakeUrlView,
  clearStartupState: clearQuakeMainMenuStartupState,
  currentMapName: () => currentMapName,
  currentView: currentQuakeCssView,
  hasCurrentScene: () => currentResult !== null,
  hideMainMenu: () => menu.hideMainMenu(),
  isDisposed: () => quakeAppDisposed,
  isLoading: () => quakeAppLoading,
  loadMap: loadQuakeMap,
  mapExists: quakeAssetCatalog.mapExists,
  menuEnabled: QUAKE_MENU_ENABLED,
  compactMultiplayerInviteMapName: quakeMultiplayerMapNameForCompactInvite,
  setAssetsRegenerating: setQuakeAssetsRegenerating,
  setGameplayStarted: setQuakeGameplayStarted,
  setLoadingError: setQuakeLoadingError,
  showMainMenu: () => menu.showMainMenu(),
  startMap: quakeAssetCatalog.startMap,
  viewFromUrlView: quakeCameraView.cssViewFromUrlView,
  viewToUrlView: quakeCameraView.urlViewFromCssView,
});
let quakeStatsOverlay!: QuakeStatsOverlayFlow;
let quakeEnemyAnimationsEnabled = true;
const quakeDebugPanelFlow = createQuakeDebugPanelFlow({
  clearDebugUrlParams: clearQuakeDebugUrlParams,
  currentMapName: () => currentMapName,
  currentView: () => ({
    origin: controls.getOrigin(),
    rotX: scene.camera.state.rotX ?? 90,
    rotY: scene.camera.state.rotY ?? 270,
  }),
  debugEnabledOption: null,
  debugEnableAnimationsOption: null,
  debugPanel: null,
  debugShowFpsOption: null,
  debugShowLabelsOption: null,
  debugShowMenuOption: null,
  debugShowOutlinesOption: null,
  debugStack: null,
  debugShowTexturesOption: null,
  debugStatElements,
  hideMainMenu: () => menu.hideMainMenu(),
  initialHideTextures: false,
  initialAnimationsEnabled: quakeEnemyAnimationsEnabled,
  initialMode: quakeUrlBoolean("debugPolys"),
  initialShowFps: true,
  initialShowLabels: false,
  initialShowMenu: true,
  initialShowOutlines: false,
  pickupMeshCounts: () => {
    const stats = getPickups().debugStats();
    return {
      active: stats.visibleEntityIndexes.length,
      total: stats.total,
    };
  },
  removeBodyClasses: removeQuakeBodyClasses,
  setBodyClass: setQuakeBodyClass,
  setEnemyAnimationsEnabled: (enabled) => {
    quakeEnemyAnimationsEnabled = enabled;
    shootables.syncAnimationPresentation();
  },
  shootablesStats: () => shootables.debugStats(),
  showMainMenu: () => menu.showMainMenu(),
  syncInteractionPresentation: syncQuakeInteractionPresentation,
  syncPointerTraceAccessors: syncQuakePointerTraceAccessors,
  syncStatsOverlayAvailability: () => quakeStatsOverlay.syncAvailability(),
  viewUrlFor: quakeUrlFor,
  worldStats: () => world.debugStats(),
});
const quakeDebugRecordingSnapshot = createQuakeDebugRecordingSnapshotFlow({
  currentMapName: () => currentMapName,
  currentView: () => ({
    origin: controls.getOrigin(),
    rotX: scene.camera.state.rotX ?? 90,
    rotY: scene.camera.state.rotY ?? 270,
  }),
  flags: () => ({
    debugMode: quakeDebugPanelFlow.isModeEnabled(),
    showFps: quakeDebugPanelFlow.showFpsEnabled(),
    debugHooks: isQuakeDebugHooksEnabled(),
    menuOpen: menu.isMainMenuOpen(),
    panelOpen: menu.isMenuPanelOpen(),
    gameplayStarted: quakeGameplayStarted,
    playerDead: quakePlayerDead,
    enemiesDisabled: quakeEnemiesDisabled,
    damageDisabled: quakeDamageDisabled,
    enemiesFrozen: quakeEnemiesFrozen,
    attacksDisabled: quakeAttacksDisabled,
    dynamicLighting: quakeDynamicLighting,
    showGun: quakeShowGun,
  }),
  gameplay: () => ({
    appDisposed: quakeAppDisposed,
    collisionReady: currentCollisionWorld !== null,
    currentScene: currentResult !== null,
    loading: quakeAppLoading,
    mapName: currentMapName,
    multiplayerEnabled: QUAKE_MULTIPLAYER_ENABLED,
    multiplayerInputPaused: quakeMultiplayerInputPaused,
    paused: isQuakeGamePaused(),
    playerDead: quakePlayerDead,
    transitionSerial: quakeTransitionSerial,
  }),
  hazards: () => {
    const origin = getPlayer().currentOrigin();
    const eyeHeight = getPlayer().eyeHeight();
    const contentsPoint: Vec3 = [
      origin[0],
      origin[1],
      origin[2] - eyeHeight + 2 * QUAKE_COLLISION_UNIT_SCALE,
    ];
    const playerContents = currentCollisionWorld?.contentsAt?.(contentsPoint) ?? null;
    const playerWaterLevel = quakePlayerWaterLevel(currentCollisionWorld?.contentsAt, origin, eyeHeight);
    const contentsHazard = quakeContentsDamageForWaterLevel(playerContents, playerWaterLevel);
    return {
      ...quakePointHazards.counts(),
      playerContents,
      playerContentsHazard: contentsHazard?.kind ?? null,
      playerLiquid: quakeContentsIsLiquid(playerContents),
      playerWaterLevel,
    };
  },
  input: () => ({
    alwaysRun: quakeAlwaysRun,
    animationsEnabled: quakeEnemyAnimationsEnabled,
    attackDown: quakePointerGameplay.isAttackDown(),
    crosshair: getQuakeMenuSceneState().hud.crosshair !== "off",
    debugFly: document.body.classList.contains("quake-debug-fly"),
    invertMouse: quakeInvertMouse,
    mobileControls: quakePointerGameplay.isMobileAvailable(),
    pointerLocked: document.pointerLockElement === host,
  }),
  isLoading: () => quakeAppLoading,
  isPaused: isQuakeGamePaused,
  isPointerLocked: () => document.pointerLockElement === host,
  multiplayer: quakeMultiplayerDebugSnapshot,
  moversStats: () => movers.debugStats(),
  pickupsStats: () => getPickups().debugStats(),
  playerMovement: () => getPlayer().debugMovement(),
  playerProgress: () => getPlayer().snapshotProgress(),
  shootableCulling: (origin) => shootables.debugCullingSnapshot(origin),
  shootablesStats: () => shootables.debugStats(),
  targets: () => targetSystem.snapshotProgress(),
  touchedTriggers: (origin) => quakeSceneMount.currentTouchedTriggers(origin),
  triggersStats: () => triggerSystem.debugStats(),
  viewUrl: (view) => quakeUrlFor(currentMapName, view).toString(),
  viewmodel: () => viewmodel.debugSnapshot(),
  worldStats: () => world.debugStats(),
});
const quakeDebugRecorder = createQuakeDebugRecorder({
  appVersion: __ASCIIQUAKE_VERSION__,
  currentMapName: () => currentMapName,
  entityManifest: () => currentResult?.entityManifest ?? null,
  onStateChange: quakeDebugRecordingPanelEnabled ? syncQuakeDebugRecordingButton : undefined,
  snapshot: () => quakeDebugRecordingSnapshot.capture(),
  statusElement: quakeDebugRecordingPanelEnabled ? debugStatElements.get("recording") ?? null : null,
});
const quakePointerTracer = createQuakePointerTracer({
  enabled: () => quakeDebugPanelFlow.isModeEnabled() || isQuakeDebugHooksEnabled(),
  logToConsole: () => quakeDebugPanelFlow.isModeEnabled() || quakeDebugPointerTraceConsole,
  baseDetails: () => ({
    debug: quakeDebugPanelFlow.isModeEnabled(),
    pointerLocked: document.pointerLockElement === host,
    pointerLock: quakeEventTargetLabel(document.pointerLockElement),
    active: document.activeElement === host ? "host" : quakeEventTargetLabel(document.activeElement),
    menuOpen: menu.isMainMenuOpen(),
    panelOpen: menu.isMenuPanelOpen(),
    loading: quakeAppLoading,
    canInput: canUseQuakeGameplayInput(),
    bodyClass: document.body.className,
  }),
});
menu.setCurrentLevel(quakeAssetCatalog.startMap());
const audio = createQuakeSoundController();
const quakeSoundManifest = createQuakeSoundManifestFlow({
  assetManifest: quakeAssetCatalog.manifest,
  audio,
  isDisposed: () => quakeAppDisposed,
});
let viewmodel: ReturnType<typeof createQuakeViewmodelController>;
quakeCameraFeedback = createQuakeCameraFeedbackFlow({
  cameraPerspectiveStyle: () => quakeCameraView.cameraPerspectiveStyle(),
  canUseGameplayInput: canUseQuakeGameplayInput,
  controls,
  hasCurrentScene: () => currentResult !== null,
  isDisposed: () => quakeAppDisposed,
  queueCrosshairTargetSync: queueQuakeCrosshairTargetSync,
  renderOriginPolicy: quakeDebugMonsterCameraStandoff,
  scene,
  viewmodel: {
    playFireAnimation: (animation) => viewmodel.playFireAnimation(animation),
    syncTransform: () => viewmodel.syncTransform(),
  },
});
viewmodel = createQuakeViewmodelController({
  scene,
  controls,
  getRenderOrigin: quakeCameraView.currentRenderOrigin,
  host,
  layer: weapon,
  // Dedicated glyph weapon scene (own camera). Must not be the world overlay —
  // a shared world camera clips the near-field model.
  glyphWeaponOverlay: quakeGlyphWeaponOverlay ?? undefined,
  glyphWeaponScale: quakeUrlNumberParam(quakeStartupUrlParams, "glyphWeaponScale", 0.01, 20) ?? undefined,
  glyphWeaponReach: quakeUrlNumberParam(quakeStartupUrlParams, "glyphWeaponReach", 0.02, 20) ?? undefined,
  glyphWeaponRoll: quakeUrlNumberParam(quakeStartupUrlParams, "glyphWeaponRoll", -180, 180) ?? undefined,
  glyphWeaponBackoff: quakeUrlNumberParam(quakeStartupUrlParams, "glyphWeaponBackoff", 0, 4000) ?? undefined,
  glyphWeaponLocalY: quakeUrlNumberParam(quakeStartupUrlParams, "glyphWeaponLocalY", -500, 500) ?? undefined,
  glyphWeaponPivotX: quakeUrlNumberParam(quakeStartupUrlParams, "glyphWeaponPivotX", -500, 500) ?? undefined,
  glyphWeaponPivotY: quakeUrlNumberParam(quakeStartupUrlParams, "glyphWeaponPivotY", -500, 500) ?? undefined,
  glyphWeaponPivotZ: quakeUrlNumberParam(quakeStartupUrlParams, "glyphWeaponPivotZ", -500, 500) ?? undefined,
  glyphWeaponScreenX: quakeUrlNumberParam(quakeStartupUrlParams, "glyphWeaponScreenX", -500, 500) ?? undefined,
  glyphWeaponScreenY: quakeUrlNumberParam(quakeStartupUrlParams, "glyphWeaponScreenY", -500, 500) ?? undefined,
  glyphWeaponScreenScaleX: quakeUrlNumberParam(quakeStartupUrlParams, "glyphWeaponScreenScaleX", 0.01, 20) ?? undefined,
  glyphWeaponScreenScaleY: quakeUrlNumberParam(quakeStartupUrlParams, "glyphWeaponScreenScaleY", 0.01, 20) ?? undefined,
  glyphWeaponStageOffset: quakeUrlNumberParam(quakeStartupUrlParams, "glyphWeaponStageOffset", -500, 500) ?? undefined,
  glyphWeaponDensity: quakeUrlNumberParam(quakeStartupUrlParams, "glyphWeaponDensity", 1, 4)
    ?? quakeUrlNumberParam(quakeStartupUrlParams, "glyphEntityDensity", 1, 4)
    ?? (window.devicePixelRatio >= 1.5 ? 3 : 2),
  glyphWeaponFovScale: quakeUrlNumberParam(quakeStartupUrlParams, "glyphWeaponFovScale", 0.1, 10) ?? undefined,
  glyphWeaponCenterX: quakeUrlNumberParam(quakeStartupUrlParams, "glyphWeaponCenterX", 0, 1) ?? undefined,
  glyphWeaponCenterY: quakeUrlNumberParam(quakeStartupUrlParams, "glyphWeaponCenterY", 0, 1) ?? undefined,
  glyphWeaponPersp: quakeUrlNumberParam(quakeStartupUrlParams, "glyphWeaponPersp", 100, 4000) ?? undefined,
  glyphWeaponZoom: quakeUrlNumberParam(quakeStartupUrlParams, "glyphWeaponZoom", 0.01, 500) ?? undefined,
});
// Now that the viewmodel exists, re-sync the glyph weapon on every camera
// update (bob/punch). Looking around no longer orbits the gun — the dedicated
// scene is a local screen-space frame — but punch/bob still need a live tick.
if (quakeGlyphOverlay) quakeGlyphSyncWeapon = () => viewmodel.syncTransform();
quakeApplyGlyphWeaponTuning = (v) => {
  viewmodel.setGlyphWeaponTuning({
    scale: v.scale,
    reach: v.reach,
    density: v.density,
    zoom: v.zoom,
    roll: v.roll,
    backoff: v.backoff,
    localY: v.localY,
    pivotX: v.pivotX,
    pivotY: v.pivotY,
    pivotZ: v.pivotZ,
    screenX: v.screenX,
    screenY: v.screenY,
    screenScaleX: v.screenScaleX,
    screenScaleY: v.screenScaleY,
    stageOffset: v.stageOffset,
  });
};
const quakeViewmodelAssets = createQuakeViewmodelAssetFlow({
  activeWeapon: () => player?.inventory().activeWeapon ?? null,
  assetManifest: quakeAssetCatalog.manifest,
  isDisposed: () => quakeAppDisposed,
  trace: markQuakeTrace,
  viewmodel,
});
const quakeImpactParticleFlow: QuakeImpactParticleFlow = impactParticlesLayer
  ? createQuakeImpactParticleFlow({
      canShow: canShowQuakeImpactParticles,
      isGameplayPaused: isQuakeGamePaused,
      layer: impactParticlesLayer,
      viewOrigin: () => controls.getOrigin(),
      viewRotation: () => ({
        rotX: scene.camera.state.rotX ?? 90,
        rotY: scene.camera.state.rotY ?? 270,
      }),
    })
  : createNoopQuakeImpactParticleFlow();
const quakeEffectSpriteFlow: QuakeEffectSpriteFlow = impactParticlesLayer
  ? createQuakeEffectSpriteFlow({
      cameraPerspectiveStyle: () => quakeCameraView.cameraPerspectiveStyle(),
      canShow: canShowQuakeImpactParticles,
      effectSpritesUrl: () => quakeAssetCatalog.manifest().assets.effectSpritesUrl,
      isGameplayPaused: isQuakeGamePaused,
      layer: impactParticlesLayer,
      viewOrigin: () => controls.getOrigin(),
      viewRotation: () => ({
        rotX: scene.camera.state.rotX ?? 90,
        rotY: scene.camera.state.rotY ?? 270,
      }),
    })
  : createNoopQuakeEffectSpriteFlow();
quakeImpactParticleFlow.setEnabled(quakeImpactParticles);
quakeEffectSpriteFlow.setEnabled(quakeImpactParticles);
const quakeOptions = createQuakeOptionsFlow({
  audioMuted: () => audio.isMuted(),
  damageDisabled: () => quakeDamageDisabled,
  dynamicLightingEnabled: () => quakeDynamicLighting,
  enemiesDisabled: () => quakeEnemiesDisabled,
  enemiesFrozen: () => quakeEnemiesFrozen,
  attacksDisabled: () => quakeAttacksDisabled,
  impactParticlesEnabled: () => quakeImpactParticles,
  invertMouse: () => quakeInvertMouse,
  showOutlines: () => quakeDebugPanelFlow.showOutlinesEnabled(),
  statsPanelEnabled: () => quakeDebugPanelFlow.isModeEnabled(),
  showFps: () => quakeDebugPanelFlow.showFpsEnabled(),
  glyphDetailLabel: quakeGlyphDetailLabel,
  cycleGlyphDetail: cycleQuakeGlyphDetail,
  glyphPaletteLabel: quakeGlyphPaletteLabel,
  cycleGlyphPalette: cycleQuakeGlyphPalette,
  unlockAudio: () => audio.unlock(),
  setAudioMuted: setQuakeAudioMuted,
  setDamageDisabled: setQuakeDamageDisabled,
  setDynamicLighting: setQuakeDynamicLighting,
  setEnemiesDisabled: setQuakeEnemiesDisabled,
  setEnemiesFrozen: setQuakeEnemiesFrozen,
  setAttacksDisabled: setQuakeAttacksDisabled,
  setImpactParticles: setQuakeImpactParticles,
  setInvertMouse: setQuakeInvertMouse,
  setShowOutlines: (enabled) => quakeDebugPanelFlow.setShowOutlines(enabled),
  setStatsPanel: (enabled) => quakeDebugPanelFlow.setMode(enabled),
  setShowFps: (enabled) => quakeDebugPanelFlow.setShowFps(enabled),
  setStaticLightingClass: (staticLighting) => setQuakeBodyClass("quake-static-lighting", staticLighting),
});
const quakeHudFlow = createQuakeHudFlow({
  bonusOverlay,
  classicHud,
  damageOverlay,
  hudElements,
  inventory: () => getPlayer().inventory(),
  isPlayerDead: () => quakePlayerDead,
  playDamageViewFeedback: quakeCameraView.playDamageViewFeedback,
  playPainSound: () => audio.playEvent("pain", { volume: 0.58 }),
  syncActiveWeaponViewModel: () => quakeViewmodelAssets.syncActiveWeaponViewModel(),
  trace: markQuakeTrace,
});
const quakePowerups = createQuakePowerupFlow({
  getInventory: () => player?.inventory() ?? null,
  hasCurrentScene: () => currentResult !== null,
  isDisposed: () => quakeAppDisposed,
  isPaused: isQuakeGamePaused,
  isPlayerDead: () => quakePlayerDead,
  syncHud: syncQuakeHud,
  trace: markQuakeTrace,
});
const shootables = createQuakeShootablesController({
  addMesh: (entity, model, frameIndex, options) =>
    quakeEntityMeshes.addShootableMesh(entity, model, frameIndex, options),
  // Phase 4D: mirror enemies into the glyph (ASCII) entity layer when active.
  ...(quakeGlyphOverlay ? { glyphEntitySink: quakeGlyphOverlay } : {}),
  bossLightningDischarge: quakeBossLightningDischarge,
  bossLightningElectrodesReady: quakeBossLightningElectrodesReady,
  createMonsterStateRunner: (classname) => createQuakeMonsterStateRunner(classname, { enabled: true }),
  damagePlayer: (amount, context) => getPlayer().damage(amount, context),
  enemyAnimationsEnabled: () => quakeEnemyAnimationsEnabled,
  enemiesFrozen: () => quakeEnemiesFrozen,
  enemyAttacksEnabled: () => !quakeAttacksDisabled,
  enemyMotionMaterial: quakeDebugMonsterMotionMaterial,
  enemyRandomSalt: createQuakeRuntimeRandomSalt,
  playerClearance: quakeDebugMonsterPlayerClearance,
  dropBackpack: (drop) => {
    const origin = drop.sourceEntity.origin ?? { x: 0, y: 0, z: 0 };
    const entity: QuakeEntity = {
      index: -300000 - ++quakeRuntimePickupSerial,
      classname: "item_backpack",
      origin,
      properties: {
        classname: "item_backpack",
        origin: `${origin.x} ${origin.y} ${origin.z}`,
      },
    };
    return getPickups().addRuntimePickup({
      effect: drop.ammo,
      entity,
      feedback: {
        ...(drop.message ? { message: drop.message } : {}),
        ...(drop.soundPath ? { soundPath: drop.soundPath } : {}),
      },
      ...(drop.modelPath ? { modelPath: drop.modelPath } : {}),
      origin: drop.origin,
      ...(typeof drop.removeAfterSeconds === "number" ? { removeAfterSeconds: drop.removeAfterSeconds } : {}),
      visibilityOrigin: controls.getOrigin(),
    });
  },
  contentsAt: (point) => currentCollisionWorld?.contentsAt?.(point) ?? null,
  floorAt: (x, y, maxZ, minZ) =>
    currentCollisionWorld?.floorAt(x, y, maxZ, minZ) ??
    currentCollisionWorld?.staticFloorAt(x, y, maxZ, minZ) ??
    null,
  getPlayerEyeHeight: () => getPlayer().eyeHeight(),
  getPlayerForward: () => forwardDirection(scene.camera.state.rotX ?? 90, scene.camera.state.rotY ?? 270),
  getPlayerOrigin: () => getPlayer().currentOrigin(),
  hasLineOfSight: (start, end) => quakeSceneMount.lineOfSight(start, end),
  traceLine: (start, end) => currentCollisionWorld?.traceUse?.(start, end) ?? null,
  isPlayerInvisible: () => quakePowerups.isInvisible(),
  isGameplayPaused: isQuakeGamePaused,
  isInPlayerView: (point) => quakeSceneMount.isPointInPlayerView(point, QUAKE_MONSTER_MOUNT_VIEW_DOT_MIN),
  leafIndexAt: world.leafIndexAt,
  monsterRuntimeEnabled: () => QUAKE_MONSTER_RUNTIME_ENABLED && !QUAKE_MULTIPLAYER_ENABLED && !quakeEnemiesDisabled,
  onDestroyed: (entity) => {
    if (entity.classname.startsWith("monster_")) quakeLevelStats.markMonsterKilled(entity.index);
  },
  onExplosion: (event) => {
    quakeEffectSpriteFlow.spawnExplosion({
      origin: event.origin,
      radiusUnits: event.radiusUnits,
    });
  },
  pointToWorld: quakeCameraView.pointToWorld,
  shouldSpawn: shouldSpawnQuakeShootableForCurrentMode,
  pixelate: world.pixelate,
  schedulePresentationResync: world.schedulePresentationResync,
  visibleLeavesAt: world.visibleLeavesAt,
  prewarmLeavesAt: quakeShootablePrewarmLeavesAt,
  fireTarget: fireQuakeTarget,
  playSound: (soundPath, options) => audio.playSound(soundPath, options),
});
const targetSystem = createQuakeTargetsController({
  activateEntity: activateQuakeEntity,
  isGameplayPaused: isQuakeGamePaused,
  onCounterStateChange: (entity, result) => quakeTextPresentation.showCounterGeneratedText(entity, result),
  onUseTargetsMessage: (entity, text) => quakeTextPresentation.showUseTargetsMessageText(entity, text),
});
const quakeDamageableBrushes = createQuakeDamageableBrushFlow({
  activateEntity: activateQuakeEntity,
  activateSecretTrigger: activateQuakeSecretTrigger,
  disableEntity: (entityIndex) => targetSystem.disableEntity(entityIndex),
  getEntity: (entityIndex) => entityByIndex.get(entityIndex),
  isEntityDisabled: (entityIndex) => targetSystem.isDisabled(entityIndex),
  isPaused: isQuakeGamePaused,
  pausedTimerPollMs: QUAKE_PAUSED_TIMER_POLL_MS,
  triggerOneShot: quakeRuntimeTriggerOneShot,
  useTargets: (entity) => targetSystem.useTargets(entity),
});
const quakePointHazards = createQuakePointHazardFlow({
  getEntity: (entityIndex) => entityByIndex.get(entityIndex),
  gravity: QUAKE_GRAVITY,
  hasCurrentScene: () => currentResult !== null,
  isEntityDisabled: (entityIndex) => targetSystem.isDisabled(entityIndex),
  isPaused: isQuakeGamePaused,
  onHazardsChanged: () => syncQuakeHazards(getPlayer().currentOrigin()),
  pointToWorld: quakeCameraView.pointToWorld,
});
const movers = createQuakeMoversController({
  applyState: (state, movePlayer) => quakeMoverInteractions.applyState(state, movePlayer),
  fireTarget: fireQuakeTarget,
  groupUnlocked: (state) => quakeMoverInteractions.groupUnlocked(state),
  isGameplayPaused: isQuakeGamePaused,
  playerBlocks: (state, nextOffset, delta) => quakeMoverInteractions.playerBlocks(state, nextOffset, delta),
});
const triggerSystem = createQuakeTriggersController({
  activateCounter: targetSystem.activateCounter,
  activateEntity: activateQuakeEntity,
  activateTeleport: activateQuakeTeleport,
  completeLevel: completeQuakeLevel,
  disableEntity: targetSystem.disableEntity,
  getEntity: (entityIndex) => entityByIndex.get(entityIndex),
  getOrigin: () => controls.getOrigin(),
  getTouchedTriggers: (origin) => quakeSceneMount.currentTouchedTriggers(origin),
  isEntityDisabled: targetSystem.isDisabled,
  isOneShotTrigger: quakeRuntimeTriggerOneShot,
  onActiveKeyChange: syncQuakeActiveTriggerDataset,
  requestTouch: requestQuakeMultiplayerTriggerTouch,
  triggerSpecial: activateQuakeSpecialTrigger,
  triggerWait: quakeRuntimeTriggerWait,
  transitionSerial: () => quakeTransitionSerial,
  useTargets: targetSystem.useTargets,
});
pickups = createQuakePickupController({
  addMesh: (entity, model, frameIndex) => quakeEntityMeshes.addPickupMesh(entity, model, frameIndex),
  // Phase 4C: mirror pickups into the glyph (ASCII) entity layer when active.
  ...(quakeGlyphOverlay ? { glyphEntitySink: quakeGlyphOverlay } : {}),
  applyEffect: (effect, entity, feedback) => {
    applyQuakeInventoryDelta(getPlayer().inventory(), effect);
    syncQuakeHud();
    flashQuakeBonusOverlay();
    const gameLogic = currentResult?.gameLogic ?? null;
    const pickupMessage = feedback?.message ?? quakePickupMessageForEntity(entity, gameLogic);
    if (pickupMessage) quakeTextPresentation.notify(pickupMessage);
    if (feedback?.soundPath) {
      audio.playSound(feedback.soundPath);
    } else {
      audio.playPickup(entity, gameLogic);
    }
  },
  canPickup: (effect, entity) => {
    const canPickup = quakeCanPickupForInventory(entity, getPlayer().inventory(), currentResult?.gameLogic ?? null, effect);
    if (!canPickup) return false;
    if (QUAKE_MULTIPLAYER_ENABLED && quakeMultiplayerSession.status().state === "connected") {
      requestQuakeMultiplayerPickup(entity.index);
      return false;
    }
    return true;
  },
  leafIndexAt: world.leafIndexAt,
  playerForward: () => forwardDirection(scene.camera.state.rotX ?? 90, scene.camera.state.rotY ?? 270),
  playerViewDot: (point) => quakeSceneMount.playerViewDot(point),
  pointToWorld: quakeCameraView.pointToWorld,
  gameLogic: () => currentResult?.gameLogic ?? null,
  isGameplayPaused: isQuakeGamePaused,
  programMetadata: () => currentProgramMetadata,
  shouldSpawn: shouldSpawnQuakePickupForCurrentMode,
  startMegahealthRot: (entity, delaySeconds) => quakePowerups.startMegahealthRot(entity, delaySeconds),
  startPowerup: (entity, powerup) => quakePowerups.startPowerup(entity, powerup),
  useTargets: targetSystem.useTargets,
  visibleLeavesAt: world.visibleLeavesAt,
});
const weapons = createQuakeWeaponsController({
  scene,
  controls,
  addProjectileMesh: (modelPath, weapon) => quakeWeaponPresentation.addProjectileMesh(modelPath, weapon),
  canUseGameplayInput: canUseQuakeGameplayInput,
  hasViewmodel: viewmodel.hasWeapon,
  getCollisionWorld: () => currentCollisionWorld,
  getEntities: () => entityByIndex,
  getDamageableBrushTargets: quakeDamageableBrushWeaponTargets,
  getShootables: shootables.weaponTargets,
  getPlayerEyeHeight: () => getPlayer().eyeHeight(),
  getPlayerWaterLevel: () =>
    quakePlayerWaterLevel(currentCollisionWorld?.contentsAt, getPlayer().currentOrigin(), getPlayer().eyeHeight()),
  getActiveWeapon: () => getPlayer().inventory().activeWeapon,
  getAmmo: (field) => getPlayer().inventory()[field],
  consumeAmmo: (field, amount) => {
    const inventory = getPlayer().inventory();
    inventory[field] = Math.max(0, inventory[field] - amount);
  },
  selectBestWeapon: () => selectQuakeBestInventoryWeapon(getPlayer().inventory()),
  syncHud: syncQuakeHud,
  playFireSound: (weapon) => {
    audio.playEvent(quakeWeaponFireSoundEvent(weapon), { volume: 0.74 });
  },
  playFireAnimation: (animation) => quakeWeaponPresentation.playFireAnimation(animation),
  damageShootable: (entityIndex, amount) =>
    quakeMultiplayerRoomOwnsLocalDamage()
      ? false
      : shootables.damage(entityIndex, amount),
  damageBrushEntity: (entityIndex, amount) =>
    quakeMultiplayerRoomOwnsLocalDamage()
      ? false
      : quakeDamageableBrushes.damage(entityIndex, amount),
  damagePlayer: (amount, context) =>
    quakeMultiplayerRoomOwnsLocalDamage()
      ? false
      : getPlayer().damage(amount, context),
  canDamageTargetOrigin: (start, targetOrigin) => shootables.canDamageTargetOrigin(start, targetOrigin),
  damageMultiplier: () => quakePowerups.damageMultiplier(),
  onFire: sendQuakeMultiplayerFireIntent,
  onDamageImpact: (event) => {
    quakeImpactParticleFlow.spawnBlood({
      damage: event.damage,
      directionHint: event.direction,
      origin: event.origin,
    });
  },
  onExplosionImpact: (event) => {
    quakeEffectSpriteFlow.spawnExplosion({
      origin: event.origin,
      radiusUnits: event.radiusUnits,
    });
  },
  onHit: () => quakeWeaponPresentation.flashCrosshairHit(),
  onWallImpact: (event) => {
    if (quakeMultiplayerShouldSuppressLocalWallImpact(event)) return;
    quakeImpactParticleFlow.spawnWallImpact({
      count: quakeWallImpactParticleCount(event.effect),
      origin: event.origin,
    });
  },
  showLightningBeam: (beam) => quakeWeaponPresentation.showLightningBeam(beam),
  syncCrosshairTarget: queueQuakeCrosshairTargetSync,
});
quakeCrosshairInteraction = createQuakeCrosshairInteractionFlow({
  activateEntity: activateQuakeEntity,
  addBodyClasses: addQuakeBodyClasses,
  canUseInput: canUseQuakeGameplayInput,
  currentMapName: () => currentMapName,
  getOrigin: () => controls.getOrigin(),
  isDisposed: () => quakeAppDisposed,
  removeBodyClasses: removeQuakeBodyClasses,
  rotation: () => ({
    rotX: scene.camera.state.rotX ?? 88,
    rotY: scene.camera.state.rotY ?? 270,
  }),
  weapons: {
    traceIsActionable: (trace) => weapons.traceIsActionable(trace),
    traceIsShootable: (trace) => weapons.traceIsShootable(trace),
    viewTraceAtCrosshair: (range) => weapons.viewTraceAtCrosshair(range),
    weaponTraceAtCrosshair: () => weapons.weaponTraceAtCrosshair(),
  },
});
quakePointerGameplay = createQuakePointerGameplayFlow({
  activeElement: () => document.activeElement,
  applyCameraAt: quakeCameraView.applySceneCameraAt,
  audioUnlock: () => audio.unlock(),
  canUseGameplayInput: canUseQuakeGameplayInput,
  clearDeathUnlockControlsEndTraceSuppression: () => quakePlayerLifecycle.clearDeathUnlockControlsEndTraceSuppression(),
  clearMainMenuControlsEndSuppression: clearQuakeMainMenuControlsEndSuppression,
  clearParentKeyRelay: quakeGameplayInput.clearParentKeyRelay,
  controls,
  currentCameraRenderOrigin: quakeCameraView.currentRenderOrigin,
  cycleWeapon: cycleQuakePlayerWeapon,
  eventTargetLabel: quakeEventTargetLabel,
  fireWeapon: (now) => weapons.fire(now),
  // The mobile jump button is the Space key by another name: it feeds the
  // same player.handleMoveKey path so queueing/release semantics match.
  handleJumpInput: (pressed) => player?.handleMoveKey("Space", pressed),
  focusHost: () => host.focus({ preventScroll: true }),
  forwardDirection,
  hidePersistedLoadingConsole: hidePersistedQuakeLoadingConsole,
  host,
  invertMouse: () => quakeInvertMouse,
  isDebugFlyModeActive: isQuakeDebugFlyModeActive,
  isDeathUnlockControlsEndTraceSuppressed: isQuakeDeathUnlockControlsEndTraceSuppressed,
  isDisposed: () => quakeAppDisposed,
  isInteractiveOverlayTarget: (target) =>
    target instanceof Node && document.getElementById("quake-debug-panel")?.contains(target) === true,
  isPlayerDead: () => quakePlayerDead,
  mobileRoot: quakeApp,
  onAvailabilityChange: () => quakeStatsOverlay.syncAvailability(),
  pointerLockElement: () => document.pointerLockElement,
  queueCrosshairTargetSync: queueQuakeCrosshairTargetSync,
  renderSupersample: QUAKE_RENDER_SUPERSAMPLE,
  requestIntermissionAdvance: requestQuakeIntermissionAdvance,
  respawnPlayerFromDeath: respawnQuakePlayerFromDeath,
  rotation: () => ({
    rotX: scene.camera.state.rotX ?? 88,
    rotY: scene.camera.state.rotY ?? 270,
  }),
  setAnalogMove: (x, y) => player?.setAnalogMove(x, y),
  setDebugOrigin: (origin) => getPlayer().setDebugOrigin(origin),
  syncDebugFlyView: quakeCameraView.syncDebugFlyView,
  syncInteractionPresentation: syncQuakeInteractionPresentation,
  trace: quakePointerTrace,
  traceActionAtCrosshair: () => quakeCrosshairInteraction?.pointerActionTrace() ?? null,
  traceUserActivationDetails: quakeUserActivationTraceDetails,
  tryActivateCrosshairAction: (trace) => quakeCrosshairInteraction?.activateButtonAtTrace(trace) ?? false,
  viewmodelSyncTransform: () => viewmodel.syncTransform(),
});
quakeStatsOverlay = createQuakeStatsOverlayFlow({
  isDisposed: () => quakeAppDisposed,
  isLoading: () => quakeAppLoading,
  isMobileAvailable: quakePointerGameplay.isMobileAvailable,
  root: quakeApp,
  showFpsEnabled: () => quakeDebugPanelFlow.showFpsEnabled(),
});

function quakeWeaponFireSoundEvent(weapon: QuakeWeaponFireSoundId): QuakeSoundEvent {
  if (weapon === "axe") return "weaponAxe";
  if (weapon === "nailgun") return "weaponNailgun";
  if (weapon === "supernailgun") return "weaponSuperNailgun";
  if (weapon === "grenadelauncher") return "weaponGrenadeLauncher";
  if (weapon === "rocketlauncher") return "weaponRocketLauncher";
  if (weapon === "lightning") return "weaponLightning";
  return weapon === "supershotgun" ? "weaponSuperShotgun" : "weaponShotgun";
}

player = createQuakePlayerController({
  activateSolidTouch,
  canUseGameplayInput: canUseQuakeGameplayInput,
  canTakeDamage: () => !quakeDamageDisabled && !quakePlayerDead,
  controls,
  getYaw: () => scene.camera.state.rotY ?? 270,
  getCollisionWorld: () => currentCollisionWorld,
  getCurrentScene: () => currentResult,
  gravity: QUAKE_GRAVITY,
  alwaysRun: () => quakeAlwaysRun,
  isGameplayPaused: isQuakeGamePaused,
  isInvulnerable: () => quakePowerups.isInvulnerable(),
  jumpVelocity: QUAKE_JUMP_VELOCITY,
  onHazardDamage: sendQuakeMultiplayerHazardDamageIntent,
  onDamageFlash: quakeHudFlow.onDamageFlash,
  onDeath: (details) => showQuakePlayerDeath(details),
  onHazardState: () => undefined,
  onInventoryChanged: syncQuakeHud,
  onRespawn: (result, previousOrigin) => quakeSceneMount.respawnScene(result, previousOrigin),
  pointToWorld: quakeCameraView.pointToWorld,
  resolveShootablesCollision: shootables.resolvePlayerCollision,
  syncCrosshairTarget: syncQuakeCrosshairTarget,
  syncCamera: quakeCameraView.syncCameraOrigin,
  syncHazards: syncQuakeHazards,
  syncPickups: (origin, eyeHeight) => getPickups().syncCollision(origin, eyeHeight, STEP_HEIGHT),
  syncTouchedTriggers,
  syncViewmodel: () => viewmodel.syncTransform(),
  syncWorldVisibility: (force) => {
    world.syncVisibility(force);
    shootables.syncVisibility(controls.getOrigin(), force);
  },
  transitionSerial: () => quakeTransitionSerial,
  quakecRandom: (label) => shootables.nextPlayerQuakecRandom({
    functionName: label,
    reason: "player-death",
  }),
});

let currentPickupModelLibrary: QuakePickupModelLibrary | null = null;
let currentProgramMetadata: QuakeProgramMetadata | null = null;
let currentCollisionWorld: QuakeCollisionWorld | null = null;
let currentResult: QuakeScene | null = null;
let quakeMultiplayerPickupDefinitionsScene: QuakeScene | null = null;
let quakeMultiplayerPickupDefinitions: readonly QuakeMultiplayerPickupDefinition[] = [];
let quakeMultiplayerDynamicPickupDefinitions = new Map<number, QuakeMultiplayerPickupDefinition>();
let quakeMultiplayerWorldIntentDefinitionsScene: QuakeScene | null = null;
let quakeMultiplayerWorldIntentDefinitions: readonly QuakeMultiplayerWorldDefinition[] = [];
let quakeGameplayStarted = false;
let quakeClickToPlayCenterPrintVisible = false;
let entityByIndex = new Map<number, QuakeEntity>();
let quakeModelPivot = { x: 0, y: 0, z: 0 };
let quakeTransitionSerial = 0;
let quakeMultiplayerSceneSerial = 0;
let quakeMultiplayerClientSequence = 0;
let quakeMultiplayerFireSequence = 0;
let quakeMultiplayerPickupSequence = 0;
let quakeMultiplayerWorldSequence = 0;
let quakeMultiplayerInputSequence = 0;
let quakeMultiplayerPoseSequence = 0;
let quakeMultiplayerPoseFrame = 0;
let quakeMultiplayerLastInputAt = 0;
let quakeMultiplayerLastInputSentAt = 0;
let quakeMultiplayerPendingInputs: QuakeMultiplayerLocalInputIntent[] = [];
let quakeMultiplayerLastPoseAt = 0;
let quakeMultiplayerHelloAccepted = false;
let quakeMultiplayerLocalSpawnId: string | null = null;
let quakeMultiplayerLocalPingMs: number | null = null;
let quakeMultiplayerLastReconciledInputSequence = 0;
let quakeMultiplayerLastInventoryFingerprint: string | null = null;
let quakeMultiplayerApplyingWorldEvent = false;
const quakeMultiplayerPickupRequestAt = new Map<number, number>();

function* quakeDamageableBrushWeaponTargets(): Iterable<QuakeWeaponShootableTarget> {
  const sceneResult = currentResult;
  if (!sceneResult) return;
  for (const entry of quakeDamageableBrushes.snapshot().brushes) {
    if (entry.health <= 0) continue;
    const entity = entityByIndex.get(entry.entityIndex);
    if (!entity || !quakeDamageableBrushCanBeWeaponTarget(entity) || entity.modelIndex === undefined) continue;
    const model = sceneResult.models.find((item) => item.index === entity.modelIndex);
    if (!model) continue;
    const min: Vec3 = [
      (model.mins.x - quakeModelPivot.x) * QUAKE_COLLISION_UNIT_SCALE,
      (model.mins.y - quakeModelPivot.y) * QUAKE_COLLISION_UNIT_SCALE,
      (model.mins.z - quakeModelPivot.z) * QUAKE_COLLISION_UNIT_SCALE,
    ];
    const max: Vec3 = [
      (model.maxs.x - quakeModelPivot.x) * QUAKE_COLLISION_UNIT_SCALE,
      (model.maxs.y - quakeModelPivot.y) * QUAKE_COLLISION_UNIT_SCALE,
      (model.maxs.z - quakeModelPivot.z) * QUAKE_COLLISION_UNIT_SCALE,
    ];
    yield {
      entity,
      dead: false,
      origin: [
        (min[0] + max[0]) * 0.5,
        (min[1] + max[1]) * 0.5,
        (min[2] + max[2]) * 0.5,
      ],
      bounds: { min, max },
    };
  }
}

function quakeDamageableBrushCanBeWeaponTarget(entity: QuakeEntity): boolean {
  if (quakeEntityNumber(entity, "health", 0) <= 0) return false;
  return entity.classname === "func_button" ||
    entity.classname === "trigger_multiple" ||
    entity.classname === "trigger_once" ||
    entity.classname === "trigger_secret";
}
const quakeMultiplayerWorldRequestAt = new Map<string, number>();
let quakeMultiplayerLastRoomEvent: Record<string, unknown> | null = null;
let quakeMultiplayerRecentRoomEvents: Record<string, unknown>[] = [];
let quakeMultiplayerLastWorldEvent: Record<string, unknown> | null = null;
let quakeMultiplayerRecentWorldEvents: Record<string, unknown>[] = [];
let quakeMultiplayerLastPlayerEvent: Record<string, unknown> | null = null;
let quakeMultiplayerRecentPlayerEvents: Record<string, unknown>[] = [];
let quakeMultiplayerLastPickupEvent: Record<string, unknown> | null = null;
let quakeMultiplayerLastMatchState: QuakeMultiplayerRoomMatchState | null = null;
let quakeMultiplayerLastMatchEvent: Record<string, unknown> | null = null;
let quakeMultiplayerLastReject: QuakeMultiplayerRoomRejectRecord | null = null;
let quakeMultiplayerLastError: QuakeMultiplayerRoomErrorRecord | null = null;
let currentMapName = quakeAssetCatalog.startMap();
let quakeAppDisposed = false;
let quakeAppLoading = true;
quakeWeaponPresentation = createQuakeWeaponPresentationFlow({
  addBodyClasses: addQuakeBodyClasses,
  currentModelLibrary: () => currentPickupModelLibrary,
  ...(quakeGlyphOverlay ? { glyphEntitySink: quakeGlyphOverlay } : {}),
  playWeaponFireFeedback: (animation) => quakeCameraFeedback.playWeaponFireFeedback(animation),
  removeBodyClasses: removeQuakeBodyClasses,
  scene,
});
quakeTextPresentation = createQuakeTextPresentationFlow({
  currentGameLogic: () => currentResult?.gameLogic ?? null,
  hudAvailable: () => Boolean(quakeHud),
  isPlayerDead: () => quakePlayerDead,
  text: quakeText,
});
quakeMoverInteractions = createQuakeMoverInteractionFlow({
  audio,
  ...(quakeGlyphOverlay ? { syncGlyphMoverOffset: syncQuakeGlyphMoverOffset } : {}),
  currentCollisionWorld: () => currentCollisionWorld,
  currentGroundEntity: () => getPlayer().currentGroundEntity(),
  doorMessageCooldownMs: QUAKE_DOOR_MESSAGE_COOLDOWN_MS,
  getMover: (entityIndex) => movers.get(entityIndex),
  isDebugFlyModeActive: isQuakeDebugFlyModeActive,
  playerCarryWithMover: (delta, entityIndex) => getPlayer().carryWithMover(delta, entityIndex),
  playerDamage: (amount) => getPlayer().damage(amount),
  playerEyeHeight: () => getPlayer().eyeHeight(),
  playerInventory: () => getPlayer().inventory(),
  playerOrigin: () => controls.getOrigin(),
  requiredDoorText: (entityIndexes, requiredKey) =>
    quakeTextPresentation.generatedCenterPrintTextForEntityIndexes(
      entityIndexes,
      "door-key-required",
      (fact) => fact.condition?.key === requiredKey,
    ),
  shootables,
  showCenterPrint: (text) => quakeTextPresentation.centerPrint(text),
  syncShootablesVisibility: (origin, force) => shootables.syncVisibility(origin, force),
  syncCrosshairTarget: syncQuakeCrosshairTarget,
});
const quakeAssetWarmup = createQuakeAssetWarmupFlow({
  assetManifest: quakeAssetCatalog.manifest,
  isDisposed: () => quakeAppDisposed,
  onPickupModelLibrary: (library) => {
    currentPickupModelLibrary = library;
  },
  onProgramMetadata: (metadata) => {
    currentProgramMetadata = metadata;
  },
  shouldSpawnPickup: shouldSpawnQuakePickupForCurrentMode,
  shouldSpawnShootable: shouldSpawnQuakeShootableForCurrentMode,
});
const quakeLoading = createQuakeLoadingFlow({
  clearAttackInput: quakePointerGameplay.clearAttackInput,
  clearBonusOverlay: clearQuakeBonusOverlay,
  clearCrosshairTarget: clearQuakeCrosshairTarget,
  clearCrouchInput: quakeGameplayInput.clearCrouchInput,
  clearDebugFlyInput: quakeDebugFly.clearInput,
  clearMobileMoveInput: quakePointerGameplay.clearMobileMoveInput,
  clearMoveInput: quakeGameplayInput.clearMoveInput,
  clearWeaponViewPunch: quakeCameraView.clearWeaponViewPunch,
  currentMapName: () => currentMapName,
  hasCurrentResult: () => currentResult !== null,
  hideStatsOverlay: quakeStatsOverlay.hide,
  initialLoading: quakeAppLoading,
  isDisposed: () => quakeAppDisposed,
  isGameplayStarted: () => quakeGameplayStarted,
  isLevelTransitionActive: isQuakeLevelTransitionActive,
  isMainMenuOpen: () => menu.isMainMenuOpen(),
  isMenuPanelOpen: () => menu.isMenuPanelOpen(),
  onLoadingChange: (loading) => {
    quakeAppLoading = loading;
  },
  previewEnabled: QUAKE_LOADING_PREVIEW_ENABLED,
  setControlsLoading: () => controls.update({ moveEnabled: false, jumpEnabled: false, gravity: 0 }),
  syncCrosshairTarget: syncQuakeCrosshairTarget,
  syncDebugFlyMode: syncQuakeDebugFlyMode,
  syncStatsOverlayAvailability: () => quakeStatsOverlay.syncAvailability(),
  trace: markQuakeTrace,
});
const quakeSceneMount = createQuakeSceneMountFlow({
  afterMountScene: () => {
    resetQuakeLevelStatsForCurrentScene();
    startQuakeMultiplayerScene();
  },
  audio,
  beforeDisposeScene: () => stopQuakeMultiplayerScene("scene-dispose"),
  clearPlayerDeath: clearQuakePlayerDeath,
  clearPostControllerState: () => {
    clearQuakeLevelComplete();
    clearQuakePlayerDeath();
    quakeTextPresentation.clear();
    quakeMoverInteractions.clear();
    quakeWeaponPresentation.clearCrosshairHit();
    clearQuakeLevelLoadTimer();
    clearQuakeCrosshairTarget();
    quakeWeaponPresentation.clearLightningBeams();
  },
  clearPreControllerState: () => {
    quakePointerGameplay.clearAttackInput();
    quakeDebugFly.clearInput();
    quakeCameraView.clearWeaponViewPunch();
    quakePowerups.clearMegahealthRot();
    quakePowerups.clearPowerups();
    clearQuakeBonusOverlay();
    quakeViewmodelAssets.clearMountedState();
  },
  currentModelLibrary: () => currentPickupModelLibrary,
  currentProgramMetadata: () => currentProgramMetadata,
  damageableBrushes: quakeDamageableBrushes,
  focusCurrentMenu: () => menu.focusCurrent(),
  host,
  movers,
  pickups: getPickups(),
  player: getPlayer(),
  playerForward: () => forwardDirection(scene.camera.state.rotX ?? 90, scene.camera.state.rotY ?? 270),
  pointHazards: quakePointHazards,
  powerupActive: (finishedField) => quakePowerups.powerupActive(finishedField),
  setCamera: quakeCameraView.setCamera,
  shootables,
  state: {
    setCollisionWorld: (world) => { currentCollisionWorld = world; },
    setCurrentScene: (nextScene) => { currentResult = nextScene; syncQuakeGlyphOverlayGeometry(); },
    setEntityIndex: (index) => { entityByIndex = index; },
    setModelPivot: (pivot) => {
      quakeModelPivot = pivot;
      quakeMoverInteractions.setModelPivot(pivot);
    },
    setTransitionSerial: (value) => { quakeTransitionSerial = value; },
  },
  syncCrosshairTarget: syncQuakeCrosshairTarget,
  targets: targetSystem,
  trace: markQuakeTrace,
  transitionSerial: () => quakeTransitionSerial,
  triggers: triggerSystem,
  viewmodel,
  weapons,
  world,
});
quakeEntityActivation = createQuakeEntityActivationFlow({
  addBodyClasses: addQuakeBodyClasses,
  audio,
  clearAttackInput: quakePointerGameplay.clearAttackInput,
  currentCollisionWorld: () => currentCollisionWorld,
  currentGameLogic: () => currentResult?.gameLogic,
  entities: () => entityByIndex,
  getOrigin: () => controls.getOrigin(),
  intermission: {
    show: () => {
      quakeIntermission.show(quakeLevelStats.freeze());
      syncQuakeInteractionPresentation();
    },
    syncCamera: syncQuakeIntermissionCamera,
  },
  loadMap: loadQuakeMap,
  mapExists: quakeAssetCatalog.mapExists,
  movers,
  onSecretActivated: (entity) => quakeLevelStats.markSecret(entity.index),
  pickups: getPickups(),
  player: getPlayer,
  pointToWorld: quakeCameraView.pointToWorld,
  publishWorldChanged: sendQuakeMultiplayerWorldChanged,
  shootables,
  syncCrosshairTarget: syncQuakeCrosshairTarget,
  syncSceneCamera: quakeCameraView.syncSceneCamera,
  syncTouchedTriggers,
  targets: targetSystem,
  text: {
    centerPrint: (message) => quakeTextPresentation.centerPrint(message),
    clearCenterPrint: () => quakeTextPresentation.clearCenterPrint(),
    hasUseTargetsMessageText: (entity) => quakeTextPresentation.hasUseTargetsMessageText(entity),
    setCenterPrint: (message) => quakeTextPresentation.setCenterPrint(message),
    showDirectCenterPrintMessageText: (entity) => quakeTextPresentation.showDirectCenterPrintMessageText(entity),
  },
  transitionSerialIncrement: () => { quakeTransitionSerial++; },
  triggers: triggerSystem,
  viewmodel,
  world,
});
quakePlayerLifecycle = createQuakePlayerLifecycleFlow({
  addBodyClasses: addQuakeBodyClasses,
  appLoading: () => quakeAppLoading,
  clearAttackInput: quakePointerGameplay.clearAttackInput,
  clearBonusOverlay: clearQuakeBonusOverlay,
  clearCrosshairHit: () => quakeWeaponPresentation.clearCrosshairHit(),
  clearCrosshairTarget: clearQuakeCrosshairTarget,
  clearCrouchInput: quakeGameplayInput.clearCrouchInput,
  clearDeathDamageFeedback: () => quakeHudFlow.clearDeathDamageFeedback(),
  clearDeathOverlay: () => quakeLoading.clearDeathOverlay(),
  clearDebugFlyInput: quakeDebugFly.clearInput,
  clearGameRoute: clearQuakeGameRoute,
  clearLevelLoadTimer: clearQuakeLevelLoadTimer,
  clearMegahealthRot: () => quakePowerups.clearMegahealthRot(),
  clearMobileMoveInput: quakePointerGameplay.clearMobileMoveInput,
  clearMoveInput: quakeGameplayInput.clearMoveInput,
  clearPowerups: () => quakePowerups.clearPowerups(),
  clearText: () => quakeTextPresentation.clear(),
  clearTextCenterPrint: () => quakeTextPresentation.clearCenterPrint(),
  clearWeaponViewPunch: quakeCameraView.clearWeaponViewPunch,
  controls,
  currentCollisionWorld: () => currentCollisionWorld,
  currentMapName: () => currentMapName,
  currentResult: () => currentResult,
  exitPointerLockIfHost: () => {
    if (document.pointerLockElement === host) document.exitPointerLock();
  },
  focusHost: () => host.focus({ preventScroll: true }),
  gameplayStarted: () => quakeGameplayStarted,
  hasBodyClass: hasQuakeBodyClass,
  hasDeathOverlay: () => quakeLoading.hasDeathOverlay(),
  hideMainMenu: () => menu.hideMainMenu(),
  isMainMenuOpen: () => menu.isMainMenuOpen(),
  isMenuPanelOpen: () => menu.isMenuPanelOpen(),
  jumpVelocity: QUAKE_JUMP_VELOCITY,
  loadMap: loadQuakeMap,
  player: getPlayer,
  playDeathSound: (soundPath) => audio.playSound(soundPath, { volume: 0.78 }),
  pointerTrace: quakePointerTrace,
  removeBodyClasses: removeQuakeBodyClasses,
  setGameplayStarted: setQuakeGameplayStarted,
  setLoading: setQuakeLoading,
  setPlayerDead: (dead) => { quakePlayerDead = dead; },
  showDeathDamageFeedback: () => quakeHudFlow.showDeathDamageFeedback(),
  showDeathOverlay: () => quakeLoading.showDeathOverlay(),
  showMainMenu: () => menu.showMainMenu(),
  startMap: quakeAssetCatalog.startMap,
  syncPlayerCollision,
  trace: markQuakeTrace,
  viewmodel,
});
let quakeDebugCollisionBypassUntil = 0;
let quakeDebugGameplaySyncActive = false;
let quakeGamePaused = false;
let quakeGamePausedAt = 0;
let quakeMenuPauseActive = false;
let quakeClickToPlayPauseActive = false;
let quakeMultiplayerInputPaused = QUAKE_MULTIPLAYER_DEBUG_INPUT_PAUSED;
let quakeMultiplayerLastPresenceStatusSent: QuakeMultiplayerPlayerPresenceStatus | null = null;

function setQuakeGameplayStarted(started: boolean): void {
  quakeGameplayStarted = started;
  setQuakeBodyClass("quake-gameplay-started", started);
  quakeLoading.handleGameplayStarted(started);
  syncQuakeInteractionPresentation();
}

function hidePersistedQuakeLoadingConsole(): void {
  quakeLoading.hidePersistedConsole();
}

function makeParseResult(polygons: Polygon[]): QuakeMeshSource {
  return { polygons, objectUrls: [], warnings: [], dispose: () => undefined };
}

function syncQuakeHud(): void {
  quakeHudFlow.sync();
}

function changeQuakePlayerWeaponByImpulse(impulse: number): boolean {
  if (!player || !canUseQuakeGameplayInput()) return false;
  const result = changeQuakeInventoryWeaponByImpulse(player.inventory(), impulse);
  if (!result) return false;
  if (result.message) {
    quakeTextPresentation.notify(result.message);
    return true;
  }
  if (result.changed) {
    syncQuakeHud();
    viewmodel.syncTransform();
    syncQuakeCrosshairTarget();
  }
  return true;
}

/** Mobile weapon button: cycle to the next usable weapon in impulse order
 *  (1..8, wrapping), silently skipping weapons the player lacks or has no
 *  ammo for — the touch equivalent of tapping through the digit keys. */
function cycleQuakePlayerWeapon(): void {
  if (!player || !canUseQuakeGameplayInput()) return;
  const inventory = player.inventory();
  let activeImpulse = 1;
  for (let impulse = 1; impulse <= 8; impulse++) {
    if (quakeWeaponForImpulse(impulse) === inventory.activeWeapon) {
      activeImpulse = impulse;
      break;
    }
  }
  for (let step = 1; step < 8; step++) {
    const impulse = ((activeImpulse - 1 + step) % 8) + 1;
    const result = changeQuakeInventoryWeaponByImpulse(inventory, impulse);
    if (result?.changed) {
      syncQuakeHud();
      viewmodel.syncTransform();
      syncQuakeCrosshairTarget();
      return;
    }
  }
}

function flashQuakeBonusOverlay(): void {
  quakeHudFlow.flashBonusOverlay();
}

function clearQuakeBonusOverlay(): void {
  quakeHudFlow.clearBonusOverlay();
}

function isQuakeWeaponId(value: string): value is QuakeWeaponId {
  return Object.prototype.hasOwnProperty.call(QUAKE_PLAYER_WEAPON_FIRE_FACTS.profiles, value);
}

function isQuakeKey(value: string): value is QuakeKey {
  return value === "silver" || value === "gold";
}

function isQuakeGamePaused(): boolean {
  return !quakeDebugGameplaySyncActive && quakeGamePaused;
}

function setQuakeMenuPauseState(paused: boolean): void {
  quakeMenuPauseActive = paused;
  syncQuakePauseState();
}

function setQuakeClickToPlayPauseState(paused: boolean): void {
  if (quakeClickToPlayPauseActive === paused) return;
  quakeClickToPlayPauseActive = paused;
  syncQuakePauseState();
}

function shouldForceQuakeGamePaused(): boolean {
  return quakeMenuPauseActive ||
    quakeClickToPlayPauseActive ||
    menu.isMainMenuOpen() ||
    menu.isMenuPanelOpen();
}

function syncQuakePauseState(): void {
  const paused = shouldForceQuakeGamePaused();
  if (QUAKE_MULTIPLAYER_ENABLED) {
    if (QUAKE_MULTIPLAYER_DEBUG_INPUT_PAUSED && !paused) return;
    setQuakeMultiplayerInputPaused(paused);
    return;
  }
  applyQuakeGamePaused(paused);
}

function setQuakeMultiplayerInputPaused(paused: boolean): void {
  if (quakeMultiplayerInputPaused === paused) {
    syncQuakeMultiplayerPresenceStatus(paused);
    syncQuakeInteractionPresentation();
    return;
  }
  quakeMultiplayerInputPaused = paused;
  setQuakeBodyClass("quake-multiplayer-input-paused", paused);
  syncQuakeInteractionPresentation();
  if (paused) {
    quakePointerGameplay.clearAttackInput();
    quakeGameplayInput.clearMoveInput();
    quakePointerGameplay.clearMobileMoveInput();
    quakeGameplayInput.clearCrouchInput();
    quakeCameraView.clearWeaponViewPunch();
    controls.update({ moveEnabled: false, jumpEnabled: false, crouchEnabled: false, gravity: 0 });
    clearQuakeCrosshairTarget();
  } else if (!quakeAppLoading && currentCollisionWorld !== null) {
    controls.update({ moveEnabled: true });
    syncQuakeCrosshairTarget();
  }
  syncQuakeMultiplayerPresenceStatus(paused);
}

function syncQuakeMultiplayerPresenceStatus(paused: boolean): void {
  const status = paused ? "input-paused" : "active";
  if (quakeMultiplayerLastPresenceStatusSent === status) return;
  if (sendQuakeMultiplayerPresence(status)) {
    quakeMultiplayerLastPresenceStatusSent = status;
  }
}

function setQuakeGamePaused(paused: boolean): void {
  applyQuakeGamePaused(paused || shouldForceQuakeGamePaused());
}

function applyQuakeGamePaused(paused: boolean): void {
  if (quakeGamePaused === paused) {
    syncQuakeInteractionPresentation();
    return;
  }
  const now = performance.now();
  quakeGamePaused = paused;
  setQuakeBodyClass("quake-game-paused", paused);
  syncQuakeInteractionPresentation();
  audio.setPaused(paused);
  if (paused) {
    quakeGamePausedAt = now;
    quakePointerGameplay.clearAttackInput();
    quakeGameplayInput.clearMoveInput();
    quakePointerGameplay.clearMobileMoveInput();
    quakeGameplayInput.clearCrouchInput();
    quakeCameraView.clearWeaponViewPunch();
    controls.update({ moveEnabled: false, jumpEnabled: false, crouchEnabled: false, gravity: 0 });
    clearQuakeCrosshairTarget();
    pauseQuakeGameplayTimers();
    return;
  }

  const pausedForMs = quakeGamePausedAt ? Math.max(0, now - quakeGamePausedAt) : 0;
  quakeGamePausedAt = 0;
  resumeQuakeGameplayTimers(pausedForMs);
  if (currentResult && !quakeAppLoading && !quakePlayerDead) {
    const origin = getPlayer().currentOrigin();
    syncQuakeHazards(origin);
    getPickups().syncCollision(origin, getPlayer().eyeHeight(), STEP_HEIGHT);
    shootables.syncMonsterRuntime();
    syncQuakeCrosshairTarget();
  }
}

function pauseQuakeGameplayTimers(): void {
  quakePowerups.pauseTimers();
}

function resumeQuakeGameplayTimers(pausedForMs: number): void {
  if (pausedForMs > 0) {
    quakePointHazards.resumeAfterPause(pausedForMs);
    quakeMoverInteractions.resumeAfterPause(pausedForMs);
  }
  quakePowerups.resumeAfterPause(pausedForMs);
}

function setQuakeAudioMuted(muted: boolean): void {
  audio.setMuted(muted);
  menu.syncOptionTexts();
  if (!muted) void quakeSoundManifest.ensureLoaded();
}

function toggleQuakeAudioMuted(): void {
  setQuakeAudioMuted(!audio.isMuted());
}

function showQuakeShortcutState(label: string, enabled: boolean): void {
  quakeTextPresentation.centerPrint(`${label} ${enabled ? "ON" : "OFF"}`);
}

function toggleQuakeAudioMutedShortcut(): void {
  toggleQuakeAudioMuted();
  showQuakeShortcutState("Sound", !audio.isMuted());
}

function setQuakeEnemiesDisabled(disabled: boolean): void {
  quakeEnemiesDisabled = disabled;
  shootables.syncMonsterRuntime();
  menu.syncOptionTexts();
}

function setQuakeDamageDisabled(disabled: boolean): void {
  quakeDamageDisabled = disabled;
  menu.syncOptionTexts();
}

function setQuakeAttacksDisabled(disabled: boolean): void {
  quakeAttacksDisabled = disabled;
  shootables.syncMonsterRuntime();
  menu.syncOptionTexts();
}

function setQuakeEnemiesFrozen(frozen: boolean): void {
  quakeEnemiesFrozen = frozen;
  shootables.syncMonsterRuntime();
  menu.syncOptionTexts();
}

function setQuakeDynamicLighting(enabled: boolean): void {
  quakeDynamicLighting = enabled;
  menu.syncOptionTexts();
}

// ASCII (glyph) detail presets — cell size in px (smaller = finer + slower).
// Cell = font-size in px; the overlay derives a ~square line-height from it, so a
// smaller cell packs both more columns AND more rows (≈square cells = far more
// vertical detail than the old tall cells). Finer + an Ultra tier for max detail.
// ASCII (glyph) detail presets, expressed as a TOTAL CELL BUDGET rather than a
// cell size in px. Render cost tracks cols x rows, and cols x rows scales with
// viewport AREA — so a fixed cell size silently means wildly different work on
// different monitors. Measured on the recorded e1m1 play path: cell 12 is ~10.6k
// cells at 1280x720 (a clean 60fps, p95 17.5ms) and ~42k cells at 2560x1440,
// where p95 doubles to 33ms — the same "Normal" setting stuttering purely
// because the window got bigger. Budgeting the cells instead keeps a preset
// meaning the same frame cost everywhere, and picks the px for you.
const QUAKE_GLYPH_DETAIL_LEVELS = [
  { name: "Coarse", cells: 10_000 },
  { name: "Normal", cells: QUAKE_GLYPH_CELL_BUDGET },
  { name: "Fine", cells: 32_000 },
  { name: "Ultra", cells: 48_000 },
] as const;

function quakeCurrentGlyphCell(): number {
  // The live overlay owns the cell once it exists (detail cycles resize it in
  // place); the URL is only the startup seed and the shareable record.
  return quakeGlyphOverlay?.getCellPx()
    ?? quakeUrlNumberParam(quakeStartupUrlParams, "glyphCell", 6, 40)
    ?? quakeGlyphCellForBudget(QUAKE_GLYPH_CELL_BUDGET);
}

function quakeNearestGlyphDetailIndex(): number {
  const cell = quakeCurrentGlyphCell();
  let bestIndex = 1;
  let bestDistance = Infinity;
  QUAKE_GLYPH_DETAIL_LEVELS.forEach((level, index) => {
    // Compare against what each budget resolves to in the CURRENT viewport, so
    // the label still matches the render after a resize moved every preset's px.
    const distance = Math.abs(quakeGlyphCellForBudget(level.cells) - cell);
    if (distance < bestDistance) { bestDistance = distance; bestIndex = index; }
  });
  return bestIndex;
}

function quakeGlyphDetailLabel(): string {
  return QUAKE_GLYPH_DETAIL_LEVELS[quakeNearestGlyphDetailIndex()]!.name;
}

function cycleQuakeGlyphDetail(direction: number): void {
  const step = direction < 0 ? -1 : 1;
  const length = QUAKE_GLYPH_DETAIL_LEVELS.length;
  const next = QUAKE_GLYPH_DETAIL_LEVELS[(quakeNearestGlyphDetailIndex() + step + length) % length]!;
  const nextCell = quakeGlyphCellForBudget(next.cells);
  quakeGlyphDetailBudget = next.cells;
  const url = new URL(window.location.href);
  url.searchParams.set("glyphCell", String(nextCell));
  // Live resize — the cell is a font metric, so the grid re-fits in place. Record
  // the choice in the URL (still shareable, still the reload seed) WITHOUT
  // navigating, mirroring how the glyph set swaps without a reload.
  quakeGlyphOverlay.setCellPx(nextCell);
  if (quakeGlyphWeaponCellPinned === null) quakeGlyphWeaponOverlay?.setCellPx(nextCell);
  window.history.replaceState(window.history.state, "", url);
}

function quakeGlyphPaletteIndex(): number {
  const current = quakeGlyphOverlay?.getGlyphPalette() ?? resolveQuakeGlyphPalette();
  const index = QUAKE_GLYPH_PALETTES.findIndex((entry) => entry.palette === current);
  return index < 0 ? 0 : index;
}

function quakeGlyphPaletteLabel(): string {
  return QUAKE_GLYPH_PALETTES[quakeGlyphPaletteIndex()]!.name;
}

function cycleQuakeGlyphPalette(direction: number): void {
  const step = direction < 0 ? -1 : 1;
  const length = QUAKE_GLYPH_PALETTES.length;
  const next = QUAKE_GLYPH_PALETTES[(quakeGlyphPaletteIndex() + step + length) % length]!;
  setQuakeStorageValue(QUAKE_GLYPH_PALETTE_STORAGE_KEY, next.palette);
  // Live swap — the ramp is a scene option, so no reload (unlike ASCII detail,
  // which changes the cell size and rebuilds the grid).
  quakeGlyphOverlay?.setGlyphPalette(next.palette);
  quakeGlyphWeaponOverlay?.setGlyphPalette(next.palette);
}

function setQuakeImpactParticles(enabled: boolean): void {
  quakeImpactParticles = enabled;
  quakeImpactParticleFlow.setEnabled(enabled);
  quakeEffectSpriteFlow.setEnabled(enabled);
  menu.syncOptionTexts();
}

function setQuakeShowGun(enabled: boolean): void {
  quakeShowGun = enabled;
  syncQuakeViewmodelVisibility();
}

function syncQuakeViewmodelVisibility(): void {
  viewmodel.setVisible(quakeShowGun && !quakeMultiplayerSpectating);
}

function canShowQuakeImpactParticles(): boolean {
  return (
    !quakeAppLoading &&
    currentResult !== null &&
    !quakePlayerDead &&
    !hasQuakeBodyClass("quake-level-complete") &&
    !hasQuakeBodyClass("quake-menu-unlocked") &&
    !menu.isMainMenuOpen() &&
    !menu.isMenuPanelOpen()
  );
}

function createNoopQuakeImpactParticleFlow(): QuakeImpactParticleFlow {
  return {
    clear: () => undefined,
    dispose: () => undefined,
    setEnabled: () => undefined,
    spawnBlood: () => undefined,
    spawnExplosion: () => undefined,
    spawnWallImpact: () => undefined,
  };
}

function createNoopQuakeEffectSpriteFlow(): QuakeEffectSpriteFlow {
  return {
    clear: () => undefined,
    dispose: () => undefined,
    preload: async () => false,
    setEnabled: () => undefined,
    spawnExplosion: () => undefined,
  };
}

function quakeWallImpactParticleCount(effect: QuakeWeaponWallImpactEffect): number {
  if (effect === "spike") return 4;
  if (effect === "superspike") return 6;
  return 5;
}

function setQuakeDebugShowMenuOption(visible: boolean): void {
  quakeDebugPanelFlow.setShowMenuOption(visible);
}

function handleQuakeMenuVisibilityChange(visible: boolean): void {
  setQuakeDebugShowMenuOption(visible);
  if (visible && quakeGameplayStarted && document.pointerLockElement === host) {
    document.exitPointerLock();
  }
  syncQuakeInteractionPresentation();
}

function toggleQuakeDebugModeShortcut(): void {
  showQuakeShortcutState("Debug", quakeDebugPanelFlow.toggleMode());
}

function toggleQuakeOutlineTextureModeShortcut(): void {
  showQuakeShortcutState("Outlines", quakeDebugPanelFlow.toggleOutlineTextureMode());
}

function syncQuakeDebugRecordingButton(recording: boolean): void {
  if (!quakeDebugRecordingPanelEnabled || !debugRecordingButton) return;
  debugRecordingButton.textContent = recording ? "STOP" : "RECORD";
  debugRecordingButton.setAttribute("aria-pressed", String(recording));
  debugRecordingButton.setAttribute("aria-label", recording ? "Stop debug recording" : "Start debug recording");
}

function handleQuakeDebugRecordingButtonClick(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
  if (!quakeDebugRecordingPanelEnabled) return;
  if (quakeDebugRecorder.isRecording()) {
    quakeDebugRecorder.stop("stop");
    return;
  }
  if (quakeAppLoading || currentResult === null) {
    const recordingStatus = debugStatElements.get("recording");
    if (recordingStatus) recordingStatus.textContent = "load first";
    return;
  }
  quakeDebugRecorder.start();
}

function syncQuakeInteractionPresentation(): void {
  const menuSurfaceOpen = menu.isMainMenuOpen() || menu.isMenuPanelOpen();
  const pointerUnlocked = document.pointerLockElement !== host;
  const mobileControlsAvailable = quakePointerGameplay.isMobileAvailable();
  const intermissionActive = quakeIntermission.active();
  const gameplayPointerUnlocked = quakeGameplayStarted &&
    pointerUnlocked &&
    !mobileControlsAvailable &&
    !intermissionActive;
  const gameplayPointerPauseActive = !QUAKE_MULTIPLAYER_ENABLED && gameplayPointerUnlocked;
  const debugPointerUnlocked = quakeDebugPanelFlow.isModeEnabled() && pointerUnlocked;
  const clickToPlayVisible = gameplayPointerPauseActive && !menuSurfaceOpen && !quakeMultiplayerSpectating;
  setQuakeClickToPlayPauseState(clickToPlayVisible);
  setQuakeBodyClass("quake-debug-active", quakeDebugPanelFlow.isModeEnabled());
  setQuakeBodyClass("quake-debug-pointer-unlocked", debugPointerUnlocked);
  setQuakeBodyClass("quake-menu-unlocked", menuSurfaceOpen || gameplayPointerPauseActive || debugPointerUnlocked);
  syncQuakeClickToPlayCenterPrint(clickToPlayVisible);
}

function syncQuakeClickToPlayCenterPrint(visible: boolean): void {
  if (visible) {
    if (!quakeClickToPlayCenterPrintVisible) {
      quakeTextPresentation.setCenterPrint("CLICK TO PLAY");
      quakeClickToPlayCenterPrintVisible = true;
    }
    return;
  }
  if (!quakeClickToPlayCenterPrintVisible) return;
  quakeClickToPlayCenterPrintVisible = false;
  if (!quakeMultiplayerSpectating) quakeTextPresentation.clearCenterPrint();
}



function quitQuakeToMainMenu(): void {
  quakePlayerLifecycle.quitToMainMenu();
}

function setQuakeDebugFlyMode(enabled: boolean): void {
  quakeDebugFly.setEnabled(enabled);
  world.setDebugShellVisible(enabled);
  world.syncVisibility(true);
}

function syncQuakeDebugFlyMode(): void {
  quakeDebugFly.syncMode();
  world.setDebugShellVisible(quakeDebugFly.isEnabled());
  world.syncVisibility(true);
}

function respawnQuakePlayerFromFlyMode(): boolean {
  return quakePlayerLifecycle.respawnFromFlyMode();
}

function setQuakeInvertMouse(invert: boolean): void {
  quakeInvertMouse = invert;
  controls.update({ invertY: invert });
  menu.syncOptionTexts();
}

function setQuakeAlwaysRun(alwaysRun: boolean): void {
  quakeAlwaysRun = alwaysRun;
}

function syncQuakeOptionControls(): void {
  quakeOptions.syncControls();
  menu.syncOptionTexts();
}

function clearQuakeLevelLoadTimer(): void {
  quakeEntityActivation.clearLevelLoadTimer();
}

function clearQuakeLevelComplete(): void {
  quakeIntermission.clear();
  quakePlayerLifecycle.clearLevelComplete();
  syncQuakeInteractionPresentation();
}

function requestQuakeIntermissionAdvance(): boolean {
  return quakeEntityActivation.requestIntermissionAdvance();
}

function requestQuakeIntermissionAdvanceFromKey(event: KeyboardEvent): boolean {
  if (event.code !== "Space" || quakeGameplayInput.isEditableTarget(event.target)) return false;
  return requestQuakeIntermissionAdvance();
}

function isQuakeDeathUnlockControlsEndTraceSuppressed(now = performance.now()): boolean {
  return quakePlayerLifecycle.isDeathUnlockControlsEndTraceSuppressed(now);
}

function suppressQuakeMainMenuOnResumeControlsEnd(): void {
  quakePlayerLifecycle.suppressMainMenuOnResumeControlsEnd();
}

function clearQuakeMainMenuControlsEndSuppression(): void {
  quakePlayerLifecycle.clearMainMenuControlsEndSuppression();
}

function shouldOpenQuakeMainMenuOnControlsEnd(): boolean {
  return quakePlayerLifecycle.shouldOpenMainMenuOnControlsEnd();
}

function showQuakePlayerDeath(details?: QuakePlayerDeathDetails): void {
  quakePlayerLifecycle.showPlayerDeath(details);
}

function clearQuakePlayerDeath(): void {
  quakePlayerLifecycle.clearPlayerDeath();
}

function respawnQuakePlayerFromDeath(): boolean {
  return quakePlayerLifecycle.respawnFromDeath();
}

async function startQuakeNewGame(): Promise<void> {
  requestQuakeLandscapeOnMobile(quakeApp).then((result) => {
    markQuakeTrace("landscape-lock-request", result);
  }).catch((error: unknown) => {
    markQuakeTrace("landscape-lock-request", {
      reason: "unexpected-error",
      message: error instanceof Error ? error.message : String(error),
    });
  });
  await quakePlayerLifecycle.startNewGame();
}

function resumeQuakeGameplayAfterMapLoad(): void {
  quakePlayerLifecycle.resumeGameplayAfterMapLoad();
}

function resumeQuakeDebugGameplayInput(): void {
  quakePlayerLifecycle.resumeGameplayAfterMapLoad();
  setQuakeClickToPlayPauseState(false);
}

function runQuakeWithDebugGameplayInput<T>(callback: () => T): T {
  const previousDebugGameplaySyncActive = quakeDebugGameplaySyncActive;
  quakeDebugGameplaySyncActive = true;
  let result: T;
  try {
    result = callback();
  } catch (error) {
    quakeDebugGameplaySyncActive = previousDebugGameplaySyncActive;
    throw error;
  }
  if (result && typeof (result as PromiseLike<unknown>).then === "function") {
    return Promise.resolve(result)
      .finally(() => {
        quakeDebugGameplaySyncActive = previousDebugGameplaySyncActive;
      }) as T;
  }
  quakeDebugGameplaySyncActive = previousDebugGameplaySyncActive;
  return result;
}

function isQuakeLevelTransitionActive(): boolean {
  return quakePlayerLifecycle.isLevelTransitionActive();
}

function canUseQuakeGameplayInput(): boolean {
  return !quakeMultiplayerSpectating && !isQuakeGamePaused() && quakePlayerLifecycle.canUseGameplayInput();
}

function shouldResumeQuakeMainMenuOnEscape(): boolean {
  return quakePlayerLifecycle.shouldResumeMainMenuOnEscape();
}

function isQuakeDebugFlyModeActive(): boolean {
  return quakeDebugFly.isActive();
}

function quakePointerTrace(kind: string, details: QuakePointerTraceDetails = {}): void {
  quakePointerTracer.trace(kind, details);
}

function syncQuakePointerTraceAccessors(): void {
  quakePointerTracer.syncAccessors();
}

function setQuakeLoading(
  active: boolean,
  status = "Loading",
  options: { preserveConsole?: boolean } = {},
): void {
  quakeLoading.setLoading(active, status, options);
}

function setQuakeLoadingError(error?: unknown): void {
  quakeLoading.setError(error);
}

function setQuakeAssetsRegenerating(message?: string): void {
  quakeLoading.setAssetsRegenerating(message);
}

function createQuakeRemotePlayerVisual(
  playerState: QuakeMultiplayerAuthoritativePlayerState,
): QuakeMultiplayerRemoteVisualHandle | null {
  const remote = addQuakeRemotePlayerMesh();
  if (!remote) return null;
  remote.playerId = playerState.playerId;
  remote.clientId = playerState.clientId;
  remote.color = playerState.color;
  syncQuakeRemotePlayerElementMetadata(remote);
  return {
    element: remote.handle.element,
    setState: (state) => syncQuakeRemotePlayerVisual(remote, state),
    remove: () => {
      quakeGlyphOverlay?.removeEntity(quakeRemotePlayerGlyphId(remote));
      remote.handle.remove();
    },
  };
}

interface QuakeRemotePlayerMeshMount {
  animationFrames: readonly QuakePickupModelAnimationFrame[];
  attackFrameIndexesByWeapon: Record<string, readonly number[]>;
  color: string | undefined;
  clientId: string;
  currentFrameIndex: number;
  fullFrameSet: QuakeModelFrameSet | undefined;
  handle: QuakeMeshHandle;
  deathFrameIndexes: readonly number[];
  painFrameIndexes: readonly number[];
  playerId: string;
  runFrameIndexes: readonly number[];
  scale: number;
  standFrameIndex: number;
  zOffset: number;
}

function addQuakeRemotePlayerMesh(): QuakeRemotePlayerMeshMount | null {
  const model = quakeRemotePlayerModel();
  const frameSet = model ? quakePickupModelFrameSet(model) : undefined;
  const animationFrames = model?.animationFrames ?? [];
  const standFrameIndex = frameSet
    ? quakeRemotePlayerDefaultFrameIndex(frameSet)
    : quakeRemotePlayerDefaultAnimationFrameIndex(animationFrames);
  const runFrameIndexes = frameSet
    ? quakeRemotePlayerFrameIndexes(frameSet, QUAKE_MULTIPLAYER_REMOTE_RUN_FRAME_PREFIX)
    : quakeRemotePlayerAnimationFrameIndexes(animationFrames, QUAKE_MULTIPLAYER_REMOTE_RUN_FRAME_PREFIX);
  const painFrameIndexes = frameSet
    ? quakeRemotePlayerFrameIndexes(frameSet, QUAKE_MULTIPLAYER_REMOTE_PAIN_FRAME_PREFIX)
    : quakeRemotePlayerAnimationFrameIndexes(animationFrames, QUAKE_MULTIPLAYER_REMOTE_PAIN_FRAME_PREFIX);
  const deathFrameIndexes = frameSet
    ? quakeRemotePlayerFrameIndexes(frameSet, QUAKE_MULTIPLAYER_REMOTE_DEATH_FRAME_PREFIX)
    : quakeRemotePlayerAnimationFrameIndexes(animationFrames, QUAKE_MULTIPLAYER_REMOTE_DEATH_FRAME_PREFIX);
  const attackFrameIndexesByWeapon = quakeRemotePlayerAttackFrameIndexesByWeapon(frameSet, animationFrames);
  const handle = frameSet
    ? mountQuakeModelFrameSetMesh(scene, frameSet, standFrameIndex)
    : model
    ? mountQuakeModelMesh(scene, model.glyphGeometry)
    : addQuakeProceduralRemotePlayerMesh();
  if (!handle) return null;
  world.pixelate(handle);
  void world.schedulePresentationResync(handle);
  return {
    animationFrames,
    attackFrameIndexesByWeapon,
    clientId: "",
    currentFrameIndex: standFrameIndex,
    fullFrameSet: frameSet,
    handle,
    deathFrameIndexes,
    painFrameIndexes,
    playerId: "",
    runFrameIndexes,
    scale: model?.renderScale ? 1 / model.renderScale : 1,
    standFrameIndex,
    zOffset: model ? quakeRemotePlayerModelZOffset(model) : -QUAKE_MULTIPLAYER_REMOTE_PLAYER_EYE_HEIGHT,
  };
}

function quakeRemotePlayerModel(): QuakePickupModel | null {
  const library = currentPickupModelLibrary;
  if (!library) return null;
  for (const modelPath of QUAKE_MULTIPLAYER_REMOTE_MODEL_PATHS) {
    const model = library.models[modelPath];
    if (model) return model;
  }
  return null;
}

function syncQuakeRemotePlayerVisual(
  remote: QuakeRemotePlayerMeshMount,
  state: QuakeMultiplayerRemoteInterpolationState,
): void {
  const frameIndex = quakeRemotePlayerVisualFrameIndex(remote, state);
  syncQuakeRemotePlayerMeshFrame(remote, frameIndex);
  remote.handle.element.hidden = false;
  const rotY = quakeRemotePlayerVisualRotY(state);
  const appliedRotY = rotY + quakeRemotePlayerVisualRotYOffset(remote.handle.element);
  const origin = quakeRemotePlayerVisualOrigin(state.renderOrigin, remote.zOffset);
  remote.handle.setTransform({
    position: origin,
    rotation: [0, 0, appliedRotY],
    scale: remote.scale,
  });
  const geometry = remote.animationFrames[frameIndex]?.glyphGeometry ?? remote.fullFrameSet?.baseGeometry;
  if (geometry) {
    quakeGlyphOverlay?.setEntity(quakeRemotePlayerGlyphId(remote), geometry, {
      position: origin,
      rotation: [0, 0, appliedRotY],
      scale: remote.scale,
    });
  }
  syncQuakeRemotePlayerPoseMetadata(remote, state, origin, rotY, appliedRotY);
}

function quakeRemotePlayerGlyphId(remote: QuakeRemotePlayerMeshMount): string {
  return `remote-player:${remote.playerId || remote.clientId}`;
}

function syncQuakeRemotePlayerElementMetadata(remote: QuakeRemotePlayerMeshMount): void {
  remote.handle.element.classList.add("remote-player", "remote-player-prototype");
  remote.handle.element.dataset.playerId = remote.playerId;
  remote.handle.element.dataset.clientId = remote.clientId;
  if (remote.color) {
    remote.handle.element.dataset.playerColor = remote.color;
    remote.handle.element.style.setProperty("--quake-multiplayer-player-color", remote.color);
  }
}

function syncQuakeRemotePlayerMeshFrame(remote: QuakeRemotePlayerMeshMount, frameIndex: number): void {
  if (remote.fullFrameSet) {
    setQuakeModelFrameSetHandleFrame(remote.handle, frameIndex);
    remote.currentFrameIndex = frameIndex;
    syncQuakeRemotePlayerFrameMetadata(remote, frameIndex, remote.fullFrameSet.frames[frameIndex]?.name);
    return;
  }
  if (remote.currentFrameIndex === frameIndex) {
    syncQuakeRemotePlayerFrameMetadata(remote, frameIndex, quakeRemotePlayerAnimationFrameName(remote, frameIndex));
    return;
  }
  const frame = remote.animationFrames[frameIndex];
  if (!frame) return;
  remote.handle.setPolygons(frame.glyphGeometry
    ? frame.glyphGeometry.polygons.map((polygon) => ({ vertices: polygon.v, color: polygon.c }))
    : []);
  remote.currentFrameIndex = frameIndex;
  syncQuakeRemotePlayerFrameMetadata(remote, frameIndex, frame.name);
}

function syncQuakeRemotePlayerFrameMetadata(
  remote: QuakeRemotePlayerMeshMount,
  frameIndex: number,
  frameName: string | undefined,
): void {
  remote.handle.element.dataset.remoteFrameIndex = String(frameIndex);
  if (frameName) {
    remote.handle.element.dataset.remoteFrameName = frameName;
  } else {
    delete remote.handle.element.dataset.remoteFrameName;
  }
}

function syncQuakeRemotePlayerPoseMetadata(
  remote: QuakeRemotePlayerMeshMount,
  state: QuakeMultiplayerRemoteInterpolationState,
  origin: Vec3,
  visualRotY: number,
  appliedRotY: number,
): void {
  remote.handle.element.dataset.remoteAlive = state.alive ? "true" : "false";
  remote.handle.element.dataset.remoteAppliedRotY = quakeRemotePlayerMetadataNumber(appliedRotY);
  syncQuakeRemotePlayerOptionalMetadata(remote.handle.element, "remoteLastAttackAt", state.lastAttackAt);
  syncQuakeRemotePlayerOptionalMetadata(remote.handle.element, "remoteLastPainAt", state.lastPainAt);
  remote.handle.element.dataset.remoteOrigin = origin.map(quakeRemotePlayerMetadataNumber).join(",");
  remote.handle.element.dataset.remoteRenderAt = quakeRemotePlayerMetadataNumber(state.renderAt);
  remote.handle.element.dataset.remoteRenderRotY = quakeRemotePlayerMetadataNumber(state.renderRotY);
  remote.handle.element.dataset.remoteStale = state.stale ? "true" : "false";
  remote.handle.element.dataset.remoteVisualRotY = quakeRemotePlayerMetadataNumber(visualRotY);
}

function syncQuakeRemotePlayerOptionalMetadata(
  element: HTMLElement,
  key: string,
  value: number | undefined,
): void {
  if (value === undefined) {
    delete element.dataset[key];
    return;
  }
  element.dataset[key] = quakeRemotePlayerMetadataNumber(value);
}

function quakeRemotePlayerMetadataNumber(value: number): string {
  return Number.isFinite(value) ? value.toFixed(4) : "0.0000";
}

function quakeRemotePlayerAnimationFrameName(
  remote: QuakeRemotePlayerMeshMount,
  frameIndex: number,
): string | undefined {
  return remote.animationFrames[frameIndex]?.name ?? remote.fullFrameSet?.frames[frameIndex]?.name;
}

function quakeRemotePlayerDefaultFrameIndex(frameSet: QuakeModelFrameSet): number {
  const frameIndex = frameSet.frames.findIndex((frame) => frame.name === QUAKE_MULTIPLAYER_REMOTE_DEFAULT_FRAME);
  return frameIndex >= 0 ? frameIndex : 0;
}

function quakeRemotePlayerDefaultAnimationFrameIndex(
  frames: readonly QuakePickupModelAnimationFrame[],
): number {
  const frameIndex = frames.findIndex((frame) => frame.name === QUAKE_MULTIPLAYER_REMOTE_DEFAULT_FRAME);
  return frameIndex >= 0 ? frameIndex : 0;
}

function quakeRemotePlayerFrameIndexes(
  frameSet: QuakeModelFrameSet,
  prefix: string,
): readonly number[] {
  return frameSet.frames
    .map((frame, index) => ({ frame, index }))
    .filter(({ frame }) => frame.name.startsWith(prefix))
    .map(({ index }) => index);
}

function quakeRemotePlayerFrameIndexesByName(
  frameSet: QuakeModelFrameSet,
  frameNames: readonly string[],
): readonly number[] {
  const desired = new Set(frameNames);
  return frameSet.frames
    .map((frame, index) => ({ frame, index }))
    .filter(({ frame }) => desired.has(frame.name))
    .map(({ index }) => index);
}

function quakeRemotePlayerAnimationFrameIndexes(
  frames: readonly QuakePickupModelAnimationFrame[],
  prefix: string,
): readonly number[] {
  return frames
    .map((frame, index) => ({ frame, index }))
    .filter(({ frame }) => frame.name.startsWith(prefix))
    .map(({ index }) => index);
}

function quakeRemotePlayerAnimationFrameIndexesByName(
  frames: readonly QuakePickupModelAnimationFrame[],
  frameNames: readonly string[],
): readonly number[] {
  const desired = new Set(frameNames);
  return frames
    .map((frame, index) => ({ frame, index }))
    .filter(({ frame }) => desired.has(frame.name))
    .map(({ index }) => index);
}

function quakeRemotePlayerAttackFrameIndexesByWeapon(
  frameSet: QuakeModelFrameSet | undefined,
  frames: readonly QuakePickupModelAnimationFrame[],
): Record<string, readonly number[]> {
  const indexes: Record<string, readonly number[]> = {};
  for (const [weapon, frameNames] of Object.entries(QUAKE_MULTIPLAYER_REMOTE_ATTACK_FRAME_NAMES_BY_WEAPON)) {
    indexes[weapon] = frameSet
      ? quakeRemotePlayerFrameIndexesByName(frameSet, frameNames)
      : quakeRemotePlayerAnimationFrameIndexesByName(frames, frameNames);
  }
  return indexes;
}

function quakeRemotePlayerVisualFrameIndex(
  remote: QuakeRemotePlayerMeshMount,
  state: QuakeMultiplayerRemoteInterpolationState,
): number {
  if (!state.alive) {
    return quakeRemotePlayerVisualTimelineFrameIndex(
      remote.deathFrameIndexes,
      state.deathAt ?? state.renderAt,
      state.renderAt,
      QUAKE_MULTIPLAYER_REMOTE_DEATH_FPS,
      false,
      remote.standFrameIndex,
    );
  }
  if (state.lastPainAt !== undefined) {
    const painFrameIndex = quakeRemotePlayerVisualTransientFrameIndex(
      remote.painFrameIndexes,
      state.lastPainAt,
      state.renderAt,
      QUAKE_MULTIPLAYER_REMOTE_PAIN_FPS,
    );
    if (painFrameIndex !== null) return painFrameIndex;
  }
  if (state.lastAttackAt !== undefined) {
    const attackFrameIndex = quakeRemotePlayerVisualTransientFrameIndex(
      quakeRemotePlayerAttackFrameIndexes(remote, state.lastAttackWeapon),
      state.lastAttackAt,
      state.renderAt,
      QUAKE_MULTIPLAYER_REMOTE_ATTACK_FPS,
    );
    if (attackFrameIndex !== null) return attackFrameIndex;
  }
  const speed = quakeRemotePlayerHorizontalSpeed(state);
  if (speed < QUAKE_MULTIPLAYER_REMOTE_RUN_SPEED_THRESHOLD || !remote.runFrameIndexes.length) {
    return remote.standFrameIndex;
  }
  const runFrame = Math.floor(state.renderAt / (1000 / QUAKE_MULTIPLAYER_REMOTE_RUN_FPS));
  return remote.runFrameIndexes[runFrame % remote.runFrameIndexes.length] ?? remote.standFrameIndex;
}

function quakeRemotePlayerAttackFrameIndexes(
  remote: QuakeRemotePlayerMeshMount,
  weapon: string | undefined,
): readonly number[] {
  if (!weapon) return [];
  return remote.attackFrameIndexesByWeapon[weapon] ?? [];
}

function quakeRemotePlayerVisualTransientFrameIndex(
  frameIndexes: readonly number[],
  startedAt: number,
  renderAt: number,
  fps: number,
): number | null {
  if (!frameIndexes.length || fps <= 0) return null;
  const frameMs = 1000 / fps;
  const elapsedMs = renderAt - startedAt;
  if (elapsedMs >= frameIndexes.length * frameMs) return null;
  const frame = Math.floor(Math.max(0, elapsedMs) / frameMs);
  return frameIndexes[Math.min(frame, frameIndexes.length - 1)] ?? null;
}

function quakeRemotePlayerVisualTimelineFrameIndex(
  frameIndexes: readonly number[],
  startedAt: number,
  renderAt: number,
  fps: number,
  loop: boolean,
  fallbackFrameIndex: number,
): number {
  if (!frameIndexes.length || fps <= 0) return fallbackFrameIndex;
  const frame = Math.floor(Math.max(0, renderAt - startedAt) / (1000 / fps));
  const index = loop ? frame % frameIndexes.length : Math.min(frame, frameIndexes.length - 1);
  return frameIndexes[index] ?? fallbackFrameIndex;
}

function quakeRemotePlayerModelZOffset(model: QuakePickupModel): number {
  return -QUAKE_MULTIPLAYER_REMOTE_PLAYER_EYE_HEIGHT - (model.bounds?.min[2] ?? 0);
}

function quakeRemotePlayerVisualOrigin(origin: Vec3, zOffset: number): Vec3 {
  return [
    origin[0],
    origin[1],
    origin[2] + zOffset,
  ];
}

function quakeRemotePlayerVisualRotY(state: QuakeMultiplayerRemoteInterpolationState): number {
  const speed = quakeRemotePlayerHorizontalSpeed(state);
  if (speed < QUAKE_MULTIPLAYER_REMOTE_RUN_SPEED_THRESHOLD) return state.renderRotY;
  return normalizeQuakeUrlAngle((Math.atan2(state.renderVelocity[1], state.renderVelocity[0]) * 180) / Math.PI);
}

function quakeRemotePlayerHorizontalSpeed(state: QuakeMultiplayerRemoteInterpolationState): number {
  return Math.hypot(state.renderVelocity[0], state.renderVelocity[1]);
}

function quakeRemotePlayerVisualRotYOffset(element: HTMLElement): number {
  return element.classList.contains("remote-player-fallback")
    ? QUAKE_MULTIPLAYER_REMOTE_FALLBACK_ROT_Y_OFFSET
    : QUAKE_MULTIPLAYER_REMOTE_MODEL_ROT_Y_OFFSET;
}

function addQuakeProceduralRemotePlayerMesh(): QuakeMeshHandle | null {
  const polygons = quakeRemotePlayerFallbackPolygons();
  if (!polygons.length) return null;
  const handle = scene.add(makeParseResult(polygons), {
    merge: false,
    meshResolution: "lossless",
    excludeFromAutoCenter: true,
  });
  handle.element.classList.add("remote-player-fallback");
  return handle;
}

function quakeRemotePlayerFallbackPolygons(): Polygon[] {
  const halfWidth = 0.22;
  const halfDepth = 0.14;
  const height = 1.58;
  const shoulder = 1.2;
  const head = 1.72;
  const minX = -halfWidth;
  const maxX = halfWidth;
  const minY = -halfDepth;
  const maxY = halfDepth;
  return [
    quakeRemotePlayerQuad([minX, minY, 0], [maxX, minY, 0], [maxX, minY, shoulder], [minX, minY, shoulder], "#49656f"),
    quakeRemotePlayerQuad([maxX, maxY, 0], [minX, maxY, 0], [minX, maxY, shoulder], [maxX, maxY, shoulder], "#314b53"),
    quakeRemotePlayerQuad([minX, maxY, 0], [minX, minY, 0], [minX, minY, shoulder], [minX, maxY, shoulder], "#253940"),
    quakeRemotePlayerQuad([maxX, minY, 0], [maxX, maxY, 0], [maxX, maxY, shoulder], [maxX, minY, shoulder], "#38555e"),
    quakeRemotePlayerQuad([-0.16, -0.1, shoulder], [0.16, -0.1, shoulder], [0.16, -0.1, head], [-0.16, -0.1, head], "#b59162"),
    quakeRemotePlayerQuad([-0.12, -0.12, height], [0.12, -0.12, height], [0.12, 0.12, height], [-0.12, 0.12, height], "#6c3f2a"),
  ];
}

function quakeRemotePlayerQuad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, color: string): Polygon {
  return {
    color,
    vertices: [a, b, c, d],
  };
}

function quakeUrlRouteView(route: QuakeUrlRoute): QuakeCssView | null {
  return quakeRoute.routeView(route);
}

function quakeMapLoadView(options: QuakeMapLoadOptions): QuakeCssView | null {
  return quakeRoute.mapLoadView(options);
}

function currentQuakeMultiplayerRoomKey(): QuakeMultiplayerRoomCompatibilityKey | null {
  if (!currentResult) return null;
  const sceneUrl = quakeSceneUrlForCurrentMode(currentMapName);
  if (!sceneUrl) return null;
  return {
    mapName: currentMapName,
    assetManifestVersion: quakeAssetCatalog.version(),
    assetRoot: quakeAssetCatalog.assetRoot() ?? QUAKE_ASSET_ROOT,
    sceneUrl: new URL(sceneUrl, window.location.href).href,
  };
}

function applyQuakeMultiplayerInitialSpawnHint(): void {
  if (!QUAKE_MULTIPLAYER_ENABLED || !currentResult || quakeMultiplayerLocalSpawnId) return;
  const gameplayDefinitions = quakeMultiplayerGameplayDefinitionsFromScene(currentResult, {
    pointToRoom: quakeCameraView.pointToWorld,
    playerEyeHeight: getPlayer().eyeHeight(),
    playerMinsZ: QUAKE_PLAYER_MINS_Z,
  });
  const spawn = quakeMultiplayerDeathmatchSpawnOrder(gameplayDefinitions.deathmatchSpawns)[0];
  if (!spawn) return;
  quakeMultiplayerLocalSpawnId = spawn.spawnId;
  applyQuakeMultiplayerView(spawn.origin, spawn.rotX, spawn.rotY);
}

function quakeMultiplayerRoomId(roomKey: QuakeMultiplayerRoomCompatibilityKey): string {
  return quakeMultiplayerStaticRoomIdForMap(roomKey.mapName) ?? quakeMultiplayerFallbackRoomId(roomKey.mapName);
}

function quakeMultiplayerMatchSettings(): { fragLimit: number; maxPlayers: number } {
  return {
    fragLimit: QUAKE_MULTIPLAYER_FRAG_LIMIT,
    maxPlayers: QUAKE_MULTIPLAYER_MAX_PLAYERS,
  };
}

function mountQuakeMultiplayerScoreboard(root: HTMLElement): HTMLElement {
  const scoreboard = document.createElement("section");
  scoreboard.id = "quake-multiplayer-scoreboard";
  scoreboard.className = "quake-multiplayer-scoreboard";
  scoreboard.setAttribute("aria-label", "Deathmatch scoreboard");
  scoreboard.hidden = true;
  root.append(scoreboard);
  return scoreboard;
}

function syncQuakeMultiplayerScoreboard(
  players: readonly QuakeMultiplayerAuthoritativePlayerState[],
  spectatorCount = 0,
): void {
  if (!quakeMultiplayerScoreboard) return;
  if (!players.length) {
    quakeMultiplayerScoreboard.hidden = true;
    quakeMultiplayerScoreboard.replaceChildren();
    return;
  }
  quakeMultiplayerScoreboard.hidden = false;
  const rows = [...players].sort((a, b) =>
    b.frags - a.frags ||
    a.deaths - b.deaths ||
    a.displayName.localeCompare(b.displayName)
  );
  const table = document.createElement("table");
  table.className = "quake-multiplayer-scoreboard-table";
  const body = document.createElement("tbody");
  for (const playerState of rows) {
    const row = document.createElement("tr");
    row.className = playerState.clientId === QUAKE_MULTIPLAYER_LOCAL_CLIENT_ID
      ? "quake-multiplayer-scoreboard-local"
      : "";
    if (playerState.color) row.style.setProperty("--quake-multiplayer-player-color", playerState.color);
    row.append(
      quakeScoreboardCell(playerState.displayName),
      quakeScoreboardCell(String(playerState.frags), "number"),
      quakeScoreboardCell(String(playerState.deaths), "number"),
      quakeScoreboardCell(playerState.pingMs === undefined ? "-" : String(Math.round(playerState.pingMs)), "number"),
    );
    body.append(row);
  }
  table.append(body);
  const children: HTMLElement[] = [table];
  if (spectatorCount > 0) {
    const spectators = document.createElement("div");
    spectators.className = "quake-multiplayer-scoreboard-spectators quake-bm-label";
    spectators.textContent = quakeMultiplayerSpectatorCountLabel(spectatorCount);
    mountQuakeBitmapText(spectators);
    children.push(spectators);
  }
  quakeMultiplayerScoreboard.replaceChildren(...children);
}

function quakeScoreboardCell(text: string, kind?: "number"): HTMLTableCellElement {
  const cell = document.createElement("td");
  if (kind) cell.className = `quake-multiplayer-scoreboard-${kind}`;
  cell.textContent = text;
  cell.classList.add("quake-bm-label");
  mountQuakeBitmapText(cell);
  return cell;
}

function quakeMultiplayerSpectatorCountLabel(count: number): string {
  return count === 1 ? "1 SPECTATOR" : `${count} SPECTATORS`;
}

function quakeMultiplayerDebugSnapshot(): Record<string, unknown> {
  const status = quakeMultiplayerSession.status();
  return {
    enabled: QUAKE_MULTIPLAYER_ENABLED,
    transport: QUAKE_MULTIPLAYER_TRANSPORT,
    partyHost: QUAKE_MULTIPLAYER_TRANSPORT === "party" ? QUAKE_MULTIPLAYER_PARTY_HOST : null,
    clientId: QUAKE_MULTIPLAYER_LOCAL_CLIENT_ID,
    roomId: quakeMultiplayerStaticRoomIdForMap(currentMapName) ?? quakeMultiplayerFallbackRoomId(currentMapName),
    localPingMs: quakeMultiplayerLocalPingMs,
    sessionState: status.state,
    sessionMode: status.mode,
    roomKey: status.roomKey ?? null,
    helloAccepted: quakeMultiplayerHelloAccepted,
    spectating: quakeMultiplayerSpectating,
    spectatorCount: quakeMultiplayerSpectatorCount,
    spectatorFollowedPlayerId: quakeMultiplayerSpectatorFollowedPlayerId,
    inputPaused: quakeMultiplayerInputPaused,
    inputSequence: quakeMultiplayerInputSequence,
    poseSequence: quakeMultiplayerPoseSequence,
    worldSequence: quakeMultiplayerWorldSequence,
    poseOnly: QUAKE_MULTIPLAYER_DEBUG_POSE_ONLY,
    match: quakeMultiplayerLastMatchState,
    lastRoomEvent: quakeMultiplayerLastRoomEvent,
    recentRoomEvents: quakeMultiplayerRecentRoomEvents,
    lastWorldEvent: quakeMultiplayerLastWorldEvent,
    recentWorldEvents: quakeMultiplayerRecentWorldEvents,
    lastPlayerEvent: quakeMultiplayerLastPlayerEvent,
    recentPlayerEvents: quakeMultiplayerRecentPlayerEvents,
    lastPickupEvent: quakeMultiplayerLastPickupEvent,
    lastMatchEvent: quakeMultiplayerLastMatchEvent,
    lastReject: quakeMultiplayerLastReject,
    lastError: quakeMultiplayerLastError,
    remotePresenterCount: quakeRemotePlayers.count(),
    remoteProjectileCount: quakeRemoteMultiplayerProjectiles.size,
    remoteDomCount: document.querySelectorAll(".remote-player").length,
    remoteVisibleDomCount: Array.from(document.querySelectorAll<HTMLElement>(".remote-player"))
      .filter((element) => !element.hidden).length,
    remoteProjectileDomCount: document.querySelectorAll(".remote-projectile").length,
    remoteVisibleProjectileDomCount: Array.from(document.querySelectorAll<HTMLElement>(".remote-projectile"))
      .filter((element) => !element.hidden).length,
    scoreboardRows: quakeMultiplayerScoreboard?.querySelectorAll("tbody tr").length ?? 0,
  };
}

function startQuakeMultiplayerScene(): void {
  stopQuakeMultiplayerScene("scene-restart");
  if (!QUAKE_MULTIPLAYER_ENABLED || quakeAppDisposed) return;
  const roomKey = currentQuakeMultiplayerRoomKey();
  if (!roomKey) return;
  applyQuakeMultiplayerInitialSpawnHint();
  const sceneSerial = ++quakeMultiplayerSceneSerial;
  void quakeMultiplayerSession.connect({
    roomKey,
    clientId: QUAKE_MULTIPLAYER_LOCAL_CLIENT_ID,
    displayName: QUAKE_MULTIPLAYER_LOCAL_DISPLAY_NAME,
    color: QUAKE_MULTIPLAYER_LOCAL_COLOR,
  }).then((status) => {
    if (
      quakeAppDisposed ||
      sceneSerial !== quakeMultiplayerSceneSerial ||
      status.state !== "connected"
    ) {
      return;
    }
    sendQuakeMultiplayerHello(roomKey);
    scheduleQuakeMultiplayerPoseFrame();
  }).catch((error: unknown) => {
    console.warn("[cssQuake] Multiplayer session failed.", error);
  });
}

function stopQuakeMultiplayerScene(
  reason: string,
  options: { preserveLastReject?: boolean } = {},
): void {
  quakeMultiplayerSceneSerial++;
  if (quakeMultiplayerPoseFrame) {
    window.cancelAnimationFrame(quakeMultiplayerPoseFrame);
    quakeMultiplayerPoseFrame = 0;
  }
  quakeMultiplayerLastInputAt = 0;
  quakeMultiplayerLastInputSentAt = 0;
  quakeMultiplayerPendingInputs = [];
  quakeMultiplayerLastPoseAt = 0;
  quakeMultiplayerLastPresenceStatusSent = null;
  quakeMultiplayerHelloAccepted = false;
  quakeMultiplayerSpectatorCount = 0;
  setQuakeMultiplayerSpectating(false);
  quakeMultiplayerLocalSpawnId = null;
  quakeMultiplayerLocalPingMs = null;
  quakeMultiplayerLastReconciledInputSequence = 0;
  quakeMultiplayerLastInventoryFingerprint = null;
  quakeMultiplayerDynamicPickupDefinitions.clear();
  pickups?.clearRuntimePickups();
  quakeMultiplayerPickupRequestAt.clear();
  quakeMultiplayerWorldRequestAt.clear();
  quakeMultiplayerLastRoomEvent = null;
  quakeMultiplayerRecentRoomEvents = [];
  quakeMultiplayerLastWorldEvent = null;
  quakeMultiplayerRecentWorldEvents = [];
  quakeMultiplayerLastPlayerEvent = null;
  quakeMultiplayerRecentPlayerEvents = [];
  quakeMultiplayerLastPickupEvent = null;
  quakeMultiplayerLastMatchState = null;
  quakeMultiplayerLastMatchEvent = null;
  if (!options.preserveLastReject) quakeMultiplayerLastReject = null;
  quakeMultiplayerLastError = null;
  quakeMultiplayerSession.disconnect(reason);
  quakeRemotePlayers.clear();
  clearQuakeMultiplayerRemoteProjectiles();
  syncQuakeMultiplayerScoreboard([]);
}

function setQuakeMultiplayerSpectating(
  spectating: boolean,
  followedPlayer?: QuakeMultiplayerAuthoritativePlayerState | null,
): void {
  const previousSpectating = quakeMultiplayerSpectating;
  quakeMultiplayerSpectating = spectating;
  quakeMultiplayerSpectatorFollowedPlayerId = spectating && followedPlayer ? followedPlayer.playerId : null;
  if (spectating && quakeMultiplayerPoseFrame) {
    window.cancelAnimationFrame(quakeMultiplayerPoseFrame);
    quakeMultiplayerPoseFrame = 0;
  }
  if (spectating && quakeClickToPlayCenterPrintVisible) {
    quakeClickToPlayCenterPrintVisible = false;
  }
  syncQuakeViewmodelVisibility();
  if (!spectating) {
    quakeMultiplayerSpectatorCenterPrint = "";
    if (previousSpectating) quakeTextPresentation.clearCenterPrint();
    return;
  }
  const nextText = followedPlayer
    ? `SPECTATING\n${followedPlayer.displayName}\n${quakeMultiplayerSpectatorCountLabel(quakeMultiplayerSpectatorCount)}`
    : `SPECTATING\n${quakeMultiplayerSpectatorCountLabel(quakeMultiplayerSpectatorCount)}`;
  if (nextText === quakeMultiplayerSpectatorCenterPrint) return;
  quakeMultiplayerSpectatorCenterPrint = nextText;
  quakeTextPresentation.setCenterPrint(nextText);
}

function handleQuakeMultiplayerRoomMessage(message: QuakeMultiplayerRoomEnvelope): void {
  if (!QUAKE_MULTIPLAYER_ENABLED) return;
  if (message.type === "room.snapshot") {
    quakeMultiplayerLastMatchState = message.payload.match;
    quakeMultiplayerSpectatorCount = message.payload.spectators?.length ?? 0;
    syncQuakeMultiplayerScoreboard(message.payload.players, quakeMultiplayerSpectatorCount);
    if (message.payload.dynamicPickups) syncQuakeMultiplayerDynamicPickups(message.payload.dynamicPickups);
    if (message.payload.pickups) syncQuakeMultiplayerPickupStates(message.payload.pickups);
    if (message.payload.projectiles) syncQuakeMultiplayerRemoteProjectileStates(message.payload.projectiles);
    const localPlayer = message.payload.players.find((candidate) =>
      candidate.clientId === QUAKE_MULTIPLAYER_LOCAL_CLIENT_ID
    );
    quakeMultiplayerLocalPingMs = localPlayer?.pingMs ?? null;
    if (localPlayer) {
      setQuakeMultiplayerSpectating(false);
      quakeMultiplayerHelloAccepted = true;
      applyQuakeMultiplayerAuthoritativePlayerState(localPlayer);
    } else if (message.payload.spectators?.some((spectator) =>
      spectator.clientId === QUAKE_MULTIPLAYER_LOCAL_CLIENT_ID
    )) {
      quakeMultiplayerHelloAccepted = true;
      applyQuakeMultiplayerSpectatorSnapshot(message.payload.players);
    }
    quakeRemotePlayers.handleRoomMessage(message);
  } else if (message.type === "room.event") {
    quakeRemotePlayers.handleRoomMessage(message);
    const event = message.payload.event;
    noteQuakeMultiplayerRoomEvent(event);
    noteQuakeMultiplayerWorldEvent(event);
    noteQuakeMultiplayerMatchEvent(event);
    noteQuakeMultiplayerPickupEvent(event);
    if (event.eventType === "player.respawned") {
      const playerState = event.player;
      if (playerState.clientId === QUAKE_MULTIPLAYER_LOCAL_CLIENT_ID) {
        quakeMultiplayerLocalSpawnId = null;
        applyQuakeMultiplayerAuthoritativePlayerState(playerState);
      }
    } else if (event.eventType === "pickup.taken") {
      const localPlayerId = quakeMultiplayerPlayerIdForClient(QUAKE_MULTIPLAYER_LOCAL_CLIENT_ID);
      getPickups().applyAuthoritativePickup(event.entityIndex, {
        applyEffect: event.playerId === localPlayerId,
        feedback: event.feedback,
        hide: !event.leaveInPlace,
      });
      if (!event.leaveInPlace) quakeMultiplayerDynamicPickupDefinitions.delete(event.entityIndex);
    } else if (event.eventType === "pickup.respawned") {
      getPickups().applyAuthoritativeRespawn(event.pickup.entityIndex);
    } else if (event.eventType === "pickup.dropped") {
      syncQuakeMultiplayerDynamicPickups([event.definition], { pruneMissing: false });
    } else if (event.eventType === "pickup.expired") {
      removeQuakeMultiplayerDynamicPickup(event.entityIndex);
    } else if (event.eventType === "player.damaged") {
      handleQuakeMultiplayerPlayerDamaged(event);
    } else if (event.eventType === "player.killed") {
      handleQuakeMultiplayerPlayerKilled(event);
    } else if (event.eventType === "projectile.spawned") {
      handleQuakeMultiplayerProjectileSpawned(event);
    } else if (event.eventType === "projectile.impacted") {
      handleQuakeMultiplayerProjectileImpacted(event);
    } else if (event.eventType === "world.changed") {
      handleQuakeMultiplayerWorldChanged(event);
    } else if (event.eventType === "world.teleport") {
      handleQuakeMultiplayerWorldTeleport(event);
    } else if (event.eventType === "world.push") {
      handleQuakeMultiplayerWorldPush(event);
    } else if (event.eventType === "world.trigger") {
      handleQuakeMultiplayerWorldTrigger(event);
    } else if (event.eventType === "world.mover") {
      handleQuakeMultiplayerWorldMover(event);
    } else if (event.eventType === "world.targets") {
      handleQuakeMultiplayerWorldTargets(event);
    }
  } else if (message.type === "room.ping") {
    sendQuakeMultiplayerPong(message.payload);
  } else if (message.type === "room.reject") {
    handleQuakeMultiplayerRoomReject(message.payload);
  } else if (message.type === "room.error") {
    handleQuakeMultiplayerRoomError(message.payload);
  }
}

function handleQuakeMultiplayerRoomReject(payload: QuakeMultiplayerRoomRejectPayload): void {
  quakeMultiplayerLastReject = {
    code: payload.code,
    message: payload.message,
    recoverable: payload.recoverable,
    ...(payload.rejectedMessageId ? { rejectedMessageId: payload.rejectedMessageId } : {}),
    ...(payload.retryAfterMs !== undefined ? { retryAfterMs: payload.retryAfterMs } : {}),
    ...(payload.details ? { details: payload.details } : {}),
  };
  const label = quakeMultiplayerRejectLabel(payload.code);
  const fatalTitle = payload.recoverable ? null : quakeMultiplayerFatalRejectTitle(payload.code);
  if (fatalTitle) {
    stopQuakeMultiplayerScene(`reject:${payload.code}`, { preserveLastReject: true });
    quakeTextPresentation.clear();
    menu.showMultiplayerFailure(fatalTitle);
    return;
  }
  if (!payload.recoverable && payload.code !== "unsupported") {
    quakeTextPresentation.notify(`Multiplayer rejected: ${label}`);
  }
}

function handleQuakeMultiplayerRoomError(payload: QuakeMultiplayerRoomErrorPayload): void {
  quakeMultiplayerLastError = {
    code: payload.code,
    message: payload.message,
    recoverable: payload.recoverable,
    ...(payload.details ? { details: payload.details } : {}),
  };
  if (!payload.recoverable) {
    quakeTextPresentation.notify(`Multiplayer error: ${payload.code}`);
  }
}

function quakeMultiplayerRejectLabel(code: QuakeMultiplayerRoomRejectPayload["code"]): string {
  switch (code) {
    case "wrong-map":
      return "wrong map";
    case "wrong-protocol":
      return "wrong protocol";
    case "room-full":
      return "room full";
    case "not-authorized":
      return "not authorized";
    default:
      return code;
  }
}

function quakeMultiplayerFatalRejectTitle(code: QuakeMultiplayerRoomRejectPayload["code"]): string | null {
  switch (code) {
    case "room-full":
      return "ROOM FULL";
    case "wrong-map":
      return "WRONG MAP";
    case "wrong-protocol":
      return "WRONG VERSION";
    case "not-authorized":
      return "NOT AUTHORIZED";
    default:
      return null;
  }
}

function noteQuakeMultiplayerMatchEvent(event: QuakeMultiplayerSharedWorldEvent): void {
  if (event.eventType !== "match.notice") return;
  quakeMultiplayerLastMatchEvent = {
    eventType: event.eventType,
    eventId: event.eventId,
    roomTime: event.roomTime,
    code: event.code,
    ...(event.message ? { message: event.message } : {}),
  };
}

function noteQuakeMultiplayerRoomEvent(event: QuakeMultiplayerSharedWorldEvent): void {
  const snapshot = {
    eventType: event.eventType,
    eventId: event.eventId,
    roomTime: event.roomTime,
    ...("playerId" in event && event.playerId !== undefined ? { playerId: event.playerId } : {}),
    ...("status" in event && event.status !== undefined ? { status: event.status } : {}),
    ...("entityIndex" in event && event.entityIndex !== undefined ? { entityIndex: event.entityIndex } : {}),
    ...("classname" in event && event.classname !== undefined ? { classname: event.classname } : {}),
    ...("activation" in event && event.activation !== undefined ? { activation: event.activation } : {}),
    ...("code" in event && event.code !== undefined ? { code: event.code } : {}),
    ...("projectileId" in event && event.projectileId !== undefined ? { projectileId: event.projectileId } : {}),
    ...("projectile" in event && event.projectile !== undefined ? { projectileId: event.projectile.projectileId } : {}),
    ...("weapon" in event && event.weapon !== undefined ? { weapon: event.weapon } : {}),
  };
  quakeMultiplayerLastRoomEvent = snapshot;
  quakeMultiplayerRecentRoomEvents = [...quakeMultiplayerRecentRoomEvents.slice(-15), snapshot];
}

function noteQuakeMultiplayerWorldEvent(event: QuakeMultiplayerSharedWorldEvent): void {
  if (!event.eventType.startsWith("world.") && event.eventType !== "level.transition") return;
  const snapshot = {
    eventType: event.eventType,
    eventId: event.eventId,
    roomTime: event.roomTime,
    ...("entityIndex" in event && event.entityIndex !== undefined ? { entityIndex: event.entityIndex } : {}),
    ...("classname" in event ? { classname: event.classname } : {}),
    ...("activation" in event ? { activation: event.activation } : {}),
    ...("origin" in event ? { origin: event.origin } : {}),
    ...("velocity" in event ? { velocity: event.velocity } : {}),
    ...("state" in event ? { state: event.state } : {}),
    ...("destinationEntityIndex" in event && event.destinationEntityIndex !== undefined
      ? { destinationEntityIndex: event.destinationEntityIndex }
      : {}),
    ...("fromOrigin" in event ? { fromOrigin: event.fromOrigin } : {}),
    ...("toOrigin" in event ? { toOrigin: event.toOrigin } : {}),
    ...("speed" in event ? { speed: event.speed } : {}),
    ...("moveMs" in event ? { moveMs: event.moveMs } : {}),
    ...("returnDelayMs" in event && event.returnDelayMs !== undefined
      ? { returnDelayMs: event.returnDelayMs }
      : {}),
    ...("targetEntityIndexes" in event ? { targetEntityIndexes: event.targetEntityIndexes } : {}),
    ...("killtargetEntityIndexes" in event && event.killtargetEntityIndexes !== undefined
      ? { killtargetEntityIndexes: event.killtargetEntityIndexes }
      : {}),
    ...("delayMs" in event ? { delayMs: event.delayMs } : {}),
    ...("waitMs" in event ? { waitMs: event.waitMs } : {}),
    ...("oneShot" in event ? { oneShot: event.oneShot } : {}),
    ...("soundPath" in event && event.soundPath ? { soundPath: event.soundPath } : {}),
    ...("playerId" in event && event.playerId !== undefined ? { playerId: event.playerId } : {}),
  };
  quakeMultiplayerLastWorldEvent = snapshot;
  quakeMultiplayerRecentWorldEvents = [...quakeMultiplayerRecentWorldEvents.slice(-15), snapshot];
}

function noteQuakeMultiplayerPickupEvent(event: QuakeMultiplayerSharedWorldEvent): void {
  if (!event.eventType.startsWith("pickup.")) return;
  quakeMultiplayerLastPickupEvent = {
    eventType: event.eventType,
    eventId: event.eventId,
    roomTime: event.roomTime,
    ...("playerId" in event ? { playerId: event.playerId } : {}),
    ...("pickupId" in event && event.pickupId !== undefined ? { pickupId: event.pickupId } : {}),
    ...("entityIndex" in event ? { entityIndex: event.entityIndex } : {}),
    ...("effect" in event ? { effect: event.effect } : {}),
    ...("leaveInPlace" in event ? { leaveInPlace: event.leaveInPlace } : {}),
    ...("respawnAt" in event && event.respawnAt !== undefined ? { respawnAt: event.respawnAt } : {}),
    ...("feedback" in event && event.feedback !== undefined ? { feedback: event.feedback } : {}),
    ...("reason" in event ? { reason: event.reason } : {}),
    ...("pickup" in event ? {
      pickup: event.pickup,
      entityIndex: event.pickup.entityIndex,
      pickupId: event.pickup.pickupId,
    } : {}),
  };
}

function noteQuakeMultiplayerPlayerEvent(
  event: Extract<QuakeMultiplayerSharedWorldEvent, { eventType: "player.damaged" | "player.killed" }>,
): void {
  const snapshot = {
    eventType: event.eventType,
    eventId: event.eventId,
    roomTime: event.roomTime,
    victimPlayerId: event.victimPlayerId,
    ...("attackerPlayerId" in event && event.attackerPlayerId ? { attackerPlayerId: event.attackerPlayerId } : {}),
    ...("damage" in event ? { damage: event.damage } : {}),
    ...("health" in event ? { health: event.health } : {}),
    ...("armor" in event ? { armor: event.armor } : {}),
    ...(event.damageSource ? { damageSource: event.damageSource } : {}),
  };
  quakeMultiplayerLastPlayerEvent = snapshot;
  quakeMultiplayerRecentPlayerEvents = [...quakeMultiplayerRecentPlayerEvents.slice(-15), snapshot];
}

function applyQuakeMultiplayerSpectatorSnapshot(
  players: readonly QuakeMultiplayerAuthoritativePlayerState[],
): void {
  const followed = chooseQuakeMultiplayerSpectatorPlayer(players);
  setQuakeMultiplayerSpectating(true, followed);
  if (!followed) return;
  applyQuakeMultiplayerAuthoritativeView(followed);
}

function chooseQuakeMultiplayerSpectatorPlayer(
  players: readonly QuakeMultiplayerAuthoritativePlayerState[],
): QuakeMultiplayerAuthoritativePlayerState | null {
  const current = quakeMultiplayerSpectatorFollowedPlayerId
    ? players.find((candidate) =>
      candidate.playerId === quakeMultiplayerSpectatorFollowedPlayerId && candidate.alive
    )
    : null;
  return current ?? players.find((candidate) => candidate.alive) ?? players[0] ?? null;
}

function applyQuakeMultiplayerAuthoritativePlayerState(
  playerState: QuakeMultiplayerAuthoritativePlayerState,
): void {
  if (!player || !currentResult) return;
  const inventory = getPlayer().inventory();
  const inventoryFingerprint = quakeMultiplayerAuthoritativeInventoryFingerprint(playerState);
  const inventoryChanged = inventoryFingerprint !== quakeMultiplayerLastInventoryFingerprint;
  if (playerState.inventory) {
    if (inventoryChanged) applyQuakeMultiplayerInventoryState(playerState.inventory);
  } else {
    if (inventoryChanged) {
      inventory.health = playerState.health;
      inventory.armor = playerState.armor;
      if (isQuakeWeaponId(playerState.activeWeapon)) inventory.activeWeapon = playerState.activeWeapon;
    }
  }
  if (inventoryChanged) {
    quakeMultiplayerLastInventoryFingerprint = inventoryFingerprint;
    syncQuakeHud();
  }
  if (playerState.spawnId && playerState.spawnId !== quakeMultiplayerLocalSpawnId) {
    quakeMultiplayerLocalSpawnId = playerState.spawnId;
    quakeMultiplayerLastReconciledInputSequence = playerState.lastInputSequence;
    applyQuakeMultiplayerAuthoritativeView(playerState);
  }
  if (!playerState.alive && !quakePlayerDead) {
    quakeMultiplayerLastReconciledInputSequence = playerState.lastInputSequence;
    showQuakePlayerDeath();
  } else if (playerState.alive && quakePlayerDead) {
    clearQuakePlayerDeath();
    quakeMultiplayerLastReconciledInputSequence = playerState.lastInputSequence;
    applyQuakeMultiplayerAuthoritativeView(playerState);
  } else if (playerState.alive) {
    applyQuakeMultiplayerLocalCorrection(playerState);
  }
}

function applyQuakeMultiplayerLocalCorrection(
  playerState: QuakeMultiplayerAuthoritativePlayerState,
): void {
  const decision = decideQuakeMultiplayerLocalCorrection(
    getPlayer().currentOrigin(),
    playerState,
    quakeMultiplayerLastReconciledInputSequence,
    {
      hardSnapDistance: QUAKE_MULTIPLAYER_HARD_CORRECTION_DISTANCE,
      softCorrectionDistance: QUAKE_MULTIPLAYER_SOFT_CORRECTION_DISTANCE,
      maxBlendDistance: QUAKE_MULTIPLAYER_MAX_BLEND_CORRECTION_DISTANCE,
      blendFraction: 0.35,
    },
  );
  if (decision.reason === "within-threshold" || decision.action === "snap") {
    quakeMultiplayerLastReconciledInputSequence = Math.max(
      quakeMultiplayerLastReconciledInputSequence,
      decision.inputSequence,
    );
  }
  if (decision.action !== "snap" && decision.action !== "blend") return;
  const origin: [number, number, number] = [
    decision.origin[0],
    decision.origin[1],
    decision.origin[2],
  ];
  getPlayer().setAuthoritativeOrigin(origin);
  shootables.syncVisibility(origin, true);
  viewmodel.syncTransform();
  world.syncVisibility(true);
  syncQuakeCrosshairTarget();
  markQuakeTrace("multiplayer-correction", {
    action: decision.action,
    drift: decision.drift,
    inputSequence: decision.inputSequence,
    x: origin[0],
    y: origin[1],
    z: origin[2],
  });
}

function syncQuakeMultiplayerPickupStates(pickups: readonly QuakeMultiplayerAuthoritativePickupState[]): void {
  for (const pickup of pickups) {
    if (pickup.available) {
      getPickups().applyAuthoritativeRespawn(pickup.entityIndex);
    } else {
      getPickups().applyAuthoritativePickup(pickup.entityIndex, {
        applyEffect: false,
        hide: true,
      });
    }
  }
}

function syncQuakeMultiplayerDynamicPickups(
  definitions: readonly QuakeMultiplayerPickupDefinition[],
  options: { pruneMissing?: boolean } = {},
): void {
  const pruneMissing = options.pruneMissing ?? true;
  const nextEntityIndexes = new Set(definitions.map((definition) => definition.entityIndex));
  if (pruneMissing) {
    for (const entityIndex of [...quakeMultiplayerDynamicPickupDefinitions.keys()]) {
      if (!nextEntityIndexes.has(entityIndex)) removeQuakeMultiplayerDynamicPickup(entityIndex);
    }
  }
  for (const definition of definitions) {
    if (!definition.runtime) continue;
    const previous = quakeMultiplayerDynamicPickupDefinitions.get(definition.entityIndex);
    if (previous && JSON.stringify(previous) === JSON.stringify(definition)) continue;
    if (previous) removeQuakeMultiplayerDynamicPickup(definition.entityIndex);
    quakeMultiplayerDynamicPickupDefinitions.set(definition.entityIndex, definition);
    spawnQuakeMultiplayerDynamicPickup(definition);
  }
}

function spawnQuakeMultiplayerDynamicPickup(definition: QuakeMultiplayerPickupDefinition): void {
  const entity: QuakeEntity = {
    index: definition.entityIndex,
    classname: definition.classname,
    origin: {
      x: definition.origin[0],
      y: definition.origin[1],
      z: definition.origin[2],
    },
    properties: {
      classname: definition.classname,
      origin: definition.origin.join(" "),
    },
  };
  getPickups().addRuntimePickup({
    effect: definition.effect as QuakePickupEffect,
    entity,
    ...(definition.feedback ? { feedback: definition.feedback } : {}),
    ...(definition.modelPath ? { modelPath: definition.modelPath } : {}),
    origin: [definition.origin[0], definition.origin[1], definition.origin[2]],
    ...(definition.removeAt !== undefined
      ? { removeAfterSeconds: Math.max(0, (definition.removeAt - Date.now()) / 1000) }
      : {}),
    visibilityOrigin: controls.getOrigin(),
  });
}

function removeQuakeMultiplayerDynamicPickup(entityIndex: number): void {
  quakeMultiplayerDynamicPickupDefinitions.delete(entityIndex);
  getPickups().applyAuthoritativePickup(entityIndex, {
    applyEffect: false,
    hide: true,
  });
}

function applyQuakeMultiplayerInventoryState(state: QuakeMultiplayerInventoryState): void {
  const inventory = getPlayer().inventory();
  inventory.health = state.health;
  inventory.armor = state.armor;
  inventory.armorType = state.armorType;
  inventory.itemFlags = state.itemFlags;
  inventory.shells = state.shells;
  inventory.nails = state.nails;
  inventory.rockets = state.rockets;
  inventory.cells = state.cells;
  inventory.weapons = new Set(state.weapons.filter(isQuakeWeaponId));
  inventory.keys = new Set(state.keys.filter(isQuakeKey));
  const serverNow = Date.now();
  const localNow = performance.now();
  inventory.powerups = {};
  for (const powerup of state.powerups) {
    if (powerup.finishedAt <= serverNow) continue;
    inventory.powerups[powerup.finishedField] = {
      active: true,
      activationField: powerup.activationField,
      finishedAt: localNow + Math.max(0, powerup.finishedAt - serverNow),
      itemFlag: powerup.itemFlag,
      itemFlagExpression: powerup.itemFlagExpression ?? "",
    };
  }
  if (isQuakeWeaponId(state.activeWeapon)) inventory.activeWeapon = state.activeWeapon;
}

function quakeMultiplayerAuthoritativeInventoryFingerprint(
  playerState: QuakeMultiplayerAuthoritativePlayerState,
): string {
  return playerState.inventory
    ? quakeMultiplayerInventoryStateFingerprint(playerState.inventory)
    : [
        playerState.health,
        playerState.armor,
        playerState.activeWeapon,
      ].join(":");
}

function quakeMultiplayerInventoryStateFingerprint(state: QuakeMultiplayerInventoryState): string {
  return JSON.stringify({
    health: state.health,
    armor: state.armor,
    armorType: state.armorType,
    itemFlags: state.itemFlags,
    shells: state.shells,
    nails: state.nails,
    rockets: state.rockets,
    cells: state.cells,
    activeWeapon: state.activeWeapon,
    weapons: [...state.weapons].sort(),
    keys: [...state.keys].sort(),
    powerups: [...state.powerups]
      .map((powerup) => ({
        finishedField: powerup.finishedField,
        activationField: powerup.activationField,
        finishedAt: powerup.finishedAt,
        itemFlag: powerup.itemFlag,
        itemFlagExpression: powerup.itemFlagExpression ?? "",
      }))
      .sort((left, right) => left.finishedField.localeCompare(right.finishedField)),
  });
}

function quakeMultiplayerPlayerIdForClient(clientId: string): string {
  return QUAKE_MULTIPLAYER_TRANSPORT === "party" ? `party:${clientId}` : `loopback:${clientId}`;
}

function handleQuakeMultiplayerPlayerDamaged(
  event: Extract<QuakeMultiplayerSharedWorldEvent, { eventType: "player.damaged" }>,
): void {
  if (event.victimPlayerId !== quakeMultiplayerPlayerIdForClient(QUAKE_MULTIPLAYER_LOCAL_CLIENT_ID)) return;
  noteQuakeMultiplayerPlayerEvent(event);
  const inventory = getPlayer().inventory();
  inventory.health = event.health;
  inventory.armor = event.armor;
  syncQuakeHud();
  quakeHudFlow.flashDamageFeedback({ amount: event.damage });
  if (event.health <= 0 && !quakePlayerDead) showQuakePlayerDeath();
}

function spawnQuakeMultiplayerRemotePlayerBlood(
  event: Extract<QuakeMultiplayerSharedWorldEvent, { eventType: "player.damaged" | "player.killed" }>,
  playerState: QuakeMultiplayerAuthoritativePlayerState,
  damage?: number,
): void {
  if (!quakeMultiplayerRemoteDamageFromLocalPlayer(event)) return;
  quakeImpactParticleFlow.spawnBlood({
    damage: damage && damage > 0 ? damage : undefined,
    directionHint: quakeMultiplayerRemoteDamageDirectionHint(event, playerState),
    origin: quakeMultiplayerRemoteDamageOrigin(playerState),
  });
}

function quakeMultiplayerRemoteDamageOrigin(playerState: QuakeMultiplayerAuthoritativePlayerState): Vec3 {
  return [
    playerState.origin[0],
    playerState.origin[1],
    playerState.origin[2] + QUAKE_MULTIPLAYER_REMOTE_PLAYER_EYE_HEIGHT * 0.5,
  ];
}

function quakeMultiplayerRemoteDamageDirectionHint(
  event: Extract<QuakeMultiplayerSharedWorldEvent, { eventType: "player.damaged" | "player.killed" }>,
  playerState: QuakeMultiplayerAuthoritativePlayerState,
): Vec3 | undefined {
  if (!quakeMultiplayerRemoteDamageFromLocalPlayer(event)) return undefined;
  const origin = getPlayer().currentOrigin();
  return [
    playerState.origin[0] - origin[0],
    playerState.origin[1] - origin[1],
    playerState.origin[2] - origin[2],
  ];
}

function quakeMultiplayerRemoteDamageFromLocalPlayer(
  event: Extract<QuakeMultiplayerSharedWorldEvent, { eventType: "player.damaged" | "player.killed" }>,
): boolean {
  return event.attackerPlayerId === quakeMultiplayerPlayerIdForClient(QUAKE_MULTIPLAYER_LOCAL_CLIENT_ID);
}

function quakeMultiplayerShouldSuppressLocalWallImpact(event: QuakeWeaponWallImpactEvent): boolean {
  return quakeMultiplayerRoomOwnsLocalDamage() &&
    (event.fireKind === "hitscan" || event.fireKind === "beam");
}

function quakeMultiplayerRoomOwnsLocalDamage(): boolean {
  return QUAKE_MULTIPLAYER_ENABLED &&
    quakeMultiplayerSession.status().state === "connected";
}

function handleQuakeMultiplayerPlayerKilled(
  event: Extract<QuakeMultiplayerSharedWorldEvent, { eventType: "player.killed" }>,
): void {
  if (event.victimPlayerId !== quakeMultiplayerPlayerIdForClient(QUAKE_MULTIPLAYER_LOCAL_CLIENT_ID)) return;
  noteQuakeMultiplayerPlayerEvent(event);
  if (!quakePlayerDead) showQuakePlayerDeath();
}

function handleQuakeMultiplayerProjectileSpawned(
  event: Extract<QuakeMultiplayerSharedWorldEvent, { eventType: "projectile.spawned" }>,
): void {
  syncQuakeMultiplayerRemoteProjectileState(event.projectile);
}

function syncQuakeMultiplayerRemoteProjectileStates(projectiles: readonly QuakeMultiplayerProjectileState[]): void {
  const seen = new Set<string>();
  for (const projectile of projectiles) {
    if (projectile.ownerPlayerId === quakeMultiplayerPlayerIdForClient(QUAKE_MULTIPLAYER_LOCAL_CLIENT_ID)) continue;
    seen.add(projectile.projectileId);
    syncQuakeMultiplayerRemoteProjectileState(projectile);
  }
  for (const [projectileId, visual] of quakeRemoteMultiplayerProjectiles) {
    if (seen.has(projectileId)) continue;
    visual.handle.handle.remove();
    quakeRemoteMultiplayerProjectiles.delete(projectileId);
  }
}

function syncQuakeMultiplayerRemoteProjectileState(projectile: QuakeMultiplayerProjectileState): void {
  if (projectile.ownerPlayerId === quakeMultiplayerPlayerIdForClient(QUAKE_MULTIPLAYER_LOCAL_CLIENT_ID)) return;
  if (!isQuakeWeaponId(projectile.weapon)) return;
  const modelPath = quakeWeaponProjectileModelPath(projectile.weapon);
  if (!modelPath) return;
  const existing = quakeRemoteMultiplayerProjectiles.get(projectile.projectileId);
  let visual = existing;
  if (existing && existing.weapon !== projectile.weapon) {
    existing.handle.handle.remove();
    quakeRemoteMultiplayerProjectiles.delete(projectile.projectileId);
    visual = undefined;
  }
  if (!visual) {
    const handle = quakeWeaponPresentation.addProjectileMesh(modelPath, projectile.weapon);
    if (!handle) return;
    handle.handle.element.classList.add("remote-projectile", `remote-projectile-${projectile.weapon}`);
    handle.handle.element.dataset.projectileId = projectile.projectileId;
    handle.handle.element.dataset.ownerPlayerId = projectile.ownerPlayerId;
    visual = {
      handle,
      ownerPlayerId: projectile.ownerPlayerId,
      weapon: projectile.weapon,
    };
    quakeRemoteMultiplayerProjectiles.set(projectile.projectileId, visual);
  }
  syncQuakeMultiplayerRemoteProjectileVisual(visual, projectile.origin, projectile.direction, projectile.speed);
}

function handleQuakeMultiplayerProjectileImpacted(
  event: Extract<QuakeMultiplayerSharedWorldEvent, { eventType: "projectile.impacted" }>,
): void {
  const visual = quakeRemoteMultiplayerProjectiles.get(event.projectileId);
  if (visual) {
    syncQuakeMultiplayerRemoteProjectileVisual(visual, event.origin);
    visual.handle.handle.remove();
    quakeRemoteMultiplayerProjectiles.delete(event.projectileId);
  }
  if (event.ownerPlayerId === quakeMultiplayerPlayerIdForClient(QUAKE_MULTIPLAYER_LOCAL_CLIENT_ID)) return;
  if (event.weapon === "grenadelauncher" || event.weapon === "rocketlauncher") {
    quakeEffectSpriteFlow.spawnExplosion({
      origin: event.origin,
      radiusUnits: 120,
    });
  } else if (event.impactKind === "world" && (event.weapon === "nailgun" || event.weapon === "supernailgun")) {
    quakeImpactParticleFlow.spawnWallImpact({
      count: quakeWallImpactParticleCount(event.weapon === "supernailgun" ? "superspike" : "spike"),
      origin: event.origin,
    });
  }
}

function syncQuakeMultiplayerRemoteProjectileVisual(
  visual: QuakeRemoteMultiplayerProjectileVisual,
  origin: Vec3,
  direction: Vec3 = [1, 0, 0],
  speed = 0,
): void {
  const velocity = [
    direction[0] * speed,
    direction[1] * speed,
    direction[2] * speed,
  ] as Vec3;
  visual.handle.handle.element.dataset.remoteProjectileOrigin = origin
    .map((coordinate) => coordinate.toFixed(4))
    .join(",");
  visual.handle.handle.setTransform({
    position: origin,
    rotation: [0, 0, quakeProjectileRenderYaw((Math.atan2(velocity[1], velocity[0]) * 180) / Math.PI)],
    scale: visual.handle.scale,
  });
}

function clearQuakeMultiplayerRemoteProjectiles(): void {
  for (const visual of quakeRemoteMultiplayerProjectiles.values()) visual.handle.handle.remove();
  quakeRemoteMultiplayerProjectiles.clear();
}

function handleQuakeMultiplayerWorldTeleport(
  event: Extract<QuakeMultiplayerSharedWorldEvent, { eventType: "world.teleport" }>,
): void {
  if (event.playerId !== quakeMultiplayerPlayerIdForClient(QUAKE_MULTIPLAYER_LOCAL_CLIENT_ID)) return;
  const origin: [number, number, number] = [event.origin[0], event.origin[1], event.origin[2]];
  quakeMultiplayerApplyingWorldEvent = true;
  try {
    getPlayer().setAuthoritativeOrigin(origin);
    shootables.syncVisibility(origin, true);
    viewmodel.syncTransform();
    world.syncVisibility(true);
    syncQuakeCrosshairTarget();
  } finally {
    quakeMultiplayerApplyingWorldEvent = false;
  }
}

function handleQuakeMultiplayerWorldPush(
  event: Extract<QuakeMultiplayerSharedWorldEvent, { eventType: "world.push" }>,
): void {
  if (event.playerId !== quakeMultiplayerPlayerIdForClient(QUAKE_MULTIPLAYER_LOCAL_CLIENT_ID)) return;
  quakeMultiplayerApplyingWorldEvent = true;
  try {
    getPlayer().push([event.velocity[0], event.velocity[1], event.velocity[2]]);
    if (event.oneShot) targetSystem.disableEntity(event.entityIndex);
  } finally {
    quakeMultiplayerApplyingWorldEvent = false;
  }
}

function handleQuakeMultiplayerWorldTrigger(
  event: Extract<QuakeMultiplayerSharedWorldEvent, { eventType: "world.trigger" }>,
): void {
  quakeMultiplayerApplyingWorldEvent = true;
  try {
    if (event.oneShot) targetSystem.disableEntity(event.entityIndex);
    applyQuakeMultiplayerKilltargets(event.killtargetEntityIndexes);
  } finally {
    quakeMultiplayerApplyingWorldEvent = false;
  }
}

function handleQuakeMultiplayerWorldMover(
  event: Extract<QuakeMultiplayerSharedWorldEvent, { eventType: "world.mover" }>,
): void {
  const mover = movers.get(event.entityIndex);
  if (!mover) return;
  quakeMultiplayerApplyingWorldEvent = true;
  try {
    if ((event.state === "moving-up" || event.state === "top") && mover.mode === "closed") {
      movers.activateEntity(event.entityIndex);
    }
    applyQuakeMultiplayerKilltargets(event.killtargetEntityIndexes);
  } finally {
    quakeMultiplayerApplyingWorldEvent = false;
  }
}

function handleQuakeMultiplayerWorldTargets(
  event: Extract<QuakeMultiplayerSharedWorldEvent, { eventType: "world.targets" }>,
): void {
  quakeMultiplayerApplyingWorldEvent = true;
  try {
    applyQuakeMultiplayerKilltargets(event.killtargetEntityIndexes);
  } finally {
    quakeMultiplayerApplyingWorldEvent = false;
  }
}

function applyQuakeMultiplayerKilltargets(entityIndexes: readonly number[] | undefined): void {
  for (const entityIndex of entityIndexes ?? []) {
    targetSystem.disableEntity(entityIndex);
    getPickups().applyAuthoritativePickup(entityIndex, {
      applyEffect: false,
      hide: true,
    });
  }
}

function handleQuakeMultiplayerWorldChanged(
  event: Extract<QuakeMultiplayerSharedWorldEvent, { eventType: "world.changed" }>,
): void {
  if (event.data?.clientId === QUAKE_MULTIPLAYER_LOCAL_CLIENT_ID) return;
  if (event.entityIndex === undefined) return;
  const entity = entityByIndex.get(event.entityIndex);
  if (!entity) return;
  quakeMultiplayerApplyingWorldEvent = true;
  try {
    if (event.change === "entity.activate") {
      const sourceEntityIndex = typeof event.data?.sourceEntityIndex === "number"
        ? event.data.sourceEntityIndex
        : undefined;
      activateQuakeEntity(event.entityIndex, sourceEntityIndex);
    } else if (event.change === "level.complete") {
      completeQuakeLevel(entity);
    }
  } finally {
    quakeMultiplayerApplyingWorldEvent = false;
  }
}

function sendQuakeMultiplayerWorldChanged(
  change: string,
  entityIndex: number,
  data: Record<string, string | number | boolean> = {},
): void {
  // Legacy world.changed events are room-to-client only. Client-originated
  // world changes must go through structured authoritative intents.
  if (QUAKE_MULTIPLAYER_ENABLED) return;
  if (
    quakeMultiplayerApplyingWorldEvent ||
    !QUAKE_MULTIPLAYER_ENABLED ||
    quakeMultiplayerSession.status().state !== "connected"
  ) {
    return;
  }
  const roomKey = currentQuakeMultiplayerRoomKey();
  if (!roomKey) return;
  quakeMultiplayerSession.send(createQuakeMultiplayerEnvelope({
    direction: "client",
    type: "client.world",
    roomKey,
    sequence: ++quakeMultiplayerClientSequence,
    sentAt: Date.now(),
    payload: {
      clientId: QUAKE_MULTIPLAYER_LOCAL_CLIENT_ID,
      event: {
        eventType: "world.changed",
        eventId: `world-local-${quakeMultiplayerClientSequence}`,
        roomTime: 0,
        entityIndex,
        change,
        data: {
          ...data,
          clientId: QUAKE_MULTIPLAYER_LOCAL_CLIENT_ID,
        },
      },
    },
  }));
}

function currentQuakeMultiplayerWorldIntentRoomKey(): QuakeMultiplayerRoomCompatibilityKey | null {
  if (
    quakeMultiplayerApplyingWorldEvent ||
    quakeMultiplayerSpectating ||
    quakePlayerDead ||
    !QUAKE_MULTIPLAYER_ENABLED ||
    quakeMultiplayerSession.status().state !== "connected"
  ) {
    return null;
  }
  return currentQuakeMultiplayerRoomKey();
}

function sendQuakeMultiplayerWorldIntent(
  roomKey: QuakeMultiplayerRoomCompatibilityKey,
  intent: QuakeMultiplayerWorldIntent,
  sentAt = Date.now(),
): void {
  quakeMultiplayerSession.send(createQuakeMultiplayerEnvelope({
    direction: "client",
    type: "client.world",
    roomKey,
    sequence: ++quakeMultiplayerClientSequence,
    sentAt,
    payload: {
      clientId: QUAKE_MULTIPLAYER_LOCAL_CLIENT_ID,
      intent,
    },
  }));
}

function requestQuakeMultiplayerTouchIntent(entityIndex: number, intentType: "touch" | "teleport"): boolean {
  const roomKey = currentQuakeMultiplayerWorldIntentRoomKey();
  if (!roomKey) return false;
  const sentAt = Date.now();
  const requestKey = `${intentType}:${entityIndex}`;
  const lastRequestedAt = quakeMultiplayerWorldRequestAt.get(requestKey) ?? -Infinity;
  if (sentAt - lastRequestedAt < 250) return true;
  quakeMultiplayerWorldRequestAt.set(requestKey, sentAt);
  const origin = getPlayer().currentOrigin();
  if (intentType === "touch" && !quakeMultiplayerTouchIntentFacesTrustedDefinition(entityIndex)) {
    return true;
  }
  if (intentType === "teleport") {
    sendQuakeMultiplayerWorldIntent(roomKey, {
      intentType: "teleport",
      worldSequence: ++quakeMultiplayerWorldSequence,
      requestedAt: sentAt,
      entityIndex,
      origin,
      velocity: [0, 0, 0],
    }, sentAt);
    return true;
  }
  sendQuakeMultiplayerWorldIntent(roomKey, {
    intentType: "touch",
    worldSequence: ++quakeMultiplayerWorldSequence,
    requestedAt: sentAt,
    entityIndex,
    origin,
  }, sentAt);
  return true;
}

function quakeMultiplayerTouchIntentFacesTrustedDefinition(entityIndex: number): boolean {
  const definition = currentQuakeMultiplayerWorldIntentDefinitions()
    .find((candidate) => candidate.entityIndex === entityIndex);
  if (!definition || definition.kind !== "trigger") return true;
  return quakeMultiplayerPlayerFacesTrigger({ rotY: normalizeQuakeUrlAngle(scene.camera.state.rotY ?? 270) }, definition);
}

function currentQuakeMultiplayerWorldIntentDefinitions(): readonly QuakeMultiplayerWorldDefinition[] {
  if (!currentResult) return [];
  if (quakeMultiplayerWorldIntentDefinitionsScene !== currentResult) {
    quakeMultiplayerWorldIntentDefinitionsScene = currentResult;
    quakeMultiplayerWorldIntentDefinitions = quakeMultiplayerWorldDefinitionsFromScene(currentResult, {
      pointToRoom: quakeCameraView.pointToWorld,
      playerEyeHeight: getPlayer().eyeHeight(),
    });
  }
  return quakeMultiplayerWorldIntentDefinitions;
}

function requestQuakeMultiplayerTriggerTouch(entity: QuakeEntity): boolean {
  if (
    entity.classname !== "trigger_once" &&
    entity.classname !== "trigger_multiple" &&
    entity.classname !== "trigger_secret"
  ) return false;
  return requestQuakeMultiplayerTouchIntent(entity.index, "touch");
}

function requestQuakeMultiplayerLevelTransitionIntent(entity: QuakeEntity): boolean {
  const roomKey = currentQuakeMultiplayerWorldIntentRoomKey();
  if (!roomKey) return false;
  const sentAt = Date.now();
  const requestKey = `level-transition:${entity.index}`;
  const lastRequestedAt = quakeMultiplayerWorldRequestAt.get(requestKey) ?? -Infinity;
  if (sentAt - lastRequestedAt < 250) return true;
  quakeMultiplayerWorldRequestAt.set(requestKey, sentAt);
  sendQuakeMultiplayerWorldIntent(roomKey, {
    intentType: "level-transition",
    worldSequence: ++quakeMultiplayerWorldSequence,
    requestedAt: sentAt,
    entityIndex: entity.index,
    origin: getPlayer().currentOrigin(),
  }, sentAt);
  return true;
}

function sendQuakeMultiplayerPresence(status: QuakeMultiplayerPlayerPresenceStatus): boolean {
  if (
    !QUAKE_MULTIPLAYER_ENABLED ||
    quakeMultiplayerSpectating ||
    !quakeMultiplayerHelloAccepted ||
    quakeMultiplayerSession.status().state !== "connected"
  ) {
    return false;
  }
  const roomKey = currentQuakeMultiplayerRoomKey();
  if (!roomKey) return false;
  quakeMultiplayerSession.send(createQuakeMultiplayerEnvelope({
    direction: "client",
    type: "client.presence",
    roomKey,
    sequence: ++quakeMultiplayerClientSequence,
    sentAt: Date.now(),
    payload: {
      clientId: QUAKE_MULTIPLAYER_LOCAL_CLIENT_ID,
      status,
    },
  }));
  return true;
}

function sendQuakeMultiplayerPong(payload: Extract<QuakeMultiplayerRoomEnvelope, { type: "room.ping" }>["payload"]): void {
  if (
    !QUAKE_MULTIPLAYER_ENABLED ||
    quakeMultiplayerSession.status().state !== "connected"
  ) {
    return;
  }
  const roomKey = currentQuakeMultiplayerRoomKey();
  if (!roomKey) return;
  const sentAt = Date.now();
  quakeMultiplayerSession.send(createQuakeMultiplayerEnvelope({
    direction: "client",
    type: "client.pong",
    roomKey,
    sequence: ++quakeMultiplayerClientSequence,
    sentAt,
    payload: {
      pingId: payload.pingId,
      sentAt,
      echoedSentAt: payload.sentAt,
      responderTime: sentAt,
    },
  }));
}

function applyQuakeMultiplayerAuthoritativeView(playerState: QuakeMultiplayerAuthoritativePlayerState): void {
  applyQuakeMultiplayerView(playerState.origin, playerState.rotX, playerState.rotY);
}

function applyQuakeMultiplayerView(originValue: readonly [number, number, number], rotX: number, rotY: number): void {
  const origin: Vec3 = [
    originValue[0],
    originValue[1],
    originValue[2],
  ];
  quakeCameraView.clearWeaponViewPunch(false);
  getPlayer().setDebugOrigin(origin);
  quakeCameraView.syncSceneCameraAt(origin, rotX, rotY);
  shootables.syncVisibility(origin, true);
  viewmodel.syncTransform();
  world.syncVisibility(true);
  syncQuakeCrosshairTarget();
}

function sendQuakeMultiplayerHello(roomKey: QuakeMultiplayerRoomCompatibilityKey): void {
  const gameplayDefinitions = currentResult
    ? quakeMultiplayerGameplayDefinitionsFromScene(currentResult, {
        pointToRoom: quakeCameraView.pointToWorld,
        playerEyeHeight: getPlayer().eyeHeight(),
        playerMinsZ: QUAKE_PLAYER_MINS_Z,
      })
    : undefined;
  const deathmatchSpawns = gameplayDefinitions?.deathmatchSpawns;
  const pickupDefinitions = gameplayDefinitions?.pickupDefinitions;
  const gameplayFacts = gameplayDefinitions?.gameplayFacts;
  quakeMultiplayerSession.send(createQuakeMultiplayerEnvelope({
    direction: "client",
    type: "client.hello",
    roomKey,
    sequence: ++quakeMultiplayerClientSequence,
    sentAt: Date.now(),
    payload: {
      clientId: QUAKE_MULTIPLAYER_LOCAL_CLIENT_ID,
      displayName: QUAKE_MULTIPLAYER_LOCAL_DISPLAY_NAME,
      color: QUAKE_MULTIPLAYER_LOCAL_COLOR,
      matchSettings: quakeMultiplayerMatchSettings(),
      capabilities: [QUAKE_MULTIPLAYER_TRANSPORT, "pose-sample", "gameplay-facts-v1"],
      ...(gameplayFacts ? { gameplayFacts } : {}),
      deathmatchSpawns,
      pickupDefinitions,
    },
  }));
}

function requestQuakeMultiplayerPickup(entityIndex: number): boolean {
  if (quakeMultiplayerSpectating) return false;
  if (!Number.isInteger(entityIndex) || entityIndex < 0) return false;
  if (!quakeMultiplayerPickupDefinitionForEntity(entityIndex)) return true;
  const now = Date.now();
  const lastRequestedAt = quakeMultiplayerPickupRequestAt.get(entityIndex) ?? -Infinity;
  if (now - lastRequestedAt < 250) return true;
  const roomKey = currentQuakeMultiplayerRoomKey();
  if (!roomKey) return false;
  quakeMultiplayerPickupRequestAt.set(entityIndex, now);
  quakeMultiplayerSession.send(createQuakeMultiplayerEnvelope({
    direction: "client",
    type: "client.pickup",
    roomKey,
    sequence: ++quakeMultiplayerClientSequence,
    sentAt: now,
    payload: {
      clientId: QUAKE_MULTIPLAYER_LOCAL_CLIENT_ID,
      pickup: {
        pickupSequence: ++quakeMultiplayerPickupSequence,
        requestedAt: now,
        entityIndex,
        origin: getPlayer().currentOrigin(),
      },
    },
  }));
  return true;
}

function quakeMultiplayerPickupDefinitionForEntity(
  entityIndex: number,
): QuakeMultiplayerPickupDefinition | null {
  return currentQuakeMultiplayerPickupDefinitions()
    .find((definition) => definition.entityIndex === entityIndex) ?? null;
}

function currentQuakeMultiplayerPickupDefinitions(): readonly QuakeMultiplayerPickupDefinition[] {
  if (!currentResult) return [];
  if (quakeMultiplayerPickupDefinitionsScene !== currentResult) {
    quakeMultiplayerPickupDefinitionsScene = currentResult;
    quakeMultiplayerPickupDefinitions = quakeMultiplayerGameplayDefinitionsFromScene(currentResult, {
      pointToRoom: quakeCameraView.pointToWorld,
      playerEyeHeight: getPlayer().eyeHeight(),
      playerMinsZ: QUAKE_PLAYER_MINS_Z,
    }).pickupDefinitions;
  }
  return [
    ...quakeMultiplayerPickupDefinitions,
    ...quakeMultiplayerDynamicPickupDefinitions.values(),
  ];
}

function sendQuakeMultiplayerHazardDamageIntent(hazard: QuakeHazardDamage): boolean {
  if (hazard.kind === "trigger" && hazard.entityIndex !== undefined) {
    return requestQuakeMultiplayerTouchIntent(hazard.entityIndex, "touch");
  }
  return false;
}

function sendQuakeMultiplayerFireIntent(event: QuakeWeaponFireEvent): void {
  if (
    !QUAKE_MULTIPLAYER_ENABLED ||
    quakeMultiplayerSpectating ||
    quakeMultiplayerSession.status().state !== "connected"
  ) {
    return;
  }
  const roomKey = currentQuakeMultiplayerRoomKey();
  if (!roomKey) return;
  quakeMultiplayerSession.send(createQuakeMultiplayerEnvelope({
    direction: "client",
    type: "client.fire",
    roomKey,
    sequence: ++quakeMultiplayerClientSequence,
    sentAt: Date.now(),
    payload: {
      clientId: QUAKE_MULTIPLAYER_LOCAL_CLIENT_ID,
      fire: {
        fireSequence: ++quakeMultiplayerFireSequence,
        firedAt: Date.now(),
        weapon: event.weapon,
        fireKind: event.fireKind,
        origin: event.origin,
        direction: event.direction,
        range: event.range,
      },
    },
  }));
}

function sendQuakeMultiplayerInput(roomKey: QuakeMultiplayerRoomCompatibilityKey, sampleNow: number): void {
  if (
    !QUAKE_MULTIPLAYER_ENABLED ||
    quakeMultiplayerSession.status().state !== "connected" ||
    quakeMultiplayerSpectating ||
    quakePlayerDead
  ) {
    return;
  }
  const sentAt = Date.now();
  if (
    quakeMultiplayerLastInputSentAt > 0 &&
    sentAt - quakeMultiplayerLastInputSentAt < QUAKE_MULTIPLAYER_INPUT_MIN_SEND_MS
  ) {
    return;
  }
  const input = quakeMultiplayerLocalInputIntent(sampleNow, sentAt);
  quakeMultiplayerLastInputAt = sampleNow;
  quakeMultiplayerLastInputSentAt = sentAt;
  quakeMultiplayerPendingInputs.push(input);
  flushQuakeMultiplayerPendingInputs(roomKey, sentAt);
}

function flushQuakeMultiplayerPendingInputs(roomKey: QuakeMultiplayerRoomCompatibilityKey, sentAt: number): void {
  while (quakeMultiplayerPendingInputs.length > 0) {
    const inputs = quakeMultiplayerPendingInputs.splice(0, QUAKE_MULTIPLAYER_MAX_INPUT_BATCH_SIZE);
    if (inputs.length === 1) {
      quakeMultiplayerSession.send(createQuakeMultiplayerEnvelope({
        direction: "client",
        type: "client.input",
        roomKey,
        sequence: ++quakeMultiplayerClientSequence,
        sentAt,
        payload: {
          clientId: QUAKE_MULTIPLAYER_LOCAL_CLIENT_ID,
          input: inputs[0],
        },
      }));
      continue;
    }
    quakeMultiplayerSession.send(createQuakeMultiplayerEnvelope({
      direction: "client",
      type: "client.inputBatch",
      roomKey,
      sequence: ++quakeMultiplayerClientSequence,
      sentAt,
      payload: {
        clientId: QUAKE_MULTIPLAYER_LOCAL_CLIENT_ID,
        inputs,
      },
    }));
  }
}

function quakeMultiplayerLocalInputIntent(sampleNow: number, sampledAt: number): QuakeMultiplayerLocalInputIntent {
  const movement = getPlayer().debugMovement();
  const keyCodes = new Set(movement.keys);
  let forward = 0;
  let side = 0;
  if (keyCodes.has("ArrowUp") || keyCodes.has("KeyW")) forward += QUAKE_PMOVE_FORWARD_SPEED;
  if (keyCodes.has("ArrowDown") || keyCodes.has("KeyS")) forward -= QUAKE_PMOVE_BACK_SPEED;
  if (keyCodes.has("ArrowRight") || keyCodes.has("KeyD")) side += QUAKE_PMOVE_SIDE_SPEED;
  if (keyCodes.has("ArrowLeft") || keyCodes.has("KeyA")) side -= QUAKE_PMOVE_SIDE_SPEED;
  const analogX = clampQuakeMultiplayerAnalogInput(movement.analogX);
  const analogY = clampQuakeMultiplayerAnalogInput(movement.analogY);
  forward += analogY >= 0
    ? analogY * QUAKE_PMOVE_FORWARD_SPEED
    : analogY * QUAKE_PMOVE_BACK_SPEED;
  side += analogX * QUAKE_PMOVE_SIDE_SPEED;
  const speedKeyDown = [...quakeGameplayInput.speedKeyCodes].some((code) => keyCodes.has(code));
  if (speedKeyDown !== quakeAlwaysRun) {
    forward *= QUAKE_PMOVE_SPEED_KEY_MULTIPLIER;
    side *= QUAKE_PMOVE_SPEED_KEY_MULTIPLIER;
  }
  const dt = quakeMultiplayerLastInputAt > 0
    ? Math.min(QUAKE_PMOVE_DT_CLAMP, Math.max(0, (sampleNow - quakeMultiplayerLastInputAt) / 1000))
    : QUAKE_MULTIPLAYER_INPUT_SAMPLE_MS / 1000;
  return {
    inputSequence: ++quakeMultiplayerInputSequence,
    sampledAt,
    dt,
    move: { forward, side, up: 0 },
    buttons: {
      attack: quakePointerGameplay.isAttackDown(),
      jump: keyCodes.has("Space") || movement.jumpQueued,
      use: false,
    },
    rotX: scene.camera.state.rotX ?? 88,
    rotY: normalizeQuakeUrlAngle(scene.camera.state.rotY ?? 270),
    activeWeapon: getPlayer().inventory().activeWeapon,
  };
}

function clampQuakeMultiplayerAnalogInput(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

function scheduleQuakeMultiplayerPoseFrame(): void {
  if (!QUAKE_MULTIPLAYER_ENABLED || quakeAppDisposed || quakeMultiplayerPoseFrame) return;
  quakeMultiplayerPoseFrame = window.requestAnimationFrame(tickQuakeMultiplayerPose);
}

function tickQuakeMultiplayerPose(now: number): void {
  quakeMultiplayerPoseFrame = 0;
  if (
    !QUAKE_MULTIPLAYER_ENABLED ||
    quakeAppDisposed ||
    quakeMultiplayerSession.status().state !== "connected" ||
    !currentResult
  ) {
    return;
  }
  const roomKey = currentQuakeMultiplayerRoomKey();
  if (!roomKey) return;
  if (!quakeMultiplayerHelloAccepted) {
    scheduleQuakeMultiplayerPoseFrame();
    return;
  }
  if (quakeMultiplayerSpectating) {
    return;
  }
  if (
    !QUAKE_MULTIPLAYER_DEBUG_POSE_ONLY &&
    !quakeMultiplayerInputPaused &&
    now - quakeMultiplayerLastInputAt >= QUAKE_MULTIPLAYER_INPUT_SAMPLE_MS
  ) {
    sendQuakeMultiplayerInput(roomKey, now);
  }
  if (QUAKE_MULTIPLAYER_DEBUG_POSE_ONLY && now - quakeMultiplayerLastPoseAt >= QUAKE_MULTIPLAYER_POSE_SAMPLE_MS) {
    quakeMultiplayerLastPoseAt = now;
    sendQuakeMultiplayerPose(roomKey);
  }
  scheduleQuakeMultiplayerPoseFrame();
}

function sendQuakeMultiplayerPose(roomKey: QuakeMultiplayerRoomCompatibilityKey): void {
  const sentAt = Date.now();
  const origin = getPlayer().currentOrigin();
  quakeMultiplayerSession.send(createQuakeMultiplayerEnvelope({
    direction: "client",
    type: "client.pose",
    roomKey,
    sequence: ++quakeMultiplayerClientSequence,
    sentAt,
    payload: {
      clientId: QUAKE_MULTIPLAYER_LOCAL_CLIENT_ID,
      prototypeOnly: true,
      pose: {
        poseSequence: ++quakeMultiplayerPoseSequence,
        sampledAt: sentAt,
        origin,
        velocity: [0, 0, 0],
        rotX: scene.camera.state.rotX ?? 88,
        rotY: scene.camera.state.rotY ?? 270,
        grounded: true,
        alive: !quakePlayerDead,
      },
    },
  }));
}

function sendQuakeMultiplayerDebugPose(): boolean {
  if (
    !QUAKE_MULTIPLAYER_ENABLED ||
    quakeMultiplayerSession.status().state !== "connected"
  ) {
    return false;
  }
  const roomKey = currentQuakeMultiplayerRoomKey();
  if (!roomKey) return false;
  sendQuakeMultiplayerPose(roomKey);
  return true;
}

function setQuakeMultiplayerDebugInputPaused(paused: boolean): boolean {
  if (!QUAKE_MULTIPLAYER_ENABLED || !QUAKE_MULTIPLAYER_DEBUG_HOOKS_ENABLED) return false;
  setQuakeMultiplayerInputPaused(paused);
  if (!paused) scheduleQuakeMultiplayerPoseFrame();
  return true;
}

function quakeLoopbackSimulatedPlayers(): readonly QuakeMultiplayerAuthoritativePlayerState[] {
  const roomKey = currentQuakeMultiplayerRoomKey();
  if (!roomKey || !player) return [];
  const localOrigin = getPlayer().currentOrigin();
  const t = performance.now() / 1000;
  const orbitRadius = 96 * QUAKE_COLLISION_UNIT_SCALE;
  const angularSpeed = 0.8;
  const x = localOrigin[0] + Math.cos(t * angularSpeed) * orbitRadius;
  const y = localOrigin[1] + Math.sin(t * angularSpeed) * orbitRadius;
  return [{
    playerId: QUAKE_MULTIPLAYER_LOOPBACK_REMOTE_PLAYER_ID,
    clientId: QUAKE_MULTIPLAYER_LOOPBACK_REMOTE_CLIENT_ID,
    displayName: "Loopback",
    color: "#6fb7d8",
    mapName: roomKey.mapName,
    origin: [x, y, localOrigin[2]],
    velocity: [
      -Math.sin(t * angularSpeed) * orbitRadius * angularSpeed,
      Math.cos(t * angularSpeed) * orbitRadius * angularSpeed,
      0,
    ],
    rotX: 90,
    rotY: normalizeQuakeUrlAngle(180 + (t * angularSpeed * 180) / Math.PI),
    health: 100,
    armor: 0,
    activeWeapon: "shotgun",
    alive: true,
    frags: 0,
    deaths: 0,
    lastInputSequence: 0,
    updatedAt: Date.now(),
  }];
}

function quakeLoopbackTrustedWorldDefinitions(roomKey: QuakeMultiplayerRoomCompatibilityKey) {
  if (!currentResult || currentMapName !== roomKey.mapName || !player) return null;
  return quakeMultiplayerWorldDefinitionsFromScene(currentResult, {
    pointToRoom: quakeCameraView.pointToWorld,
    playerEyeHeight: getPlayer().eyeHeight(),
  });
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function activateQuakeTeleport(trigger: QuakeEntity): boolean {
  if (requestQuakeMultiplayerTouchIntent(trigger.index, "teleport")) return true;
  return quakeEntityActivation.activateTeleport(trigger);
}

function completeQuakeLevel(entity: QuakeEntity): void {
  if (requestQuakeMultiplayerLevelTransitionIntent(entity)) return;
  quakeEntityActivation.completeLevel(entity);
}

function resetQuakeLevelStatsForCurrentScene(): void {
  quakeLevelStats.reset(currentMapName, quakeLevelStatsTotalsForEntities(currentResult?.entities ?? []));
}

function syncQuakeIntermissionCamera(): void {
  const point = quakeIntermissionPointForCurrentScene();
  if (!point) return;
  const origin = quakeCameraView.pointToWorld(point.origin);
  const { rotX, rotY } = quakeIntermissionCameraRotation(point);
  quakeCameraView.syncSceneCameraAt(origin, rotX, rotY);
  shootables.syncVisibility(origin as [number, number, number], true);
  world.syncVisibilityAt(origin as [number, number, number], true);
  syncQuakeCrosshairTarget();
}

function quakeIntermissionPointForCurrentScene(): QuakeEntityManifestPoint | null {
  const manifestPoint = currentResult?.entityManifest.intermissions?.[0];
  if (manifestPoint) return manifestPoint;
  const entity = currentResult?.entities
    .filter((candidate) => candidate.classname.startsWith("info_intermission") && candidate.origin)
    .sort((a, b) => a.index - b.index)[0];
  if (!entity?.origin) return null;
  return {
    entityIndex: entity.index,
    classname: entity.classname,
    origin: entity.origin,
    spawnflags: 0,
    ...(entity.angle !== undefined ? { angle: entity.angle } : {}),
    ...quakeEntityMangleProperties(entity),
    ...(entity.properties.targetname ? { targetname: entity.properties.targetname } : {}),
  };
}

function quakeIntermissionCameraRotation(point: QuakeEntityManifestPoint): { rotX: number; rotY: number } {
  if (point.mangle) {
    return {
      rotX: 90 - point.mangle.x,
      rotY: (180 + point.mangle.y + 360) % 360,
    };
  }
  return {
    rotX: 90,
    rotY: (180 + (point.angle ?? 0) + 360) % 360,
  };
}

function quakeEntityMangleProperties(entity: QuakeEntity): { mangle?: QuakeVertex } {
  const mangle = quakeParseEntityVector(entity.properties.mangle);
  return mangle ? { mangle } : {};
}

function quakeParseEntityVector(value: string | undefined): QuakeVertex | null {
  if (!value) return null;
  const parts = value.trim().split(/\s+/).map((part) => Number.parseFloat(part));
  if (parts.length < 3 || parts.some((part) => !Number.isFinite(part))) return null;
  return { x: parts[0], y: parts[1], z: parts[2] };
}

function activateSolidTouch(touch: QuakeTouchedTrigger): void {
  const entity = entityByIndex.get(touch.entityIndex);
  if (entity?.classname === "func_button" && requestQuakeMultiplayerTouchIntent(entity.index, "touch")) return;
  quakeEntityActivation.activateSolidTouch(touch);
}

function touchQuakeEntity(entityIndex: number): boolean {
  const entity = entityByIndex.get(entityIndex);
  if (!entity || entity.modelIndex === undefined) return false;
  activateSolidTouch({
    entityIndex,
    modelIndex: entity.modelIndex,
    classname: entity.classname,
    contact: "solid",
    ...(entity.properties.target ? { target: entity.properties.target } : {}),
    ...(entity.properties.targetname ? { targetname: entity.properties.targetname } : {}),
  });
  return true;
}

function fireQuakeTarget(targetname: string, sourceEntityIndex?: number): void {
  quakeEntityActivation.fireTarget(targetname, sourceEntityIndex);
}

function activateQuakeEntity(entityIndex: number, sourceEntityIndex?: number): boolean {
  return quakeEntityActivation.activateEntity(entityIndex, sourceEntityIndex);
}

function activateTriggerCounter(entity: QuakeEntity): void {
  quakeEntityActivation.triggerCounter(entity);
}

function quakeBossLightningElectrodesReady(
  targetName: string,
  alignment: Parameters<QuakeEntityActivationFlow["bossLightningElectrodesReady"]>[1],
): boolean {
  return quakeEntityActivation.bossLightningElectrodesReady(targetName, alignment);
}

function quakeBossLightningDischarge(
  targetName: string,
  lightning: Parameters<QuakeEntityActivationFlow["bossLightningDischarge"]>[1],
): void {
  quakeEntityActivation.bossLightningDischarge(targetName, lightning);
}

function activateQuakeSpecialTrigger(entity: QuakeEntity): boolean {
  return quakeEntityActivation.activateSpecialTrigger(entity);
}

function activateQuakeSecretTrigger(entity: QuakeEntity): void {
  quakeEntityActivation.activateSecretTrigger(entity);
}

function quakeRuntimeTriggerOneShot(entity: QuakeEntity, fallback: boolean): boolean {
  return quakeEntityActivation.triggerOneShot(entity, fallback);
}

function quakeRuntimeTriggerWait(entity: QuakeEntity, fallback: number): number {
  return quakeEntityActivation.triggerWait(entity, fallback);
}

function syncQuakeCrosshairTarget(): void {
  quakeCrosshairInteraction?.sync();
}

function queueQuakeCrosshairTargetSync(): void {
  quakeCrosshairInteraction?.queueSync();
}

function clearQuakeCrosshairTarget(): void {
  quakeCrosshairInteraction?.clear();
}


function syncQuakeHazards(
  origin = controls.getOrigin(),
  triggers?: QuakeTouchedTrigger[],
): boolean {
  return quakeSceneMount.syncHazards(origin, triggers);
}

function syncQuakeActiveTriggerDataset(key: string): void {
  void key;
}

function syncTouchedTriggers(origin: [number, number, number]): QuakeTouchedTrigger[] {
  return quakeSceneMount.syncTouchedTriggers(origin);
}

function syncQuakeDebugGameplay(origin: [number, number, number]): void {
  getPlayer().setDebugOrigin(origin);
  const previousDebugGameplaySyncActive = quakeDebugGameplaySyncActive;
  quakeDebugGameplaySyncActive = true;
  try {
    quakeSceneMount.syncDebugGameplay(origin);
  } finally {
    quakeDebugGameplaySyncActive = previousDebugGameplaySyncActive;
  }
}

function applyQuakeUrlView(view: QuakeCssView): void {
  quakeCameraView.clearWeaponViewPunch(false);
  getPlayer().setDebugOrigin(view.origin);
  quakeCameraView.syncSceneCameraAt(view.origin, view.rotX, view.rotY);
  shootables.syncVisibility(view.origin, true);
  viewmodel.syncTransform();
  world.syncVisibility(true);
  syncQuakeCrosshairTarget();
}

async function loadQuakeMap(mapName: string, options: QuakeMapLoadOptions = {}): Promise<void> {
  await quakeMapLoader.loadMap(mapName, options);
}

async function completeQuakeSceneReadiness(
  modelPromise = quakeViewmodelAssets.preload(),
  progress?: QuakeLoadingProgressTracker,
): Promise<void> {
  const completeEffectSpritesTask = progress?.startTask("Effect sprites");
  try {
    await quakeEffectSpriteFlow.preload();
  } finally {
    completeEffectSpritesTask?.();
  }
  const completeWorldTexturesTask = progress?.startTask("World textures");
  try {
    await world.waitForVisibleTextures();
  } finally {
    completeWorldTexturesTask?.();
  }
  await quakeLoading.completeSceneReadiness(modelPromise, quakeViewmodelAssets.mount, progress);
}

function installQuakeAppDebugHooks(): void {
  installQuakeAppDebugApi({
    runtime: quakeAppRuntime,
    activateEntity: activateQuakeEntity,
    copyViewUrl: copyCurrentQuakeViewUrl,
    debugRecorder: () => quakeDebugRecorder,
    fireballEmittersCount: () => quakePointHazards.counts().emitters,
    fireballsCount: () => quakePointHazards.counts().hazards,
    forwardDirection,
    loadMap: loadQuakeMap,
    mapExists: quakeAssetCatalog.mapExists,
    pointToWorld: quakeCameraView.pointToWorld,
    renderOrigin: quakeCameraView.currentRenderOrigin,
    requestMultiplayerPickup: requestQuakeMultiplayerPickup,
    setCollisionBypassUntil: (until) => {
      quakeDebugCollisionBypassUntil = until;
    },
    syncHud: syncQuakeHud,
    syncCrosshairTarget: syncQuakeCrosshairTarget,
    syncGameplay: syncQuakeDebugGameplay,
    setMultiplayerInputPaused: setQuakeMultiplayerDebugInputPaused,
    syncSceneCameraAt: quakeCameraView.syncSceneCameraAt,
    syncMultiplayerPose: sendQuakeMultiplayerDebugPose,
    touchEntity: touchQuakeEntity,
    viewUrl: currentQuakeViewUrl,
  });
}

async function loadPickupModels(progress?: QuakeLoadingProgressTracker): Promise<void> {
  await quakeAssetWarmup.loadPickupModels(progress);
}

async function preloadQuakeMapModelAssets(
  mapName: string,
  progress?: QuakeLoadingProgressTracker,
): Promise<void> {
  await quakeAssetWarmup.preloadMapModelAssets(mapName, progress);
}

async function preloadQuakeSceneModelAssets(
  result: QuakeScene,
  progress?: QuakeLoadingProgressTracker,
): Promise<void> {
  await quakeAssetWarmup.preloadSceneModelAssets(result, progress);
}

async function loadProgramMetadata(progress?: QuakeLoadingProgressTracker): Promise<void> {
  await quakeAssetWarmup.loadProgramMetadata(progress);
}

async function loadQuake(): Promise<void> {
  await quakeLoading.loadStartup({
    fetchManifest: fetchQuakeAssetManifest,
    initializedLine: QUAKE_LOADING_CONSOLE_INITIALIZED_LINE,
    loadMap: loadQuakeMap,
    loadPickupModels,
    loadProgramMetadata,
    pakLine: QUAKE_LOADING_CONSOLE_PAK_LINE,
    preloadWeapon: (progress) => quakeViewmodelAssets.preload(progress),
    routeFromLocation: quakeUrlRouteFromLocation,
    routeIsDirect: quakeUrlRouteIsDirect,
    routeShouldNormalize: quakeUrlRouteShouldNormalize,
    sceneUrl: quakeSceneUrlForCurrentMode,
    setAssetManifest: setQuakeAssetManifest,
    setCurrentMapName: (mapName) => {
      currentMapName = mapName;
    },
    setMenuCurrentLevel: (mapName) => menu.setCurrentLevel(mapName),
    syncRoutePresentation: syncQuakeRoutePresentation,
  });
}

function clearQuakeMainMenuStartupState(): void {
  removeQuakeBodyClasses("quake-main-menu-pending", "quake-main-menu-deferred");
  updateQuakeMenuSceneState({ pending: false, deferred: false });
}

function syncQuakeRoutePresentation(route: QuakeUrlRoute, options: { preferMenu?: boolean } = {}): void {
  quakeRoute.syncPresentation(route, options);
}

function handleQuakePopState(): void {
  quakeRoute.handlePopState();
}

function handleViewportResize(): void {
  quakeCameraView.syncViewportProjection();
  // Re-derive the camera target under the refreshed perspective. The controls
  // only recompute the target on their next look/move, so a player
  // standing still through a rotation would keep a target placed at the OLD
  // viewport's look distance — displacing every renderer that derives the eye
  // back out of it (see syncViewportProjection's perspectiveStyle note).
  // Skipped while the camera is parked away from the player (intermission,
  // debug fly): those flows own the camera and re-apply their own vantage.
  if (currentResult && !quakeIntermission.active() && !isQuakeDebugFlyModeActive()) {
    quakeCameraView.syncSceneCamera(
      scene.camera.state.rotX ?? 90,
      scene.camera.state.rotY ?? 270,
    );
  }
  viewmodel.queueViewportSync();
  // Hold the cell budget across a resize. Without this, growing the window grows
  // cols x rows with its AREA and the frame cost climbs quadratically behind an
  // unchanged "Normal" label — the exact stutter this budget exists to stop.
  // A pinned `?glyphCell=` opts out and keeps its literal px.
  if (quakeGlyphOverlay && !quakeGlyphCellIsPinned()) {
    const nextCell = quakeGlyphCellForBudget(quakeGlyphDetailBudget);
    quakeGlyphOverlay.setCellPx(nextCell);
    if (quakeGlyphWeaponCellPinned === null) quakeGlyphWeaponOverlay?.setCellPx(nextCell);
  }
}

function syncPlayerCollision(): void {
  if (import.meta.env.DEV && performance.now() < quakeDebugCollisionBypassUntil) return;
  if (isQuakeDebugFlyModeActive()) return;
  getPlayer().syncCollision();
}

function handleQuakeControlsChange(): void {
  syncPlayerCollision();
  shootables.syncVisibility(controls.getOrigin());
}

function disposeQuakeApp(): void {
  quakeAppDisposed = true;
  stopQuakeMultiplayerScene("app-dispose");
  disposeQuakeMultiplayerMessages();
  quakeRemotePlayers.dispose();
  quakeInput.dispose();
  window.removeEventListener("popstate", handleQuakePopState);
  window.removeEventListener("resize", handleViewportResize);
  window.visualViewport?.removeEventListener("resize", handleViewportResize);
  quakePointerGameplay.dispose();
  quakeGameplayInput.clearMoveInput();
  quakePointerGameplay.clearAttackInput();
  quakeDebugFly.dispose();
  quakeCameraFeedback.dispose();
  quakeEffectSpriteFlow.dispose();
  quakeImpactParticleFlow.dispose();
  quakeHudFlow.dispose();
  quakeCrosshairInteraction?.dispose();
  quakeOptions.dispose();
  if (quakeDebugRecordingPanelEnabled) {
    debugRecordingButton?.removeEventListener("click", handleQuakeDebugRecordingButtonClick);
  }
  quakeDebugRecorder.dispose();
  quakeDebugPanelFlow.stopStats();
  controls.removeEventListener("change", handleQuakeControlsChange);
  controls.removeEventListener("end", quakeGameplayInput.clearCrouchInput);
  controls.destroy();
  menu.dispose();
  quakeMultiplayerMenuForm.dispose();
  audio.dispose();
  quakeStatsOverlay.hide();
  quakeGlyphWeaponOverlay?.dispose();
  quakeSceneMount.disposeCurrentScene();
}

const quakeSaveSession = createCssQuakeSaveSession({
  activeWeaponView: () => ({
    rotX: scene.camera.state.rotX,
    rotY: scene.camera.state.rotY,
  }),
  canSaveNow: () => Boolean(
    currentResult &&
    currentCollisionWorld &&
    quakeGameplayStarted &&
    !quakeAppLoading &&
    !quakePlayerDead &&
    !hasQuakeBodyClass("quake-level-complete") &&
    !quakeEntityActivation.isLevelLoadPending(),
  ),
  clearAttackInput: quakePointerGameplay.clearAttackInput,
  clearBonusOverlay: clearQuakeBonusOverlay,
  clearCrouchInput: quakeGameplayInput.clearCrouchInput,
  clearCrosshairHit: () => quakeWeaponPresentation.clearCrosshairHit(),
  clearCrosshairTarget: clearQuakeCrosshairTarget,
  clearLevelComplete: clearQuakeLevelComplete,
  clearMegahealthRot: () => quakePowerups.clearMegahealthRot(),
  clearMobileMoveInput: quakePointerGameplay.clearMobileMoveInput,
  clearMoveInput: quakeGameplayInput.clearMoveInput,
  clearPlayerDeath: clearQuakePlayerDeath,
  clearPowerupTimers: quakePowerups.clearPowerupTimers,
  clearWeaponViewPunch: () => quakeCameraView.clearWeaponViewPunch(false),
  currentMapName: () => currentMapName,
  currentOrigin: () => getPlayer().currentOrigin(),
  hasCurrentScene: (mapName) => Boolean(currentResult && (!mapName || currentMapName === mapName)),
  loadMap: loadQuakeMap,
  mapExists: quakeAssetCatalog.mapExists,
  notify: (message) => quakeTextPresentation.notify(message),
  resetActiveTriggers: () => triggerSystem.resetActive(),
  resetWeapons: () => weapons.reset(),
  reschedulePowerupTimers: quakePowerups.reschedulePowerupTimers,
  restoreDamageableBrushes: (snapshot) => quakeDamageableBrushes.restore(snapshot),
  restoreMovers: (snapshot) => movers.restoreProgress(snapshot),
  restorePickups: (snapshot) => getPickups().restoreProgress(snapshot),
  restorePlayer: (snapshot) => getPlayer().restoreProgress(snapshot),
  restoreShootables: (snapshot) => shootables.restoreProgress(snapshot),
  restoreTargets: (snapshot) => targetSystem.restoreProgress(snapshot),
  setGameplayStarted: setQuakeGameplayStarted,
  snapshotDamageableBrushes: () => quakeDamageableBrushes.snapshot(),
  snapshotMovers: () => movers.snapshotProgress(),
  snapshotPickups: () => getPickups().snapshotProgress(),
  snapshotPlayer: () => getPlayer().snapshotProgress(),
  snapshotShootables: () => shootables.snapshotProgress(),
  snapshotTargets: () => targetSystem.snapshotProgress(),
  syncCrosshairTarget: syncQuakeCrosshairTarget,
  syncHud: syncQuakeHud,
  syncSceneCameraAt: quakeCameraView.syncSceneCameraAt,
  syncShootablesVisibility: (origin, force) => shootables.syncVisibility(origin, force),
  syncViewmodel: () => viewmodel.syncTransform(),
  syncWorldVisibility: (force) => world.syncVisibility(force),
  trace: markQuakeTrace,
});

const quakeMapLoader = createQuakeAppMapLoader<QuakeCssView, QuakeViewmodelModel>({
  completeSceneReadiness: completeQuakeSceneReadiness,
  createProgressTracker: (status) => quakeLoading.createProgressTracker(status),
  fetchScene: fetchQuakeScene,
  isDisposed: () => quakeAppDisposed,
  mapLoadView: quakeMapLoadView,
  mountScene: quakeSceneMount.mountScene,
  onCurrentMapChange: (mapName) => {
    currentMapName = mapName;
    menu.setCurrentLevel(mapName);
    if (multiplayerMapSelect) multiplayerMapSelect.value = mapName;
  },
  preloadMapAssets: preloadQuakeMapModelAssets,
  preloadSceneAssets: preloadQuakeSceneModelAssets,
  preloadWeapon: (progress) => quakeViewmodelAssets.preload(progress),
  resumeGameplayAfterMapLoad: resumeQuakeGameplayAfterMapLoad,
  sceneUrl: quakeSceneUrlForCurrentMode,
  setGameplayStarted: setQuakeGameplayStarted,
  setLoading: setQuakeLoading,
  syncUrlView: applyQuakeUrlView,
  updateUrl: updateQuakeUrl,
});

const quakeInput = createQuakeAppInputController({
  audioUnlock: () => audio.unlock(),
  clearAttackInput: quakePointerGameplay.clearAttackInput,
  clearCrouchInput: quakeGameplayInput.clearCrouchInput,
  clearDebugFlyInput: quakeDebugFly.clearInput,
  clearMobileMoveInput: quakePointerGameplay.clearMobileMoveInput,
  clearMoveInput: quakeGameplayInput.clearMoveInput,
  clearWeaponViewPunch: quakeCameraView.clearWeaponViewPunch,
  focusHost: () => host.focus(),
  gameplayMoveKeyCodes: quakeGameplayInput.moveKeyCodes,
  gameplaySpeedKeyCodes: quakeGameplayInput.speedKeyCodes,
  handleCrouchKey: quakeGameplayInput.handleCrouchKey,
  handleDebugFlyKey: quakeDebugFly.handleKey,
  handleMenuKeyDown: (event) => menu.handleKeyDown(event),
  handleMoveKey: quakeGameplayInput.handleMoveKey,
  handleWeaponKey: quakeGameplayInput.handleWeaponKey,
  hidePersistedLoadingConsole: hidePersistedQuakeLoadingConsole,
  isEditableTarget: quakeGameplayInput.isEditableTarget,
  isLoading: () => quakeAppLoading,
  isPointerUnlocked: () => document.pointerLockElement === null,
  menuIsMainOpen: () => menu.isMainMenuOpen(),
  menuIsPanelOpen: () => menu.isMenuPanelOpen(),
  parentKeyRelay: quakeGameplayInput.parentKeyRelay,
  requestIntermissionAdvance: requestQuakeIntermissionAdvanceFromKey,
  shouldOpenMainMenuOnEscape: shouldOpenQuakeMainMenuOnControlsEnd,
  shouldPreventGameplayKeyDefault: quakeGameplayInput.shouldPreventGameplayKeyDefault,
  showMainMenu: () => menu.showMainMenu(),
  syncViewmodelTransform: () => viewmodel.syncTransform(),
  toggleAudioMuted: toggleQuakeAudioMutedShortcut,
  toggleDebugMode: toggleQuakeDebugModeShortcut,
  toggleOutlineTextureMode: toggleQuakeOutlineTextureModeShortcut,
});

const quakeAppRuntime = createQuakeAppRuntimeContext({
  scene,
  controls,
  host,
  controllers: {
    audio,
    menu,
    movers,
    pickups: getPickups,
    player: getPlayer,
    damageableBrushes: quakeDamageableBrushes,
    shootables,
    targets: targetSystem,
    triggers: triggerSystem,
    viewmodel,
    weapons,
    world,
  },
  session: {
    currentMapName: () => currentMapName,
    currentScene: () => currentResult,
    collisionWorld: () => currentCollisionWorld,
    entities: () => entityByIndex,
    isDisposed: () => quakeAppDisposed,
    isLoading: () => quakeAppLoading,
    transitionSerial: () => quakeTransitionSerial,
  },
  gameplay: {
    isPaused: isQuakeGamePaused,
    resumeForDebugInput: resumeQuakeDebugGameplayInput,
    runWithDebugInput: runQuakeWithDebugGameplayInput,
    setPaused: setQuakeGamePaused,
    isPlayerDead: () => quakePlayerDead,
    isStarted: () => quakeGameplayStarted,
    setStarted: setQuakeGameplayStarted,
  },
  multiplayer: {
    snapshot: quakeMultiplayerDebugSnapshot,
  },
});

quakeInput.attach();
window.addEventListener("popstate", handleQuakePopState);
window.addEventListener("resize", handleViewportResize);
window.visualViewport?.addEventListener("resize", handleViewportResize);
quakePointerGameplay.attach();
if (quakeDebugRecordingPanelEnabled) {
  debugRecordingButton?.addEventListener("click", handleQuakeDebugRecordingButtonClick);
}
controls.addEventListener("change", handleQuakeControlsChange);
controls.addEventListener("end", quakeGameplayInput.clearCrouchInput);

syncQuakeHud();
syncQuakeOptionControls();
installQuakeAppDebugHooks();

(window as typeof window & { __cssQuakeShowLoadingError?: (error: unknown) => void })
  .__cssQuakeShowLoadingError = (error: unknown) => {
    if (!quakeAppDisposed && quakeAppLoading) setQuakeLoadingError(error);
  };

void loadQuake().catch((error) => {
  console.error(error);
  if (!quakeAppDisposed) {
    if (error instanceof QuakeAssetsRegeneratingError) {
      setQuakeAssetsRegenerating(error.message);
    } else {
      setQuakeLoadingError(error);
    }
  }
});

const hot = import.meta as ImportMeta & { hot?: { dispose(callback: () => void): void } };
hot.hot?.dispose(disposeQuakeApp);
