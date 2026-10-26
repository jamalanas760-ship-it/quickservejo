import type { SupabaseClient } from "@supabase/supabase-js";
import { requireRestaurantAccess, RESTAURANT_ADMIN_ROLES } from "@/lib/server/restaurant-access.server";
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


export const testIntegrationRuntime = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => providerSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRestaurantAccess(context, data.restaurantId, RESTAURANT_ADMIN_ROLES);
    if (data.provider === "aggregator" || data.provider === "accounting") {
      const {data:connection,error} = await (context.supabase as unknown as SupabaseClient).from("integration_connections")
        .select("status,last_sync_at").eq("restaurant_id",data.restaurantId)
        .eq("category",data.provider === "aggregator" ? "delivery" : "accounting").order("created_at").limit(1).maybeSingle().overrideTypes<{status:string;last_sync_at:string|null},{merge:false}>();
      if (error) throw error;
      const healthy = connection?.status === "healthy" && Boolean(connection.last_sync_at);
      return {configured:healthy,healthy,secretName:null,detail:healthy ? "The restaurant connector has acknowledged a delivery." : "This connector needs operator approval and an acknowledged delivery in the worker runtime."};
    }
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
