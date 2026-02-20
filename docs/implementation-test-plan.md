# Implementation + Test Plan (Game Repo)

Updated: 2026-02-20

## Scope
Plan for implementing generation-aware runtime behavior in this repo (`monster-mash`) while the asset generation system is built in a separate project.

## Status Snapshot
1. Step 1: Complete (2026-02-15)
2. Step 2: Complete (2026-02-15)
3. Step 3: Complete (2026-02-19)
4. Step 4: Blocked by external asset-service API availability
5. Step 5: Partially blocked
6. Step 6: Mostly blocked
7. Bootstrap world generation + orchestrator bridge: Complete (2026-02-15)
8. Singleplayer/multiplayer runtime parity foundation: Complete (2026-02-15)
9. Input/combat prototype layer (hotbar + click-to-action): Complete (2026-02-15)
10. Camera-mode HUD skin pass (first-person + third-person): Complete (2026-02-15)
11. Voxel chunk + block interaction baseline: Complete (2026-02-15)
12. Max-performance parity architecture decision (Rust+WASM core + Go authority): Complete (2026-02-15)
13. P1 authoritative multiplayer baseline (Go WS + server-confirmed block deltas): Complete (2026-02-15)
14. P2 bootstrap (Rust core crate + web wasm bridge + HUD visibility): In progress (2026-02-15)
15. P2 occupancy-based mesh stats integration (Rust/JS parity path): Complete (2026-02-15)

## Current Execution Track (from CP-0070)
1. Fix core game view + UI/UX scale:
   - correct world scale to Minecraft-like block sizing,
   - ensure camera framing matches expected first/third-person presentation,
   - resize layout so the canvas and HUD feel balanced across viewport sizes.
2. Core gameplay pass:
   - deterministic NPC wander/idle loop shared by client + server,
   - target resolution uses live NPC offsets for combat/interaction range checks,
   - keep deterministic chunk entity generation in sync across client/server.
3. Terrain alignment pass:
   - unify deterministic terrain sampling for voxel chunks + entities + overlay placement,
   - add a heightfield surface mesh for smooth slopes on top of voxels,
   - ensure player movement stays glued to the smooth surface.
4. Maintain the multiplayer-first replication baseline:
   - owner-only fanout for private player state (`inventory_state`, `hotbar_state`, `craft_result`, `container_result`),
   - proximity-scoped snapshots for remote player visibility.
5. Extend deterministic gameplay capture with event-feed cursor snapshots for replay session metadata.
6. Start OpenClaw event-loop hardening: Complete (CP-0076)
   - polling cursor persistence for `/openclaw/events`,
   - bounded directive budget/rate limits at ingress.
7. Keep TDD loop strict for every checkpoint:
   - `cd apps/world-server-go && go test ./...`,
   - `pnpm --filter web test`,
   - `pnpm --filter web lint`,
   - `pnpm --filter web typecheck`,
   - `pnpm --filter web build`.

## Alignment Note
1. \"Agent-managed world\" in this plan means event-driven orchestration, not per-tick LLM simulation.
2. Reference: `docs/agent-managed-world-definition.md`

## Current State (already done)
1. Onboarding flow: `Start -> Gender -> Character -> Enter World`.
2. Deterministic chunk generation in client prototype.
3. First-person and third-person camera modes.
4. Architecture/docs for hybrid voxel + 2D/3D strategy.
5. New worlds are generated per profile (`world.id`, `world.seed`) at character creation.
6. Runtime emits orchestrator world events (`world_session_started`, `player_enter_chunk`) via mock/HTTP client.
7. Shared authoritative runtime protocol is in place for both local and websocket modes.
8. Prototype combat UX exists with hotbar selection (`1-5`/click), click-to-action targeting, and local cooldown/range checks.
9. In-canvas HUD now matches survival/action references with mode-specific first-person and third-person visual overlays.
10. Deterministic voxel chunks with block break/place interactions are integrated in world traversal loop.
11. Max-performance architecture direction is now fixed: Rust/WASM client hot loops + Go authoritative server + OpenClaw Go directives.
12. Go WS server drives authoritative movement snapshots and server-confirmed block deltas in `ws` mode.

