import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { daysAgoIso, startOfTodayIso } from "@/lib/format";
import { useAccess } from "@/hooks/useSession";
import type { AppRole } from "@/lib/permissions";

export type WorkspaceScope = {
  restaurantId: string | null;
  restaurantName: string | null;
  currency: string;
  isPending: boolean;
};

/**
 * The restaurant the home/dashboard widgets report on: the user's membership
 * when they have one, otherwise the newest tenant for platform owners.
 */
export function useWorkspaceScope(): WorkspaceScope {
  const access = useAccess();
  const membership = (access.data ?? []).find((m) => m.restaurant_id) ?? null;

  const fallback = useQuery({
    queryKey: ["workspace", "fallback-restaurant"],
    enabled: access.isSuperAdmin && !membership,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("id, name, currency")
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
    staleTime: 60_000,
  });

  if (membership?.restaurant_id) {
    return {
      restaurantId: membership.restaurant_id,
      restaurantName: membership.restaurant?.name ?? null,
      currency: "JOD",
      isPending: access.isPending,
    };
  }
  return {
    restaurantId: fallback.data?.id ?? null,
    restaurantName: fallback.data?.name ?? null,
    currency: fallback.data?.currency ?? "JOD",
    isPending: access.isPending || fallback.isPending,
  };
}

export type WorkspaceReport = {
  ordersToday: number;
  ordersWeek: number;
  salesToday: number;
  salesWeek: number;
  averageOrder: number;
  openOrders: number;
  paidToday: number;
  topItems: { name: string; quantity: number }[];
  /** Last 7 days, oldest first: daily sales total and order count. */
  series: { day: string; sales: number; orders: number }[];
  recent: {
    id: string;
    order_number: string;
    status: string;
    payment_status: string;
    total: number;
    created_at: string;
    table: string | null;
  }[];
};

const OPEN_STATUSES = ["new", "accepted", "preparing", "ready"];

/** Daily buckets for the sparkline strips on the home and dashboard cards. */
function buildSeries(orders: { total: number; created_at: string }[]) {
  const days: { day: string; sales: number; orders: number }[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    days.push({ day: d.toISOString().slice(0, 10), sales: 0, orders: 0 });
  }
  const index = new Map(days.map((d, i) => [d.day, i]));
  for (const order of orders) {
    const key = order.created_at.slice(0, 10);
    const i = index.get(key);
    if (i === undefined) continue;
    days[i]!.sales += Number(order.total ?? 0);
    days[i]!.orders += 1;
  }
  return days;
}

/** One round-trip pair that powers every home widget and the dashboard. */
export function useWorkspaceReport(restaurantId: string | null) {
  return useQuery<WorkspaceReport>({
    queryKey: ["workspace", "report", restaurantId],
    enabled: Boolean(restaurantId),
    staleTime: 20_000,
    queryFn: async () => {
      const today = startOfTodayIso();
      const week = daysAgoIso(7);

      const [ordersRes, itemsRes] = await Promise.all([
        supabase
          .from("orders")
          .select("id, order_number, status, payment_status, total, created_at, table:restaurant_tables(table_number)")
          .eq("restaurant_id", restaurantId!)
          .gte("created_at", week)
          .order("created_at", { ascending: false })
          .limit(400),
        supabase
          .from("order_items")
          .select("product_name_snapshot_en, product_name_snapshot_ar, quantity, created_at")
          .eq("restaurant_id", restaurantId!)
          .gte("created_at", week)
          .limit(1000),
      ]);
      if (ordersRes.error) throw ordersRes.error;
      if (itemsRes.error) throw itemsRes.error;

      const orders = (ordersRes.data ?? []) as unknown as {
        id: string;
        order_number: string;
        status: string;
        payment_status: string;
        total: number;
        created_at: string;
        table: { table_number: string } | null;
      }[];

      const counted = orders.filter((o) => o.status !== "cancelled");
      const todayOrders = counted.filter((o) => o.created_at >= today);
      const sum = (rows: typeof counted) => rows.reduce((acc, o) => acc + Number(o.total ?? 0), 0);

      const tally = new Map<string, number>();
      for (const item of itemsRes.data ?? []) {
        const name = item.product_name_snapshot_en || item.product_name_snapshot_ar || "—";
        tally.set(name, (tally.get(name) ?? 0) + Number(item.quantity ?? 0));
      }
      const topItems = [...tally.entries()]
        .map(([name, quantity]) => ({ name, quantity }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 5);

      return {
        ordersToday: todayOrders.length,
        ordersWeek: counted.length,
        salesToday: sum(todayOrders),
        salesWeek: sum(counted),
        averageOrder: counted.length ? sum(counted) / counted.length : 0,
        openOrders: counted.filter((o) => OPEN_STATUSES.includes(o.status)).length,
        paidToday: todayOrders.filter((o) => o.payment_status === "paid").length,
        topItems,
        series: buildSeries(counted),
        recent: orders.slice(0, 6).map((o) => ({
          id: o.id,
          order_number: o.order_number,
          status: o.status,
          payment_status: o.payment_status,
          total: Number(o.total ?? 0),
          created_at: o.created_at,
          table: o.table?.table_number ?? null,
        })),
      };
    },
  });
}

export type WorkspaceMember = {
  id: string;
  name: string;
  email: string | null;
  role: AppRole;
  is_active: boolean;
};

/** Team roster for the workspace — RLS keeps it scoped to the tenant. */
export function useWorkspaceMembers(restaurantId: string | null) {
  return useQuery<WorkspaceMember[]>({
    queryKey: ["workspace", "members", restaurantId],
    enabled: Boolean(restaurantId),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff")
        .select("id, name, email, role, is_active")
        .eq("restaurant_id", restaurantId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as WorkspaceMember[];
    },
  });
}
