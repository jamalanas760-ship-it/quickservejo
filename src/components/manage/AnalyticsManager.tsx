import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { CalendarDays, Clock3, GripVertical, MapPin, Save, Settings2, ShoppingBag, TrendingUp, UsersRound, UtensilsCrossed } from "lucide-react";
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
  type WidgetId = "revenue" | "orders" | "items" | "branches" | "service";
  const defaultOrder: WidgetId[] = ["revenue", "orders", "items", "branches", "service"];
  const storedOrder = ((restaurant?.menu_theme as any)?.workspace?.analyticsWidgetOrder as WidgetId[] | undefined) ?? defaultOrder;
  const [customizing, setCustomizing] = useState(false);
  const [widgetOrder, setWidgetOrder] = useState<WidgetId[]>(storedOrder);
  const dragging = useRef<WidgetId | null>(null);

  function moveWidget(active: WidgetId, target: WidgetId) {
    if (active === target) return;
    setWidgetOrder((current) => { const next = [...current]; const from = next.indexOf(active); const to = next.indexOf(target); if (from < 0 || to < 0) return current; next.splice(from, 1); next.splice(to, 0, active); return next; });
  }

  async function saveLayout() {
    const theme = restaurant?.menu_theme && typeof restaurant.menu_theme === "object" ? restaurant.menu_theme as Record<string, any> : {};
    const workspace = theme.workspace && typeof theme.workspace === "object" ? theme.workspace : {};
    const { error } = await supabase.from("restaurants").update({ menu_theme: { ...theme, workspace: { ...workspace, analyticsWidgetOrder: widgetOrder } } }).eq("id", restaurantId);
    if (!error) setCustomizing(false);
  }

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
          <button type="button" className="qs-button-secondary" onClick={() => customizing ? void saveLayout() : setCustomizing(true)}>{customizing ? <Save className="size-4" /> : <Settings2 className="size-4" />}{customizing ? (ar ? "حفظ التخطيط" : "Save Layout") : (ar ? "تخصيص لوحة التحكم" : "Customize Dashboard")}</button>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, icon: Icon, tone }) => <article key={label} className="qs-stat flex items-center gap-4"><span className={`grid size-11 shrink-0 place-items-center rounded-full ${tone === "orange" ? "bg-orange-50 text-[#ff5a0a] dark:bg-orange-950/30" : tone === "green" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30" : tone === "blue" ? "bg-blue-50 text-blue-600 dark:bg-blue-950/30" : "bg-violet-50 text-violet-600 dark:bg-violet-950/30"}`}><Icon className="size-5" /></span><div className="min-w-0"><p className="text-[11px] font-medium text-muted-foreground">{label}</p><p className="mt-1 truncate font-display text-[24px] font-bold tracking-[-.04em]">{value}</p><p className="mt-1 text-[10px] font-semibold text-emerald-600">↗ 0% <span className="font-normal text-muted-foreground">{ar ? "مقارنة بالفترة السابقة" : "vs. previous period"}</span></p></div></article>)}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {widgetOrder.map((id) => <div key={id} className={id === "items" || id === "branches" || id === "service" ? "xl:col-span-1" : ""} onPointerEnter={() => dragging.current && moveWidget(dragging.current, id)}>
        {id === "revenue" ? <ChartCard customizing={customizing} onPointerDown={(event) => { dragging.current = id; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerUp={() => { dragging.current = null; }} title={ar ? "اتجاه الإيرادات" : "Revenue Trend"} subtitle={ar ? "الإيراد اليومي للفترة المحددة" : "Daily revenue for the selected period"} icon={<TrendingUp className="size-4 text-[#ff5a0a]" />}>
          <ResponsiveContainer width="100%" height="100%"><BarChart data={data.series} margin={{ left: -14, right: 8, top: 12, bottom: 0 }}><CartesianGrid stroke="currentColor" strokeOpacity={.07} vertical={false}/><XAxis dataKey="label" tick={{ fontSize: 9, fill: "currentColor", opacity: .55 }} axisLine={false} tickLine={false}/><YAxis tick={{ fontSize: 9, fill: "currentColor", opacity: .55 }} axisLine={false} tickLine={false}/><Tooltip contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)", color: "var(--foreground)", fontSize: 11 }} formatter={(value) => formatMoney(Number(value ?? 0), currency, lang)}/><Bar dataKey="sales" fill="#ff6a22" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer>
        </ChartCard> : id === "orders" ? <ChartCard customizing={customizing} onPointerDown={(event) => { dragging.current = id; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerUp={() => { dragging.current = null; }} title={ar ? "اتجاه الطلبات" : "Orders Trend"} subtitle={ar ? "عدد الطلبات اليومي للفترة المحددة" : "Daily order count for the selected period"} icon={<ShoppingBag className="size-4 text-emerald-600" />}>
          <ResponsiveContainer width="100%" height="100%"><AreaChart data={data.series} margin={{ left: -14, right: 8, top: 12, bottom: 0 }}><defs><linearGradient id="ordersApprovedFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#16a34a" stopOpacity={.2}/><stop offset="100%" stopColor="#16a34a" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="currentColor" strokeOpacity={.07} vertical={false}/><XAxis dataKey="label" tick={{ fontSize: 9, fill: "currentColor", opacity: .55 }} axisLine={false} tickLine={false}/><YAxis tick={{ fontSize: 9, fill: "currentColor", opacity: .55 }} axisLine={false} tickLine={false}/><Tooltip contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)", color: "var(--foreground)", fontSize: 11 }}/><Area type="monotone" dataKey="orders" stroke="#16a34a" strokeWidth={2.2} fill="url(#ordersApprovedFill)" dot={{ r:3, fill:"#fff", stroke:"#16a34a", strokeWidth:2 }}/></AreaChart></ResponsiveContainer>
        </ChartCard> : id === "items" ? <WidgetShell customizing={customizing} onPointerDown={(event) => { dragging.current=id; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerUp={()=>{dragging.current=null;}}><div className="flex items-center justify-between"><div><h2 className="qs-section-title">{ar ? "المنتجات الشائعة" : "Popular Items"}</h2><p className="mt-1 text-xs text-muted-foreground">{ar ? "الأعلى حسب عدد الطلبات" : "Top items by number of orders"}</p></div><UtensilsCrossed className="size-5 text-[#ff5a0a]" /></div><div className="mt-5 space-y-4">{topItems.slice(0,5).map((item,index) => <div key={item.name} className="flex items-center gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-bold">{index+1}</span><span className="min-w-0 flex-1"><strong className="block truncate text-xs">{item.name}</strong><span className="text-[10px] text-muted-foreground">{item.quantity} {ar ? "طلب" : "orders"}</span></span></div>)}{topItems.length===0 ? <p className="py-8 text-center text-sm text-muted-foreground">{ar ? "لا توجد بيانات بعد." : "No item data yet."}</p> : null}</div></WidgetShell> : id === "branches" ? <WidgetShell customizing={customizing} onPointerDown={(event)=>{dragging.current=id;event.currentTarget.setPointerCapture(event.pointerId);}} onPointerUp={()=>{dragging.current=null;}}><h2 className="qs-section-title">{ar ? "أفضل الفروع" : "Top Branches"}</h2><div className="mt-5 rounded-xl border border-border p-4"><strong>{restaurant?.name}</strong><p className="text-sm text-muted-foreground">{formatMoney(data.revenue,currency,lang)}</p></div></WidgetShell> : <WidgetShell customizing={customizing} onPointerDown={(event)=>{dragging.current=id;event.currentTarget.setPointerCapture(event.pointerId);}} onPointerUp={()=>{dragging.current=null;}}><h2 className="qs-section-title">{ar ? "رؤى وقت الخدمة" : "Service Time Insights"}</h2><p className="mt-4 text-sm text-muted-foreground">{ar ? "لا تتوفر بيانات توقيت الخدمة بعد." : "Service timing data is not available yet."}</p></WidgetShell>}
        </div>)}
      </section>
    </div>
  );
}

type DragProps={customizing:boolean;onPointerDown:React.PointerEventHandler<HTMLButtonElement>;onPointerUp:React.PointerEventHandler<HTMLButtonElement>};
function Grip({customizing,onPointerDown,onPointerUp}:DragProps){return customizing?<button type="button" className="ms-auto grid size-11 touch-none cursor-grab place-items-center rounded-lg border border-border active:cursor-grabbing" aria-label="Drag to reorder widget" onPointerDown={onPointerDown} onPointerUp={onPointerUp}><GripVertical className="size-5"/></button>:null;}
function ChartCard({ title, subtitle, icon, children,...drag }: { title:string; subtitle:string; icon:React.ReactNode; children:React.ReactNode }&DragProps) { return <div className="qs-card p-5"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-full bg-muted">{icon}</span><div><h2 className="qs-section-title">{title}</h2><p className="mt-1 text-xs text-muted-foreground">{subtitle}</p></div><Grip {...drag}/></div><div className="mt-4 h-[275px]">{children}</div></div>; }
function WidgetShell({children,...drag}:{children:React.ReactNode}&DragProps){return <div className="qs-card relative min-h-44 p-5"><div className="absolute end-3 top-3"><Grip {...drag}/></div>{children}</div>}
function Insight({ label, value }: { label:string; value:string }) { return <div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-full bg-orange-50 text-[#ff5a0a] dark:bg-orange-950/30"><Clock3 className="size-4" /></span><span className="min-w-0 flex-1"><span className="block text-[11px] text-muted-foreground">{label}</span><strong className="text-lg">{value}</strong></span><span className="text-[10px] font-bold text-emerald-600">↗ 0%</span></div>; }
