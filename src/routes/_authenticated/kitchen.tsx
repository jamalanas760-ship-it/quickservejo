import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { BellRing, BellOff, Volume2, VolumeX, Timer, StickyNote } from "lucide-react";
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
import { formatMoney } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { playOrderAlert, unlockAlertSound } from "@/lib/order-alert";
import { cn } from "@/lib/utils";
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

const LANE_EMPTY: Record<string, { en: string; ar: string }> = {
  new: { en: "No new orders", ar: "لا توجد طلبات جديدة" },
  accepted: { en: "Nothing waiting to start", ar: "لا يوجد طلب في الانتظار" },
  preparing: { en: "Nothing on the line", ar: "لا يوجد طلب قيد التحضير" },
  ready: { en: "Nothing waiting for pickup", ar: "لا يوجد طلب جاهز" },
};

const NEXT_LABELS: Record<string, { en: string; ar: string }> = {
  accepted: { en: "Accept order", ar: "قبول الطلب" },
  preparing: { en: "Start preparing", ar: "بدء التحضير" },
  ready: { en: "Mark ready", ar: "جاهز" },
  served: { en: "Mark served", ar: "تم التقديم" },
};

/** Minutes after which an order is late (amber) then overdue (red). */
const WARN_MINUTES = 5;
const LATE_MINUTES = 10;

