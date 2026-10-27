import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { LAUNCH_BOOT_SCRIPT } from "../src/lib/launch-boot.ts";

function bootHarness({ reduced = false, saveData = false, fetchImpl } = {}) {
  const classes = new Set();
  const attrs = new Map();
  const player = {
    currentTime: 0,
    ended: false,
    playCalls: 0,
    pauseCalls: 0,
    set src(value) {
      attrs.set("src", value);
    },
    getAttribute(name) {
      return attrs.get(name) ?? null;
    },
    removeAttribute(name) {
      attrs.delete(name);
    },
    load() {},
    play() {
      this.playCalls++;
      return Promise.resolve();
    },
    pause() {
      this.pauseCalls++;
    },
  };
  const view = {
    classList: {
      add(name) {
        classes.add(name);
      },
    },
  };
  const root = {
    querySelector(selector) {
      return selector === "video" ? player : view;
    },
  };
  const document = {
    hidden: false,
    documentElement: { dataset: {} },
    getElementById() {
      return root;
    },
    addEventListener() {},
    removeEventListener() {},
  };
  const window = { matchMedia: () => ({ matches: reduced }) };
  let requests = 0,
    revoked = 0,
    created = 0;
  const urlApi = {
    createObjectURL() {
      created++;
      return "blob:boot-video";
    },
    revokeObjectURL() {
      revoked++;
    },
  };
  vm.runInNewContext(LAUNCH_BOOT_SCRIPT, {
    window,
    document,
    navigator: { connection: { saveData } },
    performance: { now: () => 100 },
    AbortController,
    URL: urlApi,
    setTimeout: () => 1,
    clearTimeout() {},
    fetch: (...args) => {
      requests++;
      return fetchImpl ? fetchImpl(...args) : Promise.resolve({ ok: true, blob: async () => ({}) });
    },
  });
  return {
    window,
    player,
    classes,
    get requests() {
      return requests;
    },
    get revoked() {
      return revoked;
    },
    get created() {
      return created;
    },
  };
}

test("boot starts the local video and retains its playhead for handoff", async () => {
  const h = bootHarness();
  const state = h.window.__qsLaunchBoot;
  assert.ok(state);
  assert.equal(await state.sourceReady, "blob:boot-video");
  assert.equal(h.requests, 1);
  assert.equal(h.player.playCalls, 1);
  assert.equal(h.player.getAttribute("src"), "blob:boot-video");
  assert.ok(h.classes.has("qs-motion-active"));
  h.player.currentTime = 1.25;
  state.stop();
  state.stop();
  assert.equal(state.currentTime, 1.25);
  assert.equal(h.player.getAttribute("src"), null);
  state.release();
  state.release();
  assert.equal(h.revoked, 1);
});

test("reduced motion and Save Data keep the boot poster static", () => {
  for (const options of [{ reduced: true }, { saveData: true }]) {
    const h = bootHarness(options);
    assert.equal(h.window.__qsLaunchBoot, undefined);
    assert.equal(h.requests, 0);
    assert.equal(h.player.playCalls, 0);
  }
});

test("releasing before the fetch completes does not create a leaked URL", async () => {
  let finish;
  const h = bootHarness({
    fetchImpl: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  const state = h.window.__qsLaunchBoot;
  state.release();
  finish({ ok: true, blob: async () => ({}) });
  assert.equal(await state.sourceReady, null);
  assert.equal(h.created, 0);
});
