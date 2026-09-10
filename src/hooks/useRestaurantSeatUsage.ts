import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export function useRestaurantSeatUsage(restaurantId: string) {
  return useQuery({
    queryKey: ["seats", restaurantId],
    staleTime: 30_000,
    queryFn: async () => {
      const [limitRes, usedRes] = await Promise.all([
        supabase.from("restaurants").select("seat_limit").eq("id", restaurantId).maybeSingle(),
        supabase
          .from("staff")
          .select("id", { count: "exact", head: true })
          .eq("restaurant_id", restaurantId)
          .eq("is_active", true),
      ]);
      if (limitRes.error) throw limitRes.error;
      if (usedRes.error) throw usedRes.error;
      return {
        limit: (limitRes.data?.seat_limit ?? null) as number | null,
        used: usedRes.count ?? 0,
      };
    },
  });
}
