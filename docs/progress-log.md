# Progress Log

Purpose: maintain reversible checkpoints so we can backtrack implementation safely.

## Checkpoint CP-0001 (2026-02-15)

### Completed
1. Refactored onboarding flow to `Start -> Gender -> Character -> Enter World`.
2. Added first-person and third-person camera modes in world exploration.
3. Expanded player profile schema for MMO-style character metadata (class, origin, appearance, camera preference).
4. Added compatibility parsing for legacy profile saves.
5. Added architecture draft for OpenClaw-managed MMO runtime.

### Files touched
1. `apps/web/src/components/StartGameFlow.tsx`
2. `apps/web/src/components/WorldCanvas.tsx`
3. `apps/web/src/components/HomeScreen.tsx`
4. `apps/web/src/components/WorldScreen.tsx`
5. `apps/web/src/lib/game-contracts.ts`
6. `apps/web/src/lib/local-profile-store.ts`
7. `apps/web/src/app/globals.css`
8. `docs/openclaw-mmo-architecture.md`
9. `apps/web/README.md`
10. `README.md`

### Validation
1. `pnpm --filter web lint` passed.
2. `pnpm --filter web typecheck` passed.
3. `pnpm --filter web build` passed.

### Notes
1. Visual direction now targets painterly medieval atmosphere with hybrid sprite/3D world rendering.
2. Current client remains deterministic-chunk prototype, not yet server-authoritative.

---

## Checkpoint CP-0002 (2026-02-15)

### Completed
1. Added concrete asset generation build order and model selection guide.
2. Locked model recommendations to currently active Gemini model names (avoiding deprecated IDs).
3. Added modality-by-modality implementation plan (2D, 3D, sound/voice, video) for the separate generation project.

### Files touched
1. `docs/asset-generation-blueprint.md`
2. `docs/progress-log.md`

### Validation
1. Documentation-only checkpoint.

### Notes
1. Runtime rule remains: generation cannot block chunk loading; placeholders must always exist.
2. First delivery target is a production-safe 2D + fast 3D queue with manifest hot-swap support.

---

## Checkpoint CP-0003 (2026-02-15)

### Completed
1. Added explicit risk register for agent-driven world building.
2. Added guided orchestration layer spec so OpenClaw emits bounded intents instead of freeform generation.
3. Added clear decisions for stitching service ownership, animation contract, and server-authoritative animation triggering.

### Files touched
1. `docs/openclaw-guided-orchestration.md`
2. `docs/progress-log.md`

### Validation
1. Documentation-only checkpoint.

### Notes
1. Core rule reinforced: OpenClaw plans content, but build/publish is executed by strict recipe + validation services.
2. Animation selection must be simulation-driven, with client-side prediction + reconciliation.

---

## Checkpoint CP-0004 (2026-02-15)

### Completed
1. Re-reviewed current game repo structure to anchor next implementation phases.
2. Added concrete implementation/test plan with explicit blocked and unblocked steps.
3. Added client-server contract packet for the external asset generation service, including recipe IDs, API payloads, model mapping, and animation contract.

### Files touched
1. `docs/implementation-test-plan.md`
2. `docs/asset-generation-client-server-contract.md`
3. `docs/progress-log.md`

### Validation
1. Documentation-only checkpoint.

### Notes
1. Integration blocker is now explicitly defined as service API availability, not game-side rendering readiness.
2. Game client should only send recipe IDs and constraints; model/provider details remain server-owned.

---

## Checkpoint CP-0005 (2026-02-15)

### Completed
1. Implemented Step 1 runtime asset contracts in the game repo.
2. Added `AssetServiceClient` abstraction with HTTP adapter and strict response parsing.
3. Added deterministic in-memory mock asset service client for development-time integration.
4. Updated implementation plan status to mark Step 1 complete.

### Files touched
1. `apps/web/src/lib/assets/asset-contracts.ts`
2. `apps/web/src/lib/assets/asset-service-client.ts`
3. `apps/web/src/lib/assets/mock-asset-service-client.ts`
4. `apps/web/src/lib/assets/index.ts`
5. `docs/implementation-test-plan.md`
6. `docs/progress-log.md`

### Validation
1. `pnpm --filter web lint` passed.
2. `pnpm --filter web typecheck` passed.
3. `pnpm --filter web build` passed.

### Notes
1. The game now has a stable client boundary for external asset-service integration.
2. Next unblocked work is Step 2: manifest-driven rendering + hot-swap in world scene.

---

## Checkpoint CP-0006 (2026-02-15)

### Completed
1. Aligned and documented the definition of \"agent-managed world\" for this project.
2. Added explicit runtime split: deterministic simulation vs event-driven orchestrator vs async asset pipeline.
3. Added decision guidance on using picoclaw/OpenClaw with Kimi provider backends.
4. Linked implementation plan to this alignment to avoid per-tick LLM scope creep.

### Files touched
1. `docs/agent-managed-world-definition.md`
2. `docs/implementation-test-plan.md`
3. `docs/progress-log.md`

### Validation
1. Documentation-only checkpoint.

### Notes
1. World simulation remains server-authoritative and deterministic.
2. Orchestrator is event-driven and budget-limited, suitable for 1-12 player scale target.

---

## Checkpoint CP-0007 (2026-02-15)

### Completed
1. Implemented Step 2 with TDD-first flow:
   - wrote failing tests for manifest overlay state transitions,
   - implemented overlay state reducers,
   - integrated runtime chunk overlays with placeholder fallback and patch hot-swap.
2. Added runtime asset client factory (mock by default, HTTP when configured).
3. Added vitest configuration and `web` test script for repeatable TDD cycles.
4. Updated implementation plan to mark Step 2 complete.

### Files touched
1. `apps/web/src/components/WorldCanvas.tsx`
2. `apps/web/src/lib/assets/manifest-overlay.ts`
3. `apps/web/src/lib/assets/manifest-overlay.test.ts`
4. `apps/web/src/lib/assets/asset-service-runtime.ts`
5. `apps/web/src/lib/assets/index.ts`
6. `apps/web/package.json`
7. `apps/web/vitest.config.ts`
8. `docs/implementation-test-plan.md`
9. `docs/progress-log.md`

### Validation
1. `pnpm --filter web test` passed.
2. `pnpm --filter web lint` passed.
3. `pnpm --filter web typecheck` passed.
4. `pnpm --filter web build` passed.

### Notes
1. Chunk overlays now render deterministic placeholders first, then hot-swap from manifest updates.
2. External asset-service integration remains optional and non-blocking.

---

## Checkpoint CP-0008 (2026-02-15)

### Completed
1. Added profile-scoped world generation (`world.id`, `world.seed`) at character creation so each run can enter a generated world identity.
2. Updated chunk generation and asset-intent/manifest calls to use profile world seed instead of a single global seed constant.
3. Added orchestrator client boundary (mock/HTTP runtime factory) and integrated world events from gameplay:
   - `world_session_started`
   - `player_enter_chunk`
4. Added gameplay-visible orchestrator HUD counters for event/directive flow.
5. Added tests for world-instance generation and orchestrator mock behavior.

### Files touched
1. `apps/web/src/lib/game-contracts.ts`
2. `apps/web/src/lib/local-profile-store.ts`
3. `apps/web/src/lib/world/world-instance.ts`
4. `apps/web/src/lib/world/world-instance.test.ts`
5. `apps/web/src/lib/world/chunk-generator.ts`
6. `apps/web/src/components/StartGameFlow.tsx`
7. `apps/web/src/components/HomeScreen.tsx`
8. `apps/web/src/components/WorldScreen.tsx`
9. `apps/web/src/components/WorldCanvas.tsx`
10. `apps/web/src/lib/orchestrator/orchestrator-contracts.ts`
11. `apps/web/src/lib/orchestrator/orchestrator-client.ts`
12. `apps/web/src/lib/orchestrator/mock-orchestrator-client.ts`
13. `apps/web/src/lib/orchestrator/mock-orchestrator-client.test.ts`
14. `apps/web/src/lib/orchestrator/orchestrator-runtime.ts`
15. `apps/web/src/lib/orchestrator/index.ts`
16. `docs/implementation-test-plan.md`
17. `docs/progress-log.md`
18. `apps/web/package.json`
19. `apps/web/tsconfig.json`

### Validation
1. `pnpm --filter web test` passed.
2. `pnpm --filter web lint` passed.
3. `pnpm --filter web typecheck` passed (`next typegen && tsc --noEmit`).
4. `pnpm --filter web build` passed.

### Notes
1. This is still not authoritative multiplayer server logic; it is gameplay bootstrap for world generation + orchestration communication.
2. Next major milestone is authoritative server loop with client/server protocol tests.

---

## Checkpoint CP-0009 (2026-02-15)

### Completed
1. Added shared runtime protocol and authoritative simulation core to unify singleplayer/multiplayer behavior.
2. Added local runtime client (authoritative loop in-browser) and websocket runtime client adapter (transport boundary for multiplayer server integration).
3. Refactored world movement in `WorldCanvas` to run through runtime client inputs/snapshots instead of direct local position mutation.
4. Added runtime HUD counters (mode/tick) for live gameplay iteration and verification.
5. Added authoritative simulation determinism tests.
6. Added playtest-loop guidance to implementation plan.

### Files touched
1. `apps/web/src/lib/runtime/protocol.ts`
2. `apps/web/src/lib/runtime/authoritative-sim.ts`
3. `apps/web/src/lib/runtime/authoritative-sim.test.ts`
4. `apps/web/src/lib/runtime/local-runtime-client.ts`
5. `apps/web/src/lib/runtime/ws-runtime-client.ts`
6. `apps/web/src/lib/runtime/runtime-client-factory.ts`
7. `apps/web/src/lib/runtime/index.ts`
8. `apps/web/src/components/WorldCanvas.tsx`
9. `docs/implementation-test-plan.md`
10. `docs/progress-log.md`

### Validation
1. `pnpm --filter web test` passed (8 tests).
2. `pnpm --filter web lint` passed.
3. `pnpm --filter web typecheck` passed.
4. `pnpm --filter web build` passed.

### Notes
1. Multiplayer transport is still adapter-only; authoritative dedicated server process remains next.
2. Gameplay iteration can now validate runtime/orchestrator behavior through HUD metrics before server extraction.

---

## Checkpoint CP-0010 (2026-02-15)

### Completed
1. Captured a continuation checkpoint so implementation can resume from current runtime/orchestrator baseline without losing context.
2. Updated the implementation plan with a concrete \"next execution track\" for TDD-first progression.
3. Standardized local web runtime port to `3100` for both `dev` and `start` scripts and aligned docs.

### Files touched
1. `docs/progress-log.md`
2. `docs/implementation-test-plan.md`
3. `apps/web/README.md`

### Validation
1. Verified `apps/web/package.json` scripts use:
   - `next dev -p 3100`
   - `next start -p 3100`
2. Verified no remaining `localhost:3000` references in repo docs/code.

### Notes
1. This checkpoint is planning/documentation alignment; gameplay/runtime behavior is unchanged.
2. Next build target remains authoritative dedicated server extraction while preserving local-runtime playtest loop.

---

## Checkpoint CP-0011 (2026-02-15)

### Completed
1. Added a gameplay-input checkpoint for MMO-style controls before server extraction.
2. Swapped `A/D` strafe directions as requested (`A=right`, `D=left`).
3. Added click-to-action combat loop:
   - left click resolves target via raycast/ground proximity,
   - selected hotbar slot executes attack/cast/item action,
   - range and cooldown are enforced client-side.
4. Added a taskbar/hotbar UI with slot selection (`1-5` keys or click), active slot state, cooldown feedback, and combat status log.

### Files touched
1. `apps/web/src/components/WorldCanvas.tsx`
2. `apps/web/src/app/globals.css`
3. `docs/progress-log.md`
4. `docs/implementation-test-plan.md`

### Validation
1. `pnpm --filter web test`
2. `pnpm --filter web lint`
3. `pnpm --filter web typecheck`

### Notes
1. This is a prototype interaction layer; authoritative combat resolution is still a server-side milestone.
2. Current target selection is static-entity based (NPC/monster sprites in loaded chunks) and intended for iteration speed.

---

## Checkpoint CP-0012 (2026-02-15)

### Completed
1. Reworked in-world gameplay HUD to match requested references:
   - first-person: center crosshair, hearts + centered hotbar, right-side held-weapon silhouette, stronger vignette.
   - third-person: same survival HUD language with cleaner overlay treatment.
2. Moved taskbar interaction into the in-canvas overlay (instead of only side panel) so combat selection matches MMO/survival play flow.
3. Kept diagnostics panel for development while making gameplay HUD visually primary.

### Files touched
1. `apps/web/src/components/WorldCanvas.tsx`
2. `apps/web/src/app/globals.css`
3. `docs/progress-log.md`
4. `docs/implementation-test-plan.md`

### Validation
1. `pnpm --filter web lint` passed.
2. `pnpm --filter web typecheck` passed.
3. `pnpm --filter web test` passed.

