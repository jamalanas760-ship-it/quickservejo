import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import vm from "node:vm";
const exports = {};
vm.runInNewContext(
  ts.transpileModule(
    readFileSync(new URL("../src/lib/floor-collision.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText,
  { exports, Math },
);
const { floorObjectsOverlap, floorCollision } = exports;
const box = (id, x, y, width = 100, height = 100, rotation = 0, kind = "table") => ({
  id,
  x,
  y,
  width,
  height,
  rotation,
  kind,
});
test("table intersections are rejected but touching edges and separate objects are allowed", () => {
  const a = box("a", 0, 0);
  assert.equal(floorObjectsOverlap(a, box("b", 99, 0)), true);
  assert.equal(floorObjectsOverlap(a, box("b", 100, 0)), false);
  assert.equal(floorObjectsOverlap(a, box("b", 101, 0)), false);
  assert.equal(floorCollision(a, [a]), undefined);
});
test("rotation is included and the collision test is symmetric", () => {
  const a = box("a", 0, 0, 120, 20, 45);
  const b = box("b", 45, 45, 15, 15);
  assert.equal(floorObjectsOverlap(a, b), true);
  assert.equal(floorObjectsOverlap(b, a), true);
  assert.equal(floorObjectsOverlap({ ...a, rotation: 0 }, b), false);
});
test("wall openings and joined walls remain supported, independent furniture does not overlap", () => {
  const wall = box("wall", 0, 0, 200, 10, 0, "wall");
  assert.equal(floorCollision(wall, [box("door", 0, 0, 30, 10, 0, "door")]), undefined);
  assert.equal(floorCollision(wall, [box("window", 0, 0, 30, 10, 0, "window")]), undefined);
  assert.equal(floorCollision(wall, [box("wall2", 0, 0, 10, 100, 0, "wall")]), undefined);
  assert.equal(floorCollision(wall, [box("table", 0, 0)]).id, "table");
});
test("scaled rotated furniture respects actual dimensions", () => {
  const a = box("a", 0, 0, 200, 40, 90);
  assert.equal(floorObjectsOverlap(a, box("b", 0, 110, 20, 30)), true);
  assert.equal(floorObjectsOverlap(a, box("b", 45, 0, 20, 20)), false);
});
