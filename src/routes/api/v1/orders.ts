import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticateApiRequest, isResponse, json, parseLimit } from "@/lib/api.server";

const updateSchema = z.object({
  order_id: z.string().uuid(),
  status: z.enum(["accepted","preparing","ready","served"]),
});

const nextStatus: Record<string, string> = {
  new: "accepted",
  accepted: "preparing",
  preparing: "ready",
  ready: "served",
};

export const Route = createFileRoute("/api/v1/orders")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const principal = await authenticateApiRequest(request, "orders:read");
        if (isResponse(principal)) return principal;
        const limit = parseLimit(request, 100, 500);
        const url = new URL(request.url);
        const status = url.searchParams.get("status");

        let query = supabaseAdmin
          .from("orders")
          .select("id,order_number,status,payment_status,fulfillment_type,table_id,guest_name,subtotal,tax_amount,service_amount,delivery_amount,discount_amount,tip_amount,total,currency,created_at,updated_at")
          .eq("restaurant_id", principal.restaurantId)
          .order("created_at", { ascending: false })
          .limit(limit);
        if (status) query = query.eq("status", status as any);
        const { data, error } = await query;
        if (error) return json({ error: "upstream_error" }, { status: 500 });
        return json({ data: data ?? [], limit });
      },

      POST: async ({ request }) => {
        const principal = await authenticateApiRequest(request, "orders:write");
        if (isResponse(principal)) return principal;

        let input: z.infer<typeof updateSchema>;
        try {
          input = updateSchema.parse(await request.json());
        } catch {
          return json({ error: "invalid_request" }, { status: 400 });
        }

        const current = await supabaseAdmin
          .from("orders")
          .select("id,status,restaurant_id")
          .eq("id", input.order_id)
          .eq("restaurant_id", principal.restaurantId)
          .maybeSingle();
        if (current.error) return json({ error: "upstream_error" }, { status: 500 });
        if (!current.data) return json({ error: "order_not_found" }, { status: 404 });
        if (nextStatus[current.data.status] !== input.status) {
          return json({ error: "invalid_status_transition", current: current.data.status, allowed: nextStatus[current.data.status] ?? null }, { status: 409 });
        }

        const { data, error } = await supabaseAdmin
          .from("orders")
          .update({ status: input.status, updated_at: new Date().toISOString() })
          .eq("id", input.order_id)
          .eq("restaurant_id", principal.restaurantId)
          .select("id,order_number,status,updated_at")
          .single();
        if (error) return json({ error: "upstream_error" }, { status: 500 });
        return json({ data });
      },
    },
  },
});
