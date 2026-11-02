import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const source = readFileSync(new URL("../src/lib/primary-navigation.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext },
}).outputText;
const { selectDesktopPrimary, DESKTOP_NAV_LIMIT, PINNED_TOOL_LIMIT } = await import(
  `data:text/javascript,${encodeURIComponent(js)}`
);
const items = Array.from({ length: 14 }, (_, i) => ({ to: `/tool-${i}`, label: `Tool ${i}` }));
test("desktop and tablet offer ten distinct destinations with home and preferred order", () => {
  const result = selectDesktopPrimary(items, [items[0], items[8], items[4]]);
  assert.equal(DESKTOP_NAV_LIMIT, 10);
  assert.equal(PINNED_TOOL_LIMIT, 9);
  assert.equal(result.length, 10);
  assert.deepEqual(result.slice(0, 3), [items[0], items[8], items[4]]);
  assert.equal(new Set(result.map((x) => x.to)).size, 10);
});
test("saved short pin lists fill remaining slots without exposing unauthorized routes", () => {
  const result = selectDesktopPrimary(items, [items[0], { to: "/admin-only" }, items[8], items[8]]);
  assert.equal(result.length, 10);
  assert.ok(result.every((x) => items.includes(x)));
  assert.equal(result[1], items[8]);
});
test("restricted roles keep only their permitted destinations", () => {
  assert.deepEqual(selectDesktopPrimary(items.slice(0, 3), items), items.slice(0, 3));
  assert.deepEqual(selectDesktopPrimary([], items), []);
});
