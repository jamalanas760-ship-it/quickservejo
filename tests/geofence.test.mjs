import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import vm from "node:vm";
const exports = {};
vm.runInNewContext(
  ts.transpileModule(readFileSync(new URL("../src/lib/geofence.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
  { exports, Math, Number, Promise, setTimeout, clearTimeout },
);
const { haversineMeters, verifyGeofence, validCoordinates, capturePunchLocation } = exports;
test("Haversine handles zero, known one-degree distance and antimeridian", () => {
  assert.equal(haversineMeters(0, 0, 0, 0), 0);
  assert.ok(Math.abs(haversineMeters(0, 0, 0, 1) - 111194.927) < 1);
  assert.ok(haversineMeters(0, 179.999, 0, -179.999) < 223);
});
test("boundary, missing permission, missing restaurant, accuracy and zero coordinates", () => {
  const r = { latitude: 0, longitude: 0, geofence_radius_meters: 100 },
    l = { latitude: 0, longitude: 0, accuracy: 10, reason: null };
  assert.equal(verifyGeofence(l, r).status, "on_premise");
  assert.equal(verifyGeofence({ ...l, longitude: 1 }, r).status, "off_premise");
  assert.equal(verifyGeofence({ ...l, accuracy: 200 }, r).status, "unverified");
  assert.equal(
    verifyGeofence({ ...l, latitude: null, longitude: null, reason: "permission_denied" }, r)
      .status,
    "unverified",
  );
  assert.equal(verifyGeofence(l, {}).status, "not_configured");
  assert.equal(verifyGeofence(l, { ...r, geofence_radius_meters: 0 }).status, "unverified");
});
test("reject invalid, infinite and NaN coordinates", () => {
  for (const v of [NaN, Infinity, 91]) assert.equal(validCoordinates(v, 0), false);
  assert.throws(() => haversineMeters(0, 181, 0, 0));
});
test("non-browser location gracefully returns unverified input", async () => {
  assert.equal((await capturePunchLocation()).reason, "unavailable");
});
test("GPS permission denial returns blocked location input", async () => {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(readFileSync(new URL("../src/lib/geofence.ts", import.meta.url), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    {
      exports,
      Math,
      Number,
      Promise,
      setTimeout,
      clearTimeout,
      navigator: { geolocation: { getCurrentPosition: (_ok, fail) => fail({ code: 1 }) } },
    },
  );
  const location = await exports.capturePunchLocation();
  assert.equal(location.reason, "permission_denied");
  assert.equal(location.latitude, null);
});

test("invalid accuracy cannot enable attendance, and exact radius is inclusive", () => {
  const l = { latitude: 0, longitude: 0, accuracy: 0, reason: null },
    r = { latitude: 0, longitude: 0, geofence_radius_meters: 100 };
  for (const accuracy of [NaN, Infinity, -1, null])
    assert.equal(verifyGeofence({ ...l, accuracy }, r).status, "unverified");
  assert.equal(verifyGeofence({ ...l, latitude: NaN }, r).status, "unverified");
  const longitude = 0.0008,
    d = haversineMeters(0, longitude, 0, 0);
  assert.equal(
    verifyGeofence({ ...l, longitude }, { ...r, geofence_radius_meters: d }).status,
    "on_premise",
  );
  assert.equal(
    verifyGeofence({ ...l, longitude }, { ...r, geofence_radius_meters: d - 0.01 }).status,
    "off_premise",
  );
});
test("attendance location fixes expire and future timestamps are rejected", () => {
  const { freshAttendanceFix } = exports,
    now = 100000;
  assert.equal(freshAttendanceFix(now, now), true);
  assert.equal(freshAttendanceFix(now - 30000, now), true);
  for (const timestamp of [now - 30001, now + 1, NaN, Infinity])
    assert.equal(freshAttendanceFix(timestamp, now), false);
});