### Notes
1. HUD now differentiates visual treatment by camera mode without changing simulation/runtime contracts.
2. Next milestone remains authoritative server extraction for multiplayer parity.

---

## Checkpoint CP-0013 (2026-02-15)

### Completed
1. Added a new voxel-world runtime module for deterministic chunk generation with mutable block state.
2. Added voxel world tests (determinism, block placement/removal, coordinate conversion).
3. Integrated voxel chunk rendering into `WorldCanvas` using `THREE.InstancedMesh` for web performance.
4. Added Minecraft-style block interaction loop:
   - left click: attack target if present, otherwise break voxel block,
   - right click: place adjacent voxel block.
5. Preserved existing hotbar/combat flow while layering in block edit interactions.
6. Added explicit Minosoft-to-web parity program doc to guide staged feature migration.

### Files touched
1. `apps/web/src/lib/voxel/voxel-world.ts`
2. `apps/web/src/lib/voxel/voxel-world.test.ts`
3. `apps/web/src/lib/voxel/index.ts`
4. `apps/web/src/components/WorldCanvas.tsx`
5. `docs/progress-log.md`
6. `docs/implementation-test-plan.md`
7. `docs/minosoft-web-parity-plan.md`

### Validation
1. `pnpm --filter web lint` passed.
2. `pnpm --filter web typecheck` passed.
3. `pnpm --filter web test` passed (11 tests total).

### Notes
1. This is the first parity slice toward Minecraft-like feel, not a full Minosoft-equivalent feature port.
2. Next parity steps are server-authoritative block simulation + protocol/event compatibility layer for agent orchestration.

---

## Checkpoint CP-0014 (2026-02-15)

### Completed
1. Locked architecture for maximum web performance under your constraints:
   - Rust for low-level core,
   - WebAssembly for client hot loops,
   - Go for authoritative multiplayer server and OpenClaw integration.
2. Added a full staged parity program for Minecraft-like behavior with Skyrim/Oblivion-style exploration presentation.
3. Defined strict OpenClaw Go contract boundaries (event-driven directives, no per-tick LLM simulation).
4. Added hard performance budgets and phase exit criteria to prevent scope drift.
5. Updated implementation execution track to prioritize authoritative server + protocol + WASM meshing ABI.

### Files touched
1. `docs/max-performance-parity-plan.md`
2. `docs/minosoft-web-parity-plan.md`
3. `docs/implementation-test-plan.md`
4. `docs/progress-log.md`

### Validation
1. Documentation checkpoint (planning update).

### Notes
1. This checkpoint is an execution architecture lock so implementation decisions stay consistent with max-performance goals.
2. Immediate coding priority remains authoritative server extraction and server-confirmed block delta flow.

---

## Checkpoint CP-0015 (2026-02-15)

### Completed
1. Delivered P1 authoritative multiplayer baseline:
   - added Go websocket world server with authoritative tick loop,
   - server now owns movement snapshots and block action validation.
2. Extended runtime client protocol to support block action submission + block delta subscriptions.
3. Updated WS runtime client to parse envelope messages:
   - `snapshot`
   - `block_delta`
4. Updated `WorldCanvas` block loop to use runtime block actions and apply server deltas (instead of direct local-only mutation in ws mode).
5. Added dev script for starting the Go world server.
6. Updated parity and implementation plans with explicit P1 visual validation procedure.

### Files touched
1. `apps/world-server-go/go.mod`
2. `apps/world-server-go/go.sum`
3. `apps/world-server-go/cmd/world-server/main.go`
4. `apps/web/src/lib/runtime/protocol.ts`
5. `apps/web/src/lib/runtime/local-runtime-client.ts`
6. `apps/web/src/lib/runtime/ws-runtime-client.ts`
7. `apps/web/src/components/WorldCanvas.tsx`
8. `package.json`
9. `docs/max-performance-parity-plan.md`
10. `docs/implementation-test-plan.md`
11. `docs/progress-log.md`

### Validation
1. `cd apps/world-server-go && go test ./...` passed.
2. `pnpm --filter web lint` passed.
3. `pnpm --filter web typecheck` passed.
4. `pnpm --filter web test` passed (11 tests).
5. Manual startup check: `pnpm dev:world-server` reaches listening state on `:8787`.

### Visual test (P1)
1. Terminal A: `pnpm dev:world-server`
2. Terminal B:
   - `NEXT_PUBLIC_WORLD_RUNTIME_MODE=ws NEXT_PUBLIC_WORLD_RUNTIME_WS_URL=ws://localhost:8787/ws pnpm --filter web dev`
3. Open two windows at `http://localhost:3100/world`
4. Verify:
   - movement updates with server tick,
   - block break/place replicates across both windows,
   - HUD status updates during block requests.

### Notes
1. This is baseline P1 authority flow for local development, not final production sharding/persistence.
2. Next phase to implement is P2 (Rust/WASM mesh/culling performance core).

---

## Checkpoint CP-0016 (2026-02-15)

### Completed
1. Added one-command test+play scripts so validation commands always launch a playable session:
   - `pnpm play:test:singleplayer`
   - `pnpm play:test:server`
2. Added one-command play scripts (no pre-checks):
   - `pnpm play:singleplayer`
   - `pnpm play:server`
3. Added auto-port selection in run scripts to reduce local port conflicts.
4. Started P2 bootstrap by adding Rust core crate `mm-core-rs` with initial ABI exports.
5. Added web wasm bridge module with fallback-js mode so the ABI boundary is live immediately.
6. Exposed mesh-core mode and mesh stat counters in world HUD for visual verification.
7. Updated runbooks/docs for the new single-command gameplay validation flow.

### Files touched
1. `scripts/play-singleplayer.mjs`
2. `scripts/play-server.mjs`
3. `package.json`
4. `apps/mm-core-rs/Cargo.toml`
5. `apps/mm-core-rs/src/lib.rs`
6. `apps/mm-core-rs/README.md`
7. `apps/web/src/lib/wasm/mm-core-bridge.ts`
8. `apps/web/src/lib/wasm/index.ts`
9. `apps/web/src/components/WorldCanvas.tsx`
10. `README.md`
11. `apps/web/README.md`
12. `docs/max-performance-parity-plan.md`
13. `docs/implementation-test-plan.md`
14. `docs/progress-log.md`

### Validation
1. `pnpm --filter web lint` passed.
2. `pnpm --filter web typecheck` passed.
3. `pnpm --filter web test` passed.
4. `cd apps/world-server-go && go test ./...` passed.
5. `pnpm play:test:singleplayer` runs checks and launches playable web session.
6. `pnpm play:test:server` runs checks and launches server + playable web session.

### Notes
1. Current wasm bridge is intentionally fallback mode until rust toolchain + wasm build artifact pipeline is wired in.
2. Next P2 milestone is loading real wasm outputs from `mm-core-rs` in the browser path.

---

## Checkpoint CP-0017 (2026-02-15)

### Completed
1. Unified gameplay testing to one multiplayer-enabled command:
   - `pnpm game:test` (checks + playable run),
   - `pnpm game:play` (playable run only).
2. Mapped legacy play aliases to the same multiplayer flow to remove singleplayer/multiplayer split in testing.
3. Wired Rust core checks into gameplay test flow (`cargo test` in `game:test`).
4. Added wasm build script (`pnpm wasm:build`) and runtime loader that attempts real wasm first, then falls back to JS if artifact is missing.
5. Removed now-obsolete singleplayer runner script to keep test surface focused.

### Files touched
1. `package.json`
2. `scripts/play-server.mjs`
3. `scripts/build-mm-core-wasm.mjs`
4. `apps/web/src/lib/wasm/mm-core-bridge.ts`
5. `README.md`
6. `apps/web/README.md`
7. `docs/implementation-test-plan.md`
8. `docs/max-performance-parity-plan.md`
9. `docs/progress-log.md`
10. `scripts/play-singleplayer.mjs` (deleted)

### Validation
1. `cd apps/mm-core-rs && cargo test` passed.
2. `pnpm game:test` runs:
   - Go tests,
   - Rust tests,
   - web lint/typecheck/tests,
   - launches world server + web game session.
3. `pnpm wasm:build` currently falls back with warning when `wasm32-unknown-unknown` target is unavailable.

### Notes
1. Gameplay testing now has one canonical multiplayer command, as requested.
2. Next P2 step is enabling actual wasm artifact production by installing/configuring the wasm32 Rust target and then promoting runtime mode from fallback-js to wasm.

---

## Checkpoint CP-0018 (2026-02-15)

### Completed
1. Resolved wasm target blocker by bootstrapping rustup-managed target installation path and validating wasm builds.
2. Updated wasm build script to:
   - detect rustup in common Homebrew and PATH locations,
   - ensure `wasm32-unknown-unknown` target is installed,
   - build with rustup-managed `rustc`/`cargo` so target stdlib is found reliably.
3. Confirmed wasm artifact generation at:
   - `apps/web/public/wasm/mm_core_rs.wasm`
4. Verified `pnpm game:test` now runs checks, builds wasm artifact, and launches multiplayer gameplay in one command.
5. Updated docs and validation notes to use HUD signal `Mesh Core: wasm` as P2 visual gate.

### Files touched
1. `.gitignore`
2. `scripts/build-mm-core-wasm.mjs`
3. `README.md`
4. `docs/implementation-test-plan.md`
5. `docs/max-performance-parity-plan.md`
6. `docs/progress-log.md`

### Validation
1. `cd apps/mm-core-rs && cargo test` passed.
2. `pnpm wasm:build` succeeded and emitted `apps/web/public/wasm/mm_core_rs.wasm`.
3. `pnpm game:test` succeeded:
   - Go tests,
   - Rust tests,
   - wasm build,
   - web lint/typecheck/tests,
   - world server + web gameplay launch.

### Notes
1. We keep fallback-js runtime for resilience, but wasm path is now operational.
2. Next P2 step is replacing placeholder mesh stats with real wasm meshing output and measuring frame-time deltas.

---

## Checkpoint CP-0019 (2026-02-15)

### Completed
1. Replaced chunk mesh HUD stats from block-count heuristic to occupancy-based exposed-face stats.
2. Added voxel occupancy buffer builder for deterministic chunk-level Rust/JS stat parity.
3. Wired `WorldCanvas` mesh stats to call `getChunkMeshStatsFromOccupancy(...)` from wasm bridge.
4. Added TDD coverage for:
   - occupancy buffer generation,
   - exposed-face mesh stat calculations.
5. Cleaned Rust core warning in occupancy helpers.
6. Hardened `pnpm game:test` startup reliability by adding explicit web production build before `next start`.

### Files touched
1. `apps/web/src/components/WorldCanvas.tsx`
2. `apps/web/src/lib/voxel/voxel-world.ts`
3. `apps/web/src/lib/voxel/voxel-world.test.ts`
4. `apps/web/src/lib/wasm/mm-core-bridge.test.ts`
5. `apps/mm-core-rs/src/lib.rs`
6. `docs/implementation-test-plan.md`
7. `docs/max-performance-parity-plan.md`
8. `docs/progress-log.md`
9. `scripts/play-server.mjs`

### Validation
1. `cd apps/mm-core-rs && cargo test` passed.
2. `pnpm --filter web lint` passed.
3. `pnpm --filter web typecheck` passed.
4. `pnpm --filter web test` passed (includes new wasm + voxel tests).
5. `pnpm wasm:build` succeeded and emitted `apps/web/public/wasm/mm_core_rs.wasm`.
6. `pnpm game:test` completed checks and launched playable multiplayer session:
   - World server `ws://localhost:8791/ws`
   - Web client `http://localhost:3101`
   - includes `pnpm --filter web build` before launch to avoid missing-build and dev-lock issues.

### Notes
1. `pnpm game:test` is intentionally long-running after startup; local stop via `Ctrl+C`.
2. P2 remains in progress until full mesh buffer extraction is served from Rust (not only stats ABI).

---

## Checkpoint CP-0020 (2026-02-15)

### Completed
1. Enforced deterministic strict mode for MM core initialization:
   - wasm runtime required by default,
   - no implicit fallback path.
2. Added explicit fallback policy gate:
   - only enabled via `NEXT_PUBLIC_MM_CORE_ALLOW_FALLBACK=true`.
3. Gated world scene startup on successful MM core initialization and added blocking UI for init failure.
4. Updated one-command multiplayer test flow to use strict wasm build (no optional mode in `game:test`).
5. Added wasm bridge tests for strict init policy and fallback opt-in behavior.

### Files touched
1. `apps/web/src/lib/wasm/mm-core-bridge.ts`
2. `apps/web/src/lib/wasm/mm-core-bridge.test.ts`
3. `apps/web/src/components/WorldCanvas.tsx`
4. `apps/web/src/app/globals.css`
5. `scripts/play-server.mjs`
6. `package.json`
7. `README.md`
8. `docs/implementation-test-plan.md`
9. `docs/max-performance-parity-plan.md`
10. `docs/progress-log.md`

