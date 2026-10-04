import { Table2 } from "@/components/nav/QuickServeIcons";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  CalendarDays,
  Check,
  ChevronRight,
  CreditCard,
  Download,
  FileText,
  Filter,
  GripVertical,
  Palette,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  ShoppingBag,
  SlidersHorizontal,
  Tag,
  Trash2,
  TrendingUp,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import {
  ConditionalFormattingDialog,
  conditionalCellStyle,
  conditionalRowStyle,
  normalizeConditionalRules,
  type ConditionalColumn,
  type ConditionalRule,
} from "@/components/customization/ConditionalFormatting";
import {
  DashboardGrid,
  normalizeDashboardSize,
  reorderDashboardItems,
  type DashboardItemSize,
} from "@/components/customization/DashboardGrid";
import {
  AnalyticsDetailPage,
  isAnalyticsDetailWidget,
  type AnalyticsDetailWidgetId,
} from "@/components/manage/AnalyticsDetailPage";
import { DecisionIntelligencePanel } from "@/components/manage/DecisionIntelligencePanel";
import {
  analyticsCsv,
  buildAnalytics,
  orderChannel,
  type AnalyticsOrder,
  type AnalyticsItem,
  type AnalyticsProduct,
} from "@/components/analytics/analytics-data";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { humanError } from "@/lib/errors";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import "@/components/analytics/analytics-studio.css";

type WidgetId =
  | "revenue"
  | "orders"
  | "channels"
  | "topProducts"
  | "peakHours"
  | "weekly"
  | "orderTable"
  | "paidProgress"
  | "summary";
type ChartType = "area" | "line" | "bar" | "donut";
type DashboardConfig = {
  widgets: WidgetId[];
  accent: string;
  colors: Partial<Record<WidgetId, string>>;
  chartTypes: Partial<Record<WidgetId, ChartType>>;
  sizes: Partial<Record<WidgetId, DashboardItemSize>>;
  conditional: Partial<Record<WidgetId, ConditionalRule[]>>;
};

const ALL_WIDGETS: WidgetId[] = [
  "revenue",
  "orders",
  "channels",
  "topProducts",
  "peakHours",
  "weekly",
  "orderTable",
  "paidProgress",
  "summary",
];
const DEFAULT_WIDGETS: WidgetId[] = [
  "revenue",
  "orders",
  "channels",
  "topProducts",
  "peakHours",
  "weekly",
  "orderTable",
  "summary",
  "paidProgress",
];
const DEFAULT_CHART_TYPES: Partial<Record<WidgetId, ChartType>> = {
  revenue: "area",
  orders: "bar",
  channels: "donut",
  peakHours: "bar",
  weekly: "bar",
};
const DEFAULT_SIZES: Record<WidgetId, DashboardItemSize> = {
  revenue: { columns: 6, minHeight: 210 },
  orders: { columns: 3, minHeight: 210 },
  channels: { columns: 3, minHeight: 210 },
  topProducts: { columns: 4, minHeight: 208 },
  peakHours: { columns: 4, minHeight: 208 },
  weekly: { columns: 4, minHeight: 208 },
  orderTable: { columns: 8, minHeight: 238 },
  summary: { columns: 4, minHeight: 108 },
  paidProgress: { columns: 4, minHeight: 118 },
};
const CHART_OPTIONS: Partial<Record<WidgetId, ChartType[]>> = {
  revenue: ["area", "line", "bar"],
  orders: ["bar", "line", "area"],
  channels: ["donut", "bar"],
  peakHours: ["bar", "line", "area"],
  weekly: ["bar", "line", "area"],
};
const CHANNEL_COLORS = ["#ff5a0a", "#ff9a6b", "#ffd2bd"];
const ORDER_COLUMNS: ConditionalColumn[] = [
  { id: "order", en: "Order #", ar: "رقم الطلب" },
  { id: "status", en: "Status", ar: "الحالة" },
  { id: "payment", en: "Payment", ar: "الدفع" },
  { id: "total", en: "Total", ar: "الإجمالي", numeric: true },
  { id: "date", en: "Date", ar: "التاريخ" },
];
const PRODUCT_COLUMNS: ConditionalColumn[] = [
  { id: "name", en: "Product", ar: "المنتج" },
  { id: "qty", en: "Quantity", ar: "الكمية", numeric: true },
  { id: "revenue", en: "Revenue", ar: "الإيراد", numeric: true },
];

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function validColor(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}
function readConfig(theme: unknown): DashboardConfig {
  const workspace = objectValue(objectValue(theme).workspace);
  const raw = objectValue(workspace.analyticsDashboard);
  const saved = Array.isArray(raw.widgets)
    ? raw.widgets.filter((value): value is WidgetId => ALL_WIDGETS.includes(value as WidgetId))
    : DEFAULT_WIDGETS;
  const widgets = [...new Set(saved)];
  const accent = validColor(raw.accent, "#ff5a0a");
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
    orderTable: normalizeConditionalRules(
      rawConditional.orderTable,
      ORDER_COLUMNS.map((item) => item.id),
    ),
    topProducts: normalizeConditionalRules(
      rawConditional.topProducts,
      PRODUCT_COLUMNS.map((item) => item.id),
    ),
  };
  return {
    widgets,
    accent,
    colors,
    chartTypes: { ...DEFAULT_CHART_TYPES, ...chartTypes },
    sizes,
    conditional,
  };
}

const WIDGET_ICONS = {
  revenue: TrendingUp,
  orders: BarChart3,
  channels: CreditCard,
  topProducts: ShoppingBag,
  peakHours: BarChart3,
  weekly: CalendarDays,
  orderTable: Table2,
  paidProgress: CreditCard,
  summary: FileText,
};
type AnalyticsTab = "overview" | "orders" | "products" | "reports";

async function fetchPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const result = await page(from, from + 999);
    if (result.error) throw result.error;
    const batch = (result.data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < 1000) return rows;
  }
}

