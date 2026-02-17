# Max-Performance Web Parity Plan (Minecraft-Style + OpenClaw Go)

Updated: 2026-02-16

## Phase Status
1. `P0` Foundation: In progress.
2. `P1` Authoritative Multiplayer Core: Baseline complete (local WS dev flow, movement + block edit authority).
3. `P2` WASM Performance Core: In progress (Rust core crate + web bridge + occupancy-based mesh stats integrated).
4. `P3` Inventory/Combat/Entity Parity: In progress.
5. `P4` OpenClaw World Orchestration: Not started.
6. `P5` Visual Upgrade + Asset Pipeline Integration: Not started.

## Goal
Build a browser-first multiplayer game with Minecraft-like core functionality, Skyrim/Oblivion exploration feel, hybrid 2D/3D assets, and OpenClaw Go world orchestration.

## Hard Constraints
1. Maximum web performance.
2. Multiplayer-authoritative simulation.
3. OpenClaw Go compatible orchestration boundary.
4. Small, dense voxels for sharper look than classic Minecraft.
5. Behavior parity with Minecraft-style client loops (not JVM/OpenGL source parity).

## Language/Runtime Decisions
1. **Low-level core language**: Rust.
2. **Client hot path**: Rust -> WebAssembly (`wasm32-unknown-unknown`), running in a Web Worker.
3. **Server runtime**: Go (authoritative networking + OpenClaw integration).
4. **Renderer API target**:
   - Primary: WebGPU.
   - Fallback: WebGL2.
5. **JS/TS role**: shell/UI/input wiring only, minimal hot-loop logic.

Why Rust over C++ for this project:
1. Near-C++ performance in WASM.
2. Better safety for large concurrent systems.
3. Clean build pipeline for wasm + native targets.
4. Easier long-term maintainability for shared client/server simulation components.

## Engine Architecture
1. `mm-core-rs` (Rust crate, shared logic):
   - voxel storage/chunk compression,
   - deterministic simulation primitives,
   - collision broadphase,
   - lighting propagation,
   - mesh extraction (greedy + LOD variants),
   - binary chunk delta codecs.
2. `mm-client-wasm` (WASM module from Rust):
   - meshing, culling prep, block updates, light updates,
   - outputs typed buffers for GPU upload.
3. `mm-server-go`:
   - authoritative world tick,
   - player session/networking,
   - chunk replication and anti-cheat validations,
   - OpenClaw directive/event bridge.
4. `mm-openclaw-go` integration:
   - event-driven directives only (quest arcs, NPC behavior intents, world state flags),
   - no per-tick LLM calls.

## Networking Contract
1. Tick rate: `20 TPS` authoritative server.
2. Client prediction + reconciliation for movement/actions.
3. Chunk delta replication:
   - `chunk_snapshot`,
   - `block_set`,
   - `block_remove`,
   - `light_patch`,
   - `entity_delta`.
4. Serialize with FlatBuffers (or protobuf with packed buffers); keep schema versioned.

## Parity Matrix (Minecraft-Style)
Phase labels: `P0` to `P5`.

1. Terrain/chunks/streaming:
   - P0: deterministic generation + local stream.
   - P1: server snapshots + delta updates.
2. Block interactions:
   - P0: local break/place.
   - P1: server-authoritative break/place + replay-safe validation.
3. Movement/physics:
   - P0: local movement baseline.
   - P1: server-authoritative with prediction.
4. Inventory/hotbar/crafting:
   - P2: authoritative inventory + quickbar.
   - P3: crafting recipes + container GUIs.
5. Combat/entities:
   - P2: server-hit validation and entity state deltas.
   - P3: richer AI + animation graph.
6. Multiplayer world management:
   - P1: room/server sessions.
   - P3: persistence + shard/region save management.
7. Debug/perf tooling:
   - P0 onward: frame time, mesh time, chunk latency, RTT, reconciliation counters.

## Visual Direction (Your Screenshot + Small Voxels)
1. Voxel scale: use smaller voxel units than current prototype (`~0.25m` to `~0.5m` world equivalent).
2. Hybrid assets:
   - Terrain/buildings: voxel-heavy.
   - Characters/foliage/detail props: mix of 2D impostors + 3D low-poly meshes.
