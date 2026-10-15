# Geofenced attendance and MCP

Restaurant settings store `latitude`, `longitude`, and `geofence_radius_meters` (50–300m, default 100). Clear both coordinates to leave geofencing unconfigured. Current Location requests a one-time browser GPS fix; nothing continuously tracks staff.

Each punch requests a fresh high-accuracy fix with a 10-second timeout. Clock-in and clock-out are blocked outside the configured radius and when GPS is unavailable, denied, inaccurate or stale. An unset attendance location also blocks punches until a manager configures it. Accuracy must be finite, non-negative and no worse than the configured radius. The UI watches the current location while visible, rejects fixes older than 30 seconds and captures a new fix at punch time. The server recomputes the distance and rejects any status except on-premise before changing attendance. The older coordinate-free punch RPCs are not executable by authenticated clients. Haversine distance uses a 6,371,000m Earth radius; within-radius includes the boundary. The server recomputes distance and stores separate `clock_in_location` and `clock_out_location` JSON snapshots, including coordinates, accuracy, radius, reason and verification time. Retries preserve the original snapshot. Existing punches remain without verification; they are never retroactively marked on-premise. Review badges appear in workforce timesheets and entry detail. GPS is device-reported evidence, not proof against location spoofing.

`clock_staff_geofenced` forwards to a private, authenticated helper which resolves the caller's active staff profile in the requested tenant and reuses the existing locked clock operations. It never accepts a caller-selected staff ID or verification status. Existing RLS and manager review remain intact.

MCP tools accept an authenticated OAuth bearer token; no service-role client is used. Every tool accepts a restaurant UUID and optional EN/AR response language. Booking/sales dates use the restaurant timezone. Inputs and structured outputs have Zod schemas. Server RPCs separately enforce capabilities and tenant predicates:

- `get_table_availability`: date, HH:mm local time, party_size 1–100, duration 15–480 minutes (default 90); uses existing overlapping-booking availability logic.
- `create_reservation`: same inputs plus guest_name, optional phone/email/table_id/notes; creates a confirmed booking through the existing booking RPC. Mutating and not idempotent: check a booking result before retrying an uncertain network response. MCP creations serialize per restaurant.
- `get_daily_sales_summary`: paid, non-cancelled order totals and top 10 items by quantity; assigns sales to local day by paid_at, with created_at fallback for legacy orders. Half-open local-midnight bounds preserve DST. Item revenue is line total; order revenue includes the order's total adjustments.
- `get_attendance_status`: current open, non-rejected punches less than 24 hours old, active staff, verification and whether a current shift assignment exists; requires workforce management access. Raw location is returned only to authorized managers.

Migration: `20261014153345_geofenced_attendance_mcp.sql`. Database integration checks: run `supabase/tests/geofence_mcp.sql` after migration; synthetic users, tenants, punches, bookings and sales are transactionally rolled back. No production attendance/booking fixture remains. Browser GPS requires HTTPS or localhost and OS location permissions. Supabase schema deployment and web/MCP runtime deployment are separate steps.

## Location Studio UI

Open **All Tools → Connect → MCP & AI** for the highlighted MCP card and setup panel. Its URL is the current website origin plus `/mcp`, matching the SDK-generated route. Open the published site before copying a stable URL. Setup guide explains custom MCP configuration and OAuth. Tool tiles open reservations, new reservation, tenant analytics and workforce attendance; external AI clients invoke the registered MCP tools. No client secrets or service credentials are displayed.

**Organization Settings → GPS attendance** provides the approved Location Studio layout: illustrative SVG geofence, live radius label and slider, coordinates, Current Location, example review legend and Save settings. The preview is schematic, not a real map or proof of a location fix. GPS saving still uses the existing organization settings form and permissions.

URL copying is independent of OAuth readiness: a valid displayed MCP URL can always be copied even while connection discovery is unavailable. Copying a URL does not establish a successful AI connection.
