import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import vm from "node:vm";
const exports = {};
let clockOffset = 0;
class LocationDate extends Date {
  static now() {
    return Date.now() + clockOffset;
  }
}
vm.runInNewContext(
  ts.transpileModule(
    readFileSync(new URL("../src/lib/attendance-location.ts", import.meta.url), "utf8"),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    },
  ).outputText,
  { exports, Date: LocationDate },
);
const { createAttendanceLocationSession } = exports;
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
function harness(initial = "prompt", queryOverride) {
  const permission = new EventTarget();
  permission.state = initial;
  const win = new EventTarget();
  const doc = new EventTarget();
  win.isSecureContext = true;
  doc.visibilityState = "visible";
  const timers = new Set();
  win.setInterval = (callback) => {
    timers.add(callback);
    return callback;
  };
  win.clearInterval = (id) => timers.delete(id);
  const watches = new Map();
  const past = [];
  let next = 0;
  let queries = 0;
  const browser = {
    window: win,
    document: doc,
    navigator: {
      permissions: {
        query: async () => {
          queries++;
          return queryOverride ? await queryOverride() : permission;
        },
      },
      geolocation: {
        watchPosition(ok, fail, options) {
          const id = ++next;
          const callbacks = { ok, fail, options };
          watches.set(id, callbacks);
          past.push(callbacks);
          return id;
        },
        clearWatch(id) {
          watches.delete(id);
        },
      },
    },
  };
  const states = [];
  return {
    browser,
    permission,
    win,
    doc,
    watches,
    past,
    states,
    timers,
    begin: () => createAttendanceLocationSession((state) => states.push(state), browser),
    state: () => states.at(-1),
    queries: () => queries,
    tick: async () => {
      for (const callback of timers) callback();
      await flush();
    },
    change: async (value) => {
      permission.state = value;
      permission.dispatchEvent(new Event("change"));
      await flush();
    },
    focus: async () => {
      win.dispatchEvent(new Event("focus"));
      await flush();
    },
    visible: async (value) => {
      doc.visibilityState = value;
      doc.dispatchEvent(new Event("visibilitychange"));
      await flush();
    },
    success: () =>
      past
        .at(-1)
        .ok({ timestamp: Date.now(), coords: { latitude: 31.95, longitude: 35.91, accuracy: 8 } }),
  };
}

test("opening Workforce starts GPS without Enable location and does not duplicate a pending prompt", async () => {
  const h = harness();
  const session = h.begin();
  await flush();
  assert.equal(h.state().phase, "locating");
  await h.focus();
  await h.tick();
  assert.equal(h.past.length, 1, "only one automatic attempt per foreground visit");
  assert.equal(h.state().phase, "locating");
  assert.equal(h.past[0].options.maximumAge, 0);
  h.success();
  assert.equal(h.state().phase, "tracking");
  session.dispose();
});

test("previously granted permission checks location automatically and renews a stationary fix", async () => {
  const h = harness("granted");
  const session = h.begin();
  await flush();
  assert.equal(h.watches.size, 1);
  h.success();
  const fix = h.state().fix;
  await h.tick();
  assert.equal(h.past.length, 1, "fresh live watch is reused rather than restarted");
  assert.equal(h.watches.size, 1);
  assert.equal(h.state().fix, fix, "renewal retains the fix for the geofence freshness check");
  session.dispose();
});

test("denied permission cannot trigger repeated browser requests and recovers after settings change", async () => {
  const h = harness("denied");
  const session = h.begin();
  await flush();
  assert.equal(h.state().phase, "permission_denied");
  session.request();
  await flush();
  await h.focus();
  await h.tick();
  assert.equal(h.past.length, 0);
  // Simulate a browser that updates query results without firing change.
  h.permission.state = "granted";
  session.request();
  await flush();
  assert.equal(h.watches.size, 1);
  session.dispose();
});

