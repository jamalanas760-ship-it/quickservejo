import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { BellRing, BellOff, Volume2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useMemberships } from "@/hooks/useSession";
import { humanError } from "@/lib/errors";
import { formatDateTime, formatMoney } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { playOrderAlert, unlockAlertSound } from "@/lib/order-alert";
import type { Database } from "@/integrations/supabase/types";

type OrderStatus = Database["public"]["Enums"]["order_status"];

const LANE: { status: OrderStatus; next: OrderStatus | null }[] = [
  { status: "new", next: "accepted" },
  { status: "accepted", next: "preparing" },
  { status: "preparing", next: "ready" },
  { status: "ready", next: "served" },
];

const STATUS_LABELS: Record<OrderStatus, { en: string; ar: string }> = {
  new: { en: "New", ar: "جديد" },
  accepted: { en: "Accepted", ar: "مقبول" },
  preparing: { en: "Preparing", ar: "قيد التحضير" },
  ready: { en: "Ready", ar: "جاهز" },
  served: { en: "Served", ar: "تم التقديم" },
  paid: { en: "Paid", ar: "مدفوع" },
  cancelled: { en: "Cancelled", ar: "ملغي" },
};

const NEXT_LABELS: Record<string, { en: string; ar: string }> = {
  accepted: { en: "Accept", ar: "قبول" },
  preparing: { en: "Start preparing", ar: "بدء التحضير" },
  ready: { en: "Mark ready", ar: "جاهز" },
  served: { en: "Mark served", ar: "تم التقديم" },
};

export const Route = createFileRoute("/_authenticated/kitchen")({
  head: () => ({
    meta: [
      { title: "Kitchen display — QuickServe" },
      {
        name: "description",
        content: "Live kitchen display: incoming table orders, items and preparation status.",
      },
      { property: "og:title", content: "Kitchen display — QuickServe" },
      { property: "og:description", content: "Incoming table orders for the kitchen." },
    ],
  }),
  component: KitchenPage,
});

