import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import { payTotal, servicePeriod } from "../src/lib/employee-hr.ts";
import { workforceDayKey } from "../src/lib/workforce-hours.ts";
const require = createRequire(import.meta.url);
let mutation, saved;
class Details {
  constructor(parentElement) {
    this.parentElement = parentElement;
    this.open = false;
  }
}
const module = { exports: {} };
const code = ts.transpileModule(
  readFileSync(
    new URL("../src/components/workforce/EmployeeSetupPanel.tsx", import.meta.url),
    "utf8",
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
vm.runInNewContext(code + "\nexports.SetupForm = SetupForm;", {
  module,
  exports: module.exports,
  HTMLDetailsElement: Details,
  require: (id) => {
    if (id.endsWith(".css")) return {};
    if (id === "react") return { useState: (v) => [typeof v === "function" ? v() : v, () => {}] };
    if (id === "@tanstack/react-query")
      return {
        useQueryClient: () => ({}),
        useMutation: (options) => {
          mutation = options;
          return { isPending: false };
        },
      };
    if (id === "@/integrations/supabase/client")
      return {
        supabase: {
          rpc: async (name, args) => {
            saved = { name, args };
            return { data: {} };
          },
        },
      };
    if (id === "@/lib/employee-hr") return { payTotal, servicePeriod };
    if (id === "@/lib/workforce-hours") return { workforceDayKey };
    if (id.startsWith("@/")) return {};
    return require(id);
  },
});
function nodes(node) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  return [node, ...nodes(node.props?.children)];
}
const setup = {
  payroll_enabled: false,
  leave_enabled: false,
  currency: "JOD",
  payroll_start: "2026-01-01",
  income: [
    { label: "Basic", amount: 800 },
    { label: "Transport", amount: 150 },
  ],
  deductions: [{ label: "Insurance", amount: 70 }],
  annual_days: 24,
  sick_days: 12,
  annual_opening: 2,
  sick_opening: 1,
  workweek: [0, 1, 2, 3, 4],
  hours_per_day: 8,
};
function render(extra = {}) {
  return module.exports.SetupForm({
    restaurantId: "r",
    staffId: "s",
    ar: false,
    canManage: true,
    profile: { hired_on: "2024-06-06" },
    setup,
    currency: "JOD",
    timeZone: "Asia/Amman",
    hideSubmit: false,
    ...extra,
  });
}
test("paused automation preserves named salary lines and configured leave policy on save", async () => {
  render();
  await mutation.mutationFn();
  assert.equal(saved.name, "save_staff_hr_setup");
  assert.equal(saved.args._setup.payroll_enabled, false);
  assert.equal(saved.args._setup.leave_enabled, false);
  assert.equal(JSON.stringify(saved.args._setup.income), JSON.stringify(setup.income));
  assert.equal(JSON.stringify(saved.args._setup.deductions), JSON.stringify(setup.deductions));
  assert.equal(saved.args._setup.annual_days, 24);
  assert.equal(saved.args._setup.annual_opening, 2);
});
test("salary summary derives net pay from all named lines and managers alone receive private editors", () => {
  const all = nodes(render());
  const value = all.find((n) => n.props?.className === "hr-setup-summary-value");
  assert.equal(value.props.children, "880.000 JOD");
  const personal = nodes(render({ canManage: false }));
  assert.equal(
    personal.filter((n) => n.props?.className === "hr-panel hr-setup-summary-card").length,
    0,
  );
  const empty = nodes(render({ setup: null, profile: null }));
  assert.equal(
    empty.find((n) => n.props?.className === "hr-setup-summary-value").props.children,
    "Not configured",
  );
});
test("invalid hidden field opens every ancestor disclosure before native focus", () => {
  const form = render();
  const outer = new Details(form),
    inner = new Details(outer);
  form.props.onInvalidCapture({ target: { parentElement: inner }, currentTarget: form });
  assert.equal(inner.open, true);
  assert.equal(outer.open, true);
});
