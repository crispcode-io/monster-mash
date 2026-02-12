# ADR-0009: Security and Compliance Baseline

- Status: Proposed
- Date: 2026-02-12
- Owners: Platform, Security

## Context

User accounts, location-linked gameplay, and payments create material security and privacy risk from day one.

## Decision

Define non-negotiable baseline controls before beta traffic:

1. PII minimization and explicit data retention policy.
2. Coarse location storage for gameplay where exact precision is unnecessary.
3. Payment isolation through Stripe and tokenized payment data only.
4. Auth hardening (MFA-ready model, secure session lifecycle, key rotation).
5. Rate limits and abuse detection at API and world ingress.

## Default Choice

1. OAuth/email auth with short-lived access tokens and rotating refresh tokens.
2. Location precision clamped for persisted analytics records.
3. Structured audit logs for security-sensitive actions.

## Alternatives Considered

1. Security hardening deferred until after MVP.
2. Store exact location history by default.
3. Build in-house payment vaulting.

## Consequences

Positive:

1. Reduced risk and better launch readiness.
2. Clear compliance path as user base grows.
3. Better incident response via auditability.

Negative:

1. Slightly slower initial product iteration.
2. Additional platform engineering effort.

## Validation / Exit Criteria

1. Threat model documented for auth, payments, and world ingress.
2. Security test checklist passes (token/session, authz, rate limits).
3. Audit logging verifies actor/action/resource on critical events.

## Open Questions

1. Age-gating and parental consent policy requirements by launch region.
2. External security review timeline before public release.