3. PBR-lite stylization:
   - painterly albedo atlases,
   - quantized/specular-limited shading,
   - atmospheric fog + color grading to match torchlit valley look.

## Performance Budgets (Must-Hit)
Desktop targets:
1. 120 FPS high-end desktop at normal view distance.
2. 60 FPS at 95th percentile laptops.

Runtime budgets:
1. Main thread frame budget: `< 4ms` average UI/submit work.
2. WASM worker mesh+light update budget: `< 6ms` for local chunk updates.
3. Chunk mesh upload budget: `< 2ms` average per visible chunk update.
4. Peak memory budget (client): `< 700MB`.
5. Network packet budget (active): `< 80 KB/s` average per client outside bursts.

## Delivery Plan
## P0: Foundation (Immediate)
1. Keep existing prototype loop.
2. Add perf telemetry HUD (CPU/GPU/frame/network).
3. Finalize binary protocol schema draft.
4. Define Rust/WASM module ABI.

Exit criteria:
1. Telemetry visible in-world and logged.
2. ABI + protocol docs reviewed.

## P1: Authoritative Multiplayer Core
1. Build Go server tick loop (movement + block edits + chunk state).
2. Move break/place validation to server.
3. Implement client prediction + reconciliation.
4. WS replication for snapshots/deltas.

Exit criteria:
1. Two clients can connect and see synchronized block edits.
2. No client-authoritative world mutation.

Status update (CP-0015):
1. Go WS authoritative server implemented (`apps/world-server-go`).
2. Client runtime now supports server block action requests and block delta subscriptions.
3. `WorldCanvas` block edits in `ws` mode are server-confirmed via deltas.
4. Movement snapshots are server-driven via `snapshot` envelope messages.

P1 visual validation:
1. Terminal A: `pnpm dev:world-server` (server on `:8787`).
2. Terminal B: `NEXT_PUBLIC_WORLD_RUNTIME_MODE=ws NEXT_PUBLIC_WORLD_RUNTIME_WS_URL=ws://localhost:8787/ws pnpm --filter web dev`.
3. Open two browser windows at `http://localhost:3100/world`.
4. In both windows, move around and verify runtime tick increases in HUD.
5. In either window, left-click blocks to break and right-click to place; verify block changes replicate in the other window.

## P2: WASM Performance Core
1. Implement Rust chunk meshing/light updates in worker.
2. Replace JS meshing path with WASM outputs.
3. Add frustum + occlusion culling pipeline.

Exit criteria:
1. Measurable frame-time improvement over JS baseline.
2. Stable chunk update latency under stress traversal.

Status update (CP-0016):
1. Added `apps/mm-core-rs` Rust crate with stable ABI version and mesh-stats placeholder exports.
2. Added web-side runtime bridge (`apps/web/src/lib/wasm/mm-core-bridge.ts`) with fallback-js mode for immediate integration.
3. Exposed mesh-core mode and mesh stats in world HUD for visual verification.
4. Rust toolchain is wired into gameplay test flow (`cargo test` in `pnpm game:test`).
5. WASM artifact build script is present (`pnpm wasm:build`) and will auto-fallback if wasm target is unavailable.

Status update (CP-0018):
1. `wasm32-unknown-unknown` target installation path is now handled and validated in local workflow.
2. `pnpm game:test` now builds wasm artifact (`apps/web/public/wasm/mm_core_rs.wasm`) before launching gameplay.
3. Runtime bridge loads real wasm artifact when present.

Status update (CP-0019):
1. Replaced block-count mesh HUD heuristic with occupancy-based exposed-face mesh stats via `mm_core_rs` wasm bridge.
2. Added chunk occupancy buffer generation in voxel module for deterministic Rust/JS parity.
3. Added TDD coverage:
   - `apps/web/src/lib/voxel/voxel-world.test.ts` occupancy buffer test,
   - `apps/web/src/lib/wasm/mm-core-bridge.test.ts` exposed-face stat tests.
