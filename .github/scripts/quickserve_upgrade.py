from pathlib import Path
import re
import textwrap

ROOT = Path(__file__).resolve().parents[2]

def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")

def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content.rstrip() + "\n", encoding="utf-8")

def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)

application_color_studio = r'''import { type Dispatch, type ReactNode, type SetStateAction } from "react";
import {
  CheckCircle2,
  CircleDot,
  Layers3,
  Moon,
  MousePointer2,
  Palette,
  PanelLeft,
  PanelTop,
  RotateCcw,
  Sparkles,
  Sun,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { contrastRatio } from "@/lib/contrast";
import { readAppearance } from "@/lib/restaurant-appearance";

type Appearance = ReturnType<typeof readAppearance>;

type Props = {
  ar: boolean;
  restaurantName: string;
  brand: Appearance;
  setBrand: Dispatch<SetStateAction<Appearance>>;
  primaryColor: string;
  accentColor: string;
  setPrimaryColor: (value: string) => void;
  setAccentColor: (value: string) => void;
};

const defaults = readAppearance({});
const BRAND_DEFAULT = "#ff5a0a";
const ACCENT_DEFAULT = "#ff8a4c";

export function ApplicationColorStudio({ ar, restaurantName, brand, setBrand, primaryColor, accentColor, setPrimaryColor, setAccentColor }: Props) {
  const update = <K extends keyof Appearance>(key: K, value: Appearance[K]) => setBrand((current) => ({ ...current, [key]: value }));
  return <div className="border-t border-border pt-6">
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <span className="inline-flex items-center gap-2 rounded-full bg-orange-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[.16em] text-[#ff5a0a]"><Palette className="size-3.5" />{ar ? "نظام الألوان" : "Color system"}</span>
        <h4 className="mt-3 font-display text-xl font-bold tracking-[-.03em]">{ar ? "ألوان التطبيق" : "Application colors"}</h4>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">{ar ? "ابنِ هوية واضحة لمساحة العمل. كل لون له وظيفة محددة ومعاينة مباشرة قبل الحفظ." : "Build a clear workspace identity. Every color has a defined job and a live preview before you save."}</p>
      </div>
      <span className="inline-flex items-center gap-2 self-start rounded-xl border border-border bg-card px-3 py-2 text-[10px] font-semibold text-muted-foreground"><CheckCircle2 className="size-3.5 text-emerald-500" />{ar ? "خاص بهذا المطعم فقط" : "Restaurant-scoped only"}</span>
    </div>

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,.78fr)]">
      <div className="space-y-4">
        <TokenGroup icon={<Sparkles className="size-4" />} title={ar ? "العلامة والتفاعل" : "Brand & interaction"} description={ar ? "الألوان التي تقود الإجراءات والحالة المحددة." : "Colors that lead actions and selected states."}>
          <ColorToken ar={ar} icon={<Palette className="size-4" />} label={ar ? "اللون الأساسي" : "Primary brand"} hint={ar ? "الأزرار والإجراءات الرئيسية" : "Primary actions and emphasis"} value={primaryColor} onChange={setPrimaryColor} onReset={() => setPrimaryColor(BRAND_DEFAULT)} />
          <ColorToken ar={ar} icon={<CircleDot className="size-4" />} label={ar ? "لون التمييز" : "Accent"} hint={ar ? "التفاصيل الثانوية" : "Secondary highlights"} value={accentColor} onChange={setAccentColor} onReset={() => setAccentColor(ACCENT_DEFAULT)} />
          <ColorToken ar={ar} icon={<MousePointer2 className="size-4" />} label={ar ? "العنصر المحدد" : "Selected navigation"} hint={ar ? "الحالة النشطة في التنقل" : "Active navigation state"} value={brand.selectedNavColor} onChange={(value) => update("selectedNavColor", value)} onReset={() => update("selectedNavColor", defaults.selectedNavColor)} />
        </TokenGroup>

        <TokenGroup icon={<PanelTop className="size-4" />} title={ar ? "التنقل" : "Navigation"} description={ar ? "تحكم مستقل بالشريط العلوي والقائمة الجانبية." : "Independent control for the top bar and sidebar."}>
          <ColorToken ar={ar} icon={<PanelTop className="size-4" />} label={ar ? "خلفية الشريط العلوي" : "Top navigation"} hint={ar ? "سطح الشريط العلوي" : "Top bar surface"} value={brand.topNavBackground} onChange={(value) => update("topNavBackground", value)} onReset={() => update("topNavBackground", defaults.topNavBackground)} />
          <ColorToken ar={ar} icon={<Sparkles className="size-4" />} label={ar ? "نص الشريط العلوي" : "Top navigation text"} hint={ar ? "النص والأيقونات" : "Text and icons"} value={brand.topNavText} onChange={(value) => update("topNavText", value)} onReset={() => update("topNavText", defaults.topNavText)} />
          <ColorToken ar={ar} icon={<PanelLeft className="size-4" />} label={ar ? "خلفية القائمة" : "Sidebar background"} hint={ar ? "سطح القائمة الجانبية" : "Sidebar surface"} value={brand.sidebarBackground} onChange={(value) => update("sidebarBackground", value)} onReset={() => update("sidebarBackground", defaults.sidebarBackground)} />
          <ColorToken ar={ar} icon={<Layers3 className="size-4" />} label={ar ? "نص القائمة" : "Sidebar text"} hint={ar ? "النص والأيقونات" : "Sidebar text and icons"} value={brand.sidebarText} onChange={(value) => update("sidebarText", value)} onReset={() => update("sidebarText", defaults.sidebarText)} />
        </TokenGroup>

        <TokenGroup icon={<Layers3 className="size-4" />} title={ar ? "الأسطح" : "Surfaces"} description={ar ? "خلفيات مريحة ومتوازنة للوضعين الفاتح والداكن." : "Balanced workspace surfaces for light and dark modes."}>
          <ColorToken ar={ar} icon={<Sun className="size-4" />} label={ar ? "خلفية الوضع الفاتح" : "Light background"} hint={ar ? "خلفية مساحة العمل الفاتحة" : "Light workspace canvas"} value={brand.lightBackground} onChange={(value) => update("lightBackground", value)} onReset={() => update("lightBackground", defaults.lightBackground)} />
          <ColorToken ar={ar} icon={<Moon className="size-4" />} label={ar ? "خلفية الوضع الداكن" : "Dark background"} hint={ar ? "خلفية مساحة العمل الداكنة" : "Dark workspace canvas"} value={brand.darkBackground} onChange={(value) => update("darkBackground", value)} onReset={() => update("darkBackground", defaults.darkBackground)} />
        </TokenGroup>
      </div>

      <div className="space-y-4 xl:sticky xl:top-24 xl:self-start">
        <Preview ar={ar} mode="light" restaurantName={restaurantName} brand={brand} primaryColor={primaryColor} />
        <Preview ar={ar} mode="dark" restaurantName={restaurantName} brand={brand} primaryColor={primaryColor} />
      </div>
    </div>
  </div>;
}

function TokenGroup({ icon, title, description, children }: { icon: ReactNode; title: string; description: string; children: ReactNode }) {
  return <section className="overflow-hidden rounded-2xl border border-border bg-card">
    <div className="flex items-start gap-3 border-b border-border bg-muted/20 px-4 py-3.5"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-orange-500/10 text-[#ff5a0a]">{icon}</span><div><h5 className="text-sm font-bold">{title}</h5><p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{description}</p></div></div>
    <div className="divide-y divide-border">{children}</div>
  </section>;
}

function ColorToken({ ar, icon, label, hint, value, onChange, onReset }: { ar: boolean; icon: ReactNode; label: string; hint: string; value: string; onChange: (value: string) => void; onReset: () => void }) {
  const valid = /^#[0-9a-f]{6}$/i.test(value);
  const ratio = valid ? Math.max(contrastRatio(value, "#ffffff"), contrastRatio(value, "#111827")) : 0;
  const accessible = valid && ratio >= 4.5;
  return <div className="grid gap-3 p-4 lg:grid-cols-[minmax(170px,1fr)_minmax(220px,.9fr)] lg:items-center">
    <div className="flex min-w-0 items-start gap-3"><span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">{icon}</span><span className="min-w-0"><strong className="block text-xs">{label}</strong><span className="mt-1 block text-[10px] leading-4 text-muted-foreground">{hint}</span><span className={`mt-1.5 inline-flex items-center gap-1 text-[9px] font-bold ${accessible ? "text-emerald-600" : "text-amber-600"}`}><span className={`size-1.5 rounded-full ${accessible ? "bg-emerald-500" : "bg-amber-500"}`} />{!valid ? (ar ? "أدخل HEX من 6 خانات" : "Enter a 6-digit HEX") : accessible ? `${ar ? "تباين جيد" : "Good contrast"} · ${ratio.toFixed(1)}:1` : `${ar ? "راجع التباين" : "Review contrast"} · ${ratio.toFixed(1)}:1`}</span></span></div>
    <div className="grid grid-cols-[44px_minmax(0,1fr)_38px] gap-2"><Input type="color" value={valid ? value : "#000000"} onChange={(event) => onChange(event.target.value)} className="h-10 w-full cursor-pointer p-1" aria-label={`${label} color`} /><Input value={value} aria-invalid={!valid} onChange={(event) => onChange(event.target.value)} className="h-10 min-w-0 font-mono text-xs uppercase" /><button type="button" onClick={onReset} className="grid size-10 place-items-center rounded-xl border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label={ar ? `إعادة ${label}` : `Reset ${label}`} title={ar ? "إعادة الافتراضي" : "Reset default"}><RotateCcw className="size-3.5" /></button></div>
  </div>;
}

function Preview({ ar, mode, restaurantName, brand, primaryColor }: { ar: boolean; mode: "light" | "dark"; restaurantName: string; brand: Appearance; primaryColor: string }) {
  const dark = mode === "dark";
  const canvas = dark ? brand.darkBackground : brand.lightBackground;
  const card = dark ? "#15191f" : "#ffffff";
  const text = dark ? "#f8fafc" : "#111827";
  const subtle = dark ? "#94a3b8" : "#64748b";
  return <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
    <div className="flex items-center justify-between border-b border-border px-4 py-3"><div className="flex items-center gap-2">{dark ? <Moon className="size-4 text-violet-500" /> : <Sun className="size-4 text-amber-500" />}<strong className="text-xs">{dark ? (ar ? "معاينة داكنة" : "Dark preview") : (ar ? "معاينة فاتحة" : "Light preview")}</strong></div><span className="rounded-full bg-muted px-2 py-1 text-[9px] font-bold text-muted-foreground">LIVE</span></div>
    <div className="overflow-hidden">
      <div className="flex min-h-11 items-center gap-2 px-3" style={{ background: brand.topNavBackground, color: brand.topNavText }}><span className="grid size-7 place-items-center rounded-lg text-[10px] font-black text-white" style={{ background: primaryColor }}>Q</span><strong className="truncate text-[10px]">{restaurantName}</strong><span className="ms-auto size-6 rounded-full border border-current opacity-35" /></div>
      <div className="grid min-h-[230px] grid-cols-[112px_1fr]" style={{ background: canvas, color: text }}><aside className="space-y-1.5 p-2.5" style={{ background: brand.sidebarBackground, color: brand.sidebarText }}><div className="rounded-lg px-2.5 py-2 text-[9px] font-bold" style={{ background: `${brand.selectedNavColor}20`, color: brand.selectedNavColor }}>{ar ? "الرئيسية" : "Home"}</div>{[ar ? "الطلبات" : "Orders", ar ? "القائمة" : "Menu", ar ? "التحليلات" : "Analytics", ar ? "الطاولات" : "Tables"].map((label) => <div key={label} className="px-2.5 py-1.5 text-[9px] opacity-65">{label}</div>)}</aside><main className="p-3"><div className="grid grid-cols-2 gap-2"><PreviewCard label={ar ? "المبيعات" : "Sales"} value="JOD 1,240" card={card} text={text} subtle={subtle} /><PreviewCard label={ar ? "الطلبات" : "Orders"} value="42" card={card} text={text} subtle={subtle} /></div><div className="mt-2.5 rounded-xl border p-3" style={{ background: card, borderColor: dark ? "#2c3440" : "#e5e7eb" }}><div className="flex items-center justify-between"><span className="text-[9px] font-bold">{ar ? "أداء اليوم" : "Today performance"}</span><span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[8px] font-bold text-emerald-500">+8.4%</span></div><div className="mt-3 flex h-10 items-end gap-1">{[34,55,42,70,48,80,62,88].map((height, index) => <i key={index} className="flex-1 rounded-t-sm" style={{ height: `${height}%`, background: index === 7 ? primaryColor : `${primaryColor}44` }} />)}</div></div><button type="button" className="mt-2.5 rounded-lg px-3 py-2 text-[9px] font-bold text-white" style={{ background: primaryColor }}>{ar ? "إجراء أساسي" : "Primary action"}</button></main></div>
    </div>
  </section>;
}

function PreviewCard({ label, value, card, text, subtle }: { label: string; value: string; card: string; text: string; subtle: string }) {
  return <div className="rounded-xl border p-2.5" style={{ background: card, borderColor: `${subtle}32` }}><span className="block text-[8px]" style={{ color: subtle }}>{label}</span><strong className="mt-1 block text-sm" style={{ color: text }}>{value}</strong></div>;
}
'''

