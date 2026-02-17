# Asset Generation Client-Server Contract

Updated: 2026-02-15

Purpose: define exactly how the game runtime should talk to the external asset-generation project.

## 1. Architecture Boundary

1. Game repo is the **client**.
2. Asset generation project is the **server**.
3. Game never calls model providers directly.
4. Game only consumes validated manifests/variants from asset service.

## 2. Non-Negotiable Runtime Rules

1. Asset generation is never in chunk-critical path.
2. If server times out or fails, client keeps Tier 0 placeholder assets.
3. All published asset variants are immutable (`variant_hash`).
4. Every promotion is manifest-versioned.

## 3. API Surface (MVP)

### 3.1 `POST /v1/asset-intents`
Creates generation work.

Request:
```json
{
  "intent_id": "intent_01JXYZ...",
  "world_seed": "austin-prototype-v1",
  "chunk": { "x": 12, "z": -4 },
  "asset_class": "imposter_2d",
  "semantic_tags": ["oak_tree", "frontier_village", "temperate"],
  "style_profile_id": "frontier-v1",
  "recipe_id": "nb-imposter-v1",
  "runtime_budget": {
    "max_tris": 0,
    "max_texture_size": 1024,
    "max_memory_kb": 512
  },
  "priority": "high",
  "deadline_ms": 2500,
  "idempotency_key": "world:austin-prototype-v1:12:-4:oak_tree:imposter_2d"
}
```

Response `202 Accepted`:
```json
{
  "intent_id": "intent_01JXYZ...",
  "status": "queued",
  "queue_tier": "near_frontier"
}
```

### 3.2 `GET /v1/asset-intents/{intent_id}`
Returns generation job status.

Response:
```json
{
  "intent_id": "intent_01JXYZ...",
  "status": "queued",
  "attempt": 1,
  "recipe_id": "nb-imposter-v1",
  "errors": []
}
```

### 3.3 `GET /v1/chunk-manifests/{world_seed}/{chunk_x}/{chunk_z}`
Returns active manifest for a chunk.

Response:
```json
{
  "world_seed": "austin-prototype-v1",
  "chunk": { "x": 12, "z": -4 },
  "manifest_version": 7,
  "generated_at": "2026-02-15T18:42:11Z",
  "assets": [
    {
      "slot_id": "tree_03",
      "asset_class": "imposter_2d",
      "asset_id": "asset_tree_oak_003",
      "tier": "tier1",
      "variant_hash": "sha256:abc123...",
      "uri": "https://cdn.example.com/assets/sha256-abc123.webp",
      "metadata": {
        "width": 1024,
        "height": 1024
      }
    }
  ]
}
```

### 3.4 `GET /v1/chunk-manifests/{world_seed}/{chunk_x}/{chunk_z}/patches?since_version={n}`
Returns patch stream for hot-swap.

Response:
```json
{
  "from_version": 7,
  "to_version": 8,
  "patches": [
    {
      "op": "replace",
      "slot_id": "tower_01",
      "asset_id": "asset_tower_01",
      "variant_hash": "sha256:def456...",
      "uri": "https://cdn.example.com/assets/sha256-def456.glb",
      "tier": "tier2"
    }
  ]
}
```

## 4. Recipe IDs and Model Mapping

Do not hard-code raw model names in game client. Client sends `recipe_id`.

### 4.1 Required initial recipes

1. `nb-imposter-v1`
   - Asset classes: `imposter_2d`, `icon_2d`, `decal_2d`
   - Provider model: Gemini Nano Banana family (for example `gemini-2.5-flash-image`)
   - Output: webp/png + alpha-safe + atlas-ready dimensions

2. `hy3d-fast-prop-v1`
   - Asset classes: `prop_3d`
   - Provider: Hunyuan3D-2 fast/turbo path
   - Output: `.glb` + LODs + collision metadata

3. `hy3d-quality-hero-v1`
   - Asset classes: `npc_3d`, `hero_prop_3d`
   - Provider: Hunyuan3D-2.1 quality path
   - Output: `.glb` + validated UV + LODs + baked textures

4. `trellis-refine-v1`
   - Asset classes: refinement variants for promoted assets
   - Provider: TRELLIS image-to-3D
   - Output: `.glb` refinement candidate + quality score

5. `gemini-tts-npc-v1`
   - Asset classes: `voice_line`
   - Provider model: Gemini TTS models
   - Output: mono `.wav`/`.ogg` + transcript hash

6. `veo-cutscene-v1`
   - Asset classes: `video_scene`
   - Provider model: Veo fast/quality path
   - Output: mp4/webm
   - Constraint: not eligible for chunk streaming path

## 5. Animation Contract

For any `npc_3d` or player-compatible mesh, server must return:

1. `skeleton_id` (must match canonical rig family).
2. `clips[]` containing required names:
   - `idle`, `walk`, `run`, `attack_light`, `attack_heavy`, `cast`, `hit_react`, `death`, `interact`
3. `retarget_status` as one of:
   - `retargeted`
   - `native_compatible`
   - `failed`

If `retarget_status=failed` or required clips missing, variant is not promotable.

## 6. SLA and Failure Semantics

### Near-frontier chunk budgets
1. Intent enqueue API p95: < 120 ms.
2. Manifest fetch API p95: < 200 ms.
3. Patch fetch API p95: < 200 ms.
4. No blocking requirement: client always renders placeholder immediately.

### Failure codes
1. `429` with retry window for quota/cost limits.
2. `503` for provider outage.
3. `422` for validation failure with detailed reject reasons.

## 7. Client behavior requirements

1. Submit intents asynchronously; never await generation before render.
2. Cache manifest per chunk and apply patch deltas idempotently.
3. If patch fails validation client-side, ignore patch and keep previous asset.
4. Maintain metric counters:
   - `placeholder_visible_count`
   - `patch_apply_success_count`
   - `patch_apply_failure_count`

## 8. Security and trust

1. Signed URLs for all promoted assets.
2. Manifest response must include integrity field (hash).
3. Asset URIs are immutable; no mutable overwrite under same hash.

## 9. Notes for asset service team

1. Prefer recipe-versioning over ad hoc prompt changes.
2. Keep style consistency through `style_profile_id` templates.
3. Return machine-readable validation details so game can debug fallback behavior.

## 10. Source references for model families

1. Gemini image generation docs: https://ai.google.dev/gemini-api/docs/image-generation
2. Gemini model list (Nano Banana family): https://ai.google.dev/gemini-api/docs/models
3. Gemini changelog/deprecations: https://ai.google.dev/gemini-api/docs/changelog
4. Gemini video docs (Veo): https://ai.google.dev/gemini-api/docs/video
5. Gemini speech docs (TTS): https://ai.google.dev/gemini-api/docs/speech-generation
6. Hunyuan3D-2 repository: https://github.com/Tencent/Hunyuan3D-2
7. TRELLIS repository: https://github.com/microsoft/TRELLIS
