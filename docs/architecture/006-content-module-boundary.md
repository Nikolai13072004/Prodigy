# ADR 006: Course structure belongs to the content module

## Status

Accepted.

## Context

Course modules and items were managed directly by a large Server Action file. Validation, ownership checks, ordering reads, persistence writes, archival, cover updates, and the `hasUnpublishedChanges` projection happened across separate calls. The web layer therefore owned business behavior, and a concurrent request could observe an intermediate state.

## Decision

The `content` module owns the existing course structure behavior:

- module creation, update, and archival;
- item creation, update, movement, and archival;
- validation that a module and item belong to the requested course;
- deterministic ordering inside module boundaries;
- creation of the default first module;
- marking a published course as having unpublished changes.

Every command executes through an application port and one interactive repository transaction. The web action remains responsible for permission checks, parsing and sanitizing form input, presentation concerns, revalidation, and redirects.

Creation of a survey item does not make `content` the owner of survey behavior. The web adapter provides a ready nested survey specification; future survey commands remain in a separate module.

## Enforced dependency rules

ESLint enforces these boundaries:

- domain cannot import Next.js, React, UI, Prisma, infrastructure, or server facades;
- application cannot import Next.js, React, UI, Prisma, infrastructure, or server facades;
- infrastructure and server facades cannot import the app or component layers.

## Consequences

Structure invariants are testable without Next.js or a database. Prisma implementation details are isolated. Existing forms and URLs retain their behavior.

The next content step is a management query/view-model service and decomposition of the large manage page. Optimistic concurrency for simultaneous editors should be introduced before supporting multi-instance editing.