home_metric_detail = r'''import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Clock3, CreditCard, Receipt, ShoppingBag, Table2, TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { AppHeader } from "@/components/nav/AppHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { humanError } from "@/lib/errors";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

export type HomeMetricId = "sales" | "orders" | "tables" | "order-time";
const HOME_METRICS: HomeMetricId[] = ["sales", "orders", "tables", "order-time"];
export function isHomeMetricId(value: string | null): value is HomeMetricId { return Boolean(value && HOME_METRICS.includes(value as HomeMetricId)); }

type OrderRow = { id: string; order_number: string; status: string; payment_status: string; total: number | string; table_id: string | null; created_at: string; updated_at: string };
type TableRow = { id: string; table_number: string; table_name: string | null; is_active: boolean; zone?: string | null; capacity?: number | null; layout?: Record<string, unknown> | null };
type StatusEvent = { order_id: string; to_status: string; created_at: string };

export function HomeMetricDetail({ metric, restaurantId, restaurantName, currency }: { metric: HomeMetricId; restaurantId: string; restaurantName: string; currency: string }) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const detail = useQuery({
    queryKey: ["workspace", "home-metric-detail", restaurantId],
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const since = new Date(todayStart); since.setDate(since.getDate() - 6);
      const [{ data: orders, error: orderError }, { data: tables, error: tableError }, { data: events, error: eventError }] = await Promise.all([
        supabase.from("orders").select("id,order_number,status,payment_status,total,table_id,created_at,updated_at").eq("restaurant_id", restaurantId).gte("created_at", since.toISOString()).order("created_at", { ascending: true }),
        supabase.from("restaurant_tables").select("*").eq("restaurant_id", restaurantId).order("table_number", { ascending: true }),
        supabase.from("order_status_events").select("order_id,to_status,created_at").eq("restaurant_id", restaurantId).gte("created_at", todayStart.toISOString()).order("created_at", { ascending: true }),
      ]);
      if (orderError) throw orderError; if (tableError) throw tableError; if (eventError) throw eventError;
      return { orders: (orders ?? []) as unknown as OrderRow[], tables: (tables ?? []) as unknown as TableRow[], events: (events ?? []) as unknown as StatusEvent[], todayStart: todayStart.toISOString() };
    },
  });

  const BackIcon = ar ? ArrowRight : ArrowLeft;
  if (detail.isPending) return <div className="min-h-dvh bg-background"><AppHeader /><main className="qs-page"><Skeleton className="h-[620px] rounded-2xl" /></main></div>;
  if (detail.isError) return <div className="min-h-dvh bg-background"><AppHeader /><main className="qs-page"><div className="qs-card p-6 text-sm text-destructive">{humanError(detail.error, lang)}</div></main></div>;

  const allOrders = detail.data.orders;
  const todayStartMs = new Date(detail.data.todayStart).getTime();
  const todayOrders = allOrders.filter((order) => new Date(order.created_at).getTime() >= todayStartMs && order.status !== "cancelled");
  const todaySales = todayOrders.reduce((sum, order) => sum + Number(order.total ?? 0), 0);
  const activeTables = detail.data.tables.filter((table) => table.is_active);
  const tableMap = new Map(detail.data.tables.map((table) => [table.id, table]));
  const daily = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - (6 - index));
    const next = new Date(date); next.setDate(next.getDate() + 1);
    const rows = allOrders.filter((order) => { const time = new Date(order.created_at).getTime(); return time >= date.getTime() && time < next.getTime() && order.status !== "cancelled"; });
    return { label: date.toLocaleDateString(ar ? "ar-JO" : "en-US", { weekday: "short" }), sales: rows.reduce((sum, order) => sum + Number(order.total ?? 0), 0), orders: rows.length };
  }), [allOrders, ar]);
  const hourly = useMemo(() => Array.from({ length: 24 }, (_, hour) => ({ hour: `${String(hour).padStart(2, "0")}:00`, sales: todayOrders.filter((order) => new Date(order.created_at).getHours() === hour).reduce((sum, order) => sum + Number(order.total ?? 0), 0), orders: todayOrders.filter((order) => new Date(order.created_at).getHours() === hour).length })).filter((row) => row.sales > 0 || row.orders > 0), [todayOrders]);
  const completionByOrder = new Map<string, StatusEvent>();
  for (const event of detail.data.events) if ((event.to_status === "served" || event.to_status === "paid") && !completionByOrder.has(event.order_id)) completionByOrder.set(event.order_id, event);
  const durations = todayOrders.flatMap((order) => { const end = completionByOrder.get(order.id); if (!end) return []; const minutes = (new Date(end.created_at).getTime() - new Date(order.created_at).getTime()) / 60_000; return minutes >= 0 && minutes <= 720 ? [{ order, end, minutes }] : []; });
  const averageMinutes = durations.length ? durations.reduce((sum, row) => sum + row.minutes, 0) / durations.length : null;
  const title = metric === "sales" ? (ar ? "مبيعات اليوم" : "Sales Today") : metric === "orders" ? (ar ? "طلبات اليوم" : "Total Orders") : metric === "tables" ? (ar ? "الطاولات النشطة" : "Open Tables") : (ar ? "متوسط وقت الطلب" : "Average Order Time");
  const subtitle = metric === "tables" ? (ar ? "هذا المؤشر يعرض الطاولات المفعّلة في الإعدادات؛ لا يتم افتراض الإشغال بدون بيانات إشغال فعلية." : "This metric represents configured active tables; occupancy is not inferred without real occupancy data.") : metric === "order-time" ? (ar ? "يُحتسب الوقت فقط من الطلبات التي لديها حدث موثوق للوصول إلى Served أو Paid." : "Timing is calculated only for orders with a reliable Served or Paid status event.") : (ar ? `بيانات فعلية من ${restaurantName}.` : `Live operational data from ${restaurantName}.`);

  return <div className="min-h-dvh bg-background"><AppHeader /><main className="qs-page space-y-5">
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><a href="/dashboard" className="mb-3 inline-flex items-center gap-2 text-xs font-bold text-muted-foreground transition hover:text-[#ff5a0a]"><BackIcon className="size-4" />{ar ? "العودة للرئيسية" : "Back to Home"}</a><h1 className="qs-page-title">{title}</h1><p className="qs-page-subtitle max-w-3xl">{subtitle}</p></div><span className="inline-flex self-start items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold"><span className="size-2 rounded-full bg-emerald-500" />{ar ? "اليوم" : "Today"}</span></header>
    {metric === "sales" ? <SalesDetail ar={ar} lang={lang} currency={currency} sales={todaySales} orders={todayOrders} daily={daily} hourly={hourly} tableMap={tableMap} /> : null}
    {metric === "orders" ? <OrdersDetail ar={ar} lang={lang} currency={currency} orders={todayOrders} daily={daily} tableMap={tableMap} /> : null}
    {metric === "tables" ? <TablesDetail ar={ar} tables={detail.data.tables} active={activeTables} /> : null}
    {metric === "order-time" ? <OrderTimeDetail ar={ar} lang={lang} durations={durations} average={averageMinutes} /> : null}
  </main></div>;
}

function SalesDetail({ ar, lang, currency, sales, orders, daily, hourly, tableMap }: { ar: boolean; lang: "ar" | "en"; currency: string; sales: number; orders: OrderRow[]; daily: Array<{label:string;sales:number;orders:number}>; hourly: Array<{hour:string;sales:number;orders:number}>; tableMap: Map<string, TableRow> }) {
  const aov = orders.length ? sales / orders.length : 0; const paid = orders.filter((row) => row.payment_status === "paid").reduce((sum, row) => sum + Number(row.total ?? 0), 0);
  return <><KpiGrid items={[{label:ar?"إجمالي المبيعات":"Total sales",value:formatMoney(sales,currency,lang),icon:<ShoppingBag/>},{label:ar?"الطلبات":"Orders",value:formatNumber(orders.length,lang),icon:<Receipt/>},{label:ar?"متوسط الطلب":"Average order",value:formatMoney(aov,currency,lang),icon:<TrendingUp/>},{label:ar?"قيمة المدفوع":"Paid value",value:formatMoney(paid,currency,lang),icon:<CreditCard/>}]} /><div className="grid gap-4 xl:grid-cols-2"><ChartCard title={ar?"اتجاه 7 أيام":"7-day sales trend"}><ResponsiveContainer width="100%" height="100%"><LineChart data={daily}><CartesianGrid strokeDasharray="3 3" vertical={false} opacity={.18}/><XAxis dataKey="label" fontSize={10} tickLine={false} axisLine={false}/><YAxis fontSize={10} tickLine={false} axisLine={false}/><Tooltip/><Line dataKey="sales" stroke="#ff5a0a" strokeWidth={3} dot={false}/></LineChart></ResponsiveContainer></ChartCard><ChartCard title={ar?"المبيعات حسب الساعة":"Hourly sales"}>{hourly.length?<ResponsiveContainer width="100%" height="100%"><BarChart data={hourly}><CartesianGrid strokeDasharray="3 3" vertical={false} opacity={.18}/><XAxis dataKey="hour" fontSize={9} tickLine={false} axisLine={false}/><YAxis fontSize={10} tickLine={false} axisLine={false}/><Tooltip/><Bar dataKey="sales" fill="#ff5a0a" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer>:<Empty ar={ar}/>}</ChartCard></div><DetailCard title={ar?"طلبات مبيعات اليوم":"Today’s sales orders"}><ModernTable headers={[ar?"الطلب":"Order",ar?"الحالة":"Status",ar?"الدفع":"Payment",ar?"القناة / الطاولة":"Channel / Table",ar?"الإجمالي":"Total",ar?"الوقت":"Time"]} rows={orders.slice().reverse().map((row)=>[<strong>{row.order_number}</strong>,<Status value={row.status}/>,<Status value={row.payment_status}/>,row.table_id?(tableMap.get(row.table_id)?.table_number?`${ar?"طاولة":"Table"} ${tableMap.get(row.table_id)?.table_number}`:(ar?"داخل المطعم":"Dine-in")):(ar?"خارجي":"Takeaway"),<strong>{formatMoney(Number(row.total??0),currency,lang)}</strong>,formatDateTime(row.created_at,lang)])} ar={ar}/></DetailCard></>;
}

function OrdersDetail({ ar, lang, currency, orders, daily, tableMap }: { ar:boolean;lang:"ar"|"en";currency:string;orders:OrderRow[];daily:Array<{label:string;sales:number;orders:number}>;tableMap:Map<string,TableRow> }) {
  const paid=orders.filter(row=>row.payment_status==="paid").length; const active=orders.filter(row=>!["served","paid","cancelled"].includes(row.status)).length; const takeaway=orders.filter(row=>!row.table_id).length;
  const statuses=Array.from(new Set(orders.map(row=>row.status))).map(status=>({status,count:orders.filter(row=>row.status===status).length}));
  return <><KpiGrid items={[{label:ar?"إجمالي الطلبات":"Total orders",value:formatNumber(orders.length,lang),icon:<Receipt/>},{label:ar?"طلبات جارية":"In progress",value:formatNumber(active,lang),icon:<Clock3/>},{label:ar?"مدفوعة":"Paid",value:formatNumber(paid,lang),icon:<CreditCard/>},{label:ar?"خارجي":"Takeaway",value:formatNumber(takeaway,lang),icon:<ShoppingBag/>}]} /><div className="grid gap-4 xl:grid-cols-2"><ChartCard title={ar?"الطلبات خلال 7 أيام":"Orders over 7 days"}><ResponsiveContainer width="100%" height="100%"><LineChart data={daily}><CartesianGrid strokeDasharray="3 3" vertical={false} opacity={.18}/><XAxis dataKey="label" fontSize={10} tickLine={false} axisLine={false}/><YAxis fontSize={10} tickLine={false} axisLine={false}/><Tooltip/><Line dataKey="orders" stroke="#10b981" strokeWidth={3} dot={false}/></LineChart></ResponsiveContainer></ChartCard><ChartCard title={ar?"توزيع الحالة":"Status distribution"}>{statuses.length?<ResponsiveContainer width="100%" height="100%"><BarChart data={statuses}><CartesianGrid strokeDasharray="3 3" vertical={false} opacity={.18}/><XAxis dataKey="status" fontSize={9} tickLine={false} axisLine={false}/><YAxis fontSize={10} tickLine={false} axisLine={false}/><Tooltip/><Bar dataKey="count" fill="#10b981" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer>:<Empty ar={ar}/>}</ChartCard></div><DetailCard title={ar?"تفاصيل طلبات اليوم":"Today’s order details"}><ModernTable headers={[ar?"الطلب":"Order",ar?"الحالة":"Status",ar?"الدفع":"Payment",ar?"القناة":"Channel",ar?"الإجمالي":"Total",ar?"التاريخ":"Created"]} rows={orders.slice().reverse().map(row=>[<strong>{row.order_number}</strong>,<Status value={row.status}/>,<Status value={row.payment_status}/>,row.table_id?(tableMap.get(row.table_id)?.table_number?`${ar?"طاولة":"Table"} ${tableMap.get(row.table_id)?.table_number}`:(ar?"داخل المطعم":"Dine-in")):(ar?"خارجي":"Takeaway"),formatMoney(Number(row.total??0),currency,lang),formatDateTime(row.created_at,lang)])} ar={ar}/></DetailCard></>;
}

function TablesDetail({ ar, tables, active }: { ar:boolean;tables:TableRow[];active:TableRow[] }) {
  const capacity=active.reduce((sum,row)=>sum+Number(row.capacity??0),0); const zones=Array.from(new Set(active.map(row=>row.zone||"main"))).map(zone=>({zone,count:active.filter(row=>(row.zone||"main")===zone).length}));
  return <><KpiGrid items={[{label:ar?"الطاولات المفعّلة":"Active tables",value:String(active.length),icon:<Table2/>},{label:ar?"كل الطاولات":"All tables",value:String(tables.length),icon:<Table2/>},{label:ar?"المقاعد المعرّفة":"Configured seats",value:String(capacity||"—"),icon:<Receipt/>},{label:ar?"المناطق":"Zones",value:String(zones.length),icon:<ShoppingBag/>}]} /><ChartCard title={ar?"الطاولات حسب المنطقة":"Tables by zone"}>{zones.length?<ResponsiveContainer width="100%" height="100%"><BarChart data={zones}><CartesianGrid strokeDasharray="3 3" vertical={false} opacity={.18}/><XAxis dataKey="zone" fontSize={10} tickLine={false} axisLine={false}/><YAxis fontSize={10} tickLine={false} axisLine={false}/><Tooltip/><Bar dataKey="count" fill="#3b82f6" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer>:<Empty ar={ar}/>}</ChartCard><DetailCard title={ar?"بيانات الطاولات":"Table configuration"}><ModernTable headers={[ar?"الطاولة":"Table",ar?"الاسم":"Name",ar?"الطابق":"Floor",ar?"المنطقة":"Zone",ar?"المقاعد":"Seats",ar?"الحالة":"Status"]} rows={tables.map(row=>[<strong>T{row.table_number}</strong>,row.table_name||"—",floorOf(row),row.zone||"main",row.capacity??"—",<Status value={row.is_active?(ar?"active":"active"):(ar?"inactive":"inactive")}/>])} ar={ar}/></DetailCard></>;
}

function OrderTimeDetail({ ar, lang, durations, average }: { ar:boolean;lang:"ar"|"en";durations:Array<{order:OrderRow;end:StatusEvent;minutes:number}>;average:number|null }) {
  const sorted=durations.map(row=>row.minutes); const fastest=sorted.length?Math.min(...sorted):null; const slowest=sorted.length?Math.max(...sorted):null;
  const chartRows=durations.slice(-12).map(row=>({order:row.order.order_number,minutes:Math.round(row.minutes)}));
  const minutes=(value:number|null)=>value===null?"—":`${Math.round(value)} ${ar?"د":"min"}`;
  return <><KpiGrid items={[{label:ar?"متوسط الوقت":"Average time",value:minutes(average),icon:<Clock3/>},{label:ar?"طلبات قابلة للقياس":"Tracked orders",value:String(durations.length),icon:<Receipt/>},{label:ar?"الأسرع":"Fastest",value:minutes(fastest),icon:<TrendingUp/>},{label:ar?"الأبطأ":"Slowest",value:minutes(slowest),icon:<Clock3/>}]} />{durations.length?<><ChartCard title={ar?"وقت الإكمال حسب الطلب":"Completion time by order"}><ResponsiveContainer width="100%" height="100%"><BarChart data={chartRows}><CartesianGrid strokeDasharray="3 3" vertical={false} opacity={.18}/><XAxis dataKey="order" fontSize={9} tickLine={false} axisLine={false}/><YAxis fontSize={10} tickLine={false} axisLine={false}/><Tooltip/><Bar dataKey="minutes" fill="#64748b" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer></ChartCard><DetailCard title={ar?"الطلبات المقاسة":"Measured orders"}><ModernTable headers={[ar?"الطلب":"Order",ar?"وقت الإنشاء":"Created",ar?"حدث الإكمال":"Completion event",ar?"وقت الإكمال":"Completed",ar?"المدة":"Duration"]} rows={durations.slice().reverse().map(row=>[<strong>{row.order.order_number}</strong>,formatDateTime(row.order.created_at,lang),<Status value={row.end.to_status}/>,formatDateTime(row.end.created_at,lang),minutes(row.minutes)])} ar={ar}/></DetailCard></>:<section className="qs-card p-8 text-center"><Clock3 className="mx-auto size-10 text-muted-foreground"/><h2 className="mt-4 text-lg font-bold">{ar?"لا توجد بيانات توقيت موثوقة بعد":"Not enough reliable timing data yet"}</h2><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{ar?"لن يعرض QuickServe متوسطاً تقديرياً. سيظهر القياس عندما تتوفر للطلبات أحداث Served أو Paid مسجلة فعلياً.":"QuickServe will not invent an estimated average. Timing appears once orders have real Served or Paid status events."}</p></section>}</>;
}

function KpiGrid({ items }: { items:Array<{label:string;value:string;icon:React.ReactNode}> }) { return <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{items.map(item=><article key={item.label} className="qs-stat flex min-h-[118px] items-center gap-4 p-4"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-orange-500/10 text-[#ff5a0a] [&>svg]:size-5">{item.icon}</span><div className="min-w-0"><p className="text-[11px] font-semibold text-muted-foreground">{item.label}</p><strong className="mt-1 block truncate font-display text-2xl tracking-[-.04em]">{item.value}</strong></div></article>)}</section>; }
function ChartCard({ title, children }: { title:string;children:React.ReactNode }) { return <section className="qs-card p-4 sm:p-5"><h2 className="mb-4 text-sm font-bold">{title}</h2><div className="h-[285px]">{children}</div></section>; }
function DetailCard({ title, children }: { title:string;children:React.ReactNode }) { return <section className="qs-card overflow-hidden"><div className="border-b border-border px-5 py-4"><h2 className="text-sm font-bold">{title}</h2></div>{children}</section>; }
function ModernTable({ headers, rows, ar }: { headers:string[];rows:React.ReactNode[][];ar:boolean }) { if(!rows.length)return <Empty ar={ar}/>; return <div className="overflow-x-auto"><table className="min-w-[760px] w-full border-separate border-spacing-0 text-xs"><thead className="sticky top-0 z-10 bg-muted/75 backdrop-blur"><tr>{headers.map(header=><th key={header} className="border-b border-border px-4 py-3 text-start text-[10px] font-bold uppercase tracking-[.08em] text-muted-foreground">{header}</th>)}</tr></thead><tbody>{rows.map((cells,index)=><tr key={index} className="group transition hover:bg-muted/30">{cells.map((cell,cellIndex)=><td key={cellIndex} className="border-b border-border/70 px-4 py-3.5 align-middle last:text-start">{cell}</td>)}</tr>)}</tbody></table></div>; }
function Status({ value }: { value:string }) { const normalized=value.toLowerCase(); const positive=["paid","served","ready","active"].includes(normalized); const warning=["new","accepted","preparing","unpaid"].includes(normalized); return <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ${positive?"bg-emerald-500/10 text-emerald-600":warning?"bg-amber-500/10 text-amber-600":"bg-slate-500/10 text-slate-600"}`}>{value.replaceAll("_"," ")}</span>; }
function Empty({ ar }: { ar:boolean }) { return <div className="grid min-h-[180px] place-items-center p-8 text-center text-sm text-muted-foreground">{ar?"لا توجد بيانات فعلية كافية لهذا العرض بعد.":"Not enough real data for this view yet."}</div>; }
function floorOf(row:TableRow) { const layout=row.layout&&typeof row.layout==="object"&&!Array.isArray(row.layout)?row.layout:{}; return typeof layout.floor==="string"&&layout.floor?layout.floor:"ground"; }
'''