### Validation
1. `pnpm --filter web lint` passed.
2. `pnpm --filter web typecheck` passed.
3. `pnpm --filter web test` passed (15 tests).
4. `pnpm game:test` passed checks and launched multiplayer gameplay session with wasm artifact build.

### Notes
1. Optional fallback command still exists for explicit emergency use: `pnpm wasm:build:optional`.
2. Default path is strict wasm across gameplay validation and startup.

---

## Checkpoint CP-0021 (2026-02-15)

### Completed
1. Implemented full Rust mesh extraction ABI in `mm_core_rs` for deterministic voxel occupancy meshing.
2. Added wasm exports for:
   - vertex/index count,
   - positions extraction,
   - normals extraction,
   - UV extraction,
   - index extraction.
3. Upgraded wasm bridge to expose runtime-level `getChunkMeshBuffersFromOccupancy(...)`.
4. Added/extended TDD coverage for bridge mesh-buffer extraction.
5. Verified strict deterministic path still passes and boots in multiplayer run.

### Files touched
1. `apps/mm-core-rs/src/lib.rs`
2. `apps/web/src/lib/wasm/mm-core-bridge.ts`
3. `apps/web/src/lib/wasm/mm-core-bridge.test.ts`
4. `docs/implementation-test-plan.md`
5. `docs/max-performance-parity-plan.md`
6. `docs/progress-log.md`

### Validation
1. `cd apps/mm-core-rs && cargo test` passed (6 tests).
2. `pnpm --filter web lint` passed.
3. `pnpm --filter web typecheck` passed.
4. `pnpm --filter web test` passed (16 tests).
5. `pnpm wasm:build` passed and emitted `apps/web/public/wasm/mm_core_rs.wasm`.
6. `pnpm game:test` passed checks/build and launched multiplayer gameplay session.

### Notes
1. P2.1 is complete at API level; next milestone is worker integration plus rendering consumption of extracted mesh buffers.

---

## Checkpoint CP-0022 (2026-02-15)

### Completed
1. Added MM core mesh worker protocol and worker implementation for asynchronous chunk mesh extraction.
2. Added worker client bridge for request/response correlation and typed buffer reconstruction.
3. Integrated worker extraction requests into `WorldCanvas` chunk render pipeline.
4. Chunk HUD mesh stats now refresh from worker extraction responses (off main thread), with deterministic strict wasm runtime still enforced.
5. Re-validated complete one-command multiplayer flow.

### Files touched
1. `apps/web/src/lib/wasm/mm-core-mesh-worker-protocol.ts`
2. `apps/web/src/lib/wasm/mm-core-mesh-worker.ts`
3. `apps/web/src/lib/wasm/mm-core-mesh-worker-client.ts`
4. `apps/web/src/components/WorldCanvas.tsx`
5. `docs/implementation-test-plan.md`
6. `docs/max-performance-parity-plan.md`
7. `docs/progress-log.md`

### Validation
1. `pnpm --filter web lint` passed.
2. `pnpm --filter web typecheck` passed.
3. `pnpm --filter web test` passed.
4. `cd apps/mm-core-rs && cargo test` passed.
5. `pnpm game:test` passed checks/build and launched multiplayer gameplay session.

### Notes
1. Instanced voxel visual render path is still active; worker currently powers async mesh extraction stats path.
2. Next P2 slice is direct consumption of worker mesh buffers in render geometry plus perf counters.

---

## Checkpoint CP-0023 (2026-02-15)

### Completed
1. Fixed runtime initialization regression where stale/missing wasm artifacts could trigger strict-mode startup failure.
2. Updated gameplay run command path so `pnpm game:play` always performs strict wasm prebuild before startup.
3. Updated root `pnpm dev` to prebuild wasm before launching web dev server.
4. Aligned README notes with strict prebuild behavior.

### Files touched
1. `scripts/play-server.mjs`
2. `package.json`
3. `README.md`
4. `docs/progress-log.md`

### Validation
1. `pnpm game:play` now prebuilds wasm and launches cleanly.
2. `pnpm game:test` still passes and launches multiplayer gameplay session.

### Notes
1. This removes the common failure mode where updated JS expected newer wasm exports than the on-disk artifact.

---

## Checkpoint CP-0024 (2026-02-15)

### Completed
1. Hardened wasm fetch/instantiation path:
   - fixed streaming fallback to use cloned response body,
   - resolved wasm URL relative to runtime location (base-path safe),
   - added optional wasm URL override env (`NEXT_PUBLIC_MM_CORE_WASM_URL`).
2. Prevented non-critical mesh worker extraction errors from hard-failing world startup; worker errors now surface in HUD error field.
3. Stabilized `game:play` runtime mode:
   - now uses `next build` + `next start` instead of `next dev`,
   - avoids `.next/dev/lock` conflicts and stale dev-session behavior.
4. Verified runtime artifact served by web server:
   - `/wasm/mm_core_rs.wasm` returns `200` with `application/wasm`,
   - export list includes required mesh extraction symbols.

### Files touched
1. `apps/web/src/lib/wasm/mm-core-bridge.ts`
2. `apps/web/src/lib/wasm/mm-core-mesh-worker.ts`
3. `apps/web/src/components/WorldCanvas.tsx`
4. `scripts/play-server.mjs`
5. `docs/progress-log.md`

### Validation
1. `pnpm --filter web lint` passed.
2. `pnpm --filter web typecheck` passed.
3. `pnpm --filter web test` passed.
4. `pnpm game:play` launched successfully with strict wasm prebuild and production web runtime.

---

## Checkpoint CP-0025 (2026-02-15)

### Completed
1. Fixed worker-context wasm URL resolution for blob/worker runtime contexts:
   - fallback to `location.origin` path when `location.protocol === "blob:"`,
   - continue supporting `NEXT_PUBLIC_MM_CORE_WASM_URL` override.
2. Kept orchestrator error channel clean by moving mesh worker failures to dedicated mesh HUD field (`Mesh Worker Error`).
3. Revalidated strict production play flow after fix.

### Files touched
1. `apps/web/src/lib/wasm/mm-core-bridge.ts`
2. `apps/web/src/components/WorldCanvas.tsx`
3. `docs/progress-log.md`

### Validation
1. `pnpm --filter web lint` passed.
2. `pnpm --filter web typecheck` passed.
3. `pnpm --filter web test` passed.
4. `pnpm game:play` built and launched successfully.

---

## Checkpoint CP-0026 (2026-02-15)

### Completed
1. Switched visible chunk terrain rendering to consume worker-extracted wasm mesh buffers (`positions/normals/uvs/indices`).
2. Kept block break/place interaction stable by retaining an invisible instanced pick mesh for raycast + instance mapping.
3. Added chunk vertex color generation for wasm mesh-buffer render material to improve terrain readability.
4. Updated execution plans to reflect P2.3 integration progress.

### Files touched
1. `apps/web/src/components/WorldCanvas.tsx`
2. `docs/implementation-test-plan.md`
3. `docs/max-performance-parity-plan.md`
4. `docs/progress-log.md`

### Validation
1. `pnpm --filter web lint` passed.
2. `pnpm --filter web typecheck` passed.
3. `pnpm --filter web test` passed.
4. `cd apps/mm-core-rs && cargo test` passed.
5. `pnpm game:play` built and launched successfully.

### Notes
1. This is a transition state: render geometry is wasm worker-driven, but picking still uses hidden instanced blocks for reliable interaction.
2. Next pass should tune visuals/materials and add mesh timing counters so we can quantify gains.

---

## Checkpoint CP-0027 (2026-02-15)

### Completed
1. Added mesh performance counters in world HUD:
   - `Mesh Extract ms`,
   - `Mesh Upload ms`,
   - rolling averages for both timings.
2. Hardened root `.gitignore` with additional local runtime/temp and test-report artifact rules.
3. Revalidated strict build + gameplay boot after these updates.

### Files touched
1. `apps/web/src/components/WorldCanvas.tsx`
2. `.gitignore`
3. `docs/progress-log.md`

### Validation
1. `pnpm --filter web lint` passed.
2. `pnpm --filter web typecheck` passed.
3. `pnpm --filter web test` passed.
4. `cd apps/mm-core-rs && cargo test` passed.
5. `pnpm game:play` built and launched successfully.

### Notes
1. P2.5 baseline instrumentation is now in place; next iteration can add percentile tracking and per-chunk timing breakdown.

---

## Checkpoint CP-0028 (2026-02-16)

### Completed
1. Made authoritative Go server block-delta replay deterministic by sorting outgoing delta lists by position/action.
2. Added Go tests to lock ordering behavior and stability across repeated replay calls.
3. Hardened websocket runtime snapshot handling in web client:
   - ignores stale tick snapshots,
   - ignores world-seed mismatched snapshots,
   - ignores malformed envelopes instead of resetting runtime state.
4. Added websocket runtime client tests with a fake socket for monotonic snapshot replay and block-delta forwarding.
5. Updated parity/implementation plans to reflect completion of this protocol determinism slice.

### Files touched
1. `apps/world-server-go/cmd/world-server/main.go`
2. `apps/world-server-go/cmd/world-server/main_test.go`
3. `apps/web/src/lib/runtime/ws-runtime-client.ts`
4. `apps/web/src/lib/runtime/ws-runtime-client.test.ts`
5. `docs/max-performance-parity-plan.md`
6. `docs/implementation-test-plan.md`
7. `docs/progress-log.md`

### Validation
1. `cd apps/world-server-go && go test ./...` passed.
2. `pnpm --filter web test` passed (20 tests).
3. `pnpm --filter web lint` passed.
4. `pnpm --filter web typecheck` passed.

### Notes
1. This closes P2 protocol determinism baseline for snapshot monotonicity and block-delta replay ordering.
2. Next step is reconnect/session-resume replay tests plus deeper mesh timing telemetry.

---

## Checkpoint CP-0029 (2026-02-16)

### Completed
1. Added websocket runtime reconnect loop with bounded retry delay.
2. Added session-state replay on reconnect:
   - replays `join` envelopes for active players,
   - replays latest `input` state per player.
3. Added websocket tests for:
   - reconnect + session replay,
   - queued join replay when socket opens from connecting state.
4. Revalidated full local quality gates after reconnect behavior changes.

### Files touched
1. `apps/web/src/lib/runtime/ws-runtime-client.ts`
2. `apps/web/src/lib/runtime/ws-runtime-client.test.ts`
3. `docs/max-performance-parity-plan.md`
4. `docs/implementation-test-plan.md`
5. `docs/progress-log.md`

### Validation
1. `pnpm --filter web test` passed (22 tests).
2. `pnpm --filter web lint` passed.
3. `pnpm --filter web typecheck` passed.
4. `pnpm --filter web build` passed.
5. `cd apps/world-server-go && go test ./...` passed.

### Notes
1. Multiplayer client now has baseline resilience to transient websocket drops.
2. Next step is gameplay-harness disconnect/reconnect coverage under active world interaction.

---

## Checkpoint CP-0030 (2026-02-16)

### Completed
1. Added Go websocket integration test harness for gameplay continuity:
   - join + movement input,
   - block place action replication,
   - disconnect + reconnect,
   - resumed movement and persistent block delta state after reconnect.
2. Updated server reconnect semantics to preserve player state across transient disconnects:
   - `removeClient` now clears input without dropping player state,
   - `handleJoin` reuses existing player state instead of resetting coordinates.
3. Extracted websocket handler construction into `buildWSHandler(...)` for testability.
4. Added mesh telemetry utility module with unit tests:
   - rolling sample tracking with bounded buffer,
   - global averages + p95,
   - per-chunk timing averages.
5. Wired telemetry rollups into world HUD:
   - `Mesh Extract/Upload P95`,
   - `Active Chunk Extract/Upload Avg`,
   - `Mesh Tracked Chunks`.
6. Updated execution plans to reflect completion of gameplay reconnect harness and percentile timing slice.

### Files touched
1. `apps/world-server-go/cmd/world-server/main.go`
2. `apps/world-server-go/cmd/world-server/ws_integration_test.go`
3. `apps/web/src/lib/perf/mesh-timing.ts`
4. `apps/web/src/lib/perf/mesh-timing.test.ts`
5. `apps/web/src/components/WorldCanvas.tsx`
6. `docs/max-performance-parity-plan.md`
7. `docs/implementation-test-plan.md`
8. `docs/progress-log.md`

### Validation
1. `cd apps/world-server-go && go test ./...` passed.
2. `pnpm --filter web test` passed (25 tests).
3. `pnpm --filter web lint` passed.
4. `pnpm --filter web typecheck` passed.
5. `pnpm --filter web build` passed.

### Notes
1. Multiplayer reconnect behavior is now covered by integration tests, not just unit-level socket mocks.
2. P2 telemetry now includes percentile/per-chunk breakdowns needed for performance tuning decisions.

---

## Checkpoint CP-0031 (2026-02-16)

### Completed
1. Removed hidden instanced voxel pick mesh dependency for interaction and switched to visible terrain mesh surface hit mapping.
2. Added voxel mapping helpers and tests:
   - `worldPoint -> local voxel`,
   - surface-hit break/place resolution with dominant-axis normals and adjacency handling.
