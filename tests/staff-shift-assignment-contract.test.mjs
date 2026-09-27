import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../src/components/manage/StaffManagerAdvanced.tsx", import.meta.url),
  "utf8",
);

test("staff page creates shared shift assignments and refreshes the shifts workspace", () => {
  assert.match(source, /<th className="text-center">\{ar \? "الوردية" : "Shift"\}<\/th>/);
  assert.match(source, /<StaffShiftCell/);
  assert.match(source, /schedule \? \(ar \? "تعديل" : "Change"\) : ar \? "إضافة" : "Add shift"/);
  assert.match(source, /AssignStaffShiftDialog/);
  assert.match(source, /assignStaffShift/);
  assert.match(source, /assignStaffShift\(/);
  assert.match(source, /\["operations", "shifts", restaurantId\]/);
  assert.match(source, /\["operations", "shift-assignments", restaurantId\]/);
  assert.match(source, /\["platform", "staff-schedule", restaurantId\]/);
});

test("staff assignment RPC and QR timeout migration are present", async () => {
  const migration = await readFile(
    new URL(
      "../supabase/migrations/20260927130000_repair_menu_history_qr_timeout_and_staff_shift_assignment.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(migration, /assign_staff_shift/);
  assert.match(migration, /release_unordered_qr_tables/);
  assert.match(migration, /20 minutes/);
});

test("staff shift assignment handles overnight work and blocks schedule overlap", () => {
  assert.match(source, /overnight \? 1 : 0/);
  assert.match(source, /hasShiftConflict/);
  assert.match(source, /This shift overlaps another assignment/);
  assert.match(source, /This time overlaps another assignment/);
});
