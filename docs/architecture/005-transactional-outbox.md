# ADR 005: Enrollment notifications use a transactional outbox

## Status

Accepted.

## Context

Course assignments, audit records, and email queue jobs were written in separate commits. A process failure after the assignment transaction could leave a valid enrollment without an audit record or notification. Retrying the web request could then change assignment state again or enqueue duplicate messages.

## Decision

The enrollment transaction now writes three kinds of state atomically:

1. direct assignments, group assignments, and pending course invitations;
2. the assignment audit event;
3. semantic notification events in `OutboxEvent`.

The email worker claims outbox rows with a time-limited lease and a unique claim token. It converts each event to regular `EmailJob` rows and marks the event processed in one transaction. A crashed worker leaves a leased event that becomes claimable again after the lease expires. Failed events use exponential backoff and become `DEAD` after the configured attempt limit.

Outbox topics are versioned. Their payload is stored as JSON and routed by an application-level handler. Unknown or malformed topics fail explicitly instead of being silently discarded.

## Consequences

Assignment state, audit history, and the intent to notify cannot diverge at commit time. SMTP delivery remains asynchronous and retains the existing retry behavior of `EmailJob`.

The email worker must be running in production. Operational monitoring should alert on `FAILED`, stale `PROCESSING`, and `DEAD` outbox rows.
