# ADR 008: Course management separates shell, orchestration, and reads

## Status

Accepted.

## Context

After extracting individual management sections, the route page still owned the page header, navigation, attention UI, redirect-aware section selection, and a large anonymous `Promise.all` containing core, operational, and section-specific database reads.

## Decision

`CourseManagementShell` owns breadcrumbs, course summary, navigation, and attention presentation. Section selection is a pure policy that validates requested URLs, respects permissions, and redirects action results to the section that owns the message.

The read side has three named concurrent streams:

- `readCourseManagementCore` loads the stable course and structure snapshot;
- `readCourseManagementAttention` loads lightweight cross-section counters;
- `readCourseManagementSection` loads only collections declared by the active-section load policy.

`getCourseManagementData` remains the composition boundary. It executes the three streams concurrently and returns one UI-facing model, but no longer contains their Prisma query details.

Section-level orchestration loaders may compose additional reads and pure projections. `getCourseReportViewModel` owns learner discovery, progress reads, completion calculation, required-quiz classification, metrics, and course-version comparison. `getCourseStructureViewModel` owns structure grouping, editor selection, presentation-preview discovery, preview links, and passing-setting normalization. `getCourseBasicsViewModel` owns metadata projection, absolute course links, and cover-source discovery. Each loader runs only for its active section, so filesystem work and section-specific calculations do not leak into unrelated tabs.

`selectCourseManagementViewModel` is the pure UI composition boundary for the shell and lightweight section projections. It owns permission-filtered tabs, attention cards, return navigation, assignment-directory preparation, survey statistics, and shell counters. Time-dependent expiry calculation receives an explicit clock in tests. The route passes data and permissions into this boundary instead of reproducing presentation rules.

`selectCourseManagementRequest` is the input boundary for Next.js `searchParams`. It normalizes single and repeated query values, selects the permitted active section, validates the review filter, and groups action results into section-owned message contracts. Components do not read raw query parameter names, and adding a redirect message requires updating one request projection rather than the page renderer.

`getCourseManagementPageModel` is the server-only page orchestration boundary. It loads the section-aware read model, builds the shared shell model, invokes only the active section loader, and returns a discriminated section union with ready component props. `CourseManagementSectionRenderer` exhaustively maps that union to section components. The route itself performs access resolution, request projection, not-found handling, and composition only; it neither unpacks persistence reads nor coordinates section calculations.

## Consequences

The route is a thin delivery adapter instead of a layout, reporting, editor-preparation, or read-model service. Navigation, selection, and metadata behavior can be tested without React or a database. Database reads are named by purpose, while latency remains parallel. New management sections must declare load-policy needs, add their read or view-model loader at the orchestration boundary, and extend the exhaustive section renderer rather than expanding the route.
