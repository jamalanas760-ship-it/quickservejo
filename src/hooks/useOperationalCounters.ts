import { retainResource } from "@/lib/shared-resource";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useSupabaseSession } from "@/hooks/useSession";
import { createCoalescedRefresh } from "@/lib/coalesced-refresh";
import { supabase } from "@/integrations/supabase/client";

export type OperationalCounters = {
  tasks: number;
  shifts: number;
  orders: number;
  unread: number;
  workforceUnread: number;
  total: number;
};

const EMPTY: OperationalCounters = { tasks: 0, shifts: 0, orders: 0, unread: 0, workforceUnread: 0, total: 0 };

export function operationalCountersKey(restaurantId: string | null, userId?: string | null) {
  return ["operational-counters", restaurantId, userId] as const;
}

/**
 * Navigation/header counters retain their last successful snapshot on transient failures.
 *
 * The authenticated shell must never crash because one operational table is
 * unavailable, membership is still resolving, Realtime disconnects, or a
 * role cannot read a row. RLS remains the source of truth for what the current
 * account may count.
 */
export function useOperationalCounters(restaurantId: string | null) {
  const qc = useQueryClient();
  const session = useSupabaseSession();
  const userId = session.data?.user.id;
  const key = operationalCountersKey(restaurantId, userId);

  const query = useQuery<OperationalCounters>({
    queryKey: key,
    enabled: Boolean(restaurantId && userId),
    staleTime: 15_000,
    refetchInterval: false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: false,
    queryFn: async () => {
      if (!restaurantId) return EMPTY;
      const { data, error } = await (supabase as any).rpc("get_operational_counters", { _restaurant_id: restaurantId });
      if (error) throw error;
      if (!data || Object.keys(EMPTY).some((field) => !Number.isFinite(data[field]) || data[field] < 0)) {
        throw new Error("Operational counters are unavailable");
      }
      return data as OperationalCounters;
    },
  });

  useEffect(() => {
    if (!restaurantId || !userId) return;
    return retainResource(qc,JSON.stringify(operationalCountersKey(restaurantId,userId)),()=>{
    let live=false;
    let lastPoll=Date.now();
    const refresh = createCoalescedRefresh(() => void qc.invalidateQueries({ queryKey: operationalCountersKey(restaurantId, userId) }));
    const invalidate = refresh.schedule;

    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`ops-counts:${restaurantId}:${userId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "in_app_notifications", filter: `restaurant_id=eq.${restaurantId}` }, invalidate)
        .on("postgres_changes", { event: "*", schema: "public", table: "work_tasks", filter: `restaurant_id=eq.${restaurantId}` }, invalidate)
        .on("postgres_changes", { event: "*", schema: "public", table: "shifts", filter: `restaurant_id=eq.${restaurantId}` }, invalidate)
        .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` }, invalidate)
        .on("postgres_changes", { event: "*", schema: "public", table: "order_view_receipts", filter: `restaurant_id=eq.${restaurantId}` }, invalidate)
        .subscribe((status) => {
          live = status === "SUBSCRIBED";
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.warn("Operational counter realtime unavailable; polling remains active.");
          }
        });
    } catch (error) {
      console.warn("Operational counter realtime setup skipped:", error);
    }

    const timer = window.setInterval(()=>{
      if (document.visibilityState === "hidden") return;
      if (!live || Date.now()-lastPoll >= 120_000) {lastPoll=Date.now();invalidate();}
    },30_000+Math.floor(Math.random()*5_000));
    return () => {
      window.clearInterval(timer);
      refresh.cancel();
      if (channel) void supabase.removeChannel(channel);
    };
    });
  }, [qc, restaurantId, userId]);

  return { ...query, data: query.data ?? EMPTY, isUnavailable: Boolean(restaurantId) && (query.isError || !query.data) };
}
