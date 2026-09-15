import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, CalendarDays, ChevronDown, ChevronUp, CircleGauge, FileText, GripVertical, LineChart as LineIcon, ListPlus, Plus, RotateCcw, Settings2, Table2, Trash2, TrendingUp } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { formatMoney, formatNumber } from "@/lib/format";
import { humanError } from "@/lib/errors";
import { useI18n, type Language } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type WidgetId = "revenue" | "orders" | "channels" | "topProducts" | "peakHours" | "weekly" | "orderTable" | "paidProgress" | "summary";
type ChartType = "area" | "line" | "bar" | "donut";
type DashboardConfig = {
  widgets: WidgetId[];
  accent: string;
  colors: Partial<Record<WidgetId, string>>;
  chartTypes: Partial<Record<WidgetId, ChartType>>;
};
type OrderRow = { id: string; order_number: string; status: string; payment_status: string; total: number | string; table_id: string | null; created_at: string };
type OrderItemRow = { product_name_snapshot_en: string; product_name_snapshot_ar: string; quantity: number; total_price: number | string; created_at: string };

const ALL_WIDGETS: WidgetId[] = ["revenue", "orders", "channels", "topProducts", "peakHours", "weekly", "orderTable", "paidProgress", "summary"];
const DEFAULT_WIDGETS: WidgetId[] = ["revenue", "orders", "channels", "topProducts", "peakHours", "weekly", "paidProgress", "orderTable"];
const DEFAULT_CHART_TYPES: Partial<Record<WidgetId, ChartType>> = { revenue: "area", orders: "bar", channels: "donut", peakHours: "bar", weekly: "bar" };
const CHART_OPTIONS: Partial<Record<WidgetId, ChartType[]>> = {
  revenue: ["area", "line", "bar"],
  orders: ["bar", "line", "area"],
  channels: ["donut", "bar"],
  peakHours: ["bar", "line", "area"],
  weekly: ["bar", "line", "area"],
};
const COLORS = ["#ff6a1a", "#10b981", "#3b82f6", "#8b5cf6"];

