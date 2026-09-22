import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  AlertTriangle,
  Building2,
  ClipboardList,
  LayoutGrid,
  Users,
  Wallet,
  Bell,
} from "lucide-react";

import { MasterEyebrow, MasterKpi, MasterPageHeader, MasterSection, MasterStatus } from "@/components/app/MasterPage";
import { RevenueTrend } from "@/components/superadmin/RevenueTrend";
import { DateRangePicker } from "@/components/common/DateRangePicker";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAuditLogs,
  usePlatformStats,
  useRestaurantsWithStats,
} from "@/hooks/useSuperAdmin";
import { useI18n } from "@/lib/i18n";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { healthOf } from "@/lib/health";
import { humanError } from "@/lib/errors";
import { rangeFromPreset, type DateRange } from "@/lib/range";


export const Route = createFileRoute("/_authenticated/super-admin/")({
  head: () => ({
    meta: [
      { title: "Platform dashboard — QuickServe admin" },
      {
        name: "description",
        content:
          "Live QuickServe platform metrics: restaurants, orders, sales and staff across every tenant.",
      },
      { property: "og:title", content: "Platform dashboard — QuickServe admin" },
      {
        property: "og:description",
        content: "Monitor every restaurant on the QuickServe platform in real time.",
      },
    ],
  }),
  component: PlatformDashboard,
});