test("revoking or expiring permission immediately clears the fix and stops tracking", async () => {
  const h = harness("granted");
  const session = h.begin();
  await flush();
  h.success();
  const old = h.past[0];
  await h.change("prompt");
  assert.equal(h.state().phase, "needs_permission");
  assert.equal(h.state().fix, null);
  assert.equal(h.watches.size, 0);
  old.ok({ timestamp: Date.now(), coords: { latitude: 0, longitude: 0, accuracy: 1 } });
  assert.equal(h.state().fix, null, "queued callbacks cannot restore revoked fixes");
  await h.tick();
  await h.focus();
  assert.equal(h.past.length, 1);
  await h.change("granted");
  assert.equal(h.watches.size, 1);
  session.dispose();
});

test("hidden Workforce stops GPS and discards callbacks; returning checks current permission", async () => {
  const h = harness("granted");
  const session = h.begin();
  await flush();
  h.success();
  const old = h.past[0];
  await h.visible("hidden");
  assert.equal(h.watches.size, 0);
  assert.equal(h.state().fix, null);
  const count = h.queries();
  await h.tick();
  await h.focus();
  assert.equal(h.queries(), count);
  old.ok({ timestamp: Date.now(), coords: { latitude: 0, longitude: 0, accuracy: 1 } });
  assert.equal(h.state().fix, null);
  h.permission.state = "granted";
  await h.visible("visible");
  assert.equal(h.past.length, 2);
  assert.equal(h.state().phase, "locating");
  session.dispose();
});

test("unsupported Permissions API automatically starts on entry and return without an Enable step", async () => {
  const h = harness("prompt", () => {
    throw new Error("Unsupported permission query");
  });
  const session = h.begin();
  await flush();
  assert.equal(h.state().phase, "locating");
  await h.focus();
  await h.tick();
  assert.equal(h.past.length, 1);
  h.success();
  await h.tick();
  assert.equal(h.past.length, 1);
  await h.visible("hidden");
  await h.visible("visible");
  assert.equal(h.state().phase, "locating");
  assert.equal(h.past.length, 2);
  assert.equal(h.watches.size, 1);
  session.dispose();
});

test("permission denial during a request clears location and is never automatically retried", async () => {
  const h = harness();
  const session = h.begin();
  await flush();
  h.past[0].fail({ code: 1 });
  assert.equal(h.state().phase, "permission_denied");
  assert.equal(h.state().fix, null);
  assert.equal(h.watches.size, 0);
  await h.tick();
  await h.focus();
  await h.visible("hidden");
  await h.visible("visible");
  assert.equal(h.past.length, 1);
  session.dispose();
});

test("timeouts and unavailable GPS clear location with distinct recovery states", async () => {
  for (const [code, phase] of [
    [2, "unavailable"],
    [3, "timeout"],
  ]) {
    const h = harness("granted");
    const session = h.begin();
    await flush();
    h.success();
    h.past[0].fail({ code });
    assert.equal(h.state().phase, phase);
    assert.equal(h.state().fix, null);
    session.request();
    assert.equal(h.watches.size, 1);
    session.dispose();
  }
});

test("HTTP or unsupported geolocation never requests location", async () => {
  for (const insecure of [true, false]) {
    const h = harness("granted");
    if (insecure) h.win.isSecureContext = false;
    else h.browser.navigator.geolocation = undefined;
    const session = h.begin();
    await flush();
    session.request();
    assert.equal(h.state().phase, insecure ? "insecure" : "unavailable");
    assert.equal(h.past.length, 0);
    session.dispose();
  }
});

