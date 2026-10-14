import type { ToolContext } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "./supabase";
export async function executeMcpRpc(
  ctx: ToolContext,
  rpc: string,
  args: Record<string, unknown>,
  language: "en" | "ar" = "en",
) {
  try {
    if (!ctx.isAuthenticated())
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text:
              language === "ar"
                ? "يرجى الاتصال وتسجيل الدخول أولاً."
                : "Connect and sign in first.",
          },
        ],
      };
    const { data, error } = await supabaseForUser(ctx).rpc(rpc, args);
    if (error) {
      const denied = error.code === "42501";
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text:
              language === "ar"
                ? denied
                  ? "غير مصرح لك بالوصول إلى هذا المطعم."
                  : "تعذر تنفيذ الطلب. تحقق من المدخلات والتوفر ثم أعد المحاولة."
                : denied
                  ? "You do not have access to this restaurant."
                  : "Request failed. Check the inputs and availability, then retry.",
          },
        ],
      };
    }
    if (!data || typeof data !== "object") throw new Error("Invalid response");
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data) }],
      structuredContent: data as Record<string, unknown>,
    };
  } catch {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text:
            language === "ar"
              ? "الخدمة غير متاحة حالياً. أعد المحاولة لاحقاً."
              : "Service unavailable. Retry later.",
        },
      ],
    };
  }
}
