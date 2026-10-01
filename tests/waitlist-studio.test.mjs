import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
const transpile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(transpile(source)).toString("base64")}`;
const dates = moduleUrl(await readFile(new URL("../src/lib/reservation-studio.ts", import.meta.url), "utf8"));
const source = (await readFile(new URL("../src/lib/waitlist-studio.ts", import.meta.url), "utf8")).replace('"./reservation-studio"', JSON.stringify(dates));
const { defaultWaitlistVisit } = await import(moduleUrl(source));
test("waitlist defaults respect the guest's requested time in the restaurant timezone", () => {
  assert.deepEqual(defaultWaitlistVisit("2026-10-01", "19:30:00", "Asia/Amman", new Date("2026-10-01T09:00:00Z")), { date: "2026-10-01", time: "19:30" });
});
test("waitlist default time rolls into the next restaurant day near midnight", () => {
  assert.deepEqual(defaultWaitlistVisit("2026-10-01", "19:00", "Asia/Amman", new Date("2026-10-01T20:15:00Z")), { date: "2026-10-02", time: "00:15" });
});
test("past requests and invalid preferred times use a future quarter-hour", () => {
  assert.deepEqual(defaultWaitlistVisit("2026-09-30", "25:70", "Asia/Amman", new Date("2026-10-01T09:07:00Z")), { date: "2026-10-01", time: "13:15" });
  assert.deepEqual(defaultWaitlistVisit("2026-10-03", null, "Asia/Amman", new Date("2026-10-01T09:00:00Z")), { date: "2026-10-03", time: "18:00" });
});
