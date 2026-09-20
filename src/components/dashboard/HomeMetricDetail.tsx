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
    queryKey: ["workspace", "home-metric-detail", restaurantId, metric],
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const since = new Date(todayStart); since.setDate(since.getDate() - 6);
      const [{ data: orders, error: orderError }, { data: tables, error: tableError }] = await Promise.all([
        supabase.from("orders").select("id,order_number,status,payment_status,total,table_id,created_at,updated_at").eq("restaurant_id", restaurantId).gte("created_at", since.toISOString()).order("created_at", { ascending: true }),
        supabase.from("restaurant_tables").select("*").eq("restaurant_id", restaurantId).order("table_number", { ascending: true }),
      ]);
      if (orderError) throw orderError;
      if (tableError) throw tableError;

      let events: StatusEvent[] = [];
      let timingEventsAvailable = metric !== "order-time";
      if (metric === "order-time") {
        const eventResult = await (supabase as any).from("order_status_events").select("order_id,to_status,created_at").eq("restaurant_id", restaurantId).gte("created_at", todayStart.toISOString()).order("created_at", { ascending: true });
        if (eventResult.error) {
          if (eventResult.error.code === "PGRST205") {
            timingEventsAvailable = false;
          } else {
            throw eventResult.error;
          }
        } else {
          events = (eventResult.data ?? []) as unknown as StatusEvent[];
          timingEventsAvailable = true;
        }
      }

      return { orders: (orders ?? []) as unknown as OrderRow[], tables: (tables ?? []) as unknown as TableRow[], events, timingEventsAvailable, todayStart: todayStart.toISOString() };
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
  const daily = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - (6 - index));
    const next = new Date(date); next.setDate(next.getDate() + 1);
    const rows = allOrders.filter((order) => { const time = new Date(order.created_at).getTime(); return time >= date.getTime() && time < next.getTime() && order.status !== "cancelled"; });
    return { label: date.toLocaleDateString(ar ? "ar-JO" : "en-US", { weekday: "short" }), sales: rows.reduce((sum, order) => sum + Number(order.total ?? 0), 0), orders: rows.length };
  });
  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour: `${String(hour).padStart(2, "0")}:00`, sales: todayOrders.filter((order) => new Date(order.created_at).getHours() === hour).reduce((sum, order) => sum + Number(order.total ?? 0), 0), orders: todayOrders.filter((order) => new Date(order.created_at).getHours() === hour).length })).filter((row) => row.sales > 0 || row.orders > 0);
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
    {metric === "order-time" ? <OrderTimeDetail ar={ar} lang={lang} durations={durations} average={averageMinutes} timingEventsAvailable={detail.data.timingEventsAvailable} /> : null}
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

function OrderTimeDetail({ ar, lang, durations, average, timingEventsAvailable }: { ar:boolean;lang:"ar"|"en";durations:Array<{order:OrderRow;end:StatusEvent;minutes:number}>;average:number|null;timingEventsAvailable:boolean }) {
  const sorted=durations.map(row=>row.minutes); const fastest=sorted.length?Math.min(...sorted):null; const slowest=sorted.length?Math.max(...sorted):null;
  const chartRows=durations.slice(-12).map(row=>({order:row.order.order_number,minutes:Math.round(row.minutes)}));
  const minutes=(value:number|null)=>value===null?"—":`${Math.round(value)} ${ar?"د":"min"}`;
  return <><KpiGrid items={[{label:ar?"متوسط الوقت":"Average time",value:minutes(average),icon:<Clock3/>},{label:ar?"طلبات قابلة للقياس":"Tracked orders",value:String(durations.length),icon:<Receipt/>},{label:ar?"الأسرع":"Fastest",value:minutes(fastest),icon:<TrendingUp/>},{label:ar?"الأبطأ":"Slowest",value:minutes(slowest),icon:<Clock3/>}]} />{durations.length?<><ChartCard title={ar?"وقت الإكمال حسب الطلب":"Completion time by order"}><ResponsiveContainer width="100%" height="100%"><BarChart data={chartRows}><CartesianGrid strokeDasharray="3 3" vertical={false} opacity={.18}/><XAxis dataKey="order" fontSize={9} tickLine={false} axisLine={false}/><YAxis fontSize={10} tickLine={false} axisLine={false}/><Tooltip/><Bar dataKey="minutes" fill="#64748b" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer></ChartCard><DetailCard title={ar?"الطلبات المقاسة":"Measured orders"}><ModernTable headers={[ar?"الطلب":"Order",ar?"وقت الإنشاء":"Created",ar?"حدث الإكمال":"Completion event",ar?"وقت الإكمال":"Completed",ar?"المدة":"Duration"]} rows={durations.slice().reverse().map(row=>[<strong>{row.order.order_number}</strong>,formatDateTime(row.order.created_at,lang),<Status value={row.end.to_status}/>,formatDateTime(row.end.created_at,lang),minutes(row.minutes)])} ar={ar}/></DetailCard></>:<section className="qs-card p-8 text-center"><Clock3 className="mx-auto size-10 text-muted-foreground"/><h2 className="mt-4 text-lg font-bold">{timingEventsAvailable?(ar?"لا توجد بيانات توقيت موثوقة بعد":"Not enough reliable timing data yet"):(ar?"سجل أوقات الطلب غير مفعّل بعد":"Order timing history is not configured yet")}</h2><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{timingEventsAvailable?(ar?"لن يعرض QuickServe متوسطاً تقديرياً. سيظهر القياس عندما تتوفر للطلبات أحداث Served أو Paid مسجلة فعلياً.":"QuickServe will not invent an estimated average. Timing appears once orders have real Served or Paid status events."):(ar?"صفحات المبيعات والطلبات والطاولات تعمل بشكل مستقل. وسيظهر متوسط وقت الطلب تلقائياً بعد إضافة سجل حالات الطلب إلى قاعدة البيانات.":"Sales, Orders, and Tables details work independently. Average Order Time will appear automatically once order status history is available in the database.")}</p></section>}</>;
}