function objectValue(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function validColor(value: unknown, fallback: string) { return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback; }
function readConfig(theme: unknown): DashboardConfig {
  const workspace = objectValue(objectValue(theme).workspace);
  const raw = objectValue(workspace.analyticsDashboard);
  const widgets = Array.isArray(raw.widgets) ? raw.widgets.filter((value): value is WidgetId => ALL_WIDGETS.includes(value as WidgetId)) : DEFAULT_WIDGETS;
  const accent = validColor(raw.accent, "#ff6a1a");
  const rawColors = objectValue(raw.colors);
  const colors: Partial<Record<WidgetId, string>> = {};
  ALL_WIDGETS.forEach((id) => { if (rawColors[id] !== undefined) colors[id] = validColor(rawColors[id], accent); });
  const rawTypes = objectValue(raw.chartTypes);
  const chartTypes: Partial<Record<WidgetId, ChartType>> = {};
  ALL_WIDGETS.forEach((id) => {
    const value = rawTypes[id];
    const allowed = CHART_OPTIONS[id];
    if (allowed?.includes(value as ChartType)) chartTypes[id] = value as ChartType;
  });
  return { widgets: widgets.length ? widgets : DEFAULT_WIDGETS, accent, colors, chartTypes };
}

export function AnalyticsManagerPro({ restaurantId }: { restaurantId: string }) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const restaurant = useRestaurant(restaurantId);
  const currency = restaurant.data?.currency ?? "JOD";
  const qc = useQueryClient();
  const initial = useMemo(() => readConfig(restaurant.data?.menu_theme), [restaurant.data?.menu_theme]);
  const [config, setConfig] = useState<DashboardConfig>(initial);
  const [customize, setCustomize] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const analytics = useQuery({
    queryKey: ["platform", "analytics-pro", restaurantId],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const iso = since.toISOString();
      const [{ data: orders, error: ordersError }, { data: items, error: itemsError }] = await Promise.all([
        supabase.from("orders").select("id,order_number,status,payment_status,total,table_id,created_at").eq("restaurant_id", restaurantId).gte("created_at", iso).order("created_at", { ascending: true }),
        supabase.from("order_items").select("product_name_snapshot_en,product_name_snapshot_ar,quantity,total_price,created_at").eq("restaurant_id", restaurantId).gte("created_at", iso),
      ]);
      if (ordersError) throw ordersError;
      if (itemsError) throw itemsError;
      const rows = (orders ?? []) as unknown as OrderRow[];
      const live = rows.filter((order) => order.status !== "cancelled");
      const revenue = live.reduce((sum, order) => sum + Number(order.total ?? 0), 0);
      const paid = live.filter((order) => order.payment_status === "paid").length;
      const byDay = new Map<string, { sales: number; orders: number }>();
      const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0 }));
      const byWeekday = Array.from({ length: 7 }, (_, day) => ({ day, orders: 0, sales: 0 }));
      let dineIn = 0;
      let takeaway = 0;
      for (const order of live) {
        const date = new Date(order.created_at);
        const key = date.toISOString().slice(0, 10);
        const current = byDay.get(key) ?? { sales: 0, orders: 0 };
        current.sales += Number(order.total ?? 0);
        current.orders += 1;
        byDay.set(key, current);
        byHour[date.getHours()]!.orders += 1;
        const weekday = date.getDay();
        byWeekday[weekday]!.orders += 1;
        byWeekday[weekday]!.sales += Number(order.total ?? 0);
        if (order.table_id) dineIn += 1; else takeaway += 1;
      }
      const series = Array.from({ length: 14 }, (_, index) => {
        const date = new Date();
        date.setDate(date.getDate() - (13 - index));
        const key = date.toISOString().slice(0, 10);
        return { key, label: date.toLocaleDateString(ar ? "ar-JO" : "en-US", { month: "short", day: "numeric" }), ...(byDay.get(key) ?? { sales: 0, orders: 0 }) };
      });
      const itemMap = new Map<string, { nameAr: string; qty: number; revenue: number }>();
      for (const item of (items ?? []) as unknown as OrderItemRow[]) {
        const name = item.product_name_snapshot_en || item.product_name_snapshot_ar || "Item";
        const current = itemMap.get(name) ?? { nameAr: item.product_name_snapshot_ar || name, qty: 0, revenue: 0 };
        current.qty += Number(item.quantity ?? 0);
        current.revenue += Number(item.total_price ?? 0);
        itemMap.set(name, current);
      }
      const topProducts = Array.from(itemMap.entries()).map(([name, value]) => ({ name, ...value })).sort((a, b) => b.qty - a.qty).slice(0, 8);
      const weekly = byWeekday.map((value, index) => ({ label: new Intl.DateTimeFormat(ar ? "ar-JO" : "en-US", { weekday: "short" }).format(new Date(2026, 0, 4 + index)), ...value }));
      const peak = byHour.filter((value) => value.orders > 0);
      return {
        orders: live,
        revenue,
        aov: live.length ? revenue / live.length : 0,
        paidRate: live.length ? paid / live.length * 100 : 0,
        series,
        channels: [{ name: ar ? "داخل المطعم" : "Dine-in", value: dineIn }, { name: ar ? "خارجي" : "Takeaway", value: takeaway }].filter((value) => value.value > 0),
        topProducts,
        peak,
        weekly,
        recent: [...live].reverse().slice(0, 10),
      };
    },
  });

  async function saveConfig(next = config) {
    setSaving(true);
    try {
      const current = await supabase.from("restaurants").select("menu_theme").eq("id", restaurantId).single();
      if (current.error) throw current.error;
      const theme = objectValue(current.data.menu_theme);
      const workspace = objectValue(theme.workspace);
      const { error } = await supabase.from("restaurants").update({ menu_theme: { ...theme, workspace: { ...workspace, analyticsDashboard: next } } }).eq("id", restaurantId);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["platform"] });
      toast.success(ar ? "تم حفظ لوحة التحليلات" : "Analytics dashboard saved");
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setSaving(false);
    }
  }
  function move(id: WidgetId, delta: number) {
    setConfig((previous) => {
      const list = [...previous.widgets];
      const index = list.indexOf(id);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= list.length) return previous;
      [list[index], list[target]] = [list[target]!, list[index]!];
      return { ...previous, widgets: list };
    });
  }
  function remove(id: WidgetId) { setConfig((previous) => ({ ...previous, widgets: previous.widgets.filter((value) => value !== id) })); }
  function add(id: WidgetId) { setConfig((previous) => previous.widgets.includes(id) ? previous : { ...previous, widgets: [...previous.widgets, id] }); setAddOpen(false); }
  function setWidgetColor(id: WidgetId, color: string) { setConfig((previous) => ({ ...previous, colors: { ...previous.colors, [id]: color } })); }
  function setChartType(id: WidgetId, chartType: ChartType) { setConfig((previous) => ({ ...previous, chartTypes: { ...previous.chartTypes, [id]: chartType } })); }
  function resetDashboard() { setConfig({ widgets: [...DEFAULT_WIDGETS], accent: "#ff6a1a", colors: {}, chartTypes: { ...DEFAULT_CHART_TYPES } }); }

  if (analytics.isPending || restaurant.isPending) return <Skeleton className="h-[760px] rounded-2xl" />;
  if (analytics.isError) return <div className="qs-card p-6 text-sm text-destructive">{humanError(analytics.error, lang)}</div>;
  const data = analytics.data!;
  const kpis = [
    { label: ar ? "إجمالي الإيرادات" : "Total Revenue", value: formatMoney(data.revenue, currency, lang), tone: "orange" },
    { label: ar ? "إجمالي الطلبات" : "Total Orders", value: formatNumber(data.orders.length, lang), tone: "green" },
    { label: ar ? "متوسط قيمة الطلب" : "Average Order Value", value: formatMoney(data.aov, currency, lang), tone: "purple" },
    { label: ar ? "نسبة المدفوع" : "Paid Orders", value: `${Math.round(data.paidRate)}%`, tone: "blue" },
  ];

  return <div className="space-y-5">
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div><h1 className="qs-page-title">{ar ? "التحليلات" : "Analytics"}</h1><p className="qs-page-subtitle">{ar ? "حوّل بيانات المطعم إلى قرارات واضحة، ورتب لوحة التحليلات حسب احتياجك." : "Turn real restaurant data into clear decisions and shape the dashboard around your workflow."}</p></div>
      <div className="flex flex-wrap gap-2"><button type="button" className="qs-button-secondary"><CalendarDays className="size-4" />{ar ? "آخر 30 يوماً" : "Last 30 days"}</button><button type="button" className={customize ? "qs-button-primary" : "qs-button-secondary"} onClick={() => setCustomize((value) => !value)}><Settings2 className="size-4" />{ar ? "تخصيص اللوحة" : "Customize Dashboard"}</button>{customize ? <button type="button" className="qs-button-primary" disabled={saving} onClick={() => void saveConfig()}>{saving ? (ar ? "حفظ…" : "Saving…") : (ar ? "حفظ التخطيط" : "Save Layout")}</button> : null}</div>
    </header>

    {customize ? <section className="qs-card flex flex-col gap-4 p-4 lg:flex-row lg:items-center">
      <div className="min-w-0 flex-1"><h2 className="text-sm font-bold">{ar ? "وضع التخصيص" : "Customization mode"}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{ar ? "غيّر نوع كل رسم ولونه، رتب الأدوات، وأضف تقارير وجداول بيانات. كل شيء يعتمد على بيانات المطعم الفعلية." : "Change each chart type and color, reorder widgets, and add reports or data tables. Everything stays tied to real restaurant data."}</p></div>
      <label className="flex items-center gap-2 text-xs font-bold"><span>{ar ? "اللون الافتراضي" : "Default chart color"}</span><Input type="color" value={config.accent} onChange={(event) => setConfig({ ...config, accent: event.target.value })} className="h-11 w-16 p-1" /></label>
      <div className="flex flex-wrap gap-2"><button type="button" className="qs-button-secondary" onClick={resetDashboard}><RotateCcw className="size-4" />{ar ? "إعادة الافتراضي" : "Reset Dashboard"}</button><button type="button" className="qs-button-secondary" onClick={() => setAddOpen(true)}><ListPlus className="size-4" />{ar ? "إضافة أداة" : "Add Widget"}</button></div>
    </section> : null}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{kpis.map((card, index) => <article key={card.label} className="qs-stat relative overflow-hidden"><div className="flex items-center justify-between"><span className="text-[11px] font-semibold text-muted-foreground">{card.label}</span><span className={cn("size-2 rounded-full", index === 0 ? "bg-orange-500" : index === 1 ? "bg-emerald-500" : index === 2 ? "bg-violet-500" : "bg-blue-500")} /></div><p className="mt-2 truncate font-display text-[24px] font-bold tracking-[-.04em]">{card.value}</p></article>)}</section>

    <div className="grid gap-4 xl:grid-cols-12">{config.widgets.map((id, index) => <Widget key={id} id={id} index={index} count={config.widgets.length} customize={customize} color={config.colors[id] ?? config.accent} chartType={config.chartTypes[id] ?? DEFAULT_CHART_TYPES[id]} data={data} currency={currency} lang={lang} ar={ar} onMove={move} onRemove={remove} onColor={setWidgetColor} onChartType={setChartType} />)}</div>

    <button type="button" onClick={() => setAddOpen(true)} className="flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card/60 px-4 text-center text-sm font-bold text-muted-foreground transition hover:border-[#ff5a0a]/50 hover:text-foreground"><Plus className="size-5" />{ar ? "إضافة رسم أو تقرير أو جدول بيانات أو مؤشر" : "Add chart, report, data table or KPI"}</button>

    <Dialog open={addOpen} onOpenChange={setAddOpen}><DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{ar ? "إضافة أداة تحليل" : "Add Analytics Widget"}</DialogTitle><DialogDescription>{ar ? "اختر رسماً، جدولاً أو تقريراً. جميع الأدوات تستخدم بيانات المطعم الفعلية فقط." : "Choose a chart, data table or report. Every widget uses real restaurant data only."}</DialogDescription></DialogHeader><div className="grid gap-3 sm:grid-cols-2">{WIDGET_CATALOG.map((item) => <button key={item.id} type="button" disabled={config.widgets.includes(item.id)} onClick={() => add(item.id)} className="min-h-[116px] rounded-xl border border-border p-4 text-start transition hover:border-orange-300 hover:bg-orange-50/40 disabled:opacity-40"><item.icon className="size-5 text-[#ff5a0a]" /><strong className="mt-3 block text-sm">{ar ? item.ar : item.en}</strong><span className="mt-1 block text-xs leading-5 text-muted-foreground">{ar ? item.descAr : item.desc}</span></button>)}</div><DialogFooter><Button variant="ghost" onClick={() => setAddOpen(false)}>{ar ? "إغلاق" : "Close"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

const WIDGET_CATALOG: Array<{ id: WidgetId; en: string; ar: string; desc: string; descAr: string; icon: any }> = [
  { id: "revenue", en: "Revenue chart", ar: "رسم الإيرادات", desc: "Revenue over time with Area, Line or Bar visualization", descAr: "الإيرادات عبر الزمن مع رسم مساحي أو خطي أو أعمدة", icon: TrendingUp },
  { id: "orders", en: "Orders chart", ar: "رسم الطلبات", desc: "Orders by day with selectable chart style", descAr: "الطلبات حسب اليوم مع اختيار نوع الرسم", icon: BarChart3 },
  { id: "channels", en: "Order channels", ar: "قنوات الطلب", desc: "Dine-in vs takeaway as Donut or Bar", descAr: "داخل المطعم مقابل الخارجي كدائرة أو أعمدة", icon: CircleGauge },
  { id: "topProducts", en: "Top products table", ar: "جدول أفضل المنتجات", desc: "Sortable-style product data table", descAr: "جدول بيانات المنتجات الأعلى", icon: Table2 },
  { id: "peakHours", en: "Peak hours chart", ar: "رسم ساعات الذروة", desc: "Hourly order volume", descAr: "حجم الطلبات حسب الساعة", icon: BarChart3 },
  { id: "weekly", en: "Weekly performance", ar: "الأداء الأسبوعي", desc: "Orders by weekday with selectable chart style", descAr: "الطلبات حسب يوم الأسبوع مع نوع رسم قابل للتغيير", icon: LineIcon },
  { id: "paidProgress", en: "Paid orders progress", ar: "تقدم المدفوعات", desc: "Payment completion progress", descAr: "نسبة اكتمال الدفع", icon: CircleGauge },
  { id: "orderTable", en: "Recent orders table", ar: "جدول الطلبات", desc: "Recent real orders in a data table", descAr: "أحدث الطلبات الفعلية في جدول بيانات", icon: Table2 },
  { id: "summary", en: "Summary report", ar: "تقرير ملخص", desc: "Text report calculated from live metrics", descAr: "تقرير نصي محسوب من المقاييس الفعلية", icon: FileText },
];

function Widget({ id, index, count, customize, color, chartType, data, currency, lang, ar, onMove, onRemove, onColor, onChartType }: { id: WidgetId; index: number; count: number; customize: boolean; color: string; chartType?: ChartType | undefined; data: any; currency: string; lang: Language; ar: boolean; onMove: (id: WidgetId, delta: number) => void; onRemove: (id: WidgetId) => void; onColor: (id: WidgetId, color: string) => void; onChartType: (id: WidgetId, chartType: ChartType) => void }) {
  const options = CHART_OPTIONS[id];
  const wrap = (title: string, children: React.ReactNode, wide = false) => <section className={cn("qs-card min-w-0 overflow-hidden", wide ? "xl:col-span-8" : "xl:col-span-4", id === "orderTable" && "xl:col-span-8", id === "summary" && "xl:col-span-4")}><div className="flex min-h-14 flex-wrap items-center gap-2 border-b border-border px-4 py-2.5"><GripVertical className="size-4 text-muted-foreground" /><h2 className="min-w-[120px] flex-1 truncate text-sm font-bold">{title}</h2>{customize ? <div className="flex flex-wrap items-center gap-1.5">{options?.length ? <select value={chartType ?? options[0]} onChange={(event) => onChartType(id, event.target.value as ChartType)} className="h-9 rounded-lg border border-border bg-background px-2 text-[11px] font-semibold outline-none focus:border-[#ff5a0a]">{options.map((option) => <option key={option} value={option}>{option === "donut" ? (ar ? "دائري" : "Donut") : option === "area" ? (ar ? "مساحي" : "Area") : option === "line" ? (ar ? "خطي" : "Line") : (ar ? "أعمدة" : "Bar")}</option>)}</select> : null}{options?.length ? <Input type="color" aria-label={ar ? "لون الرسم" : "Chart color"} value={color} onChange={(event) => onColor(id, event.target.value)} className="h-9 w-11 p-1" /> : null}<button type="button" disabled={index === 0} onClick={() => onMove(id, -1)} className="grid size-9 place-items-center rounded-lg hover:bg-muted disabled:opacity-25"><ChevronUp className="size-4" /></button><button type="button" disabled={index === count - 1} onClick={() => onMove(id, 1)} className="grid size-9 place-items-center rounded-lg hover:bg-muted disabled:opacity-25"><ChevronDown className="size-4" /></button><button type="button" onClick={() => onRemove(id)} className="grid size-9 place-items-center rounded-lg text-red-600 hover:bg-red-50"><Trash2 className="size-4" /></button></div> : null}</div>{children}</section>;

  if (id === "revenue") return wrap(ar ? "الإيرادات عبر الزمن" : "Revenue Over Time", <SeriesChart rows={data.series} xKey="label" yKey="sales" type={chartType ?? "area"} color={color} currency={currency} lang={lang} />, true);
  if (id === "orders") return wrap(ar ? "الطلبات حسب اليوم" : "Orders by Day", <SeriesChart rows={data.series} xKey="label" yKey="orders" type={chartType ?? "bar"} color={color} />, true);
  if (id === "channels") return wrap(ar ? "الطلبات حسب القناة" : "Orders by Channel", data.channels.length ? (chartType === "bar" ? <div className="h-[260px] p-4"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.channels}><CartesianGrid stroke="currentColor" strokeOpacity={.07} vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} /><Tooltip /><Bar dataKey="value" fill={color} radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div> : <div className="grid min-h-[260px] grid-cols-[minmax(0,1fr)_140px] items-center gap-2 p-4"><ResponsiveContainer width="100%" height={220}><PieChart><Pie data={data.channels} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85}>{data.channels.map((_: any, itemIndex: number) => <Cell key={itemIndex} fill={itemIndex === 0 ? color : COLORS[(itemIndex + 1) % COLORS.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer><div className="space-y-3">{data.channels.map((channel: any, itemIndex: number) => <div key={channel.name} className="flex items-center justify-between gap-2 text-xs"><span className="flex items-center gap-2"><i className="size-2 rounded-full" style={{ background: itemIndex === 0 ? color : COLORS[(itemIndex + 1) % COLORS.length] }} />{channel.name}</span><strong>{channel.value}</strong></div>)}</div></div>) : <Empty ar={ar} />);
  if (id === "topProducts") return wrap(ar ? "أفضل المنتجات" : "Top Products", data.topProducts.length ? <div className="overflow-x-auto"><table className="qs-table min-w-[520px]"><thead><tr><th>#</th><th>{ar ? "المنتج" : "Item"}</th><th>{ar ? "الكمية" : "Orders"}</th><th>{ar ? "الإيراد" : "Revenue"}</th></tr></thead><tbody>{data.topProducts.map((product: any, itemIndex: number) => <tr key={product.name}><td>{itemIndex + 1}</td><td>{ar ? product.nameAr : product.name}</td><td>{product.qty}</td><td>{formatMoney(product.revenue, currency, lang)}</td></tr>)}</tbody></table></div> : <Empty ar={ar} />);
  if (id === "peakHours") return wrap(ar ? "ساعات الذروة" : "Peak Hours", data.peak.length ? <SeriesChart rows={data.peak.map((value: any) => ({ ...value, label: `${value.hour}:00` }))} xKey="label" yKey="orders" type={chartType ?? "bar"} color={color} /> : <Empty ar={ar} />, true);
  if (id === "weekly") return wrap(ar ? "الأداء الأسبوعي" : "Weekly Performance", <SeriesChart rows={data.weekly} xKey="label" yKey="orders" type={chartType ?? "bar"} color={color} />);
  if (id === "paidProgress") return wrap(ar ? "تقدم المدفوعات" : "Payment Completion", <div className="p-5"><div className="flex items-end justify-between"><strong className="text-3xl">{Math.round(data.paidRate)}%</strong><span className="text-xs text-muted-foreground">{ar ? "طلبات مدفوعة" : "orders paid"}</span></div><div className="mt-4 h-3 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${data.paidRate}%`, background: color }} /></div></div>);
  if (id === "orderTable") return wrap(ar ? "أحدث الطلبات" : "Recent Orders", data.recent.length ? <div className="overflow-x-auto"><table className="qs-table min-w-[620px]"><thead><tr><th>#</th><th>{ar ? "الحالة" : "Status"}</th><th>{ar ? "الدفع" : "Payment"}</th><th>{ar ? "الإجمالي" : "Total"}</th><th>{ar ? "الوقت" : "Time"}</th></tr></thead><tbody>{data.recent.map((order: any) => <tr key={order.id}><td>{order.order_number}</td><td>{order.status}</td><td>{order.payment_status}</td><td>{formatMoney(Number(order.total ?? 0), currency, lang)}</td><td>{new Date(order.created_at).toLocaleString(ar ? "ar-JO" : "en-US")}</td></tr>)}</tbody></table></div> : <Empty ar={ar} />, true);
  return wrap(ar ? "تقرير ملخص" : "Summary Report", <div className="space-y-3 p-5 text-sm"><p>{ar ? `خلال آخر 30 يوماً سجل المطعم ${data.orders.length} طلباً بإيراد ${formatMoney(data.revenue, currency, lang)}.` : `In the last 30 days this restaurant recorded ${data.orders.length} orders and ${formatMoney(data.revenue, currency, lang)} in revenue.`}</p><p className="text-muted-foreground">{ar ? `متوسط قيمة الطلب ${formatMoney(data.aov, currency, lang)} ونسبة الطلبات المدفوعة ${Math.round(data.paidRate)}%.` : `Average order value is ${formatMoney(data.aov, currency, lang)} and ${Math.round(data.paidRate)}% of orders are paid.`}</p></div>);
}

function SeriesChart({ rows, xKey, yKey, type, color, currency, lang }: { rows: any[]; xKey: string; yKey: string; type: ChartType; color: string; currency?: string; lang?: Language | undefined }) {
  const tooltipFormatter = currency && lang ? (value: unknown) => formatMoney(Number(value ?? 0), currency, lang) : undefined;
  if (type === "line") return <div className="h-[260px] p-4"><ResponsiveContainer width="100%" height="100%"><LineChart data={rows}><CartesianGrid stroke="currentColor" strokeOpacity={.07} vertical={false} /><XAxis dataKey={xKey} tick={{ fontSize: 9 }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} /><Tooltip formatter={tooltipFormatter as any} /><Line type="monotone" dataKey={yKey} stroke={color} strokeWidth={2.5} dot={{ r: 3, fill: "var(--card)", stroke: color, strokeWidth: 2 }} activeDot={{ r: 5 }} /></LineChart></ResponsiveContainer></div>;
  if (type === "bar") return <div className="h-[260px] p-4"><ResponsiveContainer width="100%" height="100%"><BarChart data={rows}><CartesianGrid stroke="currentColor" strokeOpacity={.07} vertical={false} /><XAxis dataKey={xKey} tick={{ fontSize: 9 }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} /><Tooltip formatter={tooltipFormatter as any} /><Bar dataKey={yKey} fill={color} radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div>;
  return <div className="h-[260px] p-4"><ResponsiveContainer width="100%" height="100%"><AreaChart data={rows}><defs><linearGradient id={`gradient-${yKey}-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity={.24} /><stop offset="1" stopColor={color} stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="currentColor" strokeOpacity={.07} vertical={false} /><XAxis dataKey={xKey} tick={{ fontSize: 9 }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} /><Tooltip formatter={tooltipFormatter as any} /><Area type="monotone" dataKey={yKey} stroke={color} strokeWidth={2.5} fill={`url(#gradient-${yKey}-${color.replace("#", "")})`} /></AreaChart></ResponsiveContainer></div>;
}

function Empty({ ar }: { ar: boolean }) { return <div className="grid min-h-[220px] place-items-center p-6 text-center text-sm text-muted-foreground">{ar ? "لا توجد بيانات كافية لهذه الأداة بعد." : "Not enough real data for this widget yet."}</div>; }
