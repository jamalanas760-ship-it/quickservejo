import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import vm from "node:vm";

function createHarness({ alreadyLaunched = false, bootState, primary = false, reduced = false, explicitMotion = false } = {}) {
  let effect;
  let observer;
  let playCalls = 0;
  let pauseCalls = 0;
  let settled = 0;
  const attributes = new Map();
  const classNames = new Set();
  const player = {
    ended: false,
    readyState: 1,
    duration: 3.333,
    currentTime: 0,
    pause() {
      pauseCalls++;
    },
    play() {
      playCalls++;
      return Promise.resolve();
    },
    load() {},
    addEventListener() {},
    removeEventListener() {},
    removeAttribute(name) {
      attributes.delete(name);
    },
    getAttribute(name) {
      return attributes.get(name) ?? null;
    },
    set src(value) {
      attributes.set("src", value);
    },
  };
  const launch = {
    style: { setProperty() {}, removeProperty() {} },
    classList: { add: (name) => classNames.add(name), remove: (name) => classNames.delete(name) },
    querySelector: () => null,
  };
  const stage = { closest: (selector) => (selector === "#qs-boot" ? null : launch) };
  const refs = [stage, player];
  const reducedMotion = { matches: reduced, addEventListener() {}, removeEventListener() {} };
  const document = {
    hidden: false,
    documentElement: { dataset: explicitMotion ? { qsLaunchMotion: "full" } : {} },
    addEventListener() {},
    removeEventListener() {},
  };
  const exports = {};
  const source = readFileSync(
    new URL("../src/components/app/LaunchScene.tsx", import.meta.url),
    "utf8",
  );
  const javascript = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  vm.runInNewContext(javascript, {
    exports,
    document,
    navigator: {},
    window: { __qsLaunchBoot: bootState },
    performance: { now: () => 0 },
    matchMedia: () => reducedMotion,
    MutationObserver: class {
      constructor(fn) {
        observer = fn;
      }
      observe() {}
      disconnect() {}
    },
    require(name) {
      if (name === "react")
        return {
          useRef: () => ({ current: refs.shift() }),
          useId: () => ":test:",
          useEffect: (fn) => {
            effect = fn;
          },
        };
      if (name === "react/jsx-runtime") return { jsx: () => null, jsxs: () => null };
      if (name === "@/lib/launch-session")
        return { hasLaunchedThisDocument: () => alreadyLaunched };
      if (name === "gsap") return { gsap: { registerPlugin() {} } };
      if (name === "gsap/SplitText") return { SplitText: {} };
      throw Error(`Unexpected module: ${name}`);
    },
  });
  exports.LaunchScene({ onSettled: () => settled++, primary });
  const dispose = effect();
  return {
    player,
    document,
    classNames,
    notify: () => observer(),
    dispose,
    get playCalls() {
      return playCalls;
    },
    get pauseCalls() {
      return pauseCalls;
    },
    get settled() {
      return settled;
    },
  };
}

test("navigation updates that keep motion enabled do not interrupt or restart the launch", () => {
  const h = createHarness();
  const initialPauses = h.pauseCalls;
  assert.equal(h.playCalls, 1);
  assert.ok(h.player.getAttribute("src"));
  for (const value of ["full", "full", undefined]) {
    if (value) h.document.documentElement.dataset.qsNavigationMotion = value;
    else delete h.document.documentElement.dataset.qsNavigationMotion;
    h.notify();
  }
  assert.equal(h.playCalls, 1);
  assert.equal(h.pauseCalls, initialPauses);
  assert.ok(h.player.getAttribute("src"));
  assert.ok(h.classNames.has("qs-motion-active"));
  assert.equal(h.settled, 0);
  h.dispose();
});

test("switching to reduced motion stops playback without replaying it later", () => {
  const h = createHarness();
  h.document.documentElement.dataset.qsNavigationMotion = "reduced";
  h.notify();
  assert.equal(h.player.getAttribute("src"), null);
  assert.equal(h.classNames.has("qs-motion-active"), false);
  assert.equal(h.settled, 1);
  h.document.documentElement.dataset.qsNavigationMotion = "full";
  h.notify();
  assert.equal(h.playCalls, 1);
  h.dispose();
});

test("explicit loader opt-in keeps video playing under system and workspace reduced motion", () => {
  const h = createHarness({ reduced: true, explicitMotion: true });
  assert.equal(h.playCalls, 1);
  h.document.documentElement.dataset.qsNavigationMotion = "reduced";
  h.notify();
  assert.equal(h.playCalls, 1);
  assert.ok(h.classNames.has("qs-motion-active"));
  assert.ok(h.player.getAttribute("src"));
  h.dispose();
});

test("system reduced motion remains respected without an explicit loader choice", () => {
  const h = createHarness({ reduced: true });
  assert.equal(h.playCalls, 0);
  assert.equal(h.player.getAttribute("src"), null);
  h.dispose();
});

// A later route is a new loading event: it should animate once even if the
// document's initial entry animation has already completed.
test("later route loading animates even after the initial launch has completed", () => {
  const h = createHarness({ alreadyLaunched: true });
  assert.equal(h.playCalls, 1);
  assert.ok(h.player.getAttribute("src"));
  assert.ok(h.classNames.has("qs-motion-active"));
  h.dispose();
});

test("primary overlay resumes the boot video playhead and releases its temporary source", async () => {
  let stopped = 0;
  let released = 0;
  const bootState = {
    startedAt: -1000,
    currentTime: 1.25,
    ended: false,
    source: "blob:boot-video",
    sourceReady: Promise.resolve("blob:boot-video"),
    stop() {
      stopped++;
    },
    release() {
      released++;
    },
  };
  const h = createHarness({ bootState, primary: true });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(stopped, 1);
  assert.equal(h.player.getAttribute("src"), "blob:boot-video");
  assert.equal(h.player.currentTime, 1.25);
  assert.equal(h.playCalls, 1);
  h.dispose();
  assert.equal(released, 1);
});

test("hydrated entry does not wait for an unfinished boot download before playing", () => {
  const bootState = {
    startedAt: 0,
    currentTime: 0,
    ended: false,
    source: null,
    sourceReady: new Promise(() => {}),
    stop() {},
    release() {},
  };
  const h = createHarness({ bootState, primary: true });
  assert.equal(h.player.getAttribute("src"), "/loading/service-motion/service.mp4");
  assert.equal(h.playCalls, 1);
  assert.ok(h.classNames.has("qs-motion-active"));
  h.dispose();
});
