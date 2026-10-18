# Employee HR workspace

Open **Workforce → My workspace**. Employees see only their own records. Users with the existing `manage_shifts` capability can switch to **Team view**, select an employee, and use the identity card's More menu to configure employment, configure leave balances, or add a salary slip. This follows the application's existing manager permission overrides; tenant access and ownership are checked by database RLS as well as by the interface.

## Initial setup

1. Set the real employment start date, employee number, department and title. Service period uses calendar anniversaries through today, capped at an entered employment end date. Account creation dates are never used as employment dates.
2. Configure each employee's annual and sick accounts for each year separately. Enter the actual agreed opening balance and entitlement, accrual interval and method, calendar/workday deduction basis, working weekdays and hours per leave day. No statutory or company policy is assumed or seeded.
3. Enter salary slips using actual payroll records. Save a draft, review the stored employee snapshot, income, deductions, payment details and calculated totals, then publish. Only published slips are visible to the employee. Publication records a document; it does not initiate payment. Published slips cannot be edited. Only account last-four digits are stored.

## Balance rules

- Opening balance excludes requests in the selected year. Enter the entitlement agreed for the configured accrual interval; employment dates do not silently prorate it.
- Upfront grants become earned on the configured accrual start. Daily accrual spreads entitlement over every calendar day in that interval, including leap days.
- Only approved leave consumes a balance. Requests are clipped to the selected year. Working-day policies exclude unconfigured weekdays. Partial leave uses configured hours per day; overlapping approvals count the union of their intervals, capped at one day per date. Overnight partial windows are supported.
- Available now = opening credit effective to date + earned entitlement − taken − approved future reservations. Negative balances are displayed, not silently clamped.
- Projected 31 December includes the full configured entitlement and all approved leave in the year, assuming no further requests. Pending/rejected/cancelled requests do not consume balance. Requests remain visible in request history.
- The ledger derives from current policy and requests; it is not an immutable accounting journal. Each leave type has its own running balance. Daily credits retain their actual dates.

## Attendance and salary documents

Attendance is filtered by clock-in month in restaurant time. Completed hours exclude rejected sessions and unfinished sessions. Sessions crossing midnight remain under their clock-in month. Existing attendance review, request submission and manager approval flows remain in their original Workforce sections.

Salary totals are stored generated database columns, not client-submitted totals. Employees cannot write payroll or entitlements. A composite employee/restaurant foreign key prevents cross-tenant associations. Payslip employee information is a snapshot so a later department change does not rewrite an issued document. **Print / Save PDF** uses the browser's print dialog and a dedicated salary-slip print stylesheet.

## Validation and release

- `npm run test:contracts`: 281 tests passed, including calculation, service period, payroll parsing, responsive component rendering, missing-punch form and existing app checks.
- `npx tsc --noEmit`, targeted ESLint, and `npm run build`.
- `tests/sql/employee-hr-workspace.sql`: transactional database fixtures rolled back after real authenticated-role tests: own-only employee reads, published-only payslips, manager drafts/team access, cross-tenant read/write denial, no employee edits, composite FK, invalid amounts, generated totals and immutable published slips.
- Security/performance advisors checked after migrations. No new security findings; only expected unused-index informational notices remain for the new empty tables.
- Real mobile/tablet/desktop browser and print QA remains a release check: no browser binary was available in the execution environment. Automated rendering is not screenshot or end-to-end verification.

Backend migrations are deployed independently of Lovable. GitHub merge syncs source to the connected Lovable editor; it does not publish production. The connected Lovable account currently returns `404 project_not_found` for the owning project. Publication requires access through the owning Lovable account. No sample employees, balances or payroll records were committed to the production database; all test fixtures were rolled back.

## Approved October refresh and recurring setup

Workforce navigation now starts with Overview, then My workspace. The request form has a single Send request action and a collapsed optional attachment field (sick-leave attachment remains required). Missing-punch reporting has one shared date, clock-in/out times, a next-day switch, reason and one Send request action; it has no break/session-details controls. Both full session boundaries remain available because approval validates the complete session. Existing attendance validation, historical break records and geofence enforcement remain intact.

Employee details now default to Profile and have only Profile/Permissions navigation. Permission categories expand individually; role reset and activity history are secondary actions. Existing personal account settings remain under Personal details. Profile uses one primary Save setup action for employment/HR settings; personal account changes are saved explicitly within their disclosure.

Authorized workforce managers can open **Team view → employee → More → Salary & leave setup**, or the employee Profile in Team management. Save actual employment details, recurring income/deductions, currency, first payroll month, generation day (1–28), partial-month rule, annual/sick entitlements and opening balances, accrual methods, deduction weekdays and hours per leave day. Automation is opt-in per employee. No statutory deductions, absence penalties or entitlements are guessed.

- Monthly drafts are generated on/after the selected day using restaurant time, and can also be generated explicitly from Team view for a current/past month. The hourly database job runs at minute 17 even when the app is closed. It creates drafts only; payment date and publication require manager review.
- Calendar-day salary proration applies to **all** recurring income and deduction items in a partial employment month only when selected. Full-month mode uses the saved full amounts. Cumulative rounding makes each group's three-decimal total reconcile.
- Daily leave accrual uses the configured annual rate prorated to employment days in that calendar year. Upfront mode grants the full configured amount at the employment/year start. Later years open with zero carryover; opening balances apply only to the first configured policy year. Existing accounts and payslips are never overwritten by repeat generation or setup changes; use the existing account or draft-slip editor for reviewed corrections. Published slips remain immutable.
- **Import employee setup** downloads a CSV template with existing staff IDs and names. Fill actual records in Excel and save CSV UTF-8. Unfilled rows are ignored. Up to 200 completed employee rows may be previewed and imported atomically. Import updates existing authorized employees; it does not create login accounts or rename users. Payroll and leave settings are required in each completed import row. Invalid batches save nothing.
- Pausing payroll/leave automation preserves saved recurring settings and existing records. Employees cannot view recurring setup or salary drafts; they continue to read only their own published slips.

Validation includes authenticated-role database fixtures for atomic batch rollback, tenant/employee isolation, generated totals, partial employment proration, yearly rollover, repeat runs, preserved published slips and the actual scheduler entry point. All fixtures roll back; no sample records remain in production. Browser/device and print QA remain unavailable in this environment and are not implied by the automated rendering checks. Lovable publication remains a separate release step through the owning account.
