# Public order updates and responsive editors

Public order tracking subscribes to Supabase Broadcast over WebSocket. Order
updates and deletion produce only `{ "refresh": true }` invalidations. The topic
is `order-status:` plus SHA-256 of `quickserve:order:` and the existing public
receipt token. The token is a bearer capability already used by the receipt URL;
its high-entropy digest is used to route anonymous guest notifications. This is a
public capability topic, not an authenticated/private channel. Do not log or expose
receipt tokens or topics in analytics. No order/customer payload or raw token is
broadcast. Receiving an event never changes receipt state directly: the existing
token-checked receipt RPC remains authoritative, including for spoofed events.

The trigger is in the non-exposed app schema, with a fixed empty search path and
no PUBLIC/anon/authenticated execute grant. No order-table SELECT grants or RLS
policies are added. Trigger delivery failures do not abort kitchen/payment writes.
Unrelated row updates do not broadcast, and token rotation invalidates both topics.
Frontend refreshes are coalesced across bursts. Connecting/reconnecting refreshes
the receipt to close the initial-subscription race. Healthy connections retain a
30-second reconciliation; disconnected/unsupported sockets retain the original
8-second automatic refresh. Channels and pending refreshes are cleaned up when
the route changes. The live migration is `20261102123348_public_order_realtime_hints`.

The Order sent confirmation has a scoped viewport-centered layout and explicit
44px action controls with a 10px gap. Phone actions stack with Track order first;
wider dialogs place Close before Track order. Very short screens can scroll the
dialog content. Other dialogs retain their positioning.

Tables uses an inline Elements library at desktop/tablet widths (768px and up).
Smaller desktop workspaces show the library across the top of the floor workspace.
Phones use a dedicated three-dot tools popup with Elements, Add zone, Add floor
and Add entrance first; choosing Elements opens the mobile library dialog. The
popup closes before the next editor opens, and mobile dialogs close when resizing
to desktop. The row/column alignment menu commands were removed; grid arrangement
and its collision checks remain available.

Validation includes client hash agreement, subscription/reconnection/cleanup,
coalesced events, isolated PostgreSQL trigger and ACL tests, outage tolerance,
production builds and browser layout/interaction fixtures. These checks do not
certify live concurrent-user capacity.

The live trigger was installed and verified. A synthetic, non-customer topic was
subscribed over the production WebSocket and received a database-sent refresh
hint end to end. No customer order was changed for this test. Security advisor
categories/counts were unchanged after deployment. Frontend validation passed the
production build, TypeScript, 384 contract tests, and 19 isolated database tests
with one native-PostgreSQL case skipped. Browser fixtures checked desktop/mobile
menus, resize behavior, centered confirmations and action spacing, plus 576
collapsed/expanded sidebar layout combinations.
