import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Banknote, Clock3, Lightbulb, Package, Receipt, Table2, TrendingUp, UsersRound } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { humanError } from "@/lib/errors";
import { formatMoney, formatNumber } from "@/lib/format";
import { useI18n, type Language } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Order = { id:string; total:number; status:string; payment_status:string; fulfillment_type:string; created_at:string; updated_at:string; table_id:string|null };
type Movement = { quantity:number; total_cost:number|null; unit_cost:number; movement_type:string; created_at:string };
type Inventory = { id:string; name:string; unit:string; reorder_level:number; quantity:number };
type Procurement = { id:string; status:string; needed_by:string|null; item_name_snapshot:string; quantity:number; estimated_unit_cost:number };
type TimeEntry = { staff_id:string; clock_in:string; clock_out:string|null; break_minutes:number };
type Forecast = {
  target_date:string;
  method:string;
  sample_days:number;
  confidence:"low"|"medium"|"high";
  data_sufficiency:"insufficient"|"limited"|"usable";
  expected_sales:number;
  expected_orders:number;
  average_order_value:number;
  hourly:Array<{hour:number;expected_orders:number;expected_sales:number}>;
  top_items:Array<{menu_item_id:string;name:string;expected_quantity:number}>;
  ingredients:Array<{inventory_item_id:string;name:string;unit:string;expected_quantity:number}>;
  labor:{expected_hours:number;historical_orders_per_labor_hour:number|null;peak_hour:number|null;peak_hour_expected_orders:number};
};

