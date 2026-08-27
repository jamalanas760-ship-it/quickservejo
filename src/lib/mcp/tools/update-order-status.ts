import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "update_order_status",
  title: "Update order status",
  description:
    "Move an order to a new status. Cancelling requires a reason code that is stored on the order.",
  inputSchema: {
    order_id: z.string().uuid().describe("Order id from list_orders."),
    status: z
      .enum(["pending", "confirmed", "preparing", "ready", "served", "completed", "cancelled"])
      .describe("New order status."),
    cancellation_reason: z
      .string()
      .max(60)
      .optional()
      .describe("Reason code, required when status is cancelled."),
    cancellation_note: z.string().max(300).optional().describe("Optional cancellation detail."),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  handler: async ({ order_id, status, cancellation_reason, cancellation_note }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    if (status === "cancelled" && !cancellation_reason) {
      return {
        content: [{ type: "text", text: "cancellation_reason is required to cancel an order." }],
        isError: true,
      };
    }
    const supabase = supabaseForUser(ctx);
    const patch: Record<string, unknown> = { status };
    if (status === "cancelled") {
      patch['cancellation_reason'] = cancellation_reason;
      if (cancellation_note) patch['cancellation_note'] = cancellation_note;
    }
    const { data, error } = await supabase
      .from("orders")
      .update(patch)
      .eq("id", order_id)
      .select("id, order_number, status, cancellation_reason, updated_at");
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data || data.length === 0) {
      return {
        content: [{ type: "text", text: "No order updated — check the id and your access." }],
        isError: true,
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data[0], null, 2) }],
      structuredContent: { order: data[0] },
    };
  },
});
