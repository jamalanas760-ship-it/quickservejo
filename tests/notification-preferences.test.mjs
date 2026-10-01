import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_NOTIFICATIONS,
  normalizeNotificationPreferences,
  notificationKey,
} from "../src/lib/notification-preferences.ts";
test("notification settings migrate existing flags while validating new fields", () => {
  assert.deepEqual(normalizeNotificationPreferences(null), DEFAULT_NOTIFICATIONS);
  const migrated = normalizeNotificationPreferences({
    sound: false,
    tableSounds: true,
    newOrders: false,
    tone: "invalid",
    volume: Infinity,
    marketing: "false",
  });
  assert.equal(migrated.sound, false);
  assert.equal(migrated.tableSounds, true);
  assert.equal(migrated.newOrders, false);
  assert.equal(migrated.tone, "soft");
  assert.equal(migrated.volume, 60);
  assert.equal(migrated.marketing, false);
});
test("sound volume is bounded and notification storage is account scoped", () => {
  assert.equal(normalizeNotificationPreferences({ volume: 200, tone: "bell" }).volume, 100);
  assert.equal(normalizeNotificationPreferences({ volume: -1 }).volume, 0);
  assert.equal(notificationKey("user-a"), "quickserve.notifications:user-a");
  assert.notEqual(notificationKey("user-a"), notificationKey("user-b"));
});
