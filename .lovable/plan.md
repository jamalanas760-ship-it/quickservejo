# QuickServe Back Office (ERP) — audit and phased plan

## 1. What exists today (verified in code)

**Operations foundation (already live).** Migration `20260912201200_restaurant_operations.sql` created four tenant tables plus one view:
- `erp_suppliers` (name, contact)
- `erp_inventory` (name, unit from kg/g/l/ml/pcs/box, reorder_level)
- `erp_stock_movements` (item, optional supplier, signed quantity, unit_cost, reason, created_by) with a `BEFORE INSERT` trigger `app.validate_stock_movement()` that locks the item and rejects movements taking stock negative ("Insufficient stock")
- `erp_expenses` (description, category in supplies/rent/utilities/maintenance/other, amount, expense_date, reference)
- view `erp_inventory_balances` (`security_invoker`) summing movements per item

RLS is enabled on all four; grants are explicit and narrow (`SELECT, INSERT, UPDATE` on suppliers/inventory; `SELECT, INSERT` only on movements/expenses — ledgers are append-only by design), all gated on `app.can_manage_restaurant(restaurant_id)`, with ledger inserts additionally forced to `created_by = auth.uid()`. Composite `(restaurant_id, id)` foreign keys prevent cross-tenant item/supplier references. A transactional RLS test already exists at `supabase/tests/restaurant_operations.sql`.

**UI.** One component, `src/components/manage/OperationsManager.tsx` (~95 lines), mounted at two routes: `_authenticated/manage/$restaurantId/operations.tsx` and `_authenticated/super-admin/restaurants/$restaurantId/operations.tsx`. It has 3 KPI tiles, tabs for Inventory / Suppliers / Expenses, a search box, a single shared dialog for four record types, currency from `restaurant.currency` via `formatMoney`, and full AR/EN strings inline. Access check reuses `useAccess()`: super admin or `restaurant_admin`.

**Navigation.** Restaurant workspace tabs live in `_authenticated/manage/$restaurantId/route.tsx` (Menu, Tables & QR, Team, Orders, Analytics, Operations). Super-admin restaurant tabs live in the parallel `super-admin/restaurants/$restaurantId/route.tsx` (Overview, Edit, Menu, Design, Tables, Staff, Orders, Analytics, Operations).

**Super Admin > Restaurants.** `super-admin/restaurants/index.tsx` — card grid, 12 per page, search across name/slug/email/phone/address, filters for status / plan / subscription status, per-card order count, plan, created date, revenue and onboarding health percent from `src/lib/health.ts`. Data comes from `useRestaurantsWithStats()`.

**Reusable pieces:** `useAccess`/`membershipFor`, `logAudit` in `src/lib/audit.ts` (typed action union), `formatMoney`/`formatNumber`/`formatDate`, `healthOf`/`onboardingSteps`, `DateRangePicker`, `Sparkline`, `StatCard`, `EmptyState`, `PLAN_LIMITS` in `src/lib/permissions.ts`.

## 2. Gaps and risks

**Gaps**
- No ERP landing/overview; Operations opens straight into Inventory with no command centre or alerts.
- No purchasing: no purchase orders, no receiving against a PO, no supplier balances or payment terms.
- No recipes/BOM, so no food cost, no theoretical usage, no depletion when an order is served.
- No waste/adjustment reason codes — waste is just a negative movement with free text.
- No stock counts (physical count vs system) and no transfers between restaurants/locations.
- Expenses are insert-only with no edit/void path, no supplier link, no payment status, no period reporting.
- No ERP reports or KPIs (COGS, stock value, expense by category, burn rate).
- Operations actions are not written to `audit_logs`; `AuditAction` has no ERP entries.
- ERP tables are absent from generated types, so the component casts through `const db = supabase as any` — no type safety.
- Super Admin > Restaurants shows no business/ERP signals (low stock, unposted expenses, stale ERP activity) and has no table/density view or CSV export.

**Risks**
- `erp_inventory_balances` recomputes a full `sum()` over all movements per item on every read — fine now, degrades as the ledger grows. Needs an index-friendly path or a cached balance later.
- Movement validation reads the sum with a row lock on the item; concurrent issues are serialised correctly, but a future "post an order's depletion" job must reuse the same trigger, not bypass it.
- Ledger append-only design is correct; correction must be a reversing entry, never an `UPDATE`. Any new UI must not tempt an edit affordance.
- Widening grants (e.g. adding `DELETE`) would break the audit story — avoid.
- The two mount points must keep using one shared component; duplicating it would drift super-admin and restaurant-admin behaviour.
- `as any` casting hides schema drift; regenerating types is required before adding more tables.

## 3. Proposed information architecture

Rename the tab **Operations → Back Office** (العمليات الخلفية) in both shells, and give it its own sub-navigation instead of one flat tab set:

```text
Back Office
├── Overview        command centre: stock value, low stock, month expenses, food cost, alerts
├── Inventory       items, balances, movements, adjustments, counts
├── Purchasing      suppliers, purchase orders, receiving
├── Recipes         BOM per menu item, cost per portion, margin vs menu price
├── Finance         expenses, categories, period summary
└── Reports         COGS, stock valuation, expense breakdown, waste
```