function PlatformDashboard() {
  const { t, lang } = useI18n();
  const [range, setRange] = useState<DateRange>(() => rangeFromPreset("30d"));
  const stats = usePlatformStats();
  const restaurants = useRestaurantsWithStats();
  const activity = useAuditLogs({});

  const loading = stats.isPending;
  const s = stats.data;

  const attention = (restaurants.data ?? [])
    .map((r) => ({ restaurant: r, health: healthOf(r) }))
    .filter((x) => x.health.level !== "healthy");

  // Subscription health: anything a platform owner should chase this week.
  const soon = Date.now() + 7 * 86_400_000;
  const billing = (restaurants.data ?? [])
    .map((r) => {
      const ends = r.subscription_end ? new Date(r.subscription_end).getTime() : null;
      if (r.subscription_status === "suspended")
        return { restaurant: r, flag: t("sa.sub.suspended"), tone: "destructive" as const };
      if (r.subscription_status === "past_due")
        return { restaurant: r, flag: t("sa.sub.pastDue"), tone: "destructive" as const };
      if (r.subscription_status === "trialing" && ends && ends <= soon)
        return { restaurant: r, flag: t("sa.sub.trialEnding"), tone: "outline" as const };
      return null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return (
    <div className="space-y-5">
      <MasterPageHeader
        eyebrow={<MasterEyebrow icon={LayoutGrid}>{lang==="ar"?"مركز تحكم المنصة":"Platform control center"}</MasterEyebrow>}
        title={t("sa.nav.dashboard")}
        description={lang==="ar"?"نظرة تشغيلية مباشرة على المطاعم، الإيرادات، الصحة والتنبيهات عبر كل العملاء.":"A live operating view of tenants, revenue, health and attention across the QuickServe platform."}
        actions={<><DateRangePicker value={range} onChange={setRange}/><Button asChild><Link to="/super-admin/restaurants/new">{t("sa.rest.new")}</Link></Button></>}
      />

      {stats.isError ? <MasterSection><p className="font-medium">{t("common.error")}</p><p className="mt-1 text-sm text-muted-foreground">{humanError(stats.error,lang)}</p><Button size="sm" className="mt-4" onClick={()=>void stats.refetch()}>{t("common.retry")}</Button></MasterSection>:null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MasterKpi icon={Building2} label={t("sa.stat.totalRestaurants")} value={loading?"—":formatNumber(s?.restaurants,lang)} hint={`${formatNumber(s?.activeRestaurants,lang)} ${t("sa.status.active")} · ${formatNumber(s?.inactiveRestaurants,lang)} ${t("sa.status.inactive")}`} tone="orange"/>
        <MasterKpi icon={ClipboardList} label={t("sa.stat.ordersToday")} value={loading?"—":formatNumber(s?.ordersToday,lang)} hint={`${t("sa.stat.ordersWeek")}: ${formatNumber(s?.ordersWeek,lang)}`} tone="blue"/>
        <MasterKpi icon={Wallet} label={t("sa.stat.salesToday")} value={loading?"—":formatMoney(s?.salesToday,"JOD",lang)} hint={`${t("sa.stat.salesMonth")}: ${formatMoney(s?.salesMonth,"JOD",lang)}`} tone="green"/>
        <MasterKpi icon={Users} label={t("sa.stat.staff")} value={loading?"—":formatNumber(s?.staff,lang)} hint={`${t("sa.stat.activeTables")}: ${formatNumber(s?.tables,lang)} · ${t("sa.stat.menuItems")}: ${formatNumber(s?.menuItems,lang)}`} tone="purple"/>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.35fr_.85fr]">
        <RevenueTrend range={range} currency="JOD"/>
        <MasterSection title={lang==="ar"?"تنبيهات تحتاج انتباه":"Needs attention"} description={lang==="ar"?"المطاعم التي تحتاج تدخلاً من مسؤول المنصة.":"Tenants that need platform-admin attention."}>
          {attention.length===0?<div className="grid min-h-[220px] place-items-center text-center"><div><Bell className="mx-auto size-6 text-emerald-600"/><p className="mt-3 text-sm font-semibold">{t("sa.notifications.empty")}</p></div></div>:<div className="space-y-2">{attention.slice(0,7).map(({restaurant,health})=><Link key={restaurant.id} to="/super-admin/restaurants/$restaurantId" params={{restaurantId:restaurant.id}} className="flex items-center gap-3 rounded-xl border border-border/80 px-3 py-3 transition hover:bg-muted/50"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-500/10 text-amber-700"><AlertTriangle className="size-4"/></span><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{restaurant.name}</strong><span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{health.missing.map((m)=>lang==="ar"?m.labelAr:m.labelEn).join(" · ")}</span></span><MasterStatus tone={health.level==="critical"?"red":"orange"}>{health.percent}%</MasterStatus></Link>)}</div>}
        </MasterSection>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
        <MasterSection
          title={t("sa.nav.restaurants")}
          description={lang==="ar"?"حالة العملاء، الإيرادات والطلبات الأخيرة.":"Tenant health, revenue and order activity."}
          action={<Button asChild variant="outline" size="sm"><Link to="/super-admin/restaurants">{t("common.next")}</Link></Button>}
          contentClassName="p-0"
        >
          {restaurants.isPending?<div className="space-y-2 p-4">{[0,1,2,3].map((i)=><Skeleton key={i} className="h-14 rounded-xl"/>)}</div>:(restaurants.data??[]).length===0?<p className="p-6 text-sm text-muted-foreground">{t("sa.rest.empty")}</p>:<div className="divide-y divide-border/80">{(restaurants.data??[]).slice(0,8).map((r)=>{const health=healthOf(r);return <Link key={r.id} to="/super-admin/restaurants/$restaurantId" params={{restaurantId:r.id}} className="grid gap-3 px-4 py-3.5 transition hover:bg-muted/45 sm:grid-cols-[minmax(0,1fr)_120px_120px_auto] sm:items-center"><div className="min-w-0"><strong className="block truncate text-sm">{r.name}</strong><span className="mt-0.5 block text-[10px] text-muted-foreground">{r.subscription_status??"—"}</span></div><div><span className="block text-[10px] text-muted-foreground">{t("sa.rest.col.orders")}</span><strong className="text-sm">{formatNumber(r.orderCount,lang)}</strong></div><div><span className="block text-[10px] text-muted-foreground">{lang==="ar"?"الإيراد":"Revenue"}</span><strong className="text-sm">{formatMoney(r.revenue,r.currency,lang)}</strong></div><MasterStatus tone={health.level==="healthy"?"green":health.level==="critical"?"red":"orange"}>{health.percent}%</MasterStatus></Link>})}</div>}
        </MasterSection>

        <MasterSection title={t("sa.activity")} description={lang==="ar"?"آخر تغييرات المنصة والأحداث الإدارية.":"Latest platform and administrative events."} action={<Button asChild variant="ghost" size="sm"><Link to="/super-admin/audit-logs">{t("sa.nav.audit")}</Link></Button>}>
          {(activity.data??[]).length===0?<p className="py-8 text-center text-sm text-muted-foreground">{t("sa.activity.empty")}</p>:<div className="space-y-1">{(activity.data??[]).slice(0,8).map((log)=><div key={log.id} className="flex items-start gap-3 rounded-xl px-2 py-2.5 hover:bg-muted/45"><span className="mt-1 size-2 shrink-0 rounded-full bg-[#e85d2a]"/><div className="min-w-0 flex-1"><p className="truncate text-xs"><strong>{log.actor_name??"—"}</strong> <span className="text-muted-foreground">{log.action}</span></p><p className="mt-1 text-[10px] text-muted-foreground">{formatDateTime(log.created_at,lang)}</p></div></div>)}</div>}
        </MasterSection>
      </section>

      {billing.length>0?<MasterSection title={lang==="ar"?"متابعة الاشتراكات":"Subscription follow-up"}><div className="flex flex-wrap gap-2">{billing.slice(0,8).map((item)=><Link key={item.restaurant.id} to="/super-admin/restaurants/$restaurantId" params={{restaurantId:item.restaurant.id}} className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-semibold hover:bg-muted/50"><Building2 className="size-3.5 text-[#e85d2a]"/>{item.restaurant.name}<Badge variant={item.tone}>{item.flag}</Badge></Link>)}</div></MasterSection>:null}
    </div>
  );
}
