import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChefHat, Clock3, Flame, History, PackageCheck, Printer, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { humanError } from "@/lib/errors";
import { assignOrderToStaff, durationLabel, fetchStatusEvents, stageDurations, type StatusEvent } from "@/lib/order-ops";
import { cn } from "@/lib/utils";

type KitchenOrder = {
  id: string;
  order_number: string;
  status: string;
  created_at: string;
  customer_notes: string | null;
  assigned_staff_id: string | null;
  assigned_at: string | null;
  accepted_at: string | null;
  preparing_at: string | null;
  ready_at: string | null;
  served_at: string | null;
  table: { table_number: string; table_name: string | null } | null;
};
type KitchenItem = {
  id: string;
  order_id: string;
  menu_item_id: string | null;
  product_name_snapshot_en: string;
  product_name_snapshot_ar: string;
  quantity: number;
  notes: string | null;
  selected_modifiers: unknown;
};
type StaffRow = { id: string; name: string; role: string };
type Station = { id: string; name: string; name_ar: string | null };
type MenuStation = { id: string; kitchen_station_id: string | null };

const STAGES = [
  { id: "new", label: "Received", ar: "مستلم", icon: Clock3, next: "accepted" },
  { id: "accepted", label: "Accepted", ar: "مقبول", icon: ChefHat, next: "preparing" },
  { id: "preparing", label: "Preparing", ar: "قيد التحضير", icon: Flame, next: "ready" },
  { id: "ready", label: "Ready", ar: "جاهز", icon: PackageCheck, next: "served" },
] as const;

const SOUND_KEY = "quickserve:kds-sound-enabled";

function elapsedSeconds(from: string, now: number) {
  return Math.max(0, Math.floor((now - new Date(from).getTime()) / 1000));
}

