# ADR-0001: Architecture Boundaries (Control Plane vs World Plane)

- Status: Proposed
- Date: 2026-02-12
- Owners: Platform, Gameplay

## Context

The project needs fast product iteration (auth, payments, admin) and high-performance real-time simulation (100s of concurrent players per active area). A single stack for everything increases risk in one of those dimensions.

## Decision

Split the system into clear domains:

1. Rails API ("control plane"): auth, payments, player inventory, progression, social graph, moderation, admin.
2. Rust world service ("world plane"): movement, area-of-interest (AOI), combat ticks, zone handoff, world state authority.
3. Client (Next.js + Three.js): rendering, input, prediction, reconciliation.
4. Data plane: PostgreSQL (+PostGIS) for durable state; Redis for cache/session/queues.

## Default Choice

Use Rails for all non-realtime product APIs and Rust for realtime simulation from day one. Do not implement realtime authoritative simulation in Rails.

## Alternatives Considered

1. Rails only for all backend logic.
2. Rust only backend (including auth/payments/admin).
3. Node/TypeScript realtime server.

## Consequences

Positive:

1. Keeps realtime code focused and high-performance.
2. Keeps business workflows fast to ship with Rails conventions.
3. Clear ownership boundaries for scaling and debugging.

Negative:

1. Requires explicit contracts between Rails and Rust services.
2. Adds distributed-system complexity earlier.

## Validation / Exit Criteria

1. Service contracts documented and versioned (`proto`/JSON schema).
2. End-to-end flow works: login -> enter world -> simulate movement -> persist session metadata.
3. Load tests show world service can sustain target concurrency without Rails becoming a tick dependency.

## Open Questions

1. Transport between Rails and world service: gRPC vs HTTP+NATS.
2. Single Rust service vs separate gateway and simulation workers.
