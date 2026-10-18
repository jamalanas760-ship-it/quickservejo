import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import { workforceDayKey, workforceNextDay } from "../src/lib/workforce-hours.ts";
const require = createRequire(import.meta.url),
  module = { exports: {} };
function DateControl() {}
function TimeControl() {}
function Control() {}
const code = ts.transpileModule(
  readFileSync(
    new URL("../src/components/workforce/MissingPunchComposer.tsx", import.meta.url),
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
vm.runInNewContext(code, {
  module,
  exports: module.exports,
  require: (id) => {
    if (id === "react") return { useId: () => "test" };
    if (id === "./RequestPickers")
      return { RequestDatePicker: DateControl, RequestTimePicker: TimeControl };
    if (id === "@/lib/workforce-hours") return { workforceDayKey, workforceNextDay };
    if (id === "./WorkforceButton") return { WorkforceButton: Control };
    if (id.startsWith("@/components/ui/")) return { Label: Control, Textarea: Control };
    return require(id);
  },
});
const { MissingPunchComposer } = module.exports;
function elements(node) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  return [node, ...elements(node.props?.children)];
}
function render(extra = {}) {
  const changed = {};
  const props = {
    ar: false,
    timeZone: "Asia/Amman",
    mode: "both",
    onMode: () => {},
    clockIn: "2026-10-17T09:00",
    clockOut: "2026-10-17T17:00",
    onClockIn: (v) => (changed.in = v),
    onClockOut: (v) => (changed.out = v),
    breakMinutes: "0",
    onBreakMinutes: () => {},
    reason: "Forgot punches",
    onReason: () => {},
    validation: { valid: true, issue: null, durationMinutes: 480 },
    pending: false,
    scheduledIn: "",
    scheduledOut: "",
    onUseSchedule: () => {},
    onSubmit: () => {},
    onCancel: () => {},
    ...extra,
  };
  return { nodes: elements(MissingPunchComposer(props)), changed };
}
test("shared date changes both session boundaries without losing their times", () => {
  const { nodes, changed } = render();
  const dates = nodes.filter((n) => n.type === DateControl);
  assert.equal(dates.length, 1);
  dates[0].props.onChange("2026-10-16");
  assert.equal(changed.in, "2026-10-16T09:00");
  assert.equal(changed.out, "2026-10-16T17:00");
});
test("overnight checkbox and date changes preserve the next-day boundary", () => {
  const a = render();
  a.nodes
    .find((n) => n.type === "input" && n.props.type === "checkbox")
    .props.onChange({ target: { checked: true } });
  assert.equal(a.changed.out, "2026-10-18T17:00");
  const b = render({ clockIn: "2026-10-17T23:00", clockOut: "2026-10-18T07:00" });
  b.nodes.find((n) => n.type === DateControl).props.onChange("2026-09-30");
  assert.equal(b.changed.in, "2026-09-30T23:00");
  assert.equal(b.changed.out, "2026-10-01T07:00");
});
test("single missed-punch mode retains both required session times and the submit guard", () => {
  const { nodes, changed } = render({
    mode: "clock_in",
    validation: { valid: false, issue: "future", durationMinutes: 480 },
  });
  assert.equal(nodes.filter((n) => n.type === TimeControl).length, 2);
  nodes.find((n) => n.type === DateControl).props.onChange("2026-10-15");
  assert.equal(changed.out, "2026-10-15T17:00");
  assert.equal(nodes.find((n) => n.props?.type === "submit").props.disabled, true);
});

test("missed-punch choices do not activate on opening and only change on selection", () => {
  const modes = [];
  const { nodes } = render({ onMode: (value) => modes.push(value) });
  const radios = nodes.filter((n) => n.type === "input" && n.props.type === "radio");
  assert.equal(radios.length, 3);
  assert.deepEqual(modes, []);
  assert.equal(radios.filter((n) => n.props.checked).length, 1);
  radios.find((n) => n.props.value === "clock_out").props.onChange();
  assert.deepEqual(modes, ["clock_out"]);
  const pending = render({ pending: true });
  assert.equal(pending.nodes.find((n) => n.type === "fieldset").props.disabled, true);
});
