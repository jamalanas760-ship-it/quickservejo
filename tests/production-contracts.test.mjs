import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function file(path) {
  return readFile(new URL("../" + path, import.meta.url), "utf8");
}

test("authenticated shell has accessibility and runtime monitoring", async () => {
  const root = await file("src/routes/__root.tsx");
  assert.match(root, /Skip to main content/);
  assert.match(root, /AppRuntimeMonitor/);
  assert.match(root, /id="main-content"/);
});

test("PWA has a service worker and standalone manifest", async () => {
  const sw = await file("public/sw.js");
  const manifest = JSON.parse(await file("public/manifest.webmanifest"));
  assert.match(sw, /addEventListener\("fetch"/);
  assert.match(sw, /isPublicNavigation/);
  assert.match(sw, /Authenticated\/operational pages are always network-only/);
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons?.length >= 2);
});

test("cashier uses ledger RPC instead of directly forcing paid status", async () => {
  const cashier = await file("src/routes/_authenticated/cashier.tsx");
  assert.match(cashier, /record_order_payment/);
  assert.match(cashier, /refund_order_payment/);
  assert.match(cashier, /open_cash_session/);
  assert.match(cashier, /close_cash_session/);
  assert.match(cashier, /_restaurant_id:\s*rid/);
  assert.match(cashier, /_payment_id:\s*payment\.id/);
  assert.doesNotMatch(cashier, /payment_status:\s*"paid"/);
});

test("public checkout uses hardened v2 and fulfillment RPCs", async () => {
  const diner = await file("src/lib/diner.ts");
  assert.match(diner, /place_public_order_v2/);
  assert.match(diner, /place_public_fulfillment_order/);
});

test("guest CRM route and restaurant OS migration exist", async () => {
  const guests = await file("src/routes/_authenticated/guests.tsx");
  const migration = await file("supabase/migrations/20260920084500_phase4_restaurant_os_foundation.sql");
  assert.match(guests, /crm_guests/);
  for (const table of [
    "payment_transactions",
    "erp_menu_recipes",
    "crm_guests",
    "staff_time_entries",
    "erp_supplier_invoices",
    "restaurant_groups",
    "saas_usage_daily",
  ]) {
    assert.match(migration, new RegExp(table));
  }
});

test("platform health route reads runtime events and performance samples", async () => {
  const health = await file("src/routes/_authenticated/super-admin/health.tsx");
  assert.match(health, /system_events/);
  assert.match(health, /performance_samples/);
  assert.match(health, /LCP/);
  assert.match(health, /INP/);
  assert.match(health, /CLS/);
});


test("payment integrity migration caps settlement and links refunds", async () => {
  const migration = await file("supabase/migrations/20260920100000_phase4_payment_integrity.sql");
  assert.match(migration, /parent_transaction_id/);
  assert.match(migration, /Payment exceeds outstanding balance/);
  assert.match(migration, /Gift card balance is insufficient/);
  assert.match(migration, /_restaurant_id uuid/);
});

test("delivery accounting persists the fee separately from order total", async () => {
  const migration = await file("supabase/migrations/20260920101000_phase4_delivery_accounting.sql");
  assert.match(migration, /delivery_amount=_delivery/);
});
