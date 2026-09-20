import { useMemo, useState } from "react";
import { CircleDollarSign, Download, Receipt, Search, Sparkles, UserRound } from "lucide-react";

import { DateRangePicker } from "@/components/common/DateRangePicker";
import type { RecordRequest } from "@/components/backoffice/RecordDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { BackOfficeData } from "@/hooks/useBackOffice";
import { downloadCsv, expenseCategoryLabel, EXPENSE_CATEGORIES, sumBy, type Expense } from "@/lib/erp";
import { formatDate, formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { dayKey, rangeFromPreset, type DateRange } from "@/lib/range";
import { cn } from "@/lib/utils";

type SourceFilter="all"|"auto"|"manual";

export function FinancePanel({data,currency,restaurantName,onAction}:{data:BackOfficeData;currency:string;restaurantName:string;onAction:(request:RecordRequest)=>void}) {
  const {lang}=useI18n(); const ar=lang==="ar";
  const [range,setRange]=useState<DateRange>(()=>rangeFromPreset("30d"));
  const [term,setTerm]=useState("");
  const [category,setCategory]=useState("all");
  const [source,setSource]=useState<SourceFilter>("all");
  const [selected,setSelected]=useState<Expense|null>(null);

  const rows=useMemo(()=>{
    const from=dayKey(range.from),to=dayKey(range.to),q=term.trim().toLowerCase();
    return data.expenses.filter(expense=>{
      if(expense.expense_date<from||expense.expense_date>=to)return false;
      if(category!=="all"&&expense.category!==category)return false;
      if(source==="auto"&&!expense.source_type)return false;
      if(source==="manual"&&expense.source_type)return false;
      if(q&&!(expense.description+" "+expense.reference+" "+expense.category).toLowerCase().includes(q))return false;
      return true;
    });
  },[category,data.expenses,range,source,term]);

  const total=sumBy(rows,row=>Number(row.amount));
  const autoRows=rows.filter(row=>Boolean(row.source_type));
  const manualRows=rows.filter(row=>!row.source_type);
  const today=new Date().toLocaleDateString("en-CA");
  const todayTotal=sumBy(data.expenses.filter(row=>row.expense_date===today),row=>Number(row.amount));

  function exportCsv(){
    downloadCsv((restaurantName||"restaurant")+"-expenses-"+dayKey(range.from)+".csv",["Date","Description","Category","Amount","Currency","Reference","Source"],rows.map(row=>[row.expense_date,row.description,row.category,Number(row.amount).toFixed(3),currency,row.reference,row.source_type?"AUTO":"MANUAL"]));
  }

  const selectedMovement=selected?.source_id?data.movements.find(row=>row.id===selected.source_id)??null:null;
  const selectedSupplier=selected?.supplier_id?data.suppliers.find(row=>row.id===selected.supplier_id)??null:null;
  const selectedItem=selectedMovement?data.inventory.find(row=>row.id===selectedMovement.item_id)??null:null;

  return <section className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <FinMetric icon={CircleDollarSign} label={ar?"مصروف اليوم":"Today expenses"} value={formatMoney(todayTotal,currency,lang)}/>
      <FinMetric icon={Receipt} label={ar?"مصروف الفترة":"Period expenses"} value={formatMoney(total,currency,lang)}/>
      <FinMetric icon={Sparkles} label={ar?"ترحيل تلقائي":"Automatic"} value={formatNumber(autoRows.length,lang)} hint={formatMoney(sumBy(autoRows,row=>Number(row.amount)),currency,lang)} tone="auto"/>
      <FinMetric icon={UserRound} label={ar?"إدخال يدوي":"Manual"} value={formatNumber(manualRows.length,lang)} hint={formatMoney(sumBy(manualRows,row=>Number(row.amount)),currency,lang)}/>
    </div>

    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between"><div><h3 className="font-display text-lg font-bold">{ar?"دفتر المصروفات":"Expense ledger"}</h3><p className="mt-1 text-xs text-muted-foreground">{ar?"يميز QuickServe بين المصروف الآلي الناتج عن الاستلام والمصروف اليدوي.":"QuickServe distinguishes automatic receiving costs from manually recorded expenses."}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={exportCsv} disabled={!rows.length}><Download className="size-4"/>{ar?"تصدير":"Export"}</Button><Button onClick={()=>onAction({kind:"expense"})}><Receipt className="size-4"/>{ar?"مصروف يدوي":"Manual expense"}</Button></div></div>
        <div className="mt-4 grid gap-2 lg:grid-cols-[auto_170px_140px_minmax(180px,1fr)]"><DateRangePicker value={range} onChange={setRange}/><Select value={category} onValueChange={setCategory}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">{ar?"كل الفئات":"All categories"}</SelectItem>{EXPENSE_CATEGORIES.map(entry=><SelectItem key={entry.value} value={entry.value}>{ar?entry.ar:entry.en}</SelectItem>)}</SelectContent></Select><Select value={source} onValueChange={value=>setSource(value as SourceFilter)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">{ar?"كل المصادر":"All sources"}</SelectItem><SelectItem value="auto">AUTO</SelectItem><SelectItem value="manual">MANUAL</SelectItem></SelectContent></Select><div className="relative"><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><Input value={term} onChange={event=>setTerm(event.target.value)} className="ps-9" placeholder={ar?"بحث في المصروفات":"Search expenses"}/></div></div>
      </div>

      {!rows.length?<div className="grid min-h-[260px] place-items-center p-8 text-center"><div><Receipt className="mx-auto size-9 text-muted-foreground"/><h4 className="mt-3 font-bold">{ar?"لا توجد مصروفات مطابقة":"No matching expenses"}</h4><p className="mt-1 text-xs text-muted-foreground">{ar?"غيّر الفترة أو الفلاتر.":"Adjust the date range or filters."}</p></div></div>:<div className="divide-y divide-border">{rows.map(expense=>{
        const automatic=Boolean(expense.source_type);
        const supplier=expense.supplier_id?data.suppliers.find(item=>item.id===expense.supplier_id):null;
        return <button key={expense.id} type="button" onClick={()=>setSelected(expense)} className="grid w-full gap-3 p-4 text-start transition hover:bg-muted/25 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong className="truncate text-sm">{expense.description}</strong><span className={cn("rounded-full px-2 py-1 text-[9px] font-black tracking-[.08em]",automatic?"bg-emerald-500/10 text-emerald-700":"bg-slate-500/10 text-slate-600")}>{automatic?"AUTO":"MANUAL"}</span></div><p className="mt-1 text-xs text-muted-foreground">{formatDate(expense.expense_date,lang)} · {expenseCategoryLabel(expense.category,lang)}{supplier?" · "+supplier.name:""}{expense.reference?" · "+expense.reference:""}</p></div><span className="text-xs text-muted-foreground">{automatic?(ar?"مرتبط بالمصدر":"Linked source"):(ar?"إدخال مستخدم":"User entry")}</span><strong className="text-sm tabular-nums">{formatMoney(Number(expense.amount),currency,lang)}</strong></button>;
      })}</div>}
    </section>

    <Sheet open={Boolean(selected)} onOpenChange={open=>{if(!open)setSelected(null)}}><SheetContent className="w-full overflow-y-auto sm:max-w-lg"><SheetHeader><SheetTitle>{selected?.description??""}</SheetTitle></SheetHeader>{selected?<div className="space-y-4 p-5"><div className="flex items-center justify-between rounded-2xl bg-muted/40 p-4"><div><p className="text-[10px] font-bold uppercase tracking-[.08em] text-muted-foreground">{ar?"المبلغ":"Amount"}</p><strong className="mt-1 block font-display text-2xl">{formatMoney(Number(selected.amount),currency,lang)}</strong></div><span className={cn("rounded-full px-3 py-1.5 text-[10px] font-black",selected.source_type?"bg-emerald-500/10 text-emerald-700":"bg-slate-500/10 text-slate-600")}>{selected.source_type?"AUTO":"MANUAL"}</span></div><Info label={ar?"التاريخ":"Date"} value={formatDate(selected.expense_date,lang)}/><Info label={ar?"الفئة":"Category"} value={expenseCategoryLabel(selected.category,lang)}/><Info label={ar?"المرجع":"Reference"} value={selected.reference||"—"}/><Info label={ar?"المورد":"Supplier"} value={selectedSupplier?.name||"—"}/><Info label={ar?"نوع المصدر":"Source type"} value={selected.source_type|| (ar?"يدوي":"Manual")}/>{selectedMovement?<div className="rounded-2xl border border-border p-4"><p className="text-xs font-bold">{ar?"مصدر الاستلام":"Receiving source"}</p><p className="mt-2 text-sm">{selectedItem?.name??selectedMovement.item_id}</p><p className="mt-1 text-xs text-muted-foreground">{formatNumber(Number(selectedMovement.quantity),lang)} × {formatMoney(Number(selectedMovement.unit_cost),currency,lang)} = {formatMoney(Number(selectedMovement.total_cost??0),currency,lang)}</p><p className="mt-1 text-xs text-muted-foreground">{selectedMovement.reason}</p><time className="mt-2 block text-[10px] text-muted-foreground">{formatDateTime(selectedMovement.created_at,lang)}</time></div>:null}</div>:null}</SheetContent></Sheet>
  </section>;
}

function FinMetric({icon:Icon,label,value,hint,tone}:{icon:typeof Receipt;label:string;value:string;hint?:string;tone?:"auto"|undefined}){return <article className="qs-stat min-h-[108px] p-4"><div className="flex items-center gap-2"><span className={cn("grid size-9 place-items-center rounded-xl",tone==="auto"?"bg-emerald-500/10 text-emerald-700":"bg-orange-500/10 text-[#ff5a0a]")}><Icon className="size-4"/></span><p className="text-[11px] font-semibold text-muted-foreground">{label}</p></div><strong className="mt-3 block font-display text-xl tracking-[-.03em]">{value}</strong>{hint?<p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>:null}</article>}
function Info({label,value}:{label:string;value:string}){return <div className="flex justify-between gap-4 border-b border-border/70 pb-3 text-sm"><span className="text-muted-foreground">{label}</span><strong className="text-end">{value}</strong></div>}
