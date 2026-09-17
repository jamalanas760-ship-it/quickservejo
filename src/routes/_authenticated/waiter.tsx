import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { BellRing, Check, CircleOff, Utensils } from "lucide-react";
import { toast } from "sonner";

import { StaffHeader } from "@/components/staff/StaffHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceScope } from "@/hooks/useWorkspace";
import { useI18n } from "@/lib/i18n";
import { formatMoney } from "@/lib/format";
import { humanError } from "@/lib/errors";
import { playOrderAlert, unlockAlertSound } from "@/lib/order-alert";

export const Route = createFileRoute("/_authenticated/waiter")({
  head: () => ({ meta: [{ title: "Table status — QuickServe waiter" }, { name: "description", content: "Live QuickServe floor view with active table lifecycle, waiter calls and orders." }] }),
  component: WaiterFloor,
});

const OPEN_STATUSES = ["new", "accepted", "preparing", "ready", "served"] as const;
type TableServiceStatus = "free" | "reserved" | "active" | "cleaning" | "out_of_service";
type FloorTable = {
  id: string; table_number: string; table_name: string | null; service_status: TableServiceStatus; activated_at: string | null;
  calling: { id: string; note: string | null; status: string } | null;
  openOrders: { id: string; order_number: string; status: string; total: number }[];
};

function useFloor(restaurantId: string | null) {
  return useQuery<FloorTable[]>({
    queryKey: ["waiter", "floor", restaurantId], enabled: Boolean(restaurantId), refetchInterval: 10_000,
    queryFn: async () => {
      const [tablesRes, callsRes, ordersRes] = await Promise.all([
        (supabase.from("restaurant_tables") as any).select("id,table_number,table_name,service_status,activated_at").eq("restaurant_id", restaurantId!).eq("is_active", true).order("table_number", { ascending: true }),
        supabase.from("waiter_calls").select("id,table_id,note,status").eq("restaurant_id", restaurantId!).in("status", ["pending", "acknowledged"]),
        supabase.from("orders").select("id,table_id,order_number,status,total").eq("restaurant_id", restaurantId!).in("status", OPEN_STATUSES),
      ]);
      if (tablesRes.error) throw tablesRes.error; if (callsRes.error) throw callsRes.error; if (ordersRes.error) throw ordersRes.error;
      return (tablesRes.data ?? []).map((table: any) => ({
        id: table.id, table_number: table.table_number, table_name: table.table_name,
        service_status: (table.service_status ?? "free") as TableServiceStatus, activated_at: table.activated_at ?? null,
        calling: (callsRes.data ?? []).filter((c) => c.table_id === table.id).map((c) => ({ id: c.id, note: c.note, status: c.status }))[0] ?? null,
        openOrders: (ordersRes.data ?? []).filter((o) => o.table_id === table.id).map((o) => ({ id: o.id, order_number: o.order_number, status: o.status, total: Number(o.total ?? 0) })),
      }));
    },
  });
}