4. `pnpm game:test` reaches playable multiplayer session with `Mesh Core: wasm` path active when artifact is present.

Status update (CP-0020):
1. MM core initialization now fails fast when wasm is unavailable (deterministic strict mode).
2. Fallback mode is no longer implicit; it requires explicit env opt-in (`NEXT_PUBLIC_MM_CORE_ALLOW_FALLBACK=true`).
3. World startup is gated on successful MM core wasm initialization.

Status update (CP-0021):
1. Added full mesh extraction ABI in `mm_core_rs` for occupancy input:
   - vertex/index count exports,
   - positions/normals/uvs/indices extraction exports.
2. Updated web wasm bridge to expose `getChunkMeshBuffersFromOccupancy(...)`.
3. Added TDD coverage for mesh buffer extraction in wasm bridge tests.
4. Verified strict-path gameplay boot via `pnpm game:test` with new ABI.

Status update (CP-0022):
1. Added browser worker mesh extraction pipeline using MM core wasm bridge.
2. World runtime now requests chunk mesh extraction asynchronously through worker client for chunk mesh stats updates.
3. Added worker protocol + client modules under `apps/web/src/lib/wasm`.
4. Verified `pnpm game:test` still passes and boots with worker integration.

Status update (CP-0026):
1. Chunk render path now consumes worker mesh buffers directly for visible terrain geometry.
2. Block interaction path remains stable using an invisible instanced pick mesh (raycast/instanceId flow preserved).
3. Worker mesh errors now report in dedicated `Mesh Worker Error` HUD field, not orchestrator error channel.
4. `pnpm game:play` and validation suite pass with strict wasm runtime.

Status update (CP-0028):
1. Server block delta replay order is now deterministic by coordinate/action sort in Go authoritative runtime.
2. Added Go tests to lock deterministic ordering and stable replay across repeated calls.
3. Added websocket runtime client protections:
   - stale snapshots are ignored,
   - cross-world snapshots are ignored,
   - malformed envelopes no longer reset state.
4. Added websocket runtime unit tests for replay safety and snapshot monotonicity.

Status update (CP-0029):
1. Added websocket client reconnect logic with bounded retry delay for dropped sessions.
2. Added session-state replay on reconnect (`join` + latest `input` per player) for multiplayer continuity.
3. Added websocket runtime tests for reconnect replay and queued pre-open join replay.
4. Revalidated web test/lint/typecheck/build and Go server tests after reconnect changes.

Status update (CP-0030):
1. Added gameplay-harness websocket integration coverage in Go for:
   - movement input while connected,
   - block placement delta replication,
   - disconnect/reconnect,
   - resumed movement + persisted block deltas after reconnect.
2. Updated authoritative server reconnect semantics:
   - transient disconnects preserve player world state,
   - explicit `leave` still removes players.
3. Added mesh telemetry rollups with tested utility:
   - global extract/upload p95,
   - active-chunk extract/upload averages,
   - tracked-chunk timing count.
4. Exposed new mesh timing metrics in in-game HUD.

Status update (CP-0031):
1. Replaced hidden instanced voxel pick mesh interaction with direct visible-mesh surface hit mapping.
2. Added voxel surface-hit resolution helpers and tests for world-point to voxel mapping and break/place adjacency.
3. Added authoritative combat/hotbar contract baseline:
   - new runtime combat action/result protocol,
   - websocket and local runtime client support,
   - Go server validation + per-slot cooldown enforcement.
4. Integrated world UI combat actions to request server authority and react to server-confirmed combat results.
5. Hardened web typecheck determinism by clearing stale TypeScript build cache before `tsc`.

Status update (CP-0032):
1. Added OpenClaw event bus skeleton in Go world server:
   - directive ingest endpoint (`POST /openclaw/directives`),
   - event feed endpoint (`GET /openclaw/events?since=<seq>`),
   - bounded event retention and queued directive limits.
2. Added deterministic directive guardrails:
   - allowlist-only directive types,
   - world-seed validation,
   - duplicate directive dedupe,
   - TTL clamp and expiry handling,
   - safe-boundary application in tick loop only.
