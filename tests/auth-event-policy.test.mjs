import test from "node:test";
import assert from "node:assert/strict";
import { shouldRefreshAuthAccess, shouldResetThemeForAuth } from "../src/lib/auth-event-policy.ts";
test("foreground confirmation and token refresh preserve the current workspace cache", () => {
  assert.equal(shouldRefreshAuthAccess("INITIAL_SESSION", undefined, "a"), false);
  assert.equal(shouldRefreshAuthAccess("SIGNED_IN", "a", "a"), false);
  assert.equal(shouldRefreshAuthAccess("TOKEN_REFRESHED", "a", "a"), false);
});
test("real login, logout, account switches and profile updates refresh access", () => {
  assert.equal(shouldRefreshAuthAccess("SIGNED_IN", undefined, "a"), true);
  assert.equal(shouldRefreshAuthAccess("SIGNED_IN", null, "a"), true);
  assert.equal(shouldRefreshAuthAccess("SIGNED_IN", "a", "b"), true);
  assert.equal(shouldRefreshAuthAccess("SIGNED_OUT", "a", null), true);
  assert.equal(shouldRefreshAuthAccess("USER_UPDATED", "a", "a"), true);
});

test("fresh login resets to light while foreground sign-in and refresh retain the selected theme", () => {
  assert.equal(shouldResetThemeForAuth("SIGNED_IN", null, "user-a"), true);
  assert.equal(shouldResetThemeForAuth("SIGNED_IN", undefined, "user-a"), true);
  assert.equal(shouldResetThemeForAuth("SIGNED_IN", "user-a", "user-b"), true);
  assert.equal(shouldResetThemeForAuth("SIGNED_IN", "user-a", "user-a"), false);
  assert.equal(shouldResetThemeForAuth("TOKEN_REFRESHED", "user-a", "user-a"), false);
  assert.equal(shouldResetThemeForAuth("SIGNED_OUT", "user-a", null), true);
});