function WaiterFloor() {
  const { t, lang } = useI18n(); const ar = lang === "ar"; const scope = useWorkspaceScope(); const floor = useFloor(scope.restaurantId); const queryClient = useQueryClient();
  const pending = (floor.data ?? []).filter((tb) => tb.calling?.status === "pending").length;
  useEffect(() => { if (pending > 0) playOrderAlert(); }, [pending]);
  useEffect(() => {
    if (!scope.restaurantId) return;
    const refresh = () => void queryClient.invalidateQueries({ queryKey: ["waiter", "floor", scope.restaurantId] });
    const channel = supabase.channel(`waiter-floor:${scope.restaurantId}`).on("postgres_changes", { event: "UPDATE", schema: "public", table: "restaurant_tables", filter: `restaurant_id=eq.${scope.restaurantId}` }, refresh).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [queryClient, scope.restaurantId]);

  const setCall = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "acknowledged" | "resolved" }) => {
      const now = new Date().toISOString(); const patch = status === "acknowledged" ? { status, acknowledged_at: now } : { status, resolved_at: now };
      const { error } = await supabase.from("waiter_calls").update(patch).eq("id", id); if (error) throw error;
    },
    onSuccess: async (_data, variables) => { toast.success(variables.status === "resolved" ? t("waiter.resolve") : t("waiter.acknowledge")); await queryClient.invalidateQueries({ queryKey: ["waiter", "floor"] }); },
    onError: (error) => toast.error(humanError(error, lang)),
  });
  const setTableFree = useMutation({
    mutationFn: async (tableId: string) => {
      const { error } = await (supabase as any).rpc("set_table_service_status", { _table_id: tableId, _status: "free" });
      if (error) throw error;
    },
    onSuccess: async () => { toast.success(ar ? "تم تحرير الطاولة وأصبحت متاحة" : "Table closed and marked Free"); await queryClient.invalidateQueries({ queryKey: ["waiter", "floor"] }); },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  return <div className="min-h-screen bg-background" onPointerDown={() => void unlockAlertSound()}>
    <StaffHeader title={t("waiter.title")} />
    <main className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6 sm:px-6">
      <div><h1 className="text-2xl font-semibold tracking-tight">{t("waiter.title")}</h1><p className="mt-1 text-sm text-muted-foreground">{ar ? "مسح QR ينشّط الطاولة تلقائياً. بعد انتهاء الطلب ومغادرة الضيوف، حرّر الطاولة من هنا." : "A QR scan activates the table automatically. After orders are complete and guests leave, mark it Free here."}</p></div>
      {floor.isPending ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[0,1,2,3,4,5].map((i) => <Skeleton key={i} className="h-36 rounded-xl" />)}</div> : (floor.data ?? []).length === 0 ? <EmptyState icon={<Utensils className="size-6" />} title={t("empty.tables.title")} description={t("waiter.empty")} /> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(floor.data ?? []).map((table) => {
          const calling = Boolean(table.calling); const busy = table.openOrders.length > 0; const canClose = table.service_status === "active" && !busy;
          return <article key={table.id} className={`panel p-4 ${calling ? "ring-2 ring-primary" : ""}`}>
            <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-base font-semibold">{table.table_name ?? `${t("waiter.title")} ${table.table_number}`}</p><p className="text-xs text-muted-foreground tabular-nums">#{table.table_number}</p></div><Badge variant={calling ? "default" : table.service_status === "active" ? "secondary" : table.service_status === "reserved" ? "outline" : "outline"}>{calling ? t("waiter.calling") : tableStatusLabel(table.service_status, ar)}</Badge></div>
            {busy ? <ul className="mt-3 space-y-1 text-xs text-muted-foreground">{table.openOrders.map((o) => <li key={o.id} className="flex justify-between gap-2"><span className="truncate tabular-nums">{o.order_number}</span><span className="shrink-0">{o.status} · {formatMoney(o.total, scope.currency, lang)}</span></li>)}</ul> : null}
            {table.service_status === "active" && !busy ? <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/10"><p className="text-xs font-semibold">{ar ? "لا توجد طلبات مفتوحة" : "No open orders"}</p><p className="mt-1 text-[10px] leading-4 text-muted-foreground">{ar ? "إذا غادر الضيوف وتم تنظيف الطاولة، اجعلها متاحة للضيف التالي." : "When guests have left and the table is cleared, release it for the next party."}</p><Button size="sm" variant="outline" className="mt-2 w-full gap-2" disabled={!canClose || setTableFree.isPending} onClick={() => setTableFree.mutate(table.id)}><CircleOff className="size-4" />{ar ? "إغلاق الطاولة · متاحة" : "Close table · Mark Free"}</Button></div> : null}
            {table.calling ? <div className="mt-3 space-y-2">{table.calling.note ? <p className="text-xs text-muted-foreground">{table.calling.note}</p> : null}<div className="flex gap-2">{table.calling.status === "pending" ? <Button size="sm" className="h-9 flex-1" disabled={setCall.isPending} onClick={() => setCall.mutate({ id: table.calling!.id, status: "acknowledged" })}><BellRing className="size-4" />{t("waiter.acknowledge")}</Button> : null}<Button size="sm" variant="outline" className="h-9 flex-1" disabled={setCall.isPending} onClick={() => setCall.mutate({ id: table.calling!.id, status: "resolved" })}><Check className="size-4" />{t("waiter.resolve")}</Button></div></div> : null}
          </article>;
        })}
      </div>}
    </main>
  </div>;
}

function tableStatusLabel(status: TableServiceStatus, ar: boolean) {
  const labels: Record<TableServiceStatus, [string,string]> = { free:["Free","متاحة"], reserved:["Reserved","محجوزة"], active:["Active","نشطة"], cleaning:["Cleaning","تنظيف"], out_of_service:["Out of service","خارج الخدمة"] };
  return labels[status][ar ? 1 : 0];
}
