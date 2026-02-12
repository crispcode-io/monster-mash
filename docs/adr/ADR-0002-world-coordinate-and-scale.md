# ADR-0002: World Coordinate Model and Traversal Scale

- Status: Proposed
- Date: 2026-02-12
- Owners: Gameplay, Platform

## Context

The world should map to real geography while remaining playable. Real walking times across states are too long for game pacing.

## Decision

1. Use real Earth coordinates (`WGS84` latitude/longitude) as canonical location storage.
2. Apply a traversal compression factor for movement simulation.
3. Keep ecology and species spawning tied to real-world geo cells, not compressed distances.

## Default Choice

Start with `distance_compression = 50x` (1 game km represents 50 real km). This yields multi-hour inter-state travel while preserving real location ordering and neighborhood structure.

## Alternatives Considered

1. 1:1 real scale (too slow for gameplay).
2. Fully fictional map (loses educational and geospatial goals).
3. Highly aggressive compression (e.g., 200x; harms sense of distance).

## Consequences

Positive:

1. Preserves real map semantics and educational value.
2. Supports "hours to cross states" requirement.
3. Lets us tune only one scale constant as needed.

Negative:

1. UI/UX must clearly explain compressed travel expectations.
2. Some real-world speed assumptions require balancing for fairness.

## Validation / Exit Criteria

1. Prototype route check: Austin -> Los Angeles target travel band is 6-12 in-game hours by walking baseline.
2. Spawn region mapping remains correct when crossing regional boundaries.
3. No precision drift for long-duration movement sessions.

## Open Questions

1. Whether mounts/vehicles should use separate compression multipliers.
2. Whether off-road vs road paths should use map-cost weighting.
