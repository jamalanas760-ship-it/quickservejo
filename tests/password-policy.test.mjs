import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  DEFAULT_PASSWORD_POLICY as defaults,
  passwordPolicyErrors as check,
  policyConfigurationError as config,
} from "../src/lib/password-policy.ts";
test("password rules accept strong passwords and reject each requirement", () => {
  assert.deepEqual(check("River!Quartz57", defaults, "abdallah@example.com"), []);
  assert.ok(check("short", defaults, "x@y.co").some((x) => x.includes("12")));
  for (const [password, label] of [
    ["lowercase!67890", "uppercase"],
    ["UPPERCASE!67890", "lowercase"],
    ["Lowercase!AbCd", "numbers"],
    ["StrongPass5789", "special"],
  ])
    assert.ok(check(password, defaults, "x@y.co").some((x) => x.includes(label)));
});
test("username matching uses the email local part, including normalized variants", () => {
  assert.ok(
    check("Abdallah!5789", defaults, "abdallah@example.com").some((x) => x.includes("username")),
  );
  assert.ok(
    check("Ｍｏｈａｍｍａｄ!58", defaults, "mohammad@example.com").some((x) =>
      x.includes("username"),
    ),
  );
  assert.ok(
    !check("River!Quartz57", { ...defaults, block_username: false }, "river@example.com").some(
      (x) => x.includes("username"),
    ),
  );
});
test("sequences include ascending and descending letters and numbers", () => {
  for (const value of ["Abcd!Quartz57", "Zyxw!Quartz57", "River!1234Qa", "River!4321Qa"])
    assert.ok(check(value, defaults, "x@y.co").some((x) => x.includes("sequences")));
  assert.ok(
    !check("River!1234Qa", { ...defaults, block_sequences: false }, "x@y.co").some((x) =>
      x.includes("sequences"),
    ),
  );
});
test("configuration rejects invalid bounds and password maximum follows byte limits", () => {
  for (const value of [NaN, 7, 65, 12.5]) assert.ok(config({ ...defaults, min_length: value }));
  assert.ok(config({ ...defaults, numbers: -1 }));
  assert.ok(config({ ...defaults, uppercase: 17 }));
  assert.equal(config(defaults), null);
  assert.ok(check("A!3" + "é".repeat(40), defaults, "x@y.co").some((x) => x.includes("too long")));
});
test("browser and server use the same password validation implementation", async () => {
  assert.equal(
    await readFile(new URL("../src/lib/password-policy.ts", import.meta.url), "utf8"),
    await readFile(
      new URL("../supabase/functions/quickserve-password/policy.ts", import.meta.url),
      "utf8",
    ),
  );
});
