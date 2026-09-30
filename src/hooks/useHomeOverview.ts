import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Small, tenant-scoped operational queries; failures stay independent of other cards. */
export function useHomeOverview(restaurantId: string | null, canStaff: boolean, canInventory: boolean) {
  const orders = useQuery({
    queryKey: ["workspace", "home-orders", restaurantId], enabled: Boolean(restaurantId), refetchInterval: 15_000,
    queryFn: async () => {
      const statuses = ["new", "accepted", "preparing", "ready"] as const;
      const [list, ...counts] = await Promise.all([
        supabase.from("orders").select("id,order_number,status,total,table:restaurant_tables(table_number)")
          .eq("restaurant_id", restaurantId!).in("status", statuses).order("created_at", { ascending: false }).limit(3),
        ...statuses.map(status => supabase.from("orders").select("id", { count: "exact", head: true })
          .eq("restaurant_id", restaurantId!).eq("status", status)),
      ]);
      for (const result of [list, ...counts]) if (result.error) throw result.error;
      return { rows: list.data ?? [], new: counts[0].count ?? 0, preparing: (counts[1].count ?? 0) + (counts[2].count ?? 0), ready: counts[3].count ?? 0,
        total: counts.reduce((sum, result) => sum + (result.count ?? 0), 0) };
    },
  });
  const workforce = useQuery({
    queryKey: ["workspace", "home-workforce", restaurantId], enabled: Boolean(restaurantId && canStaff), refetchInterval: 30_000,
    queryFn: async () => {
      const [staff, clocked, permissions, leaves] = await Promise.all([
        supabase.from("staff").select("id").eq("restaurant_id", restaurantId!).eq("is_active", true),
        supabase.from("staff_time_entries" as never).select("staff_id").eq("restaurant_id", restaurantId!).is("clock_out", null),
        supabase.from("staff_permission_requests" as never).select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId!).eq("status", "pending"),
        supabase.from("staff_leave_requests" as never).select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId!).eq("status", "pending"),
      ]);
      for (const result of [staff, clocked, permissions, leaves]) if (result.error) throw result.error;
      const active = new Set((staff.data ?? []).map(row => row.id));
      const present = new Set((clocked.data as unknown as { staff_id: string }[] ?? []).filter(row => active.has(row.staff_id)).map(row => row.staff_id));
      return { total: active.size, present: present.size, pending: (permissions.count ?? 0) + (leaves.count ?? 0) };
    },
  });
  const inventory = useQuery({
    queryKey: ["workspace", "home-inventory", restaurantId], enabled: Boolean(restaurantId && canInventory), refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("erp_inventory_balances" as never).select("quantity,reorder_level").eq("restaurant_id", restaurantId!);
      if (error) throw error;
      return (data as unknown as { quantity: number; reorder_level: number }[] ?? []).filter(row => Number(row.quantity) <= Number(row.reorder_level)).length;
    },
  });
  return { orders, workforce, inventory };
}
