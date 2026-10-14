import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { executeMcpRpc } from "../execute";
export default defineTool({
  name: "create_reservation",
  title: "Create reservation",
  description:
    "Create a confirmed booking after checking access and table availability. / إنشاء حجز مؤكد بعد التحقق من الصلاحية والتوفر.",
  inputSchema: {
    restaurant_id: z.string().uuid(),
    language: z.enum(["en", "ar"]).default("en"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    party_size: z.number().int().min(1).max(100),
    duration_minutes: z.number().int().min(15).max(480).default(90),
    guest_name: z.string().trim().min(1).max(120),
    phone: z.string().max(40).optional(),
    email: z.string().email().max(254).optional(),
    table_id: z.string().uuid().optional(),
    notes: z.string().max(1000).optional(),
  },
  outputSchema: {
    reservation_id: z.string().uuid(),
    status: z.literal("confirmed"),
    booking_at: z.string(),
    timezone: z.string(),
  },
  annotations: {
    readOnlyHint: false,
    idempotentHint: false,
    destructiveHint: false,
    openWorldHint: false,
  },
  handler: (input, ctx) =>
    executeMcpRpc(
      ctx,
      "mcp_create_reservation",
      {
        _restaurant_id: input.restaurant_id,
        _date: input.date,
        _time: input.time,
        _party_size: input.party_size,
        _duration_minutes: input.duration_minutes,
        _customer_name: input.guest_name,
        _phone: input.phone ?? null,
        _email: input.email ?? null,
        _table_id: input.table_id ?? null,
        _notes: input.notes ?? null,
      },
      input.language,
    ),
});
