import { auth, defineMcp, type AnyToolDefinition } from "@lovable.dev/mcp-js";

import listRestaurants from "./tools/list-restaurants";
import listMenuItems from "./tools/list-menu-items";
import setItemAvailability from "./tools/set-item-availability";
import listOrders from "./tools/list-orders";
import updateOrderStatus from "./tools/update-order-status";

// The OAuth issuer must be the direct Supabase host; the project ref is the only
// value that survives publish unchanged.
const projectRef = import.meta.env['VITE_SUPABASE_PROJECT_ID'] ?? "project-ref-unset";

export default defineMcp({
  name: "quickserve",
  title: "QuickServe",
  version: "0.1.0",
  instructions:
    "Tools for QuickServe, a multi-tenant QR restaurant ordering platform. Start with `list_restaurants` to get a restaurant id, then use `list_menu_items` / `set_item_availability` for the menu and `list_orders` / `update_order_status` for service. All access is scoped to the signed-in user's restaurants.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listRestaurants, listMenuItems, setItemAvailability, listOrders, updateOrderStatus],
});