function KitchenPage() {
  const { lang, pick } = useI18n();
  const queryClient = useQueryClient();
  const memberships = useMemberships();
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [live, setLive] = useState(false);
  const seenRef = useRef<Set<string> | null>(null);

  const options = useMemo(
    () =>
      (memberships.data ?? [])
        .filter((m) => m.restaurant_id && m.restaurant)
        .map((m) => ({ id: m.restaurant_id!, name: m.restaurant!.name })),
    [memberships.data],
  );

  const activeId = restaurantId ?? options[0]?.id ?? null;

  const orders = useQuery({
    queryKey: ["kitchen", "orders", activeId],
    enabled: Boolean(activeId),
    refetchInterval: 20000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, order_number, status, total, currency, customer_notes, created_at, table:restaurant_tables(table_number, table_name), items:order_items(id, quantity, product_name_en:product_name_snapshot_en, product_name_ar:product_name_snapshot_ar, notes, selected_modifiers)",
        )
        .eq("restaurant_id", activeId!)
        .in("status", ["new", "accepted", "preparing", "ready"])
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Live push: new/updated orders arrive instantly; polling stays as a safety net.
  useEffect(() => {
    if (!activeId) return;
    setLive(false);
    const channel = supabase
      .channel(`kitchen-${activeId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `restaurant_id=eq.${activeId}`,
        },
        (payload) => {
          void queryClient.invalidateQueries({ queryKey: ["kitchen"] });
          const row = payload.new as { status?: string } | null;
          if (payload.eventType === "INSERT" && row?.status === "new") {
            if (soundOn) playOrderAlert();
            toast.info(lang === "ar" ? "طلب جديد وصل" : "New order received");
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "waiter_calls",
          filter: `restaurant_id=eq.${activeId}`,
        },
        () => {
          if (soundOn) playOrderAlert();
          toast.info(lang === "ar" ? "طلب مناداة نادل" : "A table is calling a waiter");
        },
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"));

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeId, queryClient, soundOn, lang]);

  // Fallback chime when a brand-new order arrives through polling instead.
  useEffect(() => {
    const rows = orders.data;
    if (!rows) return;
    const ids = new Set(rows.filter((o) => o.status === "new").map((o) => o.id));
    if (seenRef.current === null) {
      seenRef.current = ids;
      return;
    }
    const fresh = [...ids].some((id) => !seenRef.current!.has(id));
    seenRef.current = ids;
    if (fresh && soundOn && !live) playOrderAlert();
  }, [orders.data, soundOn, live]);

  useEffect(() => {
    seenRef.current = null;
  }, [activeId]);

  async function advance(id: string, next: OrderStatus) {
    try {
      const { error } = await supabase.from("orders").update({ status: next }).eq("id", id);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["kitchen"] });
    } catch (error) {
      toast.error(humanError(error, lang));
    }
  }

  if (memberships.isPending) return <Skeleton className="m-6 h-64 rounded-xl" />;

  if (options.length === 0) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <p className="text-sm text-muted-foreground">
          {lang === "ar"
            ? "حسابك غير مرتبط بمطعم بعد."
            : "Your account is not linked to a restaurant yet."}
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/dashboard">{lang === "ar" ? "لوحة التحكم" : "Dashboard"}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg font-semibold">
            {lang === "ar" ? "شاشة المطبخ" : "Kitchen display"}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={live ? "secondary" : "outline"} className="gap-1">
              {live ? <BellRing className="size-3" /> : <BellOff className="size-3" />}
              {live
                ? lang === "ar"
                  ? "مباشر"
                  : "Live"
                : lang === "ar"
                  ? "تحديث دوري"
                  : "Polling"}
            </Badge>
            <Button
              size="sm"
              variant={soundOn ? "secondary" : "outline"}
              onClick={() => {
                const next = !soundOn;
                setSoundOn(next);
                if (next) {
                  void unlockAlertSound().then(() => playOrderAlert());
                }
              }}
            >
              <Volume2 className="size-4" />
              {soundOn
                ? lang === "ar"
                  ? "الصوت مفعّل"
                  : "Sound on"
                : lang === "ar"
                  ? "الصوت مغلق"
                  : "Sound off"}
            </Button>
          </div>
          {options.length > 1 ? (
            <Select value={activeId ?? ""} onValueChange={setRestaurantId}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {LANE.map((lane) => {
            const laneOrders = (orders.data ?? []).filter((o) => o.status === lane.status);
            return (
              <div key={lane.status} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">{STATUS_LABELS[lane.status][lang]}</h2>
                  <Badge variant="outline">{laneOrders.length}</Badge>
                </div>
                {laneOrders.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground">
                    —
                  </div>
                ) : (
                  laneOrders.map((order) => (
                    <div key={order.id} className="panel space-y-2 p-3">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold">{order.order_number}</p>
                        <Badge variant="secondary">
                          {order.table?.table_name || order.table?.table_number || "—"}
                        </Badge>
                      </div>
                      <ul className="space-y-1 text-sm">
                        {(order.items ?? []).map((item) => (
                          <li key={item.id}>
                            <span className="font-medium">{item.quantity}×</span>{" "}
                            {pick(item.product_name_en, item.product_name_ar)}
                            {Array.isArray(item.selected_modifiers) &&
                            item.selected_modifiers.length > 0 ? (
                              <span className="block ps-5 text-xs text-muted-foreground">
                                {(item.selected_modifiers as { name_en: string; name_ar: string }[])
                                  .map((m) => pick(m.name_en, m.name_ar))
                                  .join(", ")}
                              </span>
                            ) : null}
                            {item.notes ? (
                              <span className="block ps-5 text-xs text-amber-600">
                                “{item.notes}”
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                      {order.customer_notes ? (
                        <p className="rounded bg-muted p-2 text-xs">{order.customer_notes}</p>
                      ) : null}
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(order.created_at, lang)} ·{" "}
                        {formatMoney(order.total, order.currency, lang)}
                      </p>
                      <div className="flex gap-2">
                        {lane.next ? (
                          <Button
                            size="sm"
                            className="flex-1"
                            onClick={() => void advance(order.id, lane.next!)}
                          >
                            {NEXT_LABELS[lane.next]?.[lang] ?? lane.next}
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void advance(order.id, "cancelled")}
                        >
                          {lang === "ar" ? "إلغاء" : "Cancel"}
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
