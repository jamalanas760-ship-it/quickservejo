import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL("../supabase/migrations/20260923103000_auto_release_cleaning_tables.sql", import.meta.url);

test("cleaning tables automatically become free after ten minutes", async () => {
  const migration = await readFile(migrationPath, "utf8");

  assert.match(migration, /service_status = 'cleaning'/);
  assert.match(migration, /interval '10 minutes'/);
  assert.match(migration, /set service_status = 'free'/);
  assert.match(migration, /cron\.schedule[\s\S]*'10 seconds'/);
  assert.match(migration, /revoke all on function app\.release_cleaning_tables\(\) from public, anon, authenticated/);
});
