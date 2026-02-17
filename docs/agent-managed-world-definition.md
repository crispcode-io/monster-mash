# Agent-Managed World Definition

Updated: 2026-02-15

## What "Agent-Managed World" Means (for this project)

It does **not** mean an LLM runs the world per simulation tick.

It means:
1. The authoritative game server runs deterministic ticks (movement/combat/chunks/persistence).
2. An agent orchestrator runs **out-of-band** on events and intervals.
3. The orchestrator emits bounded world directives (quests, spawn policies, faction mood shifts, background asset intents).

## Why Not Per-Tick Agent Control

Per-tick LLM control is too expensive and unstable for realtime simulation.

OpenClaw/PicoClaw docs also describe serialized/queued agent loops per session, which is not a realtime MMO tick model.

## Practical Scale Target

Target: Minecraft-like cooperative scale (1-12 concurrent players), not high-concurrency MMO shards yet.

## Runtime Split (required)

1. **World Simulation Service (authoritative)**
   - Fixed ticks
   - Player inputs
   - Combat/state decisions
   - Chunk streaming and persistence

2. **World Orchestrator Service (agent-driven)**
   - Consumes event stream from simulation
   - Runs every N seconds + on major events
   - Emits directives with TTLs and safety limits

3. **Asset Pipeline Service (async)**
   - Optional upgrades only
   - Never blocks gameplay

## NPC Management Strategy (cost-safe)

Do not spawn one always-on agent per NPC.

Use three layers:
1. **Baseline NPC brain**: deterministic utility/FSM loop for all NPCs.
2. **Focused NPC enrichment**: LLM calls only for nearby/important NPCs.
3. **Narrative escalation**: orchestrator triggers bigger world changes on critical events.

## Event-Driven Orchestrator Contract

Input events (examples):
1. `player_enter_chunk`
2. `npc_killed`
3. `faction_relation_changed`
4. `quest_completed`
5. `boss_spawned`

Output directives (examples):
1. `spawn_rule_update`
2. `quest_arc_inject`
3. `npc_memory_patch`
4. `world_state_flag_set`
5. `asset_intent_enqueue`

## picoclaw vs raw Kimi K2.5

### Recommended approach

Use **both**, with strict boundaries:

1. **picoclaw/OpenClaw layer**
   - Agent runtime, queueing, sub-agent orchestration, tooling wrappers.
   - Good for background orchestration workflows.

2. **Kimi K2.5 model provider**
   - Model backend for reasoning/planning prompts.
   - Selected per task profile (cheap vs high-quality).

### Why this split

1. You keep orchestration/runtime controls independent from one model vendor.
2. You can swap providers without rewriting orchestration logic.
3. You keep deterministic simulation outside agent runtime.

## Throughput/Cost Guardrails

1. Run orchestrator on interval (for example every 2-5 seconds for active regions, 30-120 seconds for background regions).
2. Per-player and per-region token budgets.
3. Max concurrent sub-agents capped.
4. Hard fallback: if orchestrator is down, simulation continues with deterministic defaults.

## TDD-First Build Order (updated)

1. Lock event schema and directive schema.
2. Build simulation event emitter and replay tests.
3. Build orchestrator adapter with mock model responses.
4. Add policy tests: same event sequence -> deterministic directive set.
5. Integrate real model provider after tests pass.

## Immediate Next Step

Implement Step 2 in game repo with tests first:
1. manifest overlay and hot-swap path using mock asset client
2. event bus hooks from world state transitions
3. no dependency on live asset generation
