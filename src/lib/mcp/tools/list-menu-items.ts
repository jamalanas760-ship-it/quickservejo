import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "list_menu_items",
  title: "List menu items",
  description:
    "List menu items for one restaurant, including price, availability and sold-out state.",
  inputSchema: {
    restaurant_id: z.string().uuid().describe("Restaurant id from list_restaurants."),
    only_unavailable: z.boolean().optional().describe("Return only items marked unavailable."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ restaurant_id, only_unavailable }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("menu_items")
      .select(
        "id, name_en, name_ar, price, is_available, is_featured, sold_out_until, sold_out_note, category_id, preparation_time",
      )
      .eq("restaurant_id", restaurant_id)
      .order("display_order");
    if (only_unavailable) query = query.eq("is_available", false);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { items: data ?? [] },
    };
  },
});
