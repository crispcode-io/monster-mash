# ADR-0006: Deterministic Simulation Core

- Status: Proposed
- Date: 2026-02-12
- Owners: Gameplay

## Context

Combat, breeding, and evolution systems need replayability and test determinism across environments.

## Decision

Implement the core game simulation in Rust with deterministic rules:

1. Fixed-step updates.
2. Seeded pseudo-random source tied to deterministic seeds.
3. Deterministic event ordering for entities within each tick.

## Default Choice

1. Rust crate shared between world server and offline validator tools.
2. Critical numeric paths use deterministic math policy (fixed-point or constrained float paths validated by replay tests).
3. RNG seed derivation: `hash(match_or_world_event_id + tick + salt)`.

## Alternatives Considered

1. Separate gameplay logic implementations for client/server.
2. Non-deterministic floats without replay verification.
3. Scripting language runtime as main sim engine.

## Consequences

Positive:

1. Replays enable debugging and anti-cheat audits.
2. Safer balance changes via regression replay packs.
3. Cleaner contract for future AI/bot simulation.

Negative:

1. Higher up-front engineering rigor.
2. Deterministic constraints can slow rapid prototyping.

## Validation / Exit Criteria

1. Replay tests produce byte-identical event streams across repeated runs.
2. Seed-only replay can reconstruct outcomes without external state drift.
3. CI gate rejects nondeterministic changes in protected systems.

## Open Questions

1. Which specific math library/policy to standardize for deterministic numeric behavior.
2. Scope boundary for deterministic-only logic vs presentational-only logic.
