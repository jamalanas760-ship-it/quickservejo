import { quickServeSupabase } from "@/integrations/supabase/public-config";
import getTableAvailability from "./tools/get-table-availability";
import createReservation from "./tools/create-reservation";
import getDailySalesSummary from "./tools/get-daily-sales-summary";
import getAttendanceStatus from "./tools/get-attendance-status";
import { auth, defineMcp } from "@lovable.dev/mcp-js";

import listRestaurants from "./tools/list-restaurants";
import listMenuItems from "./tools/list-menu-items";
import setItemAvailability from "./tools/set-item-availability";
import listOrders from "./tools/list-orders";
import updateOrderStatus from "./tools/update-order-status";

// Keep OAuth verification on the same published Supabase project as browser sign-in.
const supabaseUrl = quickServeSupabase.url.replace(/\/+$/, "");

export default defineMcp({
  name: "quickserve",
  title: "QuickServe",
  version: "0.2.0",
  instructions:
    "Tools for QuickServe, a multi-tenant QR restaurant ordering platform. Start with `list_restaurants` to get a restaurant id, then use `list_menu_items` / `set_item_availability` for the menu and `list_orders` / `update_order_status` for service. Use get_table_availability and create_reservation for bookings, get_daily_sales_summary for paid sales, and get_attendance_status for workforce. Dates and times use the restaurant timezone. All access is scoped to the signed-in user's restaurants.",
  auth: auth.oauth.issuer({
    issuer: `${supabaseUrl}/auth/v1`,
    jwksUri: `${supabaseUrl}/auth/v1/.well-known/jwks.json`,
    acceptedAudiences: "authenticated",
  }),
  // `as never`: the SDK's tool type requires outputSchema under
  // exactOptionalPropertyTypes; these tools return structuredContent instead.
  tools: [
    listRestaurants,
    listMenuItems,
    setItemAvailability,
    listOrders,
    updateOrderStatus,
    getTableAvailability,
    createReservation,
    getDailySalesSummary,
    getAttendanceStatus,
  ] as never,
});
