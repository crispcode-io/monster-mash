# ADR-0005: Networking Tick Rate and State Synchronization

- Status: Proposed
- Date: 2026-02-12
- Owners: Gameplay, Platform

## Context

Realtime feel depends on fixed simulation cadence, bandwidth discipline, and robust client smoothing.

## Decision

Use fixed-step simulation with snapshot deltas:

1. Server sim tick at fixed frequency.
2. Inputs timestamped by client tick and validated server-side.
3. Snapshot deltas and correction messages broadcast to interested clients only (AOI-based).

## Default Choice

1. Server tick: `20 Hz`
2. Snapshot send rate: `10 Hz`
3. Input send rate: `20 Hz`
4. Client interpolation buffer: `100 ms`
5. Reconciliation window: up to `250 ms` of rewound predicted state

## Alternatives Considered

1. 30/60 Hz server tick at MVP stage.
2. Variable-step simulation.
3. Full-state snapshots only.

## Consequences

Positive:

1. Predictable CPU and networking budget.
2. Adequate responsiveness for auto-battle and overworld traversal.
3. Lower bandwidth than full-state replication.

Negative:

1. Requires robust delta encoding and sequence handling.
2. Tuning needed for poor network conditions.

## Validation / Exit Criteria

1. 95th percentile correction magnitude remains under defined threshold in playtests.
2. Packet loss test (5-10%) remains playable with bounded rubber-banding.
3. Bandwidth per client stays under budget target for mobile and desktop.

## Open Questions

1. Protocol format for snapshots (flatbuffers/protobuf/custom binary).
2. WebSocket-only vs UDP sidecar for future phases.
