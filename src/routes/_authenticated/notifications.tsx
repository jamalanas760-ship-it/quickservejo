import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, CheckCheck, ClipboardList, Info, Search, ShieldCheck, TimerReset, UsersRound } from "lucide-react";
import { toast } from "sonner";

import { MasterEyebrow, MasterKpi, MasterPageHeader } from "@/components/app/MasterPage";
import { AppHeader } from "@/components/nav/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspaceReport, useWorkspaceScope } from "@/hooks/useWorkspace";
import { operationalCountersKey, type OperationalCounters } from "@/hooks/useOperationalCounters";
import { supabase } from "@/integrations/supabase/client";
import { humanError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — QuickServe" },
      { name: "description", content: "Role-aware QuickServe operational notifications." },
    ],
  }),
  component: NotificationsPage,
});

type NotificationKind = "task" | "approval" | "handover" | "shift" | "alert" | "system";
type NotificationFilter = "all" | "unread" | "orders" | "reservations" | "team" | "approvals" | "system" | "finance";
type NotificationRow = {
  id: string;
  restaurant_id: string;
  staff_id: string | null;
  target_role: string | null;
  kind: NotificationKind;
  title: string;
  body: string | null;
  source_type: string | null;
  source_id: string | null;
  read_at: string | null;
  created_at: string;
};

function fromNotifications() {
  return (supabase as any).from("in_app_notifications");
}

