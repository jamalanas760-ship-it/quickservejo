import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { createHash } from "node:crypto";
const source = await readFile(new URL("../src/lib/avatar-presets.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext },
}).outputText;
const { AVATAR_PRESETS, avatarPresetUrl, resolveAvatarPresetId, roleAvatarUrl } = await import(
  `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`
);

test("every app role receives an approved portrait and unknown roles stay unset", () => {
  for (const role of [
    "super_admin",
    "restaurant_admin",
    "operations_manager",
    "manager",
    "kitchen",
    "waiter",
    "cashier",
    "host",
    "inventory",
    "procurement",
    "accountant",
    "hr",
    "chef",
    "owner",
  ]) {
    assert.match(roleAvatarUrl(role), /^\/avatars\/.+\.svg$/);
  }
  assert.equal(roleAvatarUrl("unknown"), null);
  assert.equal(roleAvatarUrl(null), null);
});

test("all previously saved avatar ids resolve to a selectable approved portrait", () => {
  const previous = [
    "owner-male",
    "hr-male",
    "manager-male",
    "chef-male",
    "kitchen-male",
    "server-male",
    "cashier-male",
    "inventory-male",
    "server-male-2",
    "finance-male",
    "operations-male",
    "host-male",
    "manager-male-2",
    "shift-manager-male",
    "kitchen-male-2",
    "procurement-male",
    "owner-female",
    "server-female",
    "chef-female",
    "manager-female",
    "finance-female",
    "kitchen-female",
    "cashier-female",
    "host-female",
    "hr-female",
    "procurement-female",
    "manager-female-2",
    "server-female-2",
    "inventory-female",
    "operations-female",
    "shift-manager-female",
    "owner-female-2",
    "role-manager",
    "role-chef",
    "role-waiter",
    "role-cashier",
    "role-purchasing",
    "role-inventory",
    "role-kitchen",
    "role-staff",
    "waiter-male",
    "waiter-female",
  ];
  for (const id of previous) {
    assert.ok(
      AVATAR_PRESETS.some((p) => p.id === resolveAvatarPresetId(id)),
      id,
    );
    assert.match(avatarPresetUrl(id), /^\/avatars\/.+\.svg$/);
  }
  assert.equal(avatarPresetUrl("unknown"), null);
});

test("the catalogue uses 32 unique independently loadable vector portraits", async () => {
  const urls = new Set(AVATAR_PRESETS.map((p) => p.url));
  assert.equal(urls.size, 32);
  const hashes = new Set();
  for (const url of urls) {
    const bytes = await readFile(new URL(`../public${url}`, import.meta.url));
    hashes.add(createHash("sha256").update(bytes).digest("hex"));
    const svg = bytes.toString("utf8");
    assert.match(svg, /<svg[^>]*viewBox="0 0 256 256"/);
    assert.match(svg, /<title[^>]*>.+modern vector avatar<\/title>/);
    assert.doesNotMatch(svg, /<script|<image|(?:href|src)=|onload=|<foreignObject/i);
  }
  assert.equal(hashes.size, 32);
});
