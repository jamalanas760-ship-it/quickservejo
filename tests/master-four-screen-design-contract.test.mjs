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
const masterPage = await readFile(new URL("../src/components/app/MasterPage.tsx", import.meta.url), "utf8");

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
  assert.doesNotMatch(settings,/Guest experience/);
  assert.doesNotMatch(settings,/Brand system/);
  assert.doesNotMatch(settings,/Cover & home image/);
  assert.doesNotMatch(settings,/CoverComposer/);
  assert.doesNotMatch(profile,/Guest experience/);
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


test("workspace and menu visual assets are restaurant-customizable", async () => {
  const appearanceModel = await readFile(new URL("../src/lib/restaurant-appearance.ts", import.meta.url), "utf8");
  assert.match(appearanceModel,/workspaceToolsImage/);
  assert.match(appearanceModel,/workspaceToolsIcon/);
  assert.match(appearanceModel,/standardMenuCardImage/);
  assert.match(appearanceModel,/pdfMenuCardImage/);
  assert.doesNotMatch(appearanceModel,/standardMenuCardIcon/);
  assert.doesNotMatch(appearanceModel,/pdfMenuCardIcon/);
  assert.match(settings,/Customize images & icons/);
  assert.match(settings,/Panel image/);
  assert.match(settings,/Panel icon/);
  assert.doesNotMatch(settings,/Card icon/);
  assert.match(settings,/icon is fixed by QuickServe/);
  assert.match(menu,/appearance\.standardMenuCardImage/);
  assert.doesNotMatch(menu,/appearance\.standardMenuCardIcon/);
  assert.doesNotMatch(menu,/appearance\.pdfMenuCardIcon/);
  assert.match(menu,/BookOpenText/);
  assert.match(nav,/appearance\.workspaceToolsImage/);
  assert.match(nav,/appearance\.workspaceToolsIcon/);
});

test("organization color studio and navigation loader use the friendly master experience", async () => {
  const colorStudio = await readFile(new URL("../src/components/manage/ApplicationColorStudio.tsx", import.meta.url), "utf8");
  const root = await readFile(new URL("../src/routes/__root.tsx", import.meta.url), "utf8");
  assert.match(colorStudio,/Quick styles/);
  assert.match(colorStudio,/qs-color-preset/);
  assert.match(colorStudio,/applyPreset/);
  assert.match(root,/function NavigationProgress/);
  assert.match(root,/state\.isLoading/);
  assert.match(styles,/qs-route-progress/);
  assert.match(styles,/qs-interface-visuals/);
  assert.match(styles,/qs-color-presets/);
});


test("quick styles apply across the restaurant shell and sidebar is customizable", async () => {
  const appearanceModel = await readFile(new URL("../src/lib/restaurant-appearance.ts", import.meta.url), "utf8");
  const colorStudio = await readFile(new URL("../src/components/manage/ApplicationColorStudio.tsx", import.meta.url), "utf8");
  assert.match(appearanceModel,/sidebarPinnedTools/);
  assert.match(settings,/Customize navigation/);
  assert.match(settings,/Still in All tools/);
  assert.match(settings,/Home always stays first/);
  assert.match(nav,/appearance\.sidebarPinnedTools/);
  assert.match(nav,/customDesktopPrimary/);
  assert.match(colorStudio,/One style updates buttons, actions, active navigation, sidebar, workspace background and highlights together/);
  assert.match(colorStudio,/activePresetId/);
  assert.match(styles,/Comprehensive workspace theming \+ sidebar customization/);
  assert.match(styles,/--qs-brand:var\(--restaurant-light-primary\)/);
  assert.match(styles,/qs-sidebar-customizer/);
});

test("PDF Menu selector mirrors the Standard Menu card design", () => {
  assert.match(menu,/appearance\.pdfMenuCardImage \?\? appearance\.standardMenuCardImage \?\? restaurant\.data\?\.cover_image_url/);
  assert.doesNotMatch(menu,/qs-menu-workflow-image qs-menu-workflow-image-logo/);
  assert.match(menu,/workflow === "pdf" \? "is-active border-primary\/70 bg-primary\/\[\.045\]"/);
});


test("menu type cards always use fixed system-colored icons", async () => {
  assert.match(menu,/qs-menu-type-icon/);
  assert.match(menu,/BookOpenText/);
  assert.match(menu,/FileText/);
  assert.doesNotMatch(menu,/standardMenuCardIcon/);
  assert.doesNotMatch(menu,/pdfMenuCardIcon/);
  assert.match(styles,/Fixed system menu-type icons/);
  assert.match(styles,/--qs-brand/);
});