3. Added runtime protocol support for authoritative combat actions/results.
4. Added websocket/local runtime client combat channels:
   - client `combat_action` submission,
   - `combat_result` subscription parsing and dispatch.
5. Added Go authoritative combat baseline:
   - per-slot cooldown validation by server tick,
   - invalid payload/player/slot rejection reasons,
   - cooldown remaining milliseconds for rejected actions.
6. Integrated gameplay combat flow to request server authority and update HUD from confirmed combat results.
7. Stabilized web typecheck command by removing stale TypeScript build cache prior to `tsc`.

### Files touched
1. `apps/web/src/components/WorldCanvas.tsx`
2. `apps/web/src/lib/voxel/voxel-world.ts`
3. `apps/web/src/lib/voxel/voxel-world.test.ts`
4. `apps/web/src/lib/runtime/protocol.ts`
5. `apps/web/src/lib/runtime/local-runtime-client.ts`
6. `apps/web/src/lib/runtime/ws-runtime-client.ts`
7. `apps/web/src/lib/runtime/ws-runtime-client.test.ts`
8. `apps/web/package.json`
9. `apps/web/tsconfig.json`
10. `apps/world-server-go/cmd/world-server/main.go`
11. `apps/world-server-go/cmd/world-server/main_test.go`
12. `docs/max-performance-parity-plan.md`
13. `docs/implementation-test-plan.md`
14. `docs/progress-log.md`

### Validation
1. `pnpm --filter web test` passed (28 tests).
2. `pnpm --filter web lint` passed.
3. `pnpm --filter web typecheck` passed.
4. `pnpm --filter web build` passed.
5. `cd apps/world-server-go && go test ./...` passed.

### Notes
1. Combat is now authoritative at contract/cooldown level; target validity is still client-assisted and should be server-resolved next.
2. Interaction path no longer relies on hidden geometry for block break/place selection.

---

## Checkpoint CP-0032 (2026-02-16)

### Completed
1. Added OpenClaw event bus skeleton in Go world server with bounded deterministic ingestion:
   - `POST /openclaw/directives`
   - `GET /openclaw/events?since=<seq>`
2. Added directive guardrails:
   - allowlist-only directive types,
   - world-seed mismatch rejection,
   - duplicate-id dedupe handling,
   - queue-size limits and TTL clamping/expiry.
3. Added safe-boundary directive application in authoritative tick loop (no direct physics/block mutation path).
4. Added world event recording pipeline (sequence + retention):
   - player join/leave,
   - block placed/broken,
   - combat confirmed/rejected,
   - directive queued/applied/expired.
5. Added Go tests for:
   - combat slot cooldown validation and rejection paths,
   - directive guardrails and application to world flags,
   - directive/event HTTP handlers.

### Files touched
1. `apps/world-server-go/cmd/world-server/main.go`
2. `apps/world-server-go/cmd/world-server/main_test.go`
3. `docs/max-performance-parity-plan.md`
4. `docs/implementation-test-plan.md`
5. `docs/progress-log.md`

### Validation
1. `cd apps/world-server-go && go test ./...` passed.
2. `pnpm --filter web test` passed (28 tests).
3. `pnpm --filter web lint` passed.
4. `pnpm --filter web typecheck` passed.
5. `pnpm --filter web build` passed.

### Notes
1. OpenClaw integration boundary now exists server-side with deterministic guardrails, but directive effects are intentionally limited to non-physics-safe actions.
2. Next step is deeper combat authority (server-side target validity/replication) and inventory state authority.

---

## Checkpoint CP-0033 (2026-02-16)

### Completed
1. Extended Go authoritative combat validation with slot-config rules:
   - validates slot kind against canonical slot config,
   - requires target world coordinates for targeted slots,
   - enforces server-side max-range checks using authoritative player position.
2. Added selective combat-result replication in websocket mode:
   - actor always receives result,
   - nearby players receive result,
   - far players no longer receive global combat broadcasts.
3. Added Go websocket integration coverage for selective combat replication across actor/near/far clients.
4. Extended runtime combat protocol to include target world coordinates and wired world UI combat requests to send them for self/selected targets.
5. Updated execution docs to mark this combat-authority slice complete and set next work on inventory authority + deeper target resolution.

### Files touched
1. `apps/world-server-go/cmd/world-server/main.go`
2. `apps/world-server-go/cmd/world-server/main_test.go`
3. `apps/world-server-go/cmd/world-server/ws_integration_test.go`
4. `apps/web/src/lib/runtime/protocol.ts`
5. `apps/web/src/lib/runtime/local-runtime-client.ts`
6. `apps/web/src/lib/runtime/ws-runtime-client.test.ts`
7. `apps/web/src/components/WorldCanvas.tsx`
8. `docs/implementation-test-plan.md`
9. `docs/max-performance-parity-plan.md`
10. `docs/progress-log.md`

### Validation
1. `cd apps/world-server-go && go test ./...` passed.
2. `pnpm --filter web test` passed (28 tests).
3. `pnpm --filter web lint` passed.
4. `pnpm --filter web typecheck` passed.
5. `pnpm --filter web build` passed.

### Notes
1. Combat authority now rejects impossible casts/melee by range on the server, but target coordinates are still client-provided and should move toward server-resolved entity targeting next.
2. Replication is now relevance-scoped for combat messages, reducing unnecessary cross-client traffic.

---

## Checkpoint CP-0034 (2026-02-16)

### Completed
1. Added authoritative hotbar state in Go server runtime:
   - deterministic per-player default slot loadout,
   - join/leave lifecycle ownership.
2. Added websocket hotbar protocol:
   - client request `hotbar_select`,
   - server state replication `hotbar_state`.
3. Added server hotbar selection validation:
   - player ownership checks,
   - index bounds checks,
   - event emission (`hotbar_selected`) for orchestration visibility.
4. Added combat guardrail so server rejects actions using slots not currently equipped in authoritative hotbar state (`slot_not_equipped`).
5. Extended web runtime contract and clients:
   - `selectHotbarSlot(...)`,
   - `subscribeHotbarStates(...)`,
   - runtime protocol support for `RuntimeHotbarState`.
6. Updated world UI hotbar flow to consume authoritative state and send selection through runtime client (keyboard + HUD click).
7. Added test coverage:
   - Go unit tests for hotbar state/select behavior,
   - Go websocket integration test for `hotbar_select -> hotbar_state` replication,
   - web runtime ws-client test for hotbar message flow.

### Files touched
1. `apps/world-server-go/cmd/world-server/main.go`
2. `apps/world-server-go/cmd/world-server/main_test.go`
3. `apps/world-server-go/cmd/world-server/ws_integration_test.go`
4. `apps/web/src/lib/runtime/protocol.ts`
5. `apps/web/src/lib/runtime/local-runtime-client.ts`
6. `apps/web/src/lib/runtime/ws-runtime-client.ts`
7. `apps/web/src/lib/runtime/ws-runtime-client.test.ts`
8. `apps/web/src/components/WorldCanvas.tsx`
9. `docs/implementation-test-plan.md`
10. `docs/max-performance-parity-plan.md`
11. `docs/progress-log.md`

### Validation
1. `cd apps/world-server-go && go test ./...` passed.
2. `pnpm --filter web test` passed (29 tests).
3. `pnpm --filter web lint` passed.
4. `pnpm --filter web typecheck` passed.
5. `pnpm --filter web build` passed.

### Notes
1. Hotbar authority is now server-owned, but full inventory state (item stacks/counts/consume) is still pending.
2. Next deterministic slice is item-inventory authority while preserving the same runtime contract path.

---

## Checkpoint CP-0035 (2026-02-16)

### Completed
1. Extended authoritative hotbar contract to include replicated item stack counts (`stackCounts`) per slot.
2. Added deterministic default stack configuration for consumable item slots in both:
   - Go authoritative server runtime,
   - local runtime client parity path.
3. Added item consumption authority in combat path:
   - accepted item actions decrement stack count server-side,
   - depleted slots are rejected with `insufficient_item`.
4. Added server replication of updated `hotbar_state` after accepted item actions so clients receive authoritative remaining counts.
5. Added additional guardrails/tests:
   - unit test for item stack depletion + rejection,
   - unit test coverage for stack defaults in hotbar state,
   - websocket integration coverage for item-consume hotbar replication.

### Files touched
1. `apps/world-server-go/cmd/world-server/main.go`
2. `apps/world-server-go/cmd/world-server/main_test.go`
3. `apps/world-server-go/cmd/world-server/ws_integration_test.go`
4. `apps/web/src/lib/runtime/protocol.ts`
5. `apps/web/src/lib/runtime/local-runtime-client.ts`
6. `apps/web/src/lib/runtime/ws-runtime-client.ts`
7. `apps/web/src/lib/runtime/ws-runtime-client.test.ts`
8. `docs/implementation-test-plan.md`
9. `docs/max-performance-parity-plan.md`
10. `docs/progress-log.md`

### Validation
1. `cd apps/world-server-go && go test ./...` passed.
2. `pnpm --filter web test` passed (29 tests).
3. `pnpm --filter web lint` passed.
4. `pnpm --filter web typecheck` passed.
5. `pnpm --filter web build` passed.

### Notes
1. Inventory authority now includes consumable counts, but full bag/container and crafting state replication is still pending.
2. Next P should add container/crafting contracts while preserving deterministic server validation rules.

---

## Checkpoint CP-0036 (2026-02-16)

### Completed
1. Added authoritative inventory bag contract with runtime replication:
   - new `inventory_state` envelope in server/runtime protocol,
   - websocket + local runtime client subscription support.
2. Added deterministic resource gain rule for block-break flow:
   - server awards `salvage +1` on accepted break actions,
   - local runtime mirrors the same behavior for parity.
3. Added join-time and update-time inventory replication:
   - player receives `inventory_state` on join,
   - clients receive updated `inventory_state` after break-yield updates.
4. Added gameplay-visible inventory telemetry in world HUD:
   - `Inventory Salvage`,
   - `Inventory Tick`.
5. Added test coverage for inventory authority:
   - Go unit test for resource award totals/guardrails,
   - Go websocket integration test for block-break inventory replication,
   - web ws-runtime parsing/dispatch test for `inventory_state`.

### Files touched
1. `apps/world-server-go/cmd/world-server/main.go`
2. `apps/world-server-go/cmd/world-server/main_test.go`
3. `apps/world-server-go/cmd/world-server/ws_integration_test.go`
4. `apps/web/src/lib/runtime/protocol.ts`
5. `apps/web/src/lib/runtime/local-runtime-client.ts`
6. `apps/web/src/lib/runtime/ws-runtime-client.ts`
7. `apps/web/src/lib/runtime/ws-runtime-client.test.ts`
8. `apps/web/src/components/WorldCanvas.tsx`
9. `docs/implementation-test-plan.md`
10. `docs/max-performance-parity-plan.md`
11. `docs/progress-log.md`

### Validation
1. `cd apps/world-server-go && go test ./...` passed.
2. `pnpm --filter web test` passed (30 tests).
3. `pnpm --filter web lint` passed.
4. `pnpm --filter web typecheck` passed.
5. `pnpm --filter web build` passed.

### Notes
1. Inventory now replicates deterministic bag resources, but container inventories and crafting execution are still pending.
2. Next P should add authoritative container/crafting mutations with explicit server recipe validation.

---

## Checkpoint CP-0037 (2026-02-16)

### Completed
1. Added authoritative crafting contract across runtime/server:
   - new client request `craft_request`,
   - new server result `craft_result`.
2. Implemented server-side recipe validation baseline (`craft-bandage`):
   - requires salvage resource budget,
   - consumes salvage on success,
   - adds crafted output to authoritative hotbar stack.
3. Added replication after crafting:
   - `craft_result`,
   - updated `inventory_state`,
   - updated `hotbar_state`.
4. Added local runtime parity for craft request behavior and state updates.
5. Added gameplay hook for visual testing:
   - `C` key sends bandage craft request,
   - HUD status reflects craft accepted/rejected outcomes.
6. Added tests:
   - Go unit test for craft resource consumption + output updates,
   - Go websocket integration test for craft request replication path,
   - web ws-runtime tests for craft request/result envelopes.

### Files touched
1. `apps/world-server-go/cmd/world-server/main.go`
2. `apps/world-server-go/cmd/world-server/main_test.go`
3. `apps/world-server-go/cmd/world-server/ws_integration_test.go`
4. `apps/web/src/lib/runtime/protocol.ts`
5. `apps/web/src/lib/runtime/local-runtime-client.ts`
6. `apps/web/src/lib/runtime/ws-runtime-client.ts`
7. `apps/web/src/lib/runtime/ws-runtime-client.test.ts`
8. `apps/web/src/components/WorldCanvas.tsx`
9. `docs/implementation-test-plan.md`
10. `docs/max-performance-parity-plan.md`
11. `docs/progress-log.md`

