import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const root = new URL("..", import.meta.url).pathname;
const cache = new Map();
function load(path) {
  if (cache.has(path)) return cache.get(path).exports;
  const module = { exports: {} };
  cache.set(path, module);
  const localRequire = (id) => {
    if (id.endsWith(".css")) return {};
    if (!id.startsWith(".") && !id.startsWith("@/")) return require(id);
    const base = id.startsWith("@/")
      ? resolve(root, "src", id.slice(2))
      : resolve(dirname(path), id);
    for (const extension of [".tsx", ".ts"]) {
      try {
        readFileSync(base + extension);
      } catch {
        continue;
      }
      return load(base + extension);
    }
    throw new Error(`Missing local module ${id}`);
  };
  const code = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: localRequire });
  return module.exports;
}
const { WorkforceClockCard } = load(
  resolve(root, "src/components/workforce/WorkforceClockCard.tsx"),
);
const defaults = {
  ar: false,
  name: "Test",
  status: "Not clocked in",
  verification: { status: "off_premise", distance_meters: 1691 },
  phase: "tracking",
  updatedAt: 100000,
  now: 100000,
  radius: 100,
  clockState: "off",
  workedToday: "0h 00m",
  sessionLabel: "Last session",
  sessionValue: "0h 00m",
  shiftLabel: "Next shift",
  shiftValue: "—",
  shiftHint: "No upcoming shift",
  pending: false,
  disabled: true,
  clockOut: false,
  onPunch() {},
  onReportMissing() {},
  locationMessage: "Outside attendance radius.",
  onRetry() {},
};
const render = (props = {}) =>
  renderToStaticMarkup(React.createElement(WorkforceClockCard, { ...defaults, ...props }));

test("outside-radius overview keeps the punch disabled and reports actual distance without a Refresh requirement", () => {
  const html = render();
  assert.match(html, /Off premise/);
  assert.match(html, /1\.69 km away/);
  assert.match(html, /Attendance radius/);
  assert.match(html, /<button[^>]*disabled=""[^>]*aria-describedby="attendance-location-status"/);
  assert.match(html, /Location updates automatically/);
  assert.doesNotMatch(html, /Check again|Refresh location|Enable location|Ready to clock in/);
});

test("unverified or stale locations cannot be presented as live verified attendance", () => {
  for (const reason of ["permission_denied", "stale", "inaccurate"]) {
    const html = render({
      verification: {
        status: "unverified",
        distance_meters: reason === "inaccurate" ? 1691 : null,
        reason,
      },
      phase: reason === "permission_denied" ? reason : "tracking",
    });
    assert.doesNotMatch(html, /Location updates automatically|km away|Updated just now/);
    assert.match(html, /Location verification required/);
    assert.match(html, /Check again/);
    assert.match(html, /<button[^>]*disabled=""[^>]*aria-describedby="attendance-location-status"/);
  }
});

test("location age and localized distance remain visible without removing session information", () => {
  const html = render({
    verification: { status: "on_premise", distance_meters: 15 },
    now: 109000,
    disabled: false,
  });
  assert.match(html, /15 m away/);
  assert.match(html, /Updated 9 s ago/);
  assert.match(html, /Worked today|Last session|Next shift/);
  assert.doesNotMatch(html, /<button[^>]*disabled=""/);
  const arabic = render({ ar: true, name: "عبدالله محمد" });
  assert.match(arabic, /خارج المطعم/);
  assert.match(arabic, /الموقع يتحدث تلقائيًا/);
});

test("both outside-radius punch directions retain the existing locked disabled button", () => {
  for (const clockOut of [false, true]) {
    const html = render({ clockOut });
    assert.match(html, /lucide-lock-keyhole/);
    assert.match(html, /<button[^>]*disabled=""[^>]*aria-describedby="attendance-location-status"/);
    assert.match(html, clockOut ? /Clock out/ : /Clock in/);
    assert.match(html, /available inside the attendance radius/);
  }
});
test("clock card renders the saved employee image with an initials fallback", () => {
  const html = render({ avatarUrl: "https://example.test/avatar.png" });
  assert.match(html, /src="https:\/\/example.test\/avatar.png"/);
  assert.match(html, /wf-clock-profile-image/);
  assert.doesNotMatch(render({ avatarUrl: null }), /wf-clock-profile-image/);
});

test("verified inside-radius buttons hide locks and distinguish clock direction", () => {
  for (const clockOut of [false, true]) {
    const html = render({
      clockOut,
      disabled: false,
      verification: { status: "on_premise", distance_meters: 15 },
    });
    assert.doesNotMatch(html, /lucide-lock-keyhole|<button[^>]*disabled=""/);
    assert.match(html, new RegExp(`data-punch-direction="${clockOut ? "out" : "in"}"`));
  }
  assert.match(render({ disabled: false }), /<button[^>]*disabled=""/);
  assert.match(
    render({
      pending: true,
      disabled: false,
      verification: { status: "on_premise", distance_meters: 15 },
    }),
    /<button[^>]*disabled=""/,
  );
});

test("roadmap hides unknown positions and derives visible positions from actual distance", () => {
  assert.doesNotMatch(
    render({ verification: { status: "unverified", distance_meters: 20 } }),
    /wf-arrival-marker-halo/,
  );
  const { attendanceRoadmapPosition } = load(resolve(root, "src/lib/attendance-roadmap.ts"));
  for (const distance of [null, NaN, Infinity, -1])
    assert.equal(attendanceRoadmapPosition(distance, 100), null);
  for (const radius of [0, -1, Infinity, NaN])
    assert.equal(attendanceRoadmapPosition(10, radius), null);
  assert.equal(attendanceRoadmapPosition(1000, 100).progress, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(attendanceRoadmapPosition(0, 100))), {
    progress: 1,
    x: 425,
    y: 66,
  });
  assert.ok(Math.abs(attendanceRoadmapPosition(100, 100).x - 382) < 0.001);
  assert.ok(attendanceRoadmapPosition(101, 100).x < 382);
  assert.ok(attendanceRoadmapPosition(50, 100).x > attendanceRoadmapPosition(200, 100).x);
});
