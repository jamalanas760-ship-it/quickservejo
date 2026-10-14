import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { executeMcpRpc } from "../execute";
export default defineTool({
  name: "get_table_availability",
  title: "Get table availability",
  description:
    "Available tables for a date and local restaurant time. / الطاولات المتاحة حسب التاريخ والتوقيت المحلي.",
  inputSchema: {
    restaurant_id: z.string().uuid(),
    language: z.enum(["en", "ar"]).default("en"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    party_size: z.number().int().min(1).max(100),
    duration_minutes: z.number().int().min(15).max(480).default(90),
  },
  outputSchema: {
    tables: z.array(
      z.object({
        id: z.string().uuid(),
        table_number: z.string(),
        table_name: z.string().nullable(),
        zone: z.string().nullable(),
        capacity: z.number(),
      }),
    ),
    booking_at: z.string(),
    timezone: z.string(),
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
      "mcp_table_availability",
      {
        _restaurant_id: input.restaurant_id,
        _date: input.date,
        _time: input.time,
        _party_size: input.party_size,
        _duration_minutes: input.duration_minutes,
      },
      input.language,
    ),
});
