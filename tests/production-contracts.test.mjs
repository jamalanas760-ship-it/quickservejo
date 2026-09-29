import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function file(path) {
  return readFile(new URL("../" + path, import.meta.url), "utf8");
}

test("authenticated shell has accessibility and runtime monitoring", async () => {
  const root = await file("src/routes/__root.tsx");
  assert.match(root, /Skip to main content/);
  assert.match(root, /AppRuntimeMonitor/);
  assert.match(root, /id="main-content"/);
});

test("PWA has a service worker and standalone manifest", async () => {
  const sw = await file("public/sw.js");
  const offline = await file("public/offline.html");
  const manifest = JSON.parse(await file("public/manifest.webmanifest"));
  assert.match(sw, /addEventListener\("fetch"/);
  assert.match(sw, /Never cache server-rendered HTML/);
  assert.match(sw, /cacheableAsset/);
  assert.match(sw, /quickserve-runtime-v6/);
  assert.match(offline, /Connection interrupted/);
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons?.length >= 2);
});

test("cashier uses ledger RPC instead of directly forcing paid status", async () => {
  const cashier = await file("src/routes/_authenticated/cashier.tsx");
  assert.match(cashier, /record_order_payment/);
  assert.match(cashier, /refund_order_payment/);
  assert.match(cashier, /open_cash_session/);
  assert.match(cashier, /close_cash_session/);
  assert.match(cashier, /_restaurant_id:\s*rid/);
  assert.match(cashier, /_payment_id:\s*payment\.id/);
  assert.doesNotMatch(cashier, /payment_status:\s*"paid"/);
});

test("public checkout uses hardened v2 and fulfillment RPCs", async () => {
  const diner = await file("src/lib/diner.ts");
  assert.match(diner, /place_public_order_v2/);
  assert.match(diner, /place_public_fulfillment_order/);
});

test("guest CRM route and restaurant OS migration exist", async () => {
  const guests = await file("src/routes/_authenticated/guests.tsx");
  const migration = await file("supabase/migrations/20260920084500_phase4_restaurant_os_foundation.sql");
  assert.match(guests, /crm_guests/);
  for (const table of [
    "payment_transactions",
    "erp_menu_recipes",
    "crm_guests",
    "staff_time_entries",
    "erp_supplier_invoices",
    "restaurant_groups",
    "saas_usage_daily",
  ]) {
    assert.match(migration, new RegExp(table));
  }
});

test("platform health route reads runtime events and performance samples", async () => {
  const health = await file("src/routes/_authenticated/super-admin/health.tsx");
  assert.match(health, /system_events/);
  assert.match(health, /performance_samples/);
  assert.match(health, /LCP/);
  assert.match(health, /INP/);
  assert.match(health, /CLS/);
});


test("payment integrity migration caps settlement and links refunds", async () => {
  const migration = await file("supabase/migrations/20260920100000_phase4_payment_integrity.sql");
  assert.match(migration, /parent_transaction_id/);
  assert.match(migration, /Payment exceeds outstanding balance/);
  assert.match(migration, /Gift card balance is insufficient/);
  assert.match(migration, /_restaurant_id uuid/);
});

test("delivery accounting persists the fee separately from order total", async () => {
  const migration = await file("supabase/migrations/20260920101000_phase4_delivery_accounting.sql");
  assert.match(migration, /delivery_amount=_delivery/);
});

