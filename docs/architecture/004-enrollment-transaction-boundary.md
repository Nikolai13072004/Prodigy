# ADR 004: Enrollment assignment writes use one application transaction

## Status

Accepted.

## Context

The course assignment Server Action previously loaded current assignments, calculated `ADD`, `REPLACE`, or `CLEAR`, and then replaced direct assignments, group assignments, and pending invitations. The reads happened before the write transaction. Two concurrent requests could therefore calculate from stale state and silently overwrite each other.

The action also contained persistence queries and recipient projection logic, making the web layer the owner of business behavior.

## Decision

The `enrollment` module owns assignment mutation.

- A pure domain planner calculates the final direct and group identifiers.
- The application command loads the current state, validates that the course is published, applies the plan, updates pending invitations, and resolves newly assigned recipients.
- The Prisma adapter performs all of those reads and writes in one interactive transaction.
- The Server Action parses form input, performs permission checks, invokes the command, queues post-commit effects, revalidates pages, and redirects.

`ADD` preserves existing assignments, `REPLACE` uses only the requested assignments, and `CLEAR` removes all assignments. `REPLACE` and `CLEAR` remove all pending course invitations; `ADD` replaces only invitations for the affected email addresses.

## Consequences

Assignment state can no longer be calculated outside its write transaction, and the web layer no longer writes assignment tables directly. Course publication is revalidated inside the transaction, even though the action also performs an early user-facing check.

Email queue writes and audit writes are still post-commit side effects. The next infrastructure step is a transactional outbox so assignment changes and required side effects cannot diverge when a process fails after commit.
