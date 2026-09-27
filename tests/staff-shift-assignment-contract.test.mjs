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


test("team page securely cancels only active or upcoming shift assignments", async () => {
  assert.match(source, /CancelStaffShiftDialog/);
  assert.match(source, /cancelStaffShiftAssignment/);
  assert.match(source, /Cancel shift/);
  assert.match(source, /staff-schedule/);
  assert.match(source, /shift-assignments/);

  const migration = await readFile(
    new URL(
      "../supabase/migrations/20260927153000_cancel_staff_shift_assignment.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(migration, /cancel_staff_shift_assignment/);
  assert.match(migration, /Past or completed shift assignments cannot be cancelled/);
  assert.match(migration, /manage_shifts/);
  assert.match(migration, /staff_shift_cancelled/);
});


test("deleted or closed shifts do not create false overlap conflicts", async () => {
  assert.match(source, /if \(!shift \|\| shift\.status === "closed"\) return false/);

  const migration = await readFile(
    new URL(
      "../supabase/migrations/20260927161000_fix_shift_overlap_false_positive.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(migration, /delete from public\.shift_assignments a/);
  assert.match(migration, /sh\.deleted_at is not null/);
  assert.match(migration, /sh\.deleted_at is null/);
  assert.match(migration, /sh\.status <> 'closed'/);
  assert.match(migration, /a\.status <> 'released'/);
  assert.match(migration, /_candidate_start < coalesce/);
  assert.match(migration, /_candidate_end > coalesce/);
});
