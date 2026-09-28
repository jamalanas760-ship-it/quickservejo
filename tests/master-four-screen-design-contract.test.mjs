import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const menu = await readFile(new URL("../src/components/manage/MasterMenuDesigner.tsx", import.meta.url), "utf8");
const appearance = await readFile(new URL("../src/components/manage/RestaurantAppearance.tsx", import.meta.url), "utf8");
const profile = await readFile(new URL("../src/routes/_authenticated/profile.tsx", import.meta.url), "utf8");
const settings = await readFile(new URL("../src/components/profile/RestaurantProfileSettings.tsx", import.meta.url), "utf8");
const analytics = await readFile(new URL("../src/components/manage/AnalyticsManagerPro.tsx", import.meta.url), "utf8");
const analyticsRoute = await readFile(new URL("../src/routes/_authenticated/manage/$restaurantId/analytics.tsx", import.meta.url), "utf8");
const header = await readFile(new URL("../src/components/nav/AppHeader.tsx", import.meta.url), "utf8");
const nav = await readFile(new URL("../src/components/nav/BottomNav.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/quickserve-system.css", import.meta.url), "utf8");

test("approved Menu Studio layout is implemented", () => {
  assert.match(menu,/qs-menu-studio-master/);
  assert.match(menu,/qs-menu-workflow-card/);
  assert.match(menu,/qs-live-menu-pill/);
  assert.match(menu,/Create and manage your restaurant menu with beautiful items, categories and pricing/);
  assert.match(appearance,/qs-menu-brand-preview/);
  assert.match(styles,/Menu Studio/);
});

test("approved Organization and appearance layout is implemented", () => {
  assert.match(profile,/organizationFocus/);
  assert.match(profile,/qs-organization-hero/);
  assert.match(profile,/qs-organization-tabs/);
  assert.match(settings,/qs-organization-overview/);
  assert.match(settings,/Restaurant information/);
  assert.match(settings,/Brand colors/);
  assert.match(styles,/Organization & appearance/);
});

test("approved analytics layout places decision intelligence inside analytics", () => {
  assert.doesNotMatch(analyticsRoute,/DecisionIntelligencePanel/);
  assert.match(analytics,/DecisionIntelligencePanel restaurantId=\{restaurantId\}/);
  assert.match(analytics,/qs-analytics-approved/);
  assert.match(analytics,/\["revenue", "topProducts", "orders", "channels"/);
  assert.match(styles,/Analytics/);
});

test("approved global search and workspace tools launcher are implemented", () => {
  assert.match(header,/quickserve:open-workspace-tools/);
  assert.match(header,/qs-global-search-trigger/);
  assert.match(nav,/quickserve:open-workspace-tools/);
  assert.match(nav,/qs-workspace-tools-spotlight/);
  assert.match(nav,/Everything you need in one place/);
  assert.match(nav,/Ctrl K/);
  assert.match(styles,/Workspace tools/);
});