function KpiGrid({ items }: { items:Array<{label:string;value:string;icon:React.ReactNode}> }) { return <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{items.map(item=><article key={item.label} className="qs-stat flex min-h-[118px] items-center gap-4 p-4"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-orange-500/10 text-[#ff5a0a] [&>svg]:size-5">{item.icon}</span><div className="min-w-0"><p className="text-[11px] font-semibold text-muted-foreground">{item.label}</p><strong className="mt-1 block truncate font-display text-2xl tracking-[-.04em]">{item.value}</strong></div></article>)}</section>; }
function ChartCard({ title, children }: { title:string;children:React.ReactNode }) { return <section className="qs-card p-4 sm:p-5"><h2 className="mb-4 text-sm font-bold">{title}</h2><div className="h-[285px]">{children}</div></section>; }
function DetailCard({ title, children }: { title:string;children:React.ReactNode }) { return <section className="qs-card overflow-hidden"><div className="border-b border-border px-5 py-4"><h2 className="text-sm font-bold">{title}</h2></div>{children}</section>; }
function ModernTable({ headers, rows, ar }: { headers:string[];rows:React.ReactNode[][];ar:boolean }) { if(!rows.length)return <Empty ar={ar}/>; return <div className="overflow-x-auto"><table className="min-w-[760px] w-full border-separate border-spacing-0 text-xs"><thead className="sticky top-0 z-10 bg-muted/75 backdrop-blur"><tr>{headers.map(header=><th key={header} className="border-b border-border px-4 py-3 text-start text-[10px] font-bold uppercase tracking-[.08em] text-muted-foreground">{header}</th>)}</tr></thead><tbody>{rows.map((cells,index)=><tr key={index} className="group transition hover:bg-muted/30">{cells.map((cell,cellIndex)=><td key={cellIndex} className="border-b border-border/70 px-4 py-3.5 align-middle last:text-start">{cell}</td>)}</tr>)}</tbody></table></div>; }
function Status({ value }: { value:string }) { const normalized=value.toLowerCase(); const positive=["paid","served","ready","active"].includes(normalized); const warning=["new","accepted","preparing","unpaid"].includes(normalized); return <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ${positive?"bg-emerald-500/10 text-emerald-600":warning?"bg-amber-500/10 text-amber-600":"bg-slate-500/10 text-slate-600"}`}>{value.replaceAll("_"," ")}</span>; }
function Empty({ ar }: { ar:boolean }) { return <div className="grid min-h-[180px] place-items-center p-8 text-center text-sm text-muted-foreground">{ar?"لا توجد بيانات فعلية كافية لهذا العرض بعد.":"Not enough real data for this view yet."}</div>; }
function floorOf(row:TableRow) { const layout=row.layout&&typeof row.layout==="object"&&!Array.isArray(row.layout)?row.layout:{}; return typeof layout.floor==="string"&&layout.floor?layout.floor:"ground"; }
