import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "set_item_availability",
  title: "Set menu item availability",
  description:
    "Mark a menu item available or sold out, optionally until a given time, with an optional note.",
  inputSchema: {
    item_id: z.string().uuid().describe("Menu item id."),
    is_available: z.boolean().describe("True to make the item orderable, false to mark it sold out."),
    sold_out_until: z
      .string()
      .optional()
      .describe("ISO timestamp when the item becomes available again."),
    sold_out_note: z.string().max(200).optional().describe("Short reason shown to staff."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ item_id, is_available, sold_out_until, sold_out_note }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("menu_items")
      .update({
        is_available,
        sold_out_until: is_available ? null : (sold_out_until ?? null),
        sold_out_note: is_available ? null : (sold_out_note ?? null),
      })
      .eq("id", item_id)
      .select("id, name_en, is_available, sold_out_until, sold_out_note");
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data || data.length === 0) {
      return {
        content: [{ type: "text", text: "No menu item updated — check the id and your access." }],
        isError: true,
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data[0], null, 2) }],
      structuredContent: { item: data[0] },
    };
  },
});
