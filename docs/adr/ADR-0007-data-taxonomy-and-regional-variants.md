# ADR-0007: Taxonomy Canonicalization and Regional Variants

- Status: Proposed
- Date: 2026-02-12
- Owners: Data, Gameplay

## Context

Creatures from different locations should share species logic while allowing regional aesthetics and spawn differences.

## Decision

1. Define a canonical `species_id` independent of region.
2. Region affects spawn weight and cosmetic variant seeds, not breeding/evolution rules.
3. Store source provenance for educational traceability.

## Default Choice

1. Canonical taxonomy table with stable internal IDs.
2. Region mapping table keyed by H3 cell and species weight.
3. Cosmetic variant generation keyed by `species_id + region_id + seed`.

## Alternatives Considered

1. Per-region species definitions.
2. Fully generated species without canonical anchors.
3. Cosmetic and gameplay rules both region-specific.

## Consequences

Positive:

1. Breeding/evolution consistency across world regions.
2. Better data integrity and migration safety.
3. Easier educational content linking.

Negative:

1. Requires taxonomy governance process.
2. Up-front data modeling work before content scale-up.

## Validation / Exit Criteria

1. Same canonical species behaves identically across at least two regions.
2. Variant visual differences occur without rule divergence.
3. Data ingestion pipeline rejects taxonomy collisions.

## Open Questions

1. Which external taxonomy references to adopt as primary sources.
2. Policy for subspecies or disputed classifications.
