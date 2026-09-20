import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CalendarCheck2,
  ChevronRight,
  Clock3,
  ClipboardList,
  Receipt,
  RotateCcw,
  Save,
  Settings2,
  ShoppingBag,
  Table2,
  TrendingUp,
  Users,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { DashboardGrid, normalizeDashboardSize, reorderDashboardItems, type DashboardItemSize } from "@/components/customization/DashboardGrid";
import { HomeMetricDetail, isHomeMetricId } from "@/components/dashboard/HomeMetricDetail";
import { MasterEyebrow, MasterKpi, MasterSection } from "@/components/app/MasterPage";
import { AppHeader } from "@/components/nav/AppHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAccess, useSupabaseSession } from "@/hooks/useSession";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { useWorkspaceMembers, useWorkspaceReport, useWorkspaceScope } from "@/hooks/useWorkspace";
import { avatarPresetUrl } from "@/lib/avatar-presets";
import { humanError } from "@/lib/errors";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { ROLE_LABELS } from "@/lib/permissions";
import { readAppearance } from "@/lib/restaurant-appearance";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Home — QuickServe" }, { name: "description", content: "QuickServe restaurant workspace overview." }] }),
  component: DashboardPage,
});

type HomeSectionId = "hero" | "metrics" | "quick" | "members" | "activity";
type HomeLayout = {
  order: HomeSectionId[];
  hidden: HomeSectionId[];
  sizes: Partial<Record<HomeSectionId, DashboardItemSize>>;
};
const DEFAULT_HOME_ORDER: HomeSectionId[] = ["hero", "metrics", "quick", "members", "activity"];
const HOME_SECTION_IDS = new Set<HomeSectionId>(DEFAULT_HOME_ORDER);
const DEFAULT_SIZES: Record<HomeSectionId, DashboardItemSize> = {
  hero: { columns: 12, minHeight: 250 },
  metrics: { columns: 12, minHeight: 150 },
  quick: { columns: 12, minHeight: 190 },
  members: { columns: 6, minHeight: 260 },
  activity: { columns: 6, minHeight: 260 },
};

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function readHomeLayout(theme: unknown): HomeLayout {
  const workspace = objectValue(objectValue(theme).workspace);
  const raw = objectValue(workspace.homeDashboard);
  const saved = Array.isArray(raw.order) ? raw.order.filter((value): value is HomeSectionId => HOME_SECTION_IDS.has(value as HomeSectionId)) : [];
  const order = [...saved, ...DEFAULT_HOME_ORDER.filter((id) => !saved.includes(id))];
  const hidden = Array.isArray(raw.hidden) ? raw.hidden.filter((value): value is HomeSectionId => HOME_SECTION_IDS.has(value as HomeSectionId)) : [];
  const rawSizes = objectValue(raw.sizes);
  const sizes: Partial<Record<HomeSectionId, DashboardItemSize>> = {};
  for (const id of DEFAULT_HOME_ORDER) sizes[id] = normalizeDashboardSize(rawSizes[id], DEFAULT_SIZES[id]);
  return { order, hidden, sizes };
}

