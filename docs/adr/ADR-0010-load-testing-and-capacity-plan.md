# ADR-0010: Load Testing and Capacity Plan

- Status: Proposed
- Date: 2026-02-12
- Owners: Platform, SRE

## Context

The project target is 100s of concurrent players. Capacity assumptions must be proven before feature expansion.

## Decision

Create repeatable synthetic load tests for world and API tiers, including swarm-scale bot clients.

## Default Choice

1. Use containerized bot runners orchestrated via Docker Swarm for early local/distributed load tests.
2. Run scheduled scenarios:
   - Idle concurrency soak
   - AOI crowding hotspot
   - Zone handoff churn
   - Auto-battle burst windows
3. Define MVP capacity target:
   - 300 concurrent players in one metro shard
   - 100 nearby visible entities at hotspot
   - p95 world tick under 50 ms
   - zone handoff completion under 250 ms p95

## Alternatives Considered

1. Manual ad hoc playtests only.
2. Load testing after gameplay completion.
3. Single-machine benchmark only.

## Consequences

Positive:

1. Foundation risk discovered early.
2. Capacity planning becomes data-driven.
3. Better confidence before introducing paid discovery features.

Negative:

1. Requires bot framework and scenario maintenance.
2. Early infra complexity and cost.

## Validation / Exit Criteria

1. CI or nightly job runs at least one representative load profile.
2. Capacity report generated for each world-server release candidate.
3. Regressions fail release gate when SLO thresholds are breached.

## Open Questions

1. Bot behavior fidelity needed for meaningful combat load.
2. Swarm vs managed Kubernetes for later-stage performance testing.
