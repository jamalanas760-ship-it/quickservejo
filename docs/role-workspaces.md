# Approved role workspaces

The kitchen uses the approved white service board and dark compact navigation rail. New, Preparing and Ready lanes group the existing database states: accepted tickets remain in Preparing with a Start preparing action. A ticket can be advanced using its button or a pointer drag handle. Kitchen users do not mark orders served. Ready tickets wait for waiter pickup.

Waiters receive an attention-first table list, service calls, ready orders and a responsive detail panel. Their table route renders this list rather than the floor editor. A database trigger also blocks waiter table structure changes while allowing service status updates. Organization and appearance is restricted to users with the restaurant management capability.

Cashiers receive an unpaid bill strip, receipt and payment workspace, with split and provider controls disclosed when needed. Cash tendered and change are calculated against the outstanding balance including the entered tip. Existing payment, refund, cash session and provider operations are retained.

Hosts receive today's arrivals and a seating assistant. Table choices respect capacity, current service state, open orders and bookings. The seating RPC checks authorization and tenant scope and locks the reservation and table before updating the booking and audit log. Dragging selects a table; the Seat party button confirms the operation.

Finance uses a ledger with source review underneath it. Inventory uses a stock list with a selected item movement timeline and receive/issue controls. These layouts use existing ERP records. Bank reconciliation, inventory lots/expiry, barcode scanning and count approval workflows from the concept images are not included in this implementation.

Service pages subscribe to tenant-filtered changes and invalidate related order, payment, table and booking queries. A 15-second poll and reconnect/online refresh cover missed events. The live indicator only reports a successful subscription. The order administration page also refreshes when kitchen state changes. ERP views poll their existing records.

The avatar catalog contains 32 distinct male/female crops from the approved sheets. Existing avatar identifiers retain fallback resolution.

## Validation

- TypeScript compilation, production build and all 192 contract tests passed.
- Browser checks use isolated synthetic Supabase HTTP fixtures for Kitchen, Waiter, Cashier, Host, Finance and Inventory at 1440×1000, 1024×900 and 390×844. Dark desktop views are checked through the application's theme preference API. No live payment or customer records are changed by these checks.
- Interaction checks cover kitchen acceptance and pointer drag to Ready, absence of kitchen serving, ticket worklogs, cashier change calculation, host capacity restrictions and confirmed seating, and hidden organization/appearance controls for the six operational roles.
- The host seating and waiter structure SQL regression scripts execute inside transactions and roll back. Checks cover capacity, unavailable tables, tenant boundaries, duplicate seating, synchronized table state, and rejected waiter layout/delete operations.
- The three additive migrations are applied to the configured Supabase project. Real multi-device Realtime delivery and payment-provider settlement still require a signed-in staging session; fixture browser checks do not establish those outcomes.
