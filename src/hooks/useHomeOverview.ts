import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { teamPunchesByStaff } from "@/lib/team-attendance";

/** Small, tenant-scoped operational queries; failures stay independent of other cards. */
export function useHomeOverview(
  restaurantId: string | null,
  canStaff: boolean,
  canInventory: boolean,
) {
  const queryClient = useQueryClient();
  const orders = useQuery({
    queryKey: ["workspace", "home-orders", restaurantId],
    enabled: Boolean(restaurantId),
    refetchInterval: 15_000,
    queryFn: async () => {
      const statuses = ["new", "accepted", "preparing", "ready"] as const;
      const [list, ...counts] = await Promise.all([
        supabase
          .from("orders")
          .select("id,order_number,status,total,table:restaurant_tables(table_number)")
          .eq("restaurant_id", restaurantId!)
          .in("status", statuses)
          .order("created_at", { ascending: false })
          .limit(3),
        ...statuses.map((status) =>
          supabase
            .from("orders")
            .select("id", { count: "exact", head: true })
            .eq("restaurant_id", restaurantId!)
            .eq("status", status),
        ),
      ]);
      for (const result of [list, ...counts]) if (result.error) throw result.error;
      return {
        rows: list.data ?? [],
        new: counts[0].count ?? 0,
        preparing: (counts[1].count ?? 0) + (counts[2].count ?? 0),
        ready: counts[3].count ?? 0,
        total: counts.reduce((sum, result) => sum + (result.count ?? 0), 0),
      };
    },
  });
  const workforce = useQuery({
    queryKey: ["workspace", "home-workforce", restaurantId],
    enabled: Boolean(restaurantId && canStaff),
    refetchInterval: 30_000,
    queryFn: async () => {
      const [staff, clocked, permissions, leaves] = await Promise.all([
        supabase
          .from("staff")
          .select("id")
          .eq("restaurant_id", restaurantId!)
          .eq("is_active", true),
        supabase
          .from("staff_time_entries" as never)
          .select("staff_id,clock_in,clock_out,review_status")
          .eq("restaurant_id", restaurantId!)
          .gte("clock_in", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
        supabase
          .from("staff_permission_requests" as never)
          .select("id", { count: "exact", head: true })
          .eq("restaurant_id", restaurantId!)
          .eq("status", "pending"),
        supabase
          .from("staff_leave_requests" as never)
          .select("id", { count: "exact", head: true })
          .eq("restaurant_id", restaurantId!)
          .eq("status", "pending"),
      ]);
      for (const result of [staff, clocked, permissions, leaves])
        if (result.error) throw result.error;
      const active = new Set((staff.data ?? []).map((row) => row.id));
      const entries = (
        (clocked.data as unknown as {
          staff_id: string;
          clock_in: string;
          clock_out: string | null;
          review_status?: string | null;
        }[]) ?? []
      ).filter((row) => active.has(row.staff_id));
      const present = teamPunchesByStaff(entries, Date.now()).live;
      return {
        total: active.size,
        present: present.size,
        pending: (permissions.count ?? 0) + (leaves.count ?? 0),
      };
    },
  });
  useEffect(() => {
    if (!restaurantId || !canStaff) return;
    const channel = supabase
      .channel(`home-workforce-live:${restaurantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "staff_time_entries",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        () => {
          void queryClient.invalidateQueries({
            queryKey: ["workspace", "home-workforce", restaurantId],
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [restaurantId, canStaff, queryClient]);

  const inventory = useQuery({
    queryKey: ["workspace", "home-inventory", restaurantId],
    enabled: Boolean(restaurantId && canInventory),
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("erp_inventory_balances" as never)
        .select("quantity,reorder_level")
        .eq("restaurant_id", restaurantId!);
      if (error) throw error;
      return ((data as unknown as { quantity: number; reorder_level: number }[]) ?? []).filter(
        (row) => Number(row.quantity) <= Number(row.reorder_level),
      ).length;
    },
  });
  return { orders, workforce, inventory };
}