### Validation
1. `cd apps/world-server-go && go test ./...` passed.
2. `pnpm --filter web test` passed (31 tests).
3. `pnpm --filter web lint` passed.
4. `pnpm --filter web typecheck` passed.
5. `pnpm --filter web build` passed.

### Notes
1. Crafting is now authoritative for the baseline recipe path, but container inventories and broader recipe sets remain.
2. Next P should add container inventory state and multi-recipe validation while preserving deterministic server ownership.

---

## Checkpoint CP-0038 (2026-02-16)

### Completed
1. Added authoritative container baseline (`camp-stash`) with runtime contracts:
   - client request `container_action`,
   - server result `container_result`,
   - replicated `container_state`.
2. Implemented server-side container mutation validation:
   - operation allowlist (`deposit`, `withdraw`),
   - resource-balance checks for player inventory and container inventory,
   - deterministic rejection reasons (`insufficient_resources`, `container_insufficient_resources`, etc.).
3. Added replication of post-mutation state:
   - updated `inventory_state`,
   - updated `container_state`.
4. Added local runtime parity for container action behavior.
5. Added gameplay-facing controls + telemetry:
   - `[` deposit salvage to stash,
   - `]` withdraw salvage from stash,
   - HUD lines for stash salvage/tick.
6. Added tests:
   - Go unit test for deposit/withdraw + guardrails,
   - Go websocket integration test for container action replication path,
   - web ws-runtime tests for container action/state/result message handling.

### Files touched
1. `apps/world-server-go/cmd/world-server/main.go`
2. `apps/world-server-go/cmd/world-server/main_test.go`
3. `apps/world-server-go/cmd/world-server/ws_integration_test.go`
4. `apps/web/src/lib/runtime/protocol.ts`
5. `apps/web/src/lib/runtime/local-runtime-client.ts`
6. `apps/web/src/lib/runtime/ws-runtime-client.ts`
7. `apps/web/src/lib/runtime/ws-runtime-client.test.ts`
8. `apps/web/src/components/WorldCanvas.tsx`
9. `docs/implementation-test-plan.md`
10. `docs/max-performance-parity-plan.md`
11. `docs/progress-log.md`

### Validation
1. `cd apps/world-server-go && go test ./...` passed.
2. `pnpm --filter web test` passed (32 tests).
3. `pnpm --filter web lint` passed.
4. `pnpm --filter web typecheck` passed.
5. `pnpm --filter web build` passed.

### Notes
1. Container authority is now in place for stash deposit/withdraw, but richer container types and broader recipe sets remain.
2. Next P should expand recipe catalog and item/container semantics while keeping deterministic server-owned state transitions.

---

## Checkpoint CP-0039 (2026-02-16)

### Completed
1. Expanded economy to minecraft/rpg-style multi-resource model:
   - `salvage`, `wood`, `stone`, `fiber`, `coal`, `iron_ore`, `iron_ingot`.
2. Added deterministic multi-resource break yields in authoritative server and local-runtime parity path.
3. Expanded crafting model to multi-ingredient + mixed output recipes:
   - hotbar outputs: `craft-bandage`, `craft-bomb`,
   - inventory outputs: `craft-charcoal`, `craft-iron-ingot`.
4. Implemented multiplayer-safe container namespace + ACL policy:
   - shared containers (`world:*`) are accessible to all players,
   - private containers (`player:<id>:stash`) are owner-only.
5. Updated join replication to deliver both:
   - shared world stash state (`world:camp-shared`),
   - player-private stash state (`player:<id>:stash`).
6. Updated gameplay HUD/controls:
   - resource summary lines now show all tracked resources,
   - stash display moved to shared world container ID,
   - crafting status text reflects updated recipe semantics.
7. Added/updated tests:
   - Go unit tests for multi-resource craft behavior and container ACL guardrails,
   - Go websocket integration updates for new recipe/resource behavior,
   - web runtime parser tests aligned to shared container IDs and expanded contracts.

### Files touched
1. `apps/world-server-go/cmd/world-server/main.go`
2. `apps/world-server-go/cmd/world-server/main_test.go`
3. `apps/world-server-go/cmd/world-server/ws_integration_test.go`
4. `apps/web/src/lib/runtime/protocol.ts`
5. `apps/web/src/lib/runtime/local-runtime-client.ts`
6. `apps/web/src/lib/runtime/ws-runtime-client.test.ts`
7. `apps/web/src/components/WorldCanvas.tsx`
8. `docs/implementation-test-plan.md`
9. `docs/max-performance-parity-plan.md`
10. `docs/progress-log.md`

### Validation
1. `cd apps/world-server-go && go test ./...` passed.
2. `pnpm --filter web test` passed (32 tests).
3. `pnpm --filter web lint` passed.
4. `pnpm --filter web typecheck` passed.
5. `pnpm --filter web build` passed.

### Notes
1. Multiplayer container design is now hybrid by policy: world-shared stash + per-player private stash.
2. Next P should expose private-stash interactions in UI and add broader recipe UX (multiple craft hotkeys/menu actions).

---

## Checkpoint CP-0040 (2026-02-16)

### Completed
1. Added private-stash gameplay interaction on top of container ACL model:
   - `;` deposits salvage to the player-private stash,
   - `&apos;` withdraws salvage from the player-private stash.
2. Expanded HUD container telemetry to show both:
   - shared stash (`world:camp-shared`),
   - private stash (`player:<id>:stash`).
3. Added websocket integration coverage for owner-only private-container access:
   - owner action accepted,
   - non-owner action rejected with `container_forbidden`.
4. Kept all economy/container/crafting runtime behavior deterministic and server-authoritative.

### Files touched
1. `apps/world-server-go/cmd/world-server/ws_integration_test.go`
2. `apps/web/src/components/WorldCanvas.tsx`
3. `docs/implementation-test-plan.md`
4. `docs/max-performance-parity-plan.md`
5. `docs/progress-log.md`

### Validation
1. `cd apps/world-server-go && go test ./...` passed.
2. `pnpm --filter web test` passed (32 tests).
3. `pnpm --filter web lint` passed.
4. `pnpm --filter web typecheck` passed.
5. `pnpm --filter web build` passed.

### Notes
1. Shared/private stash interaction is now testable directly in gameplay.
2. Next P should add recipe selection UX so multiple recipes are directly craftable from HUD inputs.

---

## Checkpoint CP-0041 (2026-02-16)

### Completed
1. Added deterministic recipe-selection gameplay flow in world input handling:
   - `6-9` selects active recipe,
   - `R` submits authoritative craft request for selected recipe.
2. Added in-canvas craft bar UI with active selection highlight and click-to-select controls.
3. Added shared craft-catalog runtime module for recipe labels/keybinds and deterministic key-index resolution.
4. Updated craft result HUD messaging to show recipe labels instead of raw IDs.
5. Added TDD coverage for craft-catalog key mapping and clamp behavior.
6. Preserved deterministic/no-fallback behavior and existing multiplayer authority boundaries.

### Files touched
1. `apps/web/src/components/WorldCanvas.tsx`
2. `apps/web/src/app/globals.css`
3. `apps/web/src/lib/runtime/crafting-catalog.ts`
4. `apps/web/src/lib/runtime/crafting-catalog.test.ts`
5. `apps/web/src/lib/runtime/index.ts`
6. `docs/implementation-test-plan.md`
7. `docs/max-performance-parity-plan.md`
8. `docs/progress-log.md`

### Validation
1. `cd apps/world-server-go && go test ./...` passed.
2. `pnpm --filter web test` passed (35 tests).
3. `pnpm --filter web lint` passed.
4. `pnpm --filter web typecheck` passed.
5. `pnpm --filter web build` passed.

### Notes
1. Craft controls are now menu-like and extensible, not hardcoded one-key-per-recipe actions.
2. Next P should improve authoritative target resolution and then expand stash transfers to selected resources beyond salvage-only keys.

---

## Checkpoint CP-0042 (2026-02-16)

### Completed
1. Expanded container transfer UX from salvage-only actions to selected-resource actions.
2. Added stash-resource selection controls:
   - `N/M` cycles active resource,
   - clickable resource chips in HUD select active resource directly.
3. Updated transfer keys to operate on active resource:
   - shared stash: `[` deposit, `]` withdraw,
   - private stash: `;` deposit, `&apos;` withdraw.
4. Added runtime resource-selection helper module for deterministic index clamp/cycle/resolve behavior.
5. Added TDD coverage for resource-selection helper behavior and label formatting.

### Files touched
1. `apps/web/src/components/WorldCanvas.tsx`
2. `apps/web/src/app/globals.css`
3. `apps/web/src/lib/runtime/resource-selection.ts`
4. `apps/web/src/lib/runtime/resource-selection.test.ts`
5. `apps/web/src/lib/runtime/index.ts`
6. `docs/implementation-test-plan.md`
7. `docs/max-performance-parity-plan.md`
8. `docs/progress-log.md`

### Validation
1. `cd apps/world-server-go && go test ./...` passed.
2. `pnpm --filter web test` passed (38 tests).
3. `pnpm --filter web lint` passed.
4. `pnpm --filter web typecheck` passed.
5. `pnpm --filter web build` passed.

### Notes
1. Container interactions are now resource-agnostic, which removes a major gameplay bottleneck for survival/crafting loops.
2. Next P should add server-authoritative target resolution for combat and entity actions.

---

## Checkpoint CP-0043 (2026-02-16)

### Completed
1. Added server-side target resolution for combat requests that specify player `targetId`.
2. Server now overrides spoofed client target coordinates with authoritative player coordinates when target is resolvable.
3. Added new combat rejection guardrail `unknown_target` for unresolved target IDs when no fallback coordinates are supplied.
4. Added Go unit tests for:
   - authoritative player-target coordinate resolution,
   - unknown-target rejection semantics.
5. Added websocket integration test ensuring combat results return authoritative target coordinates for player targets.

### Files touched
1. `apps/world-server-go/cmd/world-server/main.go`
2. `apps/world-server-go/cmd/world-server/main_test.go`
3. `apps/world-server-go/cmd/world-server/ws_integration_test.go`
4. `docs/implementation-test-plan.md`
5. `docs/max-performance-parity-plan.md`
6. `docs/progress-log.md`

### Validation
1. `cd apps/world-server-go && go test ./...` passed.
2. `pnpm --filter web test` passed (38 tests).
3. `pnpm --filter web lint` passed.
4. `pnpm --filter web typecheck` passed.
5. `pnpm --filter web build` passed.

### Notes
1. This reduces trust in client-supplied targeting for player-vs-player interactions while preserving existing non-player target flow.
2. Next P should add directive-to-runtime adapters for bounded, non-physics world updates.

---

## Checkpoint CP-0044 (2026-02-16)

### Completed
1. Added directive-to-runtime adapter contract `world_flag_state` for non-physics world updates.
2. Updated Go world server runtime:
   - sends `world_flag_state` to clients on join,
   - broadcasts `world_flag_state` when directive application mutates world flags.
3. Added web runtime support:
   - new `RuntimeWorldFlagState` contract and `subscribeWorldFlagStates(...)`,
   - websocket parsing/dispatch for `world_flag_state`,
   - local runtime parity stub subscription path.
4. Integrated world flag telemetry into gameplay HUD:
   - `World Flags Tick`,
   - `World Flags` summary line.
5. Added coverage:
   - Go unit test for world-flag snapshot + change detection on directive apply,
   - Go websocket integration test for join-time world-flag replication,
   - web ws-runtime test for `world_flag_state` forwarding.

### Files touched
1. `apps/world-server-go/cmd/world-server/main.go`
2. `apps/world-server-go/cmd/world-server/main_test.go`
3. `apps/world-server-go/cmd/world-server/ws_integration_test.go`
4. `apps/web/src/lib/runtime/protocol.ts`
5. `apps/web/src/lib/runtime/local-runtime-client.ts`
6. `apps/web/src/lib/runtime/ws-runtime-client.ts`
7. `apps/web/src/lib/runtime/ws-runtime-client.test.ts`
8. `apps/web/src/components/WorldCanvas.tsx`
9. `docs/implementation-test-plan.md`
10. `docs/max-performance-parity-plan.md`
11. `docs/progress-log.md`

### Validation
1. `cd apps/world-server-go && go test ./...` passed.
2. `pnpm --filter web test` passed (39 tests).
3. `pnpm --filter web lint` passed.
4. `pnpm --filter web typecheck` passed.
5. `pnpm --filter web build` passed.

### Notes
1. OpenClaw-driven world flags now replicate into live gameplay without touching physics/tick-critical state.
2. Next P should add stash transfer amount controls and then expand directive adapters to additional bounded payload types.

---

## Checkpoint CP-0045 (2026-02-16)

### Completed
1. Added stash transfer amount controls with deterministic options (`x1`, `x5`, `x10`).
2. Added amount selection inputs:
   - keyboard `J/K` for previous/next amount,
   - HUD amount chips for direct selection.
3. Updated container actions (shared + private stash deposit/withdraw) to submit selected transfer amount instead of fixed `1`.
4. Added runtime helper module for transfer-amount logic (`clamp`, `cycle`, `resolve`) with dedicated tests.
5. Updated HUD telemetry and control hints to display active transfer amount.

