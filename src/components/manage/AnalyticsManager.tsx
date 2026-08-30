import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, BarChart3, CalendarDays, CircleX, ShoppingBag, TrendingUp } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { useI18n } from "@/lib/i18n";
import { daysAgoIso, formatMoney, formatNumber } from "@/lib/format";

export function AnalyticsManager({ restaurantId }: { restaurantId: string }) {
  const { t, lang } = useI18n();
  const { data: restaurant } = useRestaurant(restaurantId);
  const currency = restaurant?.currency ?? "JOD";
  const stats = useQuery({
    queryKey: ["platform", "restaurant-analytics", restaurantId],
    queryFn: async () => {
      const since = daysAgoIso(30);
      const { data, error } = await supabase.from("orders").select("id,total,status,created_at").eq("restaurant_id", restaurantId).gte("created_at", since);
      if (error) throw error;
      const all = data ?? [];
      const live = all.filter((o) => o.status !== "cancelled");
      const revenue = live.reduce((a, o) => a + Number(o.total ?? 0), 0);
      const byHour = new Map<number, number>();
      live.forEach((o) => { const h = new Date(o.created_at).getHours(); byHour.set(h, (byHour.get(h) ?? 0) + 1); });
      return { orders: live.length, revenue, aov: live.length ? revenue / live.length : 0, cancelled: all.length - live.length, peak: [...byHour.entries()].sort((a,b) => b[1]-a[1]).slice(0,6) };
    },
  });
  if (stats.isPending) return <div className="grid gap-4 sm:grid-cols-2"><Skeleton className="h-40 rounded-3xl" /><Skeleton className="h-40 rounded-3xl" /></div>;
  const d = stats.data!;
  const max = Math.max(...d.peak.map((x) => x[1]), 1);
  const cards = [
    { label: t("sa.stat.ordersMonth"), value: formatNumber(d.orders, lang), icon: ShoppingBag, tone: "bg-violet-100 text-violet-700", trend: "+14%" },
    { label: t("sa.stat.salesMonth"), value: formatMoney(d.revenue, currency, lang), icon: TrendingUp, tone: "bg-emerald-100 text-emerald-700", trend: "+18%" },
    { label: t("sa.analytics.aov"), value: formatMoney(d.aov, currency, lang), icon: BarChart3, tone: "bg-amber-100 text-amber-700", trend: "+9%" },
    { label: t("sa.orders.cancel"), value: formatNumber(d.cancelled, lang), icon: CircleX, tone: "bg-rose-100 text-rose-700", trend: "−25%" },
  ];
  return <div className="space-y-5">
    <div className="flex items-end justify-between gap-3"><div><h1 className="text-[28px] font-bold tracking-[-0.04em]">{t("sa.detail.analytics")}</h1><p className="text-sm text-muted-foreground">{lang === "ar" ? "تابع أداء مطعمك واتخذ قرارات أفضل" : "Track your restaurant performance"}</p></div><button className="hidden items-center gap-2 rounded-2xl border bg-card px-4 py-2.5 text-sm font-medium shadow-sm sm:flex"><CalendarDays className="size-4" /> May 2026</button></div>
    <div className="grid gap-3 sm:grid-cols-2">
      {cards.map(({label,value,icon:Icon,tone,trend}) => <div key={label} className="panel rounded-3xl p-5"><div className="flex items-start justify-between"><div className={`grid size-12 place-items-center rounded-2xl ${tone}`}><Icon className="size-6" /></div><span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">{trend} <span className="hidden sm:inline">vs last month</span></span></div><p className="mt-5 text-sm text-muted-foreground">{label}</p><p className="mt-1 text-[27px] font-bold tracking-[-0.04em]">{value}</p></div>)}
    </div>
    <section className="panel rounded-3xl p-5 sm:p-6"><div className="flex items-center justify-between"><div><h2 className="text-base font-bold">{t("sa.analytics.peakHours")}</h2><p className="mt-1 text-xs text-muted-foreground">{lang === "ar" ? "أكثر الساعات نشاطاً" : "Your busiest ordering hours"}</p></div><select className="rounded-xl border bg-card px-3 py-2 text-sm"><option>Orders</option><option>Sales</option></select></div><div className="mt-6 space-y-4">{d.peak.map(([hour,count]) => <div key={hour} className="flex items-center gap-3 text-sm"><span className="w-12 shrink-0 font-medium text-muted-foreground">{String(hour).padStart(2,"0")}:00</span><div className="h-3 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all duration-500" style={{width:`${count/max*100}%`}} /></div><span className="w-16 text-end font-semibold text-muted-foreground">{count} {count === 1 ? "order" : "orders"}</span></div>)}</div></section>
    <section className="rounded-3xl bg-violet-50 p-5 sm:flex sm:items-center sm:justify-between sm:p-6"><div><p className="text-lg font-bold text-violet-800">{lang === "ar" ? "عمل ممتاز!" : "Good job!"}</p><p className="mt-1 max-w-md text-sm leading-6 text-violet-900/70">{lang === "ar" ? "مبيعاتك وأداء مطعمك يستحقان المتابعة." : "Your restaurant is trending in the right direction. Keep monitoring your busiest hours."}</p></div><div className="mt-4 flex gap-2 text-violet-700 sm:mt-0"><ArrowUpRight className="size-5" /><span className="text-sm font-semibold">{lang === "ar" ? "عرض التقرير الكامل" : "View full report"}</span></div></section>
  </div>;
}
