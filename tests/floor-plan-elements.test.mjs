import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
const source = await readFile(
  new URL("../src/lib/floor-plan-elements.ts", import.meta.url),
  "utf8",
);
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const {
  FLOOR_ELEMENT_TYPES,
  createFloorElement,
  parseFloorElements,
  moveFloorElement,
  normalizeFloorElement,
} = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
test("each floor element retains type, geometry and label through a saved JSON round trip", () => {
  for (const type of FLOOR_ELEMENT_TYPES) {
    const element = createFloorElement(type);
    assert.deepEqual(parseFloorElements(JSON.parse(JSON.stringify([element]))), [element]);
  }
});
test("unsupported objects and duplicate IDs cannot enter a floor", () => {
  const element = createFloorElement("tree");
  assert.equal(
    parseFloorElements([null, {}, element, element, { ...element, id: "bad", type: "script" }])
      .length,
    1,
  );
});
test("dragging snaps predictably and clamps movement and resizing to floor bounds", () => {
  const element = createFloorElement("wall");
  assert.equal(moveFloorElement(element, 2.4, 3.6, true).x, 52);
  assert.equal(moveFloorElement(element, 2.4, 3.6, false).x, 52.4);
  const moved = moveFloorElement(element, 1000, -1000, true);
  assert.equal(moved.x, 100 - element.width / 2);
  assert.equal(moved.y, element.height / 2);
  const resized = moveFloorElement(element, -1000, 1000, true, true);
  assert.equal(resized.width, 1);
  assert.equal(resized.height, 80);
  assert.ok(resized.y >= resized.height / 2);
});
test("invalid numbers, excessive rotation and labels are normalized", () => {
  const normalized = normalizeFloorElement({
    ...createFloorElement("tree"),
    x: Infinity,
    y: NaN,
    width: -10,
    height: 999,
    rotation: 999,
    label: "x".repeat(100),
  });
  assert.equal(normalized.rotation, 180);
  assert.equal(normalized.label.length, 60);
  assert.equal(normalized.width, 1);
  assert.equal(normalized.height, 80);
  assert.ok(Number.isFinite(normalized.x) && Number.isFinite(normalized.y));
});