analytics_detail_page = r'''import { ArrowLeft, ArrowRight, BarChart3, CalendarDays, CreditCard, FileText, Receipt, ShoppingBag, Table2, TrendingUp } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";

export type AnalyticsDetailWidgetId = "revenue" | "orders" | "channels" | "topProducts" | "peakHours" | "weekly" | "orderTable" | "paidProgress" | "summary";
const IDS: AnalyticsDetailWidgetId[] = ["revenue","orders","channels","topProducts","peakHours","weekly","orderTable","paidProgress","summary"];
export function isAnalyticsDetailWidget(value:string|null):value is AnalyticsDetailWidgetId{return Boolean(value&&IDS.includes(value as AnalyticsDetailWidgetId));}

type OrderRow={id:string;order_number:string;status:string;payment_status:string;total:number|string;table_id:string|null;created_at:string};
type ProductRow={name:string;nameAr:string;qty:number;revenue:number};
type SeriesRow={key:string;label:string;sales:number;orders:number};
type WeekRow={label:string;orders:number;sales:number};
type AnalyticsData={orders:OrderRow[];revenue:number;aov:number;paidRate:number;series:SeriesRow[];channels:Array<{name:string;value:number}>;topProducts:ProductRow[];peak:Array<{hour:number;orders:number}>;weekly:WeekRow[];recent:OrderRow[]};

export function AnalyticsDetailPage({widget,restaurantId,labels,data,currency,lang}:{widget:AnalyticsDetailWidgetId;restaurantId:string;labels:Record<AnalyticsDetailWidgetId,string>;data:AnalyticsData;currency:string;lang:"ar"|"en"}){
 const ar=lang==="ar";const BackIcon=ar?ArrowRight:ArrowLeft;const base=`/manage/${restaurantId}/analytics`;
 const channels=buildChannels(data.orders,ar);const hours=buildHours(data.orders);const payments=buildPayments(data.orders);const title=labels[widget];
 return <div className="space-y-5">
  <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><a href={base} className="mb-3 inline-flex items-center gap-2 text-xs font-bold text-muted-foreground transition hover:text-[#ff5a0a]"><BackIcon className="size-4"/>{ar?"العودة للتحليلات":"Back to Analytics"}</a><h1 className="qs-page-title">{title}</h1><p className="qs-page-subtitle">{ar?"صفحة مستقلة مبنية على بيانات هذا المطعم الفعلية لآخر 30 يوماً.":"Independent detail view powered by this restaurant’s real data from the last 30 days."}</p></div><span className="qs-button-secondary pointer-events-none"><CalendarDays className="size-4"/>{ar?"آخر 30 يوماً":"Last 30 days"}</span></header>
  <nav className="overflow-x-auto rounded-2xl border border-border bg-card p-1.5"><div className="flex min-w-max gap-1">{IDS.map(id=><a key={id} href={`${base}?detail=${id}`} className={`rounded-xl px-3 py-2.5 text-[11px] font-bold transition ${id===widget?"bg-[#ff5a0a] text-white shadow-sm":"text-muted-foreground hover:bg-muted hover:text-foreground"}`}>{labels[id]}</a>)}</div></nav>
  {widget==="revenue"?<Revenue ar={ar} lang={lang} currency={currency} data={data} channels={channels}/>:null}
  {widget==="orders"?<Orders ar={ar} lang={lang} currency={currency} data={data}/>:null}
  {widget==="channels"?<Channels ar={ar} lang={lang} currency={currency} rows={channels}/>:null}
  {widget==="topProducts"?<Products ar={ar} lang={lang} currency={currency} rows={data.topProducts}/>:null}
  {widget==="peakHours"?<Peak ar={ar} lang={lang} currency={currency} rows={hours}/>:null}
  {widget==="weekly"?<Weekly ar={ar} lang={lang} currency={currency} rows={data.weekly}/>:null}
  {widget==="orderTable"?<OrderTable ar={ar} lang={lang} currency={currency} rows={data.orders}/>:null}
  {widget==="paidProgress"?<Payments ar={ar} lang={lang} currency={currency} rows={payments} data={data}/>:null}
  {widget==="summary"?<Summary ar={ar} lang={lang} currency={currency} data={data} channels={channels}/>:null}
 </div>;
}

function Revenue({ar,lang,currency,data,channels}:{ar:boolean;lang:"ar"|"en";currency:string;data:AnalyticsData;channels:ChannelRow[]}){const best=data.series.reduce<SeriesRow|null>((best,row)=>!best||row.sales>best.sales?row:best,null);return <><Kpis items={[{label:ar?"الإيراد":"Revenue",value:formatMoney(data.revenue,currency,lang),icon:<TrendingUp/>},{label:ar?"الطلبات":"Orders",value:formatNumber(data.orders.length,lang),icon:<Receipt/>},{label:ar?"متوسط الطلب":"AOV",value:formatMoney(data.aov,currency,lang),icon:<ShoppingBag/>},{label:ar?"أفضل يوم":"Best day",value:best?formatMoney(best.sales,currency,lang):"—",icon:<BarChart3/>}]}/><div className="grid gap-4 xl:grid-cols-[1.35fr_.65fr]"><Chart title={ar?"اتجاه الإيراد":"Revenue trend"}><ResponsiveContainer width="100%" height="100%"><AreaChart data={data.series}><defs><linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ff5a0a" stopOpacity={.26}/><stop offset="100%" stopColor="#ff5a0a" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} opacity={.18}/><XAxis dataKey="label" fontSize={9} tickLine={false} axisLine={false}/><YAxis fontSize={9} tickLine={false} axisLine={false}/><Tooltip/><Area dataKey="sales" stroke="#ff5a0a" fill="url(#revFill)" strokeWidth={3}/></AreaChart></ResponsiveContainer></Chart><Chart title={ar?"الإيراد حسب القناة":"Revenue by channel"}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={channels} dataKey="revenue" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={4}>{channels.map((_,index)=><Cell key={index} fill={["#ff5a0a","#3b82f6","#10b981"][index%3]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></Chart></div><Card title={ar?"الإيراد حسب اليوم":"Revenue by day"}><Table headers={[ar?"اليوم":"Day",ar?"الإيراد":"Revenue",ar?"الطلبات":"Orders",ar?"متوسط الطلب":"AOV"]} rows={data.series.map(row=>[row.label,<strong>{formatMoney(row.sales,currency,lang)}</strong>,formatNumber(row.orders,lang),formatMoney(row.orders?row.sales/row.orders:0,currency,lang)])} ar={ar}/></Card></>}
function Orders({ar,lang,currency,data}:{ar:boolean;lang:"ar"|"en";currency:string;data:AnalyticsData}){const status=group(data.orders,row=>row.status);return <><Kpis items={[{label:ar?"الطلبات":"Orders",value:formatNumber(data.orders.length,lang),icon:<Receipt/>},{label:ar?"الإيراد":"Revenue",value:formatMoney(data.revenue,currency,lang),icon:<TrendingUp/>},{label:ar?"متوسط الطلب":"AOV",value:formatMoney(data.aov,currency,lang),icon:<ShoppingBag/>},{label:ar?"مدفوع":"Paid",value:`${Math.round(data.paidRate)}%`,icon:<CreditCard/>}]}/><Chart title={ar?"الطلبات حسب الحالة":"Orders by status"}><ResponsiveContainer width="100%" height="100%"><BarChart data={status}><CartesianGrid strokeDasharray="3 3" vertical={false} opacity={.18}/><XAxis dataKey="name" fontSize={9} tickLine={false} axisLine={false}/><YAxis fontSize={9} tickLine={false} axisLine={false}/><Tooltip/><Bar dataKey="count" fill="#10b981" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer></Chart><Card title={ar?"تفاصيل الطلبات":"Order details"}><Table headers={[ar?"الطلب":"Order",ar?"الحالة":"Status",ar?"الدفع":"Payment",ar?"القناة":"Channel",ar?"الإجمالي":"Total",ar?"التاريخ":"Date"]} rows={data.orders.slice().reverse().map(row=>[<strong>{row.order_number}</strong>,<Status value={row.status}/>,<Status value={row.payment_status}/>,row.table_id?(ar?"داخل المطعم":"Dine-in"):(ar?"خارجي":"Takeaway"),formatMoney(Number(row.total),currency,lang),formatDateTime(row.created_at,lang)])} ar={ar}/></Card></>}
function Channels({ar,lang,currency,rows}:{ar:boolean;lang:"ar"|"en";currency:string;rows:ChannelRow[]}){const total=rows.reduce((sum,row)=>sum+row.count,0);return <><Kpis items={rows.slice(0,4).map(row=>({label:row.name,value:formatNumber(row.count,lang),icon:<ShoppingBag/>}))}/><Chart title={ar?"مقارنة القنوات":"Channel comparison"}><ResponsiveContainer width="100%" height="100%"><BarChart data={rows}><CartesianGrid strokeDasharray="3 3" vertical={false} opacity={.18}/><XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false}/><YAxis fontSize={9} tickLine={false} axisLine={false}/><Tooltip/><Bar dataKey="revenue" fill="#3b82f6" radius={[8,8,0,0]}/></BarChart></ResponsiveContainer></Chart><Card title={ar?"تفاصيل القنوات":"Channel details"}><Table headers={[ar?"القناة":"Channel",ar?"الطلبات":"Orders",ar?"الإيراد":"Revenue",ar?"الحصة":"Share",ar?"متوسط الطلب":"AOV"]} rows={rows.map(row=>[<strong>{row.name}</strong>,formatNumber(row.count,lang),formatMoney(row.revenue,currency,lang),`${total?Math.round(row.count/total*100):0}%`,formatMoney(row.count?row.revenue/row.count:0,currency,lang)])} ar={ar}/></Card></>}
function Products({ar,lang,currency,rows}:{ar:boolean;lang:"ar"|"en";currency:string;rows:ProductRow[]}){return <><Kpis items={[{label:ar?"منتجات ظاهرة":"Ranked products",value:formatNumber(rows.length,lang),icon:<ShoppingBag/>},{label:ar?"إجمالي الكمية":"Units sold",value:formatNumber(rows.reduce((s,r)=>s+r.qty,0),lang),icon:<Receipt/>},{label:ar?"إيراد أفضل المنتجات":"Top-product revenue",value:formatMoney(rows.reduce((s,r)=>s+r.revenue,0),currency,lang),icon:<TrendingUp/>},{label:ar?"الأفضل":"Top product",value:rows[0]?(ar?rows[0].nameAr:rows[0].name):"—",icon:<BarChart3/>}]}/><Chart title={ar?"أفضل المنتجات بالكمية":"Top products by quantity"}><ResponsiveContainer width="100%" height="100%"><BarChart data={rows.slice(0,8)}><CartesianGrid strokeDasharray="3 3" vertical={false} opacity={.18}/><XAxis dataKey={ar?"nameAr":"name"} fontSize={8} tickLine={false} axisLine={false}/><YAxis fontSize={9} tickLine={false} axisLine={false}/><Tooltip/><Bar dataKey="qty" fill="#8b5cf6" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer></Chart><Card title={ar?"تصنيف المنتجات":"Product ranking"}><Table headers={["#",ar?"المنتج":"Product",ar?"الكمية":"Quantity",ar?"الإيراد":"Revenue",ar?"متوسط قيمة الوحدة":"Avg. unit value"]} rows={rows.map((row,index)=>[<strong>{index+1}</strong>,<strong>{ar?row.nameAr:row.name}</strong>,formatNumber(row.qty,lang),formatMoney(row.revenue,currency,lang),formatMoney(row.qty?row.revenue/row.qty:0,currency,lang)])} ar={ar}/></Card></>}
function Peak({ar,lang,currency,rows}:{ar:boolean;lang:"ar"|"en";currency:string;rows:HourRow[]}){const best=rows.reduce<HourRow|null>((b,r)=>!b||r.orders>b.orders?r:b,null);return <><Kpis items={[{label:ar?"ساعة الذروة":"Peak hour",value:best?`${String(best.hour).padStart(2,"0")}:00`:"—",icon:<BarChart3/>},{label:ar?"طلبات الذروة":"Peak orders",value:best?formatNumber(best.orders,lang):"—",icon:<Receipt/>},{label:ar?"إيراد ساعة الذروة":"Peak revenue",value:best?formatMoney(best.revenue,currency,lang):"—",icon:<TrendingUp/>},{label:ar?"ساعات نشطة":"Active hours",value:formatNumber(rows.length,lang),icon:<CalendarDays/>}]}/><Chart title={ar?"الطلبات حسب الساعة":"Orders by hour"}><ResponsiveContainer width="100%" height="100%"><BarChart data={rows}><CartesianGrid strokeDasharray="3 3" vertical={false} opacity={.18}/><XAxis dataKey="label" fontSize={8} tickLine={false} axisLine={false}/><YAxis fontSize={9} tickLine={false} axisLine={false}/><Tooltip/><Bar dataKey="orders" fill="#f59e0b" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer></Chart><Card title={ar?"تفاصيل الساعات":"Hourly performance"}><Table headers={[ar?"الساعة":"Hour",ar?"الطلبات":"Orders",ar?"الإيراد":"Revenue",ar?"متوسط الطلب":"AOV"]} rows={rows.map(row=>[row.label,formatNumber(row.orders,lang),formatMoney(row.revenue,currency,lang),formatMoney(row.orders?row.revenue/row.orders:0,currency,lang)])} ar={ar}/></Card></>}
function Weekly({ar,lang,currency,rows}:{ar:boolean;lang:"ar"|"en";currency:string;rows:WeekRow[]}){return <><Kpis items={[{label:ar?"إيراد الأسبوع":"Weekly revenue",value:formatMoney(rows.reduce((s,r)=>s+r.sales,0),currency,lang),icon:<TrendingUp/>},{label:ar?"طلبات الأسبوع":"Weekly orders",value:formatNumber(rows.reduce((s,r)=>s+r.orders,0),lang),icon:<Receipt/>},{label:ar?"أفضل يوم":"Best weekday",value:rows.reduce<WeekRow|null>((b,r)=>!b||r.sales>b.sales?r:b,null)?.label??"—",icon:<CalendarDays/>},{label:ar?"أيام مقاسة":"Measured days",value:formatNumber(rows.length,lang),icon:<BarChart3/>}]}/><Chart title={ar?"الإيراد الأسبوعي":"Weekly revenue"}><ResponsiveContainer width="100%" height="100%"><BarChart data={rows}><CartesianGrid strokeDasharray="3 3" vertical={false} opacity={.18}/><XAxis dataKey="label" fontSize={9} tickLine={false} axisLine={false}/><YAxis fontSize={9} tickLine={false} axisLine={false}/><Tooltip/><Bar dataKey="sales" fill="#06b6d4" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer></Chart><Card title={ar?"الأداء حسب يوم الأسبوع":"Performance by weekday"}><Table headers={[ar?"اليوم":"Day",ar?"الطلبات":"Orders",ar?"الإيراد":"Revenue",ar?"متوسط الطلب":"AOV"]} rows={rows.map(row=>[<strong>{row.label}</strong>,formatNumber(row.orders,lang),formatMoney(row.sales,currency,lang),formatMoney(row.orders?row.sales/row.orders:0,currency,lang)])} ar={ar}/></Card></>}
function OrderTable({ar,lang,currency,rows}:{ar:boolean;lang:"ar"|"en";currency:string;rows:OrderRow[]}){return <Card title={ar?"مجموعة بيانات الطلبات":"Orders dataset"}><Table headers={[ar?"الطلب":"Order",ar?"الحالة":"Status",ar?"الدفع":"Payment",ar?"القناة":"Channel",ar?"الإجمالي":"Total",ar?"التاريخ":"Date"]} rows={rows.slice().reverse().map(row=>[<strong>{row.order_number}</strong>,<Status value={row.status}/>,<Status value={row.payment_status}/>,row.table_id?(ar?"داخل المطعم":"Dine-in"):(ar?"خارجي":"Takeaway"),formatMoney(Number(row.total),currency,lang),formatDateTime(row.created_at,lang)])} ar={ar}/></Card>}
function Payments({ar,lang,currency,rows,data}:{ar:boolean;lang:"ar"|"en";currency:string;rows:PaymentRow[];data:AnalyticsData}){return <><Kpis items={[{label:ar?"نسبة المدفوع":"Paid rate",value:`${Math.round(data.paidRate)}%`,icon:<CreditCard/>},{label:ar?"إجمالي القيمة":"Total value",value:formatMoney(data.revenue,currency,lang),icon:<TrendingUp/>},...rows.slice(0,2).map(row=>({label:row.name,value:formatNumber(row.count,lang),icon:<Receipt/>}))]}/><Chart title={ar?"توزيع حالة الدفع":"Payment status distribution"}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={rows} dataKey="count" nameKey="name" innerRadius={65} outerRadius={96} paddingAngle={4}>{rows.map((_,index)=><Cell key={index} fill={["#10b981","#f59e0b","#64748b"][index%3]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></Chart><Card title={ar?"تفاصيل الدفع":"Payment details"}><Table headers={[ar?"الحالة":"Status",ar?"الطلبات":"Orders",ar?"القيمة":"Value",ar?"الحصة":"Share"]} rows={rows.map(row=>[<Status value={row.name}/>,formatNumber(row.count,lang),formatMoney(row.value,currency,lang),`${data.orders.length?Math.round(row.count/data.orders.length*100):0}%`])} ar={ar}/></Card></>}
function Summary({ar,lang,currency,data,channels}:{ar:boolean;lang:"ar"|"en";currency:string;data:AnalyticsData;channels:ChannelRow[]}){return <><Kpis items={[{label:ar?"الإيراد":"Revenue",value:formatMoney(data.revenue,currency,lang),icon:<TrendingUp/>},{label:ar?"الطلبات":"Orders",value:formatNumber(data.orders.length,lang),icon:<Receipt/>},{label:ar?"متوسط الطلب":"AOV",value:formatMoney(data.aov,currency,lang),icon:<ShoppingBag/>},{label:ar?"المدفوع":"Paid rate",value:`${Math.round(data.paidRate)}%`,icon:<CreditCard/>}]}/><div className="grid gap-4 xl:grid-cols-2"><Chart title={ar?"اتجاه الأداء":"Performance trend"}><ResponsiveContainer width="100%" height="100%"><AreaChart data={data.series}><CartesianGrid strokeDasharray="3 3" vertical={false} opacity={.18}/><XAxis dataKey="label" fontSize={9} tickLine={false} axisLine={false}/><YAxis fontSize={9} tickLine={false} axisLine={false}/><Tooltip/><Area dataKey="sales" stroke="#ff5a0a" fill="#ff5a0a" fillOpacity={.12} strokeWidth={3}/></AreaChart></ResponsiveContainer></Chart><Card title={ar?"ملخص القنوات":"Channel summary"}><Table headers={[ar?"القناة":"Channel",ar?"الطلبات":"Orders",ar?"الإيراد":"Revenue"]} rows={channels.map(row=>[row.name,formatNumber(row.count,lang),formatMoney(row.revenue,currency,lang)])} ar={ar}/></Card></div><Card title={ar?"ملخص يومي تنفيذي":"Executive daily breakdown"}><Table headers={[ar?"اليوم":"Day",ar?"الإيراد":"Revenue",ar?"الطلبات":"Orders",ar?"متوسط الطلب":"AOV"]} rows={data.series.map(row=>[row.label,formatMoney(row.sales,currency,lang),formatNumber(row.orders,lang),formatMoney(row.orders?row.sales/row.orders:0,currency,lang)])} ar={ar}/></Card></>}

type ChannelRow={name:string;count:number;revenue:number};type HourRow={hour:number;label:string;orders:number;revenue:number};type PaymentRow={name:string;count:number;value:number};
function buildChannels(orders:OrderRow[],ar:boolean):ChannelRow[]{const dine=orders.filter(r=>r.table_id);const out=orders.filter(r=>!r.table_id);return [{name:ar?"داخل المطعم":"Dine-in",count:dine.length,revenue:dine.reduce((s,r)=>s+Number(r.total),0)},{name:ar?"خارجي":"Takeaway",count:out.length,revenue:out.reduce((s,r)=>s+Number(r.total),0)}].filter(r=>r.count>0)}
function buildHours(orders:OrderRow[]):HourRow[]{const rows=Array.from({length:24},(_,hour)=>({hour,label:`${String(hour).padStart(2,"0")}:00`,orders:0,revenue:0}));for(const order of orders){const row=rows[new Date(order.created_at).getHours()]!;row.orders+=1;row.revenue+=Number(order.total)}return rows.filter(r=>r.orders>0)}
function buildPayments(orders:OrderRow[]):PaymentRow[]{return group(orders,row=>row.payment_status).map(row=>({name:row.name,count:row.count,value:orders.filter(order=>order.payment_status===row.name).reduce((s,r)=>s+Number(r.total),0)}))}
function group<T>(rows:T[],key:(row:T)=>string){const map=new Map<string,number>();for(const row of rows){const name=key(row);map.set(name,(map.get(name)??0)+1)}return Array.from(map,([name,count])=>({name,count}))}
function Kpis({items}:{items:Array<{label:string;value:string;icon:React.ReactNode}>}){return <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{items.map(item=><article key={item.label} className="qs-stat flex min-h-[116px] items-center gap-4 p-4"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-orange-500/10 text-[#ff5a0a] [&>svg]:size-5">{item.icon}</span><div className="min-w-0"><p className="text-[11px] font-semibold text-muted-foreground">{item.label}</p><strong className="mt-1 block truncate font-display text-xl tracking-[-.035em]">{item.value}</strong></div></article>)}</section>}
function Chart({title,children}:{title:string;children:React.ReactNode}){return <section className="qs-card p-4 sm:p-5"><h2 className="mb-4 text-sm font-bold">{title}</h2><div className="h-[300px]">{children}</div></section>}
function Card({title,children}:{title:string;children:React.ReactNode}){return <section className="qs-card overflow-hidden"><div className="flex items-center gap-3 border-b border-border px-5 py-4"><span className="grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground"><FileText className="size-4"/></span><h2 className="text-sm font-bold">{title}</h2></div>{children}</section>}
function Table({headers,rows,ar}:{headers:string[];rows:React.ReactNode[][];ar:boolean}){if(!rows.length)return <div className="grid min-h-[180px] place-items-center p-8 text-sm text-muted-foreground">{ar?"لا توجد بيانات فعلية كافية لهذا العرض بعد.":"Not enough real data for this detail yet."}</div>;return <div className="overflow-x-auto"><table className="w-full min-w-[760px] border-separate border-spacing-0 text-xs"><thead className="sticky top-0 z-10 bg-muted/85 backdrop-blur"><tr>{headers.map(h=><th key={h} className="border-b border-border px-4 py-3 text-start text-[10px] font-bold uppercase tracking-[.08em] text-muted-foreground">{h}</th>)}</tr></thead><tbody>{rows.map((cells,index)=><tr key={index} className="transition hover:bg-muted/30">{cells.map((cell,i)=><td key={i} className="border-b border-border/70 px-4 py-3.5 align-middle">{cell}</td>)}</tr>)}</tbody></table></div>}
function Status({value}:{value:string}){const n=value.toLowerCase();const positive=["paid","served","ready"].includes(n);const warning=["new","accepted","preparing","unpaid"].includes(n);return <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ${positive?"bg-emerald-500/10 text-emerald-600":warning?"bg-amber-500/10 text-amber-600":"bg-slate-500/10 text-slate-600"}`}>{value.replaceAll("_"," ")}</span>}
'''

