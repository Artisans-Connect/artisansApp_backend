# CraftMatch backend wiki brief

This wiki documents **only the `artisansApp_backend` repository**. It is a
backend implementation and API reference, not a complete CraftMatch product
wiki.

## Scope

Document the Express/TypeScript API, Supabase schema and migrations, server
configuration, authentication and authorization, background jobs, notifications,
tests, and the operational/development workflows owned by this repository.

The canonical endpoint contract is the OpenAPI material in `src/docs/` and the
route handlers in `src/routes/`. When the two differ, call out the discrepancy
instead of inventing behavior.

## Product boundary

The mobile/web frontend, verification portal, and any deployment infrastructure
outside this repository are separate systems. They may be mentioned only when a
backend API, release endpoint, database contract, or integration boundary makes
the relationship relevant. Do not document their UI flows, state management,
or deployment details as facts; link to their owning repository where a source
is known, or label the information as an external dependency/TODO.

Every overview page should make the backend-only boundary clear. Prefer terms
such as "API consumer" or "client application" unless this repository contains
direct evidence for a specific client behavior.

## Quality bar

Ground claims in the checked-in source, tests, migrations, and existing project
documentation. Never reproduce secret values or inspect ignored paths. Mark
assumptions, gaps, and externally owned behavior explicitly. Keep documentation
useful to both engineers and coding agents: include request flows, important
data invariants, failure behavior, and links to the source of truth.
