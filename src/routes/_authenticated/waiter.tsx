import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  BellRing,
  Check,
  CircleOff,
  Clock3,
  LayoutGrid,
  ReceiptText,
  Search,
  Sparkles,
  Table2,
  Utensils,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";

import { MasterEyebrow, MasterKpi, MasterPageHeader } from "@/components/app/MasterPage";
import { EmptyState } from "@/components/common/EmptyState";
import { DetailRow, DetailSheet, formatStamp } from "@/components/operations/DetailSheet";
import { StaffHeader } from "@/components/staff/StaffHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceScope } from "@/hooks/useWorkspace";
import { humanError } from "@/lib/errors";
import { formatMoney } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { playOrderAlert, unlockAlertSound } from "@/lib/order-alert";
import { setTableServiceStatusResilient, setWaiterCallStatusResilient } from "@/lib/offline-ops";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/waiter")({
  head: () => ({
    meta: [
      { title: "Floor — QuickServe waiter" },
      { name: "description", content: "Live floor workspace for tables, guest calls and active orders." },
    ],
  }),
  component: WaiterFloor,
});

const OPEN_STATUSES = ["new", "accepted", "preparing", "ready", "served"] as const;
export const CLEANING_RELEASE_MS = 10 * 60 * 1000;
type TableServiceStatus = "free" | "reserved" | "active" | "cleaning" | "out_of_service";
type FloorFilter = "all" | "calling" | "active" | "free" | "reserved" | "cleaning";

type FloorTable = {
  id: string;
  table_number: string;
  table_name: string | null;
  service_status: TableServiceStatus;
  activated_at: string | null;
  status_updated_at: string | null;
  calling: { id: string; note: string | null; status: string } | null;
  openOrders: { id: string; order_number: string; status: string; total: number }[];
};

function cleaningRemainingMs(table: FloorTable, now: number | null) {
  if (table.service_status !== "cleaning" || !table.status_updated_at || now === null) return null;
  const started = new Date(table.status_updated_at).getTime();
  if (!Number.isFinite(started)) return null;
  return Math.max(0, started + CLEANING_RELEASE_MS - now);
}

