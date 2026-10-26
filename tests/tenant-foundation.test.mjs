import test from "node:test";
import assert from "node:assert/strict";
import { QueryClient } from "@tanstack/react-query";
import { requireRestaurantAccess, MENU_EDITOR_ROLES, RESTAURANT_ADMIN_ROLES } from "../src/lib/server/restaurant-access.server.ts";
import { clearAccountQueryCache } from "../src/lib/account-query-cache.ts";
import { shouldClearAccountCache } from "../src/lib/auth-event-policy.ts";

const restaurantA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const restaurantB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function context({ owner = false, ownerError = null, membershipError = null, memberships = [] } = {}) {
  const filters = {};
  const query = {
    select() { return this; },
    eq(key, value) { filters[key] = value; return this; },
    then(resolve, reject) {
      return Promise.resolve({
        data: memberships.filter((row) => Object.entries(filters).every(([key, value]) => row[key] === value)),
        error: membershipError,
      }).then(resolve, reject);
    },
  };
  return {
    userId: "user-a",
    supabase: {
      rpc: async (name) => { assert.equal(name, "is_platform_owner"); return { data: owner, error: ownerError }; },
      from: (table) => { assert.equal(table, "staff"); return query; },
    },
  };
}
const member = (extra = {}) => ({ restaurant_id: restaurantA, auth_user_id: "user-a", is_active: true, role: "manager", ...extra });

test("restaurant access requires the current user's active membership in that exact restaurant", async () => {
  const allowed = await requireRestaurantAccess(context({ memberships: [member()] }), restaurantA, MENU_EDITOR_ROLES);
  assert.equal(allowed.isPlatformOwner, false);
  for (const membership of [member({ restaurant_id: restaurantB }), member({ auth_user_id: "user-b" }), member({ is_active: false }), member({ role: "waiter" })]) {
    await assert.rejects(requireRestaurantAccess(context({ memberships: [membership] }), restaurantA, MENU_EDITOR_ROLES), /Forbidden/);
  }
});

test("endpoint role policies remain distinct; local super_admin role is not global ownership", async () => {
  await assert.rejects(requireRestaurantAccess(context({ memberships: [member()] }), restaurantA, RESTAURANT_ADMIN_ROLES), /Forbidden/);
  await assert.rejects(requireRestaurantAccess(context({ memberships: [member({ role: "super_admin" })] }), restaurantB, MENU_EDITOR_ROLES), /Forbidden/);
  assert.equal((await requireRestaurantAccess(context({ owner: true }), restaurantB, RESTAURANT_ADMIN_ROLES)).isPlatformOwner, true);
});

test("authorization fails closed on lookup failures and non-boolean ownership", async () => {
  await assert.rejects(requireRestaurantAccess(context({ ownerError: Error("unavailable"), memberships: [member()] }), restaurantA, MENU_EDITOR_ROLES), /unavailable/);
  await assert.rejects(requireRestaurantAccess(context({ membershipError: Error("denied") }), restaurantA, MENU_EDITOR_ROLES), /denied/);
  await assert.rejects(requireRestaurantAccess(context({ owner: "true" }), restaurantA, MENU_EDITOR_ROLES), /Forbidden/);
  await assert.rejects(requireRestaurantAccess(context({ owner: true }), "invalid", MENU_EDITOR_ROLES), /Forbidden/);
  await assert.rejects(requireRestaurantAccess({ ...context({ owner: true }), userId: "" }, restaurantA, MENU_EDITOR_ROLES), /Forbidden/);
});

test("logout and account switches discard feature data and mutation results", () => {
  const client = new QueryClient();
  client.setQueryData(["orders", restaurantA], [{ total: 100 }]);
  client.setQueryData(["payslips"], [{ salary: 500 }]);
  client.getMutationCache().build(client, { mutationKey: ["payroll"] });
  assert.equal(shouldClearAccountCache("SIGNED_OUT", "a", null), true);
  assert.equal(shouldClearAccountCache("SIGNED_IN", "a", "b"), true);
  assert.equal(shouldClearAccountCache("SIGNED_IN", undefined, "a"), true);
  clearAccountQueryCache(client);
  assert.equal(client.getQueryCache().getAll().length, 0);
  assert.equal(client.getMutationCache().getAll().length, 0);
});

test("an old in-flight response cannot refill the new account's cache", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let finish;
  const request = client.fetchQuery({ queryKey: ["orders"], queryFn: () => new Promise((resolve) => { finish = resolve; }) });
  const settled = request.catch(() => undefined);
  clearAccountQueryCache(client);
  finish(["old-account-data"]);
  await settled;
  await Promise.resolve();
  assert.equal(client.getQueryData(["orders"]), undefined);
});

test("foreground and token refresh preserve the same account's warm cache", () => {
  for (const event of ["SIGNED_IN", "TOKEN_REFRESHED", "USER_UPDATED"]) {
    assert.equal(shouldClearAccountCache(event, "a", "a"), false);
  }
  assert.equal(shouldClearAccountCache("INITIAL_SESSION", undefined, "a"), false);
});
