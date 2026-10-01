import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
const source = await readFile(new URL("../src/lib/reservation-studio.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { reservationDay, addReservationDays, restaurantDateTime, validateBookingHours, defaultBookingHours } = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
test("reservations belong to the restaurant day when a device would show the previous day", () => {
  assert.equal(reservationDay("2026-10-01T21:30:00Z", "Asia/Amman"), "2026-10-02");
  assert.equal(restaurantDateTime("2026-10-01", "18:00", "Asia/Amman"), "2026-10-01T15:00:00.000Z");
  assert.equal(restaurantDateTime("2026-10-01", "18:00", "America/New_York"), "2026-10-01T22:00:00.000Z");
});
test("day navigation crosses month, year and leap-day boundaries without local timezone drift", () => {
  assert.equal(addReservationDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addReservationDays("2028-03-01", -1), "2028-02-29");
});
test("nonexistent daylight-saving wall times cannot silently become another booking time", () => {
  assert.throws(() => restaurantDateTime("2026-03-08", "02:30", "America/New_York"), /unavailable/);
});
test("availability cannot save hours that would produce no slots through the existing same-day API", () => {
  const hours = defaultBookingHours();
  assert.equal(validateBookingHours(hours), true);
  hours["0"] = { open: "12:00", close: "00:00" };
  assert.equal(validateBookingHours(hours), false);
  hours["0"] = { open: "12:00", close: "25:00" };
  assert.equal(validateBookingHours(hours), false);
  hours["0"].closed = true;
  assert.equal(validateBookingHours(hours), true);
});