## Bootstrap Milestone: Generate World + Enter Game
Owner: game repo

Goal: get to gameplay testing with generated world identity and live orchestration communication hooks before full MMO server rollout.

Status:
1. Complete on 2026-02-15.
2. Implemented in:
   - `apps/web/src/lib/world/world-instance.ts`
   - `apps/web/src/components/StartGameFlow.tsx`
   - `apps/web/src/components/WorldCanvas.tsx`
   - `apps/web/src/lib/orchestrator/*`

Tests:
1. `apps/web/src/lib/world/world-instance.test.ts`
2. `apps/web/src/lib/orchestrator/mock-orchestrator-client.test.ts`

## Parity Milestone: Same Runtime Model For Singleplayer and Multiplayer
Owner: game repo

Goal: both modes use the same simulation contract, with only transport differences.

Status:
1. Complete on 2026-02-15 (foundation phase).
2. Implemented in:
   - `apps/web/src/lib/runtime/protocol.ts`
   - `apps/web/src/lib/runtime/authoritative-sim.ts`
   - `apps/web/src/lib/runtime/local-runtime-client.ts`
   - `apps/web/src/lib/runtime/ws-runtime-client.ts`
   - `apps/web/src/lib/runtime/runtime-client-factory.ts`
   - `apps/web/src/components/WorldCanvas.tsx`

Tests:
1. `apps/web/src/lib/runtime/authoritative-sim.test.ts`

## Playtest Loop
1. Start app: `pnpm --filter web dev`
2. Open `http://localhost:3100`
3. Create character/world in `/start`
4. Enter `/world` and move across chunks
5. Select hotbar slot (`1-5`) and left-click NPC/monster targets to execute attack/cast.
6. Left-click terrain blocks to break; right-click block faces to place.
7. Verify HUD counters:
   - Runtime mode/tick increasing
   - Chunk coordinate changes
   - Orchestrator events increment on chunk entry
   - Combat status updates (target/range/cooldown)
8. Keep this loop as the default iteration path before adding live asset generation.

## One-Command Test + Play
1. Canonical command: `pnpm game:test`
2. This command runs checks first (Go/Rust/web + web build), then launches a playable multiplayer-enabled game session and prints the active URL.
3. Deterministic backtrack commands:
   - export: `pnpm game:dump-state`,
   - import latest export: `pnpm game:load-state`,
   - import specific export: `pnpm game:load-state -- --file data/debug/world-state-<timestamp>.json`.
4. Legacy `play:*` commands are aliases to the same flow.
5. Fallback mode for MM core is opt-in only (`NEXT_PUBLIC_MM_CORE_ALLOW_FALLBACK=true`).

## P1 Visual Validation (Authoritative WS)
1. Run server: `pnpm dev:world-server`
2. Run web with WS runtime:
   - `NEXT_PUBLIC_WORLD_RUNTIME_MODE=ws NEXT_PUBLIC_WORLD_RUNTIME_WS_URL=ws://localhost:8787/ws pnpm --filter web dev`
3. Open two browser windows on `/world`.
4. Validate:
   - movement and runtime tick are live,
   - break/place block edits replicate between windows,
   - HUD status reflects request/replication flow.

## P2 Bootstrap Visual Validation
1. Run: `pnpm game:test`
2. Open `/world`.
3. Validate in HUD:
   - `Mesh Core` is visible and resolves to `wasm`,
   - `Mesh Quads` and `Mesh Verts` show non-zero values in loaded terrain,
   - breaking/placing blocks changes `Mesh Quads` in active chunk.

## Execution Plan

### Step 1: Add runtime contracts in game repo (Unblocked)
Owner: game repo

1. Add shared TypeScript contracts for:
   - `AssetIntent`
   - `AssetVariant`
   - `ChunkManifest`
   - `ManifestPatch`
2. Add an `AssetServiceClient` interface in game code.
3. Keep a local `MockAssetServiceClient` implementation for development.

Status:
1. Complete on 2026-02-15.
2. Implemented in:
   - `apps/web/src/lib/assets/asset-contracts.ts`
   - `apps/web/src/lib/assets/asset-service-client.ts`
   - `apps/web/src/lib/assets/mock-asset-service-client.ts`
   - `apps/web/src/lib/assets/index.ts`

