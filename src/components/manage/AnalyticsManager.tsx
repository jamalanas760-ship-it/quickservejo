import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Clock3, MapPin, ShoppingBag, TrendingUp, UsersRound, UtensilsCrossed } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { useWorkspaceReport } from "@/hooks/useWorkspace";
import { useI18n } from "@/lib/i18n";
import { daysAgoIso, formatMoney, formatNumber } from "@/lib/format";

export function AnalyticsManager({ restaurantId }: { restaurantId: string }) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const { data: restaurant } = useRestaurant(restaurantId);
  const report = useWorkspaceReport(restaurantId);
  const currency = restaurant?.currency ?? "JOD";

  const stats = useQuery({
    queryKey: ["platform", "restaurant-analytics-approved", restaurantId],
    queryFn: async () => {
      const since = daysAgoIso(30);
      const { data, error } = await supabase.from("orders").select("id,total,status,created_at").eq("restaurant_id", restaurantId).gte("created_at", since);
      if (error) throw error;
      const all = data ?? [];
      const live = all.filter((order) => order.status !== "cancelled");
      const revenue = live.reduce((sum, order) => sum + Number(order.total ?? 0), 0);
      const byDay = new Map<string, { sales: number; orders: number }>();
      for (const order of live) {
        const key = new Date(order.created_at).toISOString().slice(0, 10);
        const current = byDay.get(key) ?? { sales: 0, orders: 0 };
        current.sales += Number(order.total ?? 0); current.orders += 1; byDay.set(key, current);
      }
      const series = Array.from({ length: 8 }, (_, offset) => {
        const date = new Date(); date.setDate(date.getDate() - (7 - offset));
        const key = date.toISOString().slice(0, 10);
        return { key, label: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }), ...(byDay.get(key) ?? { sales: 0, orders: 0 }) };
      });
      return { orders: live.length, revenue, aov: live.length ? revenue / live.length : 0, series };
    },
  });

  if (stats.isPending || report.isPending) return <Skeleton className="h-[720px] rounded-2xl" />;
  const data = stats.data!;
  const topItems = report.data?.topItems ?? [];
  const cards = [
    { label: ar ? "إجمالي الإيرادات" : "Total Revenue", value: formatMoney(data.revenue, currency, lang), icon: ShoppingBag, tone: "orange" },
    { label: ar ? "إجمالي الطلبات" : "Total Orders", value: formatNumber(data.orders, lang), icon: ShoppingBag, tone: "green" },
    { label: ar ? "العملاء الفريدون" : "Unique Customers", value: formatNumber(data.orders, lang), icon: UsersRound, tone: "blue" },
    { label: ar ? "متوسط قيمة الطلب" : "Average Order Value", value: formatMoney(data.aov, currency, lang), icon: Clock3, tone: "purple" },
  ] as const;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div><p className="mb-2 text-[10px] font-bold uppercase tracking-[.24em] text-muted-foreground">{ar ? "التحليلات" : "Analytics"}</p><h1 className="qs-page-title">{ar ? "أداء المطعم بنظرة واحدة" : "Restaurant performance at a glance"}</h1><p className="qs-page-subtitle">{ar ? "تابع المبيعات والطلبات والعمليات عبر مطعمك." : "Track sales, orders, and operations across your restaurant."}</p></div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" className="qs-button-secondary"><CalendarDays className="size-4" />{ar ? "آخر 30 يوماً" : "Last 30 days"}</button>
          <button type="button" className="qs-button-secondary"><MapPin className="size-4" />{restaurant?.name ?? (ar ? "المطعم" : "Restaurant")}</button>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, icon: Icon, tone }) => <article key={label} className="qs-stat flex items-center gap-4"><span className={`grid size-11 shrink-0 place-items-center rounded-full ${tone === "orange" ? "bg-orange-50 text-[#e85d2a] dark:bg-orange-950/30" : tone === "green" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30" : tone === "blue" ? "bg-blue-50 text-blue-600 dark:bg-blue-950/30" : "bg-violet-50 text-violet-600 dark:bg-violet-950/30"}`}><Icon className="size-5" /></span><div className="min-w-0"><p className="text-[11px] font-medium text-muted-foreground">{label}</p><p className="mt-1 truncate font-display text-[24px] font-bold tracking-[-.04em]">{value}</p><p className="mt-1 text-[10px] font-semibold text-emerald-600">↗ 0% <span className="font-normal text-muted-foreground">{ar ? "مقارنة بالفترة السابقة" : "vs. previous period"}</span></p></div></article>)}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <ChartCard title={ar ? "اتجاه الإيرادات" : "Revenue Trend"} subtitle={ar ? "الإيراد اليومي للفترة المحددة" : "Daily revenue for the selected period"} icon={<TrendingUp className="size-4 text-[#e85d2a]" />}>
          <ResponsiveContainer width="100%" height="100%"><BarChart data={data.series} margin={{ left: -14, right: 8, top: 12, bottom: 0 }}><CartesianGrid stroke="currentColor" strokeOpacity={.07} vertical={false}/><XAxis dataKey="label" tick={{ fontSize: 9, fill: "currentColor", opacity: .55 }} axisLine={false} tickLine={false}/><YAxis tick={{ fontSize: 9, fill: "currentColor", opacity: .55 }} axisLine={false} tickLine={false}/><Tooltip contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)", color: "var(--foreground)", fontSize: 11 }} formatter={(value) => formatMoney(Number(value ?? 0), currency, lang)}/><Bar dataKey="sales" fill="#ff6a22" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer>
        </ChartCard>
        <ChartCard title={ar ? "اتجاه الطلبات" : "Orders Trend"} subtitle={ar ? "عدد الطلبات اليومي للفترة المحددة" : "Daily order count for the selected period"} icon={<ShoppingBag className="size-4 text-emerald-600" />}>
          <ResponsiveContainer width="100%" height="100%"><AreaChart data={data.series} margin={{ left: -14, right: 8, top: 12, bottom: 0 }}><defs><linearGradient id="ordersApprovedFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#16a34a" stopOpacity={.2}/><stop offset="100%" stopColor="#16a34a" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="currentColor" strokeOpacity={.07} vertical={false}/><XAxis dataKey="label" tick={{ fontSize: 9, fill: "currentColor", opacity: .55 }} axisLine={false} tickLine={false}/><YAxis tick={{ fontSize: 9, fill: "currentColor", opacity: .55 }} axisLine={false} tickLine={false}/><Tooltip contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)", color: "var(--foreground)", fontSize: 11 }}/><Area type="monotone" dataKey="orders" stroke="#16a34a" strokeWidth={2.2} fill="url(#ordersApprovedFill)" dot={{ r:3, fill:"#fff", stroke:"#16a34a", strokeWidth:2 }}/></AreaChart></ResponsiveContainer>
        </ChartCard>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="qs-card p-5"><div className="flex items-center justify-between"><div><h2 className="qs-section-title">{ar ? "المنتجات الشائعة" : "Popular Items"}</h2><p className="mt-1 text-xs text-muted-foreground">{ar ? "الأعلى حسب عدد الطلبات" : "Top items by number of orders"}</p></div><UtensilsCrossed className="size-5 text-[#e85d2a]" /></div><div className="mt-5 space-y-4">{topItems.slice(0,5).map((item,index) => <div key={item.name} className="flex items-center gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-bold">{index+1}</span><span className="min-w-0 flex-1"><strong className="block truncate text-xs">{item.name}</strong><span className="text-[10px] text-muted-foreground">{item.quantity} {ar ? "طلب" : "orders"}</span></span><div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[#e85d2a]" style={{width:`${Math.max(10,100-index*16)}%`}} /></div></div>)}{topItems.length===0 ? <p className="py-8 text-center text-sm text-muted-foreground">{ar ? "لا توجد بيانات بعد." : "No item data yet."}</p> : null}</div></div>
        <div className="qs-card p-5"><div><h2 className="qs-section-title">{ar ? "أفضل الفروع" : "Top Branches"}</h2><p className="mt-1 text-xs text-muted-foreground">{ar ? "الإيراد حسب الفرع" : "Revenue by branch"}</p></div><div className="mt-5 rounded-xl border border-border p-4"><div className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-full bg-orange-50 font-bold text-[#e85d2a]">1</span><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{restaurant?.name ?? "Restaurant"}</strong><span className="text-[10px] text-muted-foreground">{formatMoney(data.revenue,currency,lang)}</span></span><span className="font-bold">100%</span></div><div className="mt-3 h-1.5 rounded-full bg-muted"><div className="h-full w-full rounded-full bg-[#e85d2a]" /></div></div></div>
        <div className="qs-card p-5"><div><h2 className="qs-section-title">{ar ? "رؤى وقت الخدمة" : "Service Time Insights"}</h2><p className="mt-1 text-xs text-muted-foreground">{ar ? "من الطلب حتى التقديم" : "From order to serve"}</p></div><div className="mt-5 space-y-4"><Insight label={ar ? "متوسط وقت التحضير" : "Average Preparation Time"} value="0 min" /><Insight label={ar ? "متوسط وقت الخدمة" : "Average Total Service Time"} value="0 min" /><Insight label={ar ? "الطلبات في الوقت" : "On-Time Orders"} value="100%" /></div><div className="mt-5 rounded-xl bg-orange-50 p-3 text-xs font-semibold text-orange-700 dark:bg-orange-950/30 dark:text-orange-300">💡 {ar ? "الخدمة الأسرع تعني ضيوفاً أسعد." : "Faster service leads to happier customers!"}</div></div>
      </section>
    </div>
  );
}

function ChartCard({ title, subtitle, icon, children }: { title:string; subtitle:string; icon:React.ReactNode; children:React.ReactNode }) { return <div className="qs-card p-5"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-full bg-muted">{icon}</span><div><h2 className="qs-section-title">{title}</h2><p className="mt-1 text-xs text-muted-foreground">{subtitle}</p></div><span className="ms-auto rounded-lg border border-border px-2 py-1 text-[10px] font-semibold text-muted-foreground">Daily⌄</span></div><div className="mt-4 h-[275px]">{children}</div></div>; }
function Insight({ label, value }: { label:string; value:string }) { return <div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-full bg-orange-50 text-[#e85d2a] dark:bg-orange-950/30"><Clock3 className="size-4" /></span><span className="min-w-0 flex-1"><span className="block text-[11px] text-muted-foreground">{label}</span><strong className="text-lg">{value}</strong></span><span className="text-[10px] font-bold text-emerald-600">↗ 0%</span></div>; }
