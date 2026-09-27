import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../src/components/manage/StaffManagerAdvanced.tsx", import.meta.url),
  "utf8",
);

test("staff page creates shared shift assignments and refreshes the shifts workspace", () => {
  assert.match(source, /<th>\{ar \? "الوردية" : "Shift"\}<\/th>/);
  assert.match(source, /<StaffShiftCell/);
  assert.match(source, /schedule \? \(ar \? "تعديل" : "Change"\) : ar \? "إضافة" : "Add shift"/);
  assert.match(source, /AssignStaffShiftDialog/);
  assert.match(source, /assignStaffToShift/);
  assert.match(source, /createShift/);
  assert.match(source, /\["operations", "shifts", restaurantId\]/);
  assert.match(source, /\["operations", "shift-assignments", restaurantId\]/);
  assert.match(source, /\["platform", "staff-schedule", restaurantId\]/);
});

test("staff shift assignment handles overnight work and blocks schedule overlap", () => {
  assert.match(source, /overnight \? 1 : 0/);
  assert.match(source, /hasShiftConflict/);
  assert.match(source, /This shift overlaps another assignment/);
  assert.match(source, /This time overlaps another assignment/);
});
