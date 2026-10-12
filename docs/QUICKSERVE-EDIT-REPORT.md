# QuickServe source edit report — 12 October 2026

## Delivery status

These changes are integrated with `jamalanas760-ship-it/quickservejo` through a reviewable branch and pull request. The database migration remains staged and has not been applied persistently. GitHub merge status is tracked by the pull request; production deployment and Lovable synchronization require independent verification. Dependency declarations and the original Bun lockfile are preserved.

The core source changes below are implemented. Browser acceptance, concurrent multi-session acceptance, and some advanced enhancements remain incomplete. This report does not claim production readiness or zero regressions.

## Implemented source changes

| Area | Behavior and location |
| --- | --- |
| Home periods | Existing presets retained. Custom inclusive date ranges, Apply and Reset, calendar validation, restaurant-timezone boundaries, URL persistence and stable query keys added in `home-period.ts`, `HomePeriodPicker.tsx`, `dashboard.tsx`. Live table/team indicators remain explicitly marked live. |
| Sales | New `SalesPeriodDetail.tsx` receives Home's exact selection. Server-filtered date window, order-number search with debounce, order/payment status filters, sorting, 25-row pagination, totals from the same Home RPC, and order detail links. Reports non-cancelled order value explicitly, including unpaid orders; does not relabel it as net collected payments. |
| Orders | Back to Home added. Table context is passed through the registered restaurant Orders route. Active orders use the existing lifecycle status/payment definitions; users can switch to table history. A table with no active order shows an intentional empty state. |
| Menu | One Menu catalog replaces separate category/product/pricing navigation in the standard-menu workspace. Expandable category/product/option hierarchy, category creation/edit/deletion with dependency checks, product creation/edit/move/price, existing modifier editor, lazy-loaded option groups and price deltas, search, validation and product unsaved-change indication. Existing PDF/QR data semantics retained. |
| Tables | Server zone membership becomes the display source of truth. Saved moves follow the destination zone, server refreshes replace stale coordinates, in-flight edits are protected, mutations require a returned saved row, and errors restore/refetch state. Table layout updates compare `updated_at`; floor-theme updates compare the current configuration and database JSON to reject stale writes. |
| Floor editing | Rotation-aware separating-axis collision checks for table and element movement/resize/rotation/placement. Doors/windows can attach to walls; table-owned chairs remain part of the table footprint. Empty placement is searched for new tables and zone moves. Collision checks are shared by 2D/3D commit paths. Keyboard-operable table movement buttons added. Existing camera, zoom, grid, rotation and history controls retained. |
| Batch alignment | Uses staged `save_floor_table_batch` RPC: one transaction, tenant permission guard, deterministic update order, per-row version checks, all-or-nothing persistence. Client rejects overlapping proposed arrangements and restores previews on failure. |
| ERP summaries | Inventory value, low stock, open requests and monthly expenses become keyboard-operable summary buttons opening the existing filtered views. Low stock includes zero stock, open requests include requested/approved/ordered, and monthly expense boundaries use the restaurant timezone. |
| ERP inventory selection | `InventoryItemPicker.tsx` searches tenant-scoped inventory on the server, debounces input, limits matches to 50, retains the selected item, shows unit/quantity, and supplies loading/empty/error states. Stale result selection is disabled. Item name is the supported identifier in the current inventory schema. |
| ERP actions | History and Delete now have visible labels in the inventory action surface. Existing archival confirmation and append-only ledger behavior retained. |
| Purchase orders | Staged sequence-backed numbering and per-restaurant unique non-empty references. Existing references are not renumbered. Creation retains a stable request UUID for retry reconciliation; generated number is displayed after success. Legacy duplicate references abort migration for review. |
| My Work | Open, Due Today, Overdue and Completed summaries apply matching work filters, clearing unrelated filters. Restaurant-timezone due dates used. Handover entry and its rendered panel removed from My Work; Workforce handover functionality retained. |
| Booking Settings | Duplicate header Save action removed; footer Save retains the existing full persistence and validation workflow. |
| Waitlist | Existing implementation already reuses reservation date controls, fields, styles, status/actions and mobile layouts. No workflow or notification rules were replaced. |
| Appearance settings | Existing live draft preview retained and made collapsible on smaller layouts. Desktop sticky preview and existing publish/draft distinction retained. |
| Shift templates | New `ShiftTemplates.tsx`, integrated into Create Shift. Custom names, start/end, notes and weekdays; apply, create, update, duplicate, activate/deactivate and delete. Templates fill the existing date/employee/recurrence preview and assignment workflow. Assigned shifts copy values and are unaffected by later template changes. Equal start/end is rejected; overnight shifts retained. |
| Shift conflicts | Staged invoker trigger locks per employee and checks overlapping active assignments before insert/update. Existing historical rows are not rewritten. Existing duplicate-assignment protections retained. |
| Timesheets | Custom date range, employee, role, approval, search, complete/missing clock-out combinations and Reset. Restaurant-timezone date membership corrected. Employee/role restrictions are passed to server queries; existing role-scoped time data and review workflow retained. |
| Labor | Custom ranges (up to 366 days), employee, role, search, over/under plan and open-clock filters plus Reset. Selected scope applies to rows, summaries and charts. Restaurant-timezone boundaries and chart day grouping corrected. |
| Daily Close | All five summaries open full-page details using the selected business date. Paginated tenant-scoped payment/labor/inventory queries, readable related records where permissions allow, order links, payment status filtering, cash session reconciliation fields and explicit finalized-snapshot distinction. Existing parent accounting rules remain unchanged. |
| Shared controls | `MasterKpi` uses native buttons for clickable summaries, with keyboard focus styles. Missing account-menu Workspace Tools launcher restored. |