export function DecisionIntelligencePanel({restaurantId}:{restaurantId:string}) {
  const {lang}=useI18n(); const ar=lang==="ar";
  const query=useQuery({
    queryKey:["decision-intelligence",restaurantId],
    refetchInterval:60_000,
    queryFn:async()=>{
      const since7=new Date(Date.now()-7*86400000).toISOString();
      const sinceToday=new Date(); sinceToday.setHours(0,0,0,0);
      const [restaurantRes,ordersRes,inventoryRes,movementsRes,procRes,timeRes,tablesRes]=await Promise.all([
        supabase.from("restaurants").select("currency").eq("id",restaurantId).single(),
        supabase.from("orders").select("id,total,status,payment_status,fulfillment_type,created_at,updated_at,table_id").eq("restaurant_id",restaurantId).gte("created_at",since7).limit(5000),
        supabase.from("erp_inventory_balances" as any).select("id,name,unit,reorder_level,quantity").eq("restaurant_id",restaurantId).limit(3000),
        supabase.from("erp_stock_movements" as any).select("quantity,total_cost,unit_cost,movement_type,created_at").eq("restaurant_id",restaurantId).gte("created_at",since7).limit(5000),
        supabase.from("erp_procurement_requests" as any).select("id,status,needed_by,item_name_snapshot,quantity,estimated_unit_cost").eq("restaurant_id",restaurantId).limit(2000),
        supabase.from("staff_time_entries" as any).select("staff_id,clock_in,clock_out,break_minutes").eq("restaurant_id",restaurantId).gte("clock_in",since7).limit(5000),
        supabase.from("restaurant_tables").select("id").eq("restaurant_id",restaurantId).eq("is_active",true),
      ]);
      for(const result of [restaurantRes,ordersRes,inventoryRes,movementsRes,procRes,timeRes,tablesRes]) if(result.error) throw result.error;
      return {
        currency:restaurantRes.data?.currency??"JOD",
        orders:(ordersRes.data??[]).map((r:any)=>({...r,total:Number(r.total??0)})) as Order[],
        inventory:(inventoryRes.data??[]).map((r:any)=>({...r,reorder_level:Number(r.reorder_level??0),quantity:Number(r.quantity??0)})) as Inventory[],
        movements:(movementsRes.data??[]).map((r:any)=>({...r,quantity:Number(r.quantity??0),total_cost:r.total_cost===null?null:Number(r.total_cost),unit_cost:Number(r.unit_cost??0)})) as Movement[],
        procurement:(procRes.data??[]).map((r:any)=>({...r,quantity:Number(r.quantity??0),estimated_unit_cost:Number(r.estimated_unit_cost??0)})) as Procurement[],
        time:(timeRes.data??[]).map((r:any)=>({...r,break_minutes:Number(r.break_minutes??0)})) as TimeEntry[],
        tableCount:(tablesRes.data??[]).length,
        todayStart:sinceToday.getTime(),
      };
    },
  });

  const forecast=useQuery<Forecast>({
    queryKey:["operational-forecast",restaurantId],
    refetchInterval:15*60_000,
    queryFn:async()=>{
      const target=new Date(Date.now()+86400000).toLocaleDateString("en-CA");
      const {data,error}=await (supabase as any).rpc("get_operational_forecast",{_restaurant_id:restaurantId,_target_date:target});
      if(error)throw error;
      return data as Forecast;
    },
  });

  if(query.isPending)return <Skeleton className="h-60 rounded-2xl"/>;
  if(query.isError)return <section className="qs-card p-5 text-sm text-destructive">{humanError(query.error,lang)}</section>;
  const d=query.data!;
  const paid=d.orders.filter(o=>o.payment_status==="paid");
  const sales=paid.reduce((s,o)=>s+o.total,0);
  const avgTicket=paid.length?sales/paid.length:0;
  const dinePaid=paid.filter(o=>o.fulfillment_type==="dine_in");
  const turnsPerTable=d.tableCount?dinePaid.length/d.tableCount/7:0;
  const foodIssues=d.movements.filter(m=>m.movement_type==="issue"&&m.quantity<0).reduce((s,m)=>s+Math.abs(Number(m.total_cost??(m.quantity*m.unit_cost))),0);
  const foodPct=sales>0?foodIssues/sales*100:0;
  const hours=d.time.reduce((sum,row)=>{
    const end=row.clock_out?new Date(row.clock_out).getTime():Date.now();
    return sum+Math.max(0,(end-new Date(row.clock_in).getTime())/3600000-row.break_minutes/60);
  },0);
  const low=d.inventory.filter(i=>i.quantity<=i.reorder_level);
  const overdue=d.procurement.filter(p=>p.needed_by&&p.needed_by<new Date().toLocaleDateString("en-CA")&&!["received","cancelled","rejected"].includes(p.status));
  const unpaidServed=d.orders.filter(o=>o.status==="served"&&o.payment_status==="unpaid");
  const stuck=d.orders.filter(o=>["new","accepted","preparing"].includes(o.status)&&Date.now()-new Date(o.updated_at).getTime()>30*60000);

  const insights:Array<{title:string;body:string;tone:"danger"|"warning"|"good";icon:typeof Lightbulb}>=[];
  if(stuck.length)insights.push({title:ar?"طلبات متأخرة":"Orders need attention",body:ar?stuck.length+" طلب تجاوز 30 دقيقة في مرحلة التنفيذ.":stuck.length+" orders have spent over 30 minutes in an active stage.",tone:"danger",icon:Clock3});
  if(low.length)insights.push({title:ar?"مخزون يحتاج شراء":"Replenishment needed",body:ar?low.length+" مادة وصلت لحد إعادة الطلب.":low.length+" inventory items are at or below reorder level.",tone:"warning",icon:Package});
  if(overdue.length)insights.push({title:ar?"مشتريات متأخرة":"Procurement overdue",body:ar?overdue.length+" طلب شراء تجاوز تاريخ الحاجة.":overdue.length+" procurement requests are past their needed-by date.",tone:"warning",icon:AlertTriangle});
  if(unpaidServed.length)insights.push({title:ar?"فواتير خدمة غير مسددة":"Served bills still unpaid",body:ar?unpaidServed.length+" طلب مخدوم لم تتم تسويته.":unpaidServed.length+" served orders remain unpaid.",tone:"warning",icon:Banknote});
  if(foodPct>35)insights.push({title:ar?"تكلفة طعام مرتفعة":"Food cost is elevated",body:ar?"تكلفة الاستهلاك النظرية تقارب "+foodPct.toFixed(1)+"% من المبيعات المدفوعة.":"Theoretical ingredient issues are about "+foodPct.toFixed(1)+"% of paid sales.",tone:"warning",icon:Receipt});
  if(!insights.length)insights.push({title:ar?"لا توجد استثناءات كبيرة":"Operations look balanced",body:ar?"لا توجد حالات تشغيلية رئيسية تحتاج تدخلاً الآن حسب البيانات المتاحة.":"No major operational exceptions need intervention based on the available data.",tone:"good",icon:TrendingUp});

  return <section className="space-y-3">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><div className="inline-flex items-center gap-2 rounded-full bg-orange-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.14em] text-[#ff5a0a]"><Lightbulb className="size-3.5"/>{ar?"ذكاء إداري":"Decision intelligence"}</div><h2 className="mt-2 font-display text-xl font-bold tracking-[-.035em]">{ar?"ما الذي يحتاج قراراً؟":"What needs a management decision?"}</h2><p className="mt-1 text-xs text-muted-foreground">{ar?"ملخص سبعة أيام يربط المبيعات والمخزون والمشتريات والعمل.":"A seven-day view connecting sales, inventory, procurement and workforce signals."}</p></div></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Kpi icon={TrendingUp} label={ar?"مبيعات مدفوعة":"Paid sales"} value={formatMoney(sales,d.currency,lang)}/>
      <Kpi icon={Receipt} label={ar?"متوسط الفاتورة":"Average ticket"} value={formatMoney(avgTicket,d.currency,lang)}/>
      <Kpi icon={Table2} label={ar?"دوران الطاولة / يوم":"Table turns/day"} value={turnsPerTable?turnsPerTable.toFixed(2):"—"}/>
      <Kpi icon={UsersRound} label={ar?"ساعات عمل مسجلة":"Tracked labor hours"} value={hours?hours.toFixed(1)+"h":"—"}/>
      <Kpi icon={Package} label={ar?"تكلفة الطعام النظرية":"Theoretical food cost"} value={foodPct?foodPct.toFixed(1)+"%":"—"} tone={foodPct>35?"warning":undefined}/>
    </div>
    <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">{insights.slice(0,6).map((item,index)=><article key={index} className={cn("rounded-2xl border p-4",item.tone==="danger"?"border-red-200 bg-red-50/50 dark:border-red-900/50 dark:bg-red-950/10":item.tone==="warning"?"border-amber-200 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/10":"border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/50 dark:bg-emerald-950/10")}><div className="flex items-start gap-3"><span className={cn("grid size-9 shrink-0 place-items-center rounded-xl",item.tone==="danger"?"bg-red-500/10 text-red-600":item.tone==="warning"?"bg-amber-500/10 text-amber-700":"bg-emerald-500/10 text-emerald-700")}><item.icon className="size-4"/></span><div><strong className="text-sm">{item.title}</strong><p className="mt-1 text-xs leading-5 text-muted-foreground">{item.body}</p></div></div></article>)}</div>

    <ForecastPanel forecast={forecast.data} pending={forecast.isPending} error={forecast.isError} currency={d.currency} lang={lang} />
  </section>;
}

