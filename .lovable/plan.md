# QuickServe Redesign — Implementation Analysis

Analysis only. Nothing was changed in this turn. Everything below reuses the current authentication, tenant isolation and access rules as-is.

## What exists today (verified by reading the code)

- Home Quick Access is a 5-tile list in `src/routes/_authenticated/dashboard.tsx`: Dashboard, Orders, Menu, Tables, Analytics — already restaurant-scoped.
- The floor designer lives in `src/components/manage/TablesManagerApproved.tsx` (568 lines, single file) and already supports floors, zones (name only), drag/resize/rotate, capacity, shapes, per-floor background upload, QR download/print. Table geometry is stored in `restaurant_tables.layout` (JSON); floors/zones are stored inside the restaurant's theme JSON (`workspace.tableFloors`). There is no zone geometry, no table material, no entrance objects, and no list view.
- Team is `src/components/manage/StaffManager.tsx`: search, role/status filters, invite, role change, active toggle, seat limit, badge, password reset via existing server functions (`src/lib/staff.functions.ts`, `src/lib/staff-auth.functions.ts`). Permissions today are role-derived only, from `src/lib/permissions.ts` (`ROLE_CAPABILITIES`). No per-user overrides are stored anywhere.
- Analytics is `src/components/manage/AnalyticsManager.tsx`: fixed layout, real 30-day order data, plus a few hardcoded placeholder values (`0 min`, `↗ 0%`, `100%` branch bar). Charts already use `recharts` — no new chart library needed.
- Branding is `src/components/manage/RestaurantAppearance.tsx` + `src/lib/restaurant-appearance.ts` + `src/components/tenant/TenantBrandShell.tsx`. Tenant colours already come from restaurant columns and `menu_theme` JSON and are applied only inside the tenant shell.
- Avatars: `ProfileAvatarEditor.tsx` calls the `update_own_avatar` RPC. The newest migration (`20260915090500`) added an `update auth.users ... set raw_user_meta_data` step to that function.

## Avatar error — leading cause (must be confirmed first)

The user-visible message comes from `src/lib/errors.ts`, which maps any `42501` / "permission denied" to "You don't have permission to do that." The most likely source is the `update auth.users` statement added in the newest migration: the function is owned by the migration role, which does not own the `auth.users` table, so the write raises `permission denied for table users` (42501) and rolls back the whole call — including the staff row update that used to work.

This is not yet proven (the hosted database was unreachable for live SQL in recent turns). Step 1 of implementation is to run the RPC/SQL against the live database and read the real error code. If confirmed, the fix is to drop the `auth.users` write from the function and keep only the `public.staff` update (the app already falls back to reading avatar from the staff membership), or to route metadata updates through the existing admin-side server function instead. A second candidate, also checked in the same step: users with no `staff` row for the selected restaurant, where the update matches zero rows.

## Files and functions to touch

**Home**
- `src/routes/_authenticated/dashboard.tsx` — reorder Quick Access to Analytics, Orders, Menu, Tables, Team; Team links to `/manage/$restaurantId/staff`.

**Tables & Floor Designer** (split the 568-line file rather than growing it)
- `src/components/manage/TablesManagerApproved.tsx` — becomes the shell with the Layout / Table List mode switch.
- New `src/components/manage/tables/FloorCanvas.tsx`, `TableInspector.tsx`, `TableListView.tsx`, `ZoneLayer.tsx`, `EntranceLayer.tsx`.
- New `src/lib/floor-plan.ts` — parse/serialise floors, zone rectangles, entrances, materials; all defaults tolerant of old data.
- Zone geometry, entrances and floor metadata persist in the existing restaurant theme JSON (`workspace.tableFloors`) — no new table. Table material persists in the existing `restaurant_tables.layout` JSON.
- Design: white canvas, subtle grid, warm wood zone fills, orange selected border, right inspector, compact toolbar, no decorative circles.

