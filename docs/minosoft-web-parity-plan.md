# Minosoft -> Monster Mash Web Parity Plan

Updated: 2026-02-15

Superseded by:
`docs/max-performance-parity-plan.md` for strict max-performance execution details.

## Constraint
1. A literal 1:1 source-code port is not practical:
   - Minosoft is Kotlin/JVM + OpenGL client architecture.
   - This project is browser-first (Three.js/Web runtime).
2. We should port behavior/contracts, not copy internals.

## Parity Targets (Behavior-Level)
1. Voxel world rendering + chunk streaming.
2. Block interactions (break/place/mining semantics).
3. Combat + hotbar/item selection.
4. Inventory and container GUI behavior.
5. Entity simulation and interpolation.
6. Multiplayer protocol + authoritative server loop.
7. Debug overlays/performance counters.

## Current Delivery (CP-0013)
1. Deterministic voxel chunk generation.
2. Instanced voxel rendering for web performance.
3. Left-click target attack fallback to block break.
4. Right-click adjacent block placement.
5. Existing hotbar HUD integrated with voxel interactions.

## Performance Path (Web + Low-Level)
1. Keep rendering in Three.js for fast iteration.
2. Move performance-critical simulation into a low-level module:
   - Preferred: Rust/C++ compiled to WebAssembly for:
     - voxel meshing,
     - block-light propagation,
     - collision broadphase,
     - chunk compression/serialization.
3. Keep protocol/orchestration in TypeScript + Go server boundary.
4. Run OpenClaw Go as world-orchestration service (event-driven, not per tick).

## Next Implementation Order
1. Authoritative server sim for block edits + movement.
2. WS protocol parity test: local runtime vs dedicated server runtime.
3. Chunk delta replication (`block_set`, `block_remove`, `chunk_patch`).
4. WASM meshing module drop-in behind current voxel API.
5. Inventory/crafting/container UX and server validation.

## OpenClaw Integration Boundary
1. OpenClaw does not run the physics tick.
2. OpenClaw consumes world events and emits bounded directives:
   - spawn/update NPC arcs,
   - enqueue asset intents,
   - quest/state flags.
3. Deterministic game server decides actual state transitions.
