export type AssetClass =
  | "terrain_voxel"
  | "imposter_2d"
  | "icon_2d"
  | "decal_2d"
  | "prop_3d"
  | "npc_3d"
  | "hero_prop_3d"
  | "voice_line"
  | "video_scene";

export type AssetTier = "tier0" | "tier1" | "tier2" | "tier3";

export type AssetIntentPriority = "low" | "normal" | "high";

export type AssetIntentStatus = "queued" | "running" | "completed" | "failed";

export type PatchOperationKind = "replace" | "remove";

export interface ChunkCoordinate {
  x: number;
  z: number;
}

export interface RuntimeBudget {
  maxTris: number;
  maxTextureSize: number;
  maxMemoryKb: number;
}

export interface AssetIntentRequest {
  intentId: string;
  worldSeed: string;
  chunk: ChunkCoordinate;
  assetClass: AssetClass;
  semanticTags: string[];
  styleProfileId: string;
  recipeId: string;
  runtimeBudget: RuntimeBudget;
  priority: AssetIntentPriority;
  deadlineMs: number;
  idempotencyKey: string;
}

export interface AssetIntentAccepted {
  intentId: string;
  status: "queued" | "running";
  queueTier: string;
}

export interface AssetIntentStatusResponse {
  intentId: string;
  status: AssetIntentStatus;
  attempt: number;
  recipeId: string;
  errors: string[];
}

export interface ChunkManifestAssetMetadata {
  width?: number;
  height?: number;
  triangleCount?: number;
  lodCount?: number;
  skeletonId?: string;
  clips?: string[];
  retargetStatus?: "retargeted" | "native_compatible" | "failed";
}

export interface ChunkManifestAsset {
  slotId: string;
  assetClass: AssetClass;
  assetId: string;
  tier: AssetTier;
  variantHash: string;
  uri: string;
  metadata?: ChunkManifestAssetMetadata;
}

export interface ChunkManifest {
  worldSeed: string;
  chunk: ChunkCoordinate;
  manifestVersion: number;
  generatedAt: string;
  assets: ChunkManifestAsset[];
}

export interface ManifestPatchOperation {
  op: PatchOperationKind;
  slotId: string;
  assetId?: string;
  variantHash?: string;
  uri?: string;
  tier?: AssetTier;
}

export interface ChunkManifestPatchResponse {
  fromVersion: number;
  toVersion: number;
  patches: ManifestPatchOperation[];
}

export interface ParseResult<T> {
  value: T | null;
  error: string | null;
}

const ASSET_CLASS_SET = new Set<AssetClass>([
  "terrain_voxel",
  "imposter_2d",
  "icon_2d",
  "decal_2d",
  "prop_3d",
  "npc_3d",
  "hero_prop_3d",
  "voice_line",
  "video_scene",
]);

const ASSET_TIER_SET = new Set<AssetTier>(["tier0", "tier1", "tier2", "tier3"]);

const PATCH_OP_SET = new Set<PatchOperationKind>(["replace", "remove"]);

const STATUS_SET = new Set<AssetIntentStatus>(["queued", "running", "completed", "failed"]);

function isRecord(payload: unknown): payload is Record<string, unknown> {
  return typeof payload === "object" && payload !== null;
}

function toNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function toStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const entries: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      return null;
    }
    entries.push(item);
  }

  return entries;
}

function parseChunkCoordinate(value: unknown): ChunkCoordinate | null {
  if (!isRecord(value)) {
    return null;
  }

  const x = toNumber(value.x);
  const z = toNumber(value.z);
  if (x === null || z === null) {
    return null;
  }

  return { x, z };
}

function parseAssetTier(value: unknown): AssetTier | null {
  return typeof value === "string" && ASSET_TIER_SET.has(value as AssetTier)
    ? (value as AssetTier)
    : null;
}

function parseAssetClass(value: unknown): AssetClass | null {
  return typeof value === "string" && ASSET_CLASS_SET.has(value as AssetClass)
    ? (value as AssetClass)
    : null;
}

export function parseAssetIntentAccepted(payload: unknown): ParseResult<AssetIntentAccepted> {
  if (!isRecord(payload)) {
    return { value: null, error: "asset intent accepted payload must be an object" };
  }

  const intentId = toString(payload.intent_id);
  const status = toString(payload.status);
  const queueTier = toString(payload.queue_tier);
  if (!intentId || !status || !queueTier) {
    return { value: null, error: "asset intent accepted payload missing required fields" };
  }

  if (status !== "queued" && status !== "running") {
    return { value: null, error: `unexpected intent status '${status}'` };
  }

  return {
    value: {
      intentId,
      status,
      queueTier,
    },
    error: null,
  };
}

export function parseAssetIntentStatus(payload: unknown): ParseResult<AssetIntentStatusResponse> {
  if (!isRecord(payload)) {
    return { value: null, error: "asset intent status payload must be an object" };
  }

  const intentId = toString(payload.intent_id);
  const status = toString(payload.status);
  const attempt = toNumber(payload.attempt);
  const recipeId = toString(payload.recipe_id);
  const errors = toStringArray(payload.errors);

  if (!intentId || !status || attempt === null || !recipeId || errors === null) {
    return { value: null, error: "asset intent status payload missing required fields" };
  }

  if (!STATUS_SET.has(status as AssetIntentStatus)) {
    return { value: null, error: `unexpected status '${status}'` };
  }

  return {
    value: {
      intentId,
      status: status as AssetIntentStatus,
      attempt,
      recipeId,
      errors,
    },
    error: null,
  };
}

