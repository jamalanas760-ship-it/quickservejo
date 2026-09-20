import { createFileRoute } from "@tanstack/react-router";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticateApiRequest, isResponse, json } from "@/lib/api.server";

export const Route = createFileRoute("/api/v1/menu")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const principal = await authenticateApiRequest(request, "menu:read");
        if (isResponse(principal)) return principal;

        const [restaurantRes, categoriesRes, itemsRes] = await Promise.all([
          supabaseAdmin.from("restaurants").select("id,name,slug,currency,is_active,updated_at").eq("id", principal.restaurantId).maybeSingle(),
          supabaseAdmin.from("menu_categories").select("id,name_en,name_ar,description_en,description_ar,display_order,is_active,updated_at").eq("restaurant_id", principal.restaurantId).order("display_order"),
          supabaseAdmin.from("menu_items").select("id,category_id,name_en,name_ar,description_en,description_ar,price,compare_at_price,image_url,is_available,is_featured,display_order,preparation_time,kitchen_station_id,updated_at").eq("restaurant_id", principal.restaurantId).order("display_order"),
        ]);
        if (restaurantRes.error || categoriesRes.error || itemsRes.error) return json({ error: "upstream_error" }, { status: 500 });

        return json({
          restaurant: restaurantRes.data,
          categories: categoriesRes.data ?? [],
          items: itemsRes.data ?? [],
        });
      },
    },
  },
});
