import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const bookings = await readFile(new URL("../src/routes/_authenticated/bookings.tsx", import.meta.url), "utf8");
const edge = await readFile(new URL("../supabase/functions/quickserve-booking-messaging/index.ts", import.meta.url), "utf8");

test("reservation WhatsApp checks provider readiness before sending", () => {
  assert.match(bookings,/booking-messaging-provider-status/);
  assert.match(bookings,/Direct WhatsApp mode/);
  assert.match(bookings,/Send via WhatsApp/);
  assert.match(bookings,/record_booking_whatsapp_handoff/);
  assert.match(edge,/body\.action/);
  assert.match(edge,/"handoff"/);
});

test("unconfigured WhatsApp opens the direct customer chat", () => {
  assert.match(bookings,/const channel="whatsapp" as const/);
  assert.match(bookings,/if\(!whatsappConfigured\)/);
  assert.match(bookings,/window\.open\(whatsappLink/);
  assert.match(bookings,/Press Send in WhatsApp to deliver it/);
  assert.match(bookings,/friendlyBookingMessageError/);
});