Sub-nav is a horizontal scrollable pill row on mobile, a left rail from `lg` up; existing top tabs stay untouched so Menu/Orders/Staff are never duplicated. Same component tree serves both mount points; super admin additionally gets a read-only tenant banner.

## 4. Schema additions (later phases, not Phase 1)

- `erp_purchase_orders` + `erp_purchase_order_lines` (status draft/sent/received/cancelled), receiving writes `erp_stock_movements` rows referencing the PO line.
- `erp_recipes` + `erp_recipe_lines` linking `products` to `erp_inventory` with quantity per portion; a view for cost per portion and margin.
- `erp_stock_counts` + `erp_stock_count_lines`, posting variance as movements with reason code.
- `erp_adjustment_reasons` (waste, spoilage, staff meal, breakage, correction) referenced by movements.
- `erp_expenses`: add nullable `supplier_id`, `payment_status`, `voided_at` + `voided_by` (void instead of delete).
- Optional later: `erp_assets`, `erp_payroll_runs`.

Every table follows the house pattern: `restaurant_id` NOT NULL, composite `(restaurant_id, id)` uniqueness for cross-tenant-safe FKs, explicit REVOKE then narrow GRANT, RLS on `app.can_manage_restaurant`, `created_by = auth.uid()` on ledgers.

## 5. Files to add / modify — Phase 1

Add:
- `src/components/backoffice/BackOfficeShell.tsx` — sub-nav + tenant context
- `src/components/backoffice/BackOfficeOverview.tsx` — command centre
- `src/components/backoffice/InventoryPanel.tsx`, `SuppliersPanel.tsx`, `FinancePanel.tsx` — extracted from the current single component
- `src/components/backoffice/RecordDialog.tsx` — the existing four-form dialog, isolated
- `src/hooks/useBackOffice.ts` — typed queries for balances, movements, suppliers, expenses, plus derived KPIs
- `src/lib/erp.ts` — units, expense categories, stock value / low-stock / burn-rate helpers, AR/EN labels

Modify:
- `src/components/manage/OperationsManager.tsx` — becomes a thin wrapper over `BackOfficeShell` (both routes keep working, no route churn)
- `manage/$restaurantId/route.tsx` and `super-admin/restaurants/$restaurantId/route.tsx` — tab label to Back Office
- `src/lib/audit.ts` — add `erp.item_created`, `erp.stock_received`, `erp.stock_issued`, `erp.supplier_created`, `erp.expense_recorded`
- `src/routes/_authenticated/super-admin/restaurants/index.tsx` — add ERP signal chips + list/grid density toggle
- `src/hooks/useSuperAdmin.ts` — extend `useRestaurantsWithStats` with low-stock count and last ERP activity
- `src/integrations/supabase/types.ts` — regenerated so `as any` can be dropped

No migration is required for Phase 1 — the existing `erp_*` tables cover it.

## 6. Test plan

- Re-run `supabase/tests/restaurant_operations.sql` unchanged (owner receipt, computed balance, negative-stock rejection, cross-tenant denial, anonymous denial) — it must still pass.
- Manual matrix: super admin, restaurant_admin of tenant A, restaurant_admin of tenant B, frontline staff — confirm B and staff cannot read or write A's ERP data.
- Browser pass at 390px and 1280px, in both English LTR and Arabic RTL, on Overview / Inventory / Purchasing / Finance.
- Currency: verify every money figure renders through `formatMoney` with the restaurant's own currency (JOD default), including a non-JOD tenant.
- Regression: Menu, Tables, Team, Orders, Analytics tabs and both existing `operations` URLs still resolve.
- Concurrency: two simultaneous issues on the same item — one must fail with "Insufficient stock".
- Typecheck and lint clean; `as any` removed from the ERP path.

## 7. Phase 1 recommendation (scoped)

Reuse the existing `erp_*` foundation exactly as it is — no migration, no schema change, no data risk. Phase 1 delivers:

1. **Back Office shell** with the six-section sub-nav; Purchasing/Recipes/Reports render a clear "coming next" state rather than fake data.
2. **Overview command centre**: stock value at last unit cost, items at/below reorder level with one-tap receive, month-to-date expenses by category, last 10 ledger entries, and an alert list.
3. **Inventory upgrade**: sortable table view on desktop and cards on mobile, unit/low-stock filters, per-item movement history drawer, quick receive/issue from the row.
4. **Finance upgrade**: month grouping, category totals, date-range filter reusing `DateRangePicker`, CSV export.
5. **Audit wiring**: every ERP write calls `logAudit`, so entries appear in the existing audit log page.
6. **Super Admin > Restaurants signals**: low-stock and ERP-activity chips per tenant, plus a compact table view and CSV export.

Phase 2 = Purchasing (PO → receive → supplier balance). Phase 3 = Recipes/BOM, food cost, automatic depletion on served orders. Phase 4 = stock counts, transfers, waste reason codes. Phase 5 = reports pack; payroll/assets only if asked.

## Assumption

Phase 1 stays read-model and UX work on top of today's tables; nothing in it changes RLS, grants, or the append-only ledger rule. If you want purchase orders inside Phase 1, that pulls the first migration forward.
