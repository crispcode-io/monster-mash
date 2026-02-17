import {
  AssetIntentAccepted,
  AssetIntentRequest,
  AssetIntentStatusResponse,
  AssetTier,
  ChunkManifest,
  ChunkManifestAsset,
  ChunkManifestPatchResponse,
  ManifestPatchOperation,
} from "@/lib/assets/asset-contracts";
import { AssetServiceClient } from "@/lib/assets/asset-service-client";

interface StoredIntent {
  intent: AssetIntentRequest;
  status: AssetIntentStatusResponse;
}

interface StoredPatch {
  fromVersion: number;
  toVersion: number;
  patch: ManifestPatchOperation;
}

export class MockAssetServiceClient implements AssetServiceClient {
  private readonly manifests = new Map<string, ChunkManifest>();

  private readonly intents = new Map<string, StoredIntent>();

  private readonly patchesByChunk = new Map<string, StoredPatch[]>();

  async submitAssetIntent(intent: AssetIntentRequest): Promise<AssetIntentAccepted> {
    const accepted: AssetIntentAccepted = {
      intentId: intent.intentId,
      status: "queued",
      queueTier: intent.priority === "high" ? "near_frontier" : "background",
    };

    this.intents.set(intent.intentId, {
      intent,
      status: {
        intentId: intent.intentId,
        status: "running",
        attempt: 1,
        recipeId: intent.recipeId,
        errors: [],
      },
    });

    this.promoteIntentIntoManifest(intent);

    this.intents.set(intent.intentId, {
      intent,
      status: {
        intentId: intent.intentId,
        status: "completed",
        attempt: 1,
        recipeId: intent.recipeId,
        errors: [],
      },
    });

    return accepted;
  }

  async getAssetIntentStatus(intentId: string): Promise<AssetIntentStatusResponse> {
    const stored = this.intents.get(intentId);
    if (!stored) {
      return {
        intentId,
        status: "failed",
        attempt: 0,
        recipeId: "unknown",
        errors: ["intent not found in mock client"],
      };
    }

    return { ...stored.status, errors: [...stored.status.errors] };
  }

  async getChunkManifest(worldSeed: string, chunkX: number, chunkZ: number): Promise<ChunkManifest> {
    const chunkKey = toChunkKey(worldSeed, chunkX, chunkZ);
    const existing = this.manifests.get(chunkKey);

    if (!existing) {
      const initial: ChunkManifest = {
        worldSeed,
        chunk: { x: chunkX, z: chunkZ },
        manifestVersion: 1,
        generatedAt: new Date().toISOString(),
        assets: [],
      };
      this.manifests.set(chunkKey, initial);
      this.patchesByChunk.set(chunkKey, []);
      return cloneManifest(initial);
    }

    return cloneManifest(existing);
  }

  async getChunkManifestPatches(
    worldSeed: string,
    chunkX: number,
    chunkZ: number,
    sinceVersion: number,
  ): Promise<ChunkManifestPatchResponse> {
    const chunkKey = toChunkKey(worldSeed, chunkX, chunkZ);
    const history = this.patchesByChunk.get(chunkKey) ?? [];
    const selected = history.filter((entry) => entry.toVersion > sinceVersion);

    if (selected.length === 0) {
      return {
        fromVersion: sinceVersion,
        toVersion: sinceVersion,
        patches: [],
      };
    }

    return {
      fromVersion: selected[0].fromVersion,
      toVersion: selected[selected.length - 1].toVersion,
      patches: selected.map((entry) => ({ ...entry.patch })),
    };
  }

  private promoteIntentIntoManifest(intent: AssetIntentRequest): void {
    const chunkKey = toChunkKey(intent.worldSeed, intent.chunk.x, intent.chunk.z);
    const existing = this.manifests.get(chunkKey);

    const baseManifest: ChunkManifest =
      existing ?? {
        worldSeed: intent.worldSeed,
        chunk: { x: intent.chunk.x, z: intent.chunk.z },
        manifestVersion: 1,
        generatedAt: new Date().toISOString(),
        assets: [],
      };

    const slotHint = intent.semanticTags[0] ?? intent.assetClass;
    const slotId = `${intent.assetClass}:${normalizeSlotToken(slotHint)}`;
    const variantHash = deterministicHash(
      `${intent.worldSeed}:${intent.chunk.x}:${intent.chunk.z}:${intent.assetClass}:${slotHint}:${intent.recipeId}`,
    );

    const asset: ChunkManifestAsset = {
      slotId,
      assetClass: intent.assetClass,
      assetId: `asset:${normalizeSlotToken(slotHint)}:${intent.assetClass}`,
      tier: resolveTier(intent.assetClass),
      variantHash: `sha256:${variantHash}`,
      uri: `mock://assets/${variantHash}`,
      metadata: {
        width: 1024,
        height: 1024,
      },
    };

    const nextAssets = upsertAsset(baseManifest.assets, asset);
    const nextVersion = baseManifest.manifestVersion + 1;

    const nextManifest: ChunkManifest = {
      ...baseManifest,
      generatedAt: new Date().toISOString(),
      manifestVersion: nextVersion,
      assets: nextAssets,
    };

    this.manifests.set(chunkKey, nextManifest);

    const history = this.patchesByChunk.get(chunkKey) ?? [];
    history.push({
      fromVersion: baseManifest.manifestVersion,
      toVersion: nextVersion,
      patch: {
        op: "replace",
        slotId: asset.slotId,
        assetId: asset.assetId,
        variantHash: asset.variantHash,
        uri: asset.uri,
        tier: asset.tier,
      },
    });
    this.patchesByChunk.set(chunkKey, history);
  }
}

function resolveTier(assetClass: AssetIntentRequest["assetClass"]): AssetTier {
  if (assetClass === "prop_3d" || assetClass === "npc_3d" || assetClass === "hero_prop_3d") {
    return "tier2";
  }

  if (assetClass === "imposter_2d" || assetClass === "icon_2d" || assetClass === "decal_2d") {
    return "tier1";
  }

  return "tier0";
}

function upsertAsset(existing: ChunkManifestAsset[], next: ChunkManifestAsset): ChunkManifestAsset[] {
  const withoutSlot = existing.filter((entry) => entry.slotId !== next.slotId);
  withoutSlot.push(next);
  return withoutSlot;
}

function toChunkKey(worldSeed: string, chunkX: number, chunkZ: number): string {
  return `${worldSeed}:${chunkX}:${chunkZ}`;
}

function normalizeSlotToken(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";
}

function cloneManifest(manifest: ChunkManifest): ChunkManifest {
  return {
    worldSeed: manifest.worldSeed,
    chunk: { ...manifest.chunk },
    manifestVersion: manifest.manifestVersion,
    generatedAt: manifest.generatedAt,
    assets: manifest.assets.map((asset) => ({
      ...asset,
      metadata: asset.metadata ? { ...asset.metadata, clips: asset.metadata.clips ? [...asset.metadata.clips] : undefined } : undefined,
    })),
  };
}

function deterministicHash(input: string): string {
  let hash = 2166136261;

  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}
