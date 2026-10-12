import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
async function moduleUrl(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  return `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString("base64")}`;
}
const dates = await moduleUrl("../src/lib/reservation-studio.ts");
const source = (await readFile(new URL("../src/lib/home-period.ts", import.meta.url), "utf8")).replace('"./reservation-studio"', JSON.stringify(dates));
const js = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {homePeriodRange} = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
test("Home periods use restaurant dates rather than the device day", () => {
  const range = homePeriodRange("today", "Asia/Amman", new Date("2026-10-04T22:00:00Z"));
  assert.equal(range.firstDay, "2026-10-05");
  assert.equal(range.start,"2026-10-04T21:00:00.000Z");
});
test("calendar weeks and prior months cross year boundaries correctly", () => {
  const now = new Date("2026-01-04T12:00:00Z");
  assert.equal(homePeriodRange("week","UTC",now).firstDay,"2025-12-29");
  assert.equal(homePeriodRange("last-week","UTC",now).firstDay,"2025-12-22");
  assert.equal(homePeriodRange("last-month","UTC",now).firstDay,"2025-12-01");
  assert.equal(homePeriodRange("last-year","UTC",now).lastDay,"2025-12-31");
});
test("DST and leap years preserve complete calendar periods", () => {
  const day=homePeriodRange("today","America/New_York",new Date("2026-03-08T12:00:00Z"));
  assert.equal((Date.parse(day.end)-Date.parse(day.start))/3600000,23);
  assert.equal(homePeriodRange("month","UTC",new Date("2028-02-12T12:00:00Z")).lastDay,"2028-02-29");
});
const {readHomeSelection, selectedHomeRange, validCalendarDay} = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
test("custom date ranges include the entire restaurant end day across DST", () => {
  const selection = readHomeSelection({from: "2026-03-07", until: "2026-03-09"});
  const range = selectedHomeRange(selection, "America/New_York");
  assert.equal(range.start, "2026-03-07T05:00:00.000Z");
  assert.equal(range.end, "2026-03-10T04:00:00.000Z");
  assert.equal(range.lastDay, "2026-03-09");
});
test("impossible dates, reversed ranges and unknown periods fall back safely", () => {
  assert.equal(validCalendarDay("2026-02-30"), false);
  assert.equal(validCalendarDay("2028-02-29"), true);
  assert.deepEqual(readHomeSelection({from: "2026-10-12", until: "2026-10-11"}), {period: "today"});
  assert.deepEqual(readHomeSelection({period: "invalid"}), {period: "today"});
});
