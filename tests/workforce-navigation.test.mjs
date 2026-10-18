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
test("section selector exposes all ten manager destinations with the existing order", () => {
  const items = workforceDestinations(false, true);
  assert.equal(items.length, 10);
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
test("quick navigation preserves Overview and My workspace and marks other sections under More", () => {
  const changes = [];
  const all = nodes(
    WorkforceNavigation({
      active: "attendance",
      ar: true,
      canManage: true,
      onChange: (value) => changes.push(value),
    }),
  );
  const more = all.find((node) => node.props?.className === "wf-mobile-more");
  assert.equal(more.props["data-active"], true);
  const dock = all.find(
    (node) => node.type === "nav" && node.props.className.includes("wf-mobile-workforce-dock"),
  );
  const shell = nodes(dock).find((node) =>
    node.props?.className?.includes("wf-mobile-workforce-items"),
  );
  assert.equal(shell.props.style.display, "grid");
  assert.equal(shell.props.style.gridTemplateColumns, "repeat(3, minmax(0, 1fr))");
  const buttons = nodes(shell.props.children[0]).filter((node) => node.type === "button");
  assert.equal(buttons.length, 2);
  buttons[1].props.onClick();
  assert.deepEqual(changes, ["my_workspace"]);
});
