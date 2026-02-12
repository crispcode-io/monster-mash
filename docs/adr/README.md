# Architecture Decision Records

This folder contains the foundation decisions that must be locked before feature work.

## Required Fields (every ADR)

Every ADR must include these sections:

1. `Status` (`Proposed`, `Accepted`, `Superseded`, `Deprecated`)
2. `Date` (ISO `YYYY-MM-DD`)
3. `Context`
4. `Decision`
5. `Consequences`
6. `Alternatives Considered`
7. `Default Choice`
8. `Validation / Exit Criteria`
9. `Open Questions`

## Ratification Order

1. `ADR-0001-architecture-boundaries.md`
2. `ADR-0002-world-coordinate-and-scale.md`
3. `ADR-0003-spatial-partitioning-h3.md`
4. `ADR-0004-realtime-server-authority.md`
5. `ADR-0005-networking-tick-and-state-sync.md`
6. `ADR-0006-deterministic-simulation-core.md`
7. `ADR-0007-data-taxonomy-and-regional-variants.md`
8. `ADR-0008-asset-generation-pipeline.md`
9. `ADR-0009-security-and-compliance-baseline.md`
10. `ADR-0010-load-testing-and-capacity-plan.md`
11. `ADR-0011-observability-slo-baseline.md`

## Working Rule

No new gameplay subsystem starts until ADR-0001 through ADR-0006 are `Accepted`.
