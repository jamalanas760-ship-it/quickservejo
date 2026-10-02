import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import vm from "node:vm";
const exports = {};
vm.runInNewContext(
  ts.transpileModule(
    readFileSync(new URL("../src/lib/floor-3d-layout.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText,
  { exports, Math },
);
const { floorPointToLayout, moveTableInFloor } = exports;
test("ground coordinates preserve existing floor positions across different canvas sizes", () => {
  for (const [w, d] of [
    [10, 7],
    [24, 16],
    [6, 4],
  ]) {
    const center = floorPointToLayout(0, 0, w, d);
    assert.equal(center.x, 500);
    assert.equal(center.y, 350);
    const point = floorPointToLayout(w * 0.2, -d * 0.1, w, d);
    assert(Math.abs(point.x - 700) < 1e-8);
    assert(Math.abs(point.y - 280) < 1e-8);
  }
});
test("3D movement snaps consistently and keeps tables inside the saved plan", () => {
  const start = { x: 500, y: 350, rotation: 45, scale: 1.2 };
  const moved = moveTableInFloor(start, 24, -16, true);
  assert.equal(moved.x, 520);
  assert.equal(moved.y, 330);
  assert.equal(moved.rotation, 45);
  assert.equal(moved.scale, 1.2);
  const edge = moveTableInFloor(start, 10000, -10000, false);
  assert.equal(edge.x, 955);
  assert.equal(edge.y, 45);
  const smooth = moveTableInFloor(start, 1.25, 2.5, false);
  assert.equal(smooth.x, 501.25);
  assert.equal(smooth.y, 352.5);
  assert.equal(start.x, 500);
});
