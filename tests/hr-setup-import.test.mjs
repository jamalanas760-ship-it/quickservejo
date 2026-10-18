import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseHRSetupCsv, HR_IMPORT_COLUMNS } from "../src/lib/hr-setup-import.ts";
const values = {
  staff_id: "employee-a",
  employee_name: "QA Employee",
  employee_number: "EMP-1",
  department: "Service",
  job_title: "Waiter",
  hired_on: "2024-06-06",
  ended_on: "",
  currency: "JOD",
  basic_salary: "800",
  allowances: "Travel = 100;Food = 50",
  deductions: "Deduction = 70",
  payroll_start: "2026-10",
  generate_day: "1",
  salary_proration: "full_month",
  leave_start_year: "2026",
  annual_days: "24",
  sick_days: "12",
  annual_opening: "2",
  sick_opening: "1",
  annual_accrual: "daily",
  sick_accrual: "upfront",
  day_basis: "workdays",
  workweek: "0,1,2,3,4",
  hours_per_day: "8",
};
const csv = (data = values) =>
  HR_IMPORT_COLUMNS.join(",") +
  "\r\n" +
  HR_IMPORT_COLUMNS.map((k) => '"' + data[k].replaceAll('"', '""') + '"').join(",");
test("Excel CSV handles BOM, commas, quotes, multiline text and CRLF", () => {
  assert.deepEqual(parseCsv('\uFEFFa,b\r\n"Service, team","Say ""hello""\nnext"\r\n'), [
    ["a", "b"],
    ["Service, team", 'Say "hello"\nnext'],
  ]);
  assert.throws(() => parseCsv('a\n"open'));
});
test("import maps actual existing employee to recurring salary and leave settings", () => {
  const [r] = parseHRSetupCsv(csv(), new Set(["employee-a"]));
  assert.equal(r.staff_id, "employee-a");
  assert.equal(
    r.setup.income.reduce((n, i) => n + i.amount, 0),
    950,
  );
  assert.equal(r.setup.deductions[0].amount, 70);
  assert.deepEqual(r.setup.workweek, [0, 1, 2, 3, 4]);
  assert.equal(r.employment.hired_on, "2024-06-06");
  assert.equal(r.setup.annual_opening, 2);
});
test("import rejects duplicate/foreign employee IDs, missing values and malformed money", () => {
  assert.throws(() => parseHRSetupCsv(csv(), new Set()));
  assert.throws(() =>
    parseHRSetupCsv(csv() + "\r\n" + csv().split("\r\n")[1], new Set(["employee-a"])),
  );
  for (const patch of [
    { annual_days: "" },
    { basic_salary: "=1+1" },
    { allowances: "Bad = NaN" },
    { workweek: "0,,1" },
    { workweek: "7" },
    { hired_on: "June 6" },
  ])
    assert.throws(() => parseHRSetupCsv(csv({ ...values, ...patch }), new Set(["employee-a"])));
});
test("unfilled template rows are ignored while employee names identify populated records", () => {
  const empty = Object.fromEntries(
    HR_IMPORT_COLUMNS.map((c) => [
      c,
      c === "staff_id" ? "employee-b" : c === "employee_name" ? "Employee B" : "",
    ]),
  );
  const combined = csv() + "\r\n" + csv(empty).split("\r\n")[1];
  const rows = parseHRSetupCsv(combined, new Set(["employee-a", "employee-b"]));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].staff_id, "employee-a");
  assert.throws(() => parseHRSetupCsv(csv(empty), new Set(["employee-b"])));
});
