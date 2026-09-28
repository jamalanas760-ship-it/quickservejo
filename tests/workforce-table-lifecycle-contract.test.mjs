import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const shifts = await readFile(new URL("../src/routes/_authenticated/shifts.tsx", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20260928110000_master_attendance_recurring_shifts_table_lifecycle.sql", import.meta.url), "utf8");

test("attendance uses explicit server-authoritative clock actions", () => {
  assert.match(shifts, /get_my_time_clock_status/);
  assert.match(shifts, /clock_in_staff/);
  assert.match(shifts, /clock_out_staff/);
  assert.match(migration, /staff_time_entries_one_open_per_staff_idx/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /already_clocked_in/);
  assert.match(migration, /already_clocked_out/);
});

test("shift creation supports recurring selectable workdays", () => {
  assert.match(shifts, /Recurring schedule/);
  assert.match(shifts, /Sun–Thu/);
  assert.match(shifts, /Weekend/);
  assert.match(shifts, /SHIFT_WEEKDAYS/);
  assert.match(migration, /create_recurring_shifts/);
  assert.match(migration, /extract\(dow from d\)/);
  assert.match(migration, /Recurring schedule cannot exceed 366 days/);
});

test("table lifecycle is driven by qr sessions, orders, bookings and cleaning", () => {
  assert.match(migration, /release_unordered_qr_tables/);
  assert.match(migration, /o\.status in \('new','accepted','preparing','ready','served'\)/);
  assert.doesNotMatch(migration, /'void'/);
  assert.match(migration, /sync_order_table_service_status/);
  assert.match(migration, /new\.status='paid'/);
  assert.match(migration, /service_status='cleaning'/);
  assert.match(migration, /interval '20 minutes'/);
  assert.match(migration, /interval '10 minutes'/);
  assert.match(migration, /status_updated_by=null/);
});
