import test from "node:test";
import assert from "node:assert/strict";
import { validateMissingPunch } from "../src/lib/missing-punch.ts";
const now = Date.parse("2026-10-18T18:00:00Z");
const check = (
  start = "2026-10-18T09:00",
  end = "2026-10-18T17:00",
  rest = "30",
  reason = "Forgot clock-out",
  zone = "Asia/Amman",
) => validateMissingPunch(start, end, rest, reason, zone, now);
test("approved composer preserves the complete session and restaurant-time calculation", () => {
  const result = check();
  assert.equal(result.valid, true);
  assert.equal(result.durationMinutes, 480);
  assert.equal(result.breakMinutes, 30);
});
test("single-punch focus cannot submit without the other session boundary", () => {
  assert.equal(check("", "2026-10-18T17:00").issue, "missing_times");
  assert.equal(check("2026-10-18T09:00", "").issue, "missing_times");
});
test("break minutes must be finite whole minutes shorter than the session", () => {
  for (const value of ["NaN", "Infinity", "30.5", "-1", "480"])
    assert.equal(check(undefined, undefined, value).issue, "break");
  assert.equal(check(undefined, undefined, "").breakMinutes, 0);
});
test("future, reversed and overlong sessions and empty reasons remain blocked", () => {
  assert.equal(check("2026-10-19T09:00", "2026-10-19T17:00").issue, "future");
  assert.equal(check("2026-10-18T17:00", "2026-10-18T09:00").issue, "order");
  assert.equal(check("2026-10-15T09:00", "2026-10-18T17:00").issue, "too_long");
  assert.equal(check(undefined, undefined, "0", "  ").issue, "reason");
});
test("nonexistent DST times are rejected and overnight requests retain their date boundary", () => {
  assert.equal(
    check("2026-03-08T02:30", "2026-03-08T04:30", "0", "Forgot punch", "America/New_York").issue,
    "invalid_times",
  );
  assert.equal(check("2026-10-17T22:00", "2026-10-18T06:00").durationMinutes, 480);
});