function parseChunkManifestAssetMetadata(value: unknown): ChunkManifestAssetMetadata | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const width = toNumber(value.width) ?? undefined;
  const height = toNumber(value.height) ?? undefined;
  const triangleCount = toNumber(value.triangle_count) ?? undefined;
  const lodCount = toNumber(value.lod_count) ?? undefined;
  const skeletonId = toString(value.skeleton_id) ?? undefined;
  const clips = toStringArray(value.clips) ?? undefined;

  const retargetStatusRaw = toString(value.retarget_status);
  const retargetStatus =
    retargetStatusRaw === "retargeted" ||
    retargetStatusRaw === "native_compatible" ||
    retargetStatusRaw === "failed"
      ? retargetStatusRaw
      : undefined;

  return {
    width,
    height,
    triangleCount,
    lodCount,
    skeletonId,
    clips,
    retargetStatus,
  };
}

function parseChunkManifestAsset(value: unknown): ChunkManifestAsset | null {
  if (!isRecord(value)) {
    return null;
  }

  const slotId = toString(value.slot_id);
  const assetClass = parseAssetClass(value.asset_class);
  const assetId = toString(value.asset_id);
  const tier = parseAssetTier(value.tier);
  const variantHash = toString(value.variant_hash);
  const uri = toString(value.uri);

  if (!slotId || !assetClass || !assetId || !tier || !variantHash || !uri) {
    return null;
  }

  return {
    slotId,
    assetClass,
    assetId,
    tier,
    variantHash,
    uri,
    metadata: parseChunkManifestAssetMetadata(value.metadata),
  };
}

export function parseChunkManifest(payload: unknown): ParseResult<ChunkManifest> {
  if (!isRecord(payload)) {
    return { value: null, error: "chunk manifest payload must be an object" };
  }

  const worldSeed = toString(payload.world_seed);
  const chunk = parseChunkCoordinate(payload.chunk);
  const manifestVersion = toNumber(payload.manifest_version);
  const generatedAt = toString(payload.generated_at);
  if (!worldSeed || !chunk || manifestVersion === null || !generatedAt || !Array.isArray(payload.assets)) {
    return { value: null, error: "chunk manifest payload missing required fields" };
  }

  const assets: ChunkManifestAsset[] = [];
  for (const entry of payload.assets) {
    const parsed = parseChunkManifestAsset(entry);
    if (!parsed) {
      return { value: null, error: "chunk manifest payload contains invalid asset entries" };
    }
    assets.push(parsed);
  }

  return {
    value: {
      worldSeed,
      chunk,
      manifestVersion,
      generatedAt,
      assets,
    },
    error: null,
  };
}

function parsePatchOperation(value: unknown): ManifestPatchOperation | null {
  if (!isRecord(value)) {
    return null;
  }

  const opRaw = toString(value.op);
  const slotId = toString(value.slot_id);
  if (!opRaw || !slotId || !PATCH_OP_SET.has(opRaw as PatchOperationKind)) {
    return null;
  }

  const op = opRaw as PatchOperationKind;

  if (op === "remove") {
    return { op, slotId };
  }

  const assetId = toString(value.asset_id);
  const variantHash = toString(value.variant_hash);
  const uri = toString(value.uri);
  const tier = parseAssetTier(value.tier);
  if (!assetId || !variantHash || !uri || !tier) {
    return null;
  }

  return {
    op,
    slotId,
    assetId,
    variantHash,
    uri,
    tier,
  };
}

export function parseChunkManifestPatch(payload: unknown): ParseResult<ChunkManifestPatchResponse> {
  if (!isRecord(payload)) {
    return { value: null, error: "chunk manifest patch payload must be an object" };
  }

  const fromVersion = toNumber(payload.from_version);
  const toVersion = toNumber(payload.to_version);
  if (fromVersion === null || toVersion === null || !Array.isArray(payload.patches)) {
    return { value: null, error: "chunk manifest patch payload missing required fields" };
  }

  const patches: ManifestPatchOperation[] = [];
  for (const entry of payload.patches) {
    const parsed = parsePatchOperation(entry);
    if (!parsed) {
      return { value: null, error: "chunk manifest patch payload contains invalid patch entries" };
    }
    patches.push(parsed);
  }

  return {
    value: {
      fromVersion,
      toVersion,
      patches,
    },
    error: null,
  };
}

export function parseRuntimeBudget(payload: unknown): RuntimeBudget | null {
  if (!isRecord(payload)) {
    return null;
  }

  const maxTris = toNumber(payload.max_tris);
  const maxTextureSize = toNumber(payload.max_texture_size);
  const maxMemoryKb = toNumber(payload.max_memory_kb);

  if (maxTris === null || maxTextureSize === null || maxMemoryKb === null) {
    return null;
  }

  return {
    maxTris,
    maxTextureSize,
    maxMemoryKb,
  };
}
