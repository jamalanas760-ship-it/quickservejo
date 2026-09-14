import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BarChart3,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Plus,
  Receipt,
  ShoppingBag,
  Smile,
  Store,
  TrendingUp,
  Trophy,
  Users,
  UtensilsCrossed,
  Zap,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { AppHeader } from "@/components/nav/AppHeader";
import { useAccess } from "@/hooks/useSession";
import { useWorkspaceReport, useWorkspaceScope } from "@/hooks/useWorkspace";
import { useI18n } from "@/lib/i18n";
import { ROLE_LABELS } from "@/lib/permissions";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — QuickServe" },
      { name: "description", content: "QuickServe dashboard: sales, live orders and restaurant performance." },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { lang } = useI18n();
  const access = useAccess();
  const scope = useWorkspaceScope();
  const report = useWorkspaceReport(scope.restaurantId);
  const currency = scope.currency;
  const r = report.data;
  const rid = scope.restaurantId;
  const series = (r?.series ?? []).map((point, index) => ({
    label: String(index + 1),
    sales: Number(point.sales ?? 0),
    orders: Number(point.orders ?? 0),
  }));

  const metrics = [
    { label: lang === "ar" ? "مبيعات اليوم" : "Today’s Sales", value: formatMoney(r?.salesToday ?? 0, currency, lang), icon: BarChart3, hint: lang === "ar" ? "مباشر" : "live" },
    { label: lang === "ar" ? "الطلبات النشطة" : "Active Orders", value: formatNumber(r?.openOrders ?? 0, lang), icon: ShoppingBag, hint: lang === "ar" ? "الآن" : "right now" },
    { label: lang === "ar" ? "متوسط الطلب" : "Avg. Order Value", value: formatMoney(r?.averageOrder ?? 0, currency, lang), icon: TrendingUp, hint: lang === "ar" ? "اليوم" : "today" },
    { label: lang === "ar" ? "طلبات اليوم" : "Orders Today", value: formatNumber(r?.ordersToday ?? 0, lang), icon: Smile, hint: lang === "ar" ? "المجموع" : "total" },
  ];

  return (
    <div className="min-h-dvh bg-background">
      <AppHeader />
      <main className="qs-page space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="qs-page-title">{lang === "ar" ? "لوحة التحكم" : "Dashboard"}</h1>
            <p className="qs-page-subtitle">{lang === "ar" ? "إليك ما يحدث في مطعمك اليوم." : "Here’s what’s happening at your restaurant today."}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden rounded-xl border border-border bg-card px-4 py-2.5 text-xs italic text-muted-foreground xl:block">“Good food brings people together.”</div>
            {rid ? (
              <Link to="/manage/$restaurantId/orders" params={{ restaurantId: rid }} className="qs-button-primary">
                <Plus className="size-4" />{lang === "ar" ? "طلب جديد" : "New Order"}
              </Link>
            ) : null}
          </div>
        </div>

        {report.isPending && rid ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[0,1,2,3].map(i => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map(({ label, value, icon: Icon, hint }) => (
              <article key={label} className="qs-stat flex items-center gap-4">
                <span className="qs-stat-icon shrink-0"><Icon className="size-5" /></span>
                <div className="min-w-0"><p className="text-[12px] font-medium text-muted-foreground">{label}</p><p className="mt-1 truncate font-display text-[28px] font-bold tracking-[-.04em]">{value}</p><p className="mt-1 text-[10px] text-muted-foreground"><span className="qs-metric-up">↗</span> {hint}</p></div>
              </article>
            ))}
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(340px,.85fr)]">
          <section className="qs-card min-h-[360px] p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="qs-section-title flex items-center gap-2"><BarChart3 className="size-[18px]" />{lang === "ar" ? "نظرة على المبيعات" : "Sales Overview"}</h2><p className="mt-1 text-xs text-muted-foreground">{lang === "ar" ? "إجمالي المبيعات وحجم الطلبات." : "Total sales and order volume through the day."}</p></div>
              <div className="flex rounded-lg bg-muted p-1 text-xs font-semibold"><span className="rounded-md bg-card px-3 py-1.5 text-[#ff5a0a] shadow-sm">{lang === "ar" ? "المبيعات" : "Sales"}</span><span className="px-3 py-1.5 text-muted-foreground">{lang === "ar" ? "الطلبات" : "Orders"}</span></div>
            </div>
            <div className="mt-5 h-[270px]">
              {series.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={series} margin={{ left: -18, right: 10, top: 12, bottom: 0 }}>
                    <defs><linearGradient id="qsSalesFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ff5a0a" stopOpacity={0.28}/><stop offset="100%" stopColor="#ff5a0a" stopOpacity={0}/></linearGradient></defs>
                    <CartesianGrid stroke="currentColor" strokeOpacity={0.07} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "currentColor", opacity: .55 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "currentColor", opacity: .55 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)", color: "var(--foreground)", fontSize: 11 }} formatter={(value) => formatMoney(Number(value ?? 0), currency, lang)} />
                    <Area type="monotone" dataKey="sales" stroke="#ff5a0a" strokeWidth={2.2} fill="url(#qsSalesFill)" dot={false} activeDot={{ r: 4, fill: "#ff5a0a" }} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : <div className="grid h-full place-items-center text-sm text-muted-foreground">{lang === "ar" ? "ستظهر بيانات المبيعات هنا." : "Sales data will appear here."}</div>}
            </div>
          </section>

          <section className="qs-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-5 py-4"><h2 className="qs-section-title flex items-center gap-2"><Zap className="size-[18px] text-[#ff5a0a]" />{lang === "ar" ? "الطلبات المباشرة" : "Live Orders"}</h2>{rid ? <Link to="/manage/$restaurantId/orders" params={{ restaurantId: rid }} className="text-xs font-semibold text-blue-600">{lang === "ar" ? "عرض الكل" : "View all"} →</Link> : null}</div>
            <div className="divide-y divide-border">
              {(r?.recent ?? []).slice(0, 6).map((order) => (
                <div key={order.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-5 py-3.5">
                  <div className="min-w-0"><p className="truncate text-sm font-bold tabular-nums">{order.order_number}</p><p className="mt-0.5 truncate text-[11px] text-muted-foreground">{order.table ? `${lang === "ar" ? "طاولة" : "Table"} ${order.table} · ` : ""}{formatDateTime(order.created_at, lang)}</p></div>
                  <div className="text-end"><Badge variant="secondary" className="text-[10px] capitalize">{order.status}</Badge><p className="mt-1 text-xs font-bold">{formatMoney(order.total, currency, lang)}</p></div>
                </div>
              ))}
              {(r?.recent ?? []).length === 0 ? <p className="px-5 py-10 text-center text-sm text-muted-foreground">{lang === "ar" ? "لا توجد طلبات حالياً." : "No live orders yet."}</p> : null}
            </div>
          </section>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <section className="qs-card p-5">
            <div className="flex items-center justify-between"><h2 className="qs-section-title flex items-center gap-2"><Trophy className="size-[18px] text-[#ff5a0a]" />{lang === "ar" ? "الوصول السريع" : "Quick Actions"}</h2><span className="text-[11px] text-muted-foreground">{lang === "ar" ? "اليوم" : "Today"}</span></div>
            <div className="mt-4 space-y-2">
              {rid ? [
                { to: `/manage/${rid}`, label: lang === "ar" ? "إدارة القائمة" : "Menu Management", icon: UtensilsCrossed },
                { to: `/manage/${rid}/staff`, label: lang === "ar" ? "إدارة الفريق" : "Staff Management", icon: Users },
                { to: `/manage/${rid}/analytics`, label: lang === "ar" ? "التحليلات" : "Analytics & Reports", icon: BarChart3 },
              ].map(({ to, label, icon: Icon }, index) => <Link key={to} to={to as never} className="flex items-center gap-3 rounded-xl border border-border px-3 py-3 hover:bg-muted/45"><span className="grid size-8 place-items-center rounded-full bg-orange-50 text-[#ff5a0a]"><Icon className="size-4" /></span><span className="min-w-0 flex-1 truncate text-sm font-semibold">{label}</span><span className="text-xs font-bold text-muted-foreground">0{index + 1}</span></Link>) : null}
            </div>
          </section>

          <section className="qs-card p-5">
            <div className="flex items-center justify-between"><h2 className="qs-section-title flex items-center gap-2"><Clock3 className="size-[18px]" />{lang === "ar" ? "النشاط الأخير" : "Recent Activity"}</h2><span className="text-xs text-blue-600">{lang === "ar" ? "مباشر" : "Live"}</span></div>
            <div className="mt-4 space-y-4">{(r?.recent ?? []).slice(0, 5).map((order, index) => <div key={order.id} className="flex gap-3"><span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-full ${index === 0 ? "bg-orange-100 text-orange-600" : "bg-muted text-muted-foreground"}`}><Receipt className="size-4" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{lang === "ar" ? "طلب" : "Order"} {order.order_number}</p><p className="mt-0.5 truncate text-[11px] text-muted-foreground">{order.status} · {formatDateTime(order.created_at, lang)}</p></div></div>)}</div>
          </section>

          <section className="relative overflow-hidden rounded-[14px] border border-orange-100 bg-[#fff4ea] p-5 text-[#181411] dark:border-orange-950/40 dark:bg-[#2a1b13] dark:text-white">
            <div className="absolute -end-16 -top-16 size-52 rounded-full bg-[#ff5a0a]/10" />
            <div className="relative"><p className="font-display text-[25px] font-bold leading-8 tracking-[-.04em]">{lang === "ar" ? "اجعل كل وردية أكثر سلاسة" : "Make Every Shift Smoother"}</p><p className="mt-3 max-w-[260px] text-sm leading-6 opacity-65">{lang === "ar" ? "الأدوات التي يحتاجها فريقك. ضيوف أسعد. عمل أقوى." : "Tools your team needs. Happier guests. Stronger business."}</p><Link to="/manage" className="qs-button-primary mt-6">{lang === "ar" ? "استكشف" : "Explore Features"}<ChevronRight className="size-4" /></Link><div className="mt-8 grid grid-cols-3 gap-2 border-t border-black/10 pt-5 text-center text-[10px] font-semibold dark:border-white/10"><span>⚡ {lang === "ar" ? "أسرع" : "Faster"}</span><span>☺ {lang === "ar" ? "أسعد" : "Happier"}</span><span>▥ {lang === "ar" ? "أعلى" : "Higher Sales"}</span></div></div>
          </section>
        </div>

        {access.isPending ? <Skeleton className="h-24 rounded-2xl" /> : (
          <section className="qs-card p-5">
            <div className="mb-3 flex items-center justify-between"><h2 className="qs-section-title flex items-center gap-2"><Store className="size-[18px]" />{lang === "ar" ? "مساحات العمل" : "Workspaces"}</h2></div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {access.isSuperAdmin ? <WorkspaceCard role={ROLE_LABELS.super_admin[lang]} title={lang === "ar" ? "منصة QuickServe" : "QuickServe platform"} to="/super-admin" /> : null}
              {(access.data ?? []).filter((m) => m.restaurant_id && m.restaurant).slice(0, 5).map((m) => <WorkspaceCard key={m.id} role={ROLE_LABELS[m.role][lang]} title={m.restaurant?.name ?? ""} to={m.role === "restaurant_admin" ? `/manage/${m.restaurant_id}` : "/kitchen"} />)}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function WorkspaceCard({ role, title, to }: { role: string; title: string; to: string }) {
  return <Link to={to as never} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5 hover:bg-muted/40"><span className="grid size-9 place-items-center rounded-xl bg-orange-50 text-[#ff5a0a]"><Store className="size-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{role}</span><span className="block truncate text-sm font-bold">{title}</span></span><ChevronRight className="size-4 text-muted-foreground" /></Link>;
}
