import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import { workforceDayKey } from "../src/lib/workforce-hours.ts";
const require = createRequire(import.meta.url);
const code = ts.transpileModule(
  readFileSync(new URL("../src/components/workforce/RequestPickers.tsx", import.meta.url), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
function picker(overrides = {}) {
  let cursor = 0;
  const values = [];
  const changes = [];
  const props = {
    label: "Date",
    value: "2026-10-18",
    ar: false,
    timeZone: "Asia/Amman",
    onChange: (value) => changes.push(value),
    ...overrides,
  };
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    require(id) {
      if (id === "react")
        return {
          useId: () => "picker",
          useState(initial) {
            const index = cursor++;
            if (!(index in values))
              values[index] = typeof initial === "function" ? initial() : initial;
            return [
              values[index],
              (next) => {
                values[index] = typeof next === "function" ? next(values[index]) : next;
              },
            ];
          },
        };
      if (id.endsWith(".css")) return {};
      if (id === "@/lib/workforce-hours") return { workforceDayKey };
      if (id.startsWith("@/components/"))
        return new Proxy({}, { get: (_target, property) => property });
      return require(id);
    },
  });
  const render = () => {
    cursor = 0;
    return exports.RequestDatePicker(props);
  };
  const all = (tree, predicate) => {
    const result = [];
    const walk = (value) => {
      if (!value || typeof value !== "object") return;
      if (predicate(value)) result.push(value);
      const children = value.props?.children;
      for (const child of Array.isArray(children) ? children.flat(Infinity) : [children])
        walk(child);
    };
    walk(tree);
    return result;
  };
  return { changes, render, all, find: (predicate) => all(render(), predicate)[0] };
}
const type = (name) => (node) => node.type === name;

test("date taps remain drafts until Confirm date is pressed", () => {
  const h = picker();
  h.find((node) => node.props?.id === "picker").props.onClick();
  assert.equal(h.find(type("Dialog")).props.open, true);
  h.find(type("Calendar")).props.onSelect(new Date(2026, 9, 17));
  assert.deepEqual(h.changes, []);
  const buttons = h.all(h.render(), type("Button"));
  buttons.at(-1).props.onClick();
  assert.deepEqual(h.changes, ["2026-10-17"]);
  assert.equal(h.find(type("Dialog")).props.open, false);
});

test("closing a draft leaves the form unchanged and reopening resets to its saved date", () => {
  const h = picker();
  h.find((node) => node.props?.id === "picker").props.onClick();
  h.find(type("Calendar")).props.onSelect(new Date(2026, 9, 15));
  h.find(type("Dialog")).props.onOpenChange(false);
  assert.deepEqual(h.changes, []);
  h.find((node) => node.props?.id === "picker").props.onClick();
  assert.equal(h.find(type("Calendar")).props.selected.getDate(), 18);
});

test("minimum and maximum remain enforced when selecting dates and on confirm", () => {
  const h = picker({ min: "2026-10-10", max: "2026-10-20" });
  h.find((node) => node.props?.id === "picker").props.onClick();
  for (const day of [9, 21]) h.find(type("Calendar")).props.onSelect(new Date(2026, 9, day));
  assert.equal(h.find(type("Calendar")).props.selected.getDate(), 18);
  const blank = picker({ value: "", max: "2026-10-20" });
  blank.find((node) => node.props?.id === "picker").props.onClick();
  const confirm = blank.all(blank.render(), type("Button")).at(-1);
  assert.equal(confirm.props.disabled, true);
  confirm.props.onClick();
  assert.deepEqual(blank.changes, []);
});

test("an out-of-bounds saved date cannot open a misleading different calendar month", () => {
  const h = picker({ value: "2027-02-01", max: "2026-10-20" });
  h.find((node) => node.props?.id === "picker").props.onClick();
  assert.equal(h.find(type("Calendar")).props.month.getFullYear(), 2026);
  assert.equal(h.find(type("Calendar")).props.month.getMonth(), 9);
  assert.equal(h.all(h.render(), type("Button")).at(-1).props.disabled, true);
});

test("generic date fields keep Tomorrow while correction fields offer Yesterday", () => {
  const regular = picker();
  const past = picker({ pastPresets: true });
  const text = (h) =>
    h
      .all(h.render(), type("Button"))
      .map((node) => node.props.children)
      .filter((value) => typeof value === "string");
  assert.ok(text(regular).includes("Tomorrow"));
  assert.ok(text(past).includes("Yesterday"));
  assert.equal(past.find(type("Calendar")).props.weekStartsOn, 0);
});

test("disabled date fields cannot open or commit changes", () => {
  const h = picker({ disabled: true });
  h.find((node) => node.props?.id === "picker").props.onClick();
  assert.equal(h.find(type("Dialog")).props.open, false);
  h.find(type("Calendar")).props.onSelect(new Date(2026, 9, 17));
  h.all(h.render(), type("Button")).at(-1).props.onClick();
  assert.deepEqual(h.changes, []);
});

test("month and year jump controls disable choices outside the allowed range", () => {
  const h = picker({ min: "2026-10-10", max: "2026-10-20" });
  h.find((node) => node.props?.id === "picker").props.onClick();
  h.find((node) => node.props?.["aria-controls"] === "picker-jump").props.onClick();
  const selects = h.all(h.render(), type("select"));
  const months = h.all(selects[0], type("option"));
  assert.equal(months[8].props.disabled, true);
  assert.equal(months[9].props.disabled, false);
  assert.equal(months[10].props.disabled, true);
  const years = h.all(selects[1], type("option"));
  assert.equal(years.find((node) => node.props.value === 2025).props.disabled, true);
  assert.equal(years.find((node) => node.props.value === 2026).props.disabled, false);
});