write("src/components/manage/ApplicationColorStudio.tsx", textwrap.dedent(application_color_studio))
write("src/components/dashboard/HomeMetricDetail.tsx", textwrap.dedent(home_metric_detail))
write("src/components/manage/AnalyticsDetailPage.tsx", textwrap.dedent(analytics_detail_page))

# Restaurant appearance: swap the flat color form for the color-token studio.
path = "src/components/manage/RestaurantAppearance.tsx"
text = read(path)
text = replace_once(text, 'import { useState, type FormEvent, type ReactNode } from "react";', 'import { useState, type FormEvent } from "react";', "appearance react import")
text = replace_once(text, 'import { Moon, Save, Sun } from "lucide-react";', 'import { Save } from "lucide-react";', "appearance lucide import")
text = replace_once(text, 'import { contrastRatio } from "@/lib/contrast";\n', '', "appearance contrast import")
text = replace_once(text, 'import { ImageUploader } from "@/components/media/ImageUploader";\n', 'import { ImageUploader } from "@/components/media/ImageUploader";\nimport { ApplicationColorStudio } from "@/components/manage/ApplicationColorStudio";\n', "appearance studio import")
start = text.index('          <div className="border-t border-border pt-6">')
end_marker = '\n        </section>\n\n        <section className="panel space-y-5'
end = text.index(end_marker, start)
replacement = '''          <ApplicationColorStudio\n            ar={ar}\n            restaurantName={restaurant.name}\n            brand={brand}\n            setBrand={setBrand}\n            primaryColor={form.primary_color}\n            accentColor={form.accent_color}\n            setPrimaryColor={(value) => field("primary_color", value)}\n            setAccentColor={(value) => field("accent_color", value)}\n          />'''
text = text[:start] + replacement + text[end:]
text = re.sub(r'\nfunction ColorField\([\s\S]*$', '\n', text, count=1)
write(path, text)

