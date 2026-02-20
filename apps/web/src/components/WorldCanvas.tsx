"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import {
  AssetClass,
  AssetIntentPriority,
  ChunkManifestPatchResponse,
  DEFAULT_PLACEHOLDER_SLOTS,
  ManifestOverlayState,
  applyManifestToOverlay,
  applyPatchToOverlay,
  createPlaceholderOverlayState,
  getAssetServiceClient,
} from "@/lib/assets";
import { CameraMode, PlayerProfile, WORLD_CONFIG, worldToLatLon } from "@/lib/game-contracts";
import { WorldEventType, getWorldOrchestratorClient } from "@/lib/orchestrator";
import {
  createMeshTimingTracker,
  getChunkMeshTimingAverages,
  percentile,
  recordMeshTiming,
} from "@/lib/perf/mesh-timing";
import {
  DEFAULT_RUNTIME_CRAFT_RECIPES,
  DEFAULT_RUNTIME_HOTBAR_SLOT_IDS,
  DEFAULT_RUNTIME_RESOURCE_IDS,
  DEFAULT_STASH_TRANSFER_AMOUNTS,
  RuntimeBlockDelta,
  RuntimeSpawnHint,
  WORLD_SHARED_CONTAINER_ID,
  WorldRuntimeClient,
  clampCraftRecipeIndex,
  clampRuntimeResourceIndex,
  clampTransferAmountIndex,
  cycleRuntimeResourceIndex,
  cycleTransferAmountIndex,
  createRuntimeClient,
  createAnimationState,
  formatRuntimeResourceLabel,
  getPlayerPrivateContainerId,
  reduceAnimationState,
  resolveAnimationFrameIndex,
  resolveRequestedTransferAmount,
  resolveRuntimeResourceId,
  resolveCraftRecipeByIndex,
  resolveCraftRecipeIndexForKey,
  resolveTransferModifier,
  resolveTransferAmount,
} from "@/lib/runtime";
import { MmCoreRuntimeMode, initializeMmCoreRuntime } from "@/lib/wasm";
import { MmCoreMeshWorkerClient } from "@/lib/wasm/mm-core-mesh-worker-client";
import { clearPlayerProfile } from "@/lib/local-profile-store";
import {
  buildChunkOccupancyBuffer,
  VoxelBlockPosition,
  VoxelChunkData,
  createVoxelChunkData,
  hasVoxelBlock,
  isValidPosition,
  removeVoxelBlock,
  resolveVoxelSurfaceHit,
  setVoxelBlock,
} from "@/lib/voxel";
import { ChunkEntity, generateChunkData } from "@/lib/world/chunk-generator";
import { ChunkManager } from "@/lib/world/chunk-manager";
import { TerrainSample, sampleTerrain, sampleTerrainAtWorld } from "@/lib/world/terrain-sampler";

interface WorldCanvasProps {
  profile: PlayerProfile;
}

interface HudState {
  x: number;
  z: number;
  lat: number;
  lon: number;
  chunkX: number;
  chunkZ: number;
  chunkCount: number;
}

interface AtlasManifestSummary {
  atlasId: string;
  monCount: number;
}

interface OrchestratorHudState {
  eventsSent: number;
  directivesReceived: number;
  lastEventType: WorldEventType | "none";
  lastError: string | null;
}

interface RuntimeHudState {
  mode: "local" | "ws";
  tick: number;
  connected: boolean;
}

interface WorldFlagHudState {
  flags: Record<string, string>;
  tick: number;
}

interface DirectiveHudState {
  storyBeats: string[];
  spawnHints: RuntimeSpawnHint[];
  tick: number;
}

interface HealthHudState {
  current: number;
  max: number;
  tick: number;
}

interface StoryBeatBannerState {
  beat: string;
  tick: number;
  expiresAt: number;
}

interface DirectiveHistoryEntry {
  id: string;
  tick: number;
  text: string;
}

interface HudToast {
  id: string;
  message: string;
  tone: "info" | "success" | "error";
  expiresAt: number;
}

interface MeshHudState {
  coreMode: MmCoreRuntimeMode | "uninitialized" | "error";
  quads: number;
  vertices: number;
  indices: number;
  extractMs: number;
  uploadMs: number;
  extractAvgMs: number;
  uploadAvgMs: number;
  extractP95Ms: number;
  uploadP95Ms: number;
  activeChunkExtractAvgMs: number;
  activeChunkUploadAvgMs: number;
  trackedChunks: number;
  workerError: string | null;
}

interface AssetHudState {
  placeholderVisibleCount: number;
  placeholderSlotCount: number;
  placeholderRatio: number;
  patchApplySuccessCount: number;
  patchApplyFailureCount: number;
  patchLatencyLastMs: number;
  patchLatencyAvgMs: number;
  patchLatencyP95Ms: number;
}

type HotbarActionKind = "melee" | "spell" | "item";

interface HotbarSlot {
  id: string;
  keybind: string;
  label: string;
  kind: HotbarActionKind;
  range: number;
  cooldownMs: number;
  targetMode: "target" | "self";
}

interface CombatHudState {
  selectedSlotId: string;
  selectedSlotLabel: string;
  selectedCooldownMs: number;
  lastAction: string;
  lastTarget: string;
  targetResolution: string;
  status: string;
}

interface InventoryHudState {
  resources: Record<string, number>;
  tick: number;
}

interface ContainerHudState {
  resources: Record<string, number>;
  tick: number;
  containerId: string;
}

interface SpriteTextureSet {
  playerA: THREE.CanvasTexture;
  playerB: THREE.CanvasTexture;
  npcA: THREE.CanvasTexture;
  npcB: THREE.CanvasTexture;
  monA: THREE.CanvasTexture;
  monB: THREE.CanvasTexture;
  monC: THREE.CanvasTexture;
  treeA: THREE.CanvasTexture;
  treeB: THREE.CanvasTexture;
  treeC: THREE.CanvasTexture;
}

interface RemotePlayerState {
  id: string;
  sprite: THREE.Sprite;
  shadow: THREE.Mesh;
  targetX: number;
  targetZ: number;
  speed: number;
  frame: number;
}

interface LoadedChunkRecord {
  chunkX: number;
  chunkZ: number;
  group: THREE.Group;
  voxelChunk: VoxelChunkData;
  surfaceHeights: number[][];
  voxelRenderMesh: THREE.Mesh | null;
  surfaceMesh: THREE.Mesh | null;
  meshRequestVersion: number;
  overlayGroup: THREE.Group;
  overlayState: ManifestOverlayState;
  intentsSubmitted: boolean;
  targetIds: string[];
}

const initialHud: HudState = {
  x: 0,
  z: 0,
  lat: WORLD_CONFIG.startLocation.lat,
  lon: WORLD_CONFIG.startLocation.lon,
  chunkX: 0,
  chunkZ: 0,
  chunkCount: 0,
};

const initialOrchestratorHud: OrchestratorHudState = {
  eventsSent: 0,
  directivesReceived: 0,
  lastEventType: "none",
  lastError: null,
};

const initialRuntimeHud: RuntimeHudState = {
  mode: "local",
  tick: 0,
  connected: false,
};

const initialWorldFlagHud: WorldFlagHudState = {
  flags: {},
  tick: 0,
};

const initialDirectiveHud: DirectiveHudState = {
  storyBeats: [],
  spawnHints: [],
  tick: 0,
};

const initialMeshHud: MeshHudState = {
  coreMode: "uninitialized",
  quads: 0,
  vertices: 0,
  indices: 0,
  extractMs: 0,
  uploadMs: 0,
  extractAvgMs: 0,
  uploadAvgMs: 0,
  extractP95Ms: 0,
  uploadP95Ms: 0,
  activeChunkExtractAvgMs: 0,
  activeChunkUploadAvgMs: 0,
  trackedChunks: 0,
  workerError: null,
};

const initialAssetHud: AssetHudState = {
  placeholderVisibleCount: 0,
  placeholderSlotCount: 0,
  placeholderRatio: 0,
  patchApplySuccessCount: 0,
  patchApplyFailureCount: 0,
  patchLatencyLastMs: 0,
  patchLatencyAvgMs: 0,
  patchLatencyP95Ms: 0,
};

const HOTBAR_SLOTS: HotbarSlot[] = [
  {
    id: "slot-1-rust-blade",
    keybind: "1",
    label: "Rust Blade",
    kind: "melee",
    range: 3.4,
    cooldownMs: 620,
    targetMode: "target",
  },
  {
    id: "slot-2-ember-bolt",
    keybind: "2",
    label: "Ember Bolt",
    kind: "spell",
    range: 11.5,
    cooldownMs: 980,
    targetMode: "target",
  },
  {
    id: "slot-3-frost-bind",
    keybind: "3",
    label: "Frost Bind",
    kind: "spell",
    range: 8.5,
    cooldownMs: 1450,
    targetMode: "target",
  },
  {
    id: "slot-4-bandage",
    keybind: "4",
    label: "Field Bandage",
    kind: "item",
    range: 0,
    cooldownMs: 2100,
    targetMode: "self",
  },
  {
    id: "slot-5-bomb",
    keybind: "5",
    label: "Powder Bomb",
    kind: "item",
    range: 9.5,
    cooldownMs: 1650,
    targetMode: "target",
  },
];

const VOXEL_BLOCK_SIZE = 4;
const VOXEL_MAX_HEIGHT = 8;
const SURFACE_SEGMENT_MULTIPLIER = 4;
const SURFACE_Y_OFFSET = VOXEL_BLOCK_SIZE * 0.05;
const RUNTIME_TICK_RATE = 20;
const NPC_WANDER_RADIUS_MIN = 0.6;
const NPC_WANDER_RADIUS_MAX = 1.8;
const NPC_WANDER_SPEED_MIN = 0.02;
const NPC_WANDER_SPEED_MAX = 0.06;
const NPC_WANDER_SWAY_MIN = 0.8;
const NPC_WANDER_SWAY_MAX = 1.4;
const INTERACT_RANGE = 3.4;
const JUMP_VELOCITY = VOXEL_BLOCK_SIZE * 3.6;
const GRAVITY_ACCELERATION = VOXEL_BLOCK_SIZE * 6.0;
const PLAYER_HEIGHT = VOXEL_BLOCK_SIZE * 1.6;
const PLAYER_WIDTH = VOXEL_BLOCK_SIZE * 0.9;
const PLAYER_SHADOW_RADIUS = VOXEL_BLOCK_SIZE * 0.45;
const THIRD_PERSON_DISTANCE = VOXEL_BLOCK_SIZE * 6.4;
const THIRD_PERSON_HEIGHT = VOXEL_BLOCK_SIZE * 2.7;
const FIRST_PERSON_EYE_HEIGHT = VOXEL_BLOCK_SIZE * 1.55;
const FIRST_PERSON_LOOK_DISTANCE = VOXEL_BLOCK_SIZE * 6.5;
const RENDER_SCALE = 0.85;
const SKY_TOP_COLOR = "#1c1b35";
const SKY_HORIZON_COLOR = "#7e8cc3";
const FOG_COLOR = "#6b7cae";
const AMBIENT_LIGHT_COLOR = "#c6d4ff";
const HEMI_SKY_COLOR = "#b9cdfc";
const HEMI_GROUND_COLOR = "#273b33";
const SUN_LIGHT_COLOR = "#f2c28a";
const TORCH_LIGHT_COLOR = "#ffb066";
const STATUS_RESOURCE_IDS = ["salvage", "wood", "stone"] as const;

const HOTBAR_UI_SLOT_COUNT = 9;
const HOTBAR_KEY_TO_INDEX = new Map(
  Array.from({ length: HOTBAR_SLOTS.length }, (_, index) => [String(index + 1), index]),
);
const HOTBAR_SLOT_BY_ID = new Map(HOTBAR_SLOTS.map((slot) => [slot.id, slot]));
const CRAFT_RECIPE_BY_ID = new Map(DEFAULT_RUNTIME_CRAFT_RECIPES.map((recipe) => [recipe.id, recipe]));
const DEFAULT_MAX_HEALTH = 10;

const initialCombatHud: CombatHudState = {
  selectedSlotId: HOTBAR_SLOTS[0].id,
  selectedSlotLabel: HOTBAR_SLOTS[0].label,
  selectedCooldownMs: 0,
  lastAction: "none",
  lastTarget: "none",
  targetResolution: "none",
  status: "Select slot (1-5), recipe (6-9), press R to craft, click to attack/cast, F to interact, Space to jump.",
};

const initialInventoryHud: InventoryHudState = {
  resources: Object.fromEntries(DEFAULT_RUNTIME_RESOURCE_IDS.map((resourceId) => [resourceId, 0])),
  tick: 0,
};

const initialHealthHud = {
  current: DEFAULT_MAX_HEALTH,
  max: DEFAULT_MAX_HEALTH,
  tick: 0,
};

const initialContainerHud: ContainerHudState = {
  resources: Object.fromEntries(DEFAULT_RUNTIME_RESOURCE_IDS.map((resourceId) => [resourceId, 0])),
  tick: 0,
  containerId: WORLD_SHARED_CONTAINER_ID,
};

function clampHotbarIndex(index: number, slotCount: number): number {
  if (slotCount <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(index, slotCount - 1));
}

function resolveHotbarSlots(slotIds: string[]): HotbarSlot[] {
  const fallbackSlot = HOTBAR_SLOTS[0];
  const resolved = slotIds
    .map((slotId, index) => HOTBAR_SLOT_BY_ID.get(slotId) ?? HOTBAR_SLOTS[index] ?? fallbackSlot)
    .filter((slot): slot is HotbarSlot => slot !== undefined);

  if (resolved.length > 0) {
    return resolved;
  }
  return fallbackSlot ? [fallbackSlot] : [];
}