function DashboardPage() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const access = useAccess();
  const session = useSupabaseSession();
  const scope = useWorkspaceScope();
  const rid = scope.restaurantId;
  const report = useWorkspaceReport(rid);
  const members = useWorkspaceMembers(rid);
  const restaurant = useRestaurant(rid ?? "");
  const qc = useQueryClient();
  const currency = scope.currency;
  const r = report.data;
  const user = session.data?.user;
  const meta = user?.user_metadata as { full_name?: string; name?: string } | undefined;
  const currentMembership = (access.data ?? []).find((row) => row.restaurant_id === rid) ?? null;
  const canCustomize = Boolean(rid && (access.isSuperAdmin || currentMembership?.role === "restaurant_admin"));
  const displayName = meta?.full_name || meta?.name || currentMembership?.name || user?.email?.split("@")[0] || (ar ? "مرحباً" : "there");
  const savedLayout = useMemo(() => readHomeLayout(restaurant.data?.menu_theme), [restaurant.data?.menu_theme]);
  const [layout, setLayout] = useState<HomeLayout>(savedLayout);
  const [draft, setDraft] = useState<HomeLayout>(savedLayout);
  const [customize, setCustomize] = useState(false);
  const [savingLayout, setSavingLayout] = useState(false);

  useEffect(() => {
    setLayout(savedLayout);
    if (!customize) setDraft(savedLayout);
  }, [savedLayout, customize]);

  const tableStats = useQuery({
    queryKey: ["workspace", "table-stats", rid],
    enabled: Boolean(rid),
    staleTime: 20_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("restaurant_tables")
        .select("id,service_status")
        .eq("restaurant_id", rid!)
        .eq("is_active", true);
      if (error) throw error;
      const rows = data ?? [];
      const occupied = rows.filter((row) => ["occupied","reserved","ordering","served"].includes(String(row.service_status ?? ""))).length;
      return { total: rows.length, occupied };
    },
  });

  const reservationStats = useQuery({
    queryKey: ["workspace", "reservation-stats", rid],
    enabled: Boolean(rid),
    staleTime: 20_000,
    queryFn: async () => {
      const start = new Date();
      start.setHours(0,0,0,0);
      const end = new Date(start);
      end.setDate(end.getDate()+1);
      const { data, error } = await (supabase as any).from("table_bookings")
        .select("id,status,booking_at,guest_count")
        .eq("restaurant_id", rid!)
        .gte("booking_at", start.toISOString())
        .lt("booking_at", end.toISOString())
        .order("booking_at", { ascending: true });
      if (error) throw error;
      const rows = data ?? [];
      return {
        total: rows.filter((row:any) => !["cancelled","no_show"].includes(String(row.status))).length,
        upcoming: rows.filter((row:any) => ["pending","confirmed"].includes(String(row.status)) && new Date(row.booking_at).getTime() >= Date.now()).slice(0,5),
      };
    },
  });

  const detailMetric = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("detail");
  if (rid && isHomeMetricId(detailMetric)) return <HomeMetricDetail metric={detailMetric} restaurantId={rid} restaurantName={restaurant.data?.name ?? scope.restaurantName ?? (ar ? "المطعم" : "Restaurant")} currency={currency} />;

  const today = new Intl.DateTimeFormat(ar ? "ar-JO" : "en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" }).format(new Date());
  const appearance = readAppearance(restaurant.data?.menu_theme);
  const occupancy = tableStats.data?.total ? Math.round(((tableStats.data?.occupied ?? 0) / tableStats.data.total) * 100) : 0;
  const metrics = [
    { id: "sales", label: ar ? "مبيعات اليوم" : "Today's Sales", value: formatMoney(r?.salesToday ?? 0, currency, lang), icon: ShoppingBag, tone: "orange" as const, hint: ar ? `7 أيام: ${formatMoney(r?.salesWeek ?? 0,currency,lang)}` : `7 days: ${formatMoney(r?.salesWeek ?? 0,currency,lang)}` },
    { id: "orders", label: ar ? "طلبات اليوم" : "Orders", value: formatNumber(r?.ordersToday ?? 0, lang), icon: ClipboardList, tone: "green" as const, hint: ar ? `${r?.openOrders ?? 0} طلبات نشطة` : `${r?.openOrders ?? 0} active now` },
    { id: "average-order", label: ar ? "متوسط الفاتورة" : "Avg Ticket", value: formatMoney(r?.averageOrder ?? 0, currency, lang), icon: Receipt, tone: "purple" as const, hint: ar ? "متوسط 7 أيام" : "7-day average" },
    { id: "tables", label: ar ? "إشغال الطاولات" : "Occupancy", value: `${occupancy}%`, icon: Table2, tone: "blue" as const, hint: ar ? `${tableStats.data?.occupied ?? 0} من ${tableStats.data?.total ?? 0} طاولة` : `${tableStats.data?.occupied ?? 0} of ${tableStats.data?.total ?? 0} tables` },
    { id: "reservations", label: ar ? "حجوزات اليوم" : "Reservations", value: formatNumber(reservationStats.data?.total ?? 0,lang), icon: CalendarCheck2, tone: "slate" as const, hint: ar ? `${reservationStats.data?.upcoming.length ?? 0} قادمة` : `${reservationStats.data?.upcoming.length ?? 0} upcoming` },
  ];

  const quick = rid ? [
    { to: `/manage/${rid}/analytics`, label: ar ? "التحليلات" : "Analytics", hint: ar ? "عرض الرؤى" : "View insights", icon: BarChart3 },
    { to: `/manage/${rid}/orders`, label: ar ? "الطلبات" : "Orders", hint: ar ? "متابعة الطلبات" : "Track orders", icon: ClipboardList },
    { to: `/manage/${rid}`, label: ar ? "القائمة" : "Menu", hint: ar ? "تحديث القائمة" : "Update menu", icon: UtensilsCrossed },
    { to: `/manage/${rid}/tables`, label: ar ? "الطاولات" : "Tables", hint: ar ? "إدارة الطاولات" : "Manage tables", icon: Table2 },
    { to: `/manage/${rid}/staff`, label: ar ? "الفريق" : "Team", hint: ar ? "إدارة الفريق" : "Manage staff", icon: Users },
  ] : [];

  const labels: Record<HomeSectionId, { en: string; ar: string }> = {
    hero: { en: "Welcome banner", ar: "واجهة الترحيب" },
    metrics: { en: "KPI cards", ar: "بطاقات المؤشرات" },
    quick: { en: "Quick Access", ar: "الوصول السريع" },
    members: { en: "Workspace Members", ar: "أعضاء مساحة العمل" },
    activity: { en: "Recent Activity", ar: "النشاط الأخير" },
  };

  function setVisible(id: HomeSectionId, visible: boolean) {
    setDraft((current) => ({ ...current, hidden: visible ? current.hidden.filter((value) => value !== id) : [...new Set([...current.hidden, id])] }));
  }

  async function saveHomeLayout() {
    if (!rid) return;
    setSavingLayout(true);
    try {
      const current = await supabase.from("restaurants").select("menu_theme").eq("id", rid).single();
      if (current.error) throw current.error;
      const theme = objectValue(current.data.menu_theme);
      const workspace = objectValue(theme.workspace);
      const { error } = await supabase.from("restaurants").update({ menu_theme: { ...theme, workspace: { ...workspace, homeDashboard: draft } } }).eq("id", rid);
      if (error) throw error;
      setLayout(draft);
      setCustomize(false);
      await Promise.all([qc.invalidateQueries({ queryKey: ["platform"] }), qc.invalidateQueries({ queryKey: ["staff", "memberships"] })]);
      toast.success(ar ? "تم حفظ تخطيط الصفحة الرئيسية" : "Home layout saved");
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setSavingLayout(false);
    }
  }

  const shown = (customize ? draft : layout).order.filter((id) => !(customize ? draft : layout).hidden.includes(id));
  const working = customize ? draft : layout;

  function renderSection(id: HomeSectionId) {
    if (id === "hero") return <section className="h-full min-h-[190px] overflow-hidden rounded-[20px] border border-border/80 bg-card shadow-[var(--qs-shadow-card)]">
      <div className="flex h-full min-h-[190px] flex-col justify-between gap-5 p-5 sm:p-6 lg:flex-row lg:items-center">
        <div className="min-w-0 max-w-3xl">
          <MasterEyebrow icon={TrendingUp}>{ar ? "نظرة اليوم" : "Today at a glance"}</MasterEyebrow>
          <h1 className="mt-4 font-display text-[clamp(2rem,3.2vw,3rem)] font-bold leading-[1.04] tracking-[-.05em]">{ar ? `مرحباً، ${displayName}` : `Good to see you, ${displayName}`}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{ar ? `هذه صورة تشغيلية مباشرة لـ ${restaurant.data?.name ?? scope.restaurantName ?? "المطعم"} اليوم.` : `Here’s the live operating picture for ${restaurant.data?.name ?? scope.restaurantName ?? "your restaurant"} today.`}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-muted-foreground">
            <span className="rounded-full bg-muted px-3 py-1.5">{today}</span>
            <span className="rounded-full bg-muted px-3 py-1.5">{restaurant.data?.name ?? scope.restaurantName ?? (ar ? "المطعم" : "Restaurant")}</span>
          </div>
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
          {rid ? <Button asChild><Link to="/bookings"><CalendarCheck2 className="size-4"/>{ar?"حجز جديد":"Add Booking"}</Link></Button> : null}
          {rid ? <Button asChild variant="outline"><Link to="/manage/$restaurantId/orders" params={{restaurantId:rid}}><ClipboardList className="size-4"/>{ar?"الطلبات":"Orders"}</Link></Button> : null}
        </div>
      </div>
    </section>;
    if (id === "metrics") return report.isPending || tableStats.isPending || reservationStats.isPending
      ? <div className="grid h-full gap-3 sm:grid-cols-2 xl:grid-cols-5">{[0,1,2,3,4].map((index)=><Skeleton key={index} className="min-h-[140px] rounded-[18px]"/>)}</div>
      : <section className="grid h-full gap-3 sm:grid-cols-2 xl:grid-cols-5">{metrics.map(({id,label,value,icon,hint,tone})=><MasterKpi key={id} icon={icon} label={label} value={value} hint={hint} tone={tone}/>)}</section>;
    if (id === "quick") return <section className="grid h-full gap-4 xl:grid-cols-[1.45fr_.85fr]">
      <MasterSection title={ar?"اتجاه المبيعات":"Sales Trend"} description={ar?"آخر 7 أيام من الطلبات الفعلية":"Real order revenue across the last 7 days"} action={rid?<Button asChild variant="ghost" size="sm"><Link to="/manage/$restaurantId/analytics" params={{restaurantId:rid}}>{ar?"التحليلات":"View Analytics"}<ChevronRight className="size-3"/></Link></Button>:null} contentClassName="h-[250px]">
        {report.isPending?<Skeleton className="h-full rounded-xl"/>:<ResponsiveContainer width="100%" height="100%"><AreaChart data={r?.series??[]} margin={{top:8,right:8,left:-18,bottom:0}}><defs><linearGradient id="qsSalesFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ff5a0a" stopOpacity={0.22}/><stop offset="100%" stopColor="#ff5a0a" stopOpacity={0.02}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" opacity={0.08}/><XAxis dataKey="day" tickFormatter={(value)=>String(value).slice(5)} tick={{fontSize:10}} axisLine={false} tickLine={false}/><YAxis tick={{fontSize:10}} axisLine={false} tickLine={false}/><Tooltip formatter={(value)=>formatMoney(Number(value??0),currency,lang)} labelFormatter={(value)=>String(value)}/><Area type="monotone" dataKey="sales" stroke="#ff5a0a" strokeWidth={2.5} fill="url(#qsSalesFill)"/></AreaChart></ResponsiveContainer>}
      </MasterSection>
      <MasterSection title={ar?"الخدمة الآن":"Live Service"} description={ar?"صورة سريعة للحالة التشغيلية":"What needs attention right now"} contentClassName="space-y-3">
        <LiveLine icon={ClipboardList} label={ar?"طلبات نشطة":"Active orders"} value={String(r?.openOrders??0)} tone="orange"/>
        <LiveLine icon={Table2} label={ar?"طاولات مشغولة":"Occupied tables"} value={`${tableStats.data?.occupied??0}/${tableStats.data?.total??0}`} tone="blue"/>
        <LiveLine icon={CalendarCheck2} label={ar?"حجوزات قادمة":"Upcoming reservations"} value={String(reservationStats.data?.upcoming.length??0)} tone="green"/>
        <LiveLine icon={Users} label={ar?"فريق نشط":"Active team"} value={String((members.data??[]).filter((member)=>member.is_active).length)} tone="purple"/>
        <div className="grid grid-cols-2 gap-2 pt-2">{quick.slice(0,4).map(({to,label,icon:Icon})=><Link key={to} to={to as never} className="flex min-h-11 items-center gap-2 rounded-xl border border-border bg-background px-3 text-xs font-bold transition hover:border-primary/20 hover:bg-muted/60"><Icon className="size-3.5 text-[#ff5a0a]"/><span className="truncate">{label}</span></Link>)}</div>
      </MasterSection>
    </section>;
    if (id === "members") return <section className="qs-card h-full overflow-hidden"><div className="flex items-center justify-between border-b border-border px-5 py-4"><h2 className="qs-section-title text-lg">{ar ? "أعضاء مساحة العمل" : "Workspace Members"}</h2>{rid ? <Link to="/manage/$restaurantId/staff" params={{ restaurantId: rid }} className="text-xs font-bold text-[#ff5a0a]">{ar ? "إدارة" : "Manage"} →</Link> : null}</div><div className="p-4 sm:p-5">{members.isPending ? <Skeleton className="h-20 rounded-xl" /> : <div className="grid gap-2">{(members.data ?? []).slice(0, 5).map((member) => { const avatar = member.avatar_url || avatarPresetUrl(member.avatar_preset); return <div key={member.id} className="flex items-center gap-3 rounded-xl border border-border px-3 py-3"><span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-muted font-bold">{avatar ? <img src={avatar} alt="" className="size-full object-cover" /> : member.name.slice(0, 1).toUpperCase()}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{member.name}</span><span className="text-[11px] text-muted-foreground">{ROLE_LABELS[member.role]?.[lang] ?? member.role}</span></span><span className={`size-2 rounded-full ${member.is_active ? "bg-emerald-500" : "bg-slate-400"}`} /></div>; })}{(members.data ?? []).length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">{ar ? "لا يوجد أعضاء بعد." : "No workspace members yet."}</p> : null}</div>}</div></section>;

    return <section className="qs-card h-full overflow-hidden"><div className="flex items-center justify-between border-b border-border px-5 py-4"><h2 className="qs-section-title text-lg">{ar ? "النشاط الأخير" : "Recent Activity"}</h2>{rid ? <Link to="/manage/$restaurantId/orders" params={{ restaurantId: rid }} className="text-xs font-bold text-[#ff5a0a]">{ar ? "عرض الكل" : "View all"}</Link> : null}</div><div className="divide-y divide-border">{(r?.recent ?? []).slice(0, 5).map((order, index) => <div key={order.id} className="flex items-center gap-3 px-5 py-3.5"><span className={`grid size-9 shrink-0 place-items-center rounded-full ${index % 3 === 0 ? "bg-emerald-50 text-emerald-600" : index % 3 === 1 ? "bg-blue-50 text-blue-600" : "bg-violet-50 text-violet-600"}`}><Receipt className="size-4" /></span><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{ar ? "طلب" : "Order"} {order.order_number}</strong><span className="block truncate text-[11px] text-muted-foreground">{order.status} · {order.table ? `${ar ? "طاولة" : "Table"} ${order.table}` : ar ? "خارجي" : "Takeaway"}</span></span><span className="shrink-0 text-[10px] text-muted-foreground">{formatDateTime(order.created_at, lang)}</span></div>)}{(r?.recent ?? []).length === 0 ? <p className="px-5 py-10 text-center text-sm text-muted-foreground">{ar ? "لا يوجد نشاط بعد." : "No recent activity yet."}</p> : null}</div></section>;
  }

  return <div className="min-h-dvh bg-background">
    <AppHeader />
    <main className="qs-page space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>{customize ? <><h2 className="text-sm font-bold">{ar ? "تخصيص الصفحة الرئيسية" : "Customize Home"}</h2><p className="mt-1 text-xs text-muted-foreground">{ar ? "اسحب من المقبض لترتيب العناصر واستخدم مقبض الزاوية لتغيير الحجم." : "Drag a widget by its handle to move it. Use the corner handle to resize it."}</p></> : null}</div>
        {canCustomize ? <div className="flex flex-wrap gap-2">{customize ? <><Button variant="outline" onClick={() => { setDraft(layout); setCustomize(false); }} disabled={savingLayout}><X className="size-4" />{ar ? "إلغاء" : "Cancel"}</Button><Button variant="outline" onClick={() => setDraft({ order: [...DEFAULT_HOME_ORDER], hidden: [], sizes: { ...DEFAULT_SIZES } })} disabled={savingLayout}><RotateCcw className="size-4" />{ar ? "الافتراضي" : "Defaults"}</Button><Button onClick={() => void saveHomeLayout()} disabled={savingLayout}><Save className="size-4" />{savingLayout ? (ar ? "جارٍ الحفظ…" : "Saving…") : (ar ? "حفظ التخطيط" : "Save Layout")}</Button></> : <button type="button" className="qs-button-secondary" onClick={() => { setDraft(layout); setCustomize(true); }}><Settings2 className="size-4" />{ar ? "تخصيص الصفحة الرئيسية" : "Customize Home"}</button>}</div> : null}
      </div>

      {customize ? <section className="qs-card p-4"><div className="flex flex-wrap gap-3">{draft.order.map((id) => <label key={id} className="flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold"><Switch checked={!draft.hidden.includes(id)} onCheckedChange={(checked) => setVisible(id, checked)} /><span>{ar ? labels[id].ar : labels[id].en}</span></label>)}</div></section> : null}

      <DashboardGrid
        ids={shown}
        customize={customize}
        sizeFor={(id) => working.sizes[id] ?? DEFAULT_SIZES[id]}
        labelFor={(id) => ar ? labels[id].ar : labels[id].en}
        minColumns={(id) => id === "members" || id === "activity" ? 4 : 6}
        minHeight={(id) => id === "hero" ? 220 : id === "metrics" ? 130 : 160}
        onReorder={(source, target) => setDraft((current) => ({ ...current, order: reorderDashboardItems(current.order, source, target) }))}
        onResize={(id, size) => setDraft((current) => ({ ...current, sizes: { ...current.sizes, [id]: size } }))}
        renderItem={renderSection}
      />
    </main>
  </div>;
}


function LiveLine({icon:Icon,label,value,tone}:{icon:typeof ClipboardList;label:string;value:string;tone:"orange"|"blue"|"green"|"purple"}){
  const cls=tone==="orange"?"bg-orange-500/10 text-[#e34d00]":tone==="blue"?"bg-blue-500/10 text-blue-700":tone==="green"?"bg-emerald-500/10 text-emerald-700":"bg-violet-500/10 text-violet-700";
  return <div className="flex items-center gap-3 rounded-xl border border-border/80 bg-background px-3 py-3"><span className={`grid size-9 shrink-0 place-items-center rounded-xl ${cls}`}><Icon className="size-4"/></span><span className="min-w-0 flex-1 text-xs font-semibold text-muted-foreground">{label}</span><strong className="font-display text-lg tracking-[-.03em]">{value}</strong></div>;
}
