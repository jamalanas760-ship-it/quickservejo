# Reservation workspace

The `/bookings` workspace now groups Schedule, Public Booking Page, Booking Settings and Messages into one responsive interface. Add Booking opens a focused form with guest count, restaurant-local date/time, live table availability and a zone-aware table choice. The public `/book/$slug` flow separates choosing a visit from entering guest details.

## Integration

Existing Supabase queries, booking RPCs, realtime refresh, permissions, waitlist, deposits and messaging integrations are retained. No database migration is required. Weekly opening hours use the existing `booking_settings.weekly_hours` JSON. Opening and closing times must be within one day because the current public slot RPC does not support overnight windows.

Schedule queries and staff booking timestamps use the restaurant timezone rather than the operator's device timezone. Nonexistent daylight-saving times are rejected. Form submission waits for current table availability; public booking requires a slot in the current successful response.

Direct WhatsApp opens a prepared draft and records the existing handoff event. It does not claim the guest received a message. Automatic messaging continues to use the configured provider. Existing booking statuses and the QuickServe navigation shell remain authoritative; the visual concept's unsupported status/edit controls were not introduced.

## Validation

- 118 contract and behavioral tests, including restaurant timezone, calendar boundaries, daylight-saving gaps and opening hours.
- TypeScript and production build.
- Isolated browser fixtures: search/details, staff creation in Amman from a Los Angeles browser, weekly-hours save, WhatsApp draft/handoff, public booking confirmation, Arabic public layout, desktop/mobile/tablet widths and dark mode.
- Visual comparison with the approved concepts: tab hierarchy, orange/white palette, compact summary/table, detail panel, guest form/calendar/time choices, public restaurant cover, settings navigation and messaging composer.

Browser tests use mocked Supabase responses and do not create production reservations or send WhatsApp messages. The local preview's pre-existing hosted logo path and external Google Fonts are unavailable in the test environment; application runtime errors are checked separately.
