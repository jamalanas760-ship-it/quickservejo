# Reservations toolbar — 13 October 2026

Implements the approved toolbar preview in the Phase 2 Waitlist style. Search appears first, followed by a daily date chip, desktop/tablet status chip, and shared Filters control. All, Upcoming, Seated and Pending remain available as horizontally scrollable underline tabs with the existing counts.

The calendar popover retains Previous day, Next day and Today, follows the selected day across month boundaries, and includes direct date entry for keyboard users. Today uses the restaurant timezone. Advanced date/status selections are staged until Apply, in an anchored panel or mobile bottom sheet. Search text is retained when applying status/date changes. Pagination still resets through the original handlers. Shared date calendars now localize their month/day labels in English and Arabic.

Existing reservation queries, status definitions, actions, availability rules, settings, messages and tenant permissions are unchanged. There are no database or production dependency changes.

Validation: 205 tests passed, TypeScript and production build passed, lint had 0 errors / 59 existing warnings. Chromium checks at 320, 390, 768, 1024 and 1440px in English/light and Arabic/dark covered daily navigation, month/year boundaries, Today, search retention, filter application, status tabs, focus restoration and horizontal overflow. Screenshots were reviewed. These component checks used an isolated harness; signed-in production acceptance and Lovable deployment synchronization remain independently verifiable. GitHub CI checks the final committed source before merge.
