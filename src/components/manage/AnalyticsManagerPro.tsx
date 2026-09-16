import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, CalendarDays, FileText, ListPlus, Palette, RotateCcw, Save, Settings2, SlidersHorizontal, Table2, Trash2, X } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

import { ConditionalFormattingDialog, conditionalCellStyle, conditionalRowStyle, normalizeConditionalRules, type ConditionalColumn, type ConditionalRule } from "@/components/customization/ConditionalFormatting";
import { DashboardGrid, normalizeDashboardSize, reorderDashboardItems, type DashboardItemSize } from "@/components/customization/DashboardGrid";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { humanError } from "@/lib/errors";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

type WidgetId = "revenue" | "orders" | "channels" | "topProducts" | "peakHours" | "weekly" | "orderTable" | "paidProgress" | "summary";
type ChartType = "area" | "line" | "bar" | "donut";
type DashboardConfig = {
  widgets: WidgetId[];
  accent: string;
  colors: Partial<Record<WidgetId, string>>;
  chartTypes: Partial<Record<WidgetId, ChartType>>;
  sizes: Partial<Record<WidgetId, DashboardItemSize>>;
  conditional: Partial<Record<WidgetId, ConditionalRule[]>>;
};
type OrderRow = { id: string; order_number: string; status: string; payment_status: string; total: number | string; table_id: string | null; created_at: string };
type OrderItemRow = { product_name_snapshot_en: string; product_name_snapshot_ar: string; quantity: number; total_price: number | string; created_at: string };

const ALL_WIDGETS: WidgetId[] = ["revenue", "orders", "channels", "topProducts", "peakHours", "weekly", "orderTable", "paidProgress", "summary"];
const DEFAULT_WIDGETS: WidgetId[] = ["revenue", "orders", "channels", "topProducts", "peakHours", "weekly", "paidProgress", "orderTable"];
const DEFAULT_CHART_TYPES: Partial<Record<WidgetId, ChartType>> = { revenue: "area", orders: "bar", channels: "donut", peakHours: "bar", weekly: "bar" };
const DEFAULT_SIZES: Record<WidgetId, DashboardItemSize> = {
  revenue: { columns: 8, minHeight: 340 }, orders: { columns: 4, minHeight: 340 }, channels: { columns: 4, minHeight: 320 },
  topProducts: { columns: 8, minHeight: 320 }, peakHours: { columns: 6, minHeight: 320 }, weekly: { columns: 6, minHeight: 320 },
  orderTable: { columns: 12, minHeight: 380 }, paidProgress: { columns: 4, minHeight: 240 }, summary: { columns: 8, minHeight: 240 },
};
const CHART_OPTIONS: Partial<Record<WidgetId, ChartType[]>> = {
  revenue: ["area", "line", "bar"], orders: ["bar", "line", "area"], channels: ["donut", "bar"], peakHours: ["bar", "line", "area"], weekly: ["bar", "line", "area"],
};
const CHANNEL_COLORS = ["#ff6a1a", "#3b82f6", "#10b981", "#8b5cf6"];
const ORDER_COLUMNS: ConditionalColumn[] = [
  { id: "order", en: "Order #", ar: "رقم الطلب" }, { id: "status", en: "Status", ar: "الحالة" }, { id: "payment", en: "Payment", ar: "الدفع" }, { id: "total", en: "Total", ar: "الإجمالي", numeric: true }, { id: "date", en: "Date", ar: "التاريخ" },
];
const PRODUCT_COLUMNS: ConditionalColumn[] = [
  { id: "name", en: "Product", ar: "المنتج" }, { id: "qty", en: "Quantity", ar: "الكمية", numeric: true }, { id: "revenue", en: "Revenue", ar: "الإيراد", numeric: true },
];

