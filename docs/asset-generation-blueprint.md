# Asset Generation Blueprint (Browser MMO)

Updated: 2026-02-15

## 1. Goal
Build a fast, persistent, generation-assisted asset pipeline for a browser MMO using hybrid voxel + 2D/3D rendering.

## 2. Hard Runtime Rules
1. Chunk loads never wait on external model inference.
2. Every entity must have an immediate placeholder (Tier 0).
3. Generated assets are asynchronous upgrades applied by manifest patch.
4. All published assets are immutable by content hash.

## 3. What To Build First (Order of Work)

### Phase A: Contract + Storage (build first)
1. Create `AssetIntent` contract (what should be generated).
2. Create `AssetVariant` contract (what was generated, tier/provider/hash).
3. Create `ChunkManifest` contract (which variant each chunk currently references).
4. Implement object storage + CDN + metadata DB.

Deliverable: no model calls yet, but end-to-end manifest/hot-swap data path works.

### Phase B: Tier 0 placeholders (required before any model integration)
1. Voxel terrain kits and primitive props.
2. Sprite imposters for trees/NPC fillers.
3. Deterministic naming and IDs by `world_seed + chunk + archetype`.

Deliverable: playable world with zero external generation.

### Phase C: Fast 2D generation (first model integration)
1. Integrate `gemini-2.5-flash-image` for icons, cards, decals, imposter textures, concept sheets.
2. Add style-lock prompt templates and automatic atlas packing.
3. Add moderation + resolution/alpha checks.

Deliverable: near-real-time visual upgrades for discovered content.

### Phase D: 3D generation queue (second model integration)
1. Integrate Hunyuan3D-2 Turbo/Fast path for quick mesh candidates.
2. Integrate Hunyuan3D-2.1 full path for promoted quality assets.
3. Add TRELLIS image-to-3D pass as a variant/refinement path.
4. Add mesh validation, decimation, UV sanity checks, GLB conversion, and LOD baking.

Deliverable: queued high-quality hero assets with non-blocking rollout.

### Phase E: Sound and voice
1. Start with procedural runtime SFX (footsteps, UI pings, impacts).
2. Add generated voice using Gemini TTS models for NPC dialogue lines.
3. Keep SFX generation out of gameplay critical path (batch or preload only).

Deliverable: stable audio without latency spikes.

### Phase F: Video
1. Use Veo only for trailers, recaps, or cutscene assets.
2. Do not include video generation in world streaming pipeline.

Deliverable: marketing/cinematic pipeline separate from live chunk loading.

## 4. Model Selection (Current)

| Modality | Primary model | Use case | Speed target | Runtime critical? |
|---|---|---|---|---|
| 2D images | `gemini-2.5-flash-image` | fast stylized texture/imposter/icon generation | sub-3s per request target | No |
| 2D high quality | `gemini-3-pro-image-preview` | curated/promoted art upgrades | offline/batch | No |
| 3D fast | `hunyuan3d-dit-v2-0-fast` (+ fast texture path) | quick chunk-near prop generation | best-effort background | No |
| 3D quality | Hunyuan3D-2.1 shape + paint models | hero assets, final promoted variants | offline/batch queue | No |
| 3D refinement/variants | `microsoft/TRELLIS-image-large` | image-to-3D variant generation/refinement | offline/batch | No |
| Voice | `gemini-2.5-flash-preview-tts` / `gemini-2.5-pro-preview-tts` | NPC lines, narration | preload/cache | No |
| Music | Lyria RealTime / Lyria model family | ambient music generation experiments | offline/pre-session | No |
| Video | `veo-3.1-fast-generate-preview` (or quality variants) | cutscenes, trailer clips | offline | No |

## 5. Recommended Initial Configs

### 5.1 2D style generation (Gemini image)
1. Start model: `gemini-2.5-flash-image`.
2. Enforce canonical style prompt prefix for consistency.
3. Keep output square or fixed aspect sets for atlas packing.
4. Generate 3-4 candidates, auto-rank by CLIP similarity to style guide, keep top 1.
5. Store both source prompt and final image hash for reproducibility.

Style prefix (example):
`painterly medieval frontier, torchlit valley, clean silhouette readability, low-noise textures, muted natural greens and warm firelight, game-ready, no text, no watermark`

### 5.2 Hunyuan3D fast path
1. Use Turbo/Fast subfolder models for low-latency queue mode.
2. Enable low VRAM mode in worker pools where needed.
3. Apply strict triangle budget immediately after generation.
4. Always auto-generate LOD0/LOD1/LOD2 and collision hull.
5. If quality score is low, keep placeholder and defer promotion.

### 5.3 TRELLIS refinement path
1. Use image-to-3D for variants of accepted concept images.
2. Output both Gaussian/structured representation and mesh export path.
3. Run decimation + UV validation + normal recalculation before publish.
4. Restrict to curated asset classes (hero props, landmarks) first.

## 6. Visual Consistency System (critical)
1. Define `style_profile_id` (for example `frontier-v1`).
2. All intents carry this profile ID.
3. Profile owns: palette, material roughness range, edge contrast, silhouette rules.
4. Reject any generated asset outside profile thresholds.

## 7. Persistence and Patch Flow
1. Player nears chunk.
2. Server loads chunk + current manifest version.
3. Missing assets resolve to Tier 0 fallback IDs.
4. Asset broker queues missing intents.
5. Generator publishes new variant hash.
6. Manifest version increments.
7. Clients receive patch and hot-swap visuals.

## 8. Minimal API Contracts To Implement First

### `POST /asset-intents`
Body:
1. `intent_id`
2. `style_profile_id`
3. `asset_class` (`imposter`, `prop3d`, `npc3d`, `icon`, `audio_voice`, `video_scene`)
4. `priority`
5. `context` (biome, faction, rarity, chunk coordinates)

### `GET /chunk-manifest/:chunk_id`
Response:
1. `chunk_id`
2. `manifest_version`
3. `assets[]` with `slot`, `asset_id`, `variant_hash`, `tier`

### `POST /chunk-manifest/:chunk_id/promote`
1. Validates moderation + technical checks.
2. Promotes variant hash into active manifest.

## 9. Do/Do-Not For MVP

Do:
1. Ship deterministic placeholders first.
2. Prioritize 2D speed path before full 3D quality path.
3. Promote only high-confidence generated assets.

Do not:
1. Block gameplay on model latency.
2. Generate video for runtime world streaming.
3. Allow direct model output into production manifest without validation.

## 10. Source Notes (verified 2026-02-15)
1. TRELLIS official repo: https://github.com/microsoft/TRELLIS
2. Hunyuan3D-2 official repo and model notes: https://github.com/Tencent/Hunyuan3D-2
3. Gemini image generation docs (current model IDs): https://ai.google.dev/gemini-api/docs/image-generation
4. Gemini model deprecation timeline/changelog: https://ai.google.dev/gemini-api/docs/changelog
5. Gemini video generation docs (Veo): https://ai.google.dev/gemini-api/docs/video
6. Gemini speech generation docs (TTS): https://ai.google.dev/gemini-api/docs/speech-generation
7. Lyria music model overview: https://ai.google.dev/gemini-api/docs/music-generation
