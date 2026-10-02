import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function fixture({ text = "Orders ready", hasForm = false } = {}) {
  let now = 100000,
    next = 0,
    reloads = 0;
  const timers = new Map(),
    nodes = new Map(),
    events = new Map();
  const main = { innerText: text, querySelector: () => (hasForm ? {} : null) };
  nodes.set("main-content", main);
  const listen = (name, fn) => events.set(name, fn);
  const unlisten = (name) => events.delete(name);
  const root = { dataset: {}, dir: "ltr", classList: { remove() {} } };
  const document = {
    visibilityState: "visible",
    querySelector: () => null,
    documentElement: root,
    getElementById: (id) => nodes.get(id),
    addEventListener: listen,
    removeEventListener: unlisten,
    createElement: () => ({
      style: {},
      setAttribute() {},
      append() {},
      remove() {
        nodes.delete(this.id);
      },
    }),
    body: { append: (node) => nodes.set(node.id, node) },
  };
  const window = {
    addEventListener: listen,
    removeEventListener: unlisten,
    setTimeout: (fn, delay) => {
      const id = ++next;
      timers.set(id, { fn, at: now + delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    location: { reload: () => reloads++ },
  };
  const storage = new Map();
  const code = ts.transpileModule(
    readFileSync(new URL("../src/lib/resume-recovery.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    require: () => ({ applyDocumentTheme() {}, readThemePreference: () => "light" }),
    window,
    document,
    navigator: { onLine: true },
    sessionStorage: {
      getItem: (key) => storage.get(key),
      setItem: (key, v) => storage.set(key, v),
    },
    Date: { now: () => now },
  });
  const stop = exports.installResumeRecovery();
  const advance = (ms) => {
    const end = now + ms;
    for (;;) {
      const due = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      now = due[1].at;
      timers.delete(due[0]);
      due[1].fn();
    }
    now = end;
  };
  return {
    nodes,
    main,
    stop,
    advance,
    reloads: () => reloads,
    visibility: (state) => {
      document.visibilityState = state;
      events.get("visibilitychange")?.();
    },
    show: () => events.get("pageshow")?.({ persisted: true }),
  };
}
test("foreground recovery retains mounted content and never reloads a healthy page", () => {
  const f = fixture();
  f.show();
  f.advance(4000);
  assert.equal(f.reloads(), 0);
  assert.equal(f.main.innerText, "Orders ready");
  assert(!f.nodes.has("qs-resume-recovery"));
  f.stop();
});
test("long background suspension retains content and does not run recovery while hidden", () => {
  const f = fixture();
  f.show();
  f.visibility("hidden");
  f.advance(300000);
  assert.equal(f.reloads(), 0);
  assert(!f.nodes.has("qs-resume-recovery"));
  f.visibility("visible");
  f.advance(4000);
  assert.equal(f.main.innerText, "Orders ready");
  assert.equal(f.reloads(), 0);
  f.stop();
});
test("backgrounding cancels an in-flight blank-page recovery and cleanup stops all retries", () => {
  const f = fixture({ text: "" });
  f.show();
  f.advance(1600);
  assert(f.nodes.has("qs-resume-recovery"));
  f.visibility("hidden");
  assert(!f.nodes.has("qs-resume-recovery"));
  f.advance(300000);
  assert.equal(f.reloads(), 0);
  f.visibility("visible");
  f.stop();
  f.advance(4000);
  assert.equal(f.reloads(), 0);
  assert(!f.nodes.has("qs-resume-recovery"));
});
test("empty pages show recovery then reload once, preventing reload loops", () => {
  const f = fixture({ text: "" });
  f.show();
  f.advance(1600);
  assert(f.nodes.has("qs-resume-recovery"));
  f.advance(1600);
  assert.equal(f.reloads(), 1);
  f.show();
  f.advance(4000);
  assert.equal(f.reloads(), 1);
  f.stop();
});
test("a form is protected and a page that recovers before timeout is not reloaded", () => {
  const form = fixture({ text: "", hasForm: true });
  form.show();
  form.advance(4000);
  assert.equal(form.reloads(), 0);
  form.stop();
  const f = fixture({ text: "" });
  f.show();
  f.advance(1600);
  f.main.innerText = "Workspace restored";
  f.advance(1600);
  assert.equal(f.reloads(), 0);
  assert(!f.nodes.has("qs-resume-recovery"));
  f.stop();
});
