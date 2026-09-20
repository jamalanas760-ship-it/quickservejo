import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const providerSchema = z.object({
  restaurantId: z.string().uuid(),
  provider: z.enum(["stripe","mena_gateway","twilio","aggregator","accounting","browser","webhooks","bi"]),
});

const PROVIDER_SECRET: Record<z.infer<typeof providerSchema>["provider"], string | null> = {
  stripe: "STRIPE_SECRET_KEY",
  mena_gateway: "QUICKSERVE_PAYMENT_SECRET",
  twilio: "TWILIO_AUTH_TOKEN",
  aggregator: "DELIVERY_PROVIDER_SECRET",
  accounting: "ACCOUNTING_PROVIDER_SECRET",
  browser: null,
  webhooks: "QUICKSERVE_WEBHOOK_SECRET",
  bi: "BI_PROVIDER_SECRET",
};

async function authorize(context: { supabase: any; userId: string }, restaurantId: string) {
  const owner = await context.supabase.rpc("is_platform_owner");
  if (owner.error) throw owner.error;
  if (owner.data) return;
  const { data, error } = await context.supabase
    .from("staff")
    .select("role")
    .eq("restaurant_id", restaurantId)
    .eq("auth_user_id", context.userId)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.role !== "restaurant_admin") throw new Error("Forbidden");
}

export const testIntegrationRuntime = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => providerSchema.parse(input))
  .handler(async ({ data, context }) => {
    await authorize(context, data.restaurantId);
    const secretName = PROVIDER_SECRET[data.provider];
    if (!secretName) return { configured: true, healthy: true, secretName: null, detail: "Browser-native provider is available." };
    const configured = Boolean(process.env[secretName]?.trim());
    return {
      configured,
      healthy: configured,
      secretName,
      detail: configured
        ? `${secretName} is configured on the server runtime.`
        : `${secretName} is not configured on the server runtime.`,
    };
  });
