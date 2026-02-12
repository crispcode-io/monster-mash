# ADR-0011: Observability and SLO Baseline

- Status: Proposed
- Date: 2026-02-12
- Owners: Platform, SRE

## Context

Realtime systems fail in ways that are hard to debug without consistent telemetry and service-level objectives.

## Decision

Adopt uniform observability across Rails and Rust services:

1. Metrics for tick timing, handoff latency, AOI fanout, queue depth, auth latency.
2. Distributed tracing across control-plane and world-plane requests.
3. Structured logs with correlation IDs.
4. Release-gating SLOs for critical paths.

## Default Choice

1. Golden signals dashboard for world and API services.
2. Error budget policy for world availability and latency.
3. Per-release telemetry checklist must pass before deployment promotion.

## Alternatives Considered

1. Logs-only debugging.
2. Service-specific observability standards.
3. Add SLOs only after public launch.

## Consequences

Positive:

1. Faster incident triage.
2. Safer scale-up and release cadence.
3. Measurable reliability commitments.

Negative:

1. Additional instrumentation overhead.
2. Requires strict telemetry schema discipline.

## Validation / Exit Criteria

1. Dashboards available for all critical services.
2. Alerting rules tested with failure injection.
3. Weekly SLO report generated from production-like environment.

## Open Questions

1. Which tracing backend and retention policy best fits projected volume.
2. Which alert routing/escalation policy to use during closed alpha.
