import {
  AssetIntentAccepted,
  AssetIntentRequest,
  AssetIntentStatusResponse,
  ChunkManifest,
  ChunkManifestPatchResponse,
  parseAssetIntentAccepted,
  parseAssetIntentStatus,
  parseChunkManifest,
  parseChunkManifestPatch,
} from "@/lib/assets/asset-contracts";

export interface AssetServiceClient {
  submitAssetIntent(intent: AssetIntentRequest): Promise<AssetIntentAccepted>;
  getAssetIntentStatus(intentId: string): Promise<AssetIntentStatusResponse>;
  getChunkManifest(worldSeed: string, chunkX: number, chunkZ: number): Promise<ChunkManifest>;
  getChunkManifestPatches(
    worldSeed: string,
    chunkX: number,
    chunkZ: number,
    sinceVersion: number,
  ): Promise<ChunkManifestPatchResponse>;
}

export interface HttpAssetServiceClientConfig {
  baseUrl: string;
  authToken?: string;
  fetchImpl?: typeof fetch;
}

export class HttpAssetServiceClient implements AssetServiceClient {
  private readonly baseUrl: string;

  private readonly authToken?: string;

  private readonly fetchImpl: typeof fetch;

  constructor(config: HttpAssetServiceClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.authToken = config.authToken;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async submitAssetIntent(intent: AssetIntentRequest): Promise<AssetIntentAccepted> {
    const payload = await this.requestJson("/v1/asset-intents", {
      method: "POST",
      body: JSON.stringify(toIntentPayload(intent)),
    });

    const parsed = parseAssetIntentAccepted(payload);
    if (!parsed.value) {
      throw new Error(parsed.error ?? "asset intent accepted response parse failed");
    }

    return parsed.value;
  }

  async getAssetIntentStatus(intentId: string): Promise<AssetIntentStatusResponse> {
    const payload = await this.requestJson(`/v1/asset-intents/${encodeURIComponent(intentId)}`);
    const parsed = parseAssetIntentStatus(payload);
    if (!parsed.value) {
      throw new Error(parsed.error ?? "asset intent status response parse failed");
    }

    return parsed.value;
  }

  async getChunkManifest(worldSeed: string, chunkX: number, chunkZ: number): Promise<ChunkManifest> {
    const payload = await this.requestJson(
      `/v1/chunk-manifests/${encodeURIComponent(worldSeed)}/${chunkX}/${chunkZ}`,
    );
    const parsed = parseChunkManifest(payload);
    if (!parsed.value) {
      throw new Error(parsed.error ?? "chunk manifest response parse failed");
    }

    return parsed.value;
  }

  async getChunkManifestPatches(
    worldSeed: string,
    chunkX: number,
    chunkZ: number,
    sinceVersion: number,
  ): Promise<ChunkManifestPatchResponse> {
    const payload = await this.requestJson(
      `/v1/chunk-manifests/${encodeURIComponent(worldSeed)}/${chunkX}/${chunkZ}/patches?since_version=${sinceVersion}`,
    );
    const parsed = parseChunkManifestPatch(payload);
    if (!parsed.value) {
      throw new Error(parsed.error ?? "chunk manifest patch response parse failed");
    }

    return parsed.value;
  }

  private async requestJson(path: string, init?: RequestInit): Promise<unknown> {
    const headers = new Headers(init?.headers ?? {});
    headers.set("accept", "application/json");
    if (init?.body) {
      headers.set("content-type", "application/json");
    }
    if (this.authToken) {
      headers.set("authorization", `Bearer ${this.authToken}`);
    }

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers,
    });

    if (!response.ok) {
      const detail = await safeReadText(response);
      throw new Error(`asset service request failed (${response.status}): ${detail}`);
    }

    return response.json();
  }
}

function toIntentPayload(intent: AssetIntentRequest): Record<string, unknown> {
  return {
    intent_id: intent.intentId,
    world_seed: intent.worldSeed,
    chunk: {
      x: intent.chunk.x,
      z: intent.chunk.z,
    },
    asset_class: intent.assetClass,
    semantic_tags: intent.semanticTags,
    style_profile_id: intent.styleProfileId,
    recipe_id: intent.recipeId,
    runtime_budget: {
      max_tris: intent.runtimeBudget.maxTris,
      max_texture_size: intent.runtimeBudget.maxTextureSize,
      max_memory_kb: intent.runtimeBudget.maxMemoryKb,
    },
    priority: intent.priority,
    deadline_ms: intent.deadlineMs,
    idempotency_key: intent.idempotencyKey,
  };
}

async function safeReadText(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text || "no error detail";
  } catch {
    return "unable to read error body";
  }
}