function objectValue(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function validColor(value: unknown, fallback: string) { return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback; }
function readConfig(theme: unknown): DashboardConfig {
  const workspace = objectValue(objectValue(theme).workspace);
  const raw = objectValue(workspace.analyticsDashboard);
  const saved = Array.isArray(raw.widgets) ? raw.widgets.filter((value): value is WidgetId => ALL_WIDGETS.includes(value as WidgetId)) : DEFAULT_WIDGETS;
  const widgets = saved.length ? saved : DEFAULT_WIDGETS;
  const accent = validColor(raw.accent, "#ff6a1a");
  const rawColors = objectValue(raw.colors);
  const colors: Partial<Record<WidgetId, string>> = {};
  const rawTypes = objectValue(raw.chartTypes);
  const chartTypes: Partial<Record<WidgetId, ChartType>> = {};
  const rawSizes = objectValue(raw.sizes);
  const sizes: Partial<Record<WidgetId, DashboardItemSize>> = {};
  for (const id of ALL_WIDGETS) {
    if (rawColors[id] !== undefined) colors[id] = validColor(rawColors[id], accent);
    const allowed = CHART_OPTIONS[id];
    if (allowed?.includes(rawTypes[id] as ChartType)) chartTypes[id] = rawTypes[id] as ChartType;
    sizes[id] = normalizeDashboardSize(rawSizes[id], DEFAULT_SIZES[id]);
  }
  const rawConditional = objectValue(raw.conditional);
  const conditional: Partial<Record<WidgetId, ConditionalRule[]>> = {
    orderTable: normalizeConditionalRules(rawConditional.orderTable, ORDER_COLUMNS.map((item) => item.id)),
    topProducts: normalizeConditionalRules(rawConditional.topProducts, PRODUCT_COLUMNS.map((item) => item.id)),
  };
  return { widgets, accent, colors, chartTypes: { ...DEFAULT_CHART_TYPES, ...chartTypes }, sizes, conditional };
}

export function AnalyticsManagerPro({ restaurantId }: { restaurantId: string }) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const restaurant = useRestaurant(restaurantId);
  const currency = restaurant.data?.currency ?? "JOD";
  const qc = useQueryClient();
  const savedConfig = useMemo(() => readConfig(restaurant.data?.menu_theme), [restaurant.data?.menu_theme]);
  const [config, setConfig] = useState<DashboardConfig>(savedConfig);
  const [customize, setCustomize] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [conditionalWidget, setConditionalWidget] = useState<"orderTable" | "topProducts" | null>(null);
  const [saving, setSaving] = useState(false);
  const [detailWidget, setDetailWidget] = useState<WidgetId | null>(null);
  const [detailSearch, setDetailSearch] = useState("");
  const [widgetSearch, setWidgetSearch] = useState("");
  useEffect(() => { if (!customize) setConfig(savedConfig); }, [savedConfig, customize]);

  const analytics = useQuery({
    queryKey: ["platform", "analytics-pro", restaurantId],
    queryFn: async () => {
      const since = new Date(); since.setDate(since.getDate() - 30); const iso = since.toISOString();
      const [{ data: orders, error: ordersError }, { data: items, error: itemsError }] = await Promise.all([
        supabase.from("orders").select("id,order_number,status,payment_status,total,table_id,created_at").eq("restaurant_id", restaurantId).gte("created_at", iso).order("created_at", { ascending: true }),
        supabase.from("order_items").select("product_name_snapshot_en,product_name_snapshot_ar,quantity,total_price,created_at").eq("restaurant_id", restaurantId).gte("created_at", iso),
      ]);
      if (ordersError) throw ordersError; if (itemsError) throw itemsError;
      const rows = (orders ?? []) as unknown as OrderRow[];
      const live = rows.filter((order) => order.status !== "cancelled");
      const revenue = live.reduce((sum, order) => sum + Number(order.total ?? 0), 0);
      const paid = live.filter((order) => order.payment_status === "paid").length;
      const byDay = new Map<string, { sales: number; orders: number }>();
      const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0 }));
      const byWeekday = Array.from({ length: 7 }, (_, day) => ({ day, orders: 0, sales: 0 }));
      let dineIn = 0; let takeaway = 0;
      for (const order of live) {
        const date = new Date(order.created_at); const key = date.toISOString().slice(0, 10); const current = byDay.get(key) ?? { sales: 0, orders: 0 };
        current.sales += Number(order.total ?? 0); current.orders += 1; byDay.set(key, current); byHour[date.getHours()]!.orders += 1;
        const weekday = date.getDay(); byWeekday[weekday]!.orders += 1; byWeekday[weekday]!.sales += Number(order.total ?? 0); if (order.table_id) dineIn += 1; else takeaway += 1;
      }
      const series = Array.from({ length: 14 }, (_, index) => { const date = new Date(); date.setDate(date.getDate() - (13 - index)); const key = date.toISOString().slice(0, 10); return { key, label: date.toLocaleDateString(ar ? "ar-JO" : "en-US", { month: "short", day: "numeric" }), ...(byDay.get(key) ?? { sales: 0, orders: 0 }) }; });
      const itemMap = new Map<string, { nameAr: string; qty: number; revenue: number }>();
      for (const item of (items ?? []) as unknown as OrderItemRow[]) { const name = item.product_name_snapshot_en || item.product_name_snapshot_ar || "Item"; const current = itemMap.get(name) ?? { nameAr: item.product_name_snapshot_ar || name, qty: 0, revenue: 0 }; current.qty += Number(item.quantity ?? 0); current.revenue += Number(item.total_price ?? 0); itemMap.set(name, current); }
      const topProducts = Array.from(itemMap.entries()).map(([name, value]) => ({ name, ...value })).sort((a, b) => b.qty - a.qty).slice(0, 10);
      const weekly = byWeekday.map((value, index) => ({ label: new Intl.DateTimeFormat(ar ? "ar-JO" : "en-US", { weekday: "short" }).format(new Date(2026, 0, 4 + index)), ...value }));
      return { orders: live, revenue, aov: live.length ? revenue / live.length : 0, paidRate: live.length ? paid / live.length * 100 : 0, series, channels: [{ name: ar ? "داخل المطعم" : "Dine-in", value: dineIn }, { name: ar ? "خارجي" : "Takeaway", value: takeaway }].filter((value) => value.value > 0), topProducts, peak: byHour.filter((value) => value.orders > 0), weekly, recent: [...live].reverse().slice(0, 20) };
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  async function saveConfig() {
    setSaving(true);
    try {
      const current = await supabase.from("restaurants").select("menu_theme").eq("id", restaurantId).single(); if (current.error) throw current.error;
      const theme = objectValue(current.data.menu_theme); const workspace = objectValue(theme.workspace);
      const { error } = await supabase.from("restaurants").update({ menu_theme: { ...theme, workspace: { ...workspace, analyticsDashboard: config } } }).eq("id", restaurantId); if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["platform"] }); setCustomize(false); toast.success(ar ? "تم حفظ لوحة التحليلات" : "Analytics dashboard saved");
    } catch (error) { toast.error(humanError(error, lang)); } finally { setSaving(false); }
  }

  if (analytics.isPending || restaurant.isPending) return <Skeleton className="h-[760px] rounded-2xl" />;
  if (analytics.isError) return <div className="qs-card p-6 text-sm text-destructive">{humanError(analytics.error, lang)}</div>;
  const data = analytics.data!;
  const labels: Record<WidgetId, string> = {
    revenue: ar ? "الإيراد عبر الزمن" : "Revenue Over Time", orders: ar ? "الطلبات" : "Orders", channels: ar ? "قنوات الطلب" : "Order Channels", topProducts: ar ? "أفضل المنتجات" : "Top Products", peakHours: ar ? "ساعات الذروة" : "Peak Hours", weekly: ar ? "الأداء الأسبوعي" : "Weekly Performance", orderTable: ar ? "جدول الطلبات" : "Orders Data Table", paidProgress: ar ? "تقدم المدفوعات" : "Payment Progress", summary: ar ? "تقرير ملخص" : "Executive Report",
  };

  function colorFor(id: WidgetId) { return config.colors[id] ?? config.accent; }
  function chart(id: WidgetId, rows: Array<Record<string, string | number>>, x: string, y: string) {
    const type = config.chartTypes[id] ?? DEFAULT_CHART_TYPES[id] ?? "bar"; const color = colorFor(id);
    if (type === "line") return <ResponsiveContainer width="100%" height="100%"><LineChart data={rows}><CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} /><XAxis dataKey={x} fontSize={10} tickLine={false} axisLine={false} /><YAxis fontSize={10} tickLine={false} axisLine={false} /><Tooltip /><Line type="monotone" dataKey={y} stroke={color} strokeWidth={3} dot={false} /></LineChart></ResponsiveContainer>;
    if (type === "area") return <ResponsiveContainer width="100%" height="100%"><AreaChart data={rows}><CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} /><XAxis dataKey={x} fontSize={10} tickLine={false} axisLine={false} /><YAxis fontSize={10} tickLine={false} axisLine={false} /><Tooltip /><Area type="monotone" dataKey={y} stroke={color} fill={color} fillOpacity={0.14} strokeWidth={3} /></AreaChart></ResponsiveContainer>;
    return <ResponsiveContainer width="100%" height="100%"><BarChart data={rows}><CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} /><XAxis dataKey={x} fontSize={10} tickLine={false} axisLine={false} /><YAxis fontSize={10} tickLine={false} axisLine={false} /><Tooltip /><Bar dataKey={y} fill={color} radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer>;
  }

  function toolbar(id: WidgetId) {
    if (!customize) return null;
    const options = CHART_OPTIONS[id];
    return <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-muted/35 p-2">
      <label className="flex items-center gap-1.5 text-[10px] font-bold"><Palette className="size-3.5" /><Input type="color" value={colorFor(id)} onChange={(e) => setConfig((current) => ({ ...current, colors: { ...current.colors, [id]: e.target.value } }))} className="h-8 w-11 p-1" /></label>
      {options ? <Select value={config.chartTypes[id] ?? DEFAULT_CHART_TYPES[id] ?? "bar"} onValueChange={(value) => setConfig((current) => ({ ...current, chartTypes: { ...current.chartTypes, [id]: value as ChartType } }))}><SelectTrigger className="h-8 w-[120px] text-[10px]"><SelectValue /></SelectTrigger><SelectContent>{options.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select> : null}
      {(id === "orderTable" || id === "topProducts") ? <Button type="button" variant="outline" size="sm" className="h-8 text-[10px]" onClick={() => setConditionalWidget(id)}><SlidersHorizontal className="size-3.5" />{ar ? "تنسيق شرطي" : "Conditional"}</Button> : null}
      <button type="button" className="ms-auto grid size-8 place-items-center rounded-lg text-red-600 hover:bg-red-50" onClick={() => setConfig((current) => ({ ...current, widgets: current.widgets.filter((widget) => widget !== id) }))} aria-label={ar ? "حذف" : "Remove"}><Trash2 className="size-4" /></button>
    </div>;
  }

  function renderWidget(id: WidgetId) {
    const color = colorFor(id);
    const rules = config.conditional[id] ?? [];
    if (id === "revenue") return <Widget title={labels[id]} tools={toolbar(id)}><div className="h-[250px]">{chart(id, data.series, "label", "sales")}</div></Widget>;
    if (id === "orders") return <Widget title={labels[id]} tools={toolbar(id)}><div className="mb-4 grid grid-cols-2 gap-2"><Kpi label={ar ? "30 يوم" : "30 days"} value={formatNumber(data.orders.length, lang)} /><Kpi label={ar ? "متوسط الطلب" : "Avg. order"} value={formatMoney(data.aov, currency, lang)} /></div><div className="h-[190px]">{chart(id, data.series, "label", "orders")}</div></Widget>;
    if (id === "channels") return <Widget title={labels[id]} tools={toolbar(id)}>{data.channels.length ? config.chartTypes[id] === "bar" ? <div className="h-[230px]">{chart(id, data.channels, "name", "value")}</div> : <div className="h-[230px]"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data.channels} dataKey="value" nameKey="name" innerRadius={58} outerRadius={86} paddingAngle={4}>{data.channels.map((_, index) => <Cell key={index} fill={CHANNEL_COLORS[index % CHANNEL_COLORS.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div> : <Empty ar={ar} />}</Widget>;
    if (id === "topProducts") return <Widget title={labels[id]} tools={toolbar(id)}>{data.topProducts.length ? <div className="overflow-x-auto"><table className="qs-table min-w-[520px]"><thead><tr><th>{ar ? "المنتج" : "Product"}</th><th>{ar ? "الكمية" : "Qty"}</th><th>{ar ? "الإيراد" : "Revenue"}</th></tr></thead><tbody>{data.topProducts.map((item) => { const row = { name: ar ? item.nameAr : item.name, qty: item.qty, revenue: item.revenue }; return <tr key={item.name} style={conditionalRowStyle(rules, row)}><td style={conditionalCellStyle(rules, "name", row.name)}>{row.name}</td><td style={conditionalCellStyle(rules, "qty", row.qty)}>{row.qty}</td><td style={conditionalCellStyle(rules, "revenue", row.revenue)}>{formatMoney(row.revenue, currency, lang)}</td></tr>; })}</tbody></table></div> : <Empty ar={ar} />}</Widget>;
    if (id === "peakHours") return <Widget title={labels[id]} tools={toolbar(id)}>{data.peak.length ? <div className="h-[235px]">{chart(id, data.peak.map((row) => ({ ...row, label: `${row.hour}:00` })), "label", "orders")}</div> : <Empty ar={ar} />}</Widget>;
    if (id === "weekly") return <Widget title={labels[id]} tools={toolbar(id)}><div className="h-[235px]">{chart(id, data.weekly, "label", "sales")}</div></Widget>;
    if (id === "paidProgress") return <Widget title={labels[id]} tools={toolbar(id)}><div className="grid h-full place-items-center py-4"><div className="text-center"><div className="relative mx-auto grid size-32 place-items-center rounded-full" style={{ background: `conic-gradient(${color} ${data.paidRate}%, var(--muted) 0)` }}><div className="grid size-24 place-items-center rounded-full bg-card"><strong className="text-2xl">{Math.round(data.paidRate)}%</strong></div></div><p className="mt-4 text-xs text-muted-foreground">{ar ? "نسبة الطلبات المدفوعة" : "Paid order rate"}</p></div></div></Widget>;
    if (id === "summary") return <Widget title={labels[id]} tools={toolbar(id)}><div className="grid gap-3 sm:grid-cols-2"><Kpi label={ar ? "الإيراد" : "Revenue"} value={formatMoney(data.revenue, currency, lang)} /><Kpi label={ar ? "الطلبات" : "Orders"} value={formatNumber(data.orders.length, lang)} /><Kpi label={ar ? "متوسط الطلب" : "Average order"} value={formatMoney(data.aov, currency, lang)} /><Kpi label={ar ? "مدفوع" : "Paid"} value={`${Math.round(data.paidRate)}%`} /></div><p className="mt-4 text-xs leading-5 text-muted-foreground">{ar ? "هذا التقرير يعتمد فقط على بيانات المطعم الفعلية لآخر 30 يوماً." : "This report is generated only from this restaurant's real data for the last 30 days."}</p></Widget>;
    return <Widget title={labels[id]} tools={toolbar(id)}>{data.recent.length ? <div className="overflow-x-auto"><table className="qs-table min-w-[720px]"><thead><tr><th>{ar ? "الطلب" : "Order"}</th><th>{ar ? "الحالة" : "Status"}</th><th>{ar ? "الدفع" : "Payment"}</th><th>{ar ? "الإجمالي" : "Total"}</th><th>{ar ? "التاريخ" : "Date"}</th></tr></thead><tbody>{data.recent.map((order) => { const row = { order: order.order_number, status: order.status, payment: order.payment_status, total: Number(order.total ?? 0), date: formatDateTime(order.created_at, lang) }; return <tr key={order.id} style={conditionalRowStyle(rules, row)}><td style={conditionalCellStyle(rules, "order", row.order)}>{row.order}</td><td style={conditionalCellStyle(rules, "status", row.status)}>{row.status}</td><td style={conditionalCellStyle(rules, "payment", row.payment)}>{row.payment}</td><td style={conditionalCellStyle(rules, "total", row.total)}>{formatMoney(row.total, currency, lang)}</td><td style={conditionalCellStyle(rules, "date", row.date)}>{row.date}</td></tr>; })}</tbody></table></div> : <Empty ar={ar} />}</Widget>;
  }

  return <div className="space-y-5">
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><h1 className="qs-page-title">{ar ? "التحليلات" : "Analytics"}</h1><p className="qs-page-subtitle">{ar ? "لوحة تفاعلية قابلة للتخصيص تعتمد على بيانات المطعم الفعلية." : "An interactive, customizable dashboard powered by real restaurant data."}</p></div><div className="flex flex-wrap gap-2"><span className="qs-button-secondary pointer-events-none"><CalendarDays className="size-4" />{ar ? "آخر 30 يوماً" : "Last 30 days"}</span>{customize ? <><Button variant="outline" onClick={() => { setConfig(savedConfig); setCustomize(false); }}><X className="size-4" />{ar ? "إلغاء" : "Cancel"}</Button><Button variant="outline" onClick={() => setConfig({ ...readConfig({ workspace: {} }), widgets: [...DEFAULT_WIDGETS] })}><RotateCcw className="size-4" />{ar ? "إعادة" : "Reset"}</Button><Button variant="outline" onClick={() => setAddOpen(true)}><ListPlus className="size-4" />{ar ? "إضافة أداة" : "Add Widget"}</Button><Button disabled={saving} onClick={() => void saveConfig()}><Save className="size-4" />{saving ? (ar ? "حفظ…" : "Saving…") : (ar ? "حفظ" : "Save Layout")}</Button></> : <button type="button" className="qs-button-secondary" onClick={() => setCustomize(true)}><Settings2 className="size-4" />{ar ? "تخصيص اللوحة" : "Customize Dashboard"}</button>}</div></header>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Kpi label={ar ? "إجمالي الإيرادات" : "Total Revenue"} value={formatMoney(data.revenue, currency, lang)} /><Kpi label={ar ? "إجمالي الطلبات" : "Total Orders"} value={formatNumber(data.orders.length, lang)} /><Kpi label={ar ? "متوسط قيمة الطلب" : "Average Order Value"} value={formatMoney(data.aov, currency, lang)} /><Kpi label={ar ? "الطلبات المدفوعة" : "Paid Orders"} value={`${Math.round(data.paidRate)}%`} /></section>

    {customize ? <section className="qs-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><strong className="text-sm">{ar ? "وضع التخصيص" : "Customization mode"}</strong><p className="mt-1 text-xs text-muted-foreground">{ar ? "اسحب من مقابض النقاط الست، غيّر الحجم من الزاوية، وعدّل اللون والنوع داخل كل أداة." : "Drag widgets from the six-dot handles, resize from the corner, and change type/color inside each widget."}</p></div><label className="flex items-center gap-2 text-xs font-bold"><span>{ar ? "اللون الافتراضي" : "Default color"}</span><Input type="color" value={config.accent} onChange={(event) => setConfig((current) => ({ ...current, accent: event.target.value }))} className="h-10 w-14 p-1" /></label></section> : null}

    <DashboardGrid ids={config.widgets} customize={customize} sizeFor={(id) => config.sizes[id] ?? DEFAULT_SIZES[id]} labelFor={(id) => labels[id]} minColumns={(id) => id === "orderTable" ? 8 : 4} minHeight={() => 220} onReorder={(source, target) => setConfig((current) => ({ ...current, widgets: reorderDashboardItems(current.widgets, source, target) }))} onResize={(id, size) => setConfig((current) => ({ ...current, sizes: { ...current.sizes, [id]: size } }))} renderItem={(id) => <div className="group relative h-full">{renderWidget(id)}{!customize ? <button type="button" onClick={() => { setDetailSearch(""); setDetailWidget(id); }} className="absolute end-4 top-4 rounded-lg border border-border bg-card/95 px-2.5 py-1.5 text-[10px] font-bold text-[#ff5a0a] opacity-0 shadow-sm transition group-hover:opacity-100 focus-visible:opacity-100">{ar ? "عرض التفاصيل" : "View details"}</button> : null}</div>} />

    <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) setWidgetSearch(""); }}><DialogContent className="max-h-[92vh] overflow-hidden p-0 sm:max-w-3xl"><DialogHeader className="border-b border-border p-5"><DialogTitle>{ar ? "مكتبة الأدوات" : "Widget Library"}</DialogTitle><DialogDescription>{ar ? "ابحث واختر أداة مبنية على بيانات المطعم الحالية." : "Search and add widgets powered by your current restaurant data."}</DialogDescription></DialogHeader><div className="p-5"><Input autoFocus value={widgetSearch} onChange={(event) => setWidgetSearch(event.target.value)} placeholder={ar ? "ابحث عن رسم أو تقرير أو جدول…" : "Search charts, reports or tables…"} className="mb-4"/><div className="max-h-[58vh] overflow-y-auto"><div className="grid gap-3 sm:grid-cols-2">{ALL_WIDGETS.filter((id) => labels[id].toLowerCase().includes(widgetSearch.toLowerCase())).map((id) => { const added=config.widgets.includes(id); const category=id === "orderTable" || id === "topProducts" ? (ar ? "جدول بيانات" : "Data table") : id === "summary" ? (ar ? "تقرير" : "Report") : id === "paidProgress" ? (ar ? "تقدم" : "Progress") : (ar ? "رسم بياني" : "Chart"); return <button key={id} type="button" disabled={added} className="group flex min-h-24 items-start gap-4 rounded-2xl border border-border p-4 text-start transition hover:border-orange-300 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-55" onClick={() => setConfig((current) => ({ ...current, widgets: [...current.widgets, id] }))}><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-orange-50 text-[#ff5a0a] dark:bg-orange-950/30">{id === "orderTable" || id === "topProducts" ? <Table2 className="size-5" /> : id === "summary" ? <FileText className="size-5" /> : <BarChart3 className="size-5" />}</span><span className="min-w-0 flex-1"><strong className="block text-sm">{labels[id]}</strong><span className="mt-1 block text-[11px] text-muted-foreground">{category} · {ar ? "بيانات حقيقية لآخر 30 يوماً" : "Real data from the last 30 days"}</span><span className="mt-2 block text-[10px] font-bold text-[#ff5a0a]">{added ? (ar ? "مضافة" : "Already added") : (ar ? "+ إضافة إلى اللوحة" : "+ Add to dashboard")}</span></span></button>; })}</div></div></div></DialogContent></Dialog>

    <Dialog open={detailWidget !== null} onOpenChange={(open) => !open && setDetailWidget(null)}><DialogContent className="max-h-[90vh] overflow-hidden p-0 sm:max-w-4xl"><DialogHeader className="border-b border-border p-5"><DialogTitle>{detailWidget ? labels[detailWidget] : ""}</DialogTitle><DialogDescription>{ar ? "تفاصيل حقيقية لآخر 30 يوماً لهذا المطعم." : "Real restaurant detail for the last 30 days."}</DialogDescription></DialogHeader><div className="p-5"><Input value={detailSearch} onChange={(event) => setDetailSearch(event.target.value)} placeholder={ar ? "ابحث في التفاصيل…" : "Search details…"} className="mb-4 max-w-sm" /><div className="max-h-[58vh] overflow-auto rounded-xl border border-border"><table className="qs-table min-w-[720px]"><thead><tr><th>{ar ? "الطلب" : "Order"}</th><th>{ar ? "الحالة" : "Status"}</th><th>{ar ? "الدفع" : "Payment"}</th><th>{ar ? "الإجمالي" : "Total"}</th><th>{ar ? "التاريخ" : "Date"}</th></tr></thead><tbody>{data.orders.filter((order) => !detailSearch || [order.order_number, order.status, order.payment_status].some((value) => String(value).toLowerCase().includes(detailSearch.toLowerCase()))).map((order) => <tr key={order.id}><td>{order.order_number}</td><td>{order.status}</td><td>{order.payment_status}</td><td>{formatMoney(Number(order.total ?? 0), currency, lang)}</td><td>{formatDateTime(order.created_at, lang)}</td></tr>)}</tbody></table>{data.orders.length === 0 ? <Empty ar={ar} /> : null}</div></div></DialogContent></Dialog>

    <ConditionalFormattingDialog open={conditionalWidget !== null} onOpenChange={(open) => !open && setConditionalWidget(null)} ar={ar} columns={conditionalWidget === "topProducts" ? PRODUCT_COLUMNS : ORDER_COLUMNS} rules={conditionalWidget ? config.conditional[conditionalWidget] ?? [] : []} onChange={(rules) => { if (!conditionalWidget) return; setConfig((current) => ({ ...current, conditional: { ...current.conditional, [conditionalWidget]: rules } })); }} />
  </div>;
}

function Widget({ title, tools, children }: { title: string; tools?: React.ReactNode; children: React.ReactNode }) { return <section className="qs-card flex h-full min-h-0 flex-col overflow-hidden p-4 sm:p-5"><div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-sm font-bold">{title}</h2></div>{tools}<div className="min-h-0 flex-1">{children}</div></section>; }
function Kpi({ label, value }: { label: string; value: string }) { return <article className="qs-stat p-4"><p className="text-[11px] font-semibold text-muted-foreground">{label}</p><p className="mt-2 truncate font-display text-2xl font-bold tracking-[-.035em]">{value}</p></article>; }
function Empty({ ar }: { ar: boolean }) { return <div className="grid min-h-[180px] place-items-center p-6 text-center text-sm text-muted-foreground">{ar ? "لا توجد بيانات كافية لهذه الأداة بعد." : "Not enough real data for this widget yet."}</div>; }