# Home dashboard: unique URL-backed full detail pages instead of one shared dialog.
path = "src/routes/_authenticated/dashboard.tsx"
text = read(path)
text = replace_once(text, 'import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";\n', '', "dashboard dialog import")
text = replace_once(text, 'import { DashboardGrid, normalizeDashboardSize, reorderDashboardItems, type DashboardItemSize } from "@/components/customization/DashboardGrid";\n', 'import { DashboardGrid, normalizeDashboardSize, reorderDashboardItems, type DashboardItemSize } from "@/components/customization/DashboardGrid";\nimport { HomeMetricDetail, isHomeMetricId } from "@/components/dashboard/HomeMetricDetail";\n', "dashboard detail import")
text = replace_once(text, '  const [detailOpen, setDetailOpen] = useState(false);\n', '', "dashboard detail state")
old_metrics = '''  const metrics = [\n    { label: ar ? "مبيعات اليوم" : "Sales Today", value: formatMoney(r?.salesToday ?? 0, currency, lang), icon: ShoppingBag, tone: "orange" },\n    { label: ar ? "إجمالي الطلبات" : "Total Orders", value: formatNumber(r?.ordersToday ?? 0, lang), icon: ClipboardList, tone: "green" },\n    { label: ar ? "الطاولات المفتوحة" : "Open Tables", value: String(tableCount.data ?? 0), icon: Table2, tone: "blue" },\n    { label: ar ? "متوسط وقت الطلب" : "Average Order Time", value: "—", icon: Clock3, tone: "gray" },\n  ] as const;'''
new_metrics = '''  const metrics = [\n    { id: "sales", label: ar ? "مبيعات اليوم" : "Sales Today", value: formatMoney(r?.salesToday ?? 0, currency, lang), icon: ShoppingBag, tone: "orange" },\n    { id: "orders", label: ar ? "إجمالي الطلبات" : "Total Orders", value: formatNumber(r?.ordersToday ?? 0, lang), icon: ClipboardList, tone: "green" },\n    { id: "tables", label: ar ? "الطاولات المفتوحة" : "Open Tables", value: String(tableCount.data ?? 0), icon: Table2, tone: "blue" },\n    { id: "order-time", label: ar ? "متوسط وقت الطلب" : "Average Order Time", value: "—", icon: Clock3, tone: "gray" },\n  ] as const;'''
text = replace_once(text, old_metrics, new_metrics, "dashboard metrics")
insert_at = text.index('  const today = new Intl.DateTimeFormat')
detail_gate = '''  const detailMetric = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("detail");\n  if (rid && isHomeMetricId(detailMetric)) return <HomeMetricDetail metric={detailMetric} restaurantId={rid} restaurantName={restaurant.data?.name ?? scope.restaurantName ?? (ar ? "المطعم" : "Restaurant")} currency={currency} />;\n\n'''
text = text[:insert_at] + detail_gate + text[insert_at:]
pattern = re.compile(r'      : <section className="grid h-full gap-3 sm:grid-cols-2 xl:grid-cols-4">\{metrics\.map\(\(\{ label, value, icon: Icon, tone \}\) => <button type="button" key=\{label\} onClick=\{\(\) => setDetailOpen\(true\)\}([\s\S]*?)</button>\)\}</section>;')
match = pattern.search(text)
if not match:
    raise RuntimeError("dashboard metric button block not found")