export function AnalyticsManagerPro({
  restaurantId,
  detailWidget: detailWidgetProp = null,
}: {
  restaurantId: string;
  detailWidget?: AnalyticsDetailWidgetId | null;
}) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const restaurant = useRestaurant(restaurantId);
  const currency = restaurant.data?.currency ?? "JOD";
  const timezone = restaurant.data?.timezone || "Asia/Amman";
  const qc = useQueryClient();
  const savedConfig = useMemo(
    () => readConfig(restaurant.data?.menu_theme),
    [restaurant.data?.menu_theme],
  );
  const [config, setConfig] = useState<DashboardConfig>(savedConfig);
  const [customize, setCustomize] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorTab, setEditorTab] = useState<"layout" | "add">("layout");
  const [activeTab, setActiveTab] = useState<AnalyticsTab>("overview");
  const [days, setDays] = useState(() => {
    const period =
      typeof window === "undefined"
        ? 7
        : Number(new URLSearchParams(window.location.search).get("period"));
    return [7, 14, 30].includes(period) ? period : 7;
  });
  const [conditionalWidget, setConditionalWidget] = useState<"orderTable" | "topProducts" | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [widgetSearch, setWidgetSearch] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [orderPage, setOrderPage] = useState(0);
  const draggingWidget = useRef<WidgetId | null>(null);
  useEffect(() => {
    if (!customize) setConfig(savedConfig);
  }, [savedConfig, customize]);
  useEffect(() => {
    setOrderPage(0);
  }, [days, orderSearch, paymentFilter]);

  const analytics = useQuery({
    queryKey: ["platform", "analytics-pro", restaurantId, days, timezone, lang],
    enabled: !!restaurant.data,
    queryFn: async () => {
      const now = new Date();
      const iso = new Date(now.getTime() - (days * 2 + 1) * 86400000).toISOString();
      const [orders, items, products] = await Promise.all([
        fetchPages<AnalyticsOrder>((from, to) =>
          supabase
            .from("orders")
            .select(
              "id,order_number,status,payment_status,total,table_id,fulfillment_type,created_at",
            )
            .eq("restaurant_id", restaurantId)
            .gte("created_at", iso)
            .lte("created_at", now.toISOString())
            .order("created_at")
            .order("id")
            .range(from, to),
        ),
        fetchPages<AnalyticsItem>((from, to) =>
          supabase
            .from("order_items")
            .select(
              "order_id,menu_item_id,product_name_snapshot_en,product_name_snapshot_ar,quantity,total_price",
            )
            .eq("restaurant_id", restaurantId)
            .gte("created_at", iso)
            .lte("created_at", now.toISOString())
            .order("id")
            .range(from, to),
        ),
        fetchPages<AnalyticsProduct>((from, to) =>
          supabase
            .from("menu_items")
            .select("id,image_url")
            .eq("restaurant_id", restaurantId)
            .order("id")
            .range(from, to),
        ),
      ]);
      return buildAnalytics(orders, items, products, days, timezone, lang, now);
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const labels: Record<WidgetId, string> = {
    revenue: ar ? "الإيراد عبر الزمن" : "Revenue over time",
    orders: ar ? "الطلبات" : "Orders",
    channels: ar ? "قنوات الطلب" : "Order channel",
    topProducts: ar ? "أفضل المنتجات" : "Top products",
    peakHours: ar ? "ساعات الذروة" : "Peak hours",
    weekly: ar ? "الأداء الأسبوعي" : "Weekly performance",
    orderTable: ar ? "جدول الطلبات" : "Order data table",
    paidProgress: ar ? "تقدم المدفوعات" : "Payment progress",
    summary: ar ? "التقارير التنفيذية" : "Executive reports",
  };
  const descriptions: Record<WidgetId, string> = {
    revenue: ar
      ? "اتجاه الإيرادات مقارنة بالفترة السابقة."
      : "Revenue trends with a previous-period comparison.",
    orders: ar ? "عدد الطلبات حسب اليوم." : "Daily order volume for the selected period.",
    channels: ar ? "داخل المطعم والاستلام والتوصيل." : "Dine-in, pickup and delivery distribution.",
    topProducts: ar
      ? "المنتجات الأكثر طلباً من المبيعات الفعلية."
      : "Your best sellers ranked by units sold.",
    peakHours: ar
      ? "الطلبات حسب توقيت المطعم."
      : "Order volume by hour in your restaurant timezone.",
    weekly: ar ? "نشاط الطلبات حسب اليوم والساعة." : "Order activity by weekday and time.",
    orderTable: ar ? "بحث وتصفية وتصدير الطلبات." : "Search, filter and export your orders.",
    paidProgress: ar
      ? "إجمالي القيمة والمدفوع والمعلّق."
      : "Order value, collected payments and pending balance.",
    summary: ar
      ? "ملخص تنفيذي قابل للتصدير."
      : "An executive overview of your restaurant performance.",
  };
  const filteredOrders = useMemo(
    () =>
      (analytics.data?.recent ?? []).filter((order) => {
        const text =
          `${order.order_number} ${order.status} ${order.payment_status} ${orderChannel(order)}`.toLowerCase();
        return (
          text.includes(orderSearch.toLowerCase()) &&
          (paymentFilter === "all" || order.payment_status === paymentFilter)
        );
      }),
    [analytics.data?.recent, orderSearch, paymentFilter],
  );

  function openEditor(tab: "layout" | "add") {
    if (!customize) {
      setConfig(savedConfig);
      setCustomize(true);
    }
    setEditorTab(tab);
    setEditorOpen(true);
    setWidgetSearch("");
  }
  function cancelCustomization() {
    setConfig(savedConfig);
    setCustomize(false);
    setEditorOpen(false);
  }
  async function saveConfig() {
    setSaving(true);
    try {
      const current = await supabase
        .from("restaurants")
        .select("menu_theme")
        .eq("id", restaurantId)
        .single();
      if (current.error) throw current.error;
      const theme = objectValue(current.data.menu_theme);
      const workspace = objectValue(theme.workspace);
      const nextTheme = { ...theme, workspace: { ...workspace, analyticsDashboard: config } };
      const result = await supabase
        .from("restaurants")
        .update({ menu_theme: nextTheme })
        .eq("id", restaurantId)
        .select("id")
        .single();
      if (result.error) throw result.error;
      await qc.invalidateQueries({ queryKey: ["platform"] });
      setCustomize(false);
      setEditorOpen(false);
      toast.success(ar ? "تم حفظ لوحة التحليلات" : "Analytics dashboard saved");
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setSaving(false);
    }
  }
  function download(name: string, rows: Array<Array<string | number>>) {
    const url = URL.createObjectURL(
      new Blob([analyticsCsv(rows)], { type: "text/csv;charset=utf-8;" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (restaurant.isError || analytics.isError)
    return (
      <div className="qs-card p-6 text-sm text-destructive" role="alert">
        {humanError(restaurant.error || analytics.error, lang)}
        <Button
          variant="outline"
          className="ms-3"
          onClick={() => {
            void restaurant.refetch();
            void analytics.refetch();
          }}
        >
          {ar ? "إعادة المحاولة" : "Retry"}
        </Button>
      </div>
    );
  if (analytics.isPending || restaurant.isPending)
    return (
      <div className="as-loading">
        <Skeleton className="h-20" />
        <Skeleton className="h-24" />
        <Skeleton className="h-[480px]" />
      </div>
    );
  const data = analytics.data!;
  const detailQuery =
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("detail");
  const detailWidget =
    detailWidgetProp ?? (isAnalyticsDetailWidget(detailQuery) ? detailQuery : null);
  if (detailWidget)
    return (
      <AnalyticsDetailPage
        widget={detailWidget}
        restaurantId={restaurantId}
        labels={labels}
        data={data}
        currency={currency}
        lang={lang}
        periodDays={days}
        timezone={timezone}
      />
    );
  const money = (value: number) => formatMoney(value, currency, lang);
  const number = (value: number) => formatNumber(value, lang);
  const periodLabel = ar ? `آخر ${days} أيام` : `Last ${days} days`;
  const pageSize = 4;
  const pageCount = Math.ceil(filteredOrders.length / pageSize);
  const safePage = Math.min(orderPage, Math.max(0, pageCount - 1));
  const tableRows = filteredOrders.slice(safePage * pageSize, (safePage + 1) * pageSize);
  const detailHref = (id: WidgetId) => `/manage/${restaurantId}/analytics/${id}?period=${days}`;
  const channelName = (order: AnalyticsOrder) => {
    const key = orderChannel(order);
    return key === "delivery"
      ? ar
        ? "توصيل"
        : "Delivery"
      : key === "pickup"
        ? ar
          ? "استلام"
          : "Pickup"
        : ar
          ? "داخل المطعم"
          : "Dine-in";
  };
  const time = (created: string) =>
    new Intl.DateTimeFormat(ar ? "ar-JO" : "en-US", {
      timeZone: timezone,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(created));
  const exportOrders = () =>
    download(`quickserve-orders-${days}d.csv`, [
      [labels.orderTable, periodLabel],
      [
        ar ? "الطلب" : "Order",
        ar ? "التاريخ" : "Date",
        ar ? "القناة" : "Channel",
        ar ? "عدد المنتجات" : "Items",
        ar ? "الإجمالي" : "Total",
        ar ? "الدفع" : "Payment",
        ar ? "الحالة" : "Status",
      ],
      ...filteredOrders.map((order) => [
        order.order_number,
        time(order.created_at),
        channelName(order),
        data.itemCounts.get(order.id) ?? 0,
        Number(order.total),
        order.payment_status,
        order.status,
      ]),
    ]);
  const exportReport = () =>
    download(`quickserve-executive-${days}d.csv`, [
      [ar ? "التقرير التنفيذي" : "Executive report", periodLabel],
      [ar ? "الإيراد" : "Revenue", data.revenue],
      [ar ? "الطلبات" : "Orders", data.orders.length],
      [ar ? "متوسط الطلب" : "Average order", data.aov],
      [ar ? "المدفوع" : "Collected", data.collected],
      [ar ? "معلّق" : "Pending", data.pending],
      [ar ? "مسترد" : "Refunded", data.refunded],
      [],
      [ar ? "اليوم" : "Date", ar ? "الإيراد" : "Revenue", ar ? "الطلبات" : "Orders"],
      ...data.series.map((row) => [row.key, row.sales, row.orders]),
    ]);
  function colorFor(id: WidgetId) {
    return config.colors[id] ?? config.accent;
  }
  function chart(id: WidgetId, rows: Array<Record<string, string | number>>, x: string, y: string) {
    const type = config.chartTypes[id] ?? DEFAULT_CHART_TYPES[id] ?? "bar";
    const color = colorFor(id);
    const axes = [
      <CartesianGrid key="grid" vertical={false} stroke="var(--as-border)" />,
      <XAxis
        key="x"
        dataKey={x}
        fontSize={9}
        tickLine={false}
        axisLine={false}
        minTickGap={12}
        stroke="var(--as-muted)"
      />,
      <YAxis
        key="y"
        fontSize={9}
        width={32}
        tickLine={false}
        axisLine={false}
        stroke="var(--as-muted)"
      />,
      <Tooltip
        key="tip"
        contentStyle={{
          background: "var(--as-surface)",
          borderColor: "var(--as-border)",
          borderRadius: 8,
          fontSize: 11,
        }}
      />,
    ];
    const comparison =
      id === "revenue" ? (
        <Line
          name={ar ? "الفترة السابقة" : "Previous period"}
          type="monotone"
          dataKey="previous"
          stroke="#b7bdc6"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      ) : null;
    if (type === "line")
      return (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
            {axes}
            {comparison}
            <Line
              name={labels[id]}
              type="monotone"
              dataKey={y}
              stroke={color}
              strokeWidth={2.2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      );
    if (type === "area")
      return (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
            {axes}
            <Area
              name={labels[id]}
              type="monotone"
              dataKey={y}
              stroke={color}
              fill={color}
              fillOpacity={0.07}
              strokeWidth={2.2}
              isAnimationActive={false}
            />
            {id === "revenue" ? (
              <Area
                name={ar ? "الفترة السابقة" : "Previous period"}
                type="monotone"
                dataKey="previous"
                stroke="#b7bdc6"
                fill="transparent"
                strokeWidth={2}
                isAnimationActive={false}
              />
            ) : null}
          </AreaChart>
        </ResponsiveContainer>
      );
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
          {axes}
          <Bar
            name={labels[id]}
            dataKey={y}
            fill={color}
            radius={[3, 3, 0, 0]}
            maxBarSize={28}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    );
  }
  function toolbar(id: WidgetId) {
    if (!customize) return null;
    const options = CHART_OPTIONS[id];
    return (
      <div className="as-widget-tools">
        <label>
          <Palette size={13} />
          <input
            aria-label={`${labels[id]} ${ar ? "اللون" : "color"}`}
            type="color"
            value={colorFor(id)}
            onChange={(event) =>
              setConfig((current) => ({
                ...current,
                colors: { ...current.colors, [id]: event.target.value },
              }))
            }
          />
        </label>
        {options ? (
          <select
            aria-label={`${labels[id]} ${ar ? "نوع الرسم" : "chart type"}`}
            value={config.chartTypes[id] ?? DEFAULT_CHART_TYPES[id] ?? "bar"}
            onChange={(event) =>
              setConfig((current) => ({
                ...current,
                chartTypes: { ...current.chartTypes, [id]: event.target.value as ChartType },
              }))
            }
          >
            {options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ) : null}
        {id === "orderTable" || id === "topProducts" ? (
          <button onClick={() => setConditionalWidget(id)}>
            <SlidersHorizontal size={13} />
            {ar ? "تنسيق شرطي" : "Conditional"}
          </button>
        ) : null}
        <button
          className="as-remove"
          aria-label={`${ar ? "حذف" : "Remove"} ${labels[id]}`}
          onClick={() =>
            setConfig((current) => ({
              ...current,
              widgets: current.widgets.filter((widget) => widget !== id),
            }))
          }
        >
          <Trash2 size={13} />
        </button>
      </div>
    );
  }
  function renderWidget(id: WidgetId) {
    const rules = config.conditional[id] ?? [];
    const color = colorFor(id);
    const widget = (content: ReactNode, action?: ReactNode) => (
      <Widget
        id={id}
        title={labels[id]}
        tools={toolbar(id)}
        action={action}
        href={detailHref(id)}
        viewLabel={ar ? "عرض التفاصيل" : "View details"}
      >
        {content}
      </Widget>
    );
    if (id === "revenue")
      return widget(
        <>
          <div className="as-chart-legend">
            <span>
              <i style={{ background: color }} />
              {ar ? "الفترة الحالية" : "This period"}
            </span>
            <span>
              <i style={{ background: "#b7bdc6" }} />
              {ar ? "الفترة السابقة" : "Previous period"}
            </span>
          </div>
          <div className="as-chart">{chart(id, data.series, "label", "sales")}</div>
        </>,
      );
    if (id === "orders")
      return widget(
        <div className="as-chart as-chart-full">{chart(id, data.series, "label", "orders")}</div>,
      );
    if (id === "channels")
      return widget(
        data.channels.length ? (
          config.chartTypes[id] === "bar" ? (
            <div className="as-chart as-chart-full">
              {chart(id, data.channels, "name", "value")}
            </div>
          ) : (
            <div className="as-channels">
              <div className="as-donut">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.channels}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="62%"
                      outerRadius="95%"
                      stroke="var(--as-surface)"
                      strokeWidth={2}
                      isAnimationActive={false}
                    >
                      {data.channels.map((_, index) => (
                        <Cell
                          key={index}
                          fill={index === 0 ? color : CHANNEL_COLORS[index % CHANNEL_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "var(--as-surface)",
                        borderColor: "var(--as-border)",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="as-donut-label">
                  <strong>{number(data.orders.length)}</strong>
                  <span>{ar ? "طلب" : "orders"}</span>
                </div>
              </div>
              <ul>
                {data.channels.map((row, index) => (
                  <li key={row.name}>
                    <i
                      style={{
                        background:
                          index === 0 ? color : CHANNEL_COLORS[index % CHANNEL_COLORS.length],
                      }}
                    />
                    <span>
                      {row.name}
                      <strong>{number(Math.round((row.value / data.orders.length) * 100))}%</strong>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )
        ) : (
          <Empty ar={ar} />
        ),
      );
    if (id === "topProducts")
      return widget(
        data.topProducts.length ? (
          <ol className="as-products">
            {data.topProducts.slice(0, 5).map((item, index) => {
              const row = {
                name: ar ? item.nameAr : item.name,
                qty: item.qty,
                revenue: item.revenue,
              };
              const qty = data.topProducts.reduce((sum, product) => sum + product.qty, 0);
              return (
                <li key={`${item.name}-${index}`} style={conditionalRowStyle(rules, row)}>
                  <span className="as-rank">{index + 1}</span>
                  {item.image ? (
                    <img src={item.image} alt="" loading="lazy" />
                  ) : (
                    <span className="as-product-fallback">
                      <ShoppingBag size={14} />
                    </span>
                  )}
                  <span className="as-product-name">
                    <strong style={conditionalCellStyle(rules, "name", row.name)} title={row.name}>
                      {row.name}
                    </strong>
                    <small style={conditionalCellStyle(rules, "qty", row.qty)}>
                      {number(row.qty)} {ar ? "وحدة" : "units"}
                    </small>
                  </span>
                  <span className="as-product-bar">
                    <i
                      style={{
                        width: `${(item.qty / data.topProducts[0]!.qty) * 100}%`,
                        background: color,
                      }}
                    />
                  </span>
                  <span className="as-product-share">
                    {number(Math.round((item.qty / qty) * 100))}%
                  </span>
                </li>
              );
            })}
          </ol>
        ) : (
          <Empty ar={ar} />
        ),
        <Link className="as-view-all" to={detailHref(id) as never}>
          {ar ? "عرض الكل" : "View all"}
        </Link>,
      );
    if (id === "peakHours")
      return widget(
        data.orders.length ? (
          <div className="as-chart as-chart-full">{chart(id, data.peak, "label", "orders")}</div>
        ) : (
          <Empty ar={ar} />
        ),
      );
    if (id === "weekly") {
      const max = Math.max(1, ...data.weekly.flatMap((row) => row.hours));
      return widget(
        <>
          <div
            className="as-heatmap"
            role="img"
            aria-label={ar ? "الطلبات حسب يوم الأسبوع والساعة" : "Orders by weekday and hour"}
          >
            {data.weekly.map((row) => (
              <div className="as-heat-row" key={row.day}>
                <span>{row.label}</span>
                {row.hours.map((count, index) => (
                  <span
                    key={index}
                    className="as-heat-cell"
                    title={`${row.label} ${index * 2}:00–${index * 2 + 2}:00 · ${count} ${ar ? "طلب" : "orders"}`}
                    style={{
                      background: `color-mix(in srgb, ${color} ${count ? 15 + (count / max) * 85 : 4}%, var(--as-surface))`,
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
          <div className="as-heat-axis">
            <span>00:00</span>
            <span>06:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>24:00</span>
          </div>
        </>,
      );
    }
    if (id === "paidProgress")
      return widget(
        <>
          <div className="as-payments">
            <div>
              <strong>{money(data.revenue)}</strong>
              <small>{ar ? "إجمالي القيمة" : "Total value"}</small>
            </div>
            <div>
              <strong>{money(data.collected)}</strong>
              <small>
                {ar ? "المدفوع" : "Collected"} ({Math.round(data.collectionRate)}%)
              </small>
            </div>
            <div>
              <strong>{money(data.pending)}</strong>
              <small>{ar ? "معلّق" : "Pending"}</small>
            </div>
          </div>
          <div
            className="as-progress"
            role="progressbar"
            aria-label={labels[id]}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(data.collectionRate)}
          >
            <i style={{ width: `${data.collectionRate}%`, background: color }} />
          </div>
          {data.refunded > 0 ? (
            <p className="as-refunded">
              {ar ? "مسترد" : "Refunded"}: {money(data.refunded)}
            </p>
          ) : null}
        </>,
      );
    if (id === "summary")
      return widget(
        <div className="as-report-preview">
          <span>
            <FileText size={23} />
          </span>
          <div>
            <strong>
              {days === 7
                ? ar
                  ? "تقرير الأداء الأسبوعي"
                  : "Weekly performance report"
                : ar
                  ? "تقرير أداء المطعم"
                  : "Performance report"}
            </strong>
            <p>
              {ar
                ? "ملخص الإيرادات والطلبات والمنتجات."
                : "An overview of revenue, orders and products."}
            </p>
            <Link to={detailHref(id) as never} className="as-report-link">
              {ar ? "عرض التقرير" : "View report"}
              <ChevronRight size={12} />
            </Link>
            <button
              onClick={exportReport}
              aria-label={ar ? "تصدير التقرير التنفيذي" : "Export executive report"}
            >
              <Download size={12} />
            </button>
          </div>
        </div>,
      );
    return widget(
      <>
        <div className="as-table-scroll">
          <table className="as-table">
            <thead>
              <tr>
                {[
                  ar ? "الطلب" : "Order",
                  ar ? "الوقت" : "Time",
                  ar ? "القناة" : "Channel",
                  ar ? "المنتجات" : "Items",
                  ar ? "الإجمالي" : "Total",
                  ar ? "الدفع" : "Payment",
                  ar ? "الحالة" : "Status",
                ].map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((order) => {
                const row = {
                  order: order.order_number,
                  status: order.status,
                  payment: order.payment_status,
                  total: Number(order.total),
                  date: formatDateTime(order.created_at, lang),
                };
                return (
                  <tr key={order.id} style={conditionalRowStyle(rules, row)}>
                    <td style={conditionalCellStyle(rules, "order", row.order)}>
                      <Link to={`/manage/${restaurantId}/orders?orderId=${order.id}` as never}>
                        {order.order_number}
                      </Link>
                    </td>
                    <td style={conditionalCellStyle(rules, "date", row.date)}>
                      {time(order.created_at)}
                    </td>
                    <td>{channelName(order)}</td>
                    <td>{number(data.itemCounts.get(order.id) ?? 0)}</td>
                    <td style={conditionalCellStyle(rules, "total", row.total)}>
                      {money(row.total)}
                    </td>
                    <td style={conditionalCellStyle(rules, "payment", row.payment)}>
                      <Status value={order.payment_status} ar={ar} />
                    </td>
                    <td style={conditionalCellStyle(rules, "status", row.status)}>
                      <Status value={order.status} ar={ar} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!tableRows.length ? <Empty ar={ar} /> : null}
        </div>
        <div className="as-table-footer">
          <span>
            {number(filteredOrders.length)} {ar ? "طلب" : "orders"}
          </span>
          <button disabled={safePage === 0} onClick={() => setOrderPage(safePage - 1)}>
            {ar ? "السابق" : "Previous"}
          </button>
          <span>
            {number(safePage + 1)} / {number(Math.max(1, pageCount))}
          </span>
          <button disabled={safePage + 1 >= pageCount} onClick={() => setOrderPage(safePage + 1)}>
            {ar ? "التالي" : "Next"}
          </button>
        </div>
      </>,
      <div className="as-table-actions">
        <label className="as-search">
          <Search size={13} />
          <input
            aria-label={ar ? "ابحث عن طلب" : "Search orders"}
            placeholder={ar ? "ابحث عن طلب…" : "Search orders…"}
            value={orderSearch}
            onChange={(event) => setOrderSearch(event.target.value)}
          />
        </label>
        <button aria-expanded={filterOpen} onClick={() => setFilterOpen(!filterOpen)}>
          <Filter size={12} />
          {ar ? "تصفية" : "Filter"}
        </button>
        {filterOpen ? (
          <select
            aria-label={ar ? "حالة الدفع" : "Payment filter"}
            value={paymentFilter}
            onChange={(event) => setPaymentFilter(event.target.value)}
          >
            <option value="all">{ar ? "كل المدفوعات" : "All payments"}</option>
            <option value="paid">{ar ? "مدفوع" : "Paid"}</option>
            <option value="unpaid">{ar ? "معلّق" : "Pending"}</option>
            <option value="refunded">{ar ? "مسترد" : "Refunded"}</option>
          </select>
        ) : null}
        <button onClick={exportOrders}>
          <Download size={12} />
          {ar ? "تصدير" : "Export"}
        </button>
      </div>,
    );
  }
  const tabWidgets: Record<AnalyticsTab, WidgetId[]> = {
    overview: config.widgets,
    orders: ["orders", "channels", "orderTable", "paidProgress"],
    products: ["topProducts", "peakHours", "weekly"],
    reports: ["summary", "revenue", "paidProgress"],
  };
  const widgets = tabWidgets[activeTab];
  const kpIs = [
    {
      id: "revenue",
      icon: CreditCard,
      label: ar ? "الإيراد" : "Revenue",
      value: money(data.revenue),
      current: data.revenue,
      previous: data.previousRevenue,
      values: data.series.map((row) => row.sales),
    },
    {
      id: "orders",
      icon: ShoppingBag,
      label: ar ? "الطلبات" : "Orders",
      value: number(data.orders.length),
      current: data.orders.length,
      previous: data.previousOrders,
      values: data.series.map((row) => row.orders),
    },
    {
      id: "average",
      icon: Tag,
      label: ar ? "متوسط الطلب" : "Average order",
      value: money(data.aov),
      current: data.aov,
      previous: data.previousAov,
      values: data.series.map((row) => (row.orders ? row.sales / row.orders : 0)),
    },
    {
      id: "payment",
      icon: CreditCard,
      label: ar ? "تقدم المدفوعات" : "Payment progress",
      value: `${number(Math.round(data.collectionRate))}% ${ar ? "مدفوع" : "collected"}`,
      current: 0,
      previous: 0,
      values: data.series.map((row) => row.orders),
    },
  ];
  return (
    <div className="qs-analytics-approved as-studio" dir={ar ? "rtl" : "ltr"}>
      <header className="as-header">
        <div>
          <h1>{ar ? "التحليلات" : "Analytics"}</h1>
          <p>{ar ? "اعرف ما يدفع نجاح مطعمك" : "Know what drives your business"}</p>
        </div>
        <div className="as-header-actions">
          <label className="as-period">
            <CalendarDays size={14} />
            <select
              aria-label={ar ? "فترة التقرير" : "Report period"}
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
            >
              {[7, 14, 30].map((value) => (
                <option key={value} value={value}>
                  {ar ? `آخر ${value} أيام` : `Last ${value} days`}
                </option>
              ))}
            </select>
          </label>
          <button onClick={() => setActiveTab("reports")}>
            <FileText size={14} />
            {labels.summary}
          </button>
          <button onClick={() => openEditor("layout")}>
            <Settings2 size={14} />
            {ar ? "تخصيص اللوحة" : "Customize dashboard"}
          </button>
          <button className="as-primary" onClick={() => openEditor("add")}>
            <Plus size={14} />
            {ar ? "إضافة أداة" : "Add widget"}
          </button>
        </div>
      </header>
      <nav className="as-tabs" aria-label={ar ? "أقسام التحليلات" : "Analytics views"}>
        {(["overview", "orders", "products", "reports"] as AnalyticsTab[]).map((tab) => (
          <button
            key={tab}
            aria-current={activeTab === tab ? "page" : undefined}
            onClick={() => setActiveTab(tab)}
          >
            {
              {
                overview: ar ? "نظرة عامة" : "Overview",
                orders: ar ? "الطلبات" : "Orders",
                products: ar ? "المنتجات" : "Products",
                reports: ar ? "التقارير" : "Reports",
              }[tab]
            }
          </button>
        ))}
      </nav>
      <div className="as-content">
        <section className="as-kpis">
          {kpIs.map((kpi) => (
            <article key={kpi.id}>
              <span className="as-kpi-icon">
                <kpi.icon size={21} />
              </span>
              <div>
                <span className="as-kpi-label">{kpi.label}</span>
                <strong>{kpi.value}</strong>
                {kpi.previous > 0 ? (
                  <small className={kpi.current < kpi.previous ? "as-negative" : "as-positive"}>
                    {kpi.current < kpi.previous ? <ArrowDown size={11} /> : <ArrowUp size={11} />}
                    {number(
                      Math.abs(Math.round(((kpi.current - kpi.previous) / kpi.previous) * 100)),
                    )}
                    % <span>{ar ? "عن الفترة السابقة" : "vs previous period"}</span>
                  </small>
                ) : (
                  <small>{periodLabel}</small>
                )}
              </div>
              <Sparkline values={kpi.values} color={config.accent} />
            </article>
          ))}
        </section>
        {customize ? (
          <div className="as-edit-notice">
            <GripVertical size={15} />
            <span>
              {ar
                ? "اسحب الأدوات وغيّر حجمها. احفظ التغييرات عند الانتهاء."
                : "Drag and resize widgets. Save your layout when you’re ready."}
            </span>
            <button onClick={() => setEditorOpen(true)}>
              {ar ? "إعدادات التخطيط" : "Layout settings"}
            </button>
            <button disabled={saving} onClick={() => void saveConfig()}>
              {saving ? (ar ? "حفظ…" : "Saving…") : ar ? "حفظ التخطيط" : "Save layout"}
            </button>
            <button onClick={cancelCustomization}>{ar ? "إلغاء" : "Cancel"}</button>
          </div>
        ) : null}
        {widgets.length ? (
          <DashboardGrid
            className={`as-grid ${activeTab !== "overview" ? "as-grid-focused" : ""}`}
            ids={widgets}
            customize={customize && activeTab === "overview"}
            sizeFor={(id) => config.sizes[id] ?? DEFAULT_SIZES[id]}
            labelFor={(id) => labels[id]}
            minColumns={(id) => (id === "orderTable" ? 6 : 3)}
            minHeight={() => 120}
            onReorder={(source, target) =>
              setConfig((current) => ({
                ...current,
                widgets: reorderDashboardItems(current.widgets, source, target),
              }))
            }
            onResize={(id, size) =>
              setConfig((current) => ({ ...current, sizes: { ...current.sizes, [id]: size } }))
            }
            renderItem={renderWidget}
          />
        ) : (
          <div className="as-empty-layout">
            <Table2 />
            <p>{ar ? "أضف أدوات لبناء لوحة التحليلات." : "Add widgets to build your dashboard."}</p>
            <button className="as-primary" onClick={() => openEditor("add")}>
              <Plus size={14} />
              {ar ? "إضافة أداة" : "Add widget"}
            </button>
          </div>
        )}
        {activeTab === "reports" ? (
          <>
            <div className="as-report-export">
              <button onClick={exportReport}>
                <Download size={14} />
                {ar ? "تصدير التقرير التنفيذي" : "Export executive report"}
              </button>
            </div>
            <DecisionIntelligencePanel restaurantId={restaurantId} />
          </>
        ) : null}
        <footer className="as-footer">
          <span>
            {ar ? "بيانات المطعم الفعلية" : "Live restaurant data"} · {timezone}
          </span>
          <span>
            {ar ? "آخر تحديث" : "Last updated"}:{" "}
            {time(new Date(analytics.dataUpdatedAt).toISOString())}
          </span>
        </footer>
      </div>
      <Sheet open={editorOpen} onOpenChange={setEditorOpen}>
        <SheetContent
          side={ar ? "left" : "right"}
          className="as-editor"
          closeLabel={ar ? "إغلاق" : "Close"}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
          }}
        >
          <SheetHeader>
            <SheetTitle>{ar ? "تخصيص اللوحة" : "Customize dashboard"}</SheetTitle>
            <SheetDescription>
              {ar
                ? "اختر الأدوات ورتّب لوحة مطعمك."
                : "Choose and arrange your restaurant’s widgets."}
            </SheetDescription>
          </SheetHeader>
          <div className="as-editor-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={editorTab === "layout"}
              onClick={() => setEditorTab("layout")}
            >
              {ar ? "التخطيط" : "Layout"}
            </button>
            <button
              role="tab"
              aria-selected={editorTab === "add"}
              onClick={() => setEditorTab("add")}
            >
              {ar ? "إضافة أداة" : "Add widget"}
            </button>
          </div>
          <div className="as-editor-body">
            {editorTab === "layout" ? (
              <>
                <h3>{ar ? "أدواتك" : "Your widgets"}</h3>
                <p>
                  {ar
                    ? "اسحب لإعادة الترتيب أو استخدم الأسهم."
                    : "Drag to reorder, or use the arrow controls."}
                </p>
                <div className="as-widget-list">
                  {[
                    ...config.widgets,
                    ...ALL_WIDGETS.filter((id) => !config.widgets.includes(id)),
                  ].map((id, index) => {
                    const Icon = WIDGET_ICONS[id];
                    const active = config.widgets.includes(id);
                    return (
                      <div
                        key={id}
                        className="as-widget-row"
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.preventDefault();
                          const source = draggingWidget.current;
                          if (source && active)
                            setConfig((current) => ({
                              ...current,
                              widgets: reorderDashboardItems(current.widgets, source, id),
                            }));
                          draggingWidget.current = null;
                        }}
                      >
                        <button
                          draggable={active}
                          onDragStart={() => {
                            draggingWidget.current = id;
                          }}
                          onDragEnd={() => {
                            draggingWidget.current = null;
                          }}
                          aria-label={`${ar ? "اسحب" : "Drag"} ${labels[id]}`}
                        >
                          <GripVertical size={14} />
                        </button>
                        <Icon size={16} />
                        <span>{labels[id]}</span>
                        {active ? (
                          <div className="as-reorder-buttons">
                            <button
                              disabled={index === 0}
                              aria-label={`${ar ? "لأعلى" : "Move up"} ${labels[id]}`}
                              onClick={() =>
                                setConfig((current) => ({
                                  ...current,
                                  widgets: reorderDashboardItems(
                                    current.widgets,
                                    id,
                                    current.widgets[index - 1]!,
                                  ),
                                }))
                              }
                            >
                              <ArrowUp size={11} />
                            </button>
                            <button
                              disabled={index === config.widgets.length - 1}
                              aria-label={`${ar ? "لأسفل" : "Move down"} ${labels[id]}`}
                              onClick={() =>
                                setConfig((current) => ({
                                  ...current,
                                  widgets: reorderDashboardItems(
                                    current.widgets,
                                    id,
                                    current.widgets[index + 1]!,
                                  ),
                                }))
                              }
                            >
                              <ArrowDown size={11} />
                            </button>
                          </div>
                        ) : null}
                        <button
                          type="button"
                          role="switch"
                          className="as-toggle"
                          aria-checked={active}
                          aria-label={`${ar ? "إظهار" : "Show"} ${labels[id]}`}
                          onClick={() =>
                            setConfig((current) => ({
                              ...current,
                              widgets: active
                                ? current.widgets.filter((widget) => widget !== id)
                                : [...current.widgets, id],
                            }))
                          }
                        >
                          <span />
                        </button>
                      </div>
                    );
                  })}
                </div>
                <div className="as-editor-options">
                  <label>
                    {ar ? "اللون الافتراضي" : "Default color"}
                    <input
                      type="color"
                      value={config.accent}
                      onChange={(event) =>
                        setConfig((current) => ({ ...current, accent: event.target.value }))
                      }
                    />
                  </label>
                  <button onClick={() => setConfig(readConfig({ workspace: {} }))}>
                    <RotateCcw size={13} />
                    {ar ? "إعادة التخطيط" : "Reset layout"}
                  </button>
                </div>
              </>
            ) : null}
            <section className="as-widget-catalog">
              <h3>{ar ? "إضافة أداة" : "Add widget"}</h3>
              <p>
                {ar
                  ? "اختر أداة لإضافتها إلى اللوحة."
                  : "Choose a widget to add to your dashboard."}
              </p>
              <label className="as-search">
                <Search size={14} />
                <input
                  aria-label={ar ? "بحث الأدوات" : "Search widgets"}
                  placeholder={ar ? "ابحث عن أداة…" : "Search widgets…"}
                  value={widgetSearch}
                  onChange={(event) => setWidgetSearch(event.target.value)}
                />
              </label>
              {ALL_WIDGETS.filter((id) =>
                labels[id].toLowerCase().includes(widgetSearch.toLowerCase()),
              ).map((id) => {
                const Icon = WIDGET_ICONS[id];
                const added = config.widgets.includes(id);
                return (
                  <button
                    key={id}
                    className="as-catalog-item"
                    disabled={added}
                    onClick={() =>
                      setConfig((current) => ({ ...current, widgets: [...current.widgets, id] }))
                    }
                  >
                    <Icon size={20} />
                    <span>
                      <strong>{labels[id]}</strong>
                      <small>{descriptions[id]}</small>
                    </span>
                    {added ? <Check size={15} /> : <Plus size={15} />}
                  </button>
                );
              })}
              {!ALL_WIDGETS.some((id) =>
                labels[id].toLowerCase().includes(widgetSearch.toLowerCase()),
              ) ? (
                <p role="status">{ar ? "لا توجد أدوات مطابقة." : "No matching widgets."}</p>
              ) : null}
            </section>
          </div>
          <div className="as-editor-footer">
            <button className="as-primary" disabled={saving} onClick={() => void saveConfig()}>
              {saving ? (ar ? "حفظ…" : "Saving…") : ar ? "حفظ التخطيط" : "Save layout"}
            </button>
            <button disabled={saving} onClick={cancelCustomization}>
              {ar ? "إلغاء" : "Cancel"}
            </button>
          </div>
        </SheetContent>
      </Sheet>
      <ConditionalFormattingDialog
        open={conditionalWidget !== null}
        onOpenChange={(open) => {
          if (!open) setConditionalWidget(null);
        }}
        ar={ar}
        columns={conditionalWidget === "topProducts" ? PRODUCT_COLUMNS : ORDER_COLUMNS}
        rules={conditionalWidget ? (config.conditional[conditionalWidget] ?? []) : []}
        onChange={(rules) => {
          if (conditionalWidget)
            setConfig((current) => ({
              ...current,
              conditional: { ...current.conditional, [conditionalWidget]: rules },
            }));
        }}
      />
    </div>
  );
}

function Widget({
  id,
  title,
  tools,
  action,
  children,
  href,
  viewLabel,
}: {
  id: string;
  title: string;
  tools?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  href: string;
  viewLabel: string;
}) {
  return (
    <section className="as-widget" data-widget={id}>
      <div className="as-widget-heading">
        <h2>{title}</h2>
        {action}
        <Link className="as-widget-detail" to={href as never} aria-label={`${viewLabel}: ${title}`}>
          <ChevronRight size={13} />
        </Link>
      </div>
      {tools}
      <div className="as-widget-body">{children}</div>
    </section>
  );
}
function Empty({ ar }: { ar: boolean }) {
  return (
    <div className="as-empty">
      {ar ? "لا توجد بيانات لهذه الفترة بعد." : "No data for this period yet."}
    </div>
  );
}
function Sparkline({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(1, ...values);
  const points = values
    .map(
      (value, index) =>
        `${(index / Math.max(1, values.length - 1)) * 80},${27 - (value / max) * 23}`,
    )
    .join(" ");
  return (
    <svg className="as-sparkline" viewBox="0 0 80 30" aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.7"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
function Status({ value, ar }: { value: string; ar: boolean }) {
  const names: Record<string, string> = {
    paid: "مدفوع",
    unpaid: "معلّق",
    refunded: "مسترد",
    new: "جديد",
    accepted: "مقبول",
    preparing: "قيد التحضير",
    ready: "جاهز",
    served: "تم التقديم",
    completed: "مكتمل",
  };
  return (
    <span
      className={`as-status ${["paid", "served", "completed"].includes(value) ? "as-status-good" : ["unpaid", "new", "preparing"].includes(value) ? "as-status-pending" : ""}`}
    >
      {ar ? names[value] || value : value === "unpaid" ? "Pending" : value.replaceAll("_", " ")}
    </span>
  );
}
