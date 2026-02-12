# ADR-0003: Spatial Partitioning with H3

- Status: Proposed
- Date: 2026-02-12
- Owners: Platform, Gameplay

## Context

MMO support requires deterministic spatial partitioning for spawn logic, AOI filtering, and horizontal scaling.

## Decision

Use Uber H3 hex indexing as the global spatial key across backend services.

1. Coarse shard key for process assignment.
2. Mid-resolution simulation cell for AOI and handoff.
3. Fine-resolution cell for spawn weighting and content lookup.

## Default Choice

Use layered H3 resolutions:

1. `r6` for shard assignment.
2. `r8` for simulation ownership + handoff.
3. `r10` for spawn and local ecology weighting.

## Alternatives Considered

1. S2 cells.
2. Quadtree tiles.
3. Custom geohash-only implementation.

## Consequences

Positive:

1. Single geo key model across services and analytics.
2. Predictable handoff boundaries.
3. Straightforward neighbor queries for AOI rings.

Negative:

1. H3 resolution tuning will require profiling in dense metros.
2. Additional migration work if resolutions change later.

## Validation / Exit Criteria

1. Cross-cell handoff keeps player state with no duplication/loss.
2. AOI query latency stays under budget at target concurrency.
3. Spawn lookups can be resolved from cached H3 keys without full-table scans.

## Open Questions

1. Whether to pin simulation resolution globally or allow per-region overrides.
2. Maximum AOI ring count for dense city hotspots.
