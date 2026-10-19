import test from "node:test";
import assert from "node:assert/strict";
import { parseGoogleJordanHolidays } from "../supabase/functions/workforce-holiday-feed/calendar.ts";
import { mergeHolidaySources } from "../src/lib/workforce-holidays.ts";
const event = (name, date, description = "Public holiday", extra = "") =>
  `BEGIN:VEVENT\nDTSTART;VALUE=DATE:${date}\nSUMMARY:${name}\nDESCRIPTION:${description}\n${extra}\nEND:VEVENT\n`;
const calendar = (events) =>
  `BEGIN:VCALENDAR\nX-WR-CALNAME:Holidays in Jordan\n${events}END:VCALENDAR`;
test("Google calendar preserves actual years, tentative flags and separate Eid days", () => {
  const rows = parseGoogleJordanHolidays(
    calendar(
      event("Eid al-Fitr", "20260320") +
        event("Eid al-Fitr Holiday", "20260321") +
        event(
          "Eid al-Adha (tentative)",
          "20270516",
          "Public holiday\\nDate is tentative and may change.",
        ) +
        event("Prophet's Birthday (tentative)", "20280803") +
        event("Independence Day", "20260525"),
    ),
  );
  assert.equal(rows.length, 5);
  assert.equal(rows[0].name, "Eid al-Fitr (Eid Iftar)");
  assert.equal(rows[0].tentative, false);
  assert.equal(rows.find((h) => h.holiday_date === "2027-05-16").tentative, true);
  assert.equal(rows.find((h) => h.holiday_date === "2028-08-03").name, "Mawlid al-Nabawi");
  assert.ok(rows.every((h) => !h.annual && h.source === "google"));
});
test("unfolding, cancelled events, observances and invalid dates cannot create false holidays", () => {
  const rows = parseGoogleJordanHolidays(
    calendar(
      event("Independence Day", "20260525") +
        event("Eid al-\n Fitr (tentative)", "20270309") +
        event("Eid al-Adha", "20260527", "Public holiday", "STATUS:CANCELLED") +
        event("Christmas Day", "20261225", "Observance") +
        event("Eid al-Fitr", "20270230"),
    ),
  );
  assert.equal(rows.length, 2);
  assert.equal(rows.find((h) => h.name.includes("Fitr")).tentative, true);
  assert.throws(() => parseGoogleJordanHolidays("<html>Provider error</html>"));
  assert.throws(() =>
    parseGoogleJordanHolidays(calendar(event("Ramadan begins", "20260218", "Observance"))),
  );
});
test("provider multi-day ranges are exclusive and workspace entries override only identical dates/names", () => {
  const google = parseGoogleJordanHolidays(
    calendar(event("Eid al-Adha", "20260527", "Public holiday", "DTEND;VALUE=DATE:20260530")),
  );
  assert.equal(google.length, 3);
  const local = { id: "local", name: "Eid al-Adha", holiday_date: "2026-05-27", annual: false };
  const merged = mergeHolidaySources([local], google);
  assert.equal(merged.length, 3);
  assert.equal(merged.find((h) => h.holiday_date === "2026-05-27").id, "local");
});

import vm from "node:vm";
import ts from "typescript";
import { readFileSync } from "node:fs";
import { GOOGLE_JORDAN_FEED } from "../supabase/functions/workforce-holiday-feed/calendar.ts";
function service(authorized = true, upstreamOk = true) {
  let handler,
    calls = 0;
  const source = readFileSync(
    new URL("../supabase/functions/workforce-holiday-feed/index.ts", import.meta.url),
    "utf8",
  ).replace(/^import .*;\n/gm, "");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    Response,
    AbortSignal,
    GOOGLE_JORDAN_FEED,
    parseGoogleJordanHolidays,
    createClient: () => ({
      auth: {
        getUser: async () => ({
          data: { user: authorized ? { id: "user" } : null },
          error: authorized ? null : { message: "denied" },
        }),
      },
    }),
    Deno: {
      env: { get: () => "fixture" },
      serve: (fn) => {
        handler = fn;
      },
    },
    fetch: async (url, options) => {
      calls++;
      assert.equal(url, GOOGLE_JORDAN_FEED);
      assert.equal(options.redirect, "error");
      return new Response(
        upstreamOk ? calendar(event("Independence Day", "20260525")) : "Provider error",
        { status: upstreamOk ? 200 : 503 },
      );
    },
  });
  return {
    request: (token = true, method = "POST") =>
      handler(
        new Request("https://example.test", {
          method,
          headers: token ? { Authorization: "Bearer fixture" } : {},
        }),
      ),
    calls: () => calls,
  };
}
test("holiday endpoint authenticates before fetching, caches public data and fails closed on provider errors", async () => {
  const endpoint = service();
  assert.equal((await endpoint.request(false)).status, 401);
  assert.equal((await endpoint.request(true, "GET")).status, 405);
  assert.equal(endpoint.calls(), 0);
  const first = await endpoint.request();
  assert.equal(first.status, 200);
  assert.deepEqual((await first.json()).availableYears, [2026]);
  assert.equal((await endpoint.request()).status, 200);
  assert.equal(endpoint.calls(), 1);
  const denied = service(false);
  assert.equal((await denied.request()).status, 401);
  assert.equal(denied.calls(), 0);
  const unavailable = service(true, false);
  assert.equal((await unavailable.request()).status, 502);
});

test("copying a tentative Google date into a workspace does not silently mark it confirmed", () => {
  const google = parseGoogleJordanHolidays(calendar(event("Eid al-Adha (tentative)", "20270516")));
  const copied = { id: "local", name: "Eid al-Adha", holiday_date: "2027-05-16", annual: false };
  const [merged] = mergeHolidaySources([copied], google);
  assert.equal(merged.id, "local");
  assert.equal(merged.tentative, true);
});