new_block = '''      : <section className="grid h-full gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(({ id, label, value, icon: Icon, tone }) => <a href={`/dashboard?detail=${id}`} key={id} className="qs-stat flex min-h-[116px] items-center gap-4 text-start transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/30"><span className={`grid size-11 shrink-0 place-items-center rounded-full ${tone === "orange" ? "bg-orange-50 text-[#ff5a0a] dark:bg-orange-950/30" : tone === "green" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30" : tone === "blue" ? "bg-blue-50 text-blue-600 dark:bg-blue-950/30" : "bg-slate-100 text-slate-600 dark:bg-slate-800"}`}><Icon className="size-5" /></span><div className="min-w-0"><p className="text-[11px] font-semibold text-muted-foreground">{label}</p><p className="mt-1 truncate font-display text-[24px] font-bold tracking-[-.035em]">{value}</p><span className="mt-1 block text-[10px] font-bold text-[#ff5a0a]">{ar ? "عرض التفاصيل" : "View details"}</span></div></a>)}</section>;'''
text = text[:match.start()] + new_block + text[match.end():]
text, removed = re.subn(r'\n      <Dialog open=\{detailOpen\}[\s\S]*?</Dialog>', '', text, count=1)
if removed != 1:
    raise RuntimeError(f"dashboard old detail dialog removal matched {removed}")
