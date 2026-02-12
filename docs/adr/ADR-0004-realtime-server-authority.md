# ADR-0004: Server-Authoritative Realtime Model

- Status: Proposed
- Date: 2026-02-12
- Owners: Gameplay, Platform

## Context

Client-authoritative movement/combat is vulnerable to cheating and state divergence, especially in an MMO context.

## Decision

The world simulation is server-authoritative:

1. Client sends intents/inputs.
2. Server validates and applies inputs on fixed ticks.
3. Server emits authoritative state snapshots/deltas.
4. Client performs local prediction and reconciles on mismatch.

## Default Choice

All movement, combat outcomes, breeding outcomes, and progression-impacting events are decided only by world servers.

## Alternatives Considered

1. Fully client-authoritative simulation.
2. Hybrid authority where client resolves combat locally.
3. Lockstep peer-to-peer model.

## Consequences

Positive:

1. Better anti-cheat baseline.
2. Deterministic replay and auditability.
3. Cleaner consistency across devices.

Negative:

1. Requires robust reconciliation and lag compensation.
2. Higher backend complexity and operational cost.

## Validation / Exit Criteria

1. Simulated cheat attempts (speed hack/teleport/input spam) fail server validation.
2. Reconciliation handles packet loss and jitter without desync storms.
3. No progression event is accepted without server signature.

## Open Questions

1. How strict rubber-banding thresholds should be in crowded zones.
2. Whether to support dead-reckoning fallback at high latency.
