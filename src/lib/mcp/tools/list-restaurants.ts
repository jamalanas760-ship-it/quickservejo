import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "list_restaurants",
  title: "List restaurants",
  description:
    "List the restaurants the signed-in user can access, with slug, activity status and contact details.",
  inputSchema: {
    include_archived: z.boolean().optional().describe("Include archived restaurants."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ include_archived }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("restaurants")
      .select("id, name, slug, is_active, archived_at, currency, phone, email")
      .order("name");
    if (!include_archived) query = query.is("archived_at", null);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { restaurants: data ?? [] },
    };
  },
});
