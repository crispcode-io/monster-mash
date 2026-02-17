# OpenClaw Guided Orchestration Layer

Updated: 2026-02-15

## Why This Layer Is Required

Freeform agent behavior is not enough for reliable game construction. The agent needs a strict execution contract, otherwise you get style drift, broken meshes, invalid animations, and chunk latency spikes.

## Main Risks To Expect

1. **Latency spikes**: model inference is too slow for chunk-critical path.
2. **Style drift**: generated assets stop matching your world art direction.
3. **Geometry quality issues**: non-manifold meshes, bad UVs, huge poly counts.
4. **Animation incompatibility**: generated characters do not share a rig/skeleton.
5. **Runtime memory bloat**: too many unique assets per chunk.
6. **Agent nondeterminism**: same request creates different world behavior each run.
7. **Moderation/legal risk**: unsafe or disallowed generated content shipped accidentally.
8. **Economic blowups**: unconstrained generation queues create runaway cost.
9. **Simulation mismatch**: animation timing and gameplay events desync.
10. **Operational fragility**: queue stalls or provider failures stall world enrichment.

## The Guided Layer (required services)

1. **Intent Compiler**
   - Converts OpenClaw high-level decisions into strict `AssetIntent` tasks.
   - Adds hard constraints: modality, triangle budget, texture size, style profile, deadline.

2. **Recipe Resolver**
   - Maps each intent to an approved generation recipe.
   - Example: `imposter_tree -> gemini-2.5-flash-image -> atlas pack -> publish`.

3. **Validation Gate**
   - Technical validation: file format, topology, UVs, LODs, animation clips.
   - Policy validation: moderation, banned tags, provider metadata requirements.

4. **Assembler/Packer**
   - Stitches outputs into runtime bundles (spritesheet, GLB + LODs + collision, animation packs).
   - Emits immutable version hash.

5. **Publisher + Manifest Updater**
   - Writes approved variants to asset registry.
   - Promotes into chunk manifest via versioned patch.

6. **Fallback Controller**
   - Guarantees Tier 0 placeholders if any step fails.

## How To Request Voxel vs 2D vs 3D

Use a strict intent schema. The agent should never call a model directly.

Example `AssetIntent` fields:

1. `intent_id`
2. `asset_class` (`terrain_voxel`, `imposter_2d`, `prop_3d`, `npc_3d`, `animation_clip`, `voice_line`)
3. `style_profile_id` (for example `frontier-v1`)
4. `semantic_tags` (`wooden_watchtower`, `village_common`, `low_fantasy`)
5. `runtime_budget` (`max_tris`, `max_tex_res`, `max_memory_kb`)
6. `animation_contract` (optional; skeleton + required clips)
7. `priority` and `deadline_ms`
8. `chunk_context` (`world_seed`, `chunk_x`, `chunk_z`, biome, faction)

## Model Mapping (practical)

1. `imposter_2d`, `icon_2d`, `decal_2d`: `gemini-2.5-flash-image`.
2. `curated_2d_upgrade`: `gemini-3-pro-image-preview`.
3. `prop_3d_fast`: Hunyuan fast/turbo path.
4. `prop_3d_quality`, `hero_npc_3d`: Hunyuan3D-2.1 quality path.
5. `3d_variant_refine`: TRELLIS image-to-3D refinement.
6. `voice_line`: Gemini TTS models.
7. `video_scene`: Veo models, offline only.

## Do We Need A Separate Stitching Service?

Yes. Keep stitching/packaging separate from model workers.

Reasons:
1. Different responsibilities (generation vs runtime compatibility).
2. Easier retries and deterministic rebuilds.
3. Safer validation boundary before publish.

## Animation Strategy (non-optional)

1. Define one canonical humanoid skeleton contract for player/NPC classes.
2. Store gameplay clips as named actions: `idle`, `walk`, `run`, `attack_light`, `attack_heavy`, `cast`, `hit_react`, `death`, `interact`.
3. Retarget any generated mesh to canonical skeleton before publish.
4. Reject assets missing required clips for their class.
5. Keep animation state machine deterministic and gameplay-driven.

## Who Decides What Animation Plays?

Server-authoritative simulation decides animation events.

1. Sim emits action event (`movement_speed`, `combat_action`, `interaction_state`).
2. Client animation graph maps events to clip/blend trees.
3. Client predicts visually but reconciles to server event stream.

## How OpenClaw Keeps Building The World While Players Explore

OpenClaw should run a deterministic planning loop:

1. Read telemetry and chunk manifests.
2. Detect "content gaps" (placeholder density, biome repetition, quest scarcity).
3. Emit bounded `AssetIntent` jobs from approved recipes only.
4. Prioritize active-player frontier chunks first.
5. Promote only validated assets.
6. Replan on fixed intervals with quota limits.

## Reliability Controls

1. Per-modality quotas and daily cost caps.
2. Provider circuit breakers + fallback provider chain.
3. Intent deduplication by semantic hash.
4. Hard SLA buckets: near-frontier chunks, active hubs, background regions.
5. Full observability: queue age, fail rate, publish latency, placeholder ratio.

## Minimal "Make It Real" MVP

1. Intent compiler + recipe resolver.
2. Tier 0 placeholder library.
3. 2D fast generation path + packer + manifest publish.
4. 3D fast path for a small prop subset.
5. Animation contract and clip-driven player state machine.

If these five are stable, OpenClaw can safely expand the world over time.
