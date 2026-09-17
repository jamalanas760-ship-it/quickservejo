import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceReport } from "@/hooks/useWorkspace";

export type OperationalCounters = {
  tasks: number;
  shifts: number;
  orders: number;
  unread: number;
  total: number;
};

const EMPTY: OperationalCounters = { tasks: 0, shifts: 0, orders: 0, unread: 0, total: 0 };

/**
 * One lightweight source of truth for navigation/header badges.
 * RLS keeps each role scoped to only the rows it is allowed to see.
 */
export function useOperationalCounters(restaurantId: string | null) {
  const qc = useQueryClient();
  const report = useWorkspaceReport(restaurantId);
  const key = ["operational-counters", restaurantId] as const;

  const query = useQuery({
    queryKey: key,
    enabled: Boolean(restaurantId),
    staleTime: 8_000,
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const day = today.toLocaleDateString("en-CA");
      const nextDay = tomorrow.toLocaleDateString("en-CA");
      const client = supabase as any;
      const [notifications, tasks, shifts] = await Promise.all([
        client.from("in_app_notifications").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).is("read_at", null),
        client.from("work_tasks").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).in("status", ["open", "in_progress", "waiting_approval"]),
        client.from("shifts").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).in("status", ["planned", "open"]).gte("shift_date", day).lte("shift_date", nextDay),
      ]);
      for (const result of [notifications, tasks, shifts]) if (result.error) throw result.error;
      return {
        unread: Number(notifications.count ?? 0),
        tasks: Number(tasks.count ?? 0),
        shifts: Number(shifts.count ?? 0),
      };
    },
  });

  useEffect(() => {
    if (!restaurantId) return;
    const invalidate = () => void qc.invalidateQueries({ queryKey: key });
    const channel = supabase
      .channel(`ops-counts:${restaurantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "in_app_notifications", filter: `restaurant_id=eq.${restaurantId}` }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "work_tasks", filter: `restaurant_id=eq.${restaurantId}` }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "shifts", filter: `restaurant_id=eq.${restaurantId}` }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` }, () => {
        invalidate();
        void qc.invalidateQueries({ queryKey: ["workspace-report", restaurantId] });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [qc, restaurantId]);

  const orders = report.data?.openOrders ?? 0;
  const data = query.data;
  const value: OperationalCounters = data ? {
    tasks: data.tasks,
    shifts: data.shifts,
    unread: data.unread,
    orders,
    total: data.tasks + data.shifts + data.unread + orders,
  } : { ...EMPTY, orders, total: orders };

  return { ...query, data: value };
}
