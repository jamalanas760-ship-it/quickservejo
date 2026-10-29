import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { DEFAULT_PASSWORD_POLICY, passwordPolicyErrors } from "../src/lib/password-policy.ts";
const source = ts.transpileModule(
  readFileSync(
    new URL("../supabase/functions/quickserve-password/index.ts", import.meta.url),
    "utf8",
  ),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
function setup({ policies = [], invalidCurrent = false } = {}) {
  let handler,
    forwarded = [],
    revoked = [],
    checks = 0;
  const module = { exports: {} };
  const client = {
    auth: {
      getUser: async () => ({
        data: { user: { id: "u", email: "person@example.com" } },
        error: null,
      }),
      signInWithPassword: async () => {
        checks++;
        return invalidCurrent
          ? { data: {}, error: Error("bad") }
          : {
              data: { user: { id: "u" }, session: { access_token: "verification-session" } },
              error: null,
            };
      },
      signOut: async (args) => {
        revoked.push(args);
        return { error: null };
      },
    },
    from(table) {
      const b = {
        select() {
          return b;
        },
        eq() {
          return b;
        },
        in() {
          return b;
        },
        then(resolve) {
          return Promise.resolve({
            data: table === "staff" ? [{ restaurant_id: "r" }] : policies,
            error: null,
          }).then(resolve);
        },
      };
      return b;
    },
  };
  vm.runInNewContext(source, {
    module,
    exports: module.exports,
    require: (id) =>
      id.startsWith("npm:")
        ? { createClient: () => client }
        : { DEFAULT_PASSWORD_POLICY, passwordPolicyErrors },
    Deno: {
      env: { get: (key) => (key === "SUPABASE_URL" ? "https://example.com" : "public-key") },
      serve: (fn) => (handler = fn),
    },
    Response,
    Request,
    TextEncoder,
    Set,
    fetch: async (url, options) => {
      forwarded.push({ url, options });
      return new Response("{}", { status: 200 });
    },
  });
  return {
    run: (body) =>
      handler(
        new Request("https://example.com", {
          method: "POST",
          headers: { Authorization: "Bearer original-mfa-session" },
          body: JSON.stringify(body),
        }),
      ),
    handler: () => handler,
    forwarded,
    revoked,
    checks: () => checks,
  };
}
test("password gateway verifies current password and preserves the original session", async () => {
  const h = setup();
  const response = await h.run({ password: "River!Quartz57", currentPassword: "old" });
  assert.equal(response.status, 200);
  assert.equal(h.forwarded.length, 1);
  assert.equal(h.forwarded[0].options.headers.Authorization, "Bearer original-mfa-session");
  assert.equal(h.revoked[0].scope, "local");
  assert.equal(JSON.parse(h.forwarded[0].options.body).password, "River!Quartz57");
});
test("unauthenticated, weak and incorrect-current-password requests never update the account", async () => {
  const h = setup();
  assert.equal(
    (await h.handler()(new Request("https://example.com", { method: "POST", body: "{}" }))).status,
    401,
  );
  assert.equal((await h.run({ password: "1234", currentPassword: "old" })).status, 400);
  assert.equal(h.checks(), 0);
  assert.equal(h.forwarded.length, 0);
  const bad = setup({ invalidCurrent: true });
  assert.equal(
    (await bad.run({ password: "River!Quartz57", currentPassword: "wrong" })).status,
    400,
  );
  assert.equal(bad.forwarded.length, 0);
});
test("gateway enforces the strictest applicable workspace rules", async () => {
  const h = setup({ policies: [{ ...DEFAULT_PASSWORD_POLICY, min_length: 20 }] });
  assert.equal((await h.run({ password: "River!Quartz57", currentPassword: "old" })).status, 400);
  assert.equal(h.forwarded.length, 0);
});