3. Added server tests for directive guardrails, handler behavior, and directive application effects.
4. Added world/combat event emission hooks for joined/left players, block changes, and combat confirmations/rejections.

Status update (CP-0033):
1. Extended combat authority with server-side slot config validation:
   - slot kind validation,
   - required target enforcement for targeted slots,
   - world-space range checks using target coordinates.
2. Added selective combat result replication (actor + nearby players only) instead of global broadcast.
3. Added websocket integration test coverage for selective combat replication across actor/near/far clients.
4. Added runtime contract support for target world coordinates and wired world UI combat requests to send them.

Status update (CP-0034):
1. Added authoritative hotbar state in Go runtime with deterministic defaults per player.
2. Added websocket protocol for hotbar replication:
   - client `hotbar_select`,
   - server `hotbar_state`.
3. Added server-side validation for hotbar selection ownership/index bounds and world-event emission (`hotbar_selected`).
4. Added combat guardrail to reject actions for slots not currently equipped in the authoritative hotbar state.
5. Wired web runtime + world UI to consume authoritative hotbar state and submit hotbar selection through runtime contract.
6. Added Go unit/integration tests and web runtime tests for hotbar message flow.

Status update (CP-0035):
1. Extended authoritative hotbar state to include replicated item stack counts.
2. Added deterministic default consumable stacks for item slots (bandage/bomb) in Go and local runtime.
3. Added server-side item consume enforcement in combat flow:
   - accepted item actions decrement stack count,
   - depleted stacks reject with `insufficient_item`.
4. Added server replication of updated `hotbar_state` after accepted item actions.
5. Added tests for stack depletion/insufficient-item rejection, including websocket item-consume replication coverage, and kept full web/go validation green.

Status update (CP-0036):
1. Added authoritative `inventory_state` replication contract (player resource bag) for runtime clients.
2. Added deterministic resource gain on block break (`salvage +1`) in Go authoritative server and local-runtime parity path.
3. Added websocket replication of `inventory_state` on join and on break-yield updates.
4. Wired world HUD to display authoritative inventory counters (`Inventory Salvage`, `Inventory Tick`) for visual gameplay validation.
5. Added Go unit/integration coverage and web runtime parsing tests for inventory state replication.

Status update (CP-0037):
1. Added authoritative crafting request/result contract:
   - client `craft_request`,
   - server `craft_result`.
2. Implemented server-side recipe validation baseline (`craft-bandage`):
   - consumes `salvage`,
   - increments bandage stack in authoritative hotbar.
3. Added replication of post-craft states (`inventory_state`, `hotbar_state`) to connected clients.
4. Added local runtime parity for craft request handling.
5. Added gameplay input hook (`C`) to request crafting and visible HUD status feedback.
6. Added Go unit/integration and web runtime tests for craft message flow and resource/stack updates.

Status update (CP-0038):
1. Added authoritative container-state baseline for `camp-stash`:
   - container state replication (`container_state`),
   - container mutation results (`container_result`).
2. Implemented server-validated container mutations:
   - deposit and withdraw operations,
   - resource-balance guardrails and rejection reasons.
3. Added replication fanout for container/inventory updates after accepted mutations.
4. Added local runtime parity path for container actions.
5. Added gameplay test controls and HUD visibility:
   - `[` deposit salvage to stash,
   - `]` withdraw salvage from stash,
   - stash counters shown in HUD.
6. Added Go unit/integration coverage and web ws-runtime tests for container action/state flow.

Status update (CP-0039):
1. Expanded economy to minecraft/rpg-style multi-resource model:
   - `salvage`, `wood`, `stone`, `fiber`, `coal`, `iron_ore`, `iron_ingot`.
2. Added deterministic multi-resource break yields (server authoritative; local parity path).
3. Expanded crafting catalog with mixed outputs:
   - hotbar output recipes (`craft-bandage`, `craft-bomb`),
   - inventory resource output recipes (`craft-charcoal`, `craft-iron-ingot`).
