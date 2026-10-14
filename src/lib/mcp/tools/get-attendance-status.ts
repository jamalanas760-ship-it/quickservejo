import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { executeMcpRpc } from "../execute";
export default defineTool({
  name: "get_attendance_status",
  title: "Attendance status",
  description:
    "Who is clocked in, verification and scheduled shift status. Requires workforce manager access. / حالة الحضور والتحقق والوردية الحالية.",
  inputSchema: { restaurant_id: z.string().uuid(), language: z.enum(["en", "ar"]).default("en") },
  outputSchema: {
    clocked_in: z.array(
      z.object({
        entry_id: z.string().uuid(),
        staff_id: z.string().uuid(),
        name: z.string(),
        clock_in: z.string(),
        verification: z.unknown().nullable(),
        on_scheduled_shift: z.boolean(),
      }),
    ),
    as_of: z.string(),
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
      "mcp_attendance_status",
      { _restaurant_id: input.restaurant_id },
      input.language,
    ),
});