function formatCountdown(ms: number) {
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function useFloor(restaurantId: string | null) {
  return useQuery<FloorTable[]>({
    queryKey: ["waiter", "floor", restaurantId],
    enabled: Boolean(restaurantId),
    refetchInterval: 12_000,
    staleTime: 5_000,
    queryFn: async () => {
      const [tablesRes, callsRes, ordersRes] = await Promise.all([
        (supabase.from("restaurant_tables") as any)
          .select("id,table_number,table_name,service_status,activated_at,status_updated_at")
          .eq("restaurant_id", restaurantId!)
          .eq("is_active", true)
          .order("table_number", { ascending: true }),
        supabase
          .from("waiter_calls")
          .select("id,table_id,note,status")
          .eq("restaurant_id", restaurantId!)
          .in("status", ["pending", "acknowledged"]),
        supabase
          .from("orders")
          .select("id,table_id,order_number,status,total")
          .eq("restaurant_id", restaurantId!)
          .in("status", OPEN_STATUSES),
      ]);

      if (tablesRes.error) throw tablesRes.error;
      if (callsRes.error) throw callsRes.error;
      if (ordersRes.error) throw ordersRes.error;

      return (tablesRes.data ?? []).map((table: any) => ({
        id: table.id,
        table_number: table.table_number,
        table_name: table.table_name,
        service_status: (table.service_status ?? "free") as TableServiceStatus,
        activated_at: table.activated_at ?? null,
        status_updated_at: table.status_updated_at ?? null,
        calling:
          (callsRes.data ?? [])
            .filter((call) => call.table_id === table.id)
            .map((call) => ({ id: call.id, note: call.note, status: call.status }))[0] ?? null,
        openOrders: (ordersRes.data ?? [])
          .filter((order) => order.table_id === table.id)
          .map((order) => ({
            id: order.id,
            order_number: order.order_number,
            status: order.status,
            total: Number(order.total ?? 0),
          })),
      }));
    },
  });
}

function WaiterFloor() {
  const { t, lang } = useI18n();
  const ar = lang === "ar";
  const scope = useWorkspaceScope();
  const floor = useFloor(scope.restaurantId);
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<FloorFilter>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number | null>(null);

  const rows = floor.data ?? [];
  const pending = rows.filter((table) => table.calling?.status === "pending").length;
  const active = rows.filter((table) => table.service_status === "active").length;
  const free = rows.filter((table) => table.service_status === "free").length;
  const cleaning = rows.filter((table) => table.service_status === "cleaning").length;
  const openOrders = rows.reduce((total, table) => total + table.openOrders.length, 0);
  const selected = rows.find((table) => table.id === selectedId) ?? null;
  const selectedCleaningRemaining = selected ? cleaningRemainingMs(selected, nowMs) : null;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((table) => {
      const matchesFilter =
        filter === "all"
        || (filter === "calling" && Boolean(table.calling))
        || (filter === "active" && table.service_status === "active")
        || (filter === "free" && table.service_status === "free")
        || (filter === "reserved" && table.service_status === "reserved")
        || (filter === "cleaning" && table.service_status === "cleaning");
      if (!matchesFilter) return false;
      if (!q) return true;
      return [table.table_number, table.table_name, table.service_status, ...table.openOrders.map((order) => order.order_number)]
        .some((value) => String(value ?? "").toLowerCase().includes(q));
    });
  }, [rows, filter, search]);

  useEffect(() => {
    if (pending > 0) playOrderAlert();
  }, [pending]);

  useEffect(() => {
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!scope.restaurantId) return;
    const refresh = () => void queryClient.invalidateQueries({ queryKey: ["waiter", "floor", scope.restaurantId] });
    const channel = supabase
      .channel(`waiter-floor:${scope.restaurantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "restaurant_tables", filter: `restaurant_id=eq.${scope.restaurantId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "waiter_calls", filter: `restaurant_id=eq.${scope.restaurantId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${scope.restaurantId}` }, refresh)
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, scope.restaurantId]);

  const setCall = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "acknowledged" | "resolved" }) => {
      if (!scope.restaurantId) throw new Error("Restaurant unavailable");
      return setWaiterCallStatusResilient({ restaurantId: scope.restaurantId, callId: id, status });
    },
    onSuccess: async (result, variables) => {
      if (scope.restaurantId && result.queued) {
        queryClient.setQueryData<FloorTable[]>(["waiter", "floor", scope.restaurantId], (current) =>
          (current ?? []).map((table) => table.calling?.id === variables.id
            ? { ...table, calling: variables.status === "resolved" ? null : { ...table.calling, status: variables.status } }
            : table),
        );
        toast.info(ar ? "تم حفظ الإجراء بدون اتصال وسيتم مزامنته تلقائياً" : "Action saved offline and will sync automatically");
        return;
      }
      toast.success(variables.status === "resolved" ? t("waiter.resolve") : t("waiter.acknowledge"));
      await queryClient.invalidateQueries({ queryKey: ["waiter", "floor"] });
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  const setTableFree = useMutation({
    mutationFn: async (tableId: string) => {
      if (!scope.restaurantId) throw new Error("Restaurant unavailable");
      const result = await setTableServiceStatusResilient({
        restaurantId: scope.restaurantId,
        tableId,
        status: "free",
      });
      return { ...result, tableId };
    },
    onSuccess: async (result) => {
      if (scope.restaurantId && result.queued) {
        queryClient.setQueryData<FloorTable[]>(["waiter", "floor", scope.restaurantId], (current) =>
          (current ?? []).map((table) => table.id === result.tableId
            ? { ...table, service_status: "free" as TableServiceStatus, activated_at: null }
            : table),
        );
        toast.info(ar ? "تم تحرير الطاولة محلياً وستتم المزامنة عند عودة الاتصال" : "Table released locally and will sync when connection returns");
        return;
      }
      toast.success(ar ? "تم تحرير الطاولة وأصبحت متاحة" : "Table closed and marked Free");
      await queryClient.invalidateQueries({ queryKey: ["waiter", "floor"] });
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  const filters: Array<{ id: FloorFilter; en: string; ar: string; count?: number }> = [
    { id: "all", en: "All tables", ar: "كل الطاولات", count: rows.length },
    { id: "calling", en: "Calling", ar: "يطلب خدمة", count: pending },
    { id: "active", en: "Active", ar: "نشطة", count: active },
    { id: "free", en: "Free", ar: "متاحة", count: free },
    { id: "reserved", en: "Reserved", ar: "محجوزة" },
    { id: "cleaning", en: "Cleaning", ar: "تنظيف", count: cleaning },
  ];

  return (
    <div className="min-h-screen bg-background" onPointerDown={() => void unlockAlertSound()}>
      <StaffHeader title={t("waiter.title")} />
      <main className="qs-page space-y-5">
        <MasterPageHeader
          eyebrow={<MasterEyebrow icon={Utensils}>{ar ? "أرضية المطعم" : "Live floor"}</MasterEyebrow>}
          title={ar ? "كل طاولة واضحة من أول نظرة" : "Every table, clear at a glance"}
          description={ar ? "شاهد من يطلب خدمة، ما هو قيد الطلب، وأي طاولة جاهزة للضيف التالي. مسح QR ينشّط الطاولة تلقائياً." : "See who is calling, what is being served, and which tables are ready for the next party. QR scans activate tables automatically."}
          actions={<span className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/15"><span className="size-2 rounded-full bg-emerald-500" />{ar ? "متصل مباشرة" : "Live connected"}</span>}
        />

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MasterKpi icon={Table2} label={ar ? "متاحة" : "Free"} value={free} tone="green" />
          <MasterKpi icon={UsersRound} label={ar ? "نشطة" : "Active"} value={active} tone="blue" />
          <MasterKpi icon={BellRing} label={ar ? "تطلب خدمة" : "Calling"} value={pending} tone={pending > 0 ? "red" : "slate"} />
          <MasterKpi icon={Sparkles} label={ar ? "تنظيف" : "Cleaning"} value={cleaning} tone="purple" />
          <MasterKpi icon={ReceiptText} label={ar ? "طلبات مفتوحة" : "Open orders"} value={openOrders} tone="orange" />
        </section>

        <section className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex flex-col gap-3 border-b border-border p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
            <div className="overflow-x-auto">
              <div className="flex min-w-max gap-1">
                {filters.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setFilter(item.id)}
                    className={cn(
                      "inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-bold transition",
                      filter === item.id ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {ar ? item.ar : item.en}
                    {typeof item.count === "number" ? <span className={cn("rounded-full px-1.5 py-0.5 text-[9px]", filter === item.id ? "bg-background/15" : "bg-muted")}>{item.count}</span> : null}
                  </button>
                ))}
              </div>
            </div>
            <div className="relative sm:w-[250px]">
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} className="ps-9" placeholder={ar ? "ابحث عن طاولة أو طلب" : "Search table or order"} />
            </div>
          </div>

          {floor.isPending ? (
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <Skeleton key={i} className="h-52 rounded-2xl" />)}
            </div>
          ) : floor.isError ? (
            <div className="p-8 text-center text-sm text-destructive">{humanError(floor.error, lang)}</div>
          ) : rows.length === 0 ? (
            <div className="p-5"><EmptyState icon={<Utensils className="size-6" />} title={t("empty.tables.title")} description={t("waiter.empty")} /></div>
          ) : visible.length === 0 ? (
            <div className="grid min-h-[240px] place-items-center p-8 text-center"><div><Search className="mx-auto size-8 text-muted-foreground" /><h2 className="mt-3 font-bold">{ar ? "لا توجد طاولات مطابقة" : "No matching tables"}</h2><p className="mt-1 text-xs text-muted-foreground">{ar ? "غيّر الفلتر أو عبارة البحث." : "Try a different filter or search."}</p></div></div>
          ) : (
            <div className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-3 xl:grid-cols-4">
              {visible.map((table) => (
                <FloorTableCard
                  key={table.id}
                  table={table}
                  ar={ar}
                  currency={scope.currency}
                  lang={lang}
                  nowMs={nowMs}
                  setCall={setCall}
                  setTableFree={setTableFree}
                  onOpen={() => setSelectedId(table.id)}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      <DetailSheet
        open={Boolean(selected)}
        onOpenChange={(open) => { if (!open) setSelectedId(null); }}
        title={selected ? (selected.table_name ?? `${ar ? "طاولة" : "Table"} ${selected.table_number}`) : ""}
        description={selected ? `#${selected.table_number} · ${tableStatusLabel(selected.service_status, ar)}` : undefined}
      >
        {selected ? <div>
          <div className={cn("mb-4 rounded-2xl border p-4", selected.calling ? "border-orange-300 bg-orange-50/60 dark:border-orange-900/60 dark:bg-orange-950/10" : "border-border bg-muted/30")}>
            <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.1em] text-muted-foreground">{ar ? "حالة الخدمة" : "Service status"}</p><p className="mt-1 text-lg font-bold">{selected.calling ? (ar ? "يطلب خدمة" : "Calling waiter") : tableStatusLabel(selected.service_status, ar)}</p></div><ServiceIcon table={selected} /></div>
            {selected.calling?.note ? <p className="mt-3 text-sm leading-6 text-muted-foreground">{selected.calling.note}</p> : null}
          </div>
          <DetailRow label={ar ? "رقم الطاولة" : "Table"} value={`#${selected.table_number}`} />
          <DetailRow label={ar ? "الاسم" : "Name"} value={selected.table_name} />
          <DetailRow label={ar ? "تنشيط منذ" : "Activated"} value={formatStamp(selected.activated_at, ar)} />
          <DetailRow label={ar ? "طلبات مفتوحة" : "Open orders"} value={selected.openOrders.length} />
          {selected.service_status === "cleaning" ? <DetailRow label={ar ? "متاحة خلال" : "Free in"} value={selectedCleaningRemaining === null ? "--:--" : formatCountdown(selectedCleaningRemaining)} /> : null}
          {selected.openOrders.length ? <div className="mt-5"><h3 className="text-xs font-bold uppercase tracking-[.08em] text-muted-foreground">{ar ? "الطلبات الحالية" : "Current orders"}</h3><div className="mt-2 space-y-2">{selected.openOrders.map((order) => <div key={order.id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"><div className="min-w-0"><strong className="block truncate text-sm">{order.order_number}</strong><span className="text-[10px] capitalize text-muted-foreground">{order.status}</span></div><strong className="shrink-0 text-xs">{formatMoney(order.total, scope.currency, lang)}</strong></div>)}</div></div> : null}
          {selected.calling ? <div className="mt-5 grid grid-cols-2 gap-2">{selected.calling.status === "pending" ? <Button disabled={setCall.isPending} onClick={() => setCall.mutate({ id: selected.calling!.id, status: "acknowledged" })}><BellRing className="size-4" />{t("waiter.acknowledge")}</Button> : <div /> }<Button variant="outline" disabled={setCall.isPending} onClick={() => setCall.mutate({ id: selected.calling!.id, status: "resolved" })}><Check className="size-4" />{t("waiter.resolve")}</Button></div> : null}
          {selected.service_status === "active" && selected.openOrders.length === 0 ? <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/10"><p className="text-sm font-bold">{ar ? "جاهزة للإغلاق" : "Ready to close"}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{ar ? "إذا غادر الضيوف وتم ترتيب الطاولة، حررها للضيف التالي." : "When the guests have left and the table is cleared, release it for the next party."}</p><Button variant="outline" className="mt-3 w-full" disabled={setTableFree.isPending} onClick={() => setTableFree.mutate(selected.id)}><CircleOff className="size-4" />{ar ? "اجعل الطاولة متاحة" : "Mark table Free"}</Button></div> : null}
        </div> : null}
      </DetailSheet>
    </div>
  );
}


function FloorTableCard({
  table,
  ar,
  currency,
  lang,
  nowMs,
  setCall,
  setTableFree,
  onOpen,
}: {
  table: FloorTable;
  ar: boolean;
  currency: string;
  lang: "en" | "ar";
  nowMs: number | null;
  setCall: { isPending: boolean; mutate: (variables: { id: string; status: "acknowledged" | "resolved" }) => void };
  setTableFree: { isPending: boolean; mutate: (tableId: string) => void };
  onOpen: () => void;
}) {
  const calling = Boolean(table.calling);
  const busy = table.openOrders.length > 0;
  const canClose = table.service_status === "active" && !busy;
  const isCleaning = table.service_status === "cleaning";
  const cleaningRemaining = cleaningRemainingMs(table, nowMs);

  return <article
    role="button"
    tabIndex={0}
    onClick={onOpen}
    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(); } }}
    className={cn(
      "group flex min-h-[220px] cursor-pointer flex-col rounded-2xl border bg-card p-4 text-start outline-none transition hover:-translate-y-0.5 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-[#e85d2a]",
      calling ? "border-orange-400 ring-2 ring-orange-500/20" : isCleaning ? "border-purple-300 ring-2 ring-purple-500/15" : "border-border",
    )}
  >
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-3"><span className={cn("grid size-12 shrink-0 place-items-center rounded-2xl font-display text-lg font-bold", calling ? "bg-orange-500 text-white" : isCleaning ? "bg-purple-500/10 text-purple-700 dark:text-purple-300" : table.service_status === "free" ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-foreground")}>T{table.table_number}</span><div className="min-w-0"><h2 className="truncate text-sm font-bold">{table.table_name ?? `${ar ? "طاولة" : "Table"} ${table.table_number}`}</h2><p className="mt-0.5 text-[10px] text-muted-foreground">{busy ? `${table.openOrders.length} ${ar ? "طلبات مفتوحة" : "open orders"}` : ar ? "لا يوجد طلب مفتوح" : "No open orders"}</p></div></div>
      <Badge variant="outline" className={cn("shrink-0", calling ? "border-orange-300 bg-orange-50 text-orange-700 dark:bg-orange-950/20" : isCleaning ? "border-purple-200 bg-purple-50 text-purple-700 dark:bg-purple-950/20 dark:text-purple-300" : table.service_status === "free" ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20" : "")}>{calling ? (ar ? "ينادي" : "Calling") : tableStatusLabel(table.service_status, ar)}</Badge>
    </div>

    <div className="mt-4 flex-1">
      {calling ? <div className="rounded-xl bg-orange-50/70 p-3 dark:bg-orange-950/15"><p className="inline-flex items-center gap-2 text-xs font-bold text-orange-700 dark:text-orange-300"><BellRing className="size-4" />{ar ? "ضيف ينتظر الخدمة" : "Guest is waiting"}</p>{table.calling?.note ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{table.calling.note}</p> : null}</div> : isCleaning ? <div className="rounded-xl bg-purple-50/70 p-3 dark:bg-purple-950/15"><p className="inline-flex items-center gap-2 text-xs font-bold text-purple-700 dark:text-purple-300"><Sparkles className="size-4" />{ar ? "قيد التنظيف" : "Being cleaned"}</p><p className="mt-1 font-display text-lg font-bold tabular-nums text-purple-700 dark:text-purple-300">{cleaningRemaining === null ? "--:--" : formatCountdown(cleaningRemaining)}</p><p className="text-[10px] text-muted-foreground">{ar ? "ستصبح متاحة تلقائياً" : "Frees up automatically"}</p></div> : busy ? <div className="space-y-2">{table.openOrders.slice(0, 2).map((order) => <div key={order.id} className="flex items-center justify-between gap-2 rounded-xl bg-muted/45 px-3 py-2 text-[10px]"><span className="min-w-0 truncate font-bold">{order.order_number}</span><span className="shrink-0 capitalize text-muted-foreground">{order.status} · {formatMoney(order.total, currency, lang)}</span></div>)}{table.openOrders.length > 2 ? <p className="text-[10px] font-semibold text-muted-foreground">+{table.openOrders.length - 2} {ar ? "طلبات أخرى" : "more orders"}</p> : null}</div> : <div className="grid min-h-[72px] place-items-center rounded-xl border border-dashed border-border text-center"><div><Sparkles className="mx-auto size-4 text-muted-foreground" /><p className="mt-1 text-[10px] font-semibold text-muted-foreground">{table.service_status === "free" ? (ar ? "جاهزة للضيف التالي" : "Ready for the next party") : tableStatusLabel(table.service_status, ar)}</p></div></div>}
    </div>

    <div className="mt-4 flex gap-2 border-t border-border/70 pt-3" onClick={(event) => event.stopPropagation()}>
      {table.calling?.status === "pending" ? <Button size="sm" className="flex-1" disabled={setCall.isPending} onClick={() => setCall.mutate({ id: table.calling!.id, status: "acknowledged" })}><BellRing className="size-4" />{ar ? "استلام" : "Acknowledge"}</Button> : null}
      {table.calling ? <Button size="sm" variant="outline" className="flex-1" disabled={setCall.isPending} onClick={() => setCall.mutate({ id: table.calling!.id, status: "resolved" })}><Check className="size-4" />{ar ? "تم" : "Resolve"}</Button> : null}
      {canClose ? <Button size="sm" variant="outline" className="flex-1" disabled={setTableFree.isPending} onClick={() => setTableFree.mutate(table.id)}><CircleOff className="size-4" />{ar ? "متاحة" : "Mark Free"}</Button> : null}
      {!table.calling && !canClose ? <span className="inline-flex flex-1 items-center gap-2 text-[10px] font-semibold text-muted-foreground"><Clock3 className="size-3.5" />{busy ? (ar ? "الخدمة جارية" : "Service in progress") : tableStatusLabel(table.service_status, ar)}</span> : null}
    </div>
  </article>;
}

function ServiceIcon({ table }: { table: FloorTable }) {
  if (table.service_status === "cleaning") return <span className="grid size-11 place-items-center rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-300"><Sparkles className="size-5" /></span>;
  if (table.calling) return <span className="grid size-11 place-items-center rounded-2xl bg-orange-500 text-white"><BellRing className="size-5" /></span>;
  if (table.openOrders.length) return <span className="grid size-11 place-items-center rounded-2xl bg-blue-500/10 text-blue-600"><ReceiptText className="size-5" /></span>;
  return <span className="grid size-11 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-600"><LayoutGrid className="size-5" /></span>;
}

function tableStatusLabel(status: TableServiceStatus, ar: boolean) {
  const labels: Record<TableServiceStatus, [string, string]> = {
    free: ["Free", "متاحة"],
    reserved: ["Reserved", "محجوزة"],
    active: ["Active", "نشطة"],
    cleaning: ["Cleaning", "تنظيف"],
    out_of_service: ["Out of service", "خارج الخدمة"],
  };
  return labels[status][ar ? 1 : 0];
}