**Team / Roles & Permissions**
- `src/components/manage/StaffManager.tsx` — split into a list plus a new `src/components/manage/staff/StaffDrawer.tsx` with Permissions / Profile / Access Log tabs; fixes mobile overflow and edit accessibility.
- `src/lib/permissions.ts` — add capability groups (Orders, Menu, Tables & Floor, Analytics, People & Staff, System & Settings) and a resolver: role defaults merged with per-staff overrides.
- `src/lib/staff.functions.ts` — server-side save of overrides and password change (min 8 chars, confirm, blank = unchanged), reusing the existing staff-admin path; keeps the current rule that a restaurant Admin cannot escalate another Admin, and keeps the seat limit under Super Admin control.
- Access Log tab reads existing `audit_logs` only; empty state when there is nothing, no invented rows.

**Analytics**
- `src/components/manage/AnalyticsManager.tsx` — becomes a widget host.
- New `src/components/manage/analytics/` widgets: KPI row, Revenue Over Time, Orders by Day, Orders by Channel, Top Products, Peak Hours, Weekly Performance, Saved Reports; plus `CustomizeDashboardDialog.tsx`.
- New `src/lib/analytics-dashboard.ts` — widget registry, layout/visibility/order/accent colour, persisted restaurant-scoped in the existing theme/workspace JSON.
- Every metric comes from existing orders/order-items data; anything not derivable shows a truthful empty state, and the current hardcoded `0 min` / `0%` / `100%` placeholders are removed.

**Branding / Organization Settings**
- `src/components/manage/RestaurantAppearance.tsx`, `src/lib/restaurant-appearance.ts`, `src/components/tenant/TenantBrandShell.tsx`, `src/components/nav/AppHeader.tsx`, `src/components/brand/BrandLogo.tsx`.
- Adds sidebar background/text, active item, top bar background, accent, surface, and light/dark variants; logo mode = QuickServe / restaurant logo / restaurant + "Powered by QuickServe". Applied only within the tenant shell so Super Admin chrome and the guest menu theme are untouched; theme values are injected as CSS variables on first render to avoid a colour flash.

**Shared polish**
- `src/styles.css` / `src/ux-refinement.css` — 12–16px radii, subtle borders, 120–180ms transitions, `prefers-reduced-motion`, 44px touch targets, no drawer clipping or horizontal overflow.

## Schema migration

One small migration, only if the avatar diagnosis requires it:
- Replace `public.update_own_avatar` so it no longer writes to `auth.users` (keep the `public.staff` update, keep `security definer`, keep grants to `authenticated` only).
- Add `staff.permission_overrides jsonb not null default '{}'::jsonb` (plus a comment). Chosen over a new table: it is tenant-scoped by the existing `staff` row and inherits current RLS with no new policy surface.
- No changes to RLS helpers, role-hierarchy triggers, seat limits, or any `erp_*` / order / menu table.

## Risks

- Floor-plan data shape changes are additive and version-tolerant; old rows without zone geometry/material/entrances must keep rendering. Regression risk is the highest here — the file is dense and drag maths is easy to break.
- Permission overrides must not become the only gate. Role/DB checks stay authoritative; overrides narrow UI and are re-checked server-side on sensitive actions. They can never grant a capability the role does not have.
- Branding tokens leaking outside the tenant shell would touch Super Admin chrome or the guest menu — scoping stays inside `tenant-theme-scope`.
- Theme JSON is now carrying floors, zones, entrances, dashboard layout and branding. Writes must merge, never overwrite, or one feature will erase another's settings.
- Live database verification has been blocked by the paused backend in recent turns; the avatar fix and any SQL check depend on it being reachable.

## Implementation order

1. Verify and fix the avatar permission error (diagnose live, then migrate + frontend), plus the illustrated role avatar set.
2. Home Quick Access reorder (smallest, isolated).
3. Team drawer: permissions groups, overrides, password, Profile/Access Log, mobile fixes.
4. Tables: split components, Table List mode, zone geometry, materials, entrances, design pass.
5. Analytics customizable dashboard.
6. Branding / organization settings.
7. Responsive + QA pass, then route generation, TypeScript, lint and production build; report any remaining blockers honestly.