write(path, text)

# Analytics: URL-backed full-page detail views with widget-specific data and tables.
path = "src/components/manage/AnalyticsManagerPro.tsx"
text = read(path)
text = replace_once(text, 'import { DashboardGrid, normalizeDashboardSize, reorderDashboardItems, type DashboardItemSize } from "@/components/customization/DashboardGrid";\n', 'import { DashboardGrid, normalizeDashboardSize, reorderDashboardItems, type DashboardItemSize } from "@/components/customization/DashboardGrid";\nimport { AnalyticsDetailPage, isAnalyticsDetailWidget } from "@/components/manage/AnalyticsDetailPage";\n', "analytics detail import")
text = replace_once(text, '  const [detailWidget, setDetailWidget] = useState<WidgetId | null>(null);\n  const [detailSearch, setDetailSearch] = useState("");\n', '', "analytics detail states")
needle = '''  const labels: Record<WidgetId, string> = {\n    revenue: ar ? "الإيراد عبر الزمن" : "Revenue Over Time", orders: ar ? "الطلبات" : "Orders", channels: ar ? "قنوات الطلب" : "Order Channels", topProducts: ar ? "أفضل المنتجات" : "Top Products", peakHours: ar ? "ساعات الذروة" : "Peak Hours", weekly: ar ? "الأداء الأسبوعي" : "Weekly Performance", orderTable: ar ? "جدول الطلبات" : "Orders Data Table", paidProgress: ar ? "تقدم المدفوعات" : "Payment Progress", summary: ar ? "تقرير ملخص" : "Executive Report",\n  };\n'''
replacement = needle + '''  const detailWidget = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("detail");\n  if (isAnalyticsDetailWidget(detailWidget)) return <AnalyticsDetailPage widget={detailWidget} restaurantId={restaurantId} labels={labels} data={data} currency={currency} lang={lang} />;\n'''
text = replace_once(text, needle, replacement, "analytics detail gate")
old_button = '''{!customize ? <button type="button" onClick={() => { setDetailSearch(""); setDetailWidget(id); }} className="absolute end-4 top-4 rounded-lg border border-border bg-card/95 px-2.5 py-1.5 text-[10px] font-bold text-[#ff5a0a] opacity-0 shadow-sm transition group-hover:opacity-100 focus-visible:opacity-100">{ar ? "عرض التفاصيل" : "View details"}</button> : null}'''
new_button = '''{!customize ? <a href={`/manage/${restaurantId}/analytics?detail=${id}`} className="absolute end-4 top-4 rounded-lg border border-border bg-card/95 px-2.5 py-1.5 text-[10px] font-bold text-[#ff5a0a] opacity-0 shadow-sm transition group-hover:opacity-100 focus-visible:opacity-100">{ar ? "عرض التفاصيل" : "View details"}</a> : null}'''
text = replace_once(text, old_button, new_button, "analytics view details link")
text, removed = re.subn(r'\n    <Dialog open=\{detailWidget !== null\}[\s\S]*?</Dialog>\n', '\n', text, count=1)
if removed != 1:
    raise RuntimeError(f"analytics old detail dialog removal matched {removed}")