function Kpi({icon:Icon,label,value,tone}:{icon:typeof TrendingUp;label:string;value:string;tone?:"warning"|undefined}){return <article className="qs-stat min-h-[92px] p-3.5"><div className="flex items-center gap-2"><span className={cn("grid size-9 place-items-center rounded-xl",tone==="warning"?"bg-amber-500/10 text-amber-700":"bg-orange-500/10 text-[#ff5a0a]")}><Icon className="size-4"/></span><p className="text-[10px] font-semibold text-muted-foreground">{label}</p></div><strong className="mt-3 block font-display text-lg tracking-[-.03em]">{value}</strong></article>}


function ForecastPanel({forecast,pending,error,currency,lang}:{forecast:Forecast|undefined;pending:boolean;error:boolean;currency:string;lang:Language}) {
  const ar=lang==="ar";
  if(pending)return <Skeleton className="h-52 rounded-2xl"/>;
  if(error)return <article className="rounded-2xl border p-4"><h3 className="font-bold">{ar?"التوقع التشغيلي":"Operational forecast"}</h3><p className="mt-2 text-xs text-muted-foreground">{ar?"تعذر حساب التوقع الآن؛ لا يؤثر ذلك على بيانات التشغيل الحالية.":"Forecast could not be calculated right now; live operational data is unaffected."}</p></article>;
  if(!forecast||forecast.data_sufficiency==="insufficient")return <article className="rounded-2xl border border-dashed p-4"><h3 className="font-bold">{ar?"توقع الغد":"Tomorrow forecast"}</h3><p className="mt-2 text-xs text-muted-foreground">{ar?"لا توجد أيام مدفوعة كافية بعد لبناء توقع مسؤول. سيظهر التوقع تلقائياً مع تراكم البيانات.":"There are not enough paid trading days yet for a responsible forecast. It will appear automatically as history builds."}</p></article>;

  const peak=[...(forecast.hourly??[])].sort((a,b)=>b.expected_orders-a.expected_orders).slice(0,3);
  const confidenceLabel=forecast.confidence==="high"?(ar?"ثقة عالية":"High confidence"):forecast.confidence==="medium"?(ar?"ثقة متوسطة":"Medium confidence"):(ar?"بيانات محدودة":"Limited data");
  return <article className="rounded-2xl border bg-card p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="inline-flex rounded-full bg-orange-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[.12em] text-[#ff5a0a]">{ar?"توقع تشغيلي":"Operational forecast"}</div><h3 className="mt-3 font-display text-xl font-bold">{ar?"تخطيط الغد من التاريخ الفعلي":"Tomorrow planning from actual history"}</h3><p className="mt-1 text-xs text-muted-foreground">{ar?"متوسطات حتمية من آخر 28 يوماً، مع تفضيل نفس يوم الأسبوع. لا توجد ادعاءات ذكاء اصطناعي.":"Deterministic averages from the last 28 days, preferring the same weekday. No AI guesswork."}</p></div>
      <span className={cn("rounded-full px-3 py-1 text-[10px] font-bold",forecast.confidence==="high"?"bg-emerald-500/10 text-emerald-700":forecast.confidence==="medium"?"bg-amber-500/10 text-amber-700":"bg-muted text-muted-foreground")}>{confidenceLabel} · {forecast.sample_days} {ar?"أيام عينة":"sample days"}</span>
    </div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Kpi icon={TrendingUp} label={ar?"مبيعات متوقعة":"Expected sales"} value={formatMoney(Number(forecast.expected_sales),currency,lang)}/>
      <Kpi icon={Receipt} label={ar?"طلبات متوقعة":"Expected orders"} value={Number(forecast.expected_orders).toFixed(1)}/>
      <Kpi icon={UsersRound} label={ar?"ساعات عمل مرجعية":"Reference labor"} value={Number(forecast.labor?.expected_hours??0).toFixed(1)+"h"}/>
      <Kpi icon={Clock3} label={ar?"ساعة الذروة":"Peak hour"} value={forecast.labor?.peak_hour===null||forecast.labor?.peak_hour===undefined?"—":String(forecast.labor.peak_hour).padStart(2,"0")+":00"}/>
    </div>
    <div className="mt-4 grid gap-4 lg:grid-cols-3">
      <ForecastList title={ar?"ساعات الذروة":"Peak hours"} rows={peak.map(x=>[`${String(x.hour).padStart(2,"0")}:00`,`${Number(x.expected_orders).toFixed(1)} ${ar?"طلب":"orders"}`])}/>
      <ForecastList title={ar?"المنتجات الأعلى طلباً":"Expected top items"} rows={(forecast.top_items??[]).slice(0,5).map(x=>[x.name,`${Number(x.expected_quantity).toFixed(1)} ×`])}/>
      <ForecastList title={ar?"احتياج المكونات":"Ingredient requirement"} rows={(forecast.ingredients??[]).slice(0,5).map(x=>[x.name,`${Number(x.expected_quantity).toFixed(2)} ${x.unit}`])} empty={ar?"أضف وصفات BOM للحصول على احتياج المكونات.":"Add recipe BOMs to forecast ingredient requirements."}/>
    </div>
  </article>;
}

function ForecastList({title,rows,empty}:{title:string;rows:[string,string][];empty?:string}) {
  return <div className="rounded-xl bg-muted/35 p-4"><h4 className="text-xs font-bold">{title}</h4>{rows.length?<div className="mt-2 divide-y divide-border">{rows.map(([a,b])=><div key={a} className="flex justify-between gap-3 py-2 text-xs"><span className="truncate text-muted-foreground">{a}</span><strong className="shrink-0">{b}</strong></div>)}</div>:<p className="mt-2 text-xs text-muted-foreground">{empty??"—"}</p>}</div>;
}
