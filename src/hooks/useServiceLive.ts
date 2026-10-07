import { useEffect, useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Refresh related views in this client; each device also listens independently.
export async function invalidateServiceQueries(client: QueryClient, restaurantId: string | null) {
  if (!restaurantId) return;
  await client.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey;
      if (key[0] === "platform" && key[1] === "orders") {
        const scope = key[2] as { restaurantId?: string } | undefined;
        return !scope?.restaurantId || scope.restaurantId === restaurantId;
      }
      return (
        [
          "kitchen",
          "waiter",
          "cashier",
          "host",
          "manage",
          "workspace",
          "reservations",
          "waitlist",
          "bookings",
          "booking-waitlist",
        ].includes(String(key[0])) && JSON.stringify(key).includes(restaurantId)
      );
    },
  });
}
export function useServiceLive(restaurantId: string | null | undefined) {
  const client = useQueryClient();
  const [live, setLive] = useState(false);
  useEffect(() => {
    if (!restaurantId) return;
    setLive(false);
    const refresh = () => {
      void invalidateServiceQueries(client, restaurantId);
    };
    let channel = supabase.channel(`service:${restaurantId}:${crypto.randomUUID()}`);
    for (const table of [
      "orders",
      "order_items",
      "restaurant_tables",
      "waiter_calls",
      "payment_transactions",
      "table_bookings",
      "booking_waitlist",
    ]) {
      // order_items has no restaurant_id; parent orders events and polling handle it.
      if (table === "order_items") continue;
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `restaurant_id=eq.${restaurantId}` },
        refresh,
      );
    }
    channel.subscribe((status) => {
      setLive(status === "SUBSCRIBED");
      if (status === "SUBSCRIBED") refresh();
    });
    // Poll even when subscribed: tenants may not publish every table to Realtime.
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener("online", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", refresh);
      void supabase.removeChannel(channel);
    };
  }, [restaurantId, client]);
  return live;
}
