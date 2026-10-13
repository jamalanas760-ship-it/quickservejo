# Waitlist design — 13 October 2026

Waitlist now reuses the Reservations studio's heading, pill navigation, summary metrics, panel surfaces, filter controls and brand/status palette. Its former layered CSS overrides are replaced with one scoped stylesheet.

The date selector and search share a compact toolbar; status filters scroll on narrow screens. Guest rows become readable cards on mobile while keeping contact, visit, party and status visible. Wide screens show the selected guest in a reservation-style side panel; phones and tablets use a bounded details dialog. Switching to the wide layout unmounts the dialog to prevent an overlapping modal during resize. Controls have 44px touch targets, keyboard focus styling and RTL support.

Existing search, date/status filtering, pagination, table offers, direct booking, notification state, cancellation, estimates, permissions and tenant-scoped queries remain in place. This change does not alter database schemas or RPC contracts.

Validation: 205 existing tests passed; TypeScript and production build passed; the modified route has no lint errors or warnings. Chromium checks with isolated test fixtures passed at 320, 390, 768, 1024 and 1440px in English/light and Arabic/dark. Search and details open/close passed; no horizontal page overflow or browser errors occurred. Desktop and mobile screenshots were visually reviewed. Signed-in production acceptance and Lovable deployment synchronization were not verified by these component checks.
