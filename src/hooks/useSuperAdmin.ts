import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { daysAgoIso, startOfTodayIso } from "@/lib/format";
import type { Database } from "@/integrations/supabase/types";

export type RestaurantRow = Database["public"]["Tables"]["restaurants"]["Row"];
export type PlanRow = Database["public"]["Tables"]["subscription_plans"]["Row"];
export type OrderRow = Database["public"]["Tables"]["orders"]["Row"];
export type AuditRow = Database["public"]["Tables"]["audit_logs"]["Row"];

/** Authoritative platform-owner check — the database decides, not the client. */
export function usePlatformOwner() {
  return useQuery({
    queryKey: ["platform", "is-owner"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_platform_owner");
      if (error) throw error;
      return Boolean(data);
    },
    staleTime: 60_000,
  });
}

function unwrapCount(result: { count: number | null; error: unknown }): number {
  if (result.error) throw result.error;
  return result.count ?? 0;
}


export type PlatformStats = {
  restaurants: number;
  activeRestaurants: number;
  inactiveRestaurants: number;
  tables: number;
  staff: number;
  menuItems: number;
  ordersToday: number;
  ordersWeek: number;
  ordersMonth: number;
  salesToday: number;
  salesWeek: number;
  salesMonth: number;
  waiterCallsToday: number;
};

export function usePlatformStats() {
  return useQuery<PlatformStats>({
    queryKey: ["platform", "stats"],
    queryFn: async () => {
      const today = startOfTodayIso();
      const week = daysAgoIso(7);
      const month = daysAgoIso(30);

      const [restaurants, tables, staff, menuItems, waiterCalls, orders] = await Promise.all([
        supabase.from("restaurants").select("id, is_active, archived_at"),
        supabase
          .from("restaurant_tables")
          .select("id", { count: "exact", head: true })
          .eq("is_active", true),
        supabase.from("staff").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("menu_items").select("id", { count: "exact", head: true }),
        supabase
          .from("waiter_calls")
          .select("id", { count: "exact", head: true })
          .gte("created_at", today),
        supabase.from("orders").select("id, total, status, created_at").gte("created_at", month),
      ]);

      if (restaurants.error) throw restaurants.error;
      if (orders.error) throw orders.error;

      const rows = restaurants.data ?? [];
      const live = (orders.data ?? []).filter((o) => o.status !== "cancelled");
      const sum = (from: string) =>
        live
          .filter((o) => o.created_at >= from)
          .reduce((acc, o) => acc + Number(o.total ?? 0), 0);
      const count = (from: string) => live.filter((o) => o.created_at >= from).length;

      return {
        restaurants: rows.length,
        activeRestaurants: rows.filter((r) => r.is_active && !r.archived_at).length,
        inactiveRestaurants: rows.filter((r) => !r.is_active || r.archived_at).length,
        tables: unwrapCount(tables),
        staff: unwrapCount(staff),
        menuItems: unwrapCount(menuItems),
        waiterCallsToday: unwrapCount(waiterCalls),
        ordersToday: count(today),
        ordersWeek: count(week),
        ordersMonth: live.length,
        salesToday: sum(today),
        salesWeek: sum(week),
        salesMonth: sum(month),
      };
    },
    staleTime: 30_000,
  });
}

export type RestaurantWithStats = RestaurantRow & {
  orderCount: number;
  revenue: number;
  tableCount: number;
  staffCount: number;
  productCount: number;
};

/** All restaurants plus the counts needed for health/onboarding indicators. */
export function useRestaurantsWithStats() {
  return useQuery<RestaurantWithStats[]>({
    queryKey: ["platform", "restaurants"],
    queryFn: async () => {
      const [restaurants, tables, staff, products, orders] = await Promise.all([
        supabase.from("restaurants").select("*").order("created_at", { ascending: false }),
        supabase.from("restaurant_tables").select("id, restaurant_id, is_active"),
        supabase.from("staff").select("id, restaurant_id, is_active"),
        supabase.from("menu_items").select("id, restaurant_id"),
        supabase.from("orders").select("id, restaurant_id, total, status"),
      ]);
      if (restaurants.error) throw restaurants.error;

      const bucket = <T extends { restaurant_id: string | null }>(rows: T[] | null) => {
        const map = new Map<string, T[]>();
        for (const row of rows ?? []) {
          if (!row.restaurant_id) continue;
          const list = map.get(row.restaurant_id) ?? [];
          list.push(row);
          map.set(row.restaurant_id, list);
        }
        return map;
      };

      const tableMap = bucket(tables.data);
      const staffMap = bucket(staff.data);
      const productMap = bucket(products.data);
      const orderMap = bucket(orders.data);

      return (restaurants.data ?? []).map((r) => {
        const rOrders = (orderMap.get(r.id) ?? []).filter((o) => o.status !== "cancelled");
        return {
          ...r,
          tableCount: (tableMap.get(r.id) ?? []).filter((x) => x.is_active).length,
          staffCount: (staffMap.get(r.id) ?? []).filter((x) => x.is_active).length,
          productCount: (productMap.get(r.id) ?? []).length,
          orderCount: rOrders.length,
          revenue: rOrders.reduce((acc, o) => acc + Number(o.total ?? 0), 0),
        };
      });
    },
    staleTime: 20_000,
  });
}

export function useRestaurant(restaurantId: string) {
  return useQuery({
    queryKey: ["platform", "restaurant", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("*")
        .eq("id", restaurantId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: Boolean(restaurantId),
  });
}

export function useSubscriptionPlans() {
  return useQuery<PlanRow[]>({
    queryKey: ["platform", "plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("*")
        .order("price_monthly", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });
}

export function usePlatformSettings() {
  return useQuery({
    queryKey: ["platform", "settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("platform_settings").select("*").maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export type PlatformOrder = OrderRow & {
  restaurant: { id: string; name: string; currency: string } | null;
  table: { id: string; table_number: string } | null;
};

export function usePlatformOrders(params: {
  restaurantId?: string;
  status?: string;
  paymentStatus?: string;
  from?: string;
  to?: string;
}) {
  return useQuery<PlatformOrder[]>({
    queryKey: ["platform", "orders", params],
    queryFn: async () => {
      let query = supabase
        .from("orders")
        .select(
          "*, restaurant:restaurants(id, name, currency), table:restaurant_tables(id, table_number)",
        )
        .order("created_at", { ascending: false })
        .limit(500);
      if (params.restaurantId) query = query.eq("restaurant_id", params.restaurantId);
      if (params.status) query = query.eq("status", params.status as never);
      if (params.paymentStatus) query = query.eq("payment_status", params.paymentStatus as never);
      if (params.from) query = query.gte("created_at", params.from);
      if (params.to) query = query.lte("created_at", params.to);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as PlatformOrder[];
    },
  });
}

export function useOrderItems(orderId: string | null) {
  return useQuery({
    queryKey: ["platform", "order-items", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", orderId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: Boolean(orderId),
  });
}

export function useAuditLogs(params: { restaurantId?: string; action?: string; search?: string }) {
  return useQuery<AuditRow[]>({
    queryKey: ["platform", "audit", params],
    queryFn: async () => {
      let query = supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300);
      if (params.restaurantId) query = query.eq("restaurant_id", params.restaurantId);
      if (params.action) query = query.eq("action", params.action);
      const { data, error } = await query;
      if (error) throw error;
      const rows = data ?? [];
      const needle = params.search?.trim().toLowerCase();
      if (!needle) return rows;
      return rows.filter((r) =>
        [r.actor_name, r.action, r.entity, r.entity_id]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(needle)),
      );
    },
  });
}
