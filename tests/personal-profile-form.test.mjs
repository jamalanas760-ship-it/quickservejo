import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../src/routes/_authenticated/profile.tsx", import.meta.url),
  "utf8",
);
function setup({ error = null, ready = true } = {}) {
  let states = [],
    cursor = 0,
    saved = [],
    invalidated = [],
    messages = [];
  const module = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText + "\nexports.Form=PersonalInformation;",
    {
      module,
      exports: module.exports,
      require(id) {
        if (id.endsWith(".css")) return {};
        if (id === "react")
          return {
            useEffect() {},
            useMemo: (factory) => factory(),
            useState(initial) {
              const key = cursor++;
              if (!(key in states)) states[key] = initial;
              return [
                states[key],
                (value) => {
                  states[key] = value;
                },
              ];
            },
          };
        if (id === "@tanstack/react-router") return { createFileRoute: () => (x) => x };
        if (id === "@tanstack/react-query")
          return {
            useQueryClient: () => ({ invalidateQueries: async (arg) => invalidated.push(arg) }),
          };
        if (id === "@/integrations/supabase/client")
          return {
            supabase: {
              auth: {
                updateUser: async (arg) => {
                  saved.push(arg);
                  return { error };
                },
              },
            },
          };
        if (id === "@/lib/i18n") return { useI18n: () => ({ lang: "en" }) };
        if (id === "@/lib/errors") return { humanError: () => "Save failed" };
        if (id === "sonner")
          return { toast: { success: (m) => messages.push(m), error: (m) => messages.push(m) } };
        if (id.startsWith("@/")) return {};
        return require(id);
      },
    },
  );
  return {
    render() {
      cursor = 0;
      return module.exports.Form({
        name: "Test Person",
        email: "test@example.com",
        metadata: {},
        ready,
        ar: false,
      });
    },
    saved,
    invalidated,
    messages,
  };
}
function nodes(node) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  return [node, ...nodes(node.props?.children)];
}
test("profile saves only personal metadata and refreshes session after success", async () => {
  const h = setup();
  let tree = h.render();
  let input = nodes(tree).find((n) => n.type === "input" && n.props.autoComplete === "given-name");
  input.props.onChange({ target: { value: "New" } });
  tree = h.render();
  await nodes(tree)
    .find((n) => n.type === "form")
    .props.onSubmit({ preventDefault() {} });
  assert.deepEqual(JSON.parse(JSON.stringify(h.saved)), [
    {
      data: { first_name: "New", last_name: "Person", full_name: "New Person", contact_phone: "" },
    },
  ]);
  assert.equal(h.invalidated.length, 1);
  assert.deepEqual(h.messages, ["Profile updated"]);
  assert.equal(
    nodes(tree).find((n) => n.type === "input" && n.props.type === "email").props.readOnly,
    true,
  );
});
test("cancel restores values and failed save keeps the draft available for retry", async () => {
  const h = setup({ error: new Error("offline") });
  let tree = h.render();
  nodes(tree)
    .find((n) => n.type === "input" && n.props.type === "tel")
    .props.onChange({ target: { value: "+962790000000" } });
  tree = h.render();
  await nodes(tree)
    .find((n) => n.type === "form")
    .props.onSubmit({ preventDefault() {} });
  assert.deepEqual(h.messages, ["Save failed"]);
  assert.equal(h.invalidated.length, 0);
  tree = h.render();
  assert.equal(
    nodes(tree).find((n) => n.type === "input" && n.props.type === "tel").props.value,
    "+962790000000",
  );
  nodes(tree)
    .find((n) => n.type === "button" && n.props.type === "button")
    .props.onClick();
  tree = h.render();
  assert.equal(
    nodes(tree).find((n) => n.type === "input" && n.props.type === "tel").props.value,
    "",
  );
});
test("unavailable session blocks profile writes", async () => {
  const h = setup({ ready: false }),
    tree = h.render();
  await nodes(tree)
    .find((n) => n.type === "form")
    .props.onSubmit({ preventDefault() {} });
  assert.equal(h.saved.length, 0);
  assert.equal(nodes(tree).find((n) => n.type === "fieldset").props.disabled, true);
});
