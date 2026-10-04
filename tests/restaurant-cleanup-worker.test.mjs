import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const source = fs
  .readFileSync(
    new URL("../supabase/functions/quickserve-restaurant-cleanup/index.ts", import.meta.url),
    "utf8",
  )
  .replace(/^import .*?;\n/, "");
const code = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
async function run({ authorized = true, failed = false, neverEmpty = false } = {}) {
  let handler,
    reads = 0;
  const calls = [];
  const admin = {
    rpc: async (name, args) => {
      calls.push([name, args]);
      return {
        error: null,
        data:
          name === "restaurant_cleanup_worker_authorized"
            ? authorized
            : name === "claim_restaurant_cleanup"
              ? [{ restaurant_id: "fixture" }]
              : reads++ === 0 || neverEmpty
                ? [
                    { bucket_id: "restaurant-media", name: "fixture/product/photo.png" },
                    { bucket_id: "menu-pdfs", name: "fixture/menu-pdf/menu.pdf" },
                  ]
                : [],
      };
    },
    storage: {
      from: (bucket) => ({
        remove: async (paths) => {
          calls.push(["remove", bucket, paths]);
          return { error: failed ? new Error("Transient storage failure") : null };
        },
      }),
    },
    from: () => ({
      delete: () => ({
        eq: async () => {
          calls.push(["complete"]);
          return { error: null };
        },
      }),
    }),
  };
  vm.runInNewContext(code, {
    createClient: () => admin,
    Deno: {
      env: {
        get: (n) =>
          n === "SUPABASE_SERVICE_ROLE_KEY" ? "test-service-key" : "https://example.test",
      },
      serve: (fn) => (handler = fn),
    },
    Response,
    console: { error() {} },
  });
  const response = await handler(
    new Request("https://example.test", {
      method: "POST",
      headers: { "x-quickserve-worker": "test-private-secret" },
    }),
  );
  return { calls, response };
}
test("cleanup rejects an invalid worker secret before claiming jobs", async () => {
  const { calls, response } = await run({ authorized: false });
  assert.equal(response.status, 401);
  assert.deepEqual(
    calls.map((c) => c[0]),
    ["restaurant_cleanup_worker_authorized"],
  );
});
test("cleanup removes both buckets through Storage API before completing a job", async () => {
  const { calls, response } = await run();
  assert.equal(response.status, 200);
  assert.deepEqual(
    calls.filter((c) => c[0] === "remove"),
    [
      ["remove", "restaurant-media", ["fixture/product/photo.png"]],
      ["remove", "menu-pdfs", ["fixture/menu-pdf/menu.pdf"]],
    ],
  );
  assert.equal(calls.at(-1)[0], "complete");
});
test("storage errors retain the durable job for retry", async () => {
  const { calls } = await run({ failed: true });
  assert.equal(
    calls.some((c) => c[0] === "complete"),
    false,
  );
});
test("large jobs are bounded and stay queued until files are exhausted", async () => {
  const { calls } = await run({ neverEmpty: true });
  assert.equal(calls.filter((c) => c[0] === "restaurant_cleanup_objects").length, 8);
  assert.equal(
    calls.some((c) => c[0] === "complete"),
    false,
  );
});
