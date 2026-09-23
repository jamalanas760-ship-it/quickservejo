import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function file(path) {
  return readFile(new URL("../" + path, import.meta.url), "utf8");
}

const MIGRATION = "supabase/migrations/20260923103000_auto_release_cleaning_tables.sql";

test("cleaning auto-release migration keeps the verified contract", async () => {
  const sql = await file(MIGRATION);
  assert.match(sql, /service_status = 'cleaning'/);
  assert.match(sql, /interval '10 minutes'/);
  assert.match(sql, /service_status = 'free'/);
  assert.match(sql, /activated_at = null/);
  assert.match(sql, /status_updated_by = null/);
  assert.match(sql, /app\.release_cleaning_tables\(\)/);
  assert.match(sql, /security definer/);
  assert.match(sql, /set search_path = ''/);
  assert.match(sql, /quickserve-release-cleaning-tables/);
  assert.match(sql, /'10 seconds'/);
  assert.match(sql, /revoke all on function app\.release_cleaning_tables\(\) from public/);
  assert.match(sql, /revoke all on function app\.release_cleaning_tables\(\) from anon/);
  assert.match(sql, /revoke all on function app\.release_cleaning_tables\(\) from authenticated/);
});

test("waiter floor exposes the cleaning countdown", async () => {
  const waiter = await file("src/routes/_authenticated/waiter.tsx");
  assert.match(waiter, /status_updated_at/);
  assert.match(waiter, /CLEANING_RELEASE_MS/);
  assert.match(waiter, /filter === "cleaning"/);
});
