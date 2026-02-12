# ADR-0008: Asset Generation, Review, and Versioning Pipeline

- Status: Proposed
- Date: 2026-02-12
- Owners: Content, Platform

## Context

Large-scale generated mon art/animation requires quality control, moderation, and immutable versioning.

## Decision

All generated assets flow through an asynchronous pipeline:

1. Request -> generation job queue.
2. Automated checks (format, safety heuristics, animation completeness).
3. Human moderation/approval for publish.
4. Content-addressed storage with immutable version hash.

## Default Choice

1. Generation is offline/async, never in critical gameplay request path.
2. Published assets are immutable by hash; updates create new versions.
3. Gameplay references versioned asset manifests.

## Alternatives Considered

1. On-demand generation during gameplay.
2. Mutable assets with in-place replacement.
3. No moderation stage.

## Consequences

Positive:

1. Stable runtime performance.
2. Safer content quality and legal/compliance control.
3. Reproducible builds and rollbacks.

Negative:

1. More operational process for content release.
2. Discovery flow must handle generation wait states.

## Validation / Exit Criteria

1. Failed generation jobs are retriable and traceable.
2. Asset manifest rollbacks are possible without downtime.
3. Runtime never blocks on generation provider latency.

## Open Questions

1. Moderation staffing model and SLA.
2. Storage/cdn strategy and cost controls for animation variants.
