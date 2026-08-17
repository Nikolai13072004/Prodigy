# ADR 007: Course management uses a read-side query service

## Status

Accepted.

## Context

The course management page directly executed Prisma queries for course content, assignments, users, groups, reviews, feedback, email jobs, and learner progress. It also rendered every management section in one file. This coupled the React page to the database schema and made UI decomposition risky.

## Decision

Course management reads are composed by a server-only query service under `manage/_queries`. The page consumes its returned read model and contains no direct Prisma import or query. A scoped ESLint rule prevents direct database access from returning to management UI components.

Every substantial management section is extracted into a dedicated server component: structure, basics, access, assignments, reports, feedback, and survey. Manual reviews retain their existing dedicated component. Editor selection from URL identifiers, assignment-directory shaping, assigned-learner merging, per-learner completion, survey statistics, and required-quiz report classification are pure, tested projections over the read model. Existing Server Actions, URLs, form fields, and visual behavior remain unchanged.

The query service is a read-side web composition layer, not a domain module. It may combine information from content, enrollment, assessment, survey, identity, and operational email data, but it must not mutate state or become an owner of their business rules.

The read model is section-aware. A pure load policy maps the active management section to its optional collections. The base course snapshot and lightweight attention counters are shared, while learner directories, messaging audiences, progress, quiz attempts, reviews, feedback, survey responses, reusable survey templates, and email history are loaded only by the sections that render them. Filesystem preview discovery is likewise limited to structure and basics.

## Consequences

The management page is a database-independent coordinator for authorization, active-section selection, read-model composition, and section rendering. Section components own their forms and relevant Server Action bindings. Prisma selection remains centralized, and opening a lightweight editor section no longer pays the database and serialization cost of every reporting section. Persistence relations are converted to explicit UI projections before reaching assignment and report components.

The load policy is covered by unit tests so future sections must declare their data needs explicitly. Further UI extraction should proceed one section at a time.

The core course selection returns only quiz fields used by management (`id`, limits, threshold, and question identifiers for version comparison). Unused per-item survey relations and complete quiz question records are not part of the base snapshot. Course-version comparison executes only for reports.

Course progress no longer imports the mixed server access utility to classify quiz outcomes. The outcome rule belongs to the assessment domain, while `lib/access` only re-exports it for compatibility. This keeps progress and report projections executable in unit tests without Prisma or the Next server runtime.
