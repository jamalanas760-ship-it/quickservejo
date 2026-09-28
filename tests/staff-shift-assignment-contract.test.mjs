import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../src/components/manage/StaffManagerAdvanced.tsx", import.meta.url),
  "utf8",
);

test("staff page creates shared shift assignments and refreshes the shifts workspace", () => {
  assert.match(source, /Today's Shift/);
  assert.match(source, /<StaffShiftSummaryCell/);
  assert.match(source, /<StaffShiftCell/);
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


test("team add-shift dialog supports professional recurring workday schedules", async () => {
  assert.match(source, /TEAM_SHIFT_WEEKDAYS/);
  assert.match(source, /Recurring days/);
  assert.match(source, /Sun–Thu/);
  assert.match(source, /Weekend/);
  assert.match(source, /Every day/);
  assert.match(source, /assignRecurringStaffShifts/);
  assert.match(source, /Assign schedule/);

  const migration = await readFile(
    new URL("../supabase/migrations/20260928113000_team_recurring_staff_shifts.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /assign_recurring_staff_shifts/);
  assert.match(migration, /extract\(dow from d\)/);
  assert.match(migration, /Recurring shift overlaps another assignment on/);
  assert.match(migration, /Recurring schedule cannot exceed 366 days/);
  assert.match(migration, /staff_recurring_shifts_assigned/);
});


test("team shift dialog keeps actions visible and shows a live schedule preview", () => {
  assert.match(source, /max-h-\[min\(92dvh,860px\)\]/);
  assert.match(source, /sticky bottom-0 z-20/);
  assert.match(source, /Schedule preview/);
  assert.match(source, /Live preview/);
  assert.match(source, /formatTimeInput/);
});


test("team table uses the approved action buttons and live status cards without horizontal scrolling", async () => {
  assert.match(source, /qs-team-table-wrap/);
  assert.match(source, /overflow-hidden xl:block/);
  assert.doesNotMatch(source, /qs-scroll-region hidden min-h-0 flex-1 overflow-x-auto md:block/);
  assert.match(source, /qs-team-action-shift/);
  assert.match(source, /qs-team-action-edit/);
  assert.match(source, /qs-live-status-card qs-live-status-on/);
  assert.match(source, /qs-live-status-card qs-live-status-off/);
  assert.match(source, /Clocked in/);
  assert.match(source, /Not clocked in/);
  assert.match(source, /attendanceMinutes/);

  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(styles, /Approved Team table \+ Live Status design 2026-09-28/);
  assert.match(styles, /\.qs-team-action-shift/);
  assert.match(styles, /\.qs-live-status-on/);
  assert.match(styles, /\.qs-live-status-alert/);
  assert.match(styles, /@media\(max-width:1279px\)/);
});


test("team Last Active column is aligned and uses a dedicated responsive status card", async () => {
  assert.match(source, /<StaffLastActive value=\{member\.last_seen_at\}/);
  assert.match(source, /function StaffLastActive/);
  assert.match(source, /Nothing recorded yet/);
  assert.match(source, /Recent activity/);
  assert.match(source, /Live activity/);
  assert.match(source, /sm:grid-cols-3/);

  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(styles, /Team Last Active alignment 2026-09-28/);
  assert.match(styles, /\.qs-last-active-online/);
  assert.match(styles, /\.qs-last-active-recent/);
  assert.match(styles, /\.qs-last-active-today/);
  assert.match(styles, /nth-child\(7\)/);
});


test("team actions remove the three-dot menu while preserving shift cancellation", () => {
  const rowActions = source.slice(source.indexOf("function StaffRowActions"), source.indexOf("function StaffShiftCell"));
  assert.doesNotMatch(rowActions, /MoreHorizontal/);
  assert.doesNotMatch(rowActions, /qs-team-action-more/);
  assert.match(rowActions, /Change shift/);
  assert.match(rowActions, /Cancel shift/);
  assert.match(rowActions, /qs-team-actions-clean/);
});
