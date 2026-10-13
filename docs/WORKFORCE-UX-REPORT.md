# Workforce UI and restaurant scheduling — October 2026

Timesheets and Labor share a compact search/filter surface with progressive disclosure, active filter counts, labeled employee/role/status/date controls, date validation and reset. Filters adapt to phone, tablet and desktop widths with 44px controls. Timesheets now pages 25 records at a time, respects custom periods in its scheduled summary, filters summaries by employee search, and labels incomplete punches as open. Labor's date chart scrolls within its panel for longer periods.

Create Shift defaults recurrence to one week instead of twelve. Editable opening/prep, lunch, dinner and closing starting points are available; the manager supplies actual operating times. Team selection supports role/name filtering and bulk selection. Creating an unassigned shift requires an explicit choice. The preview checks overlaps and approved leave for the chosen employees and dates. Overnight times and restaurant timezone are preserved. Saving creates shifts and assignments in one transaction, rechecks conflicts and reuses identical planned shifts on retry.

Templates appear as reusable cards with individual management menus. Save opens a named-template dialog. Apply fills times, weekdays and notes; the manager chooses dates and employees. Duplicate names are database-protected; copying chooses an available name. Existing assigned shifts retain their copied values when templates change. The screen displays a useful retry state instead of raw database diagnostics.

Both database migrations are installed in the configured project `gtcmyaksmyiarokloyje`: `20261012132023_quickserve_integrity_templates` and `20261012135409_restaurant_workforce_scheduler`. Repository filenames match these installed versions. Historical data was not renumbered or rewritten.

Validation:

- 205 contract/unit tests passed, including restaurant-timezone recurrence, overnight shifts, invalid ranges and DST gaps.
- TypeScript and production build passed. Lint has no errors; existing fast-refresh/hook warnings remain.
- Authorized database transaction tests passed: atomic scheduling, retry deduplication, overlap preview/blocking, no partial save on conflict, approved-leave detection and template create/read/update/delete/name uniqueness. Every test write was rolled back.
- Chromium component checks passed at 320, 390, 768, 1024 and 1440px, in English/light and Arabic/dark. Filter panels and template dialogs fit; shift-creation dialog had no horizontal overflow and submitted one atomic save with a one-week plan. Fixtures were confined to a temporary QA harness; production uses Supabase and real tenant records.
- Supabase security/performance advisors reported no findings for the new template/scheduler objects. Existing project-wide advisory findings are outside this change.

Practical limits: browser checks used isolated components and test responses, rather than a signed-in production session. Full role/multi-restaurant acceptance, concurrent browser sessions and deployment/Lovable synchronization remain independently verifiable. Staff availability and demand forecasts are not stored in the current schema; the scheduler checks existing assignments and approved leave and does not claim automatic demand optimization. Existing server row caps for broad Timesheets/Labor periods remain; narrower date/team filters reduce that limitation.

Restaurant template workflow references: [7shifts scheduling templates](https://kb.7shifts.com/hc/en-us/articles/4417514429459-How-to-create-and-use-scheduling-templates) and [Deputy templates and bulk actions](https://help.deputy.com/hc/en-au/articles/17528687998095-Build-schedules-faster-with-templates-and-bulk-actions).