function elapsed(from: string, now: number) {
  const seconds = Math.max(0, Math.floor((now - new Date(from).getTime()) / 1000));
  const mm = Math.floor(seconds / 60);
  const ss = seconds % 60;
  return {
    minutes: mm,
    label: `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`,
  };
}

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
  const [now, setNow] = useState(() => Date.now());
  const seenRef = useRef<Set<string> | null>(null);
  const ar = lang === "ar";

  // Ticking clock so the elapsed timers count up in real time.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

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
            toast.info(ar ? "طلب جديد وصل" : "New order received");
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
          toast.info(ar ? "طلب مناداة نادل" : "A table is calling a waiter");
        },
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"));

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeId, queryClient, soundOn, ar]);

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

  const rows = orders.data ?? [];
  const oldest = rows.length
    ? elapsed(
        rows.reduce((a, b) => (a.created_at < b.created_at ? a : b)).created_at,
        now,
      )
    : null;
  const activeCount = rows.filter((o) => o.status !== "ready").length;

  if (memberships.isPending) return <Skeleton className="m-6 h-64 rounded-3xl" />;

  if (options.length === 0) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <p className="text-sm text-muted-foreground">
          {ar
            ? "حسابك غير مرتبط بمطعم بعد."
            : "Your account is not linked to a restaurant yet."}
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/dashboard">{ar ? "لوحة التحكم" : "Dashboard"}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-16">
      {/* Header rail */}
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto max-w-[1800px] space-y-3 px-4 py-3">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">
                {ar ? "شاشة المطبخ" : "Kitchen display"}
              </h1>
              <p className="mt-0.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {activeCount} {ar ? "طلب قيد التنفيذ" : "orders in progress"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider",
                  live ? "bg-accent/15 text-accent-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {live ? (
                  <>
                    <span className="relative flex size-2">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-75" />
                      <span className="relative inline-flex size-2 rounded-full bg-accent" />
                    </span>
                    <BellRing className="size-3.5" />
                    {ar ? "مباشر" : "Live"}
                  </>
                ) : (
                  <>
                    <BellOff className="size-3.5" />
                    {ar ? "تحديث دوري" : "Polling"}
                  </>
                )}
              </span>
              <button
                type="button"
                onClick={() => {
                  const next = !soundOn;
                  setSoundOn(next);
                  if (next) void unlockAlertSound().then(() => playOrderAlert());
                }}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors",
                  soundOn
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {soundOn ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
                {ar ? "الصوت" : "Sound"}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {oldest ? (
              <span
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold tabular-nums",
                  oldest.minutes >= LATE_MINUTES
                    ? "bg-destructive/15 text-destructive"
                    : oldest.minutes >= WARN_MINUTES
                      ? "bg-warning/20 text-foreground"
                      : "bg-muted text-muted-foreground",
                )}
              >
                <Timer className="size-3.5" />
                {ar ? "أقدم طلب" : "Oldest ticket"} {oldest.label}
              </span>
            ) : null}
            {options.length > 1 ? (
              <Select value={activeId ?? ""} onValueChange={setRestaurantId}>
                <SelectTrigger className="h-9 w-56 rounded-full">
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
        </div>
      </header>

      <main className="mx-auto max-w-[1800px] space-y-8 px-4 py-6 xl:grid xl:grid-cols-4 xl:items-start xl:gap-5 xl:space-y-0">
        {LANE.map((lane) => {
          const laneOrders = rows.filter((o) => o.status === lane.status);
          const isNew = lane.status === "new";
          return (
            <section key={lane.status} className="space-y-3">
              <div className="flex items-center gap-3 px-1">
                <h2
                  className={cn(
                    "text-xs font-bold uppercase tracking-[0.18em]",
                    isNew && laneOrders.length > 0 ? "text-accent" : "text-muted-foreground",
                  )}
                >
                  {STATUS_LABELS[lane.status][lang]}
                </h2>
                <Badge variant="outline" className="rounded-full tabular-nums">
                  {laneOrders.length}
                </Badge>
                <span
                  className={cn(
                    "h-px flex-1",
                    isNew && laneOrders.length > 0 ? "bg-accent/30" : "bg-border",
                  )}
                />
              </div>

              {laneOrders.length === 0 ? (
                <p className="flex h-20 items-center justify-center rounded-3xl border-2 border-dashed border-border text-center text-xs text-muted-foreground">
                  {LANE_EMPTY[lane.status]?.[lang]}
                </p>
              ) : (
                laneOrders.map((order) => {
                  const age = elapsed(order.created_at, now);
                  const overdue = age.minutes >= LATE_MINUTES;
                  const warn = !overdue && age.minutes >= WARN_MINUTES;
                  return (
                    <article
                      key={order.id}
                      className={cn(
                        "animate-fade-in overflow-hidden rounded-3xl border bg-card shadow-[0_4px_20px_-8px_oklch(0.2_0.02_60_/_0.18)]",
                        overdue
                          ? "border-destructive/40 ring-2 ring-destructive/60"
                          : warn
                            ? "border-warning/50 ring-1 ring-warning/50"
                            : isNew
                              ? "border-accent/40 ring-2 ring-accent/60"
                              : "border-border",
                      )}
                    >
                      <div className="space-y-4 p-4 sm:p-5">
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                          <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                              {order.table?.table_name ||
                                (order.table?.table_number
                                  ? `${ar ? "طاولة" : "Table"} ${order.table.table_number}`
                                  : ar
                                    ? "بدون طاولة"
                                    : "No table")}
                            </p>
                            <p className="truncate text-lg font-bold tabular-nums">
                              {order.order_number}
                            </p>
                          </div>
                          <div
                            className={cn(
                              "shrink-0 rounded-2xl px-3 py-2 text-center",
                              overdue
                                ? "bg-destructive text-destructive-foreground animate-pulse"
                                : warn
                                  ? "bg-warning/25 text-foreground"
                                  : "bg-muted text-foreground",
                            )}
                          >
                            <span className="block text-lg font-bold leading-none tabular-nums">
                              {age.label}
                            </span>
                            <span className="text-[9px] font-bold uppercase tracking-widest opacity-80">
                              {overdue
                                ? ar
                                  ? "متأخر"
                                  : "Overdue"
                                : ar
                                  ? "منقضي"
                                  : "Elapsed"}
                            </span>
                          </div>
                        </div>

                        <ul className="space-y-3">
                          {(order.items ?? []).map((item) => (
                            <li key={item.id} className="flex gap-3">
                              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-lg font-bold tabular-nums">
                                {item.quantity}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="text-base font-bold leading-tight sm:text-lg">
                                  {pick(item.product_name_en, item.product_name_ar)}
                                </p>
                                {Array.isArray(item.selected_modifiers) &&
                                item.selected_modifiers.length > 0 ? (
                                  <p className="mt-0.5 text-sm text-muted-foreground">
                                    {(
                                      item.selected_modifiers as {
                                        name_en: string;
                                        name_ar: string;
                                      }[]
                                    )
                                      .map((m) => pick(m.name_en, m.name_ar))
                                      .join(" · ")}
                                  </p>
                                ) : null}
                                {item.notes ? (
                                  <p className="mt-1 text-sm font-semibold text-accent-foreground">
                                    — {item.notes}
                                  </p>
                                ) : null}
                              </div>
                            </li>
                          ))}
                        </ul>

                        {order.customer_notes ? (
                          <div className="rounded-2xl border-s-4 border-accent bg-muted/70 p-3">
                            <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                              <StickyNote className="size-3" />
                              {ar ? "ملاحظة العميل" : "Customer note"}
                            </p>
                            <p className="text-sm font-medium">{order.customer_notes}</p>
                          </div>
                        ) : null}

                        <p className="text-xs font-semibold text-muted-foreground tabular-nums">
                          {formatMoney(order.total, order.currency, lang)}
                        </p>
                      </div>

                      <div className="flex gap-2 border-t border-border bg-muted/40 p-2">
                        {lane.next ? (
                          <Button
                            size="lg"
                            className="h-14 flex-[3] rounded-2xl text-base font-bold"
                            onClick={() => void advance(order.id, lane.next!)}
                          >
                            {NEXT_LABELS[lane.next]?.[lang] ?? lane.next}
                          </Button>
                        ) : null}
                        <Button
                          size="lg"
                          variant="outline"
                          className="h-14 flex-1 rounded-2xl text-xs font-bold uppercase tracking-wider text-muted-foreground"
                          onClick={() => void advance(order.id, "cancelled")}
                        >
                          {ar ? "إلغاء" : "Cancel"}
                        </Button>
                      </div>
                    </article>
                  );
                })
              )}
            </section>
          );
        })}
      </main>
    </div>
  );
}