4. Introduced multiplayer-safe container namespace policy:
   - shared containers: `world:*`,
   - private containers: `player:<id>:stash` (server ACL-enforced).
5. Server now sends both shared + private container state on join; UI currently operates on shared stash controls.
6. Added Go/web tests for recipe/resource/container policy updates and kept full validation green.

Status update (CP-0040):
1. Added private-stash gameplay UX on top of container ACL model:
   - `;` deposit salvage to private stash,
   - `'` withdraw salvage from private stash.
2. HUD now shows both shared stash and private stash resource summaries/ticks.
3. Added websocket integration test for private-container owner-only enforcement.
4. Kept deterministic parity and validation green after UX + ACL coverage expansion.

Status update (CP-0041):
1. Added deterministic recipe-selection UX for gameplay:
   - `6-9` selects craft recipe,
   - `R` crafts the currently selected recipe.
2. Added in-canvas craft bar UI with active selection highlight and click-to-select support.
3. Added shared craft-catalog module + tests for key/index mapping and clamped selection behavior.
4. Updated craft result HUD text to use recipe labels and aligned player guidance to the new craft flow.
5. Revalidated Go server tests and full web test/lint/typecheck/build suite.

Status update (CP-0042):
1. Expanded container gameplay UX to selected-resource transfers (not salvage-only).
2. Added deterministic stash-resource selection controls:
   - `N/M` cycles active resource,
   - clickable resource chips in HUD set active resource directly.
3. Updated shared/private stash transfer actions (`[`, `]`, `;`, `'`) to use the active selected resource.
4. Added shared runtime resource-selection helper module + tests for clamping, cycling, and label formatting.
5. Revalidated Go server tests and full web test/lint/typecheck/build suite.

Status update (CP-0043):
1. Added server-side target resolution for player `targetId` values in combat actions.
2. Combat range validation now uses authoritative server-known player coordinates when target resolves.
3. Added guardrail rejection `unknown_target` when a target ID is provided without resolvable server target data and without fallback coordinates.
4. Added Go unit/integration coverage for authoritative target coordinate resolution and websocket combat result behavior.
5. Revalidated Go server tests and full web test/lint/typecheck/build suite.

Status update (CP-0044):
1. Added directive-to-runtime adapter for non-physics world updates through websocket `world_flag_state`.
2. Go server now:
   - sends `world_flag_state` on join,
   - broadcasts `world_flag_state` when directive application changes world flags.
3. Added world-flag runtime contract in web runtime layer and ws/local client subscriptions.
4. HUD now displays replicated world flag state and world-flag tick for gameplay validation.
5. Added Go integration/unit tests and web ws-runtime tests for `world_flag_state` contract flow.
6. Revalidated Go server tests and full web test/lint/typecheck/build suite.

Status update (CP-0045):
1. Added stash transfer amount UX controls with deterministic options `x1`, `x5`, `x10`.
2. Added keyboard + HUD controls for amount selection:
   - `J/K` cycles transfer amount,
   - clickable amount chips set transfer amount directly.
3. Updated shared/private stash transfer requests to use selected transfer amount.
4. Added transfer-amount helper module + tests for clamp/cycle/resolve behavior.
5. Revalidated Go server tests and full web test/lint/typecheck/build suite.

Status update (CP-0046):
1. Added server-authored target resolution for non-player combat targets using deterministic target tokens (`chunkX:chunkZ:type:index`).
2. Go server now resolves non-player target coordinates from token + world seed, independent of client-supplied coordinates.
3. Added deterministic chunk-entity reconstruction helpers in Go to match client target-token indexing.
4. Added Go unit/integration coverage for non-player token resolution and combat acceptance without client coordinates.
5. Revalidated Go server tests and full web test/lint/typecheck/build suite.

Status update (CP-0047):
1. Expanded directive-to-runtime adapter surface beyond world flags:
   - `world_directive_state` now replicates story beats and spawn hints.
2. Go server now:
   - applies `emit_story_beat` and `spawn_hint` directives into bounded runtime state,
   - sends `world_directive_state` on join,
   - broadcasts `world_directive_state` when directive state changes.
