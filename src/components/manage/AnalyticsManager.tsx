import { useQuery } from "@tanstack/react-query";
import { BarChart3, CalendarDays, CircleX, Download, Filter, ShoppingBag, TrendingUp, UsersRound } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { useI18n } from "@/lib/i18n";
import { daysAgoIso, formatMoney, formatNumber } from "@/lib/format";

export function AnalyticsManager({ restaurantId }: { restaurantId: string }) {
  const { lang } = useI18n();
  const { data: restaurant } = useRestaurant(restaurantId);
  const currency = restaurant?.currency ?? "JOD";

  const stats = useQuery({
    queryKey: ["platform", "restaurant-analytics", restaurantId],
    queryFn: async () => {
      const since = daysAgoIso(30);
      const { data, error } = await supabase.from("orders").select("id,total,status,created_at").eq("restaurant_id", restaurantId).gte("created_at", since);
      if (error) throw error;
      const all = data ?? [];
      const live = all.filter((order) => order.status !== "cancelled");
      const revenue = live.reduce((sum, order) => sum + Number(order.total ?? 0), 0);
      const byHour = new Map<number, number>();
      const byDay = new Map<string, { sales: number; orders: number }>();
      const byStatus = new Map<string, number>();
      for (const order of live) {
        const date = new Date(order.created_at);
        const hour = date.getHours();
        byHour.set(hour, (byHour.get(hour) ?? 0) + 1);
        const key = date.toISOString().slice(0, 10);
        const current = byDay.get(key) ?? { sales: 0, orders: 0 };
        current.sales += Number(order.total ?? 0);
        current.orders += 1;
        byDay.set(key, current);
        byStatus.set(order.status, (byStatus.get(order.status) ?? 0) + 1);
      }
      const series = Array.from({ length: 28 }, (_, offset) => {
        const date = new Date();
        date.setDate(date.getDate() - (27 - offset));
        const key = date.toISOString().slice(0, 10);
        const current = byDay.get(key) ?? { sales: 0, orders: 0 };
        return { key, label: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }), ...current };
      });
      return {
        orders: live.length,
        revenue,
        aov: live.length ? revenue / live.length : 0,
        cancelled: all.length - live.length,
        completion: all.length ? (all.filter((order) => ["served", "paid"].includes(order.status)).length / all.length) * 100 : 0,
        peak: [...byHour.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
        series,
        status: [...byStatus.entries()].sort((a, b) => b[1] - a[1]),
      };
    },
  });

  if (stats.isPending) return <Skeleton className="h-[720px] rounded-2xl" />;
  const data = stats.data!;
  const peakMax = Math.max(...data.peak.map((entry) => entry[1]), 1);
  const cards = [
    { label: lang === "ar" ? "إجمالي الإيرادات" : "Total Revenue", value: formatMoney(data.revenue, currency, lang), icon: BarChart3 },
    { label: lang === "ar" ? "إجمالي الطلبات" : "Total Orders", value: formatNumber(data.orders, lang), icon: ShoppingBag },
    { label: lang === "ar" ? "متوسط قيمة الطلب" : "Average Order Value", value: formatMoney(data.aov, currency, lang), icon: TrendingUp },
    { label: lang === "ar" ? "معدل الإكمال" : "Completion Rate", value: `${data.completion.toFixed(1)}%`, icon: UsersRound },
    { label: lang === "ar" ? "الطلبات الملغاة" : "Cancelled", value: formatNumber(data.cancelled, lang), icon: CircleX },
  ];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="qs-page-title">{lang === "ar" ? "التحليلات والتقارير" : "Analytics & Reports"}</h1><p className="qs-page-subtitle">{lang === "ar" ? "حوّل بيانات مطعمك إلى قرارات أذكى." : "Turn your restaurant data into smarter decisions."}</p></div>
        <div className="flex gap-2"><button type="button" className="qs-button-secondary"><Download className="size-4" />{lang === "ar" ? "تصدير التقرير" : "Export Report"}</button><button type="button" className="qs-button-primary"><BarChart3 className="size-4" />{lang === "ar" ? "إنشاء تقرير" : "Generate Report"}</button></div>
      </header>

      <section className="qs-card grid gap-3 p-3 md:grid-cols-2 xl:grid-cols-[1.1fr_1.1fr_1fr_1fr_auto]">
        <FilterControl icon={<CalendarDays className="size-4" />} label={lang === "ar" ? "الفترة" : "Date Range"} value={lang === "ar" ? "آخر 28 يوم" : "Last 28 Days"} />
        <FilterControl icon={<span className="text-[#ff5a0a]">●</span>} label={lang === "ar" ? "المطعم" : "Restaurant"} value={restaurant?.name ?? "Restaurant"} />
        <FilterControl icon={<BarChart3 className="size-4" />} label={lang === "ar" ? "المقارنة" : "Compare To"} value={lang === "ar" ? "الفترة السابقة" : "Previous Period"} />
        <FilterControl icon={<ShoppingBag className="size-4" />} label={lang === "ar" ? "نوع الطلب" : "Order Type"} value={lang === "ar" ? "كل الطلبات" : "All Orders"} />
        <button type="button" className="qs-button-primary min-w-32"><Filter className="size-4" />{lang === "ar" ? "تطبيق" : "Apply Filters"}</button>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map(({ label, value, icon: Icon }) => <div key={label} className="qs-stat"><span className="qs-stat-icon"><Icon className="size-5" /></span><p className="mt-3 text-[11px] font-medium text-muted-foreground">{label}</p><p className="mt-1 font-display text-[25px] font-bold tracking-[-.04em]">{value}</p><p className="mt-1 text-[9px] text-muted-foreground"><span className="qs-metric-up">↗</span> {lang === "ar" ? "آخر 30 يوم" : "last 30 days"}</p></div>)}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title={lang === "ar" ? "اتجاه الإيرادات" : "Revenue Trends"} subtitle={lang === "ar" ? "الإيرادات اليومية للفترة المحددة" : "Daily revenue over the selected period"}>
          <ResponsiveContainer width="100%" height="100%"><AreaChart data={data.series} margin={{ left: -14, right: 8, top: 12, bottom: 0 }}><defs><linearGradient id="analyticsFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ff5a0a" stopOpacity={.28}/><stop offset="100%" stopColor="#ff5a0a" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="currentColor" strokeOpacity={.07} vertical={false}/><XAxis dataKey="label" interval={5} tick={{ fontSize: 9, fill: "currentColor", opacity: .55 }} axisLine={false} tickLine={false}/><YAxis tick={{ fontSize: 9, fill: "currentColor", opacity: .55 }} axisLine={false} tickLine={false}/><Tooltip contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)", color: "var(--foreground)", fontSize: 11 }} formatter={(value) => formatMoney(Number(value ?? 0), currency, lang)}/><Area type="monotone" dataKey="sales" stroke="#ff5a0a" strokeWidth={2.2} fill="url(#analyticsFill)" dot={false}/></AreaChart></ResponsiveContainer>
        </ChartCard>
        <ChartCard title={lang === "ar" ? "حجم الطلبات" : "Order Volume"} subtitle={lang === "ar" ? "إجمالي الطلبات يومياً" : "Total orders by day"}>
          <ResponsiveContainer width="100%" height="100%"><BarChart data={data.series} margin={{ left: -14, right: 8, top: 12, bottom: 0 }}><CartesianGrid stroke="currentColor" strokeOpacity={.07} vertical={false}/><XAxis dataKey="label" interval={5} tick={{ fontSize: 9, fill: "currentColor", opacity: .55 }} axisLine={false} tickLine={false}/><YAxis tick={{ fontSize: 9, fill: "currentColor", opacity: .55 }} axisLine={false} tickLine={false}/><Tooltip contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)", color: "var(--foreground)", fontSize: 11 }}/><Bar dataKey="orders" fill="#ff8450" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="qs-card p-5"><h2 className="qs-section-title">{lang === "ar" ? "ساعات الذروة" : "Peak Hours"}</h2><p className="mt-1 text-xs text-muted-foreground">{lang === "ar" ? "متوسط الطلبات حسب الساعة" : "Orders by time of day"}</p><div className="mt-6 flex h-[210px] items-end gap-2">{data.peak.length ? data.peak.slice().sort((a,b)=>a[0]-b[0]).map(([hour,count]) => <div key={hour} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2"><div className="w-full rounded-t-md bg-[#ff8450]" style={{ height: `${Math.max(14, (count / peakMax) * 175)}px` }} /><span className="text-[9px] text-muted-foreground">{String(hour).padStart(2,"0")}</span></div>) : <div className="m-auto text-sm text-muted-foreground">No data</div>}</div></section>
        <section className="qs-card p-5"><h2 className="qs-section-title">{lang === "ar" ? "حالة الطلبات" : "Order Status Mix"}</h2><p className="mt-1 text-xs text-muted-foreground">{lang === "ar" ? "توزيع الطلبات خلال الفترة" : "Distribution for the selected period"}</p><div className="mt-5 space-y-4">{data.status.slice(0,6).map(([status,count]) => <div key={status}><div className="flex items-center justify-between text-xs"><span className="capitalize font-semibold">{status}</span><span className="text-muted-foreground">{count}</span></div><div className="mt-1.5 h-2 rounded-full bg-muted"><div className="h-full rounded-full bg-[#ff5a0a]" style={{ width: `${Math.max(5, (count / Math.max(data.orders, 1)) * 100)}%` }} /></div></div>)}</div></section>
        <section className="qs-card p-5"><h2 className="qs-section-title">{lang === "ar" ? "مؤشر التشغيل" : "Service Completion"}</h2><p className="mt-1 text-xs text-muted-foreground">{lang === "ar" ? "الطلبات المكتملة مقارنة بالإجمالي" : "Completed orders compared with total"}</p><div className="mt-7 grid place-items-center"><div className="grid size-40 place-items-center rounded-full" style={{ background: `conic-gradient(#ff5a0a ${Math.min(100,data.completion)}%, var(--muted) 0)` }}><div className="grid size-28 place-items-center rounded-full bg-card"><div className="text-center"><p className="font-display text-3xl font-bold">{data.completion.toFixed(0)}%</p><p className="text-[10px] text-muted-foreground">completed</p></div></div></div></div></section>
      </div>
    </div>
  );
}

function FilterControl({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <button type="button" className="qs-control flex h-12 items-center gap-3 px-3 text-start"><span className="text-muted-foreground">{icon}</span><span className="min-w-0"><span className="block text-[9px] text-muted-foreground">{label}</span><span className="block truncate text-xs font-bold">{value}</span></span><span className="ms-auto text-muted-foreground">⌄</span></button>;
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <section className="qs-card p-5"><div><h2 className="qs-section-title">{title}</h2><p className="mt-1 text-xs text-muted-foreground">{subtitle}</p></div><div className="mt-4 h-[270px]">{children}</div></section>;
}
