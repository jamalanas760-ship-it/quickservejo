import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
function worker() {
  const handlers = {},
    shown = [],
    opened = [];
  const self = {
    location: { origin: "https://quickserve.example" },
    addEventListener: (name, cb) => (handlers[name] = cb),
    registration: { showNotification: async (title, options) => shown.push({ title, options }) },
    clients: { matchAll: async () => [], openWindow: async (url) => opened.push(url) },
  };
  vm.runInNewContext(readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"), {
    self,
    URL,
    Response,
    Promise,
  });
  return { handlers, shown, opened };
}
test("background push displays payload and rejects external navigation", async () => {
  const w = worker();
  let pending;
  w.handlers.push({
    data: {
      json: () => ({
        title: "New order",
        body: "Ready for your team",
        url: "https://attacker.example",
      }),
    },
    waitUntil: (p) => (pending = p),
  });
  await pending;
  assert.equal(w.shown[0].title, "New order");
  assert.equal(w.shown[0].options.data.url, "https://quickserve.example/notifications");
  w.handlers.notificationclick({
    notification: { close() {}, data: { url: "/notifications" } },
    waitUntil: (p) => (pending = p),
  });
  await pending;
  assert.equal(w.opened[0], "https://quickserve.example/notifications");
});
test("malformed push still displays a useful notification", async () => {
  const w = worker();
  let pending;
  w.handlers.push({
    data: {
      json() {
        throw new Error("invalid");
      },
    },
    waitUntil: (p) => (pending = p),
  });
  await pending;
  assert.equal(w.shown[0].title, "QuickServe update");
});