export function KitchenDisplay({ restaurantId }: { restaurantId: string }) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  const [stationId, setStationId] = useState<string>("all");
  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(SOUND_KEY) !== "0";
  });
  const previousNewIds = useRef<Set<string>>(new Set());

  const orders = useQuery<KitchenOrder[]>({
    queryKey: ["kitchen-orders", restaurantId],
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("orders")
        .select("id, order_number, status, created_at, customer_notes, assigned_staff_id, assigned_at, accepted_at, preparing_at, ready_at, served_at, table:restaurant_tables(table_number, table_name)")
        .eq("restaurant_id", restaurantId)
        .in("status", ["new", "accepted", "preparing", "ready"])
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as KitchenOrder[];
    },
  });

  const items = useQuery<KitchenItem[]>({
    queryKey: ["kitchen-order-items", restaurantId, orders.data?.map((order) => order.id).join(",")],
    enabled: Boolean(orders.data?.length),
    queryFn: async () => {
      const ids = (orders.data ?? []).map((order) => order.id);
      const { data, error } = await (supabase as any)
        .from("order_items")
        .select("id, order_id, menu_item_id, product_name_snapshot_en, product_name_snapshot_ar, quantity, notes, selected_modifiers")
        .in("order_id", ids);
      if (error) throw error;
      return (data ?? []) as KitchenItem[];
    },
  });

  const stations = useQuery<Station[]>({
    queryKey: ["kitchen-stations", restaurantId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("kitchen_stations")
        .select("id,name,name_ar")
        .eq("restaurant_id", restaurantId)
        .eq("is_active", true)
        .order("display_order")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Station[];
    },
  });

  const menuStations = useQuery<MenuStation[]>({
    queryKey: ["kitchen-menu-stations", restaurantId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("menu_items")
        .select("id,kitchen_station_id")
        .eq("restaurant_id", restaurantId);
      if (error) throw error;
      return (data ?? []) as MenuStation[];
    },
  });

  const staff = useQuery<StaffRow[]>({
    queryKey: ["kitchen-staff", restaurantId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("staff")
        .select("id,name,role")
        .eq("restaurant_id", restaurantId)
        .eq("is_active", true)
        .in("role", ["kitchen", "manager", "restaurant_admin"])
        .order("name");
      if (error) throw error;
      return (data ?? []) as StaffRow[];
    },
  });

  const events = useQuery<StatusEvent[]>({
    queryKey: ["kitchen-order-events", restaurantId, orders.data?.map((order) => order.id).join(",")],
    enabled: Boolean(orders.data?.length),
    queryFn: () => fetchStatusEvents((orders.data ?? []).map((order) => order.id)),
  });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel(`kds:${restaurantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` }, () => {
        void queryClient.invalidateQueries({ queryKey: ["kitchen-orders", restaurantId] });
        void queryClient.invalidateQueries({ queryKey: ["kitchen-order-events", restaurantId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items", filter: `restaurant_id=eq.${restaurantId}` }, () => {
        void queryClient.invalidateQueries({ queryKey: ["kitchen-order-items", restaurantId] });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [queryClient, restaurantId]);

  useEffect(() => {
    const next = new Set((orders.data ?? []).filter((order) => order.status === "new").map((order) => order.id));
    const added = [...next].some((id) => !previousNewIds.current.has(id));
    if (added && previousNewIds.current.size > 0 && soundEnabled) {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.28);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      } catch {
        // Browser audio policies may block sound until the user interacts.
      }
    }
    previousNewIds.current = next;
  }, [orders.data, soundEnabled]);

  const stationByMenuItem = useMemo(
    () => new Map((menuStations.data ?? []).map((item) => [item.id, item.kitchen_station_id])),
    [menuStations.data],
  );

  const byOrder = useMemo(() => {
    const map = new Map<string, KitchenItem[]>();
    for (const item of items.data ?? []) {
      if (stationId !== "all" && stationByMenuItem.get(item.menu_item_id ?? "") !== stationId) continue;
      map.set(item.order_id, [...(map.get(item.order_id) ?? []), item]);
    }
    return map;
  }, [items.data, stationByMenuItem, stationId]);

  const eventMap = useMemo(() => {
    const map = new Map<string, StatusEvent[]>();
    for (const event of events.data ?? []) map.set(event.order_id, [...(map.get(event.order_id) ?? []), event]);
    return map;
  }, [events.data]);

  const visibleOrders = useMemo(
    () => (orders.data ?? []).filter((order) => stationId === "all" || (byOrder.get(order.id)?.length ?? 0) > 0),
    [orders.data, byOrder, stationId],
  );

  async function advance(order: KitchenOrder) {
    const stage = STAGES.find((item) => item.id === order.status);
    if (!stage) return;
    try {
      const { error } = await (supabase as any).rpc("transition_order_status", {
        _order_id: order.id,
        _next: stage.next,
        _note: null,
      });
      if (error) throw error;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["kitchen-orders", restaurantId] }),
        queryClient.invalidateQueries({ queryKey: ["kitchen-order-events", restaurantId] }),
      ]);
      toast.success(ar ? "تم تحديث حالة الطلب" : "Order updated");
    } catch (error) {
      toast.error(humanError(error, lang));
    }
  }

  async function assign(orderId: string, staffId: string) {
    try {
      await assignOrderToStaff(orderId, staffId || null);
      await queryClient.invalidateQueries({ queryKey: ["kitchen-orders", restaurantId] });
      toast.success(ar ? "تم تحديث المسؤول" : "Assignment updated");
    } catch (error) {
      toast.error(humanError(error, lang));
    }
  }

  function toggleSound() {
    setSoundEnabled((current) => {
      const next = !current;
      window.localStorage.setItem(SOUND_KEY, next ? "1" : "0");
      return next;
    });
  }

  function printTicket(order: KitchenOrder) {
    const orderItems = byOrder.get(order.id) ?? [];
    const station = stationId === "all" ? (ar ? "كل المحطات" : "All stations") : (stations.data ?? []).find((s) => s.id === stationId)?.name ?? "";
    const win = window.open("", "_blank", "width=520,height=760");
    if (!win) return;
    const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] ?? char));
    win.document.write(`<!doctype html><html><head><title>Kitchen #${esc(order.order_number)}</title><style>body{font-family:system-ui,sans-serif;padding:24px;color:#111}h1{margin:0;font-size:26px}.muted{color:#666;font-size:12px}.item{display:flex;gap:10px;padding:10px 0;border-bottom:1px dashed #aaa}.qty{font-weight:800}.note{font-size:12px;margin-top:4px}.meta{margin:12px 0;padding:10px;border:1px solid #ddd;border-radius:8px}@media print{button{display:none}}</style></head><body><h1>#${esc(order.order_number)}</h1><div class="muted">${esc(station)} · ${esc(order.table ? `Table ${order.table.table_name || order.table.table_number}` : "Pickup / Delivery")}</div><div class="meta">${esc(new Date(order.created_at).toLocaleString())}</div>${orderItems.map((item) => `<div class="item"><span class="qty">×${esc(item.quantity)}</span><div><strong>${esc(ar ? item.product_name_snapshot_ar || item.product_name_snapshot_en : item.product_name_snapshot_en || item.product_name_snapshot_ar)}</strong>${item.notes ? `<div class="note">${esc(item.notes)}</div>` : ""}</div></div>`).join("")}${order.customer_notes ? `<p><strong>Customer note:</strong> ${esc(order.customer_notes)}</p>` : ""}<script>window.onload=()=>window.print()<\/script></body></html>`);
    win.document.close();
  }

  if (orders.isPending) {
    return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{[1, 2, 3, 4].map((n) => <Skeleton key={n} className="h-72 rounded-3xl" />)}</div>;
  }

  return <div className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="flex items-center gap-2"><ChefHat className="size-6" /><h1 className="text-[28px] font-bold tracking-[-0.04em]">{ar ? "شاشة المطبخ" : "Kitchen Display"}</h1></div>
        <p className="mt-1 text-sm text-muted-foreground">{ar ? "تدفق حي من الاستلام حتى التقديم مع المحطات والتكليف وسجل الحالة." : "Live flow from received to served with station routing, assignment and status history."}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select value={stationId} onChange={(e) => setStationId(e.target.value)} className="h-10 rounded-xl border border-input bg-background px-3 text-sm">
          <option value="all">{ar ? "كل المحطات" : "All stations"}</option>
          {(stations.data ?? []).map((station) => <option key={station.id} value={station.id}>{ar ? station.name_ar || station.name : station.name}</option>)}
        </select>
        <Button type="button" variant="outline" size="sm" onClick={toggleSound}>{soundEnabled ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}{ar ? "الصوت" : "Sound"}</Button>
        <Badge variant="secondary" className="rounded-full">{ar ? "مباشر" : "Live"}</Badge>
      </div>
    </header>

    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {STAGES.map((stage) => {
        const StageIcon = stage.icon;
        const rows = visibleOrders.filter((order) => order.status === stage.id);
        return <section key={stage.id} className="rounded-3xl border bg-muted/20 p-3">
          <div className="flex items-center justify-between px-2 py-2"><div className="flex items-center gap-2 font-bold"><StageIcon className="size-4" />{ar ? stage.ar : stage.label}</div><Badge variant="secondary">{rows.length}</Badge></div>
          <div className="mt-2 space-y-3">
            {rows.map((order) => {
              const orderItems = byOrder.get(order.id) ?? [];
              const orderEvents = eventMap.get(order.id) ?? [];
              const durations = stageDurations(orderEvents, order.created_at, now);
              const currentDuration = durations.at(-1)?.seconds ?? elapsedSeconds(order.created_at, now);
              const assigned = (staff.data ?? []).find((member) => member.id === order.assigned_staff_id);
              return <article key={order.id} className={cn("rounded-2xl border bg-card p-4 shadow-sm", currentDuration > 20 * 60 && "border-amber-400")}>
                <div className="flex items-start justify-between gap-2">
                  <div><p className="text-lg font-black tabular-nums">#{order.order_number}</p><p className="text-xs text-muted-foreground">{order.table ? `${ar ? "طاولة" : "Table"} ${order.table.table_name || order.table.table_number}` : (ar ? "استلام / توصيل" : "Pickup / Delivery")}</p></div>
                  <div className="text-end"><strong className="block text-sm tabular-nums">{durationLabel(currentDuration)}</strong><span className="text-[10px] text-muted-foreground">{formatDateTime(order.created_at, lang)}</span></div>
                </div>

                <div className="mt-3">
                  <label className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{ar ? "المسؤول" : "Assigned"}</label>
                  <select value={order.assigned_staff_id ?? ""} onChange={(e) => void assign(order.id, e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-2 text-xs">
                    <option value="">{ar ? "غير مكلّف" : "Unassigned"}</option>
                    {(staff.data ?? []).map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                  </select>
                  {assigned && order.assigned_at ? <p className="mt-1 text-[10px] text-muted-foreground">{assigned.name} · {formatDateTime(order.assigned_at, lang)}</p> : null}
                </div>

                <div className="mt-4 space-y-2">{orderItems.map((item) => <div key={item.id} className="rounded-xl bg-muted/70 p-2.5"><div className="flex gap-2"><span className="font-black">×{item.quantity}</span><span className="min-w-0 flex-1 text-sm font-semibold">{ar ? item.product_name_snapshot_ar || item.product_name_snapshot_en : item.product_name_snapshot_en || item.product_name_snapshot_ar}</span></div>{item.notes ? <p className="mt-1 text-xs text-muted-foreground">{ar ? "ملاحظة" : "Note"}: {item.notes}</p> : null}</div>)}</div>
                {order.customer_notes ? <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">{ar ? "العميل" : "Customer"}: {order.customer_notes}</p> : null}

                <details className="mt-3 rounded-xl border p-2">
                  <summary className="flex cursor-pointer items-center gap-2 text-xs font-semibold"><History className="size-3.5" />{ar ? "سجل الحالة" : "Status history"}</summary>
                  <div className="mt-2 space-y-1.5">{orderEvents.length === 0 ? <p className="text-[11px] text-muted-foreground">{ar ? "لا يوجد سجل بعد." : "No history yet."}</p> : orderEvents.map((event) => <div key={event.id} className="flex items-center justify-between gap-2 text-[11px]"><span>{event.from_status ? `${event.from_status} → ${event.to_status}` : event.to_status}{event.actor_name ? ` · ${event.actor_name}` : ""}</span><span className="text-muted-foreground">{formatDateTime(event.created_at, lang)}</span></div>)}</div>
                </details>

                <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
                  <Button onClick={() => void advance(order)}>{stage.next === "served" ? <Check className="size-4" /> : null}{stage.next === "served" ? (ar ? "تم التقديم" : "Mark served") : `${ar ? "نقل إلى" : "Move to"} ${ar ? STAGES.find((item) => item.id === stage.next)?.ar : STAGES.find((item) => item.id === stage.next)?.label}`}</Button>
                  <Button type="button" variant="outline" size="icon" onClick={() => printTicket(order)} aria-label={ar ? "طباعة" : "Print"}><Printer className="size-4" /></Button>
                </div>
              </article>;
            })}
          </div>
        </section>;
      })}
    </div>
  </div>;
}
