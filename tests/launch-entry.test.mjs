import test from "node:test";
import assert from "node:assert/strict";
import { isLaunchEntry } from "../src/lib/launch-entry.ts";

test("home, sign-in and workspace entries continue the startup animation", () => {
  for (const path of ["/", "/auth", "/dashboard", "/manage/menu", "/kitchen"]) {
    assert.equal(isLaunchEntry(path), true, path);
  }
});

test("other pages and partial workspace name matches do not start an entry overlay", () => {
  for (const path of ["/privacy", "/contact", "/dashboarding", "/auth/callback"]) {
    assert.equal(isLaunchEntry(path), false, path);
  }
});
