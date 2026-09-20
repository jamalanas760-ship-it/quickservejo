import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, Coins, Package, ReceiptText, TrendingUp } from "lucide-react";

import { MasterEyebrow, MasterKpi, MasterPageHeader, MasterSection } from "@/components/app/MasterPage";
import { AppHeader } from "@/components/nav/AppHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/useSession";
import { humanError } from "@/lib/errors";
import { formatMoney, formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/hq")({
  head:()=>({meta:[{title:"HQ — QuickServe"},{name:"description",content:"Multi-location restaurant portfolio overview."}]}),
  component:HQPage,
});

type LocationRow={id:string;name:string;currency:string;orders:number;sales:number;unpaid:number;lowStock:number};

function HQPage(){
  const {lang}=useI18n();const ar=lang==="ar";
  const access=useAccess();
  const locations=(access.data??[]).filter((row)=>row.restaurant_id&&row.restaurant).map((row)=>({
    id:row.restaurant_id!,name:row.restaurant!.name
  }));
  const unique=[...new Map(locations.map(r=>[r.id,r])).values()];
  const ids=unique.map(r=>r.id);

  const query=useQuery({
    queryKey:["hq",ids.sort().join(",")],
    enabled:ids.length>1,
    refetchInterval:60_000,
    queryFn:async()=>{
      const today=new Date();today.setHours(0,0,0,0);
      const [restaurantsRes,ordersRes,inventoryRes]=await Promise.all([
        supabase.from("restaurants").select("id,currency").in("id",ids),
        supabase.from("orders").select("restaurant_id,total,payment_status,status").in("restaurant_id",ids).gte("created_at",today.toISOString()).limit(10000),
        (supabase as any).from("erp_inventory_balances").select("restaurant_id,quantity,reorder_level").in("restaurant_id",ids).limit(10000),
      ]);
      if(restaurantsRes.error)throw restaurantsRes.error;
      if(ordersRes.error)throw ordersRes.error;
      if(inventoryRes.error)throw inventoryRes.error;
      return unique.map(location=>{
        const orders=(ordersRes.data??[]).filter((row:any)=>row.restaurant_id===location.id);
        const stock=(inventoryRes.data??[]).filter((row:any)=>row.restaurant_id===location.id);
        const currency=(restaurantsRes.data??[]).find((row)=>row.id===location.id)?.currency??"JOD";
        return {
          ...location,
          currency,
          orders:orders.length,
          sales:orders.filter((row:any)=>row.payment_status==="paid").reduce((sum:number,row:any)=>sum+Number(row.total??0),0),
          unpaid:orders.filter((row:any)=>row.status==="served"&&row.payment_status==="unpaid").length,
          lowStock:stock.filter((row:any)=>Number(row.quantity)<=Number(row.reorder_level)).length,
        } as LocationRow;
      });
    }
  });

  if(access.isPending)return <div className="min-h-dvh bg-background"><AppHeader/><main className="qs-page"><Skeleton className="h-[520px] rounded-3xl"/></main></div>;
  if(ids.length<2)return <div className="min-h-dvh bg-background"><AppHeader/><main className="qs-page"><section className="qs-card p-8 text-center"><Building2 className="mx-auto size-10 text-muted-foreground"/><h1 className="mt-4 text-xl font-bold">{ar?"HQ يظهر عند وجود أكثر من فرع":"HQ unlocks with multiple locations"}</h1><p className="mt-2 text-sm text-muted-foreground">{ar?"عند ربط حسابك بأكثر من مطعم ستظهر هنا المقارنة الموحدة.":"When your account manages more than one restaurant, the portfolio view appears here."}</p></section></main></div>;

  const rows=query.data??[];
  const baseCurrency=rows[0]?.currency??"JOD";
  const mixed=rows.some(r=>r.currency!==baseCurrency);
  const totalSales=mixed?0:rows.reduce((s,r)=>s+r.sales,0);
  const totalOrders=rows.reduce((s,r)=>s+r.orders,0);
  const low=rows.reduce((s,r)=>s+r.lowStock,0);
  const unpaid=rows.reduce((s,r)=>s+r.unpaid,0);

  return <div className="min-h-dvh bg-background"><AppHeader title="HQ"/><main className="qs-page space-y-5">
    <MasterPageHeader eyebrow={<MasterEyebrow icon={Building2}>{ar?"قيادة متعددة الفروع":"Multi-location command"}</MasterEyebrow>} title={ar?"كل فروعك في شاشة واحدة":"Every location in one portfolio"} description={ar?"قارن المبيعات والطلبات والاستثناءات التشغيلية عبر الفروع بدون خلط بيانات المستأجرين.":"Compare sales, orders and operating exceptions across locations while preserving tenant boundaries."} />

    {query.isPending?<Skeleton className="h-80 rounded-2xl"/>:query.isError?<section className="qs-card p-5 text-sm text-destructive">{humanError(query.error,lang)}</section>:<>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MasterKpi icon={Building2} label={ar?"الفروع":"Locations"} value={formatNumber(rows.length,lang)} tone="slate"/><MasterKpi icon={ReceiptText} label={ar?"طلبات اليوم":"Orders today"} value={formatNumber(totalOrders,lang)} tone="blue"/><MasterKpi icon={Coins} label={ar?"مبيعات مدفوعة اليوم":"Paid sales today"} value={mixed?(ar?"عملات متعددة":"Multiple currencies"):formatMoney(totalSales,baseCurrency,lang)} tone="green"/><MasterKpi icon={Package} label={ar?"استثناءات":"Exceptions"} value={formatNumber(low+unpaid,lang)} tone={low+unpaid?"orange":"slate"}/></section>
      <section className="overflow-hidden rounded-2xl border border-border bg-card"><div className="border-b border-border p-5"><h2 className="font-display text-lg font-bold">{ar?"مقارنة الفروع":"Location comparison"}</h2><p className="mt-1 text-xs text-muted-foreground">{ar?"بيانات اليوم الحالية لكل مطعم.":"Current-day operational signals by restaurant."}</p></div><div className="divide-y divide-border">{rows.sort((a,b)=>b.sales-a.sales).map((row,index)=><article key={row.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center"><div className="min-w-0"><div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-lg bg-muted text-xs font-bold">{index+1}</span><strong className="truncate">{row.name}</strong></div></div><div className="text-xs"><span className="text-muted-foreground">{ar?"طلبات":"Orders"}</span><strong className="ms-2">{formatNumber(row.orders,lang)}</strong></div><div className="text-xs"><span className="text-muted-foreground">{ar?"مبيعات":"Sales"}</span><strong className="ms-2">{formatMoney(row.sales,row.currency,lang)}</strong></div><div className="flex justify-end gap-2">{row.lowStock?<span className="rounded-full bg-amber-500/10 px-2 py-1 text-[9px] font-bold text-amber-700">{row.lowStock} {ar?"مخزون منخفض":"low stock"}</span>:null}{row.unpaid?<span className="rounded-full bg-red-500/10 px-2 py-1 text-[9px] font-bold text-red-700">{row.unpaid} {ar?"غير مسدد":"unpaid"}</span>:null}{!row.lowStock&&!row.unpaid?<span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[9px] font-bold text-emerald-700">{ar?"طبيعي":"Healthy"}</span>:null}</div></article>)}</div></section>
    </>}
  </main></div>;
}

function Kpi({icon:Icon,label,value,tone}:{icon:typeof Building2;label:string;value:string;tone?:"warning"|undefined}){return <article className="qs-stat flex min-h-[108px] items-center gap-4 p-4"><span className={cn("grid size-11 place-items-center rounded-2xl",tone==="warning"?"bg-amber-500/10 text-amber-700":"bg-orange-500/10 text-[#ff5a0a]")}><Icon className="size-5"/></span><div><p className="text-[11px] font-semibold text-muted-foreground">{label}</p><strong className="mt-1 block font-display text-xl tracking-[-.03em]">{value}</strong></div></article>}