## Root causes identified in source

1. **View Orders 404:** table quick panel used `href="/orders"`; no such route exists. It now targets `/manage/$restaurantId/orders` with the actual table ID and restaurant context.
2. **Wrong sales period:** Home used restaurant-aware selected periods, but its detail screen independently calculated browser-local Today/last-seven-days. The new Sales detail consumes the URL-carried selection and the same Home accounting RPC.
3. **Zone visibility inconsistency:** table drafts retained previous coordinates across server refreshes, while visibility was inferred geometrically rather than using persisted zone membership. Draft synchronization, confirmed mutations, stored-zone filtering, destination selection and stale-write guards address these competing sources of truth. This was identified from source and schema; the original symptom was not reproduced in a logged-in browser.
4. **False saved-layout success risk:** layout writes previously checked only an error, allowing a zero-row RLS update to appear successful. Writes now select and require one returned row.
5. **Partial alignment:** parallel independent updates could partially persist an alignment. The staged RPC makes alignment atomic.
6. **No generated PO number:** request insertion relied on an empty reference/manual entry. The staged trigger generates references on the database side.
7. **Existing failed contracts:** the account menu omitted a Workspace Tools event launcher expected by two existing tests. The functional launcher was restored rather than weakening those tests.

## Database migration

`supabase/migrations/20261012122007_quickserve_integrity_templates.sql` was created using the Supabase CLI.

It adds:

- Partial unique PO-reference index, private sequence and invoker insertion trigger.
- Tenant-scoped `shift_templates` table, validation constraints, unique normalized names, RLS and explicit authenticated grants.
- Invoker transactional floor alignment RPC with tenant/version guards.
- Invoker overlapping-assignment trigger with employee transaction locks.

There are no destructive data migrations, renumbering, service-role credentials, new security-definer functions or RLS bypasses. The full migration was validated in a transaction and rolled back. It is **not applied persistently**. Deploy the migration and matching frontend together; templates and batch alignment require it.

## Verification performed

- Baseline: 193/195 contract tests passed; two existing Workspace Tools contracts failed. Baseline TypeScript passed after installing dependencies.
- Final `npx tsc --noEmit`: passed.
- Final `npm run test:contracts`: **201 passed, 0 failed**. Added calendar-invalid/custom-DST-range and rotation/collision/attachment tests.
- Final `npm run lint`: **0 errors**, 59 warnings. Warnings remain in existing hook/fast-refresh patterns; they were not suppressed.
- Final `npm run build`: passed, producing client/server production output. Build warnings from the existing configuration remain.
- Database transaction checks: migration syntax, 100 unique generated PO numbers, no-JWT template read/insert restrictions and unauthorized layout batch rejection passed; everything rolled back.
- Live schema and relevant tenant/RLS policies were read and compared with the repository's configured Supabase project.
- No authentication tokens or service-role secrets were requested, added or used in frontend code.

Validation results were recorded during implementation and repeated on the current repository branch before merging.

## Responsive QA and practical limits

The new surfaces use wrapping toolbars, existing responsive panels, bounded scrolling for data tables, native labeled controls and keyboard-operable summary buttons. This is source review, **not visual device QA**.

A local development server started on loopback, but local HTTP probing failed in this environment. Browser installation failed because browser downloads were truncated. No mobile/tablet/desktop screenshots, logged-in end-to-end tests, refresh/re-login verification, real payments, or complete authorized-role matrix were performed. No such results are claimed.

## Remaining work and release gates

1. Verify Lovable synchronization and the intended staging/publishing target after GitHub merge. The connected repository is `jamalanas760-ship-it/quickservejo`, with `main` as its default branch.
2. Apply the staged migration to the intended staging database and test PO creation, templates, assignment conflicts and alignment as authorized users. Multi-session race tests have not been executed.
3. Run browser acceptance for all requested workflows at 320–430, 600–1024 and 1280+ widths, Arabic/English, light/dark themes, operational roles and multiple restaurants.
4. Menu drag-and-drop ordering and full inline variant editing were not added; category/product/option editing uses the existing persistent editors. Subcategories were not invented because the current category schema lacks that hierarchy.
5. Existing workforce/ERP list queries retain their bounded row limits. Full server pagination/aggregate reporting for very large workforce/ERP datasets remains unfinished; existing caps can truncate broad-range summaries. Narrow queries/filters help but do not replace that work.
6. Floor collision enforcement is in the editing clients. Simultaneous independent-object placements require additional multi-session acceptance and, if needed, database collision enforcement. Same-record/version conflicts and batch atomicity are guarded, but this does not prove every concurrency scenario safe.
7. Daily Close detail records are live and RLS-filtered; finalized summaries are immutable snapshots. Later adjustments or different detailed-record permissions may prevent exact reconstruction of an old snapshot. The UI explicitly distinguishes this. Full snapshot-record linkage/reconciliation and additional payment-method/search filters remain follow-up work.
8. Automated unit/contract checks and rollback SQL checks do not establish that unrelated production workflows are regression-free. Staging acceptance is required before release.
