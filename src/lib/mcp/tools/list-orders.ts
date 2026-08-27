import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "list_orders",
  title: "List orders",
  description:
    "List recent orders for one restaurant, optionally filtered by status, newest first.",
  inputSchema: {
    restaurant_id: z.string().uuid().describe("Restaurant id from list_restaurants."),
    status: z
      .enum(["pending", "confirmed", "preparing", "ready", "served", "completed", "cancelled"])
      .optional()
      .describe("Filter by order status."),
    limit: z.number().int().min(1).max(100).optional().describe("Maximum rows (default 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ restaurant_id, status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("orders")
      .select(
        "id, order_number, status, payment_status, total, currency, table_id, created_at, updated_at, cancellation_reason, order_items(quantity, unit_price, notes, menu_item_id)",
      )
      .eq("restaurant_id", restaurant_id)
      .order("created_at", { ascending: false })
      .limit(limit ?? 20);
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { orders: data ?? [] },
    };
  },
});
