import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const require = createRequire(import.meta.url),
  root = new URL("..", import.meta.url).pathname,
  cache = new Map();
function load(path) {
  if (cache.has(path)) return cache.get(path).exports;
  const module = { exports: {} };
  cache.set(path, module);
  const localRequire = (id) => {
    if (id.endsWith(".css")) return {};
    if (id === "./RequestPickers")
      return {
        RequestDatePicker: (p) => React.createElement("button", { type: "button" }, p.label),
        RequestTimePicker: (p) => React.createElement("button", { type: "button" }, p.label),
      };
    if (!id.startsWith(".") && !id.startsWith("@/")) return require(id);
    const base = id.startsWith("@/")
      ? resolve(root, "src", id.slice(2))
      : resolve(dirname(path), id);
    return load([base, base + ".tsx", base + ".ts"].find((p) => existsSync(p)));
  };
  const code = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: localRequire });
  return module.exports;
}
const { BalanceCards, SalarySlips, AttendanceHistory } = load(
  resolve(root, "src/components/workforce/HRRecordViews.tsx"),
);
const { MissingPunchComposer } = load(
  resolve(root, "src/components/workforce/MissingPunchComposer.tsx"),
);
test("unconfigured leave shows an explicit empty state rather than fabricated balances", () => {
  const html = renderToStaticMarkup(
    React.createElement(BalanceCards, { accounts: [], leaves: [], today: "2026-10-18", ar: false }),
  );
  assert.match(html, /Annual leave/);
  assert.match(html, /Sick leave/);
  assert.match(html, /not configured/);
  assert.doesNotMatch(html, /24 days|14 days|21 days/);
});
test("payslip displays stored line items, totals, masked account and truthful print action", () => {
  const slip = {
    id: "test-id",
    period: "2026-09-01",
    payment_date: "2026-09-30",
    currency: "JOD",
    employee_name: "QA Employee",
    employee_number: "QA-1",
    department: "Service",
    job_title: "Waiter",
    payment_method: "Bank",
    account_last_four: "1234",
    income: [{ label: "Basic", amount: 100 }],
    deductions: [{ label: "Deduction", amount: 10 }],
    total_income: 100,
    total_deductions: 10,
    net_pay: 90,
    status: "published",
    notes: "",
  };
  const html = renderToStaticMarkup(
    React.createElement(SalarySlips, {
      slips: [slip],
      ar: false,
      canManage: false,
      onEdit: () => {},
    }),
  );
  for (const label of [
    "September 2026",
    "QA Employee",
    "Total income",
    "Total deductions",
    "Net pay",
    "Print / Save PDF",
    "•••• 1234",
  ])
    assert.ok(html.includes(label), label);
  assert.doesNotMatch(html, /Edit draft|800\.000|950\.000/);
});
test("missing punch has a dropdown and one submit action while keeping complete session fields", () => {
  const html = renderToStaticMarkup(
    React.createElement(MissingPunchComposer, {
      ar: false,
      timeZone: "Asia/Amman",
      mode: "both",
      onMode: () => {},
      clockIn: "2026-10-17T09:00",
      clockOut: "2026-10-17T17:00",
      onClockIn: () => {},
      onClockOut: () => {},
      breakMinutes: "0",
      onBreakMinutes: () => {},
      reason: "Forgot both punches",
      onReason: () => {},
      validation: { valid: true, issue: null, durationMinutes: 480, breakMinutes: 0 },
      pending: false,
      scheduledIn: "",
      scheduledOut: "",
      onUseSchedule: () => {},
      onSubmit: () => {},
      onCancel: () => {},
    }),
  );
  assert.match(html, /<select/);
  assert.equal((html.match(/type="submit"/g) || []).length, 1);
  assert.doesNotMatch(html, /type="radio"|>Cancel<|wf-punch-timeline/);
  assert.match(html, /Clock-in/);
  assert.match(html, /Clock-out/);
  assert.doesNotMatch(html, /Session details|Break \(minutes\)|wf-punch-details/);
  assert.match(html, /Clock-out on next day/);
});
test("attendance never counts rejected sessions in completed-hour summary", () => {
  const html = renderToStaticMarkup(
    React.createElement(AttendanceHistory, {
      entries: [
        {
          id: "1",
          clock_in: "2026-10-01T06:00:00Z",
          clock_out: "2026-10-01T14:00:00Z",
          break_minutes: 0,
          review_status: "rejected",
        },
      ],
      month: "2026-10",
      onMonth: () => {},
      ar: false,
      timeZone: "Asia/Amman",
    }),
  );
  assert.match(html, /<dd>0h 0m<\/dd>/);
  assert.match(html, /rejected/);
});
