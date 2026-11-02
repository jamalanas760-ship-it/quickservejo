import test from "node:test";
import assert from "node:assert/strict";
import { validateConfig, PRODUCTION_PROJECT } from "./load-config.mjs";
const uuid = (n) => `${String(n).padStart(8, "0")}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`;
function fixture(count = 2, users = 1) {
  return {
    environment: "staging",
    projectRef: "abcdefghijklmnopqrst",
    supabaseUrl: "https://abcdefghijklmnopqrst.supabase.co",
    publishableKey: "sb_publishable_test",
    tenants: Array.from({ length: count }, (_, i) => ({
      restaurantId: uuid(i + 1),
      sentinelOrderId: uuid(i + 5000),
      users: Array.from({ length: users }, (_, j) => ({
        userId: uuid(10000 + i * users + j),
        accessToken: `eyJ.test-${i}-${j}`,
      })),
    })),
  };
}
test("allows only a separate matching staging target", () => {
  assert.ok(validateConfig(fixture(), "smoke"));
  for (const patch of [
    { environment: "production" },
    { projectRef: PRODUCTION_PROJECT },
    { supabaseUrl: "https://example.com" },
    { publishableKey: "sb_secret_forbidden" },
  ]) {
    assert.throws(() => validateConfig({ ...fixture(), ...patch }, "smoke"));
  }
});
test("target requires 20 tenants and separate identities for every virtual user", () => {
  assert.throws(() => validateConfig(fixture(), "target"));
  assert.throws(() => validateConfig(fixture(20, 1), "target"));
  assert.ok(validateConfig(fixture(20, 50), "target"));
});
test("rejects duplicate tenant, user, and credential fixtures", () => {
  for (const field of ["restaurantId", "userId", "accessToken"]) {
    const value = fixture();
    if (field === "restaurantId") value.tenants[1][field] = value.tenants[0][field];
    else value.tenants[1].users[0][field] = value.tenants[0].users[0][field];
    assert.throws(() => validateConfig(value, "smoke"));
  }
});

const { capacityProfile, peakVirtualUsers } = await import("./capacity-profiles.mjs");
test("load, stress and spike provision distinct identities through their peak and include recovery", () => {
  for (const [mode, peak] of [
    ["load", 1000],
    ["stress", 2000],
    ["spike", 1000],
  ]) {
    assert.equal(peakVirtualUsers(mode), peak);
    assert.ok(validateConfig(fixture(20, peak / 20), mode));
    assert.throws(() => validateConfig(fixture(20, peak / 20 - 1), mode));
    const profile = capacityProfile(mode);
    assert.equal(profile.stages.at(-1).target, 0);
    assert.ok(profile.stages.some((stage) => stage.target > 0 && stage.target < peak));
    assert.throws(() =>
      validateConfig({ ...fixture(20, peak / 20), projectRef: PRODUCTION_PROJECT }, mode),
    );
  }
  assert.equal(capacityProfile("spike").stages[1].duration, "1s");
  assert.throws(() => capacityProfile("invalid"));
});