export function WorldCanvas({ profile }: WorldCanvasProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [hud, setHud] = useState<HudState>(initialHud);
  const [, setAtlasSummary] = useState<AtlasManifestSummary | null>(null);
  const [orchestratorHud, setOrchestratorHud] = useState<OrchestratorHudState>(initialOrchestratorHud);
  const [runtimeHud, setRuntimeHud] = useState<RuntimeHudState>(initialRuntimeHud);
  const [worldFlagHud, setWorldFlagHud] = useState<WorldFlagHudState>(initialWorldFlagHud);
  const [directiveHud, setDirectiveHud] = useState<DirectiveHudState>(initialDirectiveHud);
  const [directiveHistory, setDirectiveHistory] = useState<DirectiveHistoryEntry[]>([]);
  const [storyBeatBanner, setStoryBeatBanner] = useState<StoryBeatBannerState | null>(null);
  const [hudToasts, setHudToasts] = useState<HudToast[]>([]);
  const [meshHud, setMeshHud] = useState<MeshHudState>(initialMeshHud);
  const [, setAssetHud] = useState<AssetHudState>(initialAssetHud);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [meshDetailMode, setMeshDetailMode] = useState<"basic" | "detailed">("detailed");
  const [showMinimapDebug, setShowMinimapDebug] = useState(false);
  const [mmCoreReady, setMmCoreReady] = useState(false);
  const [mmCoreError, setMmCoreError] = useState<string | null>(null);
  const [hotbarSlotIds, setHotbarSlotIds] = useState<string[]>(() => [...DEFAULT_RUNTIME_HOTBAR_SLOT_IDS]);
  const [hotbarStackCounts, setHotbarStackCounts] = useState<number[]>([]);
  const hotbarSlots = useMemo(() => resolveHotbarSlots(hotbarSlotIds), [hotbarSlotIds]);
  const hotbarUiSlots = useMemo(
    () => Array.from({ length: HOTBAR_UI_SLOT_COUNT }, (_, index) => hotbarSlots[index] ?? null),
    [hotbarSlots],
  );
  const hotbarUiCounts = useMemo(() => {
    if (hotbarStackCounts.length === 0) {
      return Array.from({ length: HOTBAR_UI_SLOT_COUNT }, () => 0);
    }
    return Array.from(
      { length: HOTBAR_UI_SLOT_COUNT },
      (_, index) => hotbarStackCounts[index] ?? 0,
    );
  }, [hotbarStackCounts]);
  const [selectedHotbarIndex, setSelectedHotbarIndex] = useState(0);
  const [selectedCraftRecipeIndex, setSelectedCraftRecipeIndex] = useState(0);
  const [selectedStashResourceIndex, setSelectedStashResourceIndex] = useState(0);
  const [selectedTransferAmountIndex, setSelectedTransferAmountIndex] = useState(0);
  const selectedCraftRecipe = useMemo(
    () => resolveCraftRecipeByIndex(selectedCraftRecipeIndex),
    [selectedCraftRecipeIndex],
  );
  const selectedStashResourceId = useMemo(
    () => resolveRuntimeResourceId(selectedStashResourceIndex),
    [selectedStashResourceIndex],
  );
  const selectedTransferAmount = useMemo(
    () => resolveTransferAmount(selectedTransferAmountIndex),
    [selectedTransferAmountIndex],
  );
  const [, setCombatHud] = useState<CombatHudState>(initialCombatHud);
  const [inventoryHud, setInventoryHud] = useState<InventoryHudState>(initialInventoryHud);
  const [healthHud, setHealthHud] = useState<HealthHudState>(initialHealthHud);
  const [containerHud, setContainerHud] = useState<ContainerHudState>(initialContainerHud);
  const [privateContainerHud, setPrivateContainerHud] = useState<ContainerHudState>({
    resources: Object.fromEntries(DEFAULT_RUNTIME_RESOURCE_IDS.map((resourceId) => [resourceId, 0])),
    tick: 0,
    containerId: "",
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [minimapHud, setMinimapHud] = useState(() => ({
    region: formatRegionLabel(profile.origin),
    biome: "Meadows",
  }));
  const [cameraMode, setCameraMode] = useState<CameraMode>(() => profile.preferredCamera);
  const cameraModeRef = useRef<CameraMode>(profile.preferredCamera);
  const menuOpenRef = useRef(menuOpen);
  const selectedHotbarRef = useRef(0);
  const selectedCraftRecipeIndexRef = useRef(0);
  const selectedStashResourceIndexRef = useRef(0);
  const selectedTransferAmountIndexRef = useRef(0);
  const showDiagnosticsRef = useRef(false);
  const meshDetailModeRef = useRef<"basic" | "detailed">("detailed");
  const showMinimapDebugRef = useRef(false);
  const hotbarSlotsRef = useRef<HotbarSlot[]>(hotbarSlots);
  const wasDownedRef = useRef(false);
  const defeatedTargetsRef = useRef<Map<string, number>>(new Map());
  const assetMetricsRef = useRef({
    patchApplySuccessCount: 0,
    patchApplyFailureCount: 0,
    patchLatencySamples: [] as number[],
    patchLatencyLastMs: 0,
  });
  const inventoryResourcesRef = useRef<Record<string, number>>({ ...initialInventoryHud.resources });
  const healthHudRef = useRef<HealthHudState>(initialHealthHud);
  const sharedContainerResourcesRef = useRef<Record<string, number>>({ ...initialContainerHud.resources });
  const privateContainerResourcesRef = useRef<Record<string, number>>({
    ...initialContainerHud.resources,
  });
  const runtimeClientRef = useRef<WorldRuntimeClient | null>(null);
  const lastStoryBeatRef = useRef<string>("");
  const lastSpawnHintSignatureRef = useRef<string>("");
  const assetClient = useMemo(() => getAssetServiceClient(), []);
  const orchestratorClient = useMemo(() => getWorldOrchestratorClient(), []);
  const worldSeed = profile.world.seed;
  const playerLabel = useMemo(() => profile.name, [profile.name]);
  const privateContainerId = useMemo(() => getPlayerPrivateContainerId(profile.id), [profile.id]);
  const activeHudToasts = useMemo(
    () => hudToasts.filter((toast) => performance.now() < toast.expiresAt),
    [hudToasts],
  );

  function handleHotbarSelect(index: number): void {
    const nextIndex = clampHotbarIndex(index, hotbarSlotsRef.current.length);
    setSelectedHotbarIndex(nextIndex);
    runtimeClientRef.current?.selectHotbarSlot(profile.id, nextIndex);
  }

  function handleCraftRecipeSelect(index: number): void {
    setSelectedCraftRecipeIndex(clampCraftRecipeIndex(index));
  }

  function handleStashResourceSelect(index: number): void {
    setSelectedStashResourceIndex(clampRuntimeResourceIndex(index));
  }

  function handleTransferAmountSelect(index: number): void {
    setSelectedTransferAmountIndex(clampTransferAmountIndex(index));
  }

  const pushHudToast = useCallback((message: string, tone: HudToast["tone"], durationMs = 2600): void => {
    const now = performance.now();
    setHudToasts((previous) => {
      const next = [
        ...previous.filter((toast) => now < toast.expiresAt),
        {
          id: `${Date.now()}:${Math.random()}`,
          message,
          tone,
          expiresAt: now + durationMs,
        },
      ];
      return next.slice(-5);
    });
  }, []);

  useEffect(() => {
    cameraModeRef.current = cameraMode;
  }, [cameraMode]);

  useEffect(() => {
    hotbarSlotsRef.current = hotbarSlots;
  }, [hotbarSlots]);

  useEffect(() => {
    selectedHotbarRef.current = selectedHotbarIndex;
    const selectedSlot = hotbarSlots[selectedHotbarIndex] ?? hotbarSlots[0] ?? HOTBAR_SLOTS[0];
    setCombatHud((previous) => ({
      ...previous,
      selectedSlotId: selectedSlot.id,
      selectedSlotLabel: selectedSlot.label,
    }));
  }, [hotbarSlots, selectedHotbarIndex]);

  useEffect(() => {
    selectedCraftRecipeIndexRef.current = selectedCraftRecipeIndex;
  }, [selectedCraftRecipeIndex]);

  useEffect(() => {
    selectedStashResourceIndexRef.current = selectedStashResourceIndex;
  }, [selectedStashResourceIndex]);

  useEffect(() => {
    selectedTransferAmountIndexRef.current = selectedTransferAmountIndex;
  }, [selectedTransferAmountIndex]);

  useEffect(() => {
    showDiagnosticsRef.current = showDiagnostics;
  }, [showDiagnostics]);

  useEffect(() => {
    meshDetailModeRef.current = meshDetailMode;
  }, [meshDetailMode]);

  useEffect(() => {
    showMinimapDebugRef.current = showMinimapDebug;
  }, [showMinimapDebug]);

  useEffect(() => {
    menuOpenRef.current = menuOpen;
  }, [menuOpen]);

  useEffect(() => {
    inventoryResourcesRef.current = { ...inventoryHud.resources };
  }, [inventoryHud.resources]);

  useEffect(() => {
    healthHudRef.current = { ...healthHud };
  }, [healthHud]);

  useEffect(() => {
    const downed = healthHud.current <= 0;
    if (downed && !wasDownedRef.current) {
      pushHudToast("You are downed. Use a bandage to recover.", "error", 3200);
    }
    if (!downed && wasDownedRef.current) {
      pushHudToast("Recovered.", "success", 2200);
    }
    wasDownedRef.current = downed;
  }, [healthHud, pushHudToast]);

  useEffect(() => {
    sharedContainerResourcesRef.current = { ...containerHud.resources };
  }, [containerHud.resources]);

  useEffect(() => {
    privateContainerResourcesRef.current = { ...privateContainerHud.resources };
  }, [privateContainerHud.resources]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/data/austin/atlas-manifest-v0.json")
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Atlas manifest request failed: ${response.status}`);
        }
        return response.json();
      })
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setAtlasSummary({
          atlasId: payload.atlasId ?? "unknown",
          monCount: Array.isArray(payload.mons) ? payload.mons.length : 0,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setAtlasSummary(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void initializeMmCoreRuntime()
      .then((mode) => {
        if (!cancelled) {
        setMeshHud((previous) => ({
          ...previous,
          coreMode: mode,
          workerError: null,
        }));
          setMmCoreReady(true);
          setMmCoreError(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setMmCoreReady(false);
          setMmCoreError(error instanceof Error ? error.message : "Failed to initialize MM core wasm runtime.");
          setMeshHud((previous) => ({
            ...previous,
            coreMode: "error",
          }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!mmCoreReady || mmCoreError) {
      return;
    }

    const mount = mountRef.current;
    if (!mount) {
      return;
    }
    if (typeof Worker === "undefined") {
      setMmCoreError("Web Worker support is required for MM core mesh extraction.");
      return;
    }

    assetMetricsRef.current = {
      patchApplySuccessCount: 0,
      patchApplyFailureCount: 0,
      patchLatencySamples: [],
      patchLatencyLastMs: 0,
    };

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#87bdf5");
    scene.fog = new THREE.Fog(FOG_COLOR, 110, 460);
    const skyDome = createSkyDome();
    scene.add(skyDome);

    const aspect = mount.clientWidth / mount.clientHeight;
    const camera = new THREE.PerspectiveCamera(72, aspect, 0.1, 900);
    camera.position.set(0, THIRD_PERSON_HEIGHT, THIRD_PERSON_DISTANCE);
    camera.lookAt(0, PLAYER_HEIGHT * 0.55, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5) * RENDER_SCALE);
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.domElement.style.imageRendering = "pixelated";
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(AMBIENT_LIGHT_COLOR, 0.7));
    scene.add(new THREE.HemisphereLight(HEMI_SKY_COLOR, HEMI_GROUND_COLOR, 0.7));
    const sunlight = new THREE.DirectionalLight(SUN_LIGHT_COLOR, 1.05);
    sunlight.position.set(60, 120, 40);
    scene.add(sunlight);

    const worldRoot = new THREE.Group();
    scene.add(worldRoot);
    const torchLight = new THREE.PointLight(TORCH_LIGHT_COLOR, 0.85, VOXEL_BLOCK_SIZE * 30, 1.8);
    worldRoot.add(torchLight);
    const spawnHintRoot = new THREE.Group();
    worldRoot.add(spawnHintRoot);
    const meshWorkerClient = new MmCoreMeshWorkerClient();
    const meshTimingTracker = createMeshTimingTracker(160);

    const spriteTextures = createSpriteTextureSet();
    const playerMaterial = new THREE.SpriteMaterial({
      map: spriteTextures.playerA,
      transparent: true,
      color: profile.appearance.accentColor,
    });
    const playerSprite = new THREE.Sprite(playerMaterial);
    playerSprite.scale.set(PLAYER_WIDTH, PLAYER_HEIGHT, 1);
    playerSprite.position.y = PLAYER_HEIGHT * 0.5;
    worldRoot.add(playerSprite);

    const playerShadow = new THREE.Mesh(
      new THREE.CircleGeometry(PLAYER_SHADOW_RADIUS, 12),
      new THREE.MeshBasicMaterial({ color: "#113f5f", transparent: true, opacity: 0.35 }),
    );
    playerShadow.rotation.x = -Math.PI * 0.5;
    playerShadow.position.y = 0.06;
    worldRoot.add(playerShadow);

    const keyState = new Set<string>();
    const chunkStore = new Map<string, LoadedChunkRecord>();
    type TargetRecord = {
      id: string;
      label: string;
      type: "npc" | "wild-mon";
      object: THREE.Object3D;
      chunkX: number;
      chunkZ: number;
      baseWorldX: number;
      baseWorldZ: number;
      worldX: number;
      worldZ: number;
      height: number;
    };
    const targetStore = new Map<string, TargetRecord>();
    const playerPosition = new THREE.Vector3();
    const forwardVector = new THREE.Vector3();
    const rightVector = new THREE.Vector3();
    const moveVector = new THREE.Vector3();
    const desiredCameraPosition = new THREE.Vector3();
    const cameraLookTarget = new THREE.Vector3();
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const groundHitPoint = new THREE.Vector3();
    const actionCooldownUntil = new Map<string, number>();
    const flashTimeouts = new Set<number>();
    const pendingCombatActions = new Map<
      string,
      {
        slotId: string;
        slotKind: HotbarActionKind;
        slotLabel: string;
        slotCooldownMs: number;
        targetId?: string;
        targetLabel: string;
        targetWorldX?: number;
        targetWorldZ?: number;
      }
    >();
    const pendingInteractActions = new Map<
      string,
      {
        targetId?: string;
        targetLabel: string;
      }
    >();
    const intentChunks = new Set<string>();
    const patchLatencySampleLimit = 120;
    const turnSpeed = 2.2;
    let activeChunkX = 0;
    let activeChunkZ = 0;
    let lastHudUpdate = 0;
    let isRunning = true;
    let cachedPlayerFrame = 0;
    let yaw = Math.PI;
    let pitch = -0.12;
    let draggingCamera = false;
    let activePointerId: number | null = null;
    let pointerDownX = 0;
    let pointerDownY = 0;
    let pointerMoved = false;
    let pointerDownAt = 0;
    let lastPointerX = 0;
    let lastPointerY = 0;
    let patchIntervalId: number | null = null;
    let verticalVelocity = 0;
    let jumpQueued = false;
    const runtimeClient: WorldRuntimeClient = createRuntimeClient({ worldSeed });
    runtimeClientRef.current = runtimeClient;
    const runtimeState = {
      positionX: 0,
      positionZ: 0,
      speed: 0,
      tick: 0,
      hasSnapshot: false,
    };
    let animationState = createAnimationState(performance.now());
    const spawnHintMarkers = new Map<string, THREE.Group>();
    const remotePlayers = new Map<string, RemotePlayerState>();

    function isTargetActive(targetId: string, target?: TargetRecord): boolean {
      const respawnTick = defeatedTargetsRef.current.get(targetId);
      if (respawnTick === undefined) {
        return true;
      }
      if (runtimeState.tick >= respawnTick) {
        defeatedTargetsRef.current.delete(targetId);
        const resolved = target ?? targetStore.get(targetId);
        if (resolved) {
          resolved.object.visible = true;
        }
        return true;
      }
      const resolved = target ?? targetStore.get(targetId);
      if (resolved && resolved.object.visible) {
        resolved.object.visible = false;
      }
      return false;
    }

    function applySpawnHintMarkers(spawnHints: RuntimeSpawnHint[]): void {
      for (const marker of spawnHintMarkers.values()) {
        spawnHintRoot.remove(marker);
        disposeGroup(marker);
      }
      spawnHintMarkers.clear();

      for (const spawnHint of spawnHints) {
        const marker = buildSpawnHintMarker(spawnHint);
        spawnHintMarkers.set(spawnHint.hintId, marker);
        spawnHintRoot.add(marker);
      }
    }

    function buildSpawnHintMarker(spawnHint: RuntimeSpawnHint): THREE.Group {
      const marker = new THREE.Group();
      const beaconColor = hashToColor(`spawn-hint:${spawnHint.hintId}`);
      const shaftRadius = VOXEL_BLOCK_SIZE * 0.08;
      const shaftHeight = VOXEL_BLOCK_SIZE * 2.4;
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftHeight, 8),
        new THREE.MeshStandardMaterial({
          color: beaconColor,
          emissive: beaconColor,
          emissiveIntensity: 0.24,
          roughness: 0.5,
          metalness: 0.08,
        }),
      );
      shaft.position.y = shaftHeight * 0.5;
      marker.add(shaft);

      const haloRadius = VOXEL_BLOCK_SIZE * 0.65;
      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(haloRadius, VOXEL_BLOCK_SIZE * 0.04, 6, 24),
        new THREE.MeshBasicMaterial({
          color: beaconColor,
          transparent: true,
          opacity: 0.85,
        }),
      );
      halo.rotation.x = Math.PI * 0.5;
      halo.position.y = VOXEL_BLOCK_SIZE * 0.28;
      marker.add(halo);

      marker.position.set(
        (spawnHint.chunkX * WORLD_CONFIG.chunkSize) + (WORLD_CONFIG.chunkSize * 0.5),
        0,
        (spawnHint.chunkZ * WORLD_CONFIG.chunkSize) + (WORLD_CONFIG.chunkSize * 0.5),
      );
      marker.position.y = resolveSurfaceHeightAt(marker.position.x, marker.position.z);
      marker.userData.spawnHintId = spawnHint.hintId;
      return marker;
    }

    function createRemotePlayerSprite(playerId: string): RemotePlayerState {
      const tint = new THREE.Color(hashToColor(`remote:${playerId}`));
      const spriteMaterial = new THREE.SpriteMaterial({
        map: spriteTextures.playerA,
        transparent: true,
        color: tint,
      });
      const sprite = new THREE.Sprite(spriteMaterial);
      sprite.scale.set(PLAYER_WIDTH, PLAYER_HEIGHT, 1);
      sprite.position.y = PLAYER_HEIGHT * 0.5;

      const shadow = new THREE.Mesh(
        new THREE.CircleGeometry(PLAYER_SHADOW_RADIUS * 0.85, 12),
        new THREE.MeshBasicMaterial({ color: "#0f2b42", transparent: true, opacity: 0.25 }),
      );
      shadow.rotation.x = -Math.PI * 0.5;
      shadow.position.y = 0.06;

      worldRoot.add(sprite);
      worldRoot.add(shadow);

      return {
        id: playerId,
        sprite,
        shadow,
        targetX: 0,
        targetZ: 0,
        speed: 0,
        frame: 0,
      };
    }

    function disposeRemotePlayer(state: RemotePlayerState): void {
      worldRoot.remove(state.sprite);
      worldRoot.remove(state.shadow);
      state.sprite.material.dispose();
      state.shadow.geometry.dispose();
      if (Array.isArray(state.shadow.material)) {
        state.shadow.material.forEach((material) => material.dispose());
      } else {
        state.shadow.material.dispose();
      }
    }

    const runtimeUnsubscribe = runtimeClient.subscribe((snapshot) => {
      const self = snapshot.players[profile.id];
      if (self) {
        runtimeState.positionX = self.x;
        runtimeState.positionZ = self.z;
        runtimeState.speed = self.speed;
        runtimeState.hasSnapshot = true;
      }
      const seenRemote = new Set<string>();
      for (const [playerId, player] of Object.entries(snapshot.players)) {
        if (playerId === profile.id) {
          continue;
        }
        seenRemote.add(playerId);
        let remote = remotePlayers.get(playerId);
        if (!remote) {
          remote = createRemotePlayerSprite(playerId);
          remotePlayers.set(playerId, remote);
          remote.targetX = player.x;
          remote.targetZ = player.z;
        const remoteSurface = resolveSurfaceHeightAt(player.x, player.z);
        remote.sprite.position.set(player.x, remoteSurface + (PLAYER_HEIGHT * 0.5), player.z);
        remote.shadow.position.set(player.x, remoteSurface + 0.06, player.z);
      }
        remote.targetX = player.x;
        remote.targetZ = player.z;
        remote.speed = player.speed;
      }
      for (const [playerId, remote] of remotePlayers.entries()) {
        if (!seenRemote.has(playerId)) {
          disposeRemotePlayer(remote);
          remotePlayers.delete(playerId);
        }
      }
      runtimeState.tick = snapshot.tick;
      setRuntimeHud({
        mode: runtimeClient.mode,
        tick: snapshot.tick,
        connected: true,
      });
    });

    const runtimeBlockUnsubscribe = runtimeClient.subscribeBlockDeltas((delta) => {
      applyRuntimeBlockDelta(delta);
    });

    const runtimeHotbarUnsubscribe = runtimeClient.subscribeHotbarStates((state) => {
      if (state.playerId !== profile.id) {
        return;
      }
      if (state.slotIds.length > 0) {
        setHotbarSlotIds(state.slotIds.slice(0, HOTBAR_UI_SLOT_COUNT));
      }
      if (state.stackCounts.length > 0) {
        setHotbarStackCounts(state.stackCounts.slice(0, HOTBAR_UI_SLOT_COUNT));
      }
      const slotCount = state.slotIds.length > 0 ? state.slotIds.length : hotbarSlotsRef.current.length;
      const nextIndex = clampHotbarIndex(state.selectedIndex, slotCount);
      setSelectedHotbarIndex(nextIndex);
    });

    const runtimeInventoryUnsubscribe = runtimeClient.subscribeInventoryStates((state) => {
      if (state.playerId !== profile.id) {
        return;
      }
      setInventoryHud({
        resources: {
          ...Object.fromEntries(DEFAULT_RUNTIME_RESOURCE_IDS.map((resourceId) => [resourceId, 0])),
          ...state.resources,
        },
        tick: state.tick,
      });
    });

    const runtimeHealthUnsubscribe = runtimeClient.subscribeHealthStates((state) => {
      if (state.playerId !== profile.id) {
        return;
      }
      setHealthHud({
        current: state.current,
        max: state.max,
        tick: state.tick,
      });
    });

    const runtimeWorldFlagUnsubscribe = runtimeClient.subscribeWorldFlagStates((state) => {
      setWorldFlagHud({
        flags: { ...state.flags },
        tick: state.tick,
      });
    });

    const runtimeWorldDirectiveUnsubscribe = runtimeClient.subscribeWorldDirectiveStates((state) => {
      const pushDirectiveHistory = (text: string): void => {
        setDirectiveHistory((previous) => {
          const next = [
            ...previous,
            {
              id: `${state.tick}:${text}:${Date.now()}`,
              tick: state.tick,
              text,
            },
          ];
          return next.slice(-8);
        });
      };
      applySpawnHintMarkers(state.spawnHints);
      const latestStoryBeat =
        state.storyBeats.length > 0 ? state.storyBeats[state.storyBeats.length - 1] : "";
      if (latestStoryBeat && latestStoryBeat !== lastStoryBeatRef.current) {
        lastStoryBeatRef.current = latestStoryBeat;
        pushDirectiveHistory(`Story beat: ${latestStoryBeat}`);
        setStoryBeatBanner({
          beat: latestStoryBeat,
          tick: state.tick,
          expiresAt: performance.now() + 4200,
        });
      }
      const spawnHintSignature = state.spawnHints
        .map((hint) => `${hint.hintId}:${hint.chunkX}:${hint.chunkZ}:${hint.label}`)
        .sort((left, right) => left.localeCompare(right))
        .join("|");
      if (spawnHintSignature !== lastSpawnHintSignatureRef.current) {
        lastSpawnHintSignatureRef.current = spawnHintSignature;
        pushDirectiveHistory(
          state.spawnHints.length > 0
            ? `Spawn hints: ${formatSpawnHints(state.spawnHints)}`
            : "Spawn hints cleared",
        );
      }
      setDirectiveHud({
        storyBeats: [...state.storyBeats],
        spawnHints: [...state.spawnHints],
        tick: state.tick,
      });
    });

    const runtimeWorldEventUnsubscribe = runtimeClient.subscribeWorldEvents((event) => {
      if (event.type === "entity_defeated") {
        const payload = event.payload ?? {};
        const entityType = typeof payload.entityType === "string" ? payload.entityType : "entity";
        const lootSummary = formatLootSummary(payload.loot as Record<string, unknown> | undefined);
        const targetId = typeof payload.targetId === "string" ? payload.targetId : "";
        const respawnTick =
          typeof payload.respawnTick === "number" && Number.isFinite(payload.respawnTick)
            ? payload.respawnTick
            : null;
        if (targetId && respawnTick !== null) {
          defeatedTargetsRef.current.set(targetId, respawnTick);
          const target = targetStore.get(targetId);
          if (target) {
            target.object.visible = false;
          }
        }
        const message = lootSummary
          ? `${entityType} defeated. Loot: ${lootSummary}.`
          : `${entityType} defeated.`;
        pushHudToast(message, "success", 2600);
      }
    });

    const runtimeContainerStateUnsubscribe = runtimeClient.subscribeContainerStates((state) => {
      if (state.containerId === WORLD_SHARED_CONTAINER_ID) {
        setContainerHud({
          containerId: state.containerId,
          resources: {
            ...Object.fromEntries(DEFAULT_RUNTIME_RESOURCE_IDS.map((resourceId) => [resourceId, 0])),
            ...state.resources,
          },
          tick: state.tick,
        });
        return;
      }
      if (state.containerId === privateContainerId) {
        setPrivateContainerHud({
          containerId: state.containerId,
          resources: {
            ...Object.fromEntries(DEFAULT_RUNTIME_RESOURCE_IDS.map((resourceId) => [resourceId, 0])),
            ...state.resources,
          },
          tick: state.tick,
        });
      }
    });

    const runtimeCombatUnsubscribe = runtimeClient.subscribeCombatResults((result) => {
      if (result.playerId !== profile.id) {
        return;
      }

      const pending = pendingCombatActions.get(result.actionId);
      if (pending) {
        pendingCombatActions.delete(result.actionId);
      }

      const slotLabel = pending?.slotLabel ?? result.slotId;
      const slotKind = pending?.slotKind ?? result.kind;
      const cooldownMs = pending?.slotCooldownMs ?? 0;
      const targetLabel = result.targetLabel ?? pending?.targetLabel ?? "none";
      const targetId = result.targetId ?? pending?.targetId;

      if (!result.accepted) {
        const reason =
          result.reason === "cooldown_active" && typeof result.cooldownRemainingMs === "number"
            ? `cooldown ${result.cooldownRemainingMs}ms`
            : formatCombatRejectReason(result.reason);
        updateCombatStatus({
          lastAction: "rejected",
          lastTarget: targetLabel,
          targetResolution: "server-reject",
          status: `${slotLabel} rejected (${reason})`,
        });
        return;
      }

      if (cooldownMs > 0) {
        actionCooldownUntil.set(result.slotId, performance.now() + cooldownMs);
      }
      if (targetId) {
        const target = targetStore.get(targetId);
        if (target) {
          flashTarget(target.object);
        }
      }

      const animationAction = slotKind === "melee" ? "attack_light" : slotKind === "spell" ? "cast" : "interact";
      animationState = reduceAnimationState(animationState, {
        type: "action",
        action: animationAction,
        atMs: performance.now(),
      });

      let targetResolution = "none";
      if (pending?.targetId) {
        targetResolution = "client-lock";
      }
      if (
        pending?.targetWorldX !== undefined &&
        pending?.targetWorldZ !== undefined &&
        typeof result.targetWorldX === "number" &&
        typeof result.targetWorldZ === "number"
      ) {
        const lockDelta = Math.hypot(
          result.targetWorldX - pending.targetWorldX,
          result.targetWorldZ - pending.targetWorldZ,
        );
        if (lockDelta > 0.25) {
          targetResolution = "server-lock";
        }
      }

      updateCombatStatus({
        lastAction: slotKind === "melee" ? "attack" : slotKind === "spell" ? "cast" : "use_item",
        lastTarget: targetLabel,
        targetResolution,
        status: `${slotLabel} confirmed (${targetResolution})`,
      });
    });

    const runtimeInteractUnsubscribe = runtimeClient.subscribeInteractResults((result) => {
      if (result.playerId !== profile.id) {
        return;
      }

      const pending = pendingInteractActions.get(result.actionId);
      if (pending) {
        pendingInteractActions.delete(result.actionId);
      }

      const targetLabel = result.targetLabel ?? pending?.targetLabel ?? "unknown";
      if (!result.accepted) {
        const reason = formatCombatRejectReason(result.reason);
        updateCombatStatus({
          lastAction: "interact_rejected",
          lastTarget: targetLabel,
          targetResolution: "server-reject",
          status: `Interact rejected (${reason})`,
        });
        return;
      }

      animationState = reduceAnimationState(animationState, {
        type: "action",
        action: "interact",
        atMs: performance.now(),
      });

      const message = result.message ?? `${targetLabel} acknowledges you.`;
      pushHudToast(message, "info");
      updateCombatStatus({
        lastAction: "interact",
        lastTarget: targetLabel,
        targetResolution: "server-confirm",
        status: `Interacted with ${targetLabel}`,
      });
    });

    const runtimeCraftUnsubscribe = runtimeClient.subscribeCraftResults((result) => {
      if (result.playerId !== profile.id) {
        return;
      }
      const recipeLabel = CRAFT_RECIPE_BY_ID.get(result.recipeId)?.label ?? result.recipeId;
      if (!result.accepted) {
        const reason = formatCraftRejectReason(result.reason);
        pushHudToast(`Craft failed: ${reason}`, "error");
        updateCombatStatus({
          lastAction: "craft_rejected",
          status: `${recipeLabel} craft rejected (${reason})`,
        });
        return;
      }
      pushHudToast(`Crafted ${recipeLabel} x${result.count}`, "success");
      updateCombatStatus({
        lastAction: "craft",
        status: `Crafted ${recipeLabel} x${result.count}`,
      });
    });

    const runtimeContainerResultUnsubscribe = runtimeClient.subscribeContainerResults((result) => {
      if (result.playerId !== profile.id) {
        return;
      }
      if (!result.accepted) {
        const reason = formatContainerRejectReason(result.reason);
        pushHudToast(`Stash ${result.operation} failed: ${reason}`, "error");
        updateCombatStatus({
          lastAction: "stash_rejected",
          status: `Stash ${result.operation} rejected (${reason})`,
        });
        return;
      }
      pushHudToast(`Stash ${result.operation} ${result.resourceId} x${result.amount}`, "info");
      updateCombatStatus({
        lastAction: "stash",
        status: `Stash ${result.operation} ${result.resourceId} x${result.amount}`,
      });
    });

    runtimeClient.join({
      worldSeed,
      playerId: profile.id,
      startX: 0,
      startZ: 0,
    });

    function chunkKey(chunkX: number, chunkZ: number): string {
      return `${chunkX}:${chunkZ}`;
    }

    function buildSurfaceHeights(chunk: VoxelChunkData): number[][] {
      const heights = Array.from({ length: chunk.gridSize }, () => Array(chunk.gridSize).fill(0));
      const baseGlobalX = chunk.chunkX * chunk.gridSize;
      const baseGlobalZ = chunk.chunkZ * chunk.gridSize;
      for (let x = 0; x < chunk.gridSize; x += 1) {
        for (let z = 0; z < chunk.gridSize; z += 1) {
          const terrain = sampleTerrain(baseGlobalX + x, baseGlobalZ + z, chunk.worldSeed, chunk.maxHeight);
          heights[x][z] = terrain.height * chunk.blockSize;
        }
      }
      return heights;
    }

    function updateSurfaceHeightColumn(record: LoadedChunkRecord, x: number, z: number): void {
      if (x < 0 || z < 0 || x >= record.voxelChunk.gridSize || z >= record.voxelChunk.gridSize) {
        return;
      }
      let top = 0;
      for (let y = record.voxelChunk.maxHeight + 4; y >= 0; y -= 1) {
        if (hasVoxelBlock(record.voxelChunk, { x, y, z })) {
          top = y;
          break;
        }
      }
      record.surfaceHeights[x][z] = (top + 1) * record.voxelChunk.blockSize;
    }

    function resolveSurfaceHeightAt(worldX: number, worldZ: number): number {
      const chunkX = Math.floor(worldX / WORLD_CONFIG.chunkSize);
      const chunkZ = Math.floor(worldZ / WORLD_CONFIG.chunkSize);
      const record = chunkStore.get(chunkKey(chunkX, chunkZ));
      if (!record) {
        const fallback = sampleTerrainAtWorld(
          worldX,
          worldZ,
          worldSeed,
          VOXEL_MAX_HEIGHT,
          VOXEL_BLOCK_SIZE,
        );
        return fallback.height * VOXEL_BLOCK_SIZE;
      }
      return resolveSurfaceHeightInRecord(record, worldX, worldZ);
    }

    function resolveSurfaceHeightInRecord(
      record: LoadedChunkRecord,
      worldX: number,
      worldZ: number,
    ): number {
      const half = WORLD_CONFIG.chunkSize * 0.5;
      const chunkOriginX = record.chunkX * WORLD_CONFIG.chunkSize;
      const chunkOriginZ = record.chunkZ * WORLD_CONFIG.chunkSize;
      const localX = (worldX - chunkOriginX + half) / record.voxelChunk.blockSize;
      const localZ = (worldZ - chunkOriginZ + half) / record.voxelChunk.blockSize;
      const maxIndex = record.voxelChunk.gridSize - 1;
      const x0 = THREE.MathUtils.clamp(Math.floor(localX), 0, maxIndex);
      const z0 = THREE.MathUtils.clamp(Math.floor(localZ), 0, maxIndex);
      const x1 = THREE.MathUtils.clamp(x0 + 1, 0, maxIndex);
      const z1 = THREE.MathUtils.clamp(z0 + 1, 0, maxIndex);
      const tx = THREE.MathUtils.clamp(localX - x0, 0, 1);
      const tz = THREE.MathUtils.clamp(localZ - z0, 0, 1);

      const h00 = record.surfaceHeights[x0][z0] ?? 0;
      const h10 = record.surfaceHeights[x1][z0] ?? h00;
      const h01 = record.surfaceHeights[x0][z1] ?? h00;
      const h11 = record.surfaceHeights[x1][z1] ?? h00;
      const hx0 = THREE.MathUtils.lerp(h00, h10, tx);
      const hx1 = THREE.MathUtils.lerp(h01, h11, tx);
      const sampledHeight = THREE.MathUtils.lerp(hx0, hx1, tz);

      const terrainHeight =
        sampleTerrainAtWorld(
          worldX,
          worldZ,
          worldSeed,
          record.voxelChunk.maxHeight,
          record.voxelChunk.blockSize,
        ).height * record.voxelChunk.blockSize;

      return Math.max(sampledHeight, terrainHeight);
    }

    function updateNpcWanderPositions(tick: number): void {
      for (const target of targetStore.values()) {
        if (target.type !== "npc" && target.type !== "wild-mon") {
          continue;
        }
        if (!isTargetActive(target.id, target)) {
          continue;
        }
        const offset = resolveNpcWanderOffset(target.id, tick);
        const worldX = target.baseWorldX + offset.x;
        const worldZ = target.baseWorldZ + offset.z;
        const surfaceY = resolveSurfaceHeightAt(worldX, worldZ);
        const localX = worldX - (target.chunkX * WORLD_CONFIG.chunkSize);
        const localZ = worldZ - (target.chunkZ * WORLD_CONFIG.chunkSize);
        target.worldX = worldX;
        target.worldZ = worldZ;
        target.object.position.set(localX, surfaceY + (target.height * 0.5), localZ);
      }
    }

    function shouldSubmitChunkIntents(
      chunkX: number,
      chunkZ: number,
      record?: LoadedChunkRecord,
    ): boolean {
      const key = chunkKey(chunkX, chunkZ);
      if (record?.intentsSubmitted) {
        return false;
      }
      if (intentChunks.has(key)) {
        if (record) {
          record.intentsSubmitted = true;
        }
        return false;
      }
      intentChunks.add(key);
      if (record) {
        record.intentsSubmitted = true;
      }
      return true;
    }

    function recordPatchLatency(sampleMs: number): void {
      const samples = assetMetricsRef.current.patchLatencySamples;
      samples.push(Math.max(0, sampleMs));
      if (samples.length > patchLatencySampleLimit) {
        samples.splice(0, samples.length - patchLatencySampleLimit);
      }
      assetMetricsRef.current.patchLatencyLastMs = sampleMs;
    }

    function recordPatchApplyOutcome(validCount: number, invalidCount: number): void {
      assetMetricsRef.current.patchApplySuccessCount += validCount;
      assetMetricsRef.current.patchApplyFailureCount += invalidCount;
    }

    function countPatchOperations(patch: ChunkManifestPatchResponse): { validCount: number; invalidCount: number } {
      let validCount = 0;
      let invalidCount = 0;

      for (const operation of patch.patches) {
        if (operation.op === "remove") {
          validCount += 1;
          continue;
        }
        if (operation.assetId && operation.variantHash && operation.uri && operation.tier) {
          validCount += 1;
        } else {
          invalidCount += 1;
        }
      }

      return { validCount, invalidCount };
    }

    function computePlaceholderCounts(): { visible: number; total: number } {
      let visible = 0;
      let total = 0;
      for (const record of chunkStore.values()) {
        for (const slot of Object.values(record.overlayState.slots)) {
          total += 1;
          if (slot.placeholder) {
            visible += 1;
          }
        }
      }
      return { visible, total };
    }

    function refreshAssetHud(): void {
      const counts = computePlaceholderCounts();
      const samples = assetMetricsRef.current.patchLatencySamples;
      setAssetHud({
        placeholderVisibleCount: counts.visible,
        placeholderSlotCount: counts.total,
        placeholderRatio: counts.total > 0 ? counts.visible / counts.total : 0,
        patchApplySuccessCount: assetMetricsRef.current.patchApplySuccessCount,
        patchApplyFailureCount: assetMetricsRef.current.patchApplyFailureCount,
        patchLatencyLastMs: assetMetricsRef.current.patchLatencyLastMs,
        patchLatencyAvgMs: average(samples),
        patchLatencyP95Ms: percentile(samples, 0.95),
      });
    }

    function disposeGroup(group: THREE.Group): void {
      group.traverse((object) => {
        if ((object as THREE.Object3D).userData?.skipDispose) {
          return;
        }
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) {
          mesh.geometry.dispose();
        }
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((material) => material.dispose());
        } else if (mesh.material) {
          mesh.material.dispose();
        }
      });
    }

    function buildChunk(chunkX: number, chunkZ: number): LoadedChunkRecord {
      const group = new THREE.Group();
      group.position.set(chunkX * WORLD_CONFIG.chunkSize, 0, chunkZ * WORLD_CONFIG.chunkSize);

      const voxelChunk = createVoxelChunkData(chunkX, chunkZ, worldSeed, {
        blockSize: VOXEL_BLOCK_SIZE,
        maxHeight: VOXEL_MAX_HEIGHT,
      });
      const surfaceHeights = buildSurfaceHeights(voxelChunk);
      const chunkData = generateChunkData(chunkX, chunkZ, worldSeed);

      const overlayGroup = new THREE.Group();
      group.add(overlayGroup);
      const targetIds: string[] = [];
      const record: LoadedChunkRecord = {
        chunkX,
        chunkZ,
        group,
        voxelChunk,
        surfaceHeights,
        voxelRenderMesh: null,
        surfaceMesh: null,
        meshRequestVersion: 0,
        overlayGroup,
        overlayState: createPlaceholderOverlayState(DEFAULT_PLACEHOLDER_SLOTS),
        intentsSubmitted: false,
        targetIds,
      };

      chunkData.entities.forEach((entity, entityIndex) => {
        const worldX = (chunkX * WORLD_CONFIG.chunkSize) + entity.x;
        const worldZ = (chunkZ * WORLD_CONFIG.chunkSize) + entity.z;
        const surfaceY = resolveSurfaceHeightInRecord(record, worldX, worldZ);
        const entityObject = buildEntity(entity, spriteTextures, chunkData.tileSize, surfaceY);
        group.add(entityObject);
        if (entity.type === "npc" || entity.type === "wild-mon") {
          const targetId = `${chunkX}:${chunkZ}:${entity.type}:${entityIndex}`;
          entityObject.userData.targetId = targetId;
          const entityHeight =
            typeof entityObject.userData.entityHeight === "number"
              ? entityObject.userData.entityHeight
              : VOXEL_BLOCK_SIZE * 1.6;
          const targetRecord: TargetRecord = {
            id: targetId,
            label: entity.type === "npc" ? `NPC ${entityIndex + 1}` : `Monster ${entityIndex + 1}`,
            type: entity.type,
            object: entityObject,
            chunkX,
            chunkZ,
            baseWorldX: worldX,
            baseWorldZ: worldZ,
            worldX,
            worldZ,
            height: entityHeight,
          };
          targetStore.set(targetId, targetRecord);
          isTargetActive(targetId, targetRecord);
          record.targetIds.push(targetId);
        }
      });

      renderVoxelChunk(record);
      renderSurfaceMesh(record);
      renderChunkOverlay(record);
      return record;
    }

    function renderVoxelChunk(record: LoadedChunkRecord): void {
      if (record.voxelRenderMesh) {
        record.group.remove(record.voxelRenderMesh);
        record.voxelRenderMesh.geometry.dispose();
        if (Array.isArray(record.voxelRenderMesh.material)) {
          record.voxelRenderMesh.material.forEach((material) => material.dispose());
        } else {
          record.voxelRenderMesh.material.dispose();
        }
        record.voxelRenderMesh = null;
      }

      const blockCount = record.voxelChunk.blocks.size;
      record.group.userData.meshStats = {
        quads: blockCount * 6,
        vertices: blockCount * 24,
        indices: blockCount * 36,
      };
      renderSurfaceMesh(record);
      const occupancyBuffer = buildChunkOccupancyBuffer(record.voxelChunk);
      record.meshRequestVersion += 1;
      const requestVersion = record.meshRequestVersion;
      void requestChunkMeshStats(record, occupancyBuffer, requestVersion);
    }

    function renderSurfaceMesh(record: LoadedChunkRecord): void {
      if (record.surfaceMesh) {
        record.group.remove(record.surfaceMesh);
        record.surfaceMesh.geometry.dispose();
        if (Array.isArray(record.surfaceMesh.material)) {
          record.surfaceMesh.material.forEach((material) => material.dispose());
        } else {
          record.surfaceMesh.material.dispose();
        }
        record.surfaceMesh = null;
      }

      const segments = record.voxelChunk.gridSize * SURFACE_SEGMENT_MULTIPLIER;
      const geometry = new THREE.PlaneGeometry(
        WORLD_CONFIG.chunkSize,
        WORLD_CONFIG.chunkSize,
        segments,
        segments,
      );
      geometry.rotateX(-Math.PI / 2);

      const positions = geometry.attributes.position as THREE.BufferAttribute;
      const colors = new Float32Array(positions.count * 3);
      const chunkOriginX = record.chunkX * WORLD_CONFIG.chunkSize;
      const chunkOriginZ = record.chunkZ * WORLD_CONFIG.chunkSize;

      for (let index = 0; index < positions.count; index += 1) {
        const localX = positions.getX(index);
        const localZ = positions.getZ(index);
        const worldX = chunkOriginX + localX;
        const worldZ = chunkOriginZ + localZ;
        const height = resolveSurfaceHeightInRecord(record, worldX, worldZ);
        positions.setY(index, height);

        const terrain = sampleTerrainAtWorld(
          worldX,
          worldZ,
          worldSeed,
          record.voxelChunk.maxHeight,
          record.voxelChunk.blockSize,
        );
        const color = resolveTerrainSurfaceColor(
          terrain,
          terrain.height,
          record.voxelChunk.maxHeight,
          worldX,
          worldZ,
        );
        const colorIndex = index * 3;
        colors[colorIndex] = color.r;
        colors[colorIndex + 1] = color.g;
        colors[colorIndex + 2] = color.b;
      }

      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      geometry.computeVertexNormals();

      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshLambertMaterial({
          vertexColors: true,
          side: THREE.DoubleSide,
        }),
      );
      mesh.position.y = SURFACE_Y_OFFSET;
      mesh.receiveShadow = true;
      mesh.userData.isSurfaceMesh = true;
      mesh.renderOrder = 1;
      record.surfaceMesh = mesh;
      record.group.add(mesh);
    }

    async function requestChunkMeshStats(
      record: LoadedChunkRecord,
      occupancyBuffer: ReturnType<typeof buildChunkOccupancyBuffer>,
      requestVersion: number,
    ): Promise<void> {
      try {
        const extractStart = performance.now();
        const chunkMesh = await meshWorkerClient.extract(
          occupancyBuffer.width,
          occupancyBuffer.height,
          occupancyBuffer.depth,
          occupancyBuffer.occupancy,
        );
        const extractMs = performance.now() - extractStart;
        if (!isRunning || record.meshRequestVersion !== requestVersion) {
          return;
        }
        const key = chunkKey(record.chunkX, record.chunkZ);
        if (!chunkStore.has(key)) {
          return;
        }

        const uploadStart = performance.now();
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(chunkMesh.positions, 3));
        geometry.setAttribute("normal", new THREE.BufferAttribute(chunkMesh.normals, 3));
        geometry.setAttribute("uv", new THREE.BufferAttribute(chunkMesh.uvs, 2));
        geometry.setAttribute(
          "color",
          new THREE.BufferAttribute(buildChunkVertexColors(chunkMesh.positions, record.voxelChunk.maxHeight), 3),
        );
        geometry.setIndex(new THREE.BufferAttribute(chunkMesh.indices, 1));
        geometry.computeBoundingSphere();

        const voxelMaterial = new THREE.MeshLambertMaterial({
          vertexColors: true,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.01,
          depthWrite: false,
        });
        const renderMesh = new THREE.Mesh(geometry, voxelMaterial);
        const half = WORLD_CONFIG.chunkSize * 0.5;
        renderMesh.position.set(-half, 0, -half);
        renderMesh.scale.setScalar(record.voxelChunk.blockSize);
        renderMesh.userData.isVoxelChunk = true;
        renderMesh.userData.chunkKey = key;
        renderMesh.renderOrder = 0;

        if (record.voxelRenderMesh) {
          record.group.remove(record.voxelRenderMesh);
          record.voxelRenderMesh.geometry.dispose();
          if (Array.isArray(record.voxelRenderMesh.material)) {
            record.voxelRenderMesh.material.forEach((material) => material.dispose());
          } else {
            record.voxelRenderMesh.material.dispose();
          }
        }
        record.voxelRenderMesh = renderMesh;
        record.group.add(renderMesh);
        const uploadMs = performance.now() - uploadStart;

        record.group.userData.meshStats = {
          quads: chunkMesh.quads,
          vertices: chunkMesh.vertices,
          indices: chunkMesh.indexCount,
        };
        const timingRollup = recordMeshTiming(
          meshTimingTracker,
          key,
          extractMs,
          uploadMs,
        );
        const activeChunkTiming = getChunkMeshTimingAverages(
          meshTimingTracker,
          chunkKey(activeChunkX, activeChunkZ),
        );
        setMeshHud((previous) => ({
          ...previous,
          extractMs,
          uploadMs,
          extractAvgMs: timingRollup.extractAvgMs,
          uploadAvgMs: timingRollup.uploadAvgMs,
          extractP95Ms: timingRollup.extractP95Ms,
          uploadP95Ms: timingRollup.uploadP95Ms,
          activeChunkExtractAvgMs: activeChunkTiming.extractAvgMs,
          activeChunkUploadAvgMs: activeChunkTiming.uploadAvgMs,
          trackedChunks: timingRollup.trackedChunks,
          workerError: null,
        }));
      } catch (error) {
        if (!isRunning) {
          return;
        }
        setMeshHud((previous) => ({
          ...previous,
          workerError: error instanceof Error ? error.message : "MM core mesh worker failed.",
        }));
      }
    }

    function buildEntity(
      entity: ChunkEntity,
      textures: SpriteTextureSet,
      tileSize: number,
      surfaceY: number,
    ): THREE.Object3D {
      if (entity.type === "fence") {
        const fence = new THREE.Mesh(
          new THREE.BoxGeometry(tileSize * 0.92, VOXEL_BLOCK_SIZE * 0.75, VOXEL_BLOCK_SIZE * 0.2),
          new THREE.MeshLambertMaterial({ color: "#8792ab" }),
        );
        fence.position.set(entity.x, surfaceY + (VOXEL_BLOCK_SIZE * 0.38), entity.z);
        fence.rotation.y = entity.rotation;
        return fence;
      }

      if (entity.type === "rock") {
        const rock = new THREE.Mesh(
          new THREE.DodecahedronGeometry(VOXEL_BLOCK_SIZE * 0.42 * entity.scale, 0),
          new THREE.MeshLambertMaterial({ color: entity.variant === 0 ? "#766f65" : "#8a8176" }),
        );
        rock.position.set(entity.x, surfaceY + (VOXEL_BLOCK_SIZE * 0.42 * entity.scale), entity.z);
        return rock;
      }

      const spriteMap =
        entity.type === "tree"
          ? [textures.treeA, textures.treeB, textures.treeC][entity.variant % 3]
          : entity.type === "npc"
            ? [textures.npcA, textures.npcB][entity.variant % 2]
            : [textures.monA, textures.monB, textures.monC][entity.variant % 3];

      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: spriteMap,
          transparent: true,
          alphaTest: 0.45,
        }),
      );

      const baseHeight =
        entity.type === "tree"
          ? VOXEL_BLOCK_SIZE * 3.6
          : entity.type === "npc"
            ? VOXEL_BLOCK_SIZE * 1.7
            : VOXEL_BLOCK_SIZE * 1.45;
      const height = baseHeight * entity.scale;
      const width = height * (entity.type === "tree" ? 0.75 : 0.6);
      sprite.scale.set(width, height, 1);
      sprite.position.set(entity.x, surfaceY + (height * 0.5), entity.z);
      sprite.userData.entityHeight = height;
      sprite.userData.entityType = entity.type;
      return sprite;
    }

    function renderChunkOverlay(record: LoadedChunkRecord): void {
      disposeGroup(record.overlayGroup);
      record.overlayGroup.clear();

      const slots = Object.values(record.overlayState.slots).sort((a, b) => a.slotId.localeCompare(b.slotId));
      for (const slot of slots) {
        const overlayObject = buildOverlayObject(slot, record);
        record.overlayGroup.add(overlayObject);
      }
    }

    function buildOverlayObject(
      slot: ManifestOverlayState["slots"][string],
      record: LoadedChunkRecord,
    ): THREE.Object3D {
      const { x, z } = getOverlayLocalPosition(slot.slotId, record.chunkX, record.chunkZ);
      const worldX = (record.chunkX * WORLD_CONFIG.chunkSize) + x;
      const worldZ = (record.chunkZ * WORLD_CONFIG.chunkSize) + z;
      const surfaceY = resolveSurfaceHeightInRecord(record, worldX, worldZ);
      const baseColor = slot.placeholder ? "#665f55" : hashToColor(slot.variantHash);
      const isVolumetric =
        slot.assetClass === "prop_3d" ||
        slot.assetClass === "npc_3d" ||
        slot.assetClass === "hero_prop_3d" ||
        slot.assetClass === "terrain_voxel";

      if (isVolumetric) {
        const baseSize = VOXEL_BLOCK_SIZE * 0.7;
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(baseSize, slot.placeholder ? baseSize : baseSize * 1.6, baseSize),
          new THREE.MeshLambertMaterial({ color: baseColor }),
        );
        mesh.position.set(x, surfaceY + ((slot.placeholder ? baseSize : baseSize * 1.6) * 0.5), z);
        return mesh;
      }

      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(VOXEL_BLOCK_SIZE * 1.05, VOXEL_BLOCK_SIZE * 1.2),
        new THREE.MeshLambertMaterial({
          color: baseColor,
          transparent: true,
          opacity: slot.placeholder ? 0.48 : 0.9,
          side: THREE.DoubleSide,
        }),
      );
      plane.position.set(x, surfaceY + (VOXEL_BLOCK_SIZE * 0.75), z);
      plane.rotation.y = Math.PI;
      return plane;
    }

    function getOverlayLocalPosition(slotId: string, chunkX: number, chunkZ: number): { x: number; z: number } {
      const hashA = numericHash(`${slotId}:${chunkX}:${chunkZ}:a`);
      const hashB = numericHash(`${slotId}:${chunkX}:${chunkZ}:b`);
      const normalizedA = ((hashA % 1000) / 1000) - 0.5;
      const normalizedB = ((hashB % 1000) / 1000) - 0.5;

      const span = WORLD_CONFIG.chunkSize * 0.66;
      return {
        x: normalizedA * span,
        z: normalizedB * span,
      };
    }

    async function hydrateChunkManifest(record: LoadedChunkRecord): Promise<void> {
      try {
            const manifest = await assetClient.getChunkManifest(
          worldSeed,
          record.chunkX,
          record.chunkZ,
        );

        const live = chunkStore.get(chunkKey(record.chunkX, record.chunkZ));
        if (!live) {
          return;
        }
        live.overlayState = applyManifestToOverlay(live.overlayState, manifest);
        renderChunkOverlay(live);
      } catch {
        // Fallback remains in place when manifest fetch fails.
      }
    }

    async function submitChunkPlaceholderIntents(record: LoadedChunkRecord): Promise<void> {
      await submitChunkPlaceholderIntentsForChunk(record.chunkX, record.chunkZ, "high", record);
    }

    async function submitChunkPlaceholderIntentsForChunk(
      chunkX: number,
      chunkZ: number,
      priority: AssetIntentPriority,
      record?: LoadedChunkRecord,
    ): Promise<void> {
      if (!shouldSubmitChunkIntents(chunkX, chunkZ, record)) {
        return;
      }

      for (const template of DEFAULT_PLACEHOLDER_SLOTS) {
        const semanticTag = template.slotId.split(":")[1] ?? "slot";
        try {
          await assetClient.submitAssetIntent({
            intentId: `${worldSeed}:${chunkX}:${chunkZ}:${template.slotId}:${Date.now()}`,
            worldSeed,
            chunk: { x: chunkX, z: chunkZ },
            assetClass: template.assetClass,
            semanticTags: [semanticTag],
            styleProfileId: "frontier-v1",
            recipeId: resolveRecipeForClass(template.assetClass),
            runtimeBudget: {
              maxTris: template.assetClass === "prop_3d" ? 3000 : 0,
              maxTextureSize: 1024,
              maxMemoryKb: template.assetClass === "prop_3d" ? 1536 : 384,
            },
            priority,
            deadlineMs: 2500,
            idempotencyKey: `${worldSeed}:${chunkX}:${chunkZ}:${template.slotId}`,
          });
        } catch {
          // Keep placeholders if submission fails.
        }
      }
    }

    function prewarmChunkFrontier(chunkX: number, chunkZ: number): void {
      const prewarmRadius = WORLD_CONFIG.activeChunkRadius + 1;
      for (let x = -prewarmRadius; x <= prewarmRadius; x += 1) {
        for (let z = -prewarmRadius; z <= prewarmRadius; z += 1) {
          if (Math.max(Math.abs(x), Math.abs(z)) !== prewarmRadius) {
            continue;
          }
          void submitChunkPlaceholderIntentsForChunk(chunkX + x, chunkZ + z, "normal");
        }
      }
    }

    async function pollChunkManifestPatches(): Promise<void> {
      const records = Array.from(chunkStore.values());
      await Promise.all(
        records.map(async (record) => {
          try {
            const startedAt = performance.now();
            const patch = await assetClient.getChunkManifestPatches(
              worldSeed,
              record.chunkX,
              record.chunkZ,
              record.overlayState.manifestVersion,
            );
            const latencyMs = performance.now() - startedAt;
            recordPatchLatency(latencyMs);

            if (patch.patches.length > 0) {
              const { validCount, invalidCount } = countPatchOperations(patch);
              recordPatchApplyOutcome(validCount, invalidCount);
            }

            if (patch.toVersion <= record.overlayState.manifestVersion || patch.patches.length === 0) {
              return;
            }

            const live = chunkStore.get(chunkKey(record.chunkX, record.chunkZ));
            if (!live) {
              return;
            }

            live.overlayState = applyPatchToOverlay(live.overlayState, patch);
            renderChunkOverlay(live);
          } catch {
            // Ignore patch polling failures; retain current visuals.
          }
        }),
      );
    }

    async function emitWorldEvent(
      type: WorldEventType,
      payload: Record<string, unknown>,
    ): Promise<void> {
      try {
        const ack = await orchestratorClient.publishEvent({
          eventId: createEventId(),
          worldId: profile.world.id,
          worldSeed,
          playerId: profile.id,
          type,
          occurredAt: new Date().toISOString(),
          payload,
        });

        setOrchestratorHud((previous) => ({
          eventsSent: previous.eventsSent + 1,
          directivesReceived: previous.directivesReceived + ack.directives.length,
          lastEventType: type,
          lastError: null,
        }));
      } catch (error) {
        setOrchestratorHud((previous) => ({
          ...previous,
          eventsSent: previous.eventsSent + 1,
          lastEventType: type,
          lastError: error instanceof Error ? error.message : "unknown orchestrator error",
        }));
      }
    }

    function updateCombatStatus(partial: Partial<CombatHudState>): void {
      const selectedSlot = hotbarSlotsRef.current[selectedHotbarRef.current] ?? hotbarSlotsRef.current[0];
      if (!selectedSlot) {
        return;
      }
      const remaining = Math.max(
        0,
        Math.ceil((actionCooldownUntil.get(selectedSlot.id) ?? 0) - performance.now()),
      );
      setCombatHud((previous) => ({
        ...previous,
        selectedSlotId: selectedSlot.id,
        selectedSlotLabel: selectedSlot.label,
        selectedCooldownMs: remaining,
        ...partial,
      }));
    }

    function getSelectedHotbarSlot(): HotbarSlot {
      return hotbarSlotsRef.current[selectedHotbarRef.current] ?? hotbarSlotsRef.current[0] ?? HOTBAR_SLOTS[0];
    }

    function findNearestTarget(worldX: number, worldZ: number, maxDistance: number): string | null {
      let bestTargetId: string | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;

      for (const target of targetStore.values()) {
        if (!isTargetActive(target.id, target)) {
          continue;
        }
        const dx = target.worldX - worldX;
        const dz = target.worldZ - worldZ;
        const distance = Math.hypot(dx, dz);
        if (distance > maxDistance || distance >= bestDistance) {
          continue;
        }
        bestDistance = distance;
        bestTargetId = target.id;
      }

      return bestTargetId;
    }

    function setRayFromClient(clientX: number, clientY: number): void {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -(((clientY - rect.top) / rect.height) * 2 - 1);
      raycaster.setFromCamera(pointerNdc, camera);
    }

    function resolveTargetFromClick(clientX: number, clientY: number): string | null {
      setRayFromClient(clientX, clientY);

      const targetObjects = Array.from(targetStore.values()).map((entry) => entry.object);
      if (targetObjects.length > 0) {
        const hit = raycaster.intersectObjects(targetObjects, false)[0];
        if (hit) {
          const targetId = hit.object.userData.targetId;
          if (typeof targetId === "string" && targetStore.has(targetId)) {
            const target = targetStore.get(targetId);
            if (target && isTargetActive(targetId, target)) {
              return targetId;
            }
          }
        }
      }

      const planeHit = raycaster.ray.intersectPlane(groundPlane, groundHitPoint);
      if (!planeHit) {
        return null;
      }

      return findNearestTarget(groundHitPoint.x, groundHitPoint.z, 4.2);
    }

    function resolveVoxelHit(
      clientX: number,
      clientY: number,
    ): {
      record: LoadedChunkRecord;
      breakPosition: VoxelBlockPosition;
      placePosition: VoxelBlockPosition;
    } | null {
      setRayFromClient(clientX, clientY);
      const meshes = Array.from(chunkStore.values())
        .map((record) => record.voxelRenderMesh)
        .filter((mesh): mesh is THREE.Mesh => mesh !== null);
      if (meshes.length === 0) {
        return null;
      }

      const hit = raycaster.intersectObjects(meshes, false)[0];
      if (!hit || !hit.face) {
        return null;
      }
      const mesh = hit.object as THREE.Mesh;
      const chunkId = mesh.userData.chunkKey as string | undefined;
      if (!chunkId) {
        return null;
      }
      const record = chunkStore.get(chunkId);
      if (!record) {
        return null;
      }

      const worldNormal = hit.face.normal.clone().transformDirection(mesh.matrixWorld).normalize();
      const surfaceHit = resolveVoxelSurfaceHit(
        record.voxelChunk,
        record.chunkX,
        record.chunkZ,
        {
          x: hit.point.x,
          y: hit.point.y,
          z: hit.point.z,
        },
        {
          x: worldNormal.x,
          y: worldNormal.y,
          z: worldNormal.z,
        },
      );
      if (!surfaceHit) {
        return null;
      }
      return {
        record,
        breakPosition: surfaceHit.breakPosition,
        placePosition: surfaceHit.placePosition,
      };
    }

    function applyRuntimeBlockDelta(delta: RuntimeBlockDelta): void {
      const record = chunkStore.get(chunkKey(delta.chunkX, delta.chunkZ));
      if (!record) {
        return;
      }

      const position: VoxelBlockPosition = {
        x: delta.x,
        y: delta.y,
        z: delta.z,
      };

      if (delta.action === "break") {
        const changed = removeVoxelBlock(record.voxelChunk, position);
        if (changed) {
          updateSurfaceHeightColumn(record, position.x, position.z);
          renderVoxelChunk(record);
        }
        return;
      }

      const blockType = delta.blockType === "wood" ? "wood" : "dirt";
      setVoxelBlock(record.voxelChunk, position, blockType);
      updateSurfaceHeightColumn(record, position.x, position.z);
      renderVoxelChunk(record);
    }

    function flashTarget(targetObject: THREE.Object3D): void {
      if (targetObject instanceof THREE.Sprite && targetObject.material instanceof THREE.SpriteMaterial) {
        const previousColor = targetObject.material.color.getHex();
        targetObject.material.color.set("#ffd772");
        const timeoutId = window.setTimeout(() => {
          targetObject.material.color.setHex(previousColor);
          flashTimeouts.delete(timeoutId);
        }, 130);
        flashTimeouts.add(timeoutId);
      }
    }

    function executePrimaryAction(clientX: number, clientY: number, button: number): void {
      const slot = getSelectedHotbarSlot();
      const now = performance.now();
      const cooldownUntil = actionCooldownUntil.get(slot.id) ?? 0;
      if (cooldownUntil > now) {
        const remainingMs = Math.ceil(cooldownUntil - now);
        updateCombatStatus({
          lastAction: "cooldown",
          status: `${slot.label} cooldown ${remainingMs}ms`,
        });
        return;
      }

      if (button === 2) {
        const voxelHit = resolveVoxelHit(clientX, clientY);
        if (!voxelHit) {
          updateCombatStatus({
            lastAction: "place_failed",
            status: "No block face selected",
          });
          return;
        }

        const placePosition: VoxelBlockPosition = voxelHit.placePosition;

        if (!isValidPosition(voxelHit.record.voxelChunk, placePosition)) {
          updateCombatStatus({
            lastAction: "place_invalid",
            status: "Placement outside chunk bounds",
          });
          return;
        }
        if (hasVoxelBlock(voxelHit.record.voxelChunk, placePosition)) {
          updateCombatStatus({
            lastAction: "place_blocked",
            status: "That block space is occupied",
          });
          return;
        }

        runtimeClient.submitBlockAction(profile.id, {
          action: "place",
          chunkX: voxelHit.record.chunkX,
          chunkZ: voxelHit.record.chunkZ,
          x: placePosition.x,
          y: placePosition.y,
          z: placePosition.z,
          blockType: slot.kind === "item" ? "wood" : "dirt",
        });
        actionCooldownUntil.set(slot.id, now + Math.max(220, Math.floor(slot.cooldownMs * 0.55)));
        updateCombatStatus({
          lastAction: "place_block",
          lastTarget: `(${placePosition.x},${placePosition.y},${placePosition.z})`,
          status: `${slot.label} place request sent`,
        });
        return;
      }

      if (slot.targetMode === "self" && slot.kind !== "melee") {
        const actionId = createEventId();
        pendingCombatActions.set(actionId, {
          slotId: slot.id,
          slotKind: slot.kind,
          slotLabel: slot.label,
          slotCooldownMs: slot.cooldownMs,
          targetId: profile.id,
          targetLabel: playerLabel,
          targetWorldX: playerPosition.x,
          targetWorldZ: playerPosition.z,
        });
        runtimeClient.submitCombatAction(profile.id, {
          actionId,
          slotId: slot.id,
          kind: slot.kind,
          targetId: profile.id,
          targetLabel: playerLabel,
          targetWorldX: playerPosition.x,
          targetWorldZ: playerPosition.z,
        });
        updateCombatStatus({
          lastAction: "request",
          lastTarget: playerLabel,
          targetResolution: "pending",
          status: `${slot.label} request sent (pending)`,
        });
        return;
      }

      const targetId = resolveTargetFromClick(clientX, clientY);
      if (targetId) {
        const target = targetStore.get(targetId);
        if (!target) {
          updateCombatStatus({
            lastAction: "invalid_target",
            lastTarget: "none",
            status: "Target is no longer available",
          });
          return;
        }

        const dx = target.worldX - playerPosition.x;
        const dz = target.worldZ - playerPosition.z;
        const distance = Math.hypot(dx, dz);
        if (distance > slot.range) {
          updateCombatStatus({
            lastAction: "out_of_range",
            lastTarget: target.label,
            status: `${target.label} is out of range (${distance.toFixed(1)}m)`,
          });
          return;
        }

        yaw = Math.atan2(dx, dz);
        const actionId = createEventId();
        pendingCombatActions.set(actionId, {
          slotId: slot.id,
          slotKind: slot.kind,
          slotLabel: slot.label,
          slotCooldownMs: slot.cooldownMs,
          targetId: target.id,
          targetLabel: target.label,
          targetWorldX: target.worldX,
          targetWorldZ: target.worldZ,
        });
        runtimeClient.submitCombatAction(profile.id, {
          actionId,
          slotId: slot.id,
          kind: slot.kind,
          targetId: target.id,
          targetLabel: target.label,
          targetWorldX: target.worldX,
          targetWorldZ: target.worldZ,
        });
        updateCombatStatus({
          lastAction: "request",
          lastTarget: target.label,
          targetResolution: "pending",
          status: `${slot.label} request sent (${distance.toFixed(1)}m, pending)`,
        });
        return;
      }

      const voxelHit = resolveVoxelHit(clientX, clientY);
      if (voxelHit) {
        runtimeClient.submitBlockAction(profile.id, {
          action: "break",
          chunkX: voxelHit.record.chunkX,
          chunkZ: voxelHit.record.chunkZ,
          x: voxelHit.breakPosition.x,
          y: voxelHit.breakPosition.y,
          z: voxelHit.breakPosition.z,
        });
        actionCooldownUntil.set(slot.id, now + Math.max(180, Math.floor(slot.cooldownMs * 0.4)));
        updateCombatStatus({
          lastAction: "break_block",
          lastTarget: `(${voxelHit.breakPosition.x},${voxelHit.breakPosition.y},${voxelHit.breakPosition.z})`,
          status: `${slot.label} break request sent`,
        });
        return;
      }

      updateCombatStatus({
        lastAction: "no_target",
        lastTarget: "none",
        status: "No target or block selected",
      });
    }

    function executeInteractAction(): void {
      const targetId = findNearestTarget(playerPosition.x, playerPosition.z, INTERACT_RANGE);
      if (!targetId) {
        updateCombatStatus({
          lastAction: "interact_none",
          lastTarget: "none",
          status: "No nearby target to interact with",
        });
        return;
      }

      const target = targetStore.get(targetId);
      if (!target) {
        updateCombatStatus({
          lastAction: "interact_missing",
          lastTarget: "none",
          status: "Target is no longer available",
        });
        return;
      }

      const actionId = createEventId();
      pendingInteractActions.set(actionId, {
        targetId: target.id,
        targetLabel: target.label,
      });
      runtimeClient.submitInteractAction(profile.id, {
        actionId,
        targetId: target.id,
        targetLabel: target.label,
        targetWorldX: target.worldX,
        targetWorldZ: target.worldZ,
      });
      updateCombatStatus({
        lastAction: "interact_request",
        lastTarget: target.label,
        targetResolution: "pending",
        status: `Interacting with ${target.label}...`,
      });
    }

    function onInteractionClick(clientX: number, clientY: number, button: number): void {
      if (button !== 0 && button !== 2) {
        return;
      }
      executePrimaryAction(clientX, clientY, button);
    }

    const chunkManager = new ChunkManager(
      WORLD_CONFIG.activeChunkRadius,
      (chunkX, chunkZ) => {
        const key = chunkKey(chunkX, chunkZ);
        if (!chunkStore.has(key)) {
          const record = buildChunk(chunkX, chunkZ);
          chunkStore.set(key, record);
          worldRoot.add(record.group);
          void submitChunkPlaceholderIntents(record).then(() => hydrateChunkManifest(record));
          void hydrateChunkManifest(record);
        }
      },
      (chunkX, chunkZ) => {
        const key = chunkKey(chunkX, chunkZ);
        const chunk = chunkStore.get(key);
        if (chunk) {
          for (const targetId of chunk.targetIds) {
            targetStore.delete(targetId);
          }
          worldRoot.remove(chunk.group);
          chunkStore.delete(key);
          disposeGroup(chunk.group);
        }
      },
    );

    function onKeyDown(event: KeyboardEvent): void {
      const key = event.key.toLowerCase();
      if (key === "escape") {
        const next = !menuOpenRef.current;
        menuOpenRef.current = next;
        setMenuOpen(next);
        if (next) {
          keyState.clear();
          jumpQueued = false;
        }
        event.preventDefault();
        return;
      }
      if (event.code === "Backquote" || key === "`") {
        setCameraMode((previous) => (previous === "first-person" ? "third-person" : "first-person"));
        updateCombatStatus({
          lastAction: "camera_toggle",
          status: "Camera toggled (`)",
        });
        event.preventDefault();
        return;
      }
      if (menuOpenRef.current) {
        return;
      }
      if (key === "f3") {
        const next = !showDiagnosticsRef.current;
        setShowDiagnostics(next);
        updateCombatStatus({
          lastAction: "diagnostics_toggle",
          status: `Diagnostics ${next ? "enabled" : "hidden"}`,
        });
        event.preventDefault();
        return;
      }
      if (key === "f4") {
        const nextMode = meshDetailModeRef.current === "detailed" ? "basic" : "detailed";
        setMeshDetailMode(nextMode);
        updateCombatStatus({
          lastAction: "diagnostics_toggle",
          status: `Mesh detail mode: ${nextMode}`,
        });
        event.preventDefault();
        return;
      }
      if (key === "f5") {
        const next = !showMinimapDebugRef.current;
        setShowMinimapDebug(next);
        updateCombatStatus({
          lastAction: "diagnostics_toggle",
          status: `Minimap debug ${next ? "enabled" : "hidden"}`,
        });
        event.preventDefault();
        return;
      }
      if (event.code === "Space") {
        jumpQueued = true;
        updateCombatStatus({
          lastAction: "jump",
          status: "Jump",
        });
        event.preventDefault();
        return;
      }
      if (key === "f") {
        executeInteractAction();
        event.preventDefault();
        return;
      }
      const hotbarIndex = HOTBAR_KEY_TO_INDEX.get(key);
      if (hotbarIndex !== undefined) {
        const nextIndex = clampHotbarIndex(hotbarIndex, hotbarSlotsRef.current.length);
        setSelectedHotbarIndex(nextIndex);
        runtimeClient.selectHotbarSlot(profile.id, nextIndex);
        event.preventDefault();
        return;
      }
      const craftRecipeIndex = resolveCraftRecipeIndexForKey(key);
      if (craftRecipeIndex !== undefined) {
        const nextCraftIndex = clampCraftRecipeIndex(craftRecipeIndex);
        setSelectedCraftRecipeIndex(nextCraftIndex);
        const recipe = resolveCraftRecipeByIndex(nextCraftIndex);
        updateCombatStatus({
          lastAction: "craft_select",
          status: `Craft selected: ${recipe.label} (${recipe.summary})`,
        });
        event.preventDefault();
        return;
      }
      if (key === "r") {
        const selectedRecipe = resolveCraftRecipeByIndex(selectedCraftRecipeIndexRef.current);
        runtimeClient.submitCraftRequest(profile.id, {
          actionId: createEventId(),
          recipeId: selectedRecipe.id,
          count: 1,
        });
        updateCombatStatus({
          lastAction: "craft_request",
          status: `Craft request sent (${selectedRecipe.label}; ${selectedRecipe.summary})`,
        });
        event.preventDefault();
        return;
      }
      if (key === "n") {
        const nextIndex = cycleRuntimeResourceIndex(selectedStashResourceIndexRef.current, -1);
        setSelectedStashResourceIndex(nextIndex);
        const resourceId = resolveRuntimeResourceId(nextIndex);
        updateCombatStatus({
          lastAction: "resource_select",
          status: `Stash resource selected: ${formatRuntimeResourceLabel(resourceId)}`,
        });
        event.preventDefault();
        return;
      }
      if (key === "m") {
        const nextIndex = cycleRuntimeResourceIndex(selectedStashResourceIndexRef.current, 1);
        setSelectedStashResourceIndex(nextIndex);
        const resourceId = resolveRuntimeResourceId(nextIndex);
        updateCombatStatus({
          lastAction: "resource_select",
          status: `Stash resource selected: ${formatRuntimeResourceLabel(resourceId)}`,
        });
        event.preventDefault();
        return;
      }
      if (key === "j") {
        const nextIndex = cycleTransferAmountIndex(selectedTransferAmountIndexRef.current, -1);
        setSelectedTransferAmountIndex(nextIndex);
        const amount = resolveTransferAmount(nextIndex);
        updateCombatStatus({
          lastAction: "transfer_amount_select",
          status: `Stash transfer amount selected: x${amount}`,
        });
        event.preventDefault();
        return;
      }
      if (key === "k") {
        const nextIndex = cycleTransferAmountIndex(selectedTransferAmountIndexRef.current, 1);
        setSelectedTransferAmountIndex(nextIndex);
        const amount = resolveTransferAmount(nextIndex);
        updateCombatStatus({
          lastAction: "transfer_amount_select",
          status: `Stash transfer amount selected: x${amount}`,
        });
        event.preventDefault();
        return;
      }
      const selectedResourceId = resolveRuntimeResourceId(selectedStashResourceIndexRef.current);
      const selectedResourceLabel = formatRuntimeResourceLabel(selectedResourceId);
      const selectedAmount = resolveTransferAmount(selectedTransferAmountIndexRef.current);
      const transferModifier = resolveTransferModifier({
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
      });
      const transferModeLabel =
        transferModifier === "all" ? "all" : transferModifier === "half" ? "half" : "base";
      const resolveTransferAmountFor = (operation: "deposit" | "withdraw", containerId: string): number => {
        const sourceAmount =
          operation === "deposit"
            ? (inventoryResourcesRef.current[selectedResourceId] ?? 0)
            : containerId === WORLD_SHARED_CONTAINER_ID
              ? (sharedContainerResourcesRef.current[selectedResourceId] ?? 0)
              : (privateContainerResourcesRef.current[selectedResourceId] ?? 0);
        return resolveRequestedTransferAmount(selectedAmount, sourceAmount, transferModifier);
      };
      if (key === "[") {
        const transferAmount = resolveTransferAmountFor("deposit", WORLD_SHARED_CONTAINER_ID);
        if (transferAmount <= 0) {
          updateCombatStatus({
            lastAction: "stash_request_blocked",
            status: `No ${selectedResourceLabel} available to deposit`,
          });
          event.preventDefault();
          return;
        }
        runtimeClient.submitContainerAction(profile.id, {
          actionId: createEventId(),
          containerId: WORLD_SHARED_CONTAINER_ID,
          operation: "deposit",
          resourceId: selectedResourceId,
          amount: transferAmount,
        });
        updateCombatStatus({
          lastAction: "stash_request",
          status: `Stash deposit request sent (${selectedResourceLabel} x${transferAmount}; ${transferModeLabel})`,
        });
        event.preventDefault();
        return;
      }
      if (key === "]") {
        const transferAmount = resolveTransferAmountFor("withdraw", WORLD_SHARED_CONTAINER_ID);
        if (transferAmount <= 0) {
          updateCombatStatus({
            lastAction: "stash_request_blocked",
            status: `No ${selectedResourceLabel} available in shared stash`,
          });
          event.preventDefault();
          return;
        }
        runtimeClient.submitContainerAction(profile.id, {
          actionId: createEventId(),
          containerId: WORLD_SHARED_CONTAINER_ID,
          operation: "withdraw",
          resourceId: selectedResourceId,
          amount: transferAmount,
        });
        updateCombatStatus({
          lastAction: "stash_request",
          status: `Stash withdraw request sent (${selectedResourceLabel} x${transferAmount}; ${transferModeLabel})`,
        });
        event.preventDefault();
        return;
      }
      if (key === ";") {
        const transferAmount = resolveTransferAmountFor("deposit", privateContainerId);
        if (transferAmount <= 0) {
          updateCombatStatus({
            lastAction: "stash_request_blocked",
            status: `No ${selectedResourceLabel} available to deposit`,
          });
          event.preventDefault();
          return;
        }
        runtimeClient.submitContainerAction(profile.id, {
          actionId: createEventId(),
          containerId: privateContainerId,
          operation: "deposit",
          resourceId: selectedResourceId,
          amount: transferAmount,
        });
        updateCombatStatus({
          lastAction: "stash_request",
          status: `Private stash deposit request sent (${selectedResourceLabel} x${transferAmount}; ${transferModeLabel})`,
        });
        event.preventDefault();
        return;
      }
      if (key === "'") {
        const transferAmount = resolveTransferAmountFor("withdraw", privateContainerId);
        if (transferAmount <= 0) {
          updateCombatStatus({
            lastAction: "stash_request_blocked",
            status: `No ${selectedResourceLabel} available in private stash`,
          });
          event.preventDefault();
          return;
        }
        runtimeClient.submitContainerAction(profile.id, {
          actionId: createEventId(),
          containerId: privateContainerId,
          operation: "withdraw",
          resourceId: selectedResourceId,
          amount: transferAmount,
        });
        updateCombatStatus({
          lastAction: "stash_request",
          status: `Private stash withdraw request sent (${selectedResourceLabel} x${transferAmount}; ${transferModeLabel})`,
        });
        event.preventDefault();
        return;
      }

      keyState.add(key);
    }

    function onKeyUp(event: KeyboardEvent): void {
      keyState.delete(event.key.toLowerCase());
    }

    function onResize(): void {
      if (!mount) {
        return;
      }
      const nextAspect = mount.clientWidth / mount.clientHeight;
      camera.aspect = nextAspect;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5) * RENDER_SCALE);
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    }

    function onPointerDown(event: PointerEvent): void {
      if (menuOpenRef.current) {
        return;
      }
      if (event.button !== 0 && event.button !== 2) {
        return;
      }
      if (event.button === 2) {
        pointerMoved = false;
        pointerDownAt = performance.now();
        pointerDownX = event.clientX;
        pointerDownY = event.clientY;
        activePointerId = event.pointerId;
        renderer.domElement.setPointerCapture(event.pointerId);
        return;
      }
      draggingCamera = true;
      activePointerId = event.pointerId;
      pointerMoved = false;
      pointerDownAt = performance.now();
      pointerDownX = event.clientX;
      pointerDownY = event.clientY;
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      renderer.domElement.setPointerCapture(event.pointerId);
    }

    function onPointerMove(event: PointerEvent): void {
      if (menuOpenRef.current) {
        return;
      }
      if (!draggingCamera || activePointerId !== event.pointerId) {
        if (activePointerId === event.pointerId && !pointerMoved) {
          if (Math.abs(event.clientX - pointerDownX) + Math.abs(event.clientY - pointerDownY) > 6) {
            pointerMoved = true;
          }
        }
        return;
      }

      const dx = event.clientX - lastPointerX;
      const dy = event.clientY - lastPointerY;
      if (!pointerMoved && Math.abs(event.clientX - pointerDownX) + Math.abs(event.clientY - pointerDownY) > 6) {
        pointerMoved = true;
      }
      yaw -= dx * 0.006;
      pitch = THREE.MathUtils.clamp(pitch - (dy * 0.004), -0.55, 0.45);
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
    }

    function onPointerUp(event: PointerEvent): void {
      if (menuOpenRef.current) {
        return;
      }
      if (activePointerId !== event.pointerId) {
        return;
      }

      const wasClick = !pointerMoved && performance.now() - pointerDownAt < 300;
      const button = event.button;
      draggingCamera = false;
      activePointerId = null;
      if (renderer.domElement.hasPointerCapture(event.pointerId)) {
        renderer.domElement.releasePointerCapture(event.pointerId);
      }
      if (wasClick) {
        onInteractionClick(event.clientX, event.clientY, button);
      }
    }

    function onContextMenu(event: MouseEvent): void {
      event.preventDefault();
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("resize", onResize);
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerUp);
    renderer.domElement.addEventListener("contextmenu", onContextMenu);

    chunkManager.update(activeChunkX * WORLD_CONFIG.chunkSize, activeChunkZ * WORLD_CONFIG.chunkSize);
    const startChunk = chunkManager.getActiveChunk();
    activeChunkX = startChunk.chunkX;
    activeChunkZ = startChunk.chunkZ;
    prewarmChunkFrontier(activeChunkX, activeChunkZ);
    void emitWorldEvent("world_session_started", {
      startChunkX: activeChunkX,
      startChunkZ: activeChunkZ,
    });
    patchIntervalId = window.setInterval(() => {
      void pollChunkManifestPatches();
    }, 1200);

    let previousTime = performance.now();
    function loop(timestamp: number): void {
      if (!isRunning) {
        return;
      }

      const deltaSeconds = Math.min((timestamp - previousTime) / 1000, 0.1);
      previousTime = timestamp;

      if (menuOpenRef.current) {
        keyState.clear();
        jumpQueued = false;
      }

      if (keyState.has("q") || keyState.has("arrowleft")) {
        yaw += turnSpeed * deltaSeconds;
      }
      if (keyState.has("e") || keyState.has("arrowright")) {
        yaw -= turnSpeed * deltaSeconds;
      }

      forwardVector.set(Math.sin(yaw), 0, Math.cos(yaw));
      rightVector.set(forwardVector.z, 0, -forwardVector.x);

      moveVector.set(0, 0, 0);
      if (keyState.has("w") || keyState.has("arrowup")) {
        moveVector.add(forwardVector);
      }
      if (keyState.has("s") || keyState.has("arrowdown")) {
        moveVector.sub(forwardVector);
      }
      if (keyState.has("a")) {
        moveVector.add(rightVector);
      }
      if (keyState.has("d")) {
        moveVector.sub(rightVector);
      }

      const moving = moveVector.lengthSq() > 0;
      if (moving) {
        moveVector.normalize();
      }
      const downed = healthHudRef.current.current <= 0;
      if (downed && jumpQueued) {
        jumpQueued = false;
      }
      const jumpInput = !downed && jumpQueued;
      runtimeClient.setInput(profile.id, {
        moveX: downed ? 0 : moveVector.x,
        moveZ: downed ? 0 : moveVector.z,
        running: !downed && keyState.has("shift"),
        jump: jumpInput,
      });

      if (runtimeState.hasSnapshot) {
        playerPosition.x += (runtimeState.positionX - playerPosition.x) * 0.48;
        playerPosition.z += (runtimeState.positionZ - playerPosition.z) * 0.48;
      }
      const surfaceHeight = resolveSurfaceHeightAt(playerPosition.x, playerPosition.z);
      const grounded = playerPosition.y <= surfaceHeight + 0.04;
      if (grounded) {
        playerPosition.y = surfaceHeight;
        if (jumpQueued) {
          verticalVelocity = JUMP_VELOCITY;
          jumpQueued = false;
        } else {
          verticalVelocity = Math.max(0, verticalVelocity);
        }
      } else {
        if (jumpQueued) {
          jumpQueued = false;
        }
        verticalVelocity -= GRAVITY_ACCELERATION * deltaSeconds;
      }
      playerPosition.y += verticalVelocity * deltaSeconds;
      if (playerPosition.y < surfaceHeight) {
        playerPosition.y = surfaceHeight;
        verticalVelocity = 0;
      }

      playerSprite.position.x = playerPosition.x;
      playerSprite.position.z = playerPosition.z;
      playerSprite.position.y = playerPosition.y + (PLAYER_HEIGHT * 0.5);
      playerShadow.position.x = playerPosition.x;
      playerShadow.position.z = playerPosition.z;
      playerShadow.position.y = playerPosition.y + 0.06;

      animationState = reduceAnimationState(animationState, {
        type: "locomotion",
        moving: runtimeState.speed > 0.01,
        running: keyState.has("shift"),
        atMs: timestamp,
      });
      const actionElapsedMs = Math.max(0, timestamp - animationState.actionStartedAtMs);
      const frame = resolveAnimationFrameIndex(animationState.action, actionElapsedMs);
      if (frame !== cachedPlayerFrame) {
        cachedPlayerFrame = frame;
        playerMaterial.map = frame === 0 ? spriteTextures.playerA : spriteTextures.playerB;
        playerMaterial.needsUpdate = true;
      }

      const activeCameraMode = cameraModeRef.current;
      const hideAvatar = activeCameraMode === "first-person";
      playerSprite.visible = !hideAvatar;
      playerShadow.visible = !hideAvatar;

      for (const remote of remotePlayers.values()) {
        remote.targetX = Number.isFinite(remote.targetX) ? remote.targetX : 0;
        remote.targetZ = Number.isFinite(remote.targetZ) ? remote.targetZ : 0;
        const currentX = remote.sprite.position.x;
        const currentZ = remote.sprite.position.z;
        const smoothing = remote.speed > 0.1 ? 0.35 : 0.22;
        const nextX = currentX + ((remote.targetX - currentX) * smoothing);
        const nextZ = currentZ + ((remote.targetZ - currentZ) * smoothing);
        const surfaceY = resolveSurfaceHeightAt(nextX, nextZ);
        remote.sprite.position.set(nextX, surfaceY + (PLAYER_HEIGHT * 0.5), nextZ);
        remote.shadow.position.set(nextX, surfaceY + 0.06, nextZ);

        const frame = remote.speed > 0.1 ? (Math.floor(timestamp / 220) % 2) : 0;
        if (frame !== remote.frame) {
          remote.frame = frame;
          const material = remote.sprite.material as THREE.SpriteMaterial;
          material.map = frame === 0 ? spriteTextures.playerA : spriteTextures.playerB;
          material.needsUpdate = true;
        }
      }

      if (chunkManager.update(playerPosition.x, playerPosition.z)) {
        const { chunkX, chunkZ } = chunkManager.getActiveChunk();
        activeChunkX = chunkX;
        activeChunkZ = chunkZ;
        prewarmChunkFrontier(activeChunkX, activeChunkZ);
        void emitWorldEvent("player_enter_chunk", {
          chunkX: activeChunkX,
          chunkZ: activeChunkZ,
          lat: worldToLatLon(playerPosition.x, playerPosition.z).lat,
          lon: worldToLatLon(playerPosition.x, playerPosition.z).lon,
        });
      }

      if (activeCameraMode === "first-person") {
        const eyeHeight = FIRST_PERSON_EYE_HEIGHT;
        const lookDistance = FIRST_PERSON_LOOK_DISTANCE;
        const pitchCos = Math.cos(pitch);
        desiredCameraPosition.set(playerPosition.x, playerPosition.y + eyeHeight, playerPosition.z);
        cameraLookTarget.set(
          desiredCameraPosition.x + (forwardVector.x * lookDistance * pitchCos),
          desiredCameraPosition.y + (Math.sin(pitch) * lookDistance),
          desiredCameraPosition.z + (forwardVector.z * lookDistance * pitchCos),
        );
      } else {
        const trailingDistance = THIRD_PERSON_DISTANCE;
        desiredCameraPosition.set(
          playerPosition.x - (forwardVector.x * trailingDistance),
          playerPosition.y + THIRD_PERSON_HEIGHT,
          playerPosition.z - (forwardVector.z * trailingDistance),
        );
        cameraLookTarget.set(playerPosition.x, playerPosition.y + (PLAYER_HEIGHT * 0.55), playerPosition.z);
      }

      const smoothing = activeCameraMode === "first-person" ? 0.28 : 0.12;
      camera.position.lerp(desiredCameraPosition, smoothing);
      camera.lookAt(cameraLookTarget);
      skyDome.position.copy(camera.position);
      torchLight.position.set(
        playerPosition.x + (forwardVector.x * VOXEL_BLOCK_SIZE * 0.45),
        playerPosition.y + (PLAYER_HEIGHT * 0.75),
        playerPosition.z + (forwardVector.z * VOXEL_BLOCK_SIZE * 0.45),
      );
      torchLight.intensity = 0.8 + (Math.sin(timestamp * 0.0065) * 0.08);

      if (defeatedTargetsRef.current.size > 0) {
        for (const [targetId, respawnTick] of defeatedTargetsRef.current) {
          if (runtimeState.tick >= respawnTick) {
            defeatedTargetsRef.current.delete(targetId);
            const target = targetStore.get(targetId);
            if (target) {
              target.object.visible = true;
            }
          }
        }
      }

      updateNpcWanderPositions(runtimeState.tick);

      renderer.render(scene, camera);

      if (timestamp - lastHudUpdate > 140) {
        const geopoint = worldToLatLon(playerPosition.x, playerPosition.z);
        const selectedSlot = getSelectedHotbarSlot();
        const selectedCooldownMs = Math.max(
          0,
          Math.ceil((actionCooldownUntil.get(selectedSlot.id) ?? 0) - performance.now()),
        );
        const terrainSample = sampleTerrainAtWorld(
          playerPosition.x,
          playerPosition.z,
          worldSeed,
          VOXEL_MAX_HEIGHT,
          VOXEL_BLOCK_SIZE,
        );
        setHud({
          x: playerPosition.x,
          z: playerPosition.z,
          lat: geopoint.lat,
          lon: geopoint.lon,
          chunkX: activeChunkX,
          chunkZ: activeChunkZ,
          chunkCount: chunkStore.size,
        });
        setMinimapHud((previous) => ({
          ...previous,
          biome: resolveBiomeLabel(terrainSample, terrainSample.height, VOXEL_MAX_HEIGHT),
        }));
        setCombatHud((previous) => ({
          ...previous,
          selectedSlotId: selectedSlot.id,
          selectedSlotLabel: selectedSlot.label,
          selectedCooldownMs,
        }));
        const activeChunk = chunkStore.get(chunkKey(activeChunkX, activeChunkZ));
        const stats = activeChunk?.group.userData.meshStats as
          | { quads: number; vertices: number; indices: number }
          | undefined;
        if (stats) {
          const activeChunkTiming = getChunkMeshTimingAverages(
            meshTimingTracker,
            chunkKey(activeChunkX, activeChunkZ),
          );
          setMeshHud((previous) => ({
            ...previous,
            quads: stats.quads,
            vertices: stats.vertices,
            indices: stats.indices,
            activeChunkExtractAvgMs: activeChunkTiming.extractAvgMs,
            activeChunkUploadAvgMs: activeChunkTiming.uploadAvgMs,
            trackedChunks: meshTimingTracker.chunkTimings.size,
          }));
        }
        refreshAssetHud();
        lastHudUpdate = timestamp;
      }

      window.requestAnimationFrame(loop);
    }

    window.requestAnimationFrame(loop);

    return () => {
      isRunning = false;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerUp);
      renderer.domElement.removeEventListener("contextmenu", onContextMenu);
      if (patchIntervalId !== null) {
        window.clearInterval(patchIntervalId);
      }
      for (const timeoutId of flashTimeouts.values()) {
        window.clearTimeout(timeoutId);
        flashTimeouts.delete(timeoutId);
      }
      runtimeUnsubscribe();
      runtimeBlockUnsubscribe();
      runtimeHotbarUnsubscribe();
      runtimeInventoryUnsubscribe();
      runtimeHealthUnsubscribe();
      runtimeWorldFlagUnsubscribe();
      runtimeWorldDirectiveUnsubscribe();
      runtimeWorldEventUnsubscribe();
      runtimeContainerStateUnsubscribe();
      runtimeCombatUnsubscribe();
      runtimeInteractUnsubscribe();
      runtimeCraftUnsubscribe();
      runtimeContainerResultUnsubscribe();
      pendingCombatActions.clear();
      runtimeClient.leave(profile.id);
      runtimeClient.dispose();
      runtimeClientRef.current = null;
      meshWorkerClient.dispose();

      for (const remote of remotePlayers.values()) {
        disposeRemotePlayer(remote);
      }
      remotePlayers.clear();

      disposeGroup(worldRoot);
      playerMaterial.dispose();
      renderer.dispose();
      disposeTextureSet(spriteTextures);
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [
    assetClient,
    orchestratorClient,
    playerLabel,
    profile.appearance.accentColor,
    profile.id,
    profile.world.id,
    mmCoreError,
    mmCoreReady,
    pushHudToast,
    privateContainerId,
    worldSeed,
  ]);

  return (
    <section className="world-container">
      <div className="world-canvas" ref={mountRef}>
        {!mmCoreReady && !mmCoreError ? (
          <div className="world-blocking-message">Initializing MM core wasm runtime...</div>
        ) : null}
        {mmCoreError ? <div className="world-blocking-message error">{mmCoreError}</div> : null}
        {mmCoreReady && !mmCoreError ? (
          <div className={`gameplay-overlay mode-${cameraMode}`}>
            <div className="crosshair" aria-hidden />
            <div className="valheim-hotbar" aria-label="hotbar">
              {hotbarUiSlots.map((slot, index) =>
                slot ? (
                  <button
                    key={slot.id}
                    type="button"
                    className={`valheim-slot ${selectedHotbarIndex === index ? "active" : ""}`}
                    onClick={() => handleHotbarSelect(index)}
                    aria-label={`${slot.label} (${slot.keybind})`}
                  >
                    <span className="slot-key">{slot.keybind}</span>
                    <span className="slot-icon">{resolveHotbarIconLabel(slot.id)}</span>
                    {hotbarUiCounts[index] > 0 ? (
                      <span className="slot-count">{hotbarUiCounts[index]}</span>
                    ) : null}
                  </button>
                ) : (
                  <div key={`empty-slot-${index}`} className="valheim-slot empty" aria-hidden />
                ),
              )}
            </div>
            <div className="valheim-minimap" aria-label="minimap">
              <div className="minimap-header">
                <span className="minimap-region">{minimapHud.region}</span>
                <span className="minimap-biome">{minimapHud.biome}</span>
              </div>
              <div className="minimap-frame">
                <div className="minimap-dot" />
                {showMinimapDebug ? (
                  <div className="minimap-debug">
                    <span>
                      {hud.chunkX},{hud.chunkZ}
                    </span>
                    <span>{runtimeHud.tick}</span>
                  </div>
                ) : null}
              </div>
            </div>
            {storyBeatBanner && performance.now() < storyBeatBanner.expiresAt ? (
              <div className="story-beat-banner" role="status" aria-live="polite">
                <span className="story-beat-label">Story Beat</span>
                <span className="story-beat-text">{storyBeatBanner.beat}</span>
              </div>
            ) : null}
            {activeHudToasts.length > 0 ? (
              <div className="hud-toast-stack" aria-live="polite" aria-atomic="false">
                {activeHudToasts.map((toast) => (
                  <div key={toast.id} className={`hud-toast ${toast.tone}`}>
                    {toast.message}
                  </div>
                ))}
              </div>
            ) : null}
            {cameraMode === "first-person" ? <div className="first-person-weapon" aria-hidden /> : null}
            <div className="valheim-status" aria-label="status">
              <div className="status-health">
                <div className="status-health-bar">
                  <div
                    className="status-health-fill"
                    style={{
                      height: `${Math.round((healthHud.current / Math.max(1, healthHud.max)) * 100)}%`,
                    }}
                  />
                </div>
                <div className="status-health-text">
                  {Math.round(healthHud.current)}/{Math.round(healthHud.max)}
                </div>
              </div>
              <div className="status-food-row">
                {STATUS_RESOURCE_IDS.map((resourceId) => (
                  <div key={resourceId} className="status-food">
                    <span className={`status-food-icon status-${resourceId}`} aria-hidden />
                    <span className="status-food-count">{inventoryHud.resources[resourceId] ?? 0}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
      {menuOpen ? (
        <div className="hud-menu" role="dialog" aria-modal="true">
          <div className="hud-menu-panel dex-shell">
            <div className="hud-menu-header">
              <div>
                <p className="eyebrow">Field Session</p>
                <h2>{playerLabel}</h2>
                <p className="muted">
                  {profile.characterClass} · {profile.gender} · {profile.origin}
                </p>
                <p className="muted">World: {profile.world.seed}</p>
              </div>
              <button type="button" className="button button-secondary" onClick={() => setMenuOpen(false)}>
                Resume (Esc)
              </button>
            </div>
            <div className="hud-menu-grid">
              <section className="hud-menu-section">
                <h3>Controls</h3>
                <ul className="hud-menu-list">
                  <li>
                    <span className="code">`</span> Toggle camera
                  </li>
                  <li>
                    <span className="code">WASD</span> Move · <span className="code">Shift</span> Run ·{" "}
                    <span className="code">Space</span> Jump
                  </li>
                  <li>
                    <span className="code">1-5</span> Hotbar · <span className="code">6-9</span> Recipes ·{" "}
                    <span className="code">R</span> Craft
                  </li>
                  <li>
                    <span className="code">F</span> Interact · Click to attack/cast
                  </li>
                </ul>
              </section>
              <section className="hud-menu-section">
                <h3>Crafting</h3>
                <div className="craft-strip menu-craft-strip" aria-label="craft recipes">
                  {DEFAULT_RUNTIME_CRAFT_RECIPES.map((recipe, index) => (
                    <button
                      key={recipe.id}
                      type="button"
                      className={`hud-craft-slot ${selectedCraftRecipeIndex === index ? "active" : ""}`}
                      onClick={() => handleCraftRecipeSelect(index)}
                      aria-label={`${recipe.label} (${recipe.keybind})`}
                    >
                      <span className="slot-key">{recipe.keybind}</span>
                      <span className="slot-label">{recipe.label}</span>
                    </button>
                  ))}
                </div>
              </section>
              <section className="hud-menu-section">
                <h3>Stash</h3>
                <div className="stash-resource-strip" aria-label="stash resource selector">
                  {DEFAULT_RUNTIME_RESOURCE_IDS.map((resourceId, index) => (
                    <button
                      key={resourceId}
                      type="button"
                      className={`stash-resource-button ${selectedStashResourceId === resourceId ? "active" : ""}`}
                      onClick={() => handleStashResourceSelect(index)}
                    >
                      {formatRuntimeResourceLabel(resourceId)}
                    </button>
                  ))}
                </div>
                <div className="stash-transfer-strip" aria-label="stash transfer amount selector">
                  {DEFAULT_STASH_TRANSFER_AMOUNTS.map((amount, index) => (
                    <button
                      key={`transfer-amount-${amount}`}
                      type="button"
                      className={`stash-resource-button ${selectedTransferAmount === amount ? "active" : ""}`}
                      onClick={() => handleTransferAmountSelect(index)}
                    >
                      x{amount}
                    </button>
                  ))}
                </div>
                <p className="muted">
                  Transfer modifiers: <span className="code">Shift</span> half,{" "}
                  <span className="code">Ctrl/Alt/Cmd</span> all.
                </p>
              </section>
              <section className="hud-menu-section">
                <h3>Diagnostics</h3>
                <div className="diag-row">
                  <button
                    type="button"
                    className={`button button-secondary ${showDiagnostics ? "button-active" : ""}`}
                    onClick={() => setShowDiagnostics((previous) => !previous)}
                  >
                    Diagnostics {showDiagnostics ? "On" : "Off"}
                  </button>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => setMeshDetailMode((previous) => (previous === "detailed" ? "basic" : "detailed"))}
                  >
                    Mesh {meshDetailMode}
                  </button>
                  <button
                    type="button"
                    className={`button button-secondary ${showMinimapDebug ? "button-active" : ""}`}
                    onClick={() => setShowMinimapDebug((previous) => !previous)}
                  >
                    Minimap Debug {showMinimapDebug ? "On" : "Off"}
                  </button>
                </div>
                <ul className="hud-menu-list">
                  <li>
                    X: {hud.x.toFixed(1)} · Z: {hud.z.toFixed(1)} · Chunk {hud.chunkX},{hud.chunkZ}
                  </li>
                  <li>Runtime Tick: {runtimeHud.tick}</li>
                  <li>
                    Active Recipe: {selectedCraftRecipe.label} ({selectedCraftRecipe.keybind})
                  </li>
                  <li>World Flags: {formatWorldFlags(worldFlagHud.flags)}</li>
                  <li>Story Beat: {directiveHud.storyBeats.at(-1) ?? "none"}</li>
                  <li>Spawn Hints: {formatSpawnHints(directiveHud.spawnHints)}</li>
                  <li>Inventory: {formatResourceSummary(inventoryHud.resources)}</li>
                  <li>Stash: {formatResourceSummary(containerHud.resources)}</li>
                  <li>Private Stash: {formatResourceSummary(privateContainerHud.resources)}</li>
                  <li>Mesh Core: {mmCoreReady ? "wasm" : mmCoreError ? "error" : "loading"}</li>
                  <li>Mesh Quads: {meshHud.quads}</li>
                  <li>Mesh Verts: {meshHud.vertices}</li>
                  <li>Orchestrator Events: {orchestratorHud.eventsSent}</li>
                  <li>Directives Received: {orchestratorHud.directivesReceived}</li>
                </ul>
                {meshHud.workerError ? <p className="muted">Mesh Error: {meshHud.workerError}</p> : null}
                {orchestratorHud.lastError ? <p className="muted">Orchestrator Error: {orchestratorHud.lastError}</p> : null}
              </section>
              <section className="hud-menu-section">
                <h3>Session Log</h3>
                <ul className="hud-menu-list">
                  {directiveHistory.length === 0 ? (
                    <li>No directives received yet.</li>
                  ) : (
                    directiveHistory
                      .slice()
                      .reverse()
                      .slice(0, 6)
                      .map((entry) => (
                        <li key={entry.id}>
                          [{entry.tick}] {entry.text}
                        </li>
                      ))
                  )}
                </ul>
              </section>
            </div>
            <div className="hud-menu-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  clearPlayerProfile();
                  window.location.assign("/");
                }}
              >
                Reset Save
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => window.location.assign("/")}
              >
                Home
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function resolveRecipeForClass(assetClass: AssetClass): string {
  if (assetClass === "prop_3d" || assetClass === "npc_3d" || assetClass === "hero_prop_3d") {
    return "hy3d-fast-prop-v1";
  }

  if (assetClass === "imposter_2d" || assetClass === "icon_2d" || assetClass === "decal_2d") {
    return "nb-imposter-v1";
  }

  return "placeholder-only-v1";
}

function numericHash(payload: string): number {
  let hash = 2166136261;
  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function resolveNpcWanderOffset(targetId: string, tick: number): { x: number; z: number } {
  const seedA = numericHash(`${targetId}:a`);
  const seedB = numericHash(`${targetId}:b`);
  const seedC = numericHash(`${targetId}:c`);
  const unitA = (seedA % 1000) / 1000;
  const unitB = (seedB % 1000) / 1000;
  const unitC = (seedC % 1000) / 1000;

  const radius = NPC_WANDER_RADIUS_MIN + (unitA * (NPC_WANDER_RADIUS_MAX - NPC_WANDER_RADIUS_MIN));
  const speedCycles = NPC_WANDER_SPEED_MIN + (unitB * (NPC_WANDER_SPEED_MAX - NPC_WANDER_SPEED_MIN));
  const sway = NPC_WANDER_SWAY_MIN + (unitC * (NPC_WANDER_SWAY_MAX - NPC_WANDER_SWAY_MIN));
  const phaseA = unitA * Math.PI * 2;
  const phaseB = unitC * Math.PI * 2;

  const seconds = tick / RUNTIME_TICK_RATE;
  const angle = seconds * speedCycles * Math.PI * 2;
  return {
    x: Math.cos(angle + phaseA) * radius,
    z: Math.sin((angle * sway) + phaseB) * radius * 0.7,
  };
}

function hashToColor(payload: string): string {
  const hash = numericHash(payload);
  const hue = hash % 360;
  const saturation = 55 + (hash % 20);
  const lightness = 45 + (hash % 10);
  const color = new THREE.Color();
  color.setHSL(hue / 360, saturation / 100, lightness / 100);
  return `#${color.getHexString()}`;
}

function average(samples: number[]): number {
  if (samples.length === 0) {
    return 0;
  }
  let total = 0;
  for (const sample of samples) {
    total += sample;
  }
  return total / samples.length;
}

function formatResourceSummary(resources: Record<string, number>): string {
  return DEFAULT_RUNTIME_RESOURCE_IDS
    .map((resourceId) => `${resourceId}:${resources[resourceId] ?? 0}`)
    .join(" ");
}

function formatLootSummary(loot: Record<string, unknown> | undefined): string {
  if (!loot) {
    return "";
  }
  const entries = Object.entries(loot)
    .filter((entry) => typeof entry[1] === "number" && (entry[1] as number) > 0)
    .map(([key, value]) => `${key} +${value}`);
  return entries.length > 0 ? entries.join(", ") : "";
}

function formatWorldFlags(flags: Record<string, string>): string {
  const entries = Object.entries(flags).sort((left, right) => left[0].localeCompare(right[0]));
  if (entries.length === 0) {
    return "none";
  }
  return entries.map(([key, value]) => `${key}:${value}`).join(" ");
}

function formatSpawnHints(spawnHints: RuntimeSpawnHint[]): string {
  if (spawnHints.length === 0) {
    return "none";
  }
  return spawnHints
    .slice(0, 3)
    .map((hint) => `${hint.label}@${hint.chunkX},${hint.chunkZ}`)
    .join(" | ");
}

function formatCombatRejectReason(reason: string | undefined): string {
  switch (reason) {
    case "target_out_of_range":
      return "target out of range";
    case "missing_target":
      return "missing target";
    case "unknown_target":
      return "unknown target";
    case "slot_not_equipped":
      return "slot not equipped";
    case "invalid_slot_kind":
      return "invalid slot kind";
    case "invalid_slot":
      return "invalid slot";
    case "insufficient_item":
      return "insufficient item";
    case "player_not_found":
      return "player not found";
    case "invalid_payload":
      return "invalid request";
    case undefined:
      return "rejected";
    default:
      return reason;
  }
}

function formatCraftRejectReason(reason: string | undefined): string {
  switch (reason) {
    case "insufficient_resources":
      return "insufficient resources";
    case "craft_target_slot_missing":
      return "missing craft output slot";
    case "invalid_recipe":
      return "invalid recipe";
    case "invalid_payload":
      return "invalid request";
    case undefined:
      return "unknown reason";
    default:
      return reason;
  }
}

function formatContainerRejectReason(reason: string | undefined): string {
  switch (reason) {
    case "insufficient_resources":
      return "insufficient inventory resources";
    case "container_insufficient_resources":
      return "insufficient stash resources";
    case "container_forbidden":
      return "container access denied";
    case "invalid_container":
      return "invalid container";
    case "invalid_operation":
      return "invalid operation";
    case "invalid_payload":
      return "invalid request";
    case undefined:
      return "unknown reason";
    default:
      return reason;
  }
}

function formatRegionLabel(origin: string): string {
  if (!origin) {
    return "Frontier";
  }
  return origin
    .split(/[_-]/g)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
}

function resolveHotbarIconLabel(slotId: string): string {
  switch (slotId) {
    case "slot-1-rust-blade":
      return "SW";
    case "slot-2-ember-bolt":
      return "EM";
    case "slot-3-frost-bind":
      return "FR";
    case "slot-4-bandage":
      return "BD";
    case "slot-5-bomb":
      return "BM";
    default:
      return "IT";
  }
}

function resolveBiomeLabel(sample: TerrainSample, heightBlocks: number, maxHeight: number): string {
  const normalizedHeight = THREE.MathUtils.clamp(heightBlocks / Math.max(1, maxHeight), 0, 1);
  const moisture = THREE.MathUtils.clamp(sample.moisture, 0, 1);

  if (sample.pathMask > 0.6 || sample.path) {
    return "Meadows";
  }
  if (moisture > 0.82) {
    return "Marsh";
  }
  if (normalizedHeight > 0.78 || sample.ridge > 0.7) {
    return "Highlands";
  }
  if (normalizedHeight < 0.28) {
    return "Lowlands";
  }
  return "Meadows";
}

function resolveTerrainSurfaceColor(
  sample: TerrainSample,
  heightBlocks: number,
  maxHeight: number,
  worldX: number,
  worldZ: number,
): THREE.Color {
  const normalizedHeight = THREE.MathUtils.clamp(heightBlocks / Math.max(1, maxHeight), 0, 1);
  const moisture = THREE.MathUtils.clamp(sample.moisture, 0, 1);

  if (sample.path || sample.pathMask > 0.6) {
    const pathColor = new THREE.Color("#c7b49a");
    const edgeTint = new THREE.Color("#a38a68");
    return pathColor.lerp(edgeTint, sample.pathMask * 0.55);
  }

  if (moisture > 0.82 && heightBlocks < maxHeight * 0.6) {
    const waterBase = new THREE.Color("#2f4d74");
    return waterBase.lerp(new THREE.Color("#1f3959"), (moisture - 0.82) * 2.2);
  }

  const hue = 0.29 - (normalizedHeight * 0.06) + ((moisture - 0.5) * 0.03);
  const saturation = 0.46 + (moisture * 0.26);
  const lightness = 0.2 + (normalizedHeight * 0.3) + (moisture * 0.08);
  const color = new THREE.Color();
  color.setHSL(hue, saturation, lightness);

  const detail = (Math.sin(worldX * 0.23 + worldZ * 0.19) * Math.cos(worldZ * 0.27)) * 0.5 + 0.5;
  const detailShift = (detail - 0.5) * 0.09;
  color.offsetHSL(0, 0, detailShift);

  if (sample.ridge > 0.62) {
    const ridgeBlend = Math.min(1, (sample.ridge - 0.62) / 0.38) * 0.6;
    color.lerp(new THREE.Color("#6a645b"), ridgeBlend);
  } else if (normalizedHeight > 0.78) {
    color.lerp(new THREE.Color("#6b6f60"), (normalizedHeight - 0.78) * 0.75);
  }

  return color;
}

function buildChunkVertexColors(positions: Float32Array, chunkMaxHeight: number): Float32Array {
  const colors = new Float32Array(positions.length);
  const maxHeight = Math.max(1, chunkMaxHeight);
  for (let index = 0; index < positions.length; index += 3) {
    const y = positions[index + 1];
    const normalized = THREE.MathUtils.clamp(y / maxHeight, 0, 1);

    let r = 0.24 + (0.2 * normalized);
    let g = 0.38 + (0.34 * normalized);
    let b = 0.19 + (0.08 * (1 - normalized));

    if (normalized < 0.22) {
      r = 0.44;
      g = 0.33;
      b = 0.22;
    } else if (normalized > 0.78) {
      r += 0.08;
      g += 0.08;
      b += 0.05;
    }

    colors[index] = r;
    colors[index + 1] = g;
    colors[index + 2] = b;
  }

  return colors;
}

function createEventId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `event-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function createSkyDome(): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(600, 32, 16);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      topColor: { value: new THREE.Color(SKY_TOP_COLOR) },
      bottomColor: { value: new THREE.Color(SKY_HORIZON_COLOR) },
      offset: { value: 36.0 },
      exponent: { value: 0.55 },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform float offset;
      uniform float exponent;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
        float mixValue = pow(max(h, 0.0), exponent);
        gl_FragColor = vec4(mix(bottomColor, topColor, mixValue), 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const sky = new THREE.Mesh(geometry, material);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  return sky;
}

function createSpriteTextureSet(): SpriteTextureSet {
  return {
    playerA: createPixelTexture((ctx) => drawTrainerSprite(ctx, "#c9473b", "#284b7a", "#2b2b2b", 0)),
    playerB: createPixelTexture((ctx) => drawTrainerSprite(ctx, "#c9473b", "#284b7a", "#2b2b2b", 1)),
    npcA: createPixelTexture((ctx) => drawTrainerSprite(ctx, "#8a6a43", "#2f5a3f", "#2b2b2b", 0)),
    npcB: createPixelTexture((ctx) => drawTrainerSprite(ctx, "#6a5846", "#34507e", "#2b2b2b", 1)),
    monA: createPixelTexture((ctx) => drawMonSprite(ctx, "#4f78d2", "#d9ebff", "#2b3366")),
    monB: createPixelTexture((ctx) => drawMonSprite(ctx, "#e39652", "#fff2d8", "#7a3c18")),
    monC: createPixelTexture((ctx) => drawMonSprite(ctx, "#66b067", "#e7ffd3", "#2f5a2f")),
    treeA: createPixelTexture((ctx) => drawTreeSprite(ctx, "#2f6f3b", "#79b86a", "#5a3b21")),
    treeB: createPixelTexture((ctx) => drawTreeSprite(ctx, "#2d6a45", "#6fb16a", "#5c3d23")),
    treeC: createPixelTexture((ctx) => drawTreeSprite(ctx, "#3a6a33", "#86c36d", "#624126")),
  };
}

function disposeTextureSet(textureSet: SpriteTextureSet): void {
  for (const texture of Object.values(textureSet)) {
    texture.dispose();
  }
}

function createPixelTexture(draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Unable to initialize canvas context for sprite texture.");
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  draw(ctx);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function drawTrainerSprite(
  ctx: CanvasRenderingContext2D,
  hatColor: string,
  bodyColor: string,
  legColor: string,
  step: 0 | 1,
): void {
  fillRect(ctx, 11, 5, 10, 4, hatColor);
  fillRect(ctx, 14, 8, 4, 3, "#f4d6b5");
  fillRect(ctx, 11, 11, 10, 7, bodyColor);
  fillRect(ctx, 10, 18, 4, 7, legColor);
  fillRect(ctx, 18, 18, 4, 7, legColor);
  if (step === 0) {
    fillRect(ctx, 10, 25, 4, 4, "#e0e0e0");
    fillRect(ctx, 18, 24, 4, 5, "#e0e0e0");
  } else {
    fillRect(ctx, 10, 24, 4, 5, "#e0e0e0");
    fillRect(ctx, 18, 25, 4, 4, "#e0e0e0");
  }
}

function drawMonSprite(
  ctx: CanvasRenderingContext2D,
  bodyColor: string,
  eyeColor: string,
  detailColor: string,
): void {
  fillRect(ctx, 9, 13, 14, 10, bodyColor);
  fillRect(ctx, 11, 10, 4, 4, bodyColor);
  fillRect(ctx, 17, 10, 4, 4, bodyColor);
  fillRect(ctx, 12, 15, 2, 2, eyeColor);
  fillRect(ctx, 18, 15, 2, 2, eyeColor);
  fillRect(ctx, 13, 20, 6, 2, detailColor);
  fillRect(ctx, 8, 23, 4, 4, detailColor);
  fillRect(ctx, 20, 23, 4, 4, detailColor);
}

function drawTreeSprite(
  ctx: CanvasRenderingContext2D,
  canopyColor: string,
  canopyHighlight: string,
  trunkColor: string,
): void {
  fillRect(ctx, 12, 20, 8, 10, trunkColor);
  fillRect(ctx, 7, 7, 18, 14, canopyColor);
  fillRect(ctx, 9, 5, 14, 6, canopyColor);
  fillRect(ctx, 9, 10, 5, 4, canopyHighlight);
  fillRect(ctx, 17, 12, 5, 4, canopyHighlight);
}

function fillRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width, height);
}
