import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BellRing,
  BellOff,
  Volume2,
  VolumeX,
  Timer,
  StickyNote,
  Search,
  LayoutGrid,
  Rows3,
  CalendarClock,
  Settings2,
  X,
  ChefHat,
  History,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { detectTags, TAG_META, type DietTag } from "@/lib/kitchen-tags";
import { anyRoleHasCapability, MANAGEMENT_ROLES, type AppRole } from "@/lib/permissions";
import {
  CANCEL_REASONS,
  LATE_STAGES,
  assignOrderToStaff,
  cancelOrder,
  durationLabel,
  fetchStatusEvents,
  stageDurations,
  type StatusEvent,
} from "@/lib/order-ops";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";


type OrderStatus = Database["public"]["Enums"]["order_status"];
type ViewMode = "board" | "list" | "schedule";
type BoardLayout = "columns" | "lanes";
type QuickFilter = "all" | "pending" | "inprep" | "ready" | "overdue";

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

const FILTER_LABELS: Record<QuickFilter, { en: string; ar: string }> = {
  all: { en: "All", ar: "الكل" },
  pending: { en: "Pending", ar: "بالانتظار" },
  inprep: { en: "In prep", ar: "قيد التحضير" },
  ready: { en: "Ready", ar: "جاهز" },
  overdue: { en: "Overdue", ar: "متأخر" },
};

const PREFS_KEY = "quickserve.kitchen.prefs";

type Prefs = {
  soundOn: boolean;
  warnMinutes: number;
  lateMinutes: number;
  layout: BoardLayout;
  view: ViewMode;
  compact: boolean;
};

const DEFAULT_PREFS: Prefs = {
  soundOn: true,
  warnMinutes: 5,
  lateMinutes: 10,
  layout: "columns",
  view: "board",
  compact: false,
};

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
        content:
          "Live kitchen display with board, list and schedule views, station filters and allergen flags.",
      },
      { property: "og:title", content: "Kitchen display — QuickServe" },
      { property: "og:description", content: "Incoming table orders for the kitchen." },
    ],
  }),
  component: KitchenPage,
});

type OrderRow = {
  id: string;
  order_number: string;
  status: OrderStatus;
  total: number;
  currency: string;
  customer_notes: string | null;
  created_at: string;
  assigned_staff_id: string | null;
  assigned_at: string | null;
  table: { table_number: string; table_name: string | null } | null;
  items: {
    id: string;
    quantity: number;
    product_name_en: string;
    product_name_ar: string;
    notes: string | null;
    selected_modifiers: unknown;
  }[];
};

type StaffOption = { id: string; name: string; role: AppRole };