write(path, text)

# Tables: decouple zone editing from the visibility filter and expose All Zones.
path = "src/components/manage/TablesManagerPro.tsx"
text = read(path)
text = replace_once(text, 'setActiveZone(zone.id);setSelectedZoneId(zone.id);', 'setActiveZone("all");setSelectedZoneId(zone.id);', "zone creation visibility fix")
zone_anchor = '<div className="flex flex-wrap gap-2">{currentFloor.zones.map(z=>'
zone_all = '<div className="flex flex-wrap gap-2"><button type="button" onClick={()=>setActiveZone("all")} className={cn("min-h-11 rounded-xl border px-4 text-xs font-bold",activeZone==="all"?"border-[#ff5a0a] bg-orange-50 text-[#ff5a0a] dark:bg-orange-950/20":"border-border bg-card hover:bg-muted")}>{ar?"كل المناطق":"All Zones"}<span className="ms-2 text-[10px] font-normal text-muted-foreground">{floorTables.length}</span></button>{currentFloor.zones.map(z=>'
text = replace_once(text, zone_anchor, zone_all, "all zones control")
write(path, text)

# Guardrails: the generated result must contain every requested behavior.
checks = {
    "src/components/manage/TablesManagerPro.tsx": ['setActiveZone("all");setSelectedZoneId(zone.id);', 'All Zones'],
    "src/routes/_authenticated/dashboard.tsx": ['HomeMetricDetail', '/dashboard?detail=${id}'],
    "src/components/manage/AnalyticsManagerPro.tsx": ['AnalyticsDetailPage', '/analytics?detail=${id}'],
    "src/components/manage/RestaurantAppearance.tsx": ['ApplicationColorStudio'],
}
for filename, snippets in checks.items():
    body = read(filename)
    for snippet in snippets:
        if snippet not in body:
            raise RuntimeError(f"verification failed: {snippet!r} missing from {filename}")

print("QuickServe upgrade patches applied successfully.")
