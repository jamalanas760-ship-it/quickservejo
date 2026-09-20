import { useMemo, useState } from "react";
import { AlertTriangle, History, Package, PackageCheck, Plus, Search } from "lucide-react";

import type { RecordRequest } from "@/components/backoffice/RecordDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { BackOfficeData } from "@/hooks/useBackOffice";
import { isLowStock, stockValuation, type InventoryBalance } from "@/lib/erp";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Filter = "all" | "ok" | "low" | "out";
type Sort = "status" | "name" | "quantity" | "value";

function stateOf(item: InventoryBalance): Exclude<Filter,"all"> {
  if (Number(item.quantity) <= 0) return "out";
  return isLowStock(item) ? "low" : "ok";
}

export function InventoryPanel({data,currency,onAction}:{data:BackOfficeData;currency:string;onAction:(request:RecordRequest)=>void}) {
  const {lang}=useI18n(); const ar=lang==="ar";
  const [term,setTerm]=useState("");
  const [filter,setFilter]=useState<Filter>("all");
  const [sort,setSort]=useState<Sort>("status");
  const [historyItem,setHistoryItem]=useState<InventoryBalance|null>(null);

  const latestCost=useMemo(()=>{
    const map=new Map<string,number>();
    for(const movement of [...data.movements].sort((a,b)=>b.created_at.localeCompare(a.created_at))){
      const cost=Number(movement.unit_cost);
      if(cost>0&&!map.has(movement.item_id)) map.set(movement.item_id,cost);
    }
    return map;
  },[data.movements]);

  const rows=useMemo(()=>{
    const q=term.trim().toLowerCase();
    const rank={out:0,low:1,ok:2};
    return data.inventory.filter(item=>{
      if(q&&!item.name.toLowerCase().includes(q)) return false;
      return filter==="all"||stateOf(item)===filter;
    }).sort((a,b)=>{
      if(sort==="name") return a.name.localeCompare(b.name);
      if(sort==="quantity") return Number(b.quantity)-Number(a.quantity);
      if(sort==="value") return Number(b.quantity)*(latestCost.get(b.id)??0)-Number(a.quantity)*(latestCost.get(a.id)??0);
      return rank[stateOf(a)]-rank[stateOf(b)]||a.name.localeCompare(b.name);
    });
  },[data.inventory,filter,latestCost,sort,term]);

  const valuation=stockValuation(data.inventory,data.movements);
  const low=data.inventory.filter(item=>stateOf(item)==="low").length;
  const out=data.inventory.filter(item=>stateOf(item)==="out").length;
  const history=historyItem?data.movements.filter(row=>row.item_id===historyItem.id):[];

  return <section className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <InvMetric icon={Package} label={ar?"مواد المخزون":"Inventory items"} value={formatNumber(data.inventory.length,lang)} />
      <InvMetric icon={AlertTriangle} label={ar?"منخفض":"Low stock"} value={formatNumber(low,lang)} tone={low?"warning":undefined}/>
      <InvMetric icon={AlertTriangle} label={ar?"نفد":"Out of stock"} value={formatNumber(out,lang)} tone={out?"danger":undefined}/>
      <InvMetric icon={PackageCheck} label={ar?"قيمة المخزون":"Inventory value"} value={formatMoney(valuation.value,currency,lang)} />
    </div>

    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-col gap-3 border-b border-border p-4 xl:flex-row xl:items-center xl:justify-between">
        <div><h3 className="font-display text-lg font-bold">{ar?"مراقبة المخزون":"Inventory control"}</h3><p className="mt-1 text-xs text-muted-foreground">{ar?"الكمية، حد إعادة الطلب، آخر تكلفة وقيمة المخزون في عرض واحد.":"Quantity, reorder point, latest unit cost and stock value in one view."}</p></div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative sm:w-[220px]"><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><Input value={term} onChange={e=>setTerm(e.target.value)} className="ps-9" placeholder={ar?"بحث عن مادة":"Search inventory"}/></div>
          <Select value={filter} onValueChange={v=>setFilter(v as Filter)}><SelectTrigger className="sm:w-[140px]"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">{ar?"كل الحالات":"All status"}</SelectItem><SelectItem value="ok">{ar?"طبيعي":"Healthy"}</SelectItem><SelectItem value="low">{ar?"منخفض":"Low"}</SelectItem><SelectItem value="out">{ar?"نفد":"Out"}</SelectItem></SelectContent></Select>
          <Select value={sort} onValueChange={v=>setSort(v as Sort)}><SelectTrigger className="sm:w-[135px]"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="status">{ar?"الحالة":"Status"}</SelectItem><SelectItem value="name">{ar?"الاسم":"Name"}</SelectItem><SelectItem value="quantity">{ar?"الكمية":"Quantity"}</SelectItem><SelectItem value="value">{ar?"القيمة":"Value"}</SelectItem></SelectContent></Select>
          <Button variant="outline" onClick={()=>onAction({kind:"item"})}><Plus className="size-4"/>{ar?"مادة":"Item"}</Button>
          <Button onClick={()=>onAction({kind:"receive"})}><PackageCheck className="size-4"/>{ar?"استلام":"Receive"}</Button>
        </div>
      </div>

      {!rows.length?<div className="grid min-h-[260px] place-items-center p-8 text-center"><div><Package className="mx-auto size-9 text-muted-foreground"/><h4 className="mt-3 font-bold">{ar?"لا توجد مواد مطابقة":"No matching inventory"}</h4><p className="mt-1 text-xs text-muted-foreground">{ar?"أضف مادة أو غيّر الفلاتر.":"Add an item or adjust the filters."}</p></div></div>:<>
        <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[900px] text-sm"><thead className="bg-muted/45 text-xs text-muted-foreground"><tr><th className="px-4 py-3 text-start">{ar?"المادة":"Item"}</th><th className="px-4 py-3 text-start">{ar?"الحالة":"Status"}</th><th className="px-4 py-3 text-end">{ar?"المتاح":"On hand"}</th><th className="px-4 py-3 text-end">{ar?"إعادة الطلب":"Reorder"}</th><th className="px-4 py-3 text-end">{ar?"تكلفة الوحدة":"Unit cost"}</th><th className="px-4 py-3 text-end">{ar?"قيمة المخزون":"Stock value"}</th><th className="px-4 py-3 text-end">{ar?"إجراءات":"Actions"}</th></tr></thead><tbody className="divide-y divide-border">{rows.map(item=>{const cost=latestCost.get(item.id)??0;const value=Number(item.quantity)*cost;return <tr key={item.id} className="transition hover:bg-muted/20"><td className="px-4 py-4"><strong>{item.name}</strong><span className="ms-2 text-xs text-muted-foreground">{item.unit}</span></td><td className="px-4 py-4"><StockBadge state={stateOf(item)} ar={ar}/></td><td className="px-4 py-4 text-end font-semibold tabular-nums">{formatNumber(Number(item.quantity),lang)} {item.unit}</td><td className="px-4 py-4 text-end text-muted-foreground tabular-nums">{formatNumber(Number(item.reorder_level),lang)}</td><td className="px-4 py-4 text-end tabular-nums">{cost?formatMoney(cost,currency,lang):"—"}</td><td className="px-4 py-4 text-end font-semibold tabular-nums">{cost?formatMoney(value,currency,lang):"—"}</td><td className="px-4 py-4"><div className="flex justify-end gap-1.5"><Button size="sm" onClick={()=>onAction({kind:"receive",itemId:item.id})}>{ar?"استلام":"Receive"}</Button><Button size="sm" variant="outline" disabled={Number(item.quantity)<=0} onClick={()=>onAction({kind:"issue",itemId:item.id})}>{ar?"صرف":"Issue"}</Button><Button size="icon" variant="ghost" onClick={()=>setHistoryItem(item)}><History className="size-4"/></Button></div></td></tr>})}</tbody></table></div>
        <div className="space-y-2 p-3 md:hidden">{rows.map(item=>{const cost=latestCost.get(item.id)??0;return <article key={item.id} className="rounded-xl border border-border p-3"><div className="flex items-start justify-between gap-3"><div><strong className="block">{item.name}</strong><p className="mt-1 text-xs text-muted-foreground">{formatNumber(Number(item.quantity),lang)} {item.unit} · {ar?"حد":"reorder"} {formatNumber(Number(item.reorder_level),lang)}</p></div><StockBadge state={stateOf(item)} ar={ar}/></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div className="rounded-lg bg-muted/45 p-2"><span className="text-muted-foreground">{ar?"تكلفة الوحدة":"Unit cost"}</span><strong className="mt-1 block">{cost?formatMoney(cost,currency,lang):"—"}</strong></div><div className="rounded-lg bg-muted/45 p-2"><span className="text-muted-foreground">{ar?"القيمة":"Value"}</span><strong className="mt-1 block">{cost?formatMoney(cost*Number(item.quantity),currency,lang):"—"}</strong></div></div><div className="mt-3 grid grid-cols-3 gap-2"><Button size="sm" onClick={()=>onAction({kind:"receive",itemId:item.id})}>{ar?"استلام":"Receive"}</Button><Button size="sm" variant="outline" disabled={Number(item.quantity)<=0} onClick={()=>onAction({kind:"issue",itemId:item.id})}>{ar?"صرف":"Issue"}</Button><Button size="sm" variant="ghost" onClick={()=>setHistoryItem(item)}><History className="size-4"/></Button></div></article>})}</div>
      </>}
    </section>

    <Sheet open={Boolean(historyItem)} onOpenChange={open=>{if(!open)setHistoryItem(null)}}><SheetContent className="w-full overflow-y-auto sm:max-w-lg"><SheetHeader><SheetTitle>{historyItem?.name ?? ""}</SheetTitle></SheetHeader><div className="p-5"><div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-muted/45 p-3"><p className="text-[10px] text-muted-foreground">{ar?"المتاح":"On hand"}</p><strong className="mt-1 block">{historyItem?formatNumber(Number(historyItem.quantity),lang):"—"} {historyItem?.unit}</strong></div><div className="rounded-xl bg-muted/45 p-3"><p className="text-[10px] text-muted-foreground">{ar?"آخر تكلفة":"Latest cost"}</p><strong className="mt-1 block">{historyItem&&latestCost.get(historyItem.id)?formatMoney(latestCost.get(historyItem.id)!,currency,lang):"—"}</strong></div></div><h4 className="mt-5 text-xs font-bold uppercase tracking-[.08em] text-muted-foreground">{ar?"سجل الحركة":"Movement history"}</h4><div className="mt-2 divide-y divide-border">{history.length?history.map(row=><div key={row.id} className="py-3"><div className="flex justify-between gap-3"><strong className={cn("text-sm",Number(row.quantity)>0?"text-emerald-700":"text-foreground")}>{Number(row.quantity)>0?"+":""}{formatNumber(Number(row.quantity),lang)} {historyItem?.unit}</strong><span className="text-xs">{formatMoney(Number(row.total_cost??Math.abs(Number(row.quantity))*Number(row.unit_cost)),currency,lang)}</span></div><p className="mt-1 text-xs text-muted-foreground">{row.reason}</p><time className="mt-1 block text-[10px] text-muted-foreground">{formatDateTime(row.created_at,lang)}</time></div>):<p className="py-6 text-xs text-muted-foreground">{ar?"لا توجد حركة بعد.":"No movement yet."}</p>}</div></div></SheetContent></Sheet>
  </section>;
}

function InvMetric({icon:Icon,label,value,tone}:{icon:typeof Package;label:string;value:string;tone?:"warning"|"danger"|undefined}){return <article className="qs-stat flex min-h-[104px] items-center gap-4 p-4"><span className={cn("grid size-11 place-items-center rounded-2xl",tone==="danger"?"bg-red-500/10 text-red-600":tone==="warning"?"bg-amber-500/10 text-amber-700":"bg-orange-500/10 text-[#ff5a0a]")}><Icon className="size-5"/></span><div><p className="text-[11px] font-semibold text-muted-foreground">{label}</p><strong className="mt-1 block font-display text-xl tracking-[-.03em]">{value}</strong></div></article>}
function StockBadge({state,ar}:{state:"ok"|"low"|"out";ar:boolean}){return <Badge variant="outline" className={cn(state==="out"?"border-red-200 bg-red-50 text-red-700 dark:bg-red-950/20":state==="low"?"border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-950/20":"border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20")}>{state==="out"?(ar?"نفد":"Out"):state==="low"?(ar?"منخفض":"Low"):(ar?"طبيعي":"Healthy")}</Badge>}
