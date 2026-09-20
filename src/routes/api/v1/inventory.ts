import { createFileRoute } from "@tanstack/react-router";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticateApiRequest, isResponse, json, parseLimit } from "@/lib/api.server";

export const Route = createFileRoute("/api/v1/inventory")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const principal = await authenticateApiRequest(request, "inventory:read");
        if (isResponse(principal)) return principal;
        const limit = parseLimit(request, 200, 1000);
        const { data, error } = await (supabaseAdmin as any)
          .from("erp_inventory_balances")
          .select("id,restaurant_id,name,unit,reorder_level,quantity")
          .eq("restaurant_id", principal.restaurantId)
          .order("name")
          .limit(limit);
        if (error) return json({ error: "upstream_error" }, { status: 500 });
        return json({ data: data ?? [], limit });
      },
    },
  },
});
