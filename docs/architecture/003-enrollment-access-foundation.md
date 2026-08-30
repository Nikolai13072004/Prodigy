# ADR 003: Enrollment access is a server-side domain decision

## Status

Accepted.

## Context

Course access can come from a direct user assignment or through one or more groups. The old implementation repeated parts of this rule in Prisma filters and helper functions and sometimes treated an expired direct assignment as if no assignment existed.

The application needs to distinguish these questions:

- does an assignment exist;
- is that assignment active now;
- which source controls the decision;
- is access unlimited or time-bound.

## Decision

The `enrollment` module owns the access decision. Repositories return assignment facts, and the domain resolves them to `UNASSIGNED`, `ACTIVE`, or `EXPIRED`.

Rules:

1. A direct assignment has priority over inherited group assignments.
2. Therefore, an expired direct assignment is an explicit expired result even if a group assignment is active.
3. Within the selected source, unlimited access wins; otherwise the latest expiry wins.
4. An expiry equal to the current time is expired.
5. UI and route guards consume the server decision and do not recalculate access independently.

## Consequences

Course pages can now tell an expired assignment from a missing assignment and show the correct expired-access experience. Existing list queries may keep a Prisma predicate for efficient filtering, but the single-course authorization decision must go through the enrollment use case.

The next enrollment slice should move assignment writes, invitations, notification dispatch, and audit recording behind explicit application commands and transactions.
