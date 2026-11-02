# Duplicate index cleanup

The migration removes only four redundant indexes after comparing the complete
`pg_index` definitions, access methods, tablespaces and storage options. It retains
`order_status_events_order_idx`, `order_status_events_restaurant_idx`,
`orders_restaurant_created_idx`, and `staff_time_entries_one_open_per_staff_idx`.
The retained unique partial attendance index still forbids a second open clock-in.

No tables, rows, columns, functions, RLS policies or constraints are changed.
All three table locks are acquired NOWAIT before catalog checks and drops. A busy
table aborts the whole migration rather than waiting. On success, the metadata-only
transaction briefly holds exclusive locks; zero latency impact cannot be guaranteed.
A two-second statement timeout and 100ms lock timeout are transaction-local.
No CASCADE is used. Definition drift, missing/invalid retained indexes and dependency
or protected-state changes abort before the first drop. Existing callers do not
reference these dropped names. Replay succeeds when healthy retained indexes exist.

## Verification

The isolated database test compares rows, RLS and constraints before/after, rejects
a second open clock-in, allows a later clock-in after clock-out, checks retained
index eligibility in query plans, and covers drift/protected-state/extension
failures, all-or-nothing rollback and repeat application.

## Rollback

Rollback is optional: equivalent retained indexes continue to provide the same
lookups and uniqueness. To restore the redundant copies, first verify the names
remain absent and run each command as a separate non-transactional statement on a
quiet connection. Concurrent creation avoids blocking table writes. Confirm every
new index is valid/ready after completion; failed concurrent builds need inspection.

```sql
create index concurrently order_status_events_order_created_idx
  on public.order_status_events (order_id, created_at);
create index concurrently order_status_events_restaurant_created_idx
  on public.order_status_events (restaurant_id, created_at desc);
create index concurrently idx_orders_created_at
  on public.orders (restaurant_id, created_at desc);
create unique index concurrently staff_time_entries_one_open_idx
  on public.staff_time_entries (staff_id) where clock_out is null;
```

This maintenance does not certify production capacity or resolve the local public
render saturation observed in the earlier assessment.

## Applied verification

Applied as remote migration `20261102083928_remove_verified_duplicate_indexes`.
All four retained indexes were confirmed valid and ready afterward. The retained
attendance index is still UNIQUE with `clock_out IS NULL`; all four redundant
indexes are absent. The duplicate-index advisor finding cleared, security advisor
categories stayed unchanged, and the post-change lock check found no waiting
locks on the affected tables. No application rows were modified by this migration.

The accompanying sidebar change uses a fitted single-column list on taller
screens, two columns on shorter desktop/tablet screens, and three columns on very
short landscapes. All ten primary tools and the footer controls remain reachable
without sidebar scrolling, including a wider collapsed rail at short heights.
Mobile navigation below 768px is unchanged. Verification covered 528 Chromium
layout-fixture combinations, including 320–1024px heights, 768–1440px widths,
English/Arabic, light/dark, expanded/collapsed and both shared stylesheet orders;
all controls fit inside the rail and retained at least 44px targets.
