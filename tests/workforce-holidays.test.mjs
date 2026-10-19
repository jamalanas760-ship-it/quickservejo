import test from "node:test";
import assert from "node:assert/strict";
import {
  holidayOccurrences,
  COMMON_HOLIDAYS,
  HOLIDAY_PRESETS,
  holidayPresetForm,
} from "../src/lib/workforce-holidays.ts";
import { isHrEmployeeRole } from "../supabase/functions/staff-admin/hr-policy.ts";
test("holiday recurrence begins at its configured year and never fabricates leap-day dates", () => {
  const rows = [
    { id: "a", name: "Christmas", holiday_date: "2026-12-25", annual: true },
    { id: "b", name: "One off", holiday_date: "2026-10-30", annual: false },
    { id: "c", name: "Leap", holiday_date: "2024-02-29", annual: true },
  ];
  assert.deepEqual(holidayOccurrences(rows, 2025), []);
  assert.deepEqual(
    holidayOccurrences(rows, 2026).map((h) => h.date),
    ["2026-10-30", "2026-12-25"],
  );
  assert.deepEqual(
    holidayOccurrences(rows, 2028).map((h) => h.date),
    ["2028-02-29", "2028-12-25"],
  );
  assert.deepEqual(holidayOccurrences(rows, NaN), []);
});
test("shared recurring entries deduplicate the same calendar day and name", () => {
  const rows = [
    { id: "a", name: "New Year", holiday_date: "2026-01-01", annual: true },
    { id: "b", name: "New Year", holiday_date: "2027-01-01", annual: true },
  ];
  assert.equal(holidayOccurrences(rows, 2028).length, 1);
  assert.equal(COMMON_HOLIDAYS.length, 4);
});
test("HR onboarding roles exclude account-management and owner privileges", () => {
  for (const role of [
    "waiter",
    "kitchen",
    "cashier",
    "host",
    "inventory",
    "procurement",
    "accountant",
  ])
    assert.equal(isHrEmployeeRole(role), true);
  for (const role of [
    "hr",
    "manager",
    "operations_manager",
    "restaurant_admin",
    "super_admin",
    "unknown",
  ])
    assert.equal(isHrEmployeeRole(role), false);
});

test("Jordan and Islamic holiday presets use the correct recurrence defaults", () => {
  assert.equal(HOLIDAY_PRESETS.length, 7);
  assert.deepEqual(holidayPresetForm("Jordan Independence Day", 2027), {
    name: "Jordan Independence Day",
    date: "2027-05-25",
    annual: true,
  });
  for (const name of ["Eid al-Adha", "Eid al-Fitr (Eid Iftar)", "Mawlid al-Nabawi"]) {
    assert.deepEqual(holidayPresetForm(name, 2027), { name, date: "", annual: false });
    assert.ok(
      !COMMON_HOLIDAYS.some((h) => h.name === name),
      "bulk fixed dates never fabricate Islamic holiday dates",
    );
  }
  assert.equal(holidayPresetForm("unknown", 2027), null);
  assert.equal(holidayPresetForm("Jordan Independence Day", NaN), null);
});
