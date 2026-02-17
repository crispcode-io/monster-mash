"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import {
  AssetClass,
  AssetIntentPriority,
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
  formatRuntimeResourceLabel,
  getPlayerPrivateContainerId,
  resolveRequestedTransferAmount,
  resolveRuntimeResourceId,
  resolveCraftRecipeByIndex,
  resolveCraftRecipeIndexForKey,
  resolveTransferModifier,
  resolveTransferAmount,
} from "@/lib/runtime";
import { MmCoreRuntimeMode, initializeMmCoreRuntime } from "@/lib/wasm";
import { MmCoreMeshWorkerClient } from "@/lib/wasm/mm-core-mesh-worker-client";
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
import {
  CHUNK_GRID_CELLS,
  ChunkEntity,
  generateChunkData,
} from "@/lib/world/chunk-generator";
import { ChunkManager } from "@/lib/world/chunk-manager";

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

interface LoadedChunkRecord {
  chunkX: number;
  chunkZ: number;
  group: THREE.Group;
  voxelChunk: VoxelChunkData;
  voxelRenderMesh: THREE.Mesh | null;
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

const HOTBAR_UI_SLOT_COUNT = 9;
const HOTBAR_KEY_TO_INDEX = new Map(
  Array.from({ length: HOTBAR_SLOTS.length }, (_, index) => [String(index + 1), index]),
);
const HOTBAR_SLOT_BY_ID = new Map(HOTBAR_SLOTS.map((slot) => [slot.id, slot]));
const CRAFT_RECIPE_BY_ID = new Map(DEFAULT_RUNTIME_CRAFT_RECIPES.map((recipe) => [recipe.id, recipe]));
const MAX_HEARTS = 10;
const CURRENT_HEARTS = 10;

const initialCombatHud: CombatHudState = {
  selectedSlotId: HOTBAR_SLOTS[0].id,
  selectedSlotLabel: HOTBAR_SLOTS[0].label,
  selectedCooldownMs: 0,
  lastAction: "none",
  lastTarget: "none",
  targetResolution: "none",
  status: "Select slot (1-5), recipe (6-9), press R to craft, then click to attack/cast.",
};

const initialInventoryHud: InventoryHudState = {
  resources: Object.fromEntries(DEFAULT_RUNTIME_RESOURCE_IDS.map((resourceId) => [resourceId, 0])),
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
  const [atlasSummary, setAtlasSummary] = useState<AtlasManifestSummary | null>(null);
  const [orchestratorHud, setOrchestratorHud] = useState<OrchestratorHudState>(initialOrchestratorHud);
  const [runtimeHud, setRuntimeHud] = useState<RuntimeHudState>(initialRuntimeHud);
  const [worldFlagHud, setWorldFlagHud] = useState<WorldFlagHudState>(initialWorldFlagHud);
  const [directiveHud, setDirectiveHud] = useState<DirectiveHudState>(initialDirectiveHud);
  const [directiveHistory, setDirectiveHistory] = useState<DirectiveHistoryEntry[]>([]);
  const [storyBeatBanner, setStoryBeatBanner] = useState<StoryBeatBannerState | null>(null);
  const [hudToasts, setHudToasts] = useState<HudToast[]>([]);
  const [meshHud, setMeshHud] = useState<MeshHudState>(initialMeshHud);
  const [showDiagnostics, setShowDiagnostics] = useState(true);
  const [meshDetailMode, setMeshDetailMode] = useState<"basic" | "detailed">("detailed");
  const [showMinimapDebug, setShowMinimapDebug] = useState(true);
  const [mmCoreReady, setMmCoreReady] = useState(false);
  const [mmCoreError, setMmCoreError] = useState<string | null>(null);
  const [hotbarSlotIds, setHotbarSlotIds] = useState<string[]>(() => [...DEFAULT_RUNTIME_HOTBAR_SLOT_IDS]);
  const hotbarSlots = useMemo(() => resolveHotbarSlots(hotbarSlotIds), [hotbarSlotIds]);
  const hotbarUiSlots = useMemo(
    () => Array.from({ length: HOTBAR_UI_SLOT_COUNT }, (_, index) => hotbarSlots[index] ?? null),
    [hotbarSlots],
  );
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
  const [combatHud, setCombatHud] = useState<CombatHudState>(initialCombatHud);
  const [inventoryHud, setInventoryHud] = useState<InventoryHudState>(initialInventoryHud);
  const [containerHud, setContainerHud] = useState<ContainerHudState>(initialContainerHud);
  const [privateContainerHud, setPrivateContainerHud] = useState<ContainerHudState>({
    resources: Object.fromEntries(DEFAULT_RUNTIME_RESOURCE_IDS.map((resourceId) => [resourceId, 0])),
    tick: 0,
    containerId: "",
  });
  const [cameraMode, setCameraMode] = useState<CameraMode>(() => profile.preferredCamera);
  const cameraModeRef = useRef<CameraMode>(profile.preferredCamera);
  const selectedHotbarRef = useRef(0);
  const selectedCraftRecipeIndexRef = useRef(0);
  const selectedStashResourceIndexRef = useRef(0);
  const selectedTransferAmountIndexRef = useRef(0);
  const showDiagnosticsRef = useRef(true);
  const meshDetailModeRef = useRef<"basic" | "detailed">("detailed");
  const showMinimapDebugRef = useRef(true);
  const hotbarSlotsRef = useRef<HotbarSlot[]>(hotbarSlots);
  const inventoryResourcesRef = useRef<Record<string, number>>({ ...initialInventoryHud.resources });
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

  function pushHudToast(message: string, tone: HudToast["tone"], durationMs = 2600): void {
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
  }

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
    inventoryResourcesRef.current = { ...inventoryHud.resources };
  }, [inventoryHud.resources]);

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

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#6b8db7");
    scene.fog = new THREE.Fog("#6b8db7", 34, 220);

    const aspect = mount.clientWidth / mount.clientHeight;
    const camera = new THREE.PerspectiveCamera(72, aspect, 0.1, 900);
    camera.position.set(0, 6, 10);
    camera.lookAt(0, 1.8, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.92;
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight("#d7e8ff", 1.05));
    scene.add(new THREE.HemisphereLight("#cce0ff", "#3d5a44", 0.48));
    const sunlight = new THREE.DirectionalLight("#ffe3b6", 0.78);
    sunlight.position.set(72, 150, 56);
    scene.add(sunlight);

    const worldRoot = new THREE.Group();
    scene.add(worldRoot);
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
    playerSprite.scale.set(3.2, 3.2, 1);
    playerSprite.position.y = 1.8;
    worldRoot.add(playerSprite);

    const playerShadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.08, 12),
      new THREE.MeshBasicMaterial({ color: "#113f5f", transparent: true, opacity: 0.35 }),
    );
    playerShadow.rotation.x = -Math.PI * 0.5;
    playerShadow.position.y = 0.04;
    worldRoot.add(playerShadow);

    const keyState = new Set<string>();
    const chunkStore = new Map<string, LoadedChunkRecord>();
    const targetStore = new Map<
      string,
      {
        id: string;
        label: string;
        type: "npc" | "wild-mon";
        object: THREE.Object3D;
        worldX: number;
        worldZ: number;
      }
    >();
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
    const turnSpeed = 2.2;
    let activeChunkX = 0;
    let activeChunkZ = 0;
    let lastHudUpdate = 0;
    let walkClock = 0;
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
    const runtimeClient: WorldRuntimeClient = createRuntimeClient({ worldSeed });
    runtimeClientRef.current = runtimeClient;
    const runtimeState = {
      positionX: 0,
      positionZ: 0,
      speed: 0,
      tick: 0,
      hasSnapshot: false,
    };
    const spawnHintMarkers = new Map<string, THREE.Group>();

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
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.2, 4, 8),
        new THREE.MeshStandardMaterial({
          color: beaconColor,
          emissive: beaconColor,
          emissiveIntensity: 0.24,
          roughness: 0.5,
          metalness: 0.08,
        }),
      );
      shaft.position.y = 2.1;
      marker.add(shaft);

      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(1.15, 0.08, 6, 24),
        new THREE.MeshBasicMaterial({
          color: beaconColor,
          transparent: true,
          opacity: 0.85,
        }),
      );
      halo.rotation.x = Math.PI * 0.5;
      halo.position.y = 0.45;
      marker.add(halo);

      marker.position.set(
        (spawnHint.chunkX * WORLD_CONFIG.chunkSize) + (WORLD_CONFIG.chunkSize * 0.5),
        0,
        (spawnHint.chunkZ * WORLD_CONFIG.chunkSize) + (WORLD_CONFIG.chunkSize * 0.5),
      );
      marker.userData.spawnHintId = spawnHint.hintId;
      return marker;
    }

    const runtimeUnsubscribe = runtimeClient.subscribe((snapshot) => {
      const self = snapshot.players[profile.id];
      if (self) {
        runtimeState.positionX = self.x;
        runtimeState.positionZ = self.z;
        runtimeState.speed = self.speed;
        runtimeState.hasSnapshot = true;
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
        blockSize: 1.6,
        maxHeight: 9,
      });
      const chunkData = generateChunkData(chunkX, chunkZ, worldSeed);

      const groundColor = new THREE.Color().setHSL(0.32, 0.46, 0.24 + (chunkData.biomeTone * 0.04));
      const ground = new THREE.Mesh(
        makeTileGeometry(WORLD_CONFIG.chunkSize, WORLD_CONFIG.chunkSize),
        new THREE.MeshLambertMaterial({ color: groundColor }),
      );
      ground.position.y = 0;
      group.add(ground);

      const targetIds: string[] = [];
      chunkData.entities.forEach((entity, entityIndex) => {
        const entityObject = buildEntity(entity, spriteTextures, chunkData.tileSize);
        group.add(entityObject);
        if (entity.type === "npc" || entity.type === "wild-mon") {
          const targetId = `${chunkX}:${chunkZ}:${entity.type}:${entityIndex}`;
          entityObject.userData.targetId = targetId;
          targetStore.set(targetId, {
            id: targetId,
            label: entity.type === "npc" ? `NPC ${entityIndex + 1}` : `Monster ${entityIndex + 1}`,
            type: entity.type,
            object: entityObject,
            worldX: (chunkX * WORLD_CONFIG.chunkSize) + entity.x,
            worldZ: (chunkZ * WORLD_CONFIG.chunkSize) + entity.z,
          });
          targetIds.push(targetId);
        }
      });

      const overlayGroup = new THREE.Group();
      group.add(overlayGroup);

      const record: LoadedChunkRecord = {
        chunkX,
        chunkZ,
        group,
        voxelChunk,
        voxelRenderMesh: null,
        meshRequestVersion: 0,
        overlayGroup,
        overlayState: createPlaceholderOverlayState(DEFAULT_PLACEHOLDER_SLOTS),
        intentsSubmitted: false,
        targetIds,
      };

      renderVoxelChunk(record);
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
      const occupancyBuffer = buildChunkOccupancyBuffer(record.voxelChunk);
      record.meshRequestVersion += 1;
      const requestVersion = record.meshRequestVersion;
      void requestChunkMeshStats(record, occupancyBuffer, requestVersion);
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

        const renderMesh = new THREE.Mesh(
          geometry,
          new THREE.MeshLambertMaterial({
            vertexColors: true,
            side: THREE.DoubleSide,
          }),
        );
        const half = WORLD_CONFIG.chunkSize * 0.5;
        renderMesh.position.set(-half, 0, -half);
        renderMesh.scale.setScalar(record.voxelChunk.blockSize);
        renderMesh.userData.isVoxelChunk = true;
        renderMesh.userData.chunkKey = key;

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
    ): THREE.Object3D {
      if (entity.type === "fence") {
        const fence = new THREE.Mesh(
          new THREE.BoxGeometry(tileSize * 0.98, 0.6, 0.32),
          new THREE.MeshLambertMaterial({ color: "#8792ab" }),
        );
        fence.position.set(entity.x, 0.31, entity.z);
        fence.rotation.y = entity.rotation;
        return fence;
      }

      if (entity.type === "rock") {
        const rock = new THREE.Mesh(
          new THREE.DodecahedronGeometry(0.58 * entity.scale, 0),
          new THREE.MeshLambertMaterial({ color: entity.variant === 0 ? "#766f65" : "#8a8176" }),
        );
        rock.position.set(entity.x, 0.55 * entity.scale, entity.z);
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

      const baseScale = entity.type === "tree" ? 4.2 : entity.type === "npc" ? 2.7 : 2.2;
      sprite.scale.set(baseScale * entity.scale, baseScale * entity.scale, 1);
      sprite.position.set(entity.x, entity.type === "tree" ? 2.1 : 1.25, entity.z);
      return sprite;
    }

    function renderChunkOverlay(record: LoadedChunkRecord): void {
      disposeGroup(record.overlayGroup);
      record.overlayGroup.clear();

      const slots = Object.values(record.overlayState.slots).sort((a, b) => a.slotId.localeCompare(b.slotId));
      for (const slot of slots) {
        const overlayObject = buildOverlayObject(slot, record.chunkX, record.chunkZ);
        record.overlayGroup.add(overlayObject);
      }
    }

    function buildOverlayObject(
      slot: ManifestOverlayState["slots"][string],
      chunkX: number,
      chunkZ: number,
    ): THREE.Object3D {
      const { x, z } = getOverlayLocalPosition(slot.slotId, chunkX, chunkZ);
      const baseColor = slot.placeholder ? "#665f55" : hashToColor(slot.variantHash);
      const isVolumetric =
        slot.assetClass === "prop_3d" ||
        slot.assetClass === "npc_3d" ||
        slot.assetClass === "hero_prop_3d" ||
        slot.assetClass === "terrain_voxel";

      if (isVolumetric) {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(2.1, slot.placeholder ? 2 : 3.2, 2.1),
          new THREE.MeshLambertMaterial({ color: baseColor }),
        );
        mesh.position.set(x, slot.placeholder ? 1 : 1.6, z);
        return mesh;
      }

      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(2.6, 3),
        new THREE.MeshLambertMaterial({
          color: baseColor,
          transparent: true,
          opacity: slot.placeholder ? 0.48 : 0.9,
          side: THREE.DoubleSide,
        }),
      );
      plane.position.set(x, 1.8, z);
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
      if (record.intentsSubmitted) {
        return;
      }
      record.intentsSubmitted = true;

      const priority: AssetIntentPriority = "high";
      for (const template of DEFAULT_PLACEHOLDER_SLOTS) {
        const semanticTag = template.slotId.split(":")[1] ?? "slot";
        try {
          await assetClient.submitAssetIntent({
            intentId: `${worldSeed}:${record.chunkX}:${record.chunkZ}:${template.slotId}:${Date.now()}`,
            worldSeed,
            chunk: { x: record.chunkX, z: record.chunkZ },
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
            idempotencyKey: `${worldSeed}:${record.chunkX}:${record.chunkZ}:${template.slotId}`,
          });
        } catch {
          // Keep placeholders if submission fails.
        }
      }
    }

    async function pollChunkManifestPatches(): Promise<void> {
      const records = Array.from(chunkStore.values());
      await Promise.all(
        records.map(async (record) => {
          try {
            const patch = await assetClient.getChunkManifestPatches(
              worldSeed,
              record.chunkX,
              record.chunkZ,
              record.overlayState.manifestVersion,
            );

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
            return targetId;
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
          renderVoxelChunk(record);
        }
        return;
      }

      const blockType = delta.blockType === "wood" ? "wood" : "dirt";
      setVoxelBlock(record.voxelChunk, position, blockType);
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
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    }

    function onPointerDown(event: PointerEvent): void {
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
      runtimeClient.setInput(profile.id, {
        moveX: moveVector.x,
        moveZ: moveVector.z,
        running: keyState.has("shift"),
      });

      if (runtimeState.hasSnapshot) {
        playerPosition.x += (runtimeState.positionX - playerPosition.x) * 0.48;
        playerPosition.z += (runtimeState.positionZ - playerPosition.z) * 0.48;
      }

      if (runtimeState.speed > 0.01) {
        walkClock += deltaSeconds;
      } else {
        walkClock = 0;
      }

      playerSprite.position.x = playerPosition.x;
      playerSprite.position.z = playerPosition.z;
      playerShadow.position.x = playerPosition.x;
      playerShadow.position.z = playerPosition.z;

      const frame = runtimeState.speed > 0.01 ? Math.floor(walkClock * 8) % 2 : 0;
      if (frame !== cachedPlayerFrame) {
        cachedPlayerFrame = frame;
        playerMaterial.map = frame === 0 ? spriteTextures.playerA : spriteTextures.playerB;
        playerMaterial.needsUpdate = true;
      }

      const activeCameraMode = cameraModeRef.current;
      const hideAvatar = activeCameraMode === "first-person";
      playerSprite.visible = !hideAvatar;
      playerShadow.visible = !hideAvatar;

      if (chunkManager.update(playerPosition.x, playerPosition.z)) {
        const { chunkX, chunkZ } = chunkManager.getActiveChunk();
        activeChunkX = chunkX;
        activeChunkZ = chunkZ;
        void emitWorldEvent("player_enter_chunk", {
          chunkX: activeChunkX,
          chunkZ: activeChunkZ,
          lat: worldToLatLon(playerPosition.x, playerPosition.z).lat,
          lon: worldToLatLon(playerPosition.x, playerPosition.z).lon,
        });
      }

      if (activeCameraMode === "first-person") {
        const eyeHeight = 1.7;
        const lookDistance = 10;
        const pitchCos = Math.cos(pitch);
        desiredCameraPosition.set(playerPosition.x, eyeHeight, playerPosition.z);
        cameraLookTarget.set(
          desiredCameraPosition.x + (forwardVector.x * lookDistance * pitchCos),
          desiredCameraPosition.y + (Math.sin(pitch) * lookDistance),
          desiredCameraPosition.z + (forwardVector.z * lookDistance * pitchCos),
        );
      } else {
        const trailingDistance = 8;
        desiredCameraPosition.set(
          playerPosition.x - (forwardVector.x * trailingDistance),
          5.8,
          playerPosition.z - (forwardVector.z * trailingDistance),
        );
        cameraLookTarget.set(playerPosition.x, 2.15, playerPosition.z);
      }

      const smoothing = activeCameraMode === "first-person" ? 0.28 : 0.12;
      camera.position.lerp(desiredCameraPosition, smoothing);
      camera.lookAt(cameraLookTarget);

      renderer.render(scene, camera);

      if (timestamp - lastHudUpdate > 140) {
        const geopoint = worldToLatLon(playerPosition.x, playerPosition.z);
        const selectedSlot = getSelectedHotbarSlot();
        const selectedCooldownMs = Math.max(
          0,
          Math.ceil((actionCooldownUntil.get(selectedSlot.id) ?? 0) - performance.now()),
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
      runtimeWorldFlagUnsubscribe();
      runtimeWorldDirectiveUnsubscribe();
      runtimeContainerStateUnsubscribe();
      runtimeCombatUnsubscribe();
      runtimeCraftUnsubscribe();
      runtimeContainerResultUnsubscribe();
      pendingCombatActions.clear();
      runtimeClient.leave(profile.id);
      runtimeClient.dispose();
      runtimeClientRef.current = null;
      meshWorkerClient.dispose();

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
            <div className="hud-top-row">
              <p className="hud-mode-chip">{cameraMode === "first-person" ? "First Person" : "Third Person"}</p>
              <p className="hud-status-chip">{combatHud.status}</p>
            </div>
            {storyBeatBanner && performance.now() < storyBeatBanner.expiresAt ? (
              <div className="story-beat-banner" role="status" aria-live="polite">
                <span className="story-beat-label">Story Beat</span>
                <span className="story-beat-text">{storyBeatBanner.beat}</span>
              </div>
            ) : null}
            {showMinimapDebug ? (
              <div className="debug-minimap" aria-label="chunk minimap">
                <div className="debug-minimap-head">
                  <span>
                    Chunk {hud.chunkX},{hud.chunkZ}
                  </span>
                  <span>Tick {runtimeHud.tick}</span>
                </div>
                <div className="debug-minimap-grid">
                  <div className="debug-minimap-player" style={{ left: "50%", top: "50%" }} />
                  {directiveHud.spawnHints
                    .map((hint) => {
                      const deltaChunkX = hint.chunkX - hud.chunkX;
                      const deltaChunkZ = hint.chunkZ - hud.chunkZ;
                      if (Math.abs(deltaChunkX) > 3 || Math.abs(deltaChunkZ) > 3) {
                        return null;
                      }
                      const left = 50 + (deltaChunkX * 14);
                      const top = 50 + (deltaChunkZ * 14);
                      return (
                        <div
                          key={hint.hintId}
                          className="debug-minimap-hint"
                          style={{ left: `${left}%`, top: `${top}%` }}
                          title={`${hint.label} @ ${hint.chunkX},${hint.chunkZ}`}
                        />
                      );
                    })
                    .filter((node) => node !== null)}
                </div>
                <div className="debug-minimap-foot">
                  <span>Loaded {hud.chunkCount}</span>
                  <span>{runtimeHud.mode}</span>
                </div>
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
            <div className="hud-bottom-dock">
              <div className="hearts-row" aria-label="health">
                {Array.from({ length: MAX_HEARTS }, (_, index) => (
                  <span
                    key={`heart-${index}`}
                    className={`heart-icon ${index < CURRENT_HEARTS ? "full" : "empty"}`}
                    aria-hidden
                  />
                ))}
              </div>
              <div className="hotbar-strip">
                {hotbarUiSlots.map((slot, index) =>
                  slot ? (
                    <button
                      key={slot.id}
                      type="button"
                      className={`hud-hotbar-slot ${selectedHotbarIndex === index ? "active" : ""}`}
                      onClick={() => handleHotbarSelect(index)}
                      aria-label={`${slot.label} (${slot.keybind})`}
                    >
                      <span className="slot-key">{slot.keybind}</span>
                      <span className="slot-label">{slot.label}</span>
                      {selectedHotbarIndex === index && combatHud.selectedCooldownMs > 0 ? (
                        <span className="slot-cooldown">{combatHud.selectedCooldownMs}ms</span>
                      ) : null}
                    </button>
                  ) : (
                    <div key={`empty-slot-${index}`} className="hud-hotbar-slot empty" aria-hidden />
                  ),
                )}
              </div>
              <div className="craft-strip" aria-label="craft recipes">
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
            </div>
          </div>
        ) : null}
      </div>
      <aside className="world-hud dex-shell">
        <h2>Trainer: {playerLabel}</h2>
        <div className="camera-row">
          <button
            type="button"
            className={`button button-secondary ${cameraMode === "first-person" ? "button-active" : ""}`}
            onClick={() => setCameraMode("first-person")}
          >
            First Person
          </button>
          <button
            type="button"
            className={`button button-secondary ${cameraMode === "third-person" ? "button-active" : ""}`}
            onClick={() => setCameraMode("third-person")}
          >
            Third Person
          </button>
        </div>
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
        </div>
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
        <ul>
          <li>X: {hud.x.toFixed(1)}</li>
          <li>Z: {hud.z.toFixed(1)}</li>
          <li>Lat: {hud.lat.toFixed(5)}</li>
          <li>Lon: {hud.lon.toFixed(5)}</li>
          <li>
            Chunk: {hud.chunkX}, {hud.chunkZ}
          </li>
          <li>Loaded Chunks: {hud.chunkCount}</li>
          <li>Camera: {cameraMode}</li>
          <li>Runtime Mode: {runtimeHud.mode}</li>
          <li>Runtime Tick: {runtimeHud.tick}</li>
          <li>World Flags Tick: {worldFlagHud.tick}</li>
          <li>World Flags: {formatWorldFlags(worldFlagHud.flags)}</li>
          <li>Directive Tick: {directiveHud.tick}</li>
          <li>
            Story Beat:{" "}
            {directiveHud.storyBeats.length > 0
              ? directiveHud.storyBeats[directiveHud.storyBeats.length - 1]
              : "none"}
          </li>
          <li>Spawn Hints: {formatSpawnHints(directiveHud.spawnHints)}</li>
          <li>Diagnostics: {showDiagnostics ? `on (${meshDetailMode})` : "off"}</li>
          <li>Stash Resource: {formatRuntimeResourceLabel(selectedStashResourceId)}</li>
          <li>Transfer Amount: x{selectedTransferAmount}</li>
          <li>Transfer Modifiers: Shift=half, Ctrl/Alt/Cmd=all</li>
          <li>Inventory: {formatResourceSummary(inventoryHud.resources)}</li>
          <li>Inventory Tick: {inventoryHud.tick}</li>
          <li>Stash ({containerHud.containerId}): {formatResourceSummary(containerHud.resources)}</li>
          <li>Stash Tick: {containerHud.tick}</li>
          <li>Private Stash ({privateContainerHud.containerId || "loading"}): {formatResourceSummary(privateContainerHud.resources)}</li>
          <li>Private Stash Tick: {privateContainerHud.tick}</li>
          {showDiagnostics ? <li>Mesh Core: {meshHud.coreMode}</li> : null}
          {showDiagnostics ? <li>Mesh Quads: {meshHud.quads}</li> : null}
          {showDiagnostics ? <li>Mesh Verts: {meshHud.vertices}</li> : null}
          {showDiagnostics ? <li>Orchestrator Events: {orchestratorHud.eventsSent}</li> : null}
          {showDiagnostics ? <li>Directives Received: {orchestratorHud.directivesReceived}</li> : null}
          {showDiagnostics ? <li>Last Event: {orchestratorHud.lastEventType}</li> : null}
          {showDiagnostics && meshDetailMode === "detailed" ? <li>Mesh Extract ms: {meshHud.extractMs.toFixed(2)}</li> : null}
          {showDiagnostics && meshDetailMode === "detailed" ? <li>Mesh Upload ms: {meshHud.uploadMs.toFixed(2)}</li> : null}
          {showDiagnostics && meshDetailMode === "detailed" ? <li>Mesh Extract Avg: {meshHud.extractAvgMs.toFixed(2)}</li> : null}
          {showDiagnostics && meshDetailMode === "detailed" ? <li>Mesh Upload Avg: {meshHud.uploadAvgMs.toFixed(2)}</li> : null}
          {showDiagnostics && meshDetailMode === "detailed" ? <li>Mesh Extract P95: {meshHud.extractP95Ms.toFixed(2)}</li> : null}
          {showDiagnostics && meshDetailMode === "detailed" ? <li>Mesh Upload P95: {meshHud.uploadP95Ms.toFixed(2)}</li> : null}
          {showDiagnostics && meshDetailMode === "detailed" ? (
            <li>Active Chunk Extract Avg: {meshHud.activeChunkExtractAvgMs.toFixed(2)}</li>
          ) : null}
          {showDiagnostics && meshDetailMode === "detailed" ? (
            <li>Active Chunk Upload Avg: {meshHud.activeChunkUploadAvgMs.toFixed(2)}</li>
          ) : null}
          {showDiagnostics && meshDetailMode === "detailed" ? <li>Mesh Tracked Chunks: {meshHud.trackedChunks}</li> : null}
          {showDiagnostics && meshHud.workerError ? <li>Mesh Worker Error: {meshHud.workerError}</li> : null}
          <li>Grid: {CHUNK_GRID_CELLS}x{CHUNK_GRID_CELLS} cells/chunk</li>
          {atlasSummary ? (
            <li>
              Atlas: {atlasSummary.atlasId} ({atlasSummary.monCount} mons)
            </li>
          ) : (
            <li>Atlas: not loaded</li>
          )}
          {orchestratorHud.lastError ? <li>Orchestrator Error: {orchestratorHud.lastError}</li> : null}
        </ul>
        <ul className="combat-log">
          <li>Active Slot: {combatHud.selectedSlotLabel}</li>
          <li>
            Active Recipe: {selectedCraftRecipe.label} ({selectedCraftRecipe.keybind})
          </li>
          <li>Cooldown: {combatHud.selectedCooldownMs > 0 ? `${combatHud.selectedCooldownMs}ms` : "ready"}</li>
          <li>Last Action: {combatHud.lastAction}</li>
          <li>Last Target: {combatHud.lastTarget}</li>
          <li>Target Resolution: {combatHud.targetResolution}</li>
        </ul>
        <ul className="directive-history">
          {directiveHistory.length === 0 ? (
            <li>Directive History: none</li>
          ) : (
            directiveHistory
              .slice()
              .reverse()
              .map((entry) => (
                <li key={entry.id}>
                  [{entry.tick}] {entry.text}
                </li>
              ))
          )}
        </ul>
        <p className="muted">
          Drag to rotate camera. Move with W/S and swapped strafe (A=right, D=left). Use 1-5 to select slot and
          left-click to attack or break blocks. Right-click places a block. Craft flow: choose recipe with 6-9 (or
          click recipe bar), then press R to craft. Select stash resource with N/M and amount with J/K (or use HUD
          buttons). Hold Shift for half transfer, or Ctrl/Alt/Cmd for all. Press [ / ] for shared stash and ; /
          &apos; for private stash transfers. Use F3 to toggle diagnostics, F4 to switch mesh detail mode, and F5 to
          toggle debug minimap.
        </p>
      </aside>
    </section>
  );
}

function makeTileGeometry(width: number, height: number): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(width, height);
  geometry.rotateX(-Math.PI * 0.5);
  return geometry;
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

function hashToColor(payload: string): string {
  const hash = numericHash(payload);
  const hue = hash % 360;
  const saturation = 55 + (hash % 20);
  const lightness = 45 + (hash % 10);
  const color = new THREE.Color();
  color.setHSL(hue / 360, saturation / 100, lightness / 100);
  return `#${color.getHexString()}`;
}

function formatResourceSummary(resources: Record<string, number>): string {
  return DEFAULT_RUNTIME_RESOURCE_IDS
    .map((resourceId) => `${resourceId}:${resources[resourceId] ?? 0}`)
    .join(" ");
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

function buildChunkVertexColors(positions: Float32Array, chunkMaxHeight: number): Float32Array {
  const colors = new Float32Array(positions.length);
  const maxHeight = Math.max(1, chunkMaxHeight);
  for (let index = 0; index < positions.length; index += 3) {
    const y = positions[index + 1];
    const normalized = THREE.MathUtils.clamp(y / maxHeight, 0, 1);

    let r = 0.26 + (0.2 * normalized);
    let g = 0.42 + (0.32 * normalized);
    let b = 0.2 + (0.08 * (1 - normalized));

    if (normalized < 0.22) {
      r = 0.46;
      g = 0.34;
      b = 0.22;
    } else if (normalized > 0.78) {
      r += 0.07;
      g += 0.07;
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

function createSpriteTextureSet(): SpriteTextureSet {
  return {
    playerA: createPixelTexture((ctx) => drawTrainerSprite(ctx, "#d63232", "#1844ba", "#2a2a2a", 0)),
    playerB: createPixelTexture((ctx) => drawTrainerSprite(ctx, "#d63232", "#1844ba", "#2a2a2a", 1)),
    npcA: createPixelTexture((ctx) => drawTrainerSprite(ctx, "#8c6a41", "#316b48", "#2f2f2f", 0)),
    npcB: createPixelTexture((ctx) => drawTrainerSprite(ctx, "#6c5942", "#3a4f8f", "#2f2f2f", 1)),
    monA: createPixelTexture((ctx) => drawMonSprite(ctx, "#4e7de7", "#d9ebff", "#2b3366")),
    monB: createPixelTexture((ctx) => drawMonSprite(ctx, "#f5a75a", "#fff5df", "#7a3c18")),
    monC: createPixelTexture((ctx) => drawMonSprite(ctx, "#74c46f", "#e7ffdb", "#2f5a2f")),
    treeA: createPixelTexture((ctx) => drawTreeSprite(ctx, "#3f9448", "#80cf79", "#6d4a2a")),
    treeB: createPixelTexture((ctx) => drawTreeSprite(ctx, "#2f7f52", "#63b369", "#72522f")),
    treeC: createPixelTexture((ctx) => drawTreeSprite(ctx, "#4f8d3c", "#97d673", "#805837")),
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
