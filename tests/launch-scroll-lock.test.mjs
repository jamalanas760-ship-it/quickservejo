import test from "node:test";
import assert from "node:assert/strict";
import { acquireLaunchScrollLock } from "../src/lib/launch-scroll-lock.ts";

function createDocument() {
  const doc = new EventTarget();
  const attrs = new Set();
  doc.documentElement = {
    style: { overflow: "scroll" },
    setAttribute(name) {
      attrs.add(name);
    },
    removeAttribute(name) {
      attrs.delete(name);
    },
    hasAttribute(name) {
      return attrs.has(name);
    },
  };
  return doc;
}

test("multiple launch screens lock input until the last screen releases", () => {
  const doc = createDocument();
  const first = acquireLaunchScrollLock(doc);
  const second = acquireLaunchScrollLock(doc);
  assert.equal(doc.documentElement.hasAttribute("data-qs-launch-lock"), true);
  const wheel = new Event("wheel", { cancelable: true });
  doc.dispatchEvent(wheel);
  assert.equal(wheel.defaultPrevented, true);
  const key = new Event("keydown", { cancelable: true });
  Object.defineProperty(key, "key", { value: "PageDown" });
  doc.dispatchEvent(key);
  assert.equal(key.defaultPrevented, true);
  first();
  first();
  assert.equal(doc.documentElement.hasAttribute("data-qs-launch-lock"), true);
  second();
  assert.equal(doc.documentElement.hasAttribute("data-qs-launch-lock"), false);
  assert.equal(doc.documentElement.style.overflow, "scroll");
  const after = new Event("wheel", { cancelable: true });
  doc.dispatchEvent(after);
  assert.equal(after.defaultPrevented, false);
});
