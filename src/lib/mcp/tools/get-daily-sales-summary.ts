import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { executeMcpRpc } from "../execute";
export default defineTool({
  name: "get_daily_sales_summary",
  title: "Daily sales summary",
  description:
    "Paid revenue, order count and top-selling items for a restaurant-local date. / المبيعات المدفوعة وعدد الطلبات والأصناف الأكثر مبيعاً.",
  inputSchema: {
    restaurant_id: z.string().uuid(),
    language: z.enum(["en", "ar"]).default("en"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  },
  outputSchema: {
    date: z.string(),
    timezone: z.string(),
    currency: z.string(),
    revenue: z.number(),
    order_count: z.number(),
    top_selling_items: z.array(
      z.object({
        menu_item_id: z.string().uuid().nullable(),
        name_en: z.string().nullable(),
        name_ar: z.string().nullable(),
        quantity: z.number(),
        revenue: z.number(),
      }),
    ),
    basis: z.string(),
  },
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    destructiveHint: false,
    openWorldHint: false,
  },
  handler: (input, ctx) =>
    executeMcpRpc(
      ctx,
      "mcp_daily_sales_summary",
      { _restaurant_id: input.restaurant_id, _date: input.date },
      input.language,
    ),
});