3. Added web runtime contract + subscriptions for directive state (`storyBeats`, `spawnHints`) across ws/local clients.
4. HUD now shows directive tick, latest story beat, and spawn hint count for gameplay validation.
5. Added Go and web tests for directive-state replication and parsing behavior.
6. Revalidated Go server tests and full web test/lint/typecheck/build suite.

Status update (CP-0048):
1. Added stash split/merge transfer semantics on top of amount controls:
   - base mode clamps to available source amount,
   - `Shift` transfers half source amount,
   - `Ctrl/Alt/Cmd` transfers full source amount.
2. Added blocked-transfer guardrails in UI (no request sent when source amount is zero).
3. Added transfer-strategy helper module + tests for modifier and amount resolution behavior.
4. Updated gameplay HUD hints to expose modifier controls and active transfer behavior.
5. Revalidated Go server tests and full web test/lint/typecheck/build suite.

Status update (CP-0049):
1. Added non-authoritative world-presentation consumption of directive payloads:
   - spawn hints now render as in-world beacon markers at hinted chunk centers.
2. Kept directive-driven visuals bounded to presentation only (no physics/world-authority mutation path).
3. Extended HUD directive visibility to include summarized spawn-hint labels/chunks.
4. Revalidated Go server tests and full web test/lint/typecheck/build suite.

Status update (CP-0050):
1. Added spawn-hint lifecycle guardrails in Go runtime directive handling:
   - `ttlTicks` support with bounded clamp,
   - automatic expiry pruning,
   - explicit remove action (`action: "remove"`).
2. `advanceOneTick` now emits directive-state changes for spawn-hint expiry/removal without requiring new directives.
3. Added Go tests for spawn-hint add/expire/remove lifecycle semantics.
4. Revalidated Go server tests and full web test/lint/typecheck/build suite.

Status update (CP-0051):
1. Improved authoritative combat UX feedback in world HUD:
   - target resolution state (`pending`, `client-lock`, `server-lock`, `server-reject`),
   - readable combat rejection reason text.
2. Added server-lock detection by comparing pending client target coordinates against server-confirmed target coordinates.
3. Added combat telemetry line (`Target Resolution`) in combat panel for gameplay validation.
4. Revalidated Go server tests and full web test/lint/typecheck/build suite.

Status update (CP-0052):
1. Added story-beat presentation effect in gameplay overlay:
   - timed story-beat banner triggered by new directive story beats.
2. Banner behavior is bounded and non-authoritative:
   - visual-only, no simulation mutation,
   - auto-expire after short display window.
3. Revalidated Go server tests and full web test/lint/typecheck/build suite.

Status update (CP-0053):
1. Added bounded directive history panel in HUD (last 8 entries, newest first).
2. History now captures:
   - story-beat arrivals,
   - spawn-hint state changes/clears.
3. History entries include authoritative runtime tick context for debugging and backtracking.
4. Revalidated Go server tests and full web test/lint/typecheck/build suite.

Status update (CP-0054):
1. Added richer craft/container failure mapping in HUD:
   - reason-code to human-readable text conversion,
   - toast notifications for success/failure outcomes.
2. Added lightweight toast stack in gameplay overlay with tone styling (`info`, `success`, `error`).
3. Kept failure mapping deterministic and source-of-truth aligned to server reason codes.
4. Revalidated Go server tests and full web test/lint/typecheck/build suite.

Status update (CP-0055):
1. Added mesh/render profiling shortcuts for faster visual triage:
   - `F3` toggles diagnostics visibility,
   - `F4` switches mesh detail mode (`basic`/`detailed`).
2. Added diagnostics controls in HUD (`Diagnostics On/Off`, `Mesh basic/detailed`) for mouse-driven toggling.
3. Split diagnostics rendering:
   - basic mode: key mesh/orchestrator counters,
   - detailed mode: full timing/p95/chunk metrics.
4. Revalidated Go server tests and full web test/lint/typecheck/build suite.