### Files touched
1. `apps/web/src/components/WorldCanvas.tsx`
2. `apps/web/src/app/globals.css`
3. `apps/web/src/lib/runtime/transfer-amount.ts`
4. `apps/web/src/lib/runtime/transfer-amount.test.ts`
5. `apps/web/src/lib/runtime/index.ts`
6. `docs/implementation-test-plan.md`
7. `docs/max-performance-parity-plan.md`
8. `docs/progress-log.md`

### Validation
1. `cd apps/world-server-go && go test ./...` passed.
2. `pnpm --filter web test` passed (42 tests).
3. `pnpm --filter web lint` passed.
4. `pnpm --filter web typecheck` passed.
5. `pnpm --filter web build` passed.

### Notes
1. Stash transfers now support practical multiplayer inventory movement without changing server determinism.
2. Next P should add server-authored target tokens for non-player entities and expand directive adapter payload coverage.

---

## Checkpoint CP-0046 (2026-02-16)

### Completed
1. Added deterministic server resolution for non-player target tokens in combat actions:
   - token format: `chunkX:chunkZ:type:index`,
   - accepted types: `npc`, `wild-mon`.
2. Implemented Go-side deterministic chunk entity reconstruction matching client token indexing semantics.
3. Updated combat target resolution path to use server-resolved coordinates for:
   - player targets (`targetId` maps to player state),
   - non-player target tokens (derived from world seed + chunk generator math).
4. Added tests:
   - unit test for non-player token resolution in combat flow,
   - websocket integration test for accepted combat with resolvable non-player token and server-returned coordinates.
5. Preserved fallback behavior for legacy client actions:
   - if token/ID is unresolved but coordinates are provided, server still range-validates by coordinates.

### Files touched
1. `apps/world-server-go/cmd/world-server/main.go`
2. `apps/world-server-go/cmd/world-server/main_test.go`
3. `apps/world-server-go/cmd/world-server/ws_integration_test.go`
4. `docs/implementation-test-plan.md`
5. `docs/max-performance-parity-plan.md`
6. `docs/progress-log.md`

### Validation
1. `cd apps/world-server-go && go test ./...` passed.
2. `pnpm --filter web test` passed (42 tests).
3. `pnpm --filter web lint` passed.
4. `pnpm --filter web typecheck` passed.
5. `pnpm --filter web build` passed.

### Notes
1. Combat no longer depends on client-supplied coordinates for resolvable player/non-player target IDs.
2. Next P should expand directive adapters beyond world flags to bounded story-beat/spawn-hint payload channels.

---

## Checkpoint CP-0047 (2026-02-16)

### Completed
1. Expanded directive adapter runtime payloads beyond flags:
   - story beats (`emit_story_beat`),
   - spawn hints (`spawn_hint`).
2. Added new websocket runtime envelope `world_directive_state` with:
   - `storyBeats[]`,
   - `spawnHints[]`,
   - `tick`.
3. Updated Go server directive application:
   - bounded story-beat history,
   - spawn-hint upsert by `hintId`/`directiveId`,
   - change-triggered replication of directive state.
4. Updated join flow to send both:
   - `world_flag_state`,
   - `world_directive_state`.
5. Added web runtime contract + ws/local client subscriptions for directive state.
6. Added HUD visibility for directive data:
   - directive tick,
   - latest story beat,
   - spawn hint count.
7. Added/updated tests:
   - Go unit test for directive-state mutation/snapshot,
   - Go websocket integration test for join-time directive-state replication,
   - web ws-runtime tests for directive-state envelope forwarding.

### Files touched
1. `apps/world-server-go/cmd/world-server/main.go`
2. `apps/world-server-go/cmd/world-server/main_test.go`
3. `apps/world-server-go/cmd/world-server/ws_integration_test.go`
4. `apps/web/src/lib/runtime/protocol.ts`
5. `apps/web/src/lib/runtime/local-runtime-client.ts`
6. `apps/web/src/lib/runtime/ws-runtime-client.ts`
7. `apps/web/src/lib/runtime/ws-runtime-client.test.ts`
8. `apps/web/src/components/WorldCanvas.tsx`
9. `docs/implementation-test-plan.md`
10. `docs/max-performance-parity-plan.md`
11. `docs/progress-log.md`

### Validation
1. `cd apps/world-server-go && go test ./...` passed.
2. `pnpm --filter web test` passed (43 tests).
3. `pnpm --filter web lint` passed.
4. `pnpm --filter web typecheck` passed.
5. `pnpm --filter web build` passed.

### Notes
1. OpenClaw non-physics directives now replicate into gameplay-visible runtime channels, not just event logs.
2. Next P should implement stash split/merge UX and then consume directive payloads in world presentation.

---

## Checkpoint CP-0048 (2026-02-16)

### Completed
1. Added split/merge transfer semantics for stash actions:
   - base: selected amount clamped to source amount,
   - `Shift`: half-source transfer,
   - `Ctrl/Alt/Cmd`: full-source transfer.
2. Added zero-source guardrail to avoid sending guaranteed-fail transfer requests.
3. Added `transfer-strategy` runtime helper module for deterministic modifier and amount resolution.
4. Added transfer-strategy unit tests for:
   - modifier selection priority,
   - base clamp behavior,
   - half/all transfer semantics.
5. Updated HUD status and help text for transfer modifier controls.

### Files touched
1. `apps/web/src/components/WorldCanvas.tsx`
2. `apps/web/src/lib/runtime/transfer-strategy.ts`
3. `apps/web/src/lib/runtime/transfer-strategy.test.ts`
4. `apps/web/src/lib/runtime/index.ts`
5. `docs/implementation-test-plan.md`
6. `docs/max-performance-parity-plan.md`
7. `docs/progress-log.md`

### Validation
1. `cd apps/world-server-go && go test ./...` passed.
2. `pnpm --filter web test` passed (46 tests).
3. `pnpm --filter web lint` passed.
4. `pnpm --filter web typecheck` passed.
5. `pnpm --filter web build` passed.

### Notes
1. Inventory transfer UX now supports practical multiplayer stash operations without changing server state rules.
2. Next P should consume directive payloads directly in world presentation and add spawn-hint lifecycle guardrails.

---

## Checkpoint CP-0049 (2026-02-16)

### Completed
1. Added world-presentation consumption for directive payloads:
   - runtime spawn hints now render as in-world beacon markers in `WorldCanvas`.
2. Kept directive visuals explicitly non-authoritative:
   - markers are presentation-only,
   - no world/block/entity simulation mutation path added.
3. Updated directive HUD summary to show spawn-hint label/chunk details (`label@chunkX,chunkZ`).
4. Preserved existing runtime authority boundaries while improving live gameplay observability of OpenClaw directives.

### Files touched
1. `apps/web/src/components/WorldCanvas.tsx`
2. `docs/implementation-test-plan.md`
3. `docs/max-performance-parity-plan.md`
4. `docs/progress-log.md`

### Validation
1. `cd apps/world-server-go && go test ./...` passed.
2. `pnpm --filter web test` passed (46 tests).
3. `pnpm --filter web lint` passed.
4. `pnpm --filter web typecheck` passed.
5. `pnpm --filter web build` passed.

### Notes
1. Players can now visually see directive spawn hints in-world, which tightens the iteration loop for agent-managed world events.
2. Next P should add spawn-hint lifecycle guardrails (expiry/remove/update semantics) and bounded HUD history.

---

## Checkpoint CP-0050 (2026-02-16)

### Completed
1. Added spawn-hint lifecycle guardrails in server directive handling:
   - configurable `ttlTicks` for hint lifetime,
   - bounded TTL clamping,
   - automatic expiry pruning during world ticks,
   - explicit remove semantics (`action: "remove"`).
2. Updated server directive-state change detection so expiry/removal triggers websocket directive-state replication.
3. Added Go unit coverage for full spawn-hint lifecycle:
   - add,
   - expire,
   - re-add,
   - explicit remove.
4. Preserved deterministic behavior and non-physics boundary for all directive-driven updates.

### Files touched
1. `apps/world-server-go/cmd/world-server/main.go`
2. `apps/world-server-go/cmd/world-server/main_test.go`
3. `docs/implementation-test-plan.md`
4. `docs/max-performance-parity-plan.md`
5. `docs/progress-log.md`

### Validation
1. `cd apps/world-server-go && go test ./...` passed.
2. `pnpm --filter web test` passed (46 tests).
3. `pnpm --filter web lint` passed.
4. `pnpm --filter web typecheck` passed.
5. `pnpm --filter web build` passed.

### Notes
1. Spawn hints now have deterministic lifecycle behavior suitable for long-running sessions.
2. Next P should focus on authoritative combat UX feedback and story-beat presentation effects.

---

## Checkpoint CP-0051 (2026-02-16)

### Completed
1. Added richer authoritative combat feedback in `WorldCanvas`:
   - target resolution state now tracked and displayed (`pending`, `client-lock`, `server-lock`, `server-reject`).
2. Added server-lock detection by comparing pending client target coordinates with server-confirmed target coordinates.
3. Added readable combat rejection reason mapping for key server reason codes (`unknown_target`, `target_out_of_range`, etc.).
4. Extended combat HUD panel with explicit `Target Resolution` telemetry.

### Files touched
1. `apps/web/src/components/WorldCanvas.tsx`
2. `docs/implementation-test-plan.md`
3. `docs/max-performance-parity-plan.md`
4. `docs/progress-log.md`

### Validation
1. `cd apps/world-server-go && go test ./...` passed.
2. `pnpm --filter web test` passed (46 tests).
3. `pnpm --filter web lint` passed.
4. `pnpm --filter web typecheck` passed.
5. `pnpm --filter web build` passed.

### Notes
1. Combat interactions now provide clearer server-authority feedback during live gameplay iteration.
2. Next P should add story-beat presentation effects and bounded directive history.

---

## Checkpoint CP-0052 (2026-02-16)

### Completed
1. Added timed story-beat banner presentation in gameplay overlay.
2. Story-beat banner is driven by replicated directive state (`world_directive_state` story beat updates).
3. Added bounded display behavior:
   - show only when a new beat arrives,
   - auto-hide after a short duration.
4. Kept story-beat effects strictly presentation-only with no deterministic simulation side effects.

### Files touched
1. `apps/web/src/components/WorldCanvas.tsx`
2. `apps/web/src/app/globals.css`
3. `docs/implementation-test-plan.md`
4. `docs/max-performance-parity-plan.md`
5. `docs/progress-log.md`

### Validation
1. `cd apps/world-server-go && go test ./...` passed.
2. `pnpm --filter web test` passed (46 tests).
3. `pnpm --filter web lint` passed.
4. `pnpm --filter web typecheck` passed.
5. `pnpm --filter web build` passed.

### Notes
1. Directive-driven story beats now have immediate visual feedback in active gameplay.
2. Next P should add bounded directive history and richer failure-to-toast mapping for transfer/crafting flows.

---

## Checkpoint CP-0053 (2026-02-16)

### Completed
1. Added bounded directive history panel to world HUD.
2. History captures directive-driven events with runtime tick context:
   - story beat arrivals,
   - spawn hint updates/clears.
3. History is capped (last 8 entries) to keep UI stable and readable during longer sessions.
4. History list is rendered newest-first to prioritize recent debugging context.

### Files touched
1. `apps/web/src/components/WorldCanvas.tsx`
2. `apps/web/src/app/globals.css`
3. `docs/implementation-test-plan.md`
4. `docs/max-performance-parity-plan.md`
5. `docs/progress-log.md`

### Validation
1. `cd apps/world-server-go && go test ./...` passed.
2. `pnpm --filter web test` passed (46 tests).
3. `pnpm --filter web lint` passed.
4. `pnpm --filter web typecheck` passed.
5. `pnpm --filter web build` passed.

### Notes
1. Directive history now provides a practical backtracking trail directly in gameplay.
2. Next P should add richer server failure reason mapping for crafting/container HUD toasts.

---

## Checkpoint CP-0054 (2026-02-16)

### Completed
1. Added richer craft/container HUD messaging from server reason codes:
   - reason-code to readable message mapping for craft + stash failures.
2. Added overlay toast stack for gameplay event feedback:
   - success toasts for crafted items,
   - info toasts for stash transfer confirmations,
   - error toasts for craft/stash rejections.
3. Preserved deterministic feedback contract by mapping only server-authoritative reason codes.

### Files touched
1. `apps/web/src/components/WorldCanvas.tsx`
2. `apps/web/src/app/globals.css`
3. `docs/implementation-test-plan.md`
4. `docs/max-performance-parity-plan.md`
5. `docs/progress-log.md`

### Validation
1. `cd apps/world-server-go && go test ./...` passed.
2. `pnpm --filter web test` passed (46 tests).
3. `pnpm --filter web lint` passed.
4. `pnpm --filter web typecheck` passed.
5. `pnpm --filter web build` passed.

