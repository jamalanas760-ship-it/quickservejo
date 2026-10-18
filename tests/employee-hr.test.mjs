import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import vm from "node:vm";
const module = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(readFileSync(new URL("../src/lib/employee-hr.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  { module, exports: module.exports },
);
const { leaveBalance, servicePeriod, parsePayItems, payTotal } = module.exports;
const account = {
  staff_id: "a",
  year: 2026,
  leave_type: "annual",
  opening_days: 2,
  entitlement_days: 24,
  accrual_method: "upfront",
  accrual_start: "2026-01-01",
  accrual_end: "2026-12-31",
  day_basis: "calendar",
  workweek: [0, 1, 2, 3, 4],
  hours_per_day: 8,
};
const leave = (id, start, end, status = "approved", extra = {}) => ({
  id,
  staff_id: "a",
  leave_type: "annual",
  start_date: start,
  end_date: end,
  status,
  ...extra,
});
test("balances separate taken, future reservations and pending requests", () => {
  const b = leaveBalance(
    account,
    [
      leave("past", "2026-01-01", "2026-01-03"),
      leave("future", "2026-12-01", "2026-12-02"),
      leave("pending", "2026-06-01", "2026-06-15", "pending"),
    ],
    "2026-10-18",
  );
  assert.equal(b.taken, 3);
  assert.equal(b.reserved, 2);
  assert.equal(b.available, 21);
  assert.equal(b.projected, 21);
  assert.equal(b.transactions.at(-1).balance, 21);
});
test("cross-year leaves clip dates and exclude another employee or leave type", () => {
  const b = leaveBalance(
    account,
    [
      leave("year", "2025-12-25", "2026-01-02"),
      leave("other", "2026-02-01", "2026-02-10", "approved", { staff_id: "b" }),
      leave("sick", "2026-02-01", "2026-02-10", "approved", { leave_type: "sick" }),
    ],
    "2026-10-18",
  );
  assert.equal(b.taken, 2);
});
test("daily accrual includes leap days and projection reconciles to ledger", () => {
  const a = {
    ...account,
    year: 2024,
    opening_days: 0,
    entitlement_days: 366,
    accrual_method: "daily",
    accrual_start: "2024-01-01",
    accrual_end: "2024-12-31",
  };
  const b = leaveBalance(a, [], "2024-02-29");
  assert.equal(b.earned, 60);
  assert.equal(b.available, 60);
  assert.equal(b.projected, 366);
  assert.equal(b.transactions.at(-1).balance, 366);
  assert.equal(leaveBalance(a, [], "2023-12-31").available, 0);
});
test("workdays, partial days, overnight times and duplicates do not overcharge", () => {
  const a = { ...account, day_basis: "workdays", workweek: [1, 2, 3, 4, 5] };
  assert.equal(leaveBalance(a, [leave("week", "2026-10-16", "2026-10-18")], "2026-10-20").taken, 1);
  const b = leaveBalance(
    account,
    [
      leave("half", "2026-10-01", "2026-10-01", "approved", {
        start_time: "09:00",
        end_time: "13:00",
      }),
      leave("night", "2026-10-02", "2026-10-02", "approved", {
        start_time: "23:00",
        end_time: "03:00",
      }),
    ],
    "2026-10-20",
  );
  assert.equal(b.taken, 1);
  assert.equal(
    leaveBalance(
      account,
      [leave("one", "2026-10-01", "2026-10-01"), leave("two", "2026-10-01", "2026-10-01")],
      "2026-10-20",
    ).taken,
    1,
  );
});
test("service period uses calendar anniversaries including month-end and leap day", () => {
  assert.equal(
    JSON.stringify(servicePeriod("2024-06-06", "2026-10-18")),
    JSON.stringify({ years: 2, months: 4, days: 12 }),
  );
  assert.equal(
    JSON.stringify(servicePeriod("2024-01-31", "2024-02-29")),
    JSON.stringify({ years: 0, months: 1, days: 0 }),
  );
  assert.equal(
    JSON.stringify(servicePeriod("2024-02-29", "2025-02-28")),
    JSON.stringify({ years: 1, months: 0, days: 0 }),
  );
  assert.equal(servicePeriod(null, "2026-01-01"), null);
  assert.equal(servicePeriod("2027-01-01", "2026-01-01"), null);
});
test("salary parsing validates amounts and uses thousandth precision without floating drift", () => {
  assert.equal(payTotal(parsePayItems("Basic = 800\nAllowance = 150.125\nTravel = 49.875")), 1000);
  assert.equal(payTotal(parsePayItems("A = 0.1\nB = 0.2")), 0.3);
  for (const s of ["A = -1", "A = NaN", "A = Infinity", "A = ", "A 25", "= 10"])
    assert.throws(() => parsePayItems(s));
});
test("overlapping partial approvals consume the union of their hours", () => {
  const b = leaveBalance(
    account,
    [
      leave("a", "2026-10-01", "2026-10-01", "approved", {
        start_time: "09:00",
        end_time: "13:00",
      }),
      leave("b", "2026-10-01", "2026-10-01", "approved", {
        start_time: "10:00",
        end_time: "14:00",
      }),
    ],
    "2026-10-20",
  );
  assert.equal(b.taken, 0.625);
});
