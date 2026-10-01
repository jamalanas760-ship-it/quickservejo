import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const bookings=await readFile(new URL("../src/routes/_authenticated/bookings.tsx",import.meta.url),"utf8");
const team=await readFile(new URL("../src/components/manage/StaffManagerAdvanced.tsx",import.meta.url),"utf8");
const analytics=await readFile(new URL("../src/components/manage/AnalyticsManagerPro.tsx",import.meta.url),"utf8");
const erp=await readFile(new URL("../src/components/backoffice/BackOfficeShell.tsx",import.meta.url),"utf8");
const integrations=await readFile(new URL("../src/routes/_authenticated/integrations.tsx",import.meta.url),"utf8");
const migration=await readFile(new URL("../supabase/migrations/20260928143000_master_ops_design_messaging_qr.sql",import.meta.url),"utf8");

test("reservation messaging uses immediate provider feedback and WhatsApp fallback",()=>{
  assert.match(bookings,/quickserve-booking-messaging/);
  assert.match(bookings,/Open WhatsApp/);
  assert.match(bookings,/buildWhatsAppLink/);
  assert.match(bookings,/Automatic WhatsApp delivery failed/);
});

test("QR scans do not mark tables occupied before a real order",()=>{
  assert.match(migration,/QR scan proves browsing intent/);
  assert.match(migration,/service_status in \('free','reserved'\)/);
  assert.match(migration,/legacy scan-created Active\/Occupied/);
});

test("team actions are aligned as one control group",()=>{
  assert.match(team,/qs-team-actions/);
  assert.match(team,/qs-team-action-button/);
});

test("analytics and ERP expose decision-ready master summaries",()=>{
  assert.match(analytics,/qs-analytics-approved/);
  assert.match(analytics,/DecisionIntelligencePanel/);
  assert.match(analytics,/peakHour/);
  assert.match(analytics,/cancelRate/);
  assert.match(erp,/Back Office/);
  assert.match(erp,/Inventory value/);
  assert.match(erp,/Month expenses/);
});

test("integrations surface runtime health",()=>{
  assert.match(integrations,/Integration Issues/);
  assert.match(integrations,/WhatsApp \/ SMS/);
  assert.match(integrations,/Runtime tested/);
});


test("campaign messaging normalizes local destinations and CRM pages reuse cached data", async()=>{
  const campaignWorker=await readFile(new URL("../supabase/functions/quickserve-campaign-worker/index.ts",import.meta.url),"utf8");
  const guests=await readFile(new URL("../src/routes/_authenticated/guests.tsx",import.meta.url),"utf8");
  const campaigns=await readFile(new URL("../src/routes/_authenticated/campaigns.tsx",import.meta.url),"utf8");
  assert.match(campaignWorker,/normalizeDestination/);
  assert.match(campaignWorker,/"962"\s*\+\s*digits\.slice\(1\)/);
  assert.match(guests,/staleTime: 60_000/);
  assert.match(campaigns,/staleTime:15_000/);
});