function KitchenPage() {
  const { lang, pick } = useI18n();
  const queryClient = useQueryClient();
  const memberships = useMemberships();
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<QuickFilter>("all");
  const [section, setSection] = useState<string>("all");
  const [live, setLive] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [cancelTarget, setCancelTarget] = useState<OrderRow | null>(null);
  const [openLog, setOpenLog] = useState<OrderRow | null>(null);
  const seenRef = useRef<Set<string> | null>(null);
  const ar = lang === "ar";


  const setPref = useCallback(<K extends keyof Prefs>(key: K, value: Prefs[K]) => {
    setPrefs((p) => ({ ...p, [key]: value }));
  }, []);

  // Load / persist display preferences per device.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PREFS_KEY);
      if (raw) setPrefs({ ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) });
    } catch {
      /* ignore malformed prefs */
    }
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* storage unavailable */
    }
  }, [prefs]);

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

  // Roles held in the active restaurant decide price visibility and whether
  // late-stage cancellations are allowed without a manager override.
  const activeRoles = useMemo<AppRole[]>(() => {
    const rows = memberships.data ?? [];
    return rows
      .filter((m) => m.restaurant_id === activeId || m.restaurant_id === null)
      .map((m) => m.role);
  }, [memberships.data, activeId]);
  const canViewPrices = anyRoleHasCapability(activeRoles, "view_order_prices");
  const isManager = activeRoles.some((r) => MANAGEMENT_ROLES.includes(r));

  const orders = useQuery({
    queryKey: ["kitchen", "orders", activeId],
    enabled: Boolean(activeId),
    refetchInterval: 20000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, order_number, status, total, currency, customer_notes, created_at, assigned_staff_id, assigned_at, table:restaurant_tables(table_number, table_name), items:order_items(id, quantity, product_name_en:product_name_snapshot_en, product_name_ar:product_name_snapshot_ar, notes, selected_modifiers)",
        )
        .eq("restaurant_id", activeId!)
        .in("status", ["new", "accepted", "preparing", "ready"])
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as OrderRow[];
    },
  });

  const staffOptions = useQuery({
    queryKey: ["kitchen", "staff", activeId],
    enabled: Boolean(activeId),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff")
        .select("id, name, role")
        .eq("restaurant_id", activeId!)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as StaffOption[];
    },
  });

  const activeOrderIds = (orders.data ?? []).map((o) => o.id);
  const statusLog = useQuery({
    queryKey: ["kitchen", "events", activeId, activeOrderIds.join(",")],
    enabled: activeOrderIds.length > 0,
    queryFn: () => fetchStatusEvents(activeOrderIds),
  });

  const eventsByOrder = useMemo(() => {
    const map = new Map<string, StatusEvent[]>();
    (statusLog.data ?? []).forEach((ev) => {
      const list = map.get(ev.order_id) ?? [];
      list.push(ev);
      map.set(ev.order_id, list);
    });
    return map;
  }, [statusLog.data]);

  async function assign(orderId: string, staffId: string | null) {
    try {
      await assignOrderToStaff(orderId, staffId);
      await queryClient.invalidateQueries({ queryKey: ["kitchen"] });
      toast.success(ar ? "تم تعيين الطلب" : "Order assigned");
    } catch (error) {
      toast.error(humanError(error, lang));
    }
  }


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
            if (prefs.soundOn) playOrderAlert();
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
          if (prefs.soundOn) playOrderAlert();
          toast.info(ar ? "طلب مناداة نادل" : "A table is calling a waiter");
        },
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"));

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeId, queryClient, prefs.soundOn, ar]);

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
    if (fresh && prefs.soundOn && !live) playOrderAlert();
  }, [orders.data, prefs.soundOn, live]);

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

  const allRows = orders.data ?? [];

  const sections = useMemo(() => {
    const set = new Set<string>();
    allRows.forEach((o) => {
      if (o.table?.table_name) set.add(o.table.table_name);
    });
    return [...set].sort();
  }, [allRows]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter((o) => {
      const age = Math.floor((now - new Date(o.created_at).getTime()) / 60000);
      if (filter === "pending" && o.status !== "new") return false;
      if (filter === "inprep" && o.status !== "accepted" && o.status !== "preparing") return false;
      if (filter === "ready" && o.status !== "ready") return false;
      if (filter === "overdue" && age < prefs.lateMinutes) return false;
      if (section !== "all" && o.table?.table_name !== section) return false;
      if (!q) return true;
      const haystack = [
        o.order_number,
        o.table?.table_number,
        o.table?.table_name,
        o.customer_notes,
        ...(o.items ?? []).flatMap((i) => [i.product_name_en, i.product_name_ar, i.notes]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [allRows, search, filter, section, prefs.lateMinutes, now]);

  const oldest = rows.length
    ? elapsed(rows.reduce((a, b) => (a.created_at < b.created_at ? a : b)).created_at, now)
    : null;
  const activeCount = rows.filter((o) => o.status !== "ready").length;
  const overdueCount = allRows.filter(
    (o) => Math.floor((now - new Date(o.created_at).getTime()) / 60000) >= prefs.lateMinutes,
  ).length;

  const filterCounts: Record<QuickFilter, number> = {
    all: allRows.length,
    pending: allRows.filter((o) => o.status === "new").length,
    inprep: allRows.filter((o) => o.status === "accepted" || o.status === "preparing").length,
    ready: allRows.filter((o) => o.status === "ready").length,
    overdue: overdueCount,
  };

  const renderTicket = (order: OrderRow, opts: { dense?: boolean } = {}) => (
    <Ticket
      key={order.id}
      order={order}
      now={now}
      ar={ar}
      lang={lang}
      pick={pick}
      warnMinutes={prefs.warnMinutes}
      lateMinutes={prefs.lateMinutes}
      compact={prefs.compact || opts.dense === true}
      canViewPrices={canViewPrices}
      staff={staffOptions.data ?? []}
      events={eventsByOrder.get(order.id) ?? []}
      onAdvance={advance}
      onAssign={assign}
      onRequestCancel={setCancelTarget}
      onOpenLog={setOpenLog}
    />
  );


  if (memberships.isPending) return <Skeleton className="m-6 h-64 rounded-3xl" />;

  if (options.length === 0) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <p className="text-sm text-muted-foreground">
          {ar ? "حسابك غير مرتبط بمطعم بعد." : "Your account is not linked to a restaurant yet."}
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/dashboard">{ar ? "لوحة التحكم" : "Dashboard"}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto max-w-[1800px] space-y-3 px-4 py-3">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">
                {ar ? "شاشة المطبخ" : "Kitchen display"}
              </h1>
              <p className="mt-0.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {activeCount} {ar ? "طلب قيد التنفيذ" : "orders in progress"}
                {overdueCount > 0 ? (
                  <span className="text-destructive">
                    {" · "}
                    {overdueCount} {ar ? "متأخر" : "overdue"}
                  </span>
                ) : null}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span
                className={cn(
                  "hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider sm:flex",
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
                  const next = !prefs.soundOn;
                  setPref("soundOn", next);
                  if (next) void unlockAlertSound().then(() => playOrderAlert());
                }}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors",
                  prefs.soundOn ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
                )}
              >
                {prefs.soundOn ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
                {ar ? "الصوت" : "Sound"}
              </button>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="icon" className="size-9 rounded-full">
                    <Settings2 className="size-4" />
                    <span className="sr-only">{ar ? "إعدادات العرض" : "Display settings"}</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72 space-y-4">
                  <p className="text-sm font-semibold">
                    {ar ? "إعدادات شاشة المطبخ" : "Kitchen display settings"}
                  </p>
                  <div className="flex items-center justify-between gap-3">
                    <Label className="text-xs">{ar ? "تنبيه صوتي" : "Sound alerts"}</Label>
                    <Switch
                      checked={prefs.soundOn}
                      onCheckedChange={(v) => {
                        setPref("soundOn", v);
                        if (v) void unlockAlertSound();
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <Label className="text-xs">{ar ? "بطاقات مضغوطة" : "Compact tickets"}</Label>
                    <Switch
                      checked={prefs.compact}
                      onCheckedChange={(v) => setPref("compact", v)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">{ar ? "تحذير (دقيقة)" : "Warn (min)"}</Label>
                      <Input
                        type="number"
                        min="1"
                        max="120"
                        value={prefs.warnMinutes}
                        onChange={(e) =>
                          setPref("warnMinutes", Math.max(1, Number(e.target.value) || 1))
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">{ar ? "متأخر (دقيقة)" : "Overdue (min)"}</Label>
                      <Input
                        type="number"
                        min="2"
                        max="180"
                        value={prefs.lateMinutes}
                        onChange={(e) =>
                          setPref("lateMinutes", Math.max(2, Number(e.target.value) || 2))
                        }
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{ar ? "تخطيط اللوحة" : "Board layout"}</Label>
                    <Select
                      value={prefs.layout}
                      onValueChange={(v) => setPref("layout", v as BoardLayout)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="columns">
                          {ar ? "أعمدة (٤ مراحل)" : "Columns (4 stages)"}
                        </SelectItem>
                        <SelectItem value="lanes">
                          {ar ? "مسارات أفقية" : "Horizontal lanes"}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* View switcher + search */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-full bg-muted p-1">
              {(
                [
                  { key: "board", icon: LayoutGrid, en: "Board", ar: "لوحة" },
                  { key: "list", icon: Rows3, en: "List", ar: "قائمة" },
                  { key: "schedule", icon: CalendarClock, en: "Schedule", ar: "الجدول" },
                ] as const
              ).map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => setPref("view", v.key)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors",
                    prefs.view === v.key
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground",
                  )}
                >
                  <v.icon className="size-3.5" />
                  {ar ? v.ar : v.en}
                </button>
              ))}
            </div>

            <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  ar ? "بحث برقم الطلب أو الطاولة أو الطبق" : "Search order, table or item"
                }
                className="h-9 rounded-full ps-9 pe-9"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute inset-y-0 end-2 my-auto grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-muted"
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>

            {sections.length > 0 ? (
              <Select value={section} onValueChange={setSection}>
                <SelectTrigger className="h-9 w-44 rounded-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{ar ? "كل الأقسام" : "All sections"}</SelectItem>
                  {sections.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}

            {options.length > 1 ? (
              <Select value={activeId ?? ""} onValueChange={setRestaurantId}>
                <SelectTrigger className="h-9 w-52 rounded-full">
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

          {/* Quick filters */}
          <div className="flex flex-wrap items-center gap-2">
            {(["all", "pending", "inprep", "ready", "overdue"] as QuickFilter[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors",
                  filter === key
                    ? key === "overdue"
                      ? "bg-destructive text-destructive-foreground"
                      : "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:bg-muted/70",
                )}
              >
                {FILTER_LABELS[key][lang]}
                <span className="tabular-nums opacity-70">{filterCounts[key]}</span>
              </button>
            ))}
            {oldest ? (
              <span
                className={cn(
                  "ms-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold tabular-nums",
                  oldest.minutes >= prefs.lateMinutes
                    ? "bg-destructive/15 text-destructive"
                    : oldest.minutes >= prefs.warnMinutes
                      ? "bg-warning/20 text-foreground"
                      : "bg-muted text-muted-foreground",
                )}
              >
                <Timer className="size-3.5" />
                {ar ? "أقدم طلب" : "Oldest ticket"} {oldest.label}
              </span>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1800px] px-4 py-6">
        {orders.isPending ? (
          <Skeleton className="h-64 rounded-3xl" />
        ) : rows.length === 0 ? (
          <p className="flex h-40 items-center justify-center rounded-3xl border-2 border-dashed border-border text-center text-sm text-muted-foreground">
            {ar ? "لا توجد تذاكر مطابقة" : "No tickets match the current filters"}
          </p>
        ) : prefs.view === "list" ? (
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {[...rows]
              .sort((a, b) => a.created_at.localeCompare(b.created_at))
              .map((order) => renderTicket(order, { dense: true }))}
          </div>
        ) : prefs.view === "schedule" ? (
          <ScheduleView
            rows={rows}
            now={now}
            ar={ar}
            lateMinutes={prefs.lateMinutes}
            warnMinutes={prefs.warnMinutes}
            renderTicket={(o) => renderTicket(o, { dense: true })}
          />
        ) : (
          <div
            className={cn(
              prefs.layout === "columns"
                ? "space-y-8 xl:grid xl:grid-cols-4 xl:items-start xl:gap-5 xl:space-y-0"
                : "space-y-8",
            )}
          >
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
                  ) : prefs.layout === "lanes" ? (
                    <div className="flex snap-x gap-3 overflow-x-auto pb-2">
                      {laneOrders.map((order) => (
                        <div
                          key={order.id}
                          className="w-[320px] shrink-0 snap-start sm:w-[360px]"
                        >
                          {renderTicket(order)}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {laneOrders.map((order) => renderTicket(order))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

function ScheduleView({
  rows,
  now,
  ar,
  warnMinutes,
  lateMinutes,
  renderTicket,
}: {
  rows: OrderRow[];
  now: number;
  ar: boolean;
  warnMinutes: number;
  lateMinutes: number;
  renderTicket: (order: OrderRow) => React.ReactNode;
}) {
  const buckets = useMemo(() => {
    const groups: { key: string; label: { en: string; ar: string }; orders: OrderRow[] }[] = [
      { key: "overdue", label: { en: "Overdue", ar: "متأخر" }, orders: [] },
      { key: "due", label: { en: "Due now", ar: "يحين الآن" }, orders: [] },
      { key: "soon", label: { en: "Just placed", ar: "طلبات جديدة" }, orders: [] },
    ];
    rows.forEach((o) => {
      const mins = Math.floor((now - new Date(o.created_at).getTime()) / 60000);
      const target = mins >= lateMinutes ? groups[0] : mins >= warnMinutes ? groups[1] : groups[2];
      target!.orders.push(o);
    });
    groups.forEach((g) => g.orders.sort((a, b) => a.created_at.localeCompare(b.created_at)));
    return groups;
  }, [rows, now, warnMinutes, lateMinutes]);

  return (
    <div className="space-y-8">
      {buckets.map((bucket) => (
        <section key={bucket.key} className="space-y-3">
          <div className="flex items-center gap-3 px-1">
            <h2
              className={cn(
                "text-xs font-bold uppercase tracking-[0.18em]",
                bucket.key === "overdue" ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {ar ? bucket.label.ar : bucket.label.en}
            </h2>
            <Badge variant="outline" className="rounded-full tabular-nums">
              {bucket.orders.length}
            </Badge>
            <span className="h-px flex-1 bg-border" />
          </div>
          {bucket.orders.length === 0 ? (
            <p className="flex h-16 items-center justify-center rounded-3xl border-2 border-dashed border-border text-xs text-muted-foreground">
              {ar ? "لا شيء هنا" : "Nothing here"}
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {bucket.orders.map((o) => renderTicket(o))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function TagChips({ tags, ar }: { tags: DietTag[]; ar: boolean }) {
  if (tags.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <span
          key={tag}
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
            TAG_META[tag].tone,
          )}
          title={ar ? TAG_META[tag].ar : TAG_META[tag].en}
        >
          <span aria-hidden>{TAG_META[tag].icon}</span>
          {ar ? TAG_META[tag].ar : TAG_META[tag].en}
        </span>
      ))}
    </span>
  );
}

function Ticket({
  order,
  now,
  ar,
  lang,
  pick,
  warnMinutes,
  lateMinutes,
  compact,
  onAdvance,
}: {
  order: OrderRow;
  now: number;
  ar: boolean;
  lang: "en" | "ar";
  pick: (en: string, arText: string) => string;
  warnMinutes: number;
  lateMinutes: number;
  compact: boolean;
  onAdvance: (id: string, next: OrderStatus) => Promise<void>;
}) {
  const age = elapsed(order.created_at, now);
  const overdue = age.minutes >= lateMinutes;
  const warn = !overdue && age.minutes >= warnMinutes;
  const isNew = order.status === "new";
  const next = LANE.find((l) => l.status === order.status)?.next ?? null;

  const orderTags = useMemo(() => {
    const texts = (order.items ?? []).flatMap((i) => {
      const mods = Array.isArray(i.selected_modifiers)
        ? (i.selected_modifiers as { name_en?: string; name_ar?: string }[]).flatMap((m) => [
            m.name_en ?? "",
            m.name_ar ?? "",
          ])
        : [];
      return [i.product_name_en, i.product_name_ar, i.notes ?? "", ...mods];
    });
    return detectTags(...texts, order.customer_notes);
  }, [order]);

  return (
    <article
      className={cn(
        "animate-fade-in flex h-full flex-col overflow-hidden rounded-3xl border bg-card shadow-[0_4px_20px_-8px_oklch(0.2_0.02_60_/_0.18)]",
        overdue
          ? "border-destructive/40 ring-2 ring-destructive/60"
          : warn
            ? "border-warning/50 ring-1 ring-warning/50"
            : isNew
              ? "border-accent/40 ring-2 ring-accent/60"
              : "border-border",
      )}
    >
      <div className={cn("flex-1 space-y-3", compact ? "p-3.5" : "space-y-4 p-4 sm:p-5")}>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded-lg bg-foreground px-2 py-1 text-xs font-bold text-background tabular-nums">
                {order.table?.table_number
                  ? `${ar ? "طاولة" : "Table"} ${order.table.table_number}`
                  : ar
                    ? "بدون طاولة"
                    : "No table"}
              </span>
              {order.table?.table_name ? (
                <span className="rounded-lg bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">
                  {order.table.table_name}
                </span>
              ) : null}
              <Badge variant="outline" className="rounded-lg text-[10px] uppercase">
                {STATUS_LABELS[order.status][lang]}
              </Badge>
            </div>
            <p className="truncate text-lg font-bold tabular-nums">{order.order_number}</p>
            <TagChips tags={orderTags} ar={ar} />
          </div>
          <div
            className={cn(
              "shrink-0 rounded-2xl px-3 py-2 text-center",
              overdue
                ? "animate-pulse bg-destructive text-destructive-foreground"
                : warn
                  ? "bg-warning/25 text-foreground"
                  : "bg-muted text-foreground",
            )}
          >
            <span className="block text-lg font-bold leading-none tabular-nums">{age.label}</span>
            <span className="text-[9px] font-bold uppercase tracking-widest opacity-80">
              {overdue ? (ar ? "متأخر" : "Overdue") : ar ? "منقضي" : "Elapsed"}
            </span>
          </div>
        </div>

        <ul className={cn(compact ? "space-y-2" : "space-y-3")}>
          {(order.items ?? []).map((item) => {
            const mods = Array.isArray(item.selected_modifiers)
              ? (item.selected_modifiers as { name_en: string; name_ar: string }[])
              : [];
            const itemTags = detectTags(
              item.product_name_en,
              item.product_name_ar,
              item.notes,
              ...mods.flatMap((m) => [m.name_en, m.name_ar]),
            );
            return (
              <li key={item.id} className="flex gap-3">
                <span
                  className={cn(
                    "grid shrink-0 place-items-center rounded-xl bg-muted font-bold tabular-nums",
                    compact ? "size-8 text-base" : "size-10 text-lg",
                  )}
                >
                  {item.quantity}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "font-bold leading-tight",
                      compact ? "text-sm" : "text-base sm:text-lg",
                    )}
                  >
                    {pick(item.product_name_en, item.product_name_ar)}
                  </p>
                  {mods.length > 0 ? (
                    <p className="mt-1 flex flex-wrap gap-1">
                      {mods.map((m, i) => (
                        <span
                          key={`${item.id}-${i}`}
                          className="rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-foreground"
                        >
                          + {pick(m.name_en, m.name_ar)}
                        </span>
                      ))}
                    </p>
                  ) : null}
                  {item.notes ? (
                    <p className="mt-1 rounded-md bg-warning/25 px-1.5 py-0.5 text-sm font-bold">
                      ⚠ {item.notes}
                    </p>
                  ) : null}
                  {itemTags.length > 0 ? (
                    <span className="mt-1 flex flex-wrap gap-1">
                      {itemTags.map((tag) => (
                        <span
                          key={tag}
                          aria-label={ar ? TAG_META[tag].ar : TAG_META[tag].en}
                          title={ar ? TAG_META[tag].ar : TAG_META[tag].en}
                          className={cn(
                            "grid size-6 place-items-center rounded-full text-xs",
                            TAG_META[tag].tone,
                          )}
                        >
                          {TAG_META[tag].icon}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </div>
              </li>
            );
          })}
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

        <p className="text-xs font-semibold tabular-nums text-muted-foreground">
          {formatMoney(order.total, order.currency, lang)}
        </p>
      </div>

      <div className="flex gap-2 border-t border-border bg-muted/40 p-2">
        {next ? (
          <Button
            size="lg"
            className={cn("flex-[3] rounded-2xl text-base font-bold", compact ? "h-12" : "h-14")}
            onClick={() => void onAdvance(order.id, next)}
          >
            {NEXT_LABELS[next]?.[lang] ?? next}
          </Button>
        ) : null}
        <Button
          size="lg"
          variant="outline"
          className={cn(
            "flex-1 rounded-2xl text-xs font-bold uppercase tracking-wider text-muted-foreground",
            compact ? "h-12" : "h-14",
          )}
          onClick={() => void onAdvance(order.id, "cancelled")}
        >
          {ar ? "إلغاء" : "Cancel"}
        </Button>
      </div>
    </article>
  );
}