### Notes
1. Gameplay feedback is now much clearer for craft/container outcomes during multiplayer testing.
2. Next P should improve mesh/render profiling shortcuts and optional debug overlay controls.

---

## Checkpoint CP-0055 (2026-02-16)

### Completed
1. Added diagnostics shortcuts and controls for faster mesh/render triage:
   - keyboard: `F3` (diagnostics on/off), `F4` (mesh basic/detailed),
   - HUD buttons for the same toggles.
2. Added diagnostics mode telemetry line in HUD (`on/off`, `basic/detailed`).
3. Split diagnostics output by detail level:
   - basic: core mesh/orchestrator counters,
   - detailed: full extraction/upload timing and p95/chunk timing metrics.
4. Updated gameplay help text with profiling shortcut guidance.

### Files touched
1. `apps/web/src/components/WorldCanvas.tsx`
2. `apps/web/src/app/globals.css`
3. `docs/implementation-test-plan.md`
4. `docs/max-performance-parity-plan.md`
5. `docs/progress-log.md`

### Validation
1. `cd apps/world-server-go && go test ./...` passed.
2. `pnpm --filter web test` passed (46 tests).
3. `pnpm --filter web lint` passed.
4. `pnpm --filter web typecheck` passed.
5. `pnpm --filter web build` passed.

### Notes
1. Profiling/triage loop is now much faster during gameplay testing.
2. Next P should add optional minimap/debug overlay and world-state export for deterministic replay captures.

---

## Checkpoint CP-0056 (2026-02-16)

### Completed
1. Added optional minimap/debug overlay for gameplay authority context.
2. Minimap overlay includes:
   - current chunk/player center marker,
   - nearby directive spawn-hint markers,
   - runtime/chunk summary (`tick`, loaded chunks, runtime mode).
3. Added keyboard toggle `F5` for minimap visibility.
4. Updated gameplay help text to include minimap shortcut guidance.

### Files touched
1. `apps/web/src/components/WorldCanvas.tsx`
2. `apps/web/src/app/globals.css`
3. `docs/implementation-test-plan.md`
4. `docs/max-performance-parity-plan.md`
5. `docs/progress-log.md`

### Validation
1. `cd apps/world-server-go && go test ./...` passed.
2. `pnpm --filter web test` passed (46 tests).
3. `pnpm --filter web lint` passed.
4. `pnpm --filter web typecheck` passed.
5. `pnpm --filter web build` passed.

### Notes
1. Multiplayer debug visibility now covers world directives, target authority, and chunk context in one gameplay view.
2. Next P should add world-state export snapshot support for deterministic replay/debug capture.

---

## Checkpoint CP-0057 (2026-02-16)

### Completed
1. Added deterministic world-state export support in Go world server:
   - new endpoint: `GET /debug/state`.
2. Export payload includes authoritative runtime slices:
   - snapshot/players,
   - block deltas,
   - hotbar/inventory/container states,
   - world flags and directive state.
3. Added root workflow command:
   - `pnpm game:dump-state` to fetch `/debug/state` and write JSON to `data/debug/...`.
4. Added Go test coverage for debug-state handler export behavior.

### Files touched
1. `apps/world-server-go/cmd/world-server/main.go`
2. `apps/world-server-go/cmd/world-server/main_test.go`
3. `scripts/dump-world-state.mjs`
4. `package.json`
5. `docs/implementation-test-plan.md`
6. `docs/max-performance-parity-plan.md`
7. `docs/progress-log.md`

### Validation
1. `cd apps/world-server-go && go test ./...` passed.
2. `pnpm --filter web test` passed (46 tests).
3. `pnpm --filter web lint` passed.
4. `pnpm --filter web typecheck` passed.
5. `pnpm --filter web build` passed.

### Notes
1. Deterministic debug captures are now a first-class workflow for backtracking and replay tooling.
2. Next P should focus on visual polish and deterministic gameplay capture docs/scripts.

---

## Checkpoint CP-0058 (2026-02-16)

### Completed
1. Added visual polish pass for sharper voxel readability and painterly atmosphere alignment.
2. Updated world render tuning in `WorldCanvas`:
   - ACES tone mapping + exposure tuning,
   - refined fog/background balance,
   - adjusted ambient/hemisphere/directional lighting.
3. Increased perceived detail density by reducing effective block scale for terrain rendering.
4. Tuned voxel vertex color ramp for better depth contrast in playable lighting.

### Files touched
1. `apps/web/src/components/WorldCanvas.tsx`
2. `docs/implementation-test-plan.md`
3. `docs/max-performance-parity-plan.md`
4. `docs/progress-log.md`

### Validation
1. `cd apps/world-server-go && go test ./...` passed.
2. `pnpm --filter web test` passed (46 tests).
3. `pnpm --filter web lint` passed.
4. `pnpm --filter web typecheck` passed.
5. `pnpm --filter web build` passed.

### Notes
1. Visual direction now reads closer to the sharper Minecraft-meets-RPG target while preserving deterministic runtime behavior.
2. Next P should optimize multiplayer replication fanout to reduce unnecessary state traffic.

---

## Checkpoint CP-0059 (2026-02-17)

### Completed
1. Added multiplayer-first replication scoping in Go world server.
2. Snapshot replication is now proximity-scoped per client:
   - each client always receives its owned player(s),
   - nearby players are included by radius,
   - far players are excluded.
3. Private state fanout is now owner-only:
   - `inventory_state`, `hotbar_state`, `craft_result`, `container_result` are sent only to the owning player client(s).
4. Shared container state replication remains shared for world containers; private stash container updates are owner-scoped.
5. Added new Go unit + websocket integration coverage:
   - snapshot interest scoping behavior,
   - owner-only hotbar/inventory/craft replication checks.
6. Added parsing helper coverage for private container ownership resolution.

### Files touched
1. `apps/world-server-go/cmd/world-server/main.go`
2. `apps/world-server-go/cmd/world-server/main_test.go`
3. `apps/world-server-go/cmd/world-server/ws_integration_test.go`
4. `docs/implementation-test-plan.md`
5. `docs/max-performance-parity-plan.md`
6. `docs/progress-log.md`

### Validation
1. `cd apps/world-server-go && go test ./...` passed.
2. `pnpm --filter web test` passed (46 tests).
3. `pnpm --filter web lint` passed.
4. `pnpm --filter web typecheck` passed.
5. `pnpm --filter web build` passed.

### Notes
1. This establishes the multiplayer system design baseline for 1-12 player sessions with lower replication overhead and reduced private-state leakage.
2. Next P should implement deterministic gameplay capture/replay workflows and OpenClaw event-loop hardening.

---

## Checkpoint CP-0060 (2026-02-17)

### Completed
1. Added deterministic world-state import/reseed support in Go world server:
   - new endpoint: `POST /debug/load-state`.
2. Added authoritative import pipeline:
   - validates payload basics (`worldSeed`, `tick`),
   - restores players/block deltas/hotbar/inventory/container/world flags/directive state,
   - clears stale cooldown/directive queues and records `debug_state_loaded` event.
3. Added post-import replication refresh:
   - proximity snapshots,
   - block deltas,
   - owner-scoped private state channels,
   - world flag/directive state broadcasts.
4. Added CLI loader command:
   - `pnpm game:load-state`,
   - supports `--file <path>` and defaults to the latest capture in `data/debug/`.
5. Added Go test coverage:
   - import/export roundtrip behavior,
   - `POST /debug/load-state` handler integration.

### Files touched
1. `apps/world-server-go/cmd/world-server/main.go`
2. `apps/world-server-go/cmd/world-server/main_test.go`
3. `scripts/load-world-state.mjs`
4. `package.json`
5. `docs/implementation-test-plan.md`
6. `docs/max-performance-parity-plan.md`
7. `docs/progress-log.md`

### Validation
1. `cd apps/world-server-go && go test ./...` passed.
2. `pnpm --filter web test` passed (46 tests).
3. `pnpm --filter web lint` passed.
4. `pnpm --filter web typecheck` passed.
5. `pnpm --filter web build` passed.

### Notes
1. Backtracking now works both directions: capture (`dump`) and restore (`load`) in a deterministic local sandbox flow.
2. Next P should attach event-feed cursor metadata to captures and add replay session scripts/docs.

---

## Checkpoint CP-0061 (2026-02-19)

### Completed
1. Added animation event graph contract with canonical action events and deterministic reducer.
2. Integrated animation reducer into `WorldCanvas` locomotion/combat flow while keeping sprite placeholders.
3. Added unit tests for deterministic animation transitions.
4. Updated implementation plan status for Step 3 completion.

### Files touched
1. `apps/web/src/lib/runtime/animation-event-graph.ts`
2. `apps/web/src/lib/runtime/animation-event-graph.test.ts`
3. `apps/web/src/lib/runtime/index.ts`
4. `apps/web/src/components/WorldCanvas.tsx`
5. `docs/implementation-test-plan.md`
6. `docs/progress-log.md`

### Validation
1. `pnpm --filter web test` passed (50 tests).

### Notes
1. Placeholder sprite animations now follow deterministic action transitions until skeletal assets are available.

---

## Checkpoint CP-0062 (2026-02-19)

### Completed
1. Added client-side asset prewarm requests for frontier chunks to keep asset generation off the critical path.
2. Tracked asset placeholder visibility and patch apply metrics in the HUD diagnostics.
3. Recorded patch polling latency samples for asset service responsiveness monitoring.

### Files touched
1. `apps/web/src/components/WorldCanvas.tsx`
2. `docs/progress-log.md`

### Validation
1. Not run (not requested).

### Notes
1. Asset service integration remains optional; mock/HTTP adapter selection is unchanged and now exposes diagnostics for fallback behavior.

---

## Checkpoint CP-0063 (2026-02-20)

### Completed
1. Reworked core world scale to read as Minecraft-like blocks:
   - voxel block size increased to align chunk grid with 16x16 blocks,
   - player/NPC/prop scales updated to match the new block unit.
2. Adjusted camera framing and lighting to improve readability:
   - tuned third-person distance/height and first-person eye height,
   - brighter sky/fog balance for a clearer horizon.
3. Updated UI layout sizing:
   - world canvas now keeps a 16:9 frame on desktop,
   - right HUD panel uses a responsive width clamp,
   - canvas scanline overlay is lighter and less obstructive.

### Files touched
1. `apps/web/src/components/WorldCanvas.tsx`
2. `apps/web/src/app/globals.css`
3. `docs/implementation-test-plan.md`
4. `docs/progress-log.md`

### Validation
1. `pnpm --filter web test` passed (50 tests).
2. `pnpm --filter web lint` passed.
3. `pnpm --filter web typecheck` passed.

### Notes
1. Core view now aligns with Minecraft-esque block proportions while keeping painterly lighting.
2. Next P should re-evaluate in-game HUD density against the new scale and update any remaining readability issues.

---

## Checkpoint CP-0064 (2026-02-20)

### Completed
1. Added dynamic surface height alignment so the camera/player sit on top of voxel terrain:
   - per-chunk surface height map computed from voxel blocks,
   - player/camera Y offsets now follow the surface height.
2. Adjusted canvas sizing to fit within the browser viewport:
   - canvas height now clamps to available vertical space,
   - HUD column remains responsive with fixed clamp width.
3. Maintained sky visibility by lifting camera and aligning with terrain height.

### Files touched
1. `apps/web/src/components/WorldCanvas.tsx`
2. `apps/web/src/app/globals.css`
3. `docs/progress-log.md`

### Validation
1. `pnpm --filter web test` passed (50 tests).
2. `pnpm --filter web lint` passed.
3. `pnpm --filter web typecheck` passed.

### Notes
1. The world now renders above the player with a visible sky while keeping Minecraft-like block scale.

---

## Checkpoint CP-0065 (2026-02-20)

### Completed
1. Aligned entity and overlay placement with voxel surface height:
   - trees/rocks/NPCs now sit on the terrain surface,
   - asset overlay placeholders inherit surface height.
2. Added per-column surface-height updates when blocks are placed/broken.
3. Spawn-hint markers now sit on the terrain surface instead of y=0.

### Files touched
1. `apps/web/src/components/WorldCanvas.tsx`
2. `docs/progress-log.md`

### Validation
1. `pnpm --filter web test` passed (50 tests).
2. `pnpm --filter web lint` passed.
3. `pnpm --filter web typecheck` passed.

### Notes
1. World objects now track the same height field as voxel terrain, eliminating ground-level clipping.

---

## Checkpoint CP-0066 (2026-02-20)

### Completed
1. Unified terrain sampling across voxel generation and chunk decoration:
   - added shared deterministic sampler (`sampleTerrain`) for height, moisture, and path masks,
   - voxel chunk generation now uses the shared sampler.
2. Added a smooth heightfield surface mesh on top of voxel blocks:
   - per-chunk surface heights are derived from the sampler,
   - heightfield mesh uses vertex colors for path/grass/water tones,
   - player/camera height now interpolates across surface heights for smooth movement.
3. Removed the flat ground plane and refreshed sky/fog colors to emphasize the open sky.