function NotificationsPage() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const scope = useWorkspaceScope();
  const report = useWorkspaceReport(scope.restaurantId);
  const qc = useQueryClient();
  const rid = scope.restaurantId;
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [search, setSearch] = useState("");

  const feed = useQuery<NotificationRow[]>({
    queryKey: ["notifications", rid],
    enabled: Boolean(rid),
    staleTime: 8_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await fromNotifications()
        .select("id,restaurant_id,staff_id,target_role,kind,title,body,source_type,source_id,read_at,created_at")
        .eq("restaurant_id", rid!)
        .order("created_at", { ascending: false })
        .limit(150);
      if (error) throw error;
      return (data ?? []) as NotificationRow[];
    },
  });

  const markRead = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return;
      const { error } = await fromNotifications().update({ read_at: new Date().toISOString() }).in("id", ids);
      if (error) throw error;
    },
    onSuccess: async (_result, ids) => {
      qc.setQueryData<OperationalCounters>(operationalCountersKey(rid), (current) => {
        if (!current) return current;
        const removed = Math.min(ids.length, current.unread);
        const unread = Math.max(0, current.unread - removed);
        return { ...current, unread, total: Math.max(0, current.total - removed) };
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["notifications", rid] }),
        qc.invalidateQueries({ queryKey: operationalCountersKey(rid) }),
      ]);
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  const rows = feed.data ?? [];
  const unreadRows = rows.filter((row) => !row.read_at);
  const openOrders = report.data?.openOrders ?? 0;
  const counts = useMemo(() => ({
    unread: unreadRows.length,
    approvals: rows.filter((row) => row.kind === "approval" && !row.read_at).length,
    handovers: rows.filter((row) => row.kind === "handover" && !row.read_at).length,
    alerts: rows.filter((row) => row.kind === "alert" && !row.read_at).length,
  }), [rows, unreadRows.length]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const source = (row.source_type ?? "").toLowerCase();
      const matchesFilter = filter === "all"
        || (filter === "unread" && !row.read_at)
        || (filter === "approvals" && row.kind === "approval")
        || (filter === "team" && ["shift", "handover"].includes(row.kind))
        || (filter === "system" && row.kind === "system")
        || (filter === "orders" && source.includes("order"))
        || (filter === "reservations" && ["booking", "reservation", "waitlist"].some((key) => source.includes(key)))
        || (filter === "finance" && ["finance", "invoice", "expense", "procurement", "inventory"].some((key) => source.includes(key)));
      if (!matchesFilter) return false;
      if (!q) return true;
      return [row.title, row.body, row.source_type, row.kind].some((value) => value?.toLowerCase().includes(q));
    });
  }, [rows, filter, search]);

  const filterItems: Array<{ id: NotificationFilter; en: string; ar: string }> = [
    { id: "all", en: "All", ar: "الكل" },
    { id: "unread", en: "Unread", ar: "غير مقروء" },
    { id: "orders", en: "Orders", ar: "الطلبات" },
    { id: "reservations", en: "Reservations", ar: "الحجوزات" },
    { id: "team", en: "Team", ar: "الفريق" },
    { id: "approvals", en: "Approvals", ar: "الموافقات" },
    { id: "system", en: "System", ar: "النظام" },
    { id: "finance", en: "Finance / ERP", ar: "المالية / ERP" },
  ];

  if (scope.isPending) {
    return <div className="min-h-dvh bg-background"><AppHeader /><main className="qs-page"><Skeleton className="h-[560px] rounded-3xl" /></main></div>;
  }

  return <div className="min-h-dvh bg-background">
    <AppHeader title={ar ? "الإشعارات" : "Notifications"} />
    <main className="qs-page qs-compact-page qs-viewport-page">
      <MasterPageHeader
        eyebrow={<MasterEyebrow icon={Bell}>{ar ? "مركز التنبيهات" : "Operational inbox"}</MasterEyebrow>}
        title={ar ? "ما يحتاج انتباهك الآن" : "What needs your attention"}
        description={ar ? "المهام والموافقات وتسليم الورديات والتنبيهات الموجهة لدورك فقط." : "Tasks, approvals, handovers and operational alerts scoped to your restaurant role."}
        actions={counts.unread > 0 ? <Button variant="outline" disabled={markRead.isPending} onClick={() => markRead.mutate(unreadRows.map((row) => row.id))}><CheckCheck className="size-4" />{ar ? "قراءة الكل" : "Mark all read"}</Button> : null}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MasterKpi icon={Bell} label={ar ? "غير مقروء" : "Unread"} value={counts.unread} tone={counts.unread > 0 ? "orange" : "slate"} />
        <MasterKpi icon={ShieldCheck} label={ar ? "موافقات" : "Approvals"} value={counts.approvals} tone={counts.approvals > 0 ? "purple" : "slate"} />
        <MasterKpi icon={UsersRound} label={ar ? "تسليم ورديات" : "Handovers"} value={counts.handovers} tone={counts.handovers > 0 ? "blue" : "slate"} />
        <MasterKpi icon={TimerReset} label={ar ? "تنبيهات تشغيل" : "Operational alerts"} value={counts.alerts} tone={counts.alerts > 0 ? "red" : "slate"} />
      </section>

      {openOrders > 0 ? <section className="qs-card flex flex-col gap-4 border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/50 dark:bg-amber-950/10 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-amber-500/10 text-amber-700"><ClipboardList className="size-4" /></span><div><strong className="text-sm">{ar ? "طلبات مفتوحة تحتاج متابعة" : "Open orders need attention"}</strong><p className="mt-1 text-xs text-muted-foreground">{ar ? `${openOrders} طلب مفتوح حالياً.` : `${openOrders} open order${openOrders === 1 ? "" : "s"} currently in service.`}</p></div></div><Button asChild size="sm" variant="outline"><Link to="/dashboard">{ar ? "عرض الطلبات" : "View orders"}</Link></Button></section> : null}

      <section className="qs-card qs-viewport-fill flex min-h-0 flex-col overflow-hidden">
        <div className="border-b border-border p-3.5 sm:p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div><h2 className="qs-section-title">{ar ? "مركز الإشعارات" : "Notification center"}</h2><p className="mt-1 text-[11px] text-muted-foreground">{ar ? "ابحث وصنّف التنبيهات بدون مغادرة الصفحة." : "Search and filter alerts without leaving the workspace."}</p></div>
            <div className="relative w-full xl:w-[300px]"><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><Input value={search} onChange={(event)=>setSearch(event.target.value)} placeholder={ar ? "بحث في الإشعارات..." : "Search notifications..."} className="h-10 ps-9"/></div>
          </div>
          <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
            {filterItems.map((item)=><button key={item.id} type="button" onClick={()=>setFilter(item.id)} className={cn("shrink-0 rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition",filter===item.id?"bg-foreground text-background":"bg-muted/55 text-muted-foreground hover:text-foreground")}>{ar?item.ar:item.en}</button>)}
          </div>
        </div>
        {feed.isPending ? <div className="p-5"><Skeleton className="h-64 rounded-2xl" /></div> : feed.isError ? <div className="p-8 text-center"><Info className="mx-auto size-7 text-destructive" /><p className="mt-3 text-sm text-destructive">{humanError(feed.error, lang)}</p></div> : filteredRows.length === 0 ? <div className="grid min-h-[220px] place-items-center p-8 text-center"><div><span className="mx-auto grid size-11 place-items-center rounded-2xl bg-muted text-muted-foreground"><Bell className="size-5" /></span><h3 className="mt-3 font-bold">{rows.length ? (ar ? "لا توجد نتائج" : "No matching notifications") : (ar ? "صندوقك هادئ" : "Your inbox is clear")}</h3><p className="mt-1 text-xs text-muted-foreground">{rows.length ? (ar ? "غيّر الفلتر أو عبارة البحث." : "Try another filter or search phrase.") : (ar ? "ستظهر هنا المهام والتنبيهات الجديدة الموجهة لك." : "New tasks and alerts assigned to you will appear here.")}</p></div></div> : <div className="qs-scroll-region min-h-0 flex-1 divide-y divide-border">{filteredRows.map((row) => <NotificationItem key={row.id} row={row} ar={ar} busy={markRead.isPending} onRead={() => markRead.mutate([row.id])} />)}</div>}
      </section>
    </main>
  </div>;
}