Status update (CP-0056):
1. Added optional minimap/debug overlay for directive hints and chunk authority context.
2. Minimap shows:
   - current chunk center/player marker,
   - nearby spawn-hint beacons (bounded radius),
   - loaded chunk count/runtime mode/tick context.
3. Added `F5` shortcut to toggle minimap debug visibility.
4. Revalidated Go server tests and full web test/lint/typecheck/build suite.

Status update (CP-0057):
1. Added deterministic world-state export endpoint on Go server (`GET /debug/state`).
2. Export includes authoritative snapshot and key runtime state slices:
   - players/snapshot,
   - block deltas,
   - hotbar/inventory/container states,
   - world flags + directive state.
3. Added root command for capture workflow:
   - `pnpm game:dump-state` (writes JSON snapshot to `data/debug/...`).
4. Added Go handler test for debug-state export endpoint.
5. Revalidated Go server tests and full web test/lint/typecheck/build suite.

Status update (CP-0058):
1. Completed the sharp-voxel visual polish pass in the web renderer:
   - tuned tone mapping/exposure/fog/light balance,
   - increased perceived geometric detail with tighter block scale,
   - refined voxel color ramp for stronger depth readability.
2. Kept changes deterministic and render-only (no authority/simulation mutations).
3. Revalidated Go server tests and full web test/lint/typecheck/build suite.

Status update (CP-0059):
1. Implemented multiplayer-first replication scoping in Go WS runtime:
   - proximity-scoped snapshot fanout per client,
   - owner-only fanout for private player state channels.
2. Updated replication behavior for:
   - owner-scoped: `inventory_state`, `hotbar_state`, `craft_result`, `container_result`,
   - mixed: `container_state` (shared for world stash, owner-only for private stash).
3. Added Go unit/integration coverage for snapshot interest management and owner-only state replication guardrails.
4. Revalidated Go server tests and full web test/lint/typecheck/build suite.

Status update (CP-0060):
1. Added deterministic debug-state import endpoint (`POST /debug/load-state`) for replay/reseed workflows.
2. Implemented import pipeline that restores authoritative runtime slices:
   - players, block deltas, hotbar/inventory/container state, world flags, directive state.
3. Added runtime rebroadcast after import to keep connected clients in sync with restored state.
4. Added root command `pnpm game:load-state` (+ `--file`) for local backtracking restore flow.
5. Added Go tests for import/export roundtrip and debug-load handler behavior.
6. Revalidated Go server tests and full web test/lint/typecheck/build suite.

## P3: Inventory/Combat/Entity Parity
1. Authoritative inventory/hotbar actions.
2. Entity combat validation server-side.
3. Container/crafting loops.

Exit criteria:
1. Minecraft-like survival loop fully playable in multiplayer.

## P4: OpenClaw World Orchestration
1. Add event bus from server to OpenClaw Go.
2. Add bounded directives back into server.
3. Add policy/rate limits and deterministic guards.

Exit criteria:
1. AI can change world state through approved directives without violating tick determinism.

## P5: Visual Upgrade + Asset Pipeline Integration
1. Plug in asset-service outputs (2D/3D/audio) via existing contracts.
2. Add LOD/impostor transitions + style-consistency checks.
3. Add persistent world enrichment jobs.

Exit criteria:
1. World keeps Minecraft-like interactivity with higher-fidelity painterly presentation.

## OpenClaw Go Contract (Strict)
1. Inputs:
   - `world_event` (chunk entered, npc killed, quest state changed, economy deltas).
2. Outputs:
   - `world_directive` (spawn rules, quest injections, npc memory changes, asset intents).
3. Rules:
   - No direct physics/block mutation from OpenClaw.
   - Server validates and applies directives at safe boundaries.
   - Budgeted invocation windows, never per-tick.

## Immediate Next Work (Execution Order)
1. Attach event-feed cursor metadata to exported captures for replay continuity (`/openclaw/events?since` resume).
2. Add replay session script/docs (`capture -> load -> replay validation`) using one canonical command sequence.
3. Add OpenClaw event polling cursor durability and directive ingress rate limits.
4. Start chunk-level block delta interest filtering to reduce far-chunk replication overhead further.