test("shift clock stays visible and uses server-authoritative attendance state", async () => {
  const shifts = await file("src/routes/_authenticated/shifts.tsx");
  assert.match(shifts, /import \{ useEffect, useMemo, useState \} from "react"/);
  assert.doesNotMatch(shifts, /max-h-\[118px\][^>]*overflow-y-auto/);
  assert.ok(shifts.indexOf("Attendance & time") < shifts.indexOf("Weekly labor control"));
  assert.match(shifts, /clock_out\.is\.null,clock_in\.gte/);
  assert.match(shifts, /get_my_time_clock_status/);
  assert.match(shifts, /clock_in_staff/);
  assert.match(shifts, /clock_out_staff/);
  assert.doesNotMatch(shifts, /setClockOverride\(openEntry \? null :/);
  assert.match(shifts, /aria-busy=\{toggleClock\.isPending\}/);
  assert.match(shifts, /aria-live="polite"/);
});

test("operations navigation and work board retain the polished interaction contract", async () => {
  const dashboard = await file("src/routes/_authenticated/dashboard.tsx");
  const work = await file("src/routes/_authenticated/work.tsx");
  const router = await file("src/router.tsx");
  const normalStart = dashboard.indexOf("if (!customize)");
  const normalDashboard = dashboard.slice(normalStart, dashboard.indexOf("\n\n  return <div", normalStart + 50));

  assert.match(normalDashboard, /to="\/bookings"/);
  assert.match(normalDashboard, /Add Booking/);
  assert.match(work, /onMutate: async \(\{ id, status \}\)/);
  assert.match(work, /Release to move the card/);
  assert.match(work, /Approval & source/);
  assert.match(work, /panelClassName="sm:max-w-\[640px\]"/);
  assert.match(router, /defaultPendingMs: 1_200/);
  assert.match(router, /defaultPendingMinMs: 0/);
});

test("authenticated navigation keeps stable chrome with a once-per-session launch experience", async () => {
  const shell = await file("src/routes/_authenticated/route.tsx");
  const root = await file("src/routes/__root.tsx");
  const splash = await file("src/components/app/SplashScreen.tsx");
  const router = await file("src/router.tsx");
  const skeleton = await file("src/components/ui/skeleton.tsx");
  const notifications = await file("src/components/nav/NotificationBell.tsx");
  const analytics = await file("src/components/manage/AnalyticsManagerPro.tsx");
  const kitchen = await file("src/routes/_authenticated/kitchen.tsx");

  assert.match(shell, /queryKey: \["auth", "route-user"\]/);
  assert.match(shell, /staleTime: 5 \* 60_000/);
  assert.match(shell, /qs-persistent-chrome/);
  assert.match(shell, /<AppHeader title=\{persistentTitle\}/);
  assert.match(shell, /SuppressNestedAppHeader/);
  assert.doesNotMatch(root, /<RouteProgress/);
  assert.match(root, /<SplashScreen \/>/);
  assert.match(splash, /quickserve\.splash\.shown/);
  assert.match(splash, /sessionStorage\.getItem\(FLAG\)/);
  assert.match(splash, /SKIP_PREFIXES/);
  assert.match(splash, /prefers-reduced-motion/);
  assert.match(router, /defaultPendingMs: 1_200/);
  assert.match(router, /defaultPreloadStaleTime: 5 \* 60_000/);
  assert.doesNotMatch(skeleton, /animate-pulse/);
  assert.match(skeleton, /qs-skeleton/);
  assert.doesNotMatch(notifications, /animate-pulse/);
  assert.doesNotMatch(kitchen, /animate-pulse/);
  assert.doesNotMatch(analytics, /<a href=\{`\/manage/);
});


test("runtime hardening is hydration-safe and retries only transient reads", async () => {
  const monitor = await file("src/components/app/AppRuntimeMonitor.tsx");
  const connectivity = await file("src/hooks/useConnectivity.ts");
  const reliability = await file("src/lib/query-reliability.ts");
  const router = await file("src/router.tsx");
  const offlineOps = await file("src/lib/offline-ops.ts");

  assert.doesNotMatch(monitor, /useState\(\(\) => typeof navigator/);
  assert.match(connectivity, /useSyncExternalStore/);
  assert.match(connectivity, /getServerSnapshot/);
  assert.match(connectivity, /probeOrigin/);
  assert.match(reliability, /failureCount < 2/);
  assert.match(router, /refetchOnReconnect: true/);
  assert.match(router, /retry: shouldRetryQuery/);
  assert.doesNotMatch(offlineOps, /if \(typeof navigator !== "undefined" && !navigator\.onLine\)/);
});

test("profile settings selection uses the brand accent instead of a black fill", async () => {
  const profile = await file("src/routes/_authenticated/profile.tsx");
  assert.match(profile, /active \? "bg-\[#fff3ed\]/);
  assert.match(profile, /bg-\[#e85d2a\] text-white/);
  assert.doesNotMatch(profile, /active \? "bg-foreground text-background/);
});


test("attendance shows live, completed-session, and daily hour-minute durations", async () => {
  const shifts = await file("src/routes/_authenticated/shifts.tsx");
  assert.match(shifts, /Current session/);
  assert.match(shifts, /Last session/);
  assert.match(shifts, /Worked today/);
  assert.match(shifts, /currentSessionSeconds/);
  assert.match(shifts, /latestCompletedSeconds/);
  assert.match(shifts, /todayWorkedSeconds/);
  assert.match(shifts, /formatClockDuration\(todayWorkedSeconds/);
  assert.match(shifts, /Clocked out · session/);
  assert.match(shifts, /new Date\(entry\.clock_in\)\.toLocaleDateString\("en-CA"\)/);
});


test("team and shifts pages implement the approved modern live workforce design", async () => {
  const team = await file("src/components/manage/StaffManagerAdvanced.tsx");
  const shifts = await file("src/routes/_authenticated/shifts.tsx");
  assert.match(team, /Team management/);
  assert.match(team, /On Shift Now/);
  assert.match(team, /Live Status/);
  assert.match(team, /StaffLiveStatus/);
  assert.match(team, /StaffRowActions/);
  assert.match(team, /On Leave/);
  assert.match(shifts, /Shift coverage/);
  assert.match(shifts, /Live preview/);
  assert.match(shifts, /CoverageTimeline/);
  assert.match(shifts, /ShiftWeekCalendar/);
  assert.match(shifts, /Shift Conflicts/);
  assert.match(shifts, /Create shift/);
  assert.match(shifts, /"timeline" \| "calendar" \| "list"/);
});


test("Workforce supports audited manager-created missing punches", async () => {
  const workforce = await file("src/components/workforce/WorkforceInsights.tsx");
  const migration = await file("supabase/migrations/20260929083025_workforce_timesheet_review_and_missing_punch.sql");
  assert.match(workforce, /Add missing punch/);
  assert.match(workforce, /create_missing_time_entry/);
  assert.match(workforce, /Audited manager action/);
  assert.match(migration, /create or replace function public\.create_missing_time_entry/);
  assert.match(migration, /missing_punch_created/);
  assert.match(migration, /This missing punch overlaps an existing time entry/);
});


test("Team recurring schedules update Today's Shift immediately in restaurant time", async () => {
  const team = await file("src/components/manage/StaffManagerAdvanced.tsx");
  assert.match(team, /todayKey={scheduleDayKey}/);
  assert.match(team, /team-schedule-live:/);
  assert.match(team, /refresh_recurring_staff_schedules/);
  assert.match(team, /Today will appear immediately/);
  assert.match(team, /refetchQueries\(\{ queryKey: \["platform", "staff-schedule", restaurantId\]/);
});


test("Workforce attention alerts support persistent read acknowledgements", async () => {
  const workforce = await file("src/components/workforce/WorkforceInsights.tsx");
  const migration = await file("supabase/migrations/20260929090409_workforce_attention_reads_and_missing_punch_requests.sql");
  assert.match(workforce, /Mark all read/);
  assert.match(workforce, /mark_workforce_attention_read/);
  assert.match(workforce, /workforce_alert_read/);
  assert.match(migration, /create or replace function public\.mark_workforce_attention_read/);
});


test("Workforce supports employee missing-punch requests and manager approval", async () => {
  const shifts = await file("src/routes/_authenticated/shifts.tsx");
  const workforce = await file("src/components/workforce/WorkforceInsights.tsx");
  const migration = await file("supabase/migrations/20260929090409_workforce_attention_reads_and_missing_punch_requests.sql");
  assert.match(shifts, /Forgot a punch\?/);
  assert.match(shifts, /submit_missing_punch_request/);
  assert.match(workforce, /Missing punch requests/);
  assert.match(workforce, /review_missing_punch_request/);
  assert.match(migration, /create table if not exists public\.staff_missing_punch_requests/);
  assert.match(migration, /missing_punch_requested/);
});


test("theme and topbar interactions use atomic and soft motion", async () => {
  const theme = await file("src/components/nav/ThemeToggle.tsx");
  const header = await file("src/components/nav/AppHeader.tsx");
  const css = await file("src/quickserve-system.css");
  assert.match(theme, /startViewTransition/);
  assert.match(theme, /flushSync/);
  assert.match(header, /qs-command-icon-trigger/);
  assert.match(header, /<Command className=/);
  assert.doesNotMatch(header, />Ctrl</);
  assert.match(header, /qs-topbar-popover/);
  assert.match(css, /::view-transition-new\(root\)/);
  assert.match(css, /qs-topbar-popover-in/);
  assert.match(css, /qs-workforce-snapshot/);
});


test("approved Team and Workforce layout uses the command icon search and live Team insights", async () => {
  const header = await file("src/components/nav/AppHeader.tsx");
  const team = await file("src/components/manage/StaffManagerAdvanced.tsx");
  const shifts = await file("src/routes/_authenticated/shifts.tsx");
  const css = await file("src/quickserve-system.css");
  assert.match(header, /qs-global-search-trigger-approved/);
  assert.match(header, /qs-command-icon-trigger/);
  assert.match(team, /qs-approved-team-page/);
  assert.match(team, /Today's Attendance/);
  assert.match(team, /Shift Distribution/);
  assert.match(team, /Upcoming Shifts/);
  assert.match(shifts, /qs-approved-workforce-page/);
  assert.match(css, /Approved Team \+ Workforce image implementation/);
  assert.match(css, /qs-approved-page-hero/);
});


test("shifts page places a modern live clock hero above shift coverage", async () => {
  const shifts = await file("src/routes/_authenticated/shifts.tsx");
  assert.match(shifts, /function WorkforceClockHero/);
  assert.ok(shifts.indexOf("<WorkforceClockHero") < shifts.indexOf("Shift coverage"));
  assert.match(shifts, /You are currently on shift/);
  assert.match(shifts, /Current session/);
  assert.match(shifts, /Expected end/);
  assert.match(shifts, /Clock out/);
  assert.match(shifts, /function WorkforceNavigation/);
  assert.match(shifts, /mode=\{workforceSection\}/);
  assert.match(shifts, /showAttendance = mode === "attendance"/);
});
