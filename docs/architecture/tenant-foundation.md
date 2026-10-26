# QuickServe architecture: tenant foundation

Status: first implementation slice, 26 October 2026. This is not a completed
migration or a certification of tenant isolation across the application.

## Decision

Keep managed PostgreSQL on Supabase, Supabase Auth, and the existing TanStack
Start application. Its server functions already provide a backend inside the
same application; introducing another framework or microservices now would add
operating complexity without a demonstrated benefit.

Use the existing restaurant_id boundary for restaurant-owned data. Do not rename
it to tenant_id or duplicate existing tables. The current model also has restaurant
groups and group memberships. Before adding business/branch entities, confirm how
these represent ownership and shared reporting; do not assume all existing
restaurants are branches of one business.

Default to pooled tables. Dedicated customer deployments remain an option but
are not implemented by this change. They would require server-side tenant routing,
automated provisioning, identical schema versions, identity mapping, and tested
per-customer backup/restore. A separate database on a shared server does not give
independent compute resources.

## Implemented

- A typed server-only restaurant access guard shared by integration runtime checks,
  menu theme generation, PDF text/vision extraction, and PDF object upload/removal.
- The guard uses the authenticated caller's RLS-bound Supabase client. It checks
  platform ownership or the current user's active membership in the requested
  restaurant. Each endpoint supplies its role policy; existing role allowances
  are preserved. Authorization lookup failures deny the operation.
- Account login changes and sign-out clear the entire React Query cache, including
  feature data and mutation entries. Old query instances are destroyed so their
  late results cannot repopulate that cache. Same-user foreground/token events
  preserve warm caches. Existing role refresh behavior remains in place.
- Behavioral regression tests cover other restaurants, other users, inactive
  memberships, insufficient roles, lookup errors, ownership, cache clearing,
  and late query responses.
- A reusable read-only database integrity audit returning counts without customer
  data. This is a diagnostic tool, not a replacement for constraints or RLS tests.

## Request path and development rules

1. The browser sends validated inputs and its authentication token to a server
   function. Browser-selected restaurant IDs are untrusted input.
2. requireSupabaseAuth validates the user and creates a per-request client.
3. A restaurant-scoped endpoint calls requireRestaurantAccess with its explicit
   allowed roles before doing work. Do not cache authorization across requests.
4. Database calls remain scoped to restaurant_id and subject to RLS. A guard
   does not replace row policies or tenant-aware foreign keys.
5. Privileged storage/admin operations run only after authorization and object
   path checks. Never return a service-role key or database password.
6. Multi-record business changes use an atomic database function/transaction.
   Background jobs and MCP tools must enforce equivalent scope and permissions.

The new guard is role-based to preserve existing endpoint semantics. It does not
replace the application's feature-grant model. Any future capability-based guard
must use the database's authoritative grant rules, including explicit revocations.
Public QR ordering and booking have different token-based authorization and must
not be forced through the signed-in staff guard.

## Read-only production findings

The inspected Supabase project matches the project configured in source.
All inspected public ordinary tables had RLS enabled. The six relationships in
`tenant-integrity-audit.sql` had zero cross-restaurant rows at inspection time.
Neither finding proves that all policies or business functions are correct.

Selected core foreign keys reference record IDs alone rather than the pair of
restaurant_id and record ID. Review all related policies/triggers and introduce
composite foreign keys where appropriate. Preserve each relationship's delete
semantics, particularly optional references with ON DELETE SET NULL, so restaurant
IDs cannot accidentally become null during deletion.

The advisors reported unindexed foreign keys and public SECURITY DEFINER functions.
Public booking/QR functions can intentionally require anonymous execution; review
bodies and grants individually rather than revoking public execution wholesale.
Worker-only tables with RLS and no policies can intentionally deny client access.

Advisor references:
- https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys
- https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public

## Remaining implementation, in order

1. Establish a separate staging database and anonymized fixtures. Verify migrations
   reproduce the deployed schema. Configure distinct public project settings per
   environment instead of relying on the currently fixed production configuration.
2. Add database integration tests with two restaurants and distinct users, covering
   reads, inserts, updates, reassignment, RPCs, storage paths, and realtime access.
3. Introduce tenant-aware constraints through versioned migrations after auditing
   existing rows, testing delete behavior and locks in staging, and measuring index
   build cost. Do not silently repair production data.
4. Move remaining critical workflows behind domain services incrementally. Preserve
   current atomic payment/order/attendance RPCs instead of replacing them with
   sequences of browser writes. Unify staff credential checks without weakening
   platform-owner restrictions or explicit feature grants.
5. Audit every private browser query key, realtime subscription, local storage,
   offline queue, and mutation callback. Account cache clearing does not cancel a
   server-side mutation already executing or erase unrelated local storage. Every
   new private query key must include account ID and restaurant ID; filter all
   queries by restaurant and unsubscribe old realtime channels on scope changes.
6. Measure actual API/query latency and database resource usage under representative
   load. Add indexes based on plans, paginate lists, and aggregate reporting on the
   server. Add caching/read replicas/partitioning only for measured bottlenecks.
7. Verify existing job workers' retry, idempotency, and monitoring behavior before
   adding another queue system. Namespace jobs and caches by restaurant.
8. Define recovery targets, configure independent file backups as well as database
   backups, and exercise restoring one customer's records without overwriting
   other restaurants. Document alerts, rollback, and incident ownership.

## Release and validation

This change contains no schema migration and does not modify production data.
Use the existing pull-request CI (build, TypeScript, contracts, lint) before merging.
A source merge is not proof that a deployment is live; verify the actual host and
smoke-test login, restaurant switching, menu editing, and sign-out after deployment.
