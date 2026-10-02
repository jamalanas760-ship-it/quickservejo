import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import vm from "node:vm";
const exports = {};
vm.runInNewContext(
  ts.transpileModule(
    readFileSync(new URL("../src/lib/floor-seating.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText,
  { exports, Math },
);
test("all chair fronts face the table centre in both plan and scene coordinates", () => {
  for (const shape of ["round", "square", "rectangle"])
    for (let count = 2; count <= 8; count++) {
      const seats = exports.floorSeats(shape, count);
      assert.equal(seats.length, count);
      for (const seat of seats) {
        const length = Math.hypot(seat.x, seat.y);
        assert(Math.abs(Math.sin(seat.rotation) + seat.x / length) < 1e-10);
        assert(Math.abs(Math.cos(seat.rotation) + seat.y / length) < 1e-10);
        // CSS rotation is the negative scene Y rotation, so the local front (+Y) agrees.
        const css = -seat.rotation;
        assert(Math.abs(-Math.sin(css) + seat.x / length) < 1e-10);
        assert(Math.abs(Math.cos(css) + seat.y / length) < 1e-10);
      }
    }
});
test("seat capacity is bounded and stable for invalid or oversized counts", () => {
  assert.equal(exports.floorSeats("round", 100).length, 8);
  assert.equal(exports.floorSeats("round", 0).length, 4);
  assert.equal(exports.floorSeats("round", NaN).length, 4);
});