### Files touched
1. `apps/web/src/components/WorldCanvas.tsx`
2. `apps/web/src/lib/voxel/voxel-world.ts`
3. `apps/web/src/lib/world/chunk-generator.ts`
4. `apps/web/src/lib/world/terrain-sampler.ts`
5. `docs/implementation-test-plan.md`
6. `docs/progress-log.md`

### Validation
1. Not run (pending): `pnpm --filter web test`
2. Not run (pending): `pnpm --filter web lint`
3. `pnpm --filter web typecheck` passed

### Notes
1. This sets up the painterly terrain foundation: smooth slopes with voxel interactions preserved.

---

## Checkpoint CP-0067 (2026-02-20)

### Completed
1. Reduced visible blockiness by prioritizing the smooth heightfield surface mesh:
   - increased surface mesh resolution,
   - made voxel interaction mesh nearly invisible while keeping raycast hits.
2. Ensured surface mesh draws above the voxel mesh for cleaner terrain silhouettes.

### Files touched
1. `apps/web/src/components/WorldCanvas.tsx`
2. `docs/progress-log.md`

### Validation
1. Not run (pending): `pnpm --filter web test`
2. Not run (pending): `pnpm --filter web lint`
3. Not run (pending): `pnpm --filter web typecheck`

### Notes
1. Visual focus now emphasizes smooth terrain while preserving voxel interactions for editing.

---

## Checkpoint CP-0068 (2026-02-20)

### Completed
1. Further reduced voxel visibility while keeping interaction hits:
   - voxel render opacity lowered to 0.01.
2. Made surface height sampling use continuous terrain in addition to voxel edits:
   - height sampling now blends smooth terrain with voxel edits via max height.

### Files touched
1. `apps/web/src/components/WorldCanvas.tsx`
2. `docs/progress-log.md`

### Validation
1. Not run (pending): `pnpm --filter web test`
2. Not run (pending): `pnpm --filter web lint`
3. Not run (pending): `pnpm --filter web typecheck`

### Notes
1. Movement and camera heights now prioritize the smooth terrain surface while still honoring raised edits.

---

## Checkpoint CP-0069 (2026-02-20)

### Completed
1. Sharpened terrain look with higher contrast lighting and richer surface colors:
   - adjusted sky/fog palette and light balance,
   - added per-vertex color variation and ridge-based rock tinting.

### Files touched
1. `apps/web/src/components/WorldCanvas.tsx`
2. `docs/progress-log.md`

### Validation
1. Not run (pending): `pnpm --filter web test`
2. Not run (pending): `pnpm --filter web lint`
3. Not run (pending): `pnpm --filter web typecheck`

### Notes
1. Terrain should read less flat and closer to a “pixelated Skyrim” palette before overlays.

---

## Checkpoint CP-0070 (2026-02-20)

### Completed
1. Began core gameplay focus with deterministic NPC motion:
   - NPCs now use a shared wander offset function tied to runtime tick.
2. Target resolution now respects live NPC offsets (server + client share the same function).
3. Server-side chunk entity generation now uses the shared terrain sampler for parity.

### Files touched
1. `apps/web/src/components/WorldCanvas.tsx`
2. `apps/world-server-go/cmd/world-server/main.go`
3. `apps/world-server-go/cmd/world-server/main_test.go`
4. `docs/implementation-test-plan.md`
5. `docs/progress-log.md`

### Validation
1. Not run (pending): `pnpm --filter web test`
2. Not run (pending): `pnpm --filter web lint`
3. `pnpm --filter web typecheck` passed
4. `cd apps/world-server-go && go test ./...` passed

### Notes
1. NPC movement is deterministic and multiplayer-safe; it will be refined once OpenClaw-driven AI is integrated.

---

## Checkpoint CP-0071 (2026-02-20)

### Completed
1. Added a deterministic interaction action:
   - new runtime `interact_action`/`interact_result` flow across client + server,
   - server validates proximity and resolves NPC targets with live wander offsets.
2. Added jump input + client-side jump physics for immediate gameplay feel.

### Files touched
1. `apps/web/src/components/WorldCanvas.tsx`
2. `apps/web/src/lib/runtime/protocol.ts`
3. `apps/web/src/lib/runtime/authoritative-sim.ts`
4. `apps/web/src/lib/runtime/local-runtime-client.ts`
5. `apps/web/src/lib/runtime/ws-runtime-client.ts`
6. `apps/web/src/lib/runtime/ws-runtime-client.test.ts`
7. `apps/web/src/lib/runtime/authoritative-sim.test.ts`
8. `apps/world-server-go/cmd/world-server/main.go`
9. `apps/world-server-go/cmd/world-server/main_test.go`
10. `apps/world-server-go/cmd/world-server/ws_integration_test.go`
11. `docs/progress-log.md`

### Validation
1. Not run (pending): `pnpm --filter web test`
2. Not run (pending): `pnpm --filter web lint`
3. `pnpm --filter web typecheck` passed
4. `cd apps/world-server-go && go test ./...` passed

### Notes
1. Interaction flow is server-validated; jump is client-side for now until we add vertical state to snapshots.

---

## Checkpoint CP-0072 (2026-02-20)

### Completed
1. Added multiplayer fake-client validation for interaction:
   - new WS integration test ensures `interact_result` only returns to the owning client.

### Files touched
1. `apps/world-server-go/cmd/world-server/ws_integration_test.go`
2. `docs/progress-log.md`

### Validation
1. `cd apps/world-server-go && go test ./...` passed
2. `cd apps/mm-core-rs && cargo test` passed
3. `pnpm --filter web lint` passed
4. `pnpm --filter web typecheck` passed
5. `pnpm --filter web test` passed
6. `pnpm --filter web build` passed

### Notes
1. Fake client integration tests now cover interactions in addition to combat/crafting/block actions.

---

## Checkpoint CP-0073 (2026-02-20)

### Completed
1. Expanded fake-client coverage to include:
   - jump input propagation via WS,
   - leave action removal via WS.

### Files touched
1. `apps/world-server-go/cmd/world-server/ws_integration_test.go`
2. `docs/progress-log.md`

### Validation
1. `cd apps/world-server-go && go test ./...` passed

### Notes
1. WS fake-client suite now exercises join, input (incl. jump), leave, block, combat, interact, hotbar, craft, container, and world flags/directives.

---

## Checkpoint CP-0074 (2026-02-20)

### Completed
1. Added remote player rendering for multiplayer:
   - client now spawns sprites/shadows for other players from runtime snapshots,
   - interpolates their positions and animates frames based on speed.

### Files touched
1. `apps/web/src/components/WorldCanvas.tsx`
2. `docs/progress-log.md`

### Validation
1. `pnpm --filter web typecheck` passed

### Notes
1. Remote players now appear in the world and move smoothly based on authoritative snapshots.

---

## Checkpoint CP-0075 (2026-02-20)

### Completed
1. Cleaned up HUD help text to include interaction + jump controls.
2. Removed unused helper to keep lint clean.

### Files touched
1. `apps/web/src/components/WorldCanvas.tsx`
2. `docs/progress-log.md`

### Validation
1. `pnpm --filter web lint` passed
2. `pnpm --filter web test` passed
3. `cd apps/world-server-go && go test ./...` passed

### Notes
1. Test suite now green after latest gameplay additions.

---

## Checkpoint CP-0076 (2026-02-20)

### Completed
1. Hardened OpenClaw ingest + event feed:
   - added directive rate limit per tick,
   - added cursor-backed event feed with optional limit.
2. Added tests for cursor persistence and rate limits.

### Files touched
1. `apps/world-server-go/cmd/world-server/main.go`
2. `apps/world-server-go/cmd/world-server/main_test.go`
3. `docs/progress-log.md`

### Validation
1. `cd apps/world-server-go && go test ./...` passed

### Notes
1. OpenClaw event feed now supports `cursor` + `limit` query params and bounded directive intake.

---

## Checkpoint CP-0077 (2026-02-20)

### Completed
1. Added chunk-distance scoped block delta replication to reduce far-client updates.
2. Added integration test to ensure nearby clients receive block deltas while far clients do not.

### Files touched
1. `apps/world-server-go/cmd/world-server/main.go`
2. `apps/world-server-go/cmd/world-server/ws_integration_test.go`
3. `docs/progress-log.md`

### Validation
1. `cd apps/world-server-go && go test ./...` passed

### Notes
1. Block delta replication now uses a chunk radius of `2` with `worldChunkSize = 64`.

---

## Checkpoint CP-0078 (2026-02-20)

### Completed
1. Added authoritative health state with combat-driven damage/heal effects.
2. Health updates now replicate to owning clients via `health_state` envelopes.
3. Added unit + integration coverage for health state replication.
4. HUD hearts now reflect server health state.

### Files touched
1. `apps/world-server-go/cmd/world-server/main.go`
2. `apps/world-server-go/cmd/world-server/main_test.go`
3. `apps/world-server-go/cmd/world-server/ws_integration_test.go`
4. `apps/web/src/lib/runtime/protocol.ts`
5. `apps/web/src/lib/runtime/local-runtime-client.ts`
6. `apps/web/src/lib/runtime/ws-runtime-client.ts`
7. `apps/web/src/lib/runtime/ws-runtime-client.test.ts`
8. `apps/web/src/components/WorldCanvas.tsx`
9. `docs/progress-log.md`

### Validation
1. `cd apps/world-server-go && go test ./...` passed
2. `cd apps/mm-core-rs && cargo test` passed
3. `pnpm --filter web lint` passed
4. `pnpm --filter web typecheck` passed
5. `pnpm --filter web test` passed
6. `pnpm --filter web build` passed

### Notes
1. Damage/heal values are slot-based and deterministic (melee/spell/bomb damage, bandage heal).

---

## Checkpoint CP-0079 (2026-02-20)

### Completed
1. Added downed-state handling on the client:
   - movement and jumping are suppressed when health is `0`,
   - HUD toasts fire on downed/recovered transitions.

### Files touched
1. `apps/web/src/components/WorldCanvas.tsx`
2. `docs/progress-log.md`

### Validation
1. `pnpm --filter web lint` passed
2. `pnpm --filter web typecheck` passed
3. `pnpm --filter web test` passed
4. `pnpm --filter web build` passed

### Notes
1. Downed recovery currently relies on self-heal items (bandage).

---

## Checkpoint CP-0080 (2026-02-20)

### Completed
1. Added server-authoritative NPC/wild-mon health, defeat, and loot drops.
2. Broadcast `world_event` envelopes for `entity_defeated`.
3. Added client runtime subscriptions for world events and surfaced defeat toasts.
4. Added test coverage for entity defeat world events + loot replication.

### Files touched
1. `apps/world-server-go/cmd/world-server/main.go`
2. `apps/world-server-go/cmd/world-server/main_test.go`
3. `apps/world-server-go/cmd/world-server/ws_integration_test.go`
4. `apps/web/src/lib/runtime/protocol.ts`
5. `apps/web/src/lib/runtime/local-runtime-client.ts`
6. `apps/web/src/lib/runtime/ws-runtime-client.ts`
7. `apps/web/src/lib/runtime/ws-runtime-client.test.ts`
8. `apps/web/src/components/WorldCanvas.tsx`
9. `docs/progress-log.md`

### Validation
1. `cd apps/world-server-go && go test ./...` passed
2. `cd apps/mm-core-rs && cargo test` passed
3. `pnpm --filter web lint` passed
4. `pnpm --filter web typecheck` passed
5. `pnpm --filter web test` passed
6. `pnpm --filter web build` passed

### Notes
1. Entity loot is deterministic based on `targetId` and tick; respawn uses `entityRespawnTicks = 600`.

---

## Checkpoint CP-0081 (2026-02-20)

### Completed
1. Hide defeated NPC/wild-mon targets client-side until their respawn tick.
2. Prevent combat/interact target selection from locking onto defeated entities.
3. Restore visibility automatically once respawn ticks elapse.

### Files touched
1. `apps/web/src/components/WorldCanvas.tsx`
2. `docs/progress-log.md`

### Validation
1. `pnpm --filter web lint` passed
2. `pnpm --filter web typecheck` passed
3. `pnpm --filter web test` passed
4. `pnpm --filter web build` passed

### Notes
1. Respawn visibility restoration occurs lazily in the render loop and via target selection checks.

---

## Checkpoint CP-0082 (2026-02-20)

### Completed
1. Added `world-bot` multiplayer simulation client that exercises movement, hotbar selection, combat, item use, interact, block break/place, craft, and container operations.
2. Wired bot simulation into `pnpm game:test` verify flow without blocking live play.

### Files touched
1. `apps/world-server-go/cmd/world-bot/main.go`
2. `scripts/play-server.mjs`
3. `docs/progress-log.md`

### Validation
1. `cd apps/world-server-go && go test ./...` passed
2. `pnpm --filter web lint` passed
3. `pnpm --filter web typecheck` passed
4. `pnpm --filter web test` passed
5. `pnpm --filter web build` passed

### Notes
1. Bot simulation uses deterministic block coordinates to guarantee craftable resources.