test("unmount disposes listeners and timers and ignores pending permission results", async () => {
  let resolve;
  const h = harness(
    "granted",
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const session = h.begin();
  session.dispose();
  resolve(h.permission);
  await flush();
  await h.focus();
  await h.change("granted");
  await h.tick();
  session.request();
  assert.equal(h.past.length, 0);
  assert.equal(h.states.length, 0);
  assert.equal(h.timers.size, 0);
});

test("a delayed initial permission query cannot override an explicit request", async () => {
  let resolve;
  const h = harness(
    "prompt",
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const session = h.begin();
  session.request();
  h.success();
  resolve(h.permission);
  await flush();
  assert.equal(h.state().phase, "tracking");
  assert.equal(h.watches.size, 1);
  session.dispose();
});

test("a dismissed automatic request is not repeated by timers or focus", async () => {
  const h = harness();
  const session = h.begin();
  await flush();
  h.past[0].fail({ code: 3 });
  await h.tick();
  await h.focus();
  assert.equal(h.past.length, 1);
  assert.equal(h.state().fix, null);
  await h.visible("hidden");
  await h.visible("visible");
  assert.equal(h.past.length, 1, "returning must not reopen a dismissed browser prompt");
  session.dispose();
});

test("allowing the browser prompt resumes automatically without an app click", async () => {
  const h = harness();
  const session = h.begin();
  await flush();
  await h.change("granted");
  h.success();
  assert.equal(h.state().phase, "tracking");
  await h.tick();
  assert.equal(h.state().phase, "tracking");
  assert.equal(h.watches.size, 1);
  session.dispose();
});

test("remembered prompt attempts suppress automatic prompts after app re-entry but never imply a grant", async () => {
  const h = harness();
  const storage = new Map();
  h.win.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  };
  const first = h.begin();
  await flush();
  assert.equal(h.past.length, 1);
  first.dispose();
  const second = h.begin();
  await flush();
  assert.equal(h.past.length, 1);
  assert.equal(h.state().phase, "needs_permission");
  assert.equal(h.state().fix, null);
  await h.change("granted");
  assert.equal(h.watches.size, 1);
  h.success();
  assert.equal(h.state().phase, "tracking");
  second.dispose();
});

test("stationary fixes renew after the freshness interval without a permission prompt", async () => {
  const h = harness("granted");
  const session = h.begin();
  await flush();
  h.past.at(-1).ok({
    timestamp: Date.now() - 21000,
    coords: { latitude: 31.95, longitude: 35.91, accuracy: 8 },
  });
  await h.tick();
  assert.equal(h.past.length, 2);
  assert.equal(h.watches.size, 1);
  assert.equal(h.state().phase, "locating");
  session.dispose();
});

test("denied permission recovers on polling without a button or change event", async () => {
  const h = harness("denied");
  const session = h.begin();
  await flush();
  h.permission.state = "granted";
  await h.tick();
  assert.equal(h.watches.size, 1);
  session.dispose();
});

test("transient GPS failures automatically retry on the next foreground check", async () => {
  for (const code of [2, 3]) {
    for (const fallback of [false, true]) {
      const h = harness(
        "granted",
        fallback
          ? () => {
              throw new Error("No Permissions API");
            }
          : undefined,
      );
      const session = h.begin();
      await flush();
      h.success();
      h.past[0].fail({ code });
      assert.equal(h.state().fix, null);
      await h.tick();
      assert.equal(h.past.length, 2);
      assert.equal(h.state().phase, "locating");
      h.success();
      assert.equal(h.state().phase, "tracking");
      session.dispose();
    }
  }
});

test("silent providers recover automatically but unresolved permission prompts are not restarted", async () => {
  try {
    for (const initial of ["granted", "prompt"]) {
      const h = harness(initial);
      const session = h.begin();
      await flush();
      clockOffset = 25000;
      await h.tick();
      assert.equal(h.past.length, initial === "granted" ? 2 : 1);
      assert.equal(h.state().phase, "locating");
      session.dispose();
      clockOffset = 0;
    }
  } finally {
    clockOffset = 0;
  }
});

test("fallback browsers renew stale successful fixes without a click", async () => {
  const h = harness("prompt", () => {
    throw new Error("No Permissions API");
  });
  const session = h.begin();
  await flush();
  h.past[0].ok({
    timestamp: Date.now() - 21000,
    coords: { latitude: 31.95, longitude: 35.91, accuracy: 8 },
  });
  await h.tick();
  assert.equal(h.past.length, 2);
  assert.equal(h.watches.size, 1);
  session.dispose();
});