Tests:
1. `pnpm --filter web typecheck` must pass.
2. Contract parsing tests (or runtime guards) for malformed payloads.

### Step 2: Integrate manifest-driven rendering in world scene (Unblocked)
Owner: game repo

1. Split chunk rendering into `base deterministic chunk` + `manifest overlays`.
2. Add per-slot asset IDs for entities in each chunk.
3. Keep Tier 0 placeholders as hard default if manifest is missing.
4. Add hot-swap logic to replace placeholders when a new manifest patch arrives.

Status:
1. Complete on 2026-02-15 using the mock asset service client.
2. Implemented in:
   - `apps/web/src/components/WorldCanvas.tsx`
   - `apps/web/src/lib/assets/manifest-overlay.ts`
   - `apps/web/src/lib/assets/manifest-overlay.test.ts`
   - `apps/web/src/lib/assets/asset-service-runtime.ts`
   - `apps/web/vitest.config.ts`

Tests:
1. Manual: Enter world, traverse chunks, no missing entities if manifest unavailable.
2. Manual: Simulate manifest patch and verify visible hot-swap without reload.
3. Automated overlay state tests pass (`vitest`).
4. Build/lint/typecheck all pass.

### Step 3: Add animation event graph contract (Unblocked)
Owner: game repo

1. Define canonical action events:
   - `idle`, `walk`, `run`, `attack_light`, `attack_heavy`, `cast`, `hit_react`, `death`, `interact`
2. Add deterministic animation state reducer driven by simulation events.
3. Keep current placeholder sprite animations as fallback until skeletal assets exist.

Status:
1. Complete on 2026-02-19.
2. Implemented in:
   - `apps/web/src/lib/runtime/animation-event-graph.ts`
   - `apps/web/src/lib/runtime/animation-event-graph.test.ts`
   - `apps/web/src/components/WorldCanvas.tsx`
   - `apps/web/src/lib/runtime/index.ts`

Tests:
1. Unit: event sequence -> deterministic animation state transitions.
2. Manual: movement/combat mock events produce expected transitions.

### Step 4: Integrate real asset service client (Blocked by asset-generation service)
Owner: both (game + asset service)

Blocked until the external service exposes the API contract in:
`docs/asset-generation-client-server-contract.md`

Game-side implementation after unblock:
1. Replace mock client with HTTP client adapter.
2. Submit chunk prewarm requests on chunk frontier approach.
3. Poll or subscribe for manifest patch updates.
4. Record fallback ratio and patch latency metrics in HUD/dev logs.

Tests:
1. Contract test against staging asset service.
2. Timeout/retry/circuit-breaker behavior.
3. Manual traversal test under simulated provider failures.

### Step 5: Add quality gates and runtime budgets (Partially blocked)
Owner: both

Game-side (unblocked):
1. Enforce per-asset runtime limits (triangles, texture size, memory class).
2. Reject manifest variants that exceed client budgets.

Asset-service side (blocked):
1. Generate LOD and collision metadata.
2. Provide validation status and reject reasons in API responses.

Tests:
1. Inject oversized asset metadata and confirm client rejects promotion.
2. Verify fallback remains visible when promotion is rejected.

### Step 6: End-to-end multiplayer-ready test harness (Mostly blocked)
Owner: both

1. Simulate 100 chunk traversals with prewarm + patch timings.
2. Validate no frame spikes from hot-swap path.
3. Track KPIs:
   - placeholder ratio
   - manifest patch p95 latency
   - asset promotion success rate

Blocked until real asset service exists.

## Explicit Blocker Packet (for external asset generation project)
See:
`docs/asset-generation-client-server-contract.md`

That document specifies:
1. Required endpoints.
2. Request/response JSON.
3. Recipe/model mapping.
4. Animation/skeleton expectations.
5. Performance SLAs and failure semantics.

## Definition Of Done (MVP)
1. Game runs fully with no asset service (placeholders only).
2. Game hot-swaps assets from manifest patches without reloads.
3. Animation selection is deterministic and event-driven.
4. Asset service integration is optional at runtime and resilient to failures.
5. Lint/typecheck/build pass.