function NotificationItem({ row, ar, busy, onRead }: { row: NotificationRow; ar: boolean; busy: boolean; onRead: () => void }) {
  const read = Boolean(row.read_at);
  const config = kindConfig(row.kind, ar);
  const Icon = config.icon;
  const href = row.kind === "shift" || row.kind === "handover" ? "/shifts" : row.kind === "task" || row.kind === "approval" || row.kind === "alert" ? "/work" : "/dashboard";
  return <article className={cn("grid gap-3 p-3.5 transition sm:p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center", !read && "bg-orange-500/[.025]")}>
    <div className="flex min-w-0 gap-3"><span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", config.tone)}><Icon className="size-4" /></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold">{row.title}</h3>{!read ? <span className="size-2 rounded-full bg-[#e85d2a]" /> : null}<Badge variant="outline" className="rounded-full text-[10px]">{config.label}</Badge></div>{row.body ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{row.body}</p> : null}<p className="mt-2 text-[10px] font-medium text-muted-foreground">{formatTime(row.created_at, ar)}</p></div></div>
    <div className="flex flex-wrap gap-2 lg:justify-end"><Button asChild size="sm" variant="outline"><Link to={href as any}>{ar ? "فتح" : "Open"}</Link></Button>{!read ? <Button size="sm" variant="ghost" disabled={busy} onClick={onRead}><CheckCheck className="size-4" />{ar ? "تمت القراءة" : "Mark read"}</Button> : null}</div>
  </article>;
}

function kindConfig(kind: NotificationKind, ar: boolean) {
  if (kind === "approval") return { icon: ShieldCheck, label: ar ? "موافقة" : "Approval", tone: "bg-violet-500/10 text-violet-600" };
  if (kind === "handover") return { icon: UsersRound, label: ar ? "تسليم" : "Handover", tone: "bg-cyan-500/10 text-cyan-700" };
  if (kind === "shift") return { icon: TimerReset, label: ar ? "وردية" : "Shift", tone: "bg-blue-500/10 text-blue-600" };
  if (kind === "alert") return { icon: Info, label: ar ? "تنبيه" : "Alert", tone: "bg-red-500/10 text-red-600" };
  if (kind === "task") return { icon: ClipboardList, label: ar ? "مهمة" : "Task", tone: "bg-orange-500/10 text-[#e85d2a]" };
  return { icon: Info, label: ar ? "نظام" : "System", tone: "bg-muted text-muted-foreground" };
}

function formatTime(value: string, ar: boolean) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(ar ? "ar-JO" : "en-JO", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
