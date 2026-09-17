import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { BellRing, CheckCircle2, Table2, UsersRound } from "lucide-react";

import { AppHeader } from "@/components/nav/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspaceScope } from "@/hooks/useWorkspace";
import { supabase } from "@/integrations/supabase/client";
import { humanError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/host")({
  head: () => ({ meta: [{ title: "Host floor — QuickServe" }, { name: "description", content: "Live seating and guest-service overview for restaurant hosts." }] }),
  component: HostWorkspace,
});

const OPEN_STATUSES = ["new", "accepted", "preparing", "ready", "served"] as const;

type HostTable = {
  id: string;
  table_number: string;
  table_name: string | null;
  capacity: number | null;
  zone: string | null;
  busy: boolean;
  pendingCall: boolean;
};

function useHostFloor(restaurantId: string | null) {
  return useQuery<HostTable[]>({
    queryKey: ["host", "floor", restaurantId],
    enabled: Boolean(restaurantId),
    staleTime: 8_000,
    refetchInterval: 12_000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const [tablesRes, ordersRes, callsRes] = await Promise.all([
        supabase.from("restaurant_tables").select("id,table_number,table_name,capacity,zone").eq("restaurant_id", restaurantId!).eq("is_active", true).order("table_number", { ascending: true }),
        supabase.from("orders").select("id,table_id,status").eq("restaurant_id", restaurantId!).in("status", OPEN_STATUSES),
        supabase.from("waiter_calls").select("id,table_id,status").eq("restaurant_id", restaurantId!).in("status", ["pending", "acknowledged"]),
      ]);
      if (tablesRes.error) throw tablesRes.error;
      if (ordersRes.error) throw ordersRes.error;
      // Guest-service calls are helpful context, but the host floor must never become a white page
      // if a tenant has not enabled waiter-call access yet.
      const calls = callsRes.error ? [] : (callsRes.data ?? []);
      const busyIds = new Set((ordersRes.data ?? []).map((row) => row.table_id).filter(Boolean));
      const callIds = new Set(calls.filter((row) => row.status === "pending").map((row) => row.table_id).filter(Boolean));
      return (tablesRes.data ?? []).map((table) => ({
        id: table.id,
        table_number: table.table_number,
        table_name: table.table_name,
        capacity: table.capacity,
        zone: table.zone,
        busy: busyIds.has(table.id),
        pendingCall: callIds.has(table.id),
      }));
    },
  });
}

function HostWorkspace() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const scope = useWorkspaceScope();
  const floor = useHostFloor(scope.restaurantId);
  const rows = floor.data ?? [];
  const available = rows.filter((row) => !row.busy).length;
  const busy = rows.filter((row) => row.busy).length;
  const calls = rows.filter((row) => row.pendingCall).length;

  return <div className="min-h-dvh bg-background">
    <AppHeader title={ar ? "الاستقبال" : "Host"} />
    <main className="qs-page space-y-5">
      <section>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[.2em] text-[#ff5a0a]">{ar ? "واجهة الاستقبال" : "Front of house"}</p>
        <h1 className="qs-page-title">{ar ? "نظرة مباشرة على الصالة" : "Live floor overview"}</h1>
        <p className="qs-page-subtitle max-w-2xl">{ar ? "اعرف الطاولات المتاحة والمشغولة وتنبيهات الضيوف بدون عرض أي بيانات مالية." : "See available and busy tables plus guest-service alerts without exposing financial information."}</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <Metric icon={CheckCircle2} label={ar ? "متاحة" : "Available"} value={available} tone="green" />
        <Metric icon={UsersRound} label={ar ? "مشغولة" : "Busy"} value={busy} tone="blue" />
        <Metric icon={BellRing} label={ar ? "تنبيهات معلقة" : "Pending calls"} value={calls} tone="orange" />
      </section>

      {scope.isPending || floor.isPending ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}</div>
      : floor.isError ? <section className="qs-card p-6"><h2 className="font-bold text-destructive">{ar ? "تعذر تحميل الصالة" : "Could not load the floor"}</h2><p className="mt-2 text-sm text-muted-foreground">{humanError(floor.error, lang)}</p><button type="button" className="qs-button-secondary mt-4" onClick={() => void floor.refetch()}>{ar ? "إعادة المحاولة" : "Retry"}</button></section>
      : !scope.restaurantId ? <section className="qs-card p-8 text-center text-sm text-muted-foreground">{ar ? "لا يوجد مطعم مرتبط بهذا الحساب." : "No restaurant is linked to this account."}</section>
      : !rows.length ? <section className="qs-card p-10 text-center"><Table2 className="mx-auto size-9 text-muted-foreground" /><h2 className="mt-3 font-bold">{ar ? "لا توجد طاولات مفعلة" : "No active tables"}</h2><p className="mt-1 text-xs text-muted-foreground">{ar ? "ستظهر الطاولات هنا عندما يتم تفعيلها من إدارة الصالة." : "Tables will appear here once they are activated in floor management."}</p></section>
      : <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{rows.map((table) => <article key={table.id} className={cn("qs-card p-4 transition", table.pendingCall && "ring-2 ring-orange-400/70")}><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground">{table.zone || (ar ? "المنطقة الرئيسية" : "Main area")}</p><h2 className="mt-1 font-display text-xl font-bold">{table.table_name || `${ar ? "طاولة" : "Table"} ${table.table_number}`}</h2><p className="mt-1 text-xs text-muted-foreground">{table.capacity ? `${table.capacity} ${ar ? "مقاعد" : "seats"}` : `#${table.table_number}`}</p></div><Badge variant={table.busy ? "secondary" : "outline"}>{table.busy ? (ar ? "مشغولة" : "Busy") : (ar ? "متاحة" : "Available")}</Badge></div>{table.pendingCall ? <div className="mt-4 flex items-center gap-2 rounded-xl bg-orange-500/10 px-3 py-2 text-xs font-bold text-orange-700 dark:text-orange-300"><BellRing className="size-4" />{ar ? "الضيف طلب المساعدة" : "Guest requested assistance"}</div> : null}</article>)}</section>}
    </main>
  </div>;
}

function Metric({ icon: Icon, label, value, tone }: { icon: typeof Table2; label: string; value: number; tone: "green" | "blue" | "orange" }) {
  return <article className="qs-stat flex min-h-28 items-center gap-4 p-4"><span className={cn("grid size-11 place-items-center rounded-2xl", tone === "green" ? "bg-emerald-500/10 text-emerald-600" : tone === "blue" ? "bg-blue-500/10 text-blue-600" : "bg-orange-500/10 text-[#ff5a0a]")}><Icon className="size-5" /></span><div><p className="text-xs font-semibold text-muted-foreground">{label}</p><p className="mt-1 font-display text-3xl font-bold tracking-[-.04em]">{value}</p></div></article>;
}
