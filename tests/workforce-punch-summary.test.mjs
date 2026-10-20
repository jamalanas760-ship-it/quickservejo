import test from "node:test";
import assert from "node:assert/strict";
import { dailyPunchSummary } from "../src/lib/workforce-punch-summary.ts";
const ms = Date.parse;
const start = ms("2026-10-19T21:00:00Z"); // Oct 20, midnight in Amman.
const end = ms("2026-10-20T21:00:00Z");
const now = ms("2026-10-20T18:00:00Z");
const entry = (clock_in, clock_out = null, review_status = null) => ({
  staff_id: "me",
  clock_in,
  clock_out,
  review_status,
});
test("first and last punches are actual earliest/latest events in the local day", () => {
  const rows = [
    entry("2026-10-20T10:00:00Z", "2026-10-20T14:00:00Z"),
    entry("2026-10-20T05:00:00Z", "2026-10-20T09:00:00Z"),
    entry("2026-10-20T15:00:00Z"),
  ];
  assert.deepEqual(dailyPunchSummary(rows, start, end, now), {
    firstIn: "2026-10-20T05:00:00Z",
    lastOut: "2026-10-20T14:00:00Z",
  });
});
test("overnight sessions do not fabricate a midnight first-in or an unrecorded last-out", () => {
  const overnight = entry("2026-10-19T20:00:00Z", "2026-10-20T02:00:00Z");
  assert.deepEqual(dailyPunchSummary([overnight], start, end, now), {
    firstIn: null,
    lastOut: "2026-10-20T02:00:00Z",
  });
  assert.deepEqual(dailyPunchSummary([entry("2026-10-20T05:00:00Z")], start, end, now), {
    firstIn: "2026-10-20T05:00:00Z",
    lastOut: null,
  });
});
test("rejected, malformed, future and out-of-day punches cannot become summary values", () => {
  const rows = [
    entry("2026-10-20T05:00:00Z", "2026-10-20T09:00:00Z", "rejected"),
    entry("invalid"),
    entry("2026-10-20T19:00:00Z"),
    entry("2026-10-18T05:00:00Z", "2026-10-18T09:00:00Z"),
  ];
  assert.deepEqual(dailyPunchSummary(rows, start, end, now), { firstIn: null, lastOut: null });
});

test("an acknowledged close of an overdue session still shows its actual last-out event", () => {
  assert.deepEqual(
    dailyPunchSummary([entry("2026-10-18T20:00:00Z", "2026-10-20T02:00:00Z")], start, end, now),
    { firstIn: null, lastOut: "2026-10-20T02:00:00Z" },
  );
});