test("mobile navigation mirrors the configured sidebar and preferences live in the topbar", () => {
  assert.match(nav,/customMobilePrimary/);
  assert.match(nav,/appearance\.sidebarPinnedTools/);
  assert.match(nav,/slice\(0, 4\)/);
  assert.doesNotMatch(nav,/Preferences/);
  assert.doesNotMatch(nav,/toggleLang/);
  assert.doesNotMatch(nav,/ThemeToggle/);
  assert.match(header,/qs-topbar-theme-control/);
  assert.match(header,/qs-topbar-language/);
  assert.match(settings,/Mobile: first 4/);
  assert.match(styles,/Mobile navigation master alignment/);
});


test("mobile master UX prevents unwanted keyboard focus and keeps navigation compact", () => {
  assert.doesNotMatch(nav,/Input autoFocus/);
  assert.match(nav,/inputMode="search"/);
  assert.match(nav,/onOpenAutoFocus/);
  assert.match(nav,/event\.preventDefault\(\)/);
  assert.match(nav,/customMobilePrimary/);
  assert.match(nav,/slice\(0, 3\)/);
  assert.match(nav,/qs-mobile-bottom-nav/);
  assert.match(nav,/qs-mobile-nav-item/);
  assert.match(header,/qs-topbar-controls/);
  assert.match(header,/qs-mobile-logo-box/);
  assert.match(styles,/Master mobile responsive system/);
  assert.match(styles,/five slots maximum/);
});

test("Menu Studio mobile actions use the shared aligned responsive layout", () => {
  assert.match(menu,/qs-menu-header-actions/);
  assert.match(menu,/qs-menu-mode-control/);
  assert.match(menu,/qs-menu-preview-button/);
  assert.match(masterPage,/qs-master-actions/);
  assert.match(styles,/Menu Studio actions use a deliberate two-row phone layout/);
});


test("mobile topbar uses the dedicated segmented theme control", async () => {
  const themeToggle = await readFile(new URL("../src/components/nav/ThemeToggle.tsx", import.meta.url), "utf8");
  assert.match(themeToggle,/qs-theme-toggle-compact/);
  assert.match(themeToggle,/qs-theme-toggle-thumb/);
  assert.match(themeToggle,/data-theme=\{theme\}/);
  assert.match(themeToggle,/qs-theme-toggle-option/);
  assert.match(styles,/Mobile segmented theme control/);
  assert.match(styles,/touch-action:manipulation/);
  assert.match(styles,/\.qs-topbar-theme-control\.qs-theme-toggle-compact/);
});


test("tables mobile floor plan uses responsive rails, compact controls and scaled table markers", async () => {
  const tablesPro = await readFile(new URL("../src/components/manage/TablesManagerPro.tsx", import.meta.url), "utf8");
  const switchControl = await readFile(new URL("../src/components/ui/switch.tsx", import.meta.url), "utf8");
  assert.match(tablesPro,/qs-tables-page/);
  assert.match(tablesPro,/qs-tables-chip-rail/);
  assert.match(tablesPro,/qs-floor-toolbar/);
  assert.match(tablesPro,/qs-toggle-control/);
  assert.match(tablesPro,/qs-floor-canvas/);
  assert.match(tablesPro,/qs-floor-table-piece/);
  assert.match(tablesPro,/--qs-floor-object-scale/);
  assert.doesNotMatch(tablesPro,/<Switch checked=\{grid\}/);
  assert.match(switchControl,/qs-master-switch/);
  assert.match(styles,/Tables mobile floor-plan master pass/);
  assert.match(styles,/--qs-floor-object-scale:\.62/);
  assert.match(styles,/\.qs-master-switch/);
});


test("reservation dialogs are mobile-first and never summon the keyboard on open", async () => {
  const bookings = await readFile(new URL("../src/routes/_authenticated/bookings.tsx", import.meta.url), "utf8");
  const createBlock = bookings.slice(bookings.indexOf("function CreateBookingDialog"), bookings.indexOf("function SectionHeading"));
  const settingsBlock = bookings.slice(bookings.indexOf("function BookingSettingsDialog"), bookings.indexOf("function BookingRow"));
  assert.match(createBlock,/qs-booking-create-dialog/);
  assert.match(createBlock,/onOpenAutoFocus/);
  assert.match(createBlock,/event\.preventDefault\(\)/);
  assert.doesNotMatch(createBlock,/autoFocus/);
  assert.match(createBlock,/qs-booking-create-footer/);
  assert.match(createBlock,/qs-booking-duration-rail/);
  assert.match(settingsBlock,/qs-booking-settings-dialog/);
  assert.match(settingsBlock,/onOpenAutoFocus/);
  assert.match(settingsBlock,/qs-booking-settings-section/);
  assert.match(settingsBlock,/qs-booking-settings-footer/);
  assert.match(settingsBlock,/Timing & capacity/);
  assert.match(settingsBlock,/Guest messaging/);
  assert.match(settingsBlock,/Deposits & terms/);
  assert.match(styles,/Reservation dialogs mobile master pass/);
  assert.match(styles,/qs-booking-settings-toggle-grid/);
  assert.match(styles,/safe-area-inset-bottom/);
});
