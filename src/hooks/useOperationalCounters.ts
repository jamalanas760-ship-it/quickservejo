import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type OperationalCounters = {
  tasks: number;
  shifts: number;
  orders: number;
  unread: number;
  total: number;
};

const EMPTY: OperationalCounters = { tasks: 0, shifts: 0, orders: 0, unread: 0, total: 0 };

/**
 * Fail-safe navigation/header counters.
 *
 * The authenticated shell must never crash because one operational table is
 * unavailable, membership is still resolving, Realtime disconnects, or a
 * role cannot read a row. RLS remains the source of truth for what the current
 * account may count.
 */
export function useOperationalCounters(restaurantId: string | null) {
  const qc = useQueryClient();
  const key = ["operational-counters", restaurantId] as const;

  const query = useQuery<OperationalCounters>({
    queryKey: key,
    enabled: Boolean(restaurantId),
    staleTime: 8_000,
    refetchInterval: restaurantId ? 20_000 : false,
    refetchOnWindowFocus: true,
    retry: false,
    placeholderData: EMPTY,
    queryFn: async () => {
      if (!restaurantId) return EMPTY;
      const client = supabase as any;
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const day = today.toLocaleDateString("en-CA");
      const nextDay = tomorrow.toLocaleDateString("en-CA");

      async function safeCount(builder: any) {
        try {
          const result = await builder;
          if (result?.error) {
            console.warn("Operational counter skipped:", result.error.message ?? result.error);
            return 0;
          }
          return Number(result?.count ?? 0);
        } catch (error) {
          console.warn("Operational counter unavailable:", error);
          return 0;
        }
      }

      const [unread, tasks, shifts, orders] = await Promise.all([
        safeCount(
          client
            .from("in_app_notifications")
            .select("id", { count: "exact", head: true })
            .eq("restaurant_id", restaurantId)
            .is("read_at", null),
        ),
        safeCount(
          client
            .from("work_tasks")
            .select("id", { count: "exact", head: true })
            .eq("restaurant_id", restaurantId)
            .is("deleted_at", null)
            .in("status", ["open", "in_progress", "waiting_approval"]),
        ),
        safeCount(
          client
            .from("shifts")
            .select("id", { count: "exact", head: true })
            .eq("restaurant_id", restaurantId)
            .is("deleted_at", null)
            .in("status", ["planned", "open"])
            .gte("shift_date", day)
            .lte("shift_date", nextDay),
        ),
        safeCount(
          client
            .from("orders")
            .select("id", { count: "exact", head: true })
            .eq("restaurant_id", restaurantId)
            .in("status", ["new", "accepted", "preparing", "ready"]),
        ),
      ]);

      return { unread, tasks, shifts, orders, total: unread + tasks + shifts + orders };
    },
  });

  useEffect(() => {
    if (!restaurantId) return;
    const invalidate = () => void qc.invalidateQueries({ queryKey: key });

    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`ops-counts:${restaurantId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "in_app_notifications", filter: `restaurant_id=eq.${restaurantId}` }, invalidate)
        .on("postgres_changes", { event: "*", schema: "public", table: "work_tasks", filter: `restaurant_id=eq.${restaurantId}` }, invalidate)
        .on("postgres_changes", { event: "*", schema: "public", table: "shifts", filter: `restaurant_id=eq.${restaurantId}` }, invalidate)
        .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` }, invalidate)
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.warn("Operational counter realtime unavailable; polling remains active.");
          }
        });
    } catch (error) {
      console.warn("Operational counter realtime setup skipped:", error);
    }

    return () => {
      if (channel) void supabase.removeChannel(channel);
    };
  }, [qc, restaurantId]);

  return { ...query, data: query.data ?? EMPTY };
}
