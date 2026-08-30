# ADR 009: Course commands use thin delivery adapters

## Status

Accepted.

## Context

Course management mutations were collected in one large `course-actions.ts`. The file mixed HTTP form parsing, authorization, redirects, business validation, calculations, Prisma writes, audit records, and publication snapshots. This made transaction boundaries difficult to see and allowed rules to be duplicated in UI-facing code.

## Decision

There is no shared course-action monolith or compatibility barrel. Callers import a subject adapter directly:

- `course-settings-actions.ts` for metadata and progression settings;
- `course-content-actions.ts` for modules, materials, quizzes, and questions;
- `course-assessment-actions.ts` for attempts and manual review;
- `course-creation-actions.ts` for course creation and copying;
- `course-enrollment-actions.ts` for assignments and learner access;
- `course-feedback-actions.ts` for feedback moderation;
- `group-actions.ts` for group administration.

Server Actions remain responsible for the delivery protocol only: authorization, `FormData` normalization, calling a use case, cache invalidation, and redirect/result mapping. Shared input normalization lives in the framework-independent `course-action-input.ts` module.

Course settings and lifecycle commands execute through the course application layer. Pure domain policies own progression normalization, lifecycle transitions, publication validation, and assigned-audience confirmation. Prisma repositories implement application ports and keep the primary mutation, draft marker or publication snapshot, and audit event in one transaction.

Course content mutations execute through the content application layer. Quiz ownership checks, server-side question ordering, the content mutation, and the unpublished-change marker share one transaction. Enrollment assignment replacement already follows the same pattern and writes notification outbox events atomically with assignments and audit.

The application and domain import restrictions are enforced by ESLint. Additional adapter-specific restrictions prevent the migrated settings and content adapters from regaining direct Prisma or infrastructure imports. The transport parser is also prevented from depending on Next.js or persistence.

## Consequences

Business rules and atomicity can be tested without invoking Next.js. UI components no longer depend on a catch-all action module, and changes in one course-management subject do not invalidate every action consumer. Publication cannot be committed without its snapshot and audit record, and content changes cannot be committed without their draft marker.

Remaining subject adapters may still contain read-side preparation or legacy commands. They are now isolated migration units: each can be moved behind its own application port without recreating the monolith or changing imports across unrelated UI sections.
