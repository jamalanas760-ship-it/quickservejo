import { parsePayItems } from "./employee-hr.ts";
/** CSV exported from Excel; quoted commas/newlines and UTF-8 BOM are supported. */
export function parseCsv(text: string): string[][] {
  if (text.length > 1000000) throw new Error("CSV must be smaller than 1 MB.");
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i++) {
    const c = source[i]!;
    if (c === '"') {
      if (quoted && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (quoted) quoted = false;
      else if (!cell) quoted = true;
      else throw new Error("Invalid CSV quoting.");
    } else if (c === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && source[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((s) => s.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw new Error("Unclosed CSV quote.");
  row.push(cell);
  if (row.some((s) => s.trim())) rows.push(row);
  return rows;
}
export const HR_IMPORT_COLUMNS = [
  "staff_id",
  "employee_name",
  "employee_number",
  "department",
  "job_title",
  "hired_on",
  "ended_on",
  "currency",
  "basic_salary",
  "allowances",
  "deductions",
  "payroll_start",
  "generate_day",
  "salary_proration",
  "leave_start_year",
  "annual_days",
  "sick_days",
  "annual_opening",
  "sick_opening",
  "annual_accrual",
  "sick_accrual",
  "day_basis",
  "workweek",
  "hours_per_day",
] as const;
export function parseHRSetupCsv(text: string, allowedStaff: ReadonlySet<string>) {
  const [header, ...sourceRows] = parseCsv(text);
  let rows = sourceRows;
  if (!header || !rows.length) throw new Error("Add at least one employee row.");

  if (new Set(header).size !== header.length) throw new Error("Duplicate CSV columns.");
  for (const column of HR_IMPORT_COLUMNS)
    if (!header.includes(column)) throw new Error(`Missing column: ${column}`);
  rows = rows.filter((row) =>
    header.some(
      (column, index) => column !== "staff_id" && column !== "employee_name" && row[index]?.trim(),
    ),
  );
  if (!rows.length) throw new Error("Fill at least one employee setup row.");
  if (rows.length > 200) throw new Error("Import up to 200 employees at a time.");
  const seen = new Set<string>();
  return rows.map((row, index) => {
    if (row.length !== header.length)
      throw new Error(`Row ${index + 2}: column count does not match.`);
    const value = (key: (typeof HR_IMPORT_COLUMNS)[number]) => row[header.indexOf(key)]!.trim();
    const id = value("staff_id");
    if (!allowedStaff.has(id) || seen.has(id))
      throw new Error(`Row ${index + 2}: unknown or duplicate employee ID.`);
    seen.add(id);
    const n = (key: (typeof HR_IMPORT_COLUMNS)[number]) => {
      const v = value(key);
      if (!v || !Number.isFinite(Number(v)))
        throw new Error(`Row ${index + 2}: enter a number for ${key}.`);
      return Number(v);
    };
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value("hired_on")) ||
      !/^\d{4}-\d{2}$/.test(value("payroll_start"))
    )
      throw new Error(
        `Row ${index + 2}: use YYYY-MM-DD for joining date and YYYY-MM for payroll start.`,
      );
    const workweek = value("workweek")
      .split(",")
      .map((d) => {
        if (!d.trim()) throw new Error("Enter working weekdays.");
        return Number(d);
      });
    if (workweek.some((n) => !Number.isInteger(n) || n < 0 || n > 6))
      throw new Error(`Row ${index + 2}: working days must be 0–6.`);
    return {
      staff_id: id,
      employment: {
        employee_number: value("employee_number"),
        department: value("department"),
        job_title: value("job_title"),
        hired_on: value("hired_on"),
        ended_on: value("ended_on"),
      },
      setup: {
        currency: value("currency").toUpperCase(),
        income: [
          { label: "Basic salary", amount: n("basic_salary") },
          ...parsePayItems(value("allowances").replaceAll(";", "\n")),
        ],
        deductions: parsePayItems(value("deductions").replaceAll(";", "\n")),
        payroll_enabled: true,
        payroll_start: `${value("payroll_start")}-01`,
        generate_day: n("generate_day"),
        salary_proration: value("salary_proration"),
        leave_enabled: true,
        leave_start_year: n("leave_start_year"),
        annual_days: n("annual_days"),
        sick_days: n("sick_days"),
        annual_opening: n("annual_opening"),
        sick_opening: n("sick_opening"),
        annual_accrual: value("annual_accrual"),
        sick_accrual: value("sick_accrual"),
        day_basis: value("day_basis"),
        workweek,
        hours_per_day: n("hours_per_day"),
      },
    };
  });
}
