import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import ts from "typescript";
const source = readFileSync(
  new URL("../src/lib/public-order-realtime.ts", import.meta.url),
  "utf8",
);
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { publicOrderRealtimeTopic, watchPublicOrder } = await import(
  `data:text/javascript,${encodeURIComponent(js)}`
);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
test("topics match database SHA-256 derivation without exposing receipt tokens", async () => {
  const token = "aabbccddeeff001122334455";
  const value = await publicOrderRealtimeTopic(" " + token + " ");
  assert.equal(
    value,
    "order-status:" +
      createHash("sha256")
        .update("quickserve:order:" + token)
        .digest("hex"),
  );
  assert.ok(!value.includes(token));
  assert.notEqual(value, await publicOrderRealtimeTopic("11223344556677889900aabb"));
  await assert.rejects(publicOrderRealtimeTopic(""));
});
test("broadcast and reconnect refresh immediately, bursts coalesce, and cleanup detaches", async () => {
  let broadcast,
    status,
    removed = 0,
    refreshes = 0;
  const states = [];
  const channel = {
    on(type, filter, cb) {
      assert.equal(type, "broadcast");
      assert.equal(filter.event, "order_changed");
      broadcast = cb;
      return this;
    },
    subscribe(cb) {
      status = cb;
      return this;
    },
  };
  const client = {
    channel(name, options) {
      assert.ok(name.startsWith("order-status:"));
      assert.equal(options.config.private, false);
      return channel;
    },
    async removeChannel(c) {
      assert.equal(c, channel);
      removed++;
    },
  };
  const stop = watchPublicOrder(
    client,
    "aabbccddeeff001122334455",
    () => refreshes++,
    (live) => states.push(live),
  );
  await delay(20);
  status("SUBSCRIBED");
  await delay(85);
  assert.equal(refreshes, 1);
  assert.equal(states.at(-1), true);
  broadcast({ payload: { status: "spoofed" } });
  broadcast();
  broadcast();
  await delay(85);
  assert.equal(refreshes, 2);
  status("CHANNEL_ERROR");
  assert.equal(states.at(-1), false);
  status("SUBSCRIBED");
  await delay(85);
  assert.equal(refreshes, 3);
  broadcast();
  stop();
  await delay(85);
  assert.equal(removed, 1);
  assert.equal(refreshes, 3);
  status("CLOSED");
  assert.equal(states.at(-1), true);
});
test("disposing before asynchronous topic resolution does not open a channel", async () => {
  let opened = 0;
  const stop = watchPublicOrder(
    {
      channel() {
        opened++;
        throw Error("must not open");
      },
      async removeChannel() {},
    },
    "aabbccddeeff001122334455",
    () => {},
    () => {},
  );
  stop();
  await delay(20);
  assert.equal(opened, 0);
});
