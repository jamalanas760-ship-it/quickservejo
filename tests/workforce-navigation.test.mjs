import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import { workforceDestinations } from "../src/lib/workforce-navigation.ts";
const require = createRequire(import.meta.url),
  module = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(
    readFileSync(
      new URL("../src/components/workforce/WorkforceNavigation.tsx", import.meta.url),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText,
  {
    module,
    exports: module.exports,
    require: (id) =>
      id === "react"
        ? { useState: (v) => [v, () => {}] }
        : id === "@/components/ui/popover"
          ? { Popover: () => null, PopoverTrigger: () => null, PopoverContent: () => null }
          : id === "@/lib/workforce-navigation"
            ? { workforceDestinations }
            : id === "@/components/nav/ViewportDock"
              ? { ViewportDock: () => null }
              : require(id),
  },
);
const { WorkforceNavigation } = module.exports;
function nodes(node) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  return [node, ...nodes(node.props?.children)];
}
test("section selector exposes all workforce manager destinations with the existing order", () => {
  const items = workforceDestinations(false, true);
  assert.equal(items.length, 11);
  assert.equal(items[0].id, "overview");
  assert.equal(items[1].id, "my_workspace");
  assert.equal(items.filter((item) => item.id === "payslips" || item.id === "leave").length, 2);
  assert.equal(
    workforceDestinations(false, false).some((item) => item.id === "labor"),
    false,
  );
});
test("app menus route directly to leave records without exposing unavailable Labor or native menus", () => {
  const changes = [];
  const all = nodes(
    WorkforceNavigation({
      active: "payslips",
      ar: false,
      canManage: false,
      onChange: (value) => changes.push(value),
    }),
  );
  assert.equal(
    all.some((node) => node.type === "select"),
    false,
  );
  const menu = all.find((node) => node.props?.className === "wf-section-menu-list");
  const buttons = nodes(menu).filter((node) => node.type === "button");
  assert.equal(
    buttons.some((node) => node.props.children === "Labor"),
    false,
  );
  buttons.find((node) => node.props.children === "Leave transactions").props.onClick();
  assert.deepEqual(changes, ["leave"]);
});
test("workforce exposes local sections without rendering a second application dock", () => {
  const all = nodes(
    WorkforceNavigation({ active: "holidays", ar: false, canManage: true, onChange: () => {} }),
  );
  assert.equal(
    all.some((n) => n.props?.className?.includes("wf-mobile-workforce-dock")),
    false,
  );
  const menu = all.find((n) => n.props?.className === "wf-section-menu-list");
  assert.ok(nodes(menu).some((n) => n.type === "button" && n.props.children === "Holidays"));
});
