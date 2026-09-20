import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileText, Plus, ReceiptText, Search, WalletCards } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { BackOfficeData } from "@/hooks/useBackOffice";
import { supabase } from "@/integrations/supabase/client";
import { humanError } from "@/lib/errors";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type InvoiceStatus = "draft" | "matched" | "approved" | "paid" | "void";
type Invoice = {
  id: string;
  supplier_id: string | null;
  procurement_request_id: string | null;
  invoice_number: string;
  invoice_date: string;
  amount: number;
  tax_amount: number;
  status: InvoiceStatus;
  file_url: string | null;
  expense_id: string | null;
  created_at: string;
};

export function InvoicesPanel({ restaurantId, data, currency, canFinance }: { restaurantId: string; data: BackOfficeData; currency: string; canFinance: boolean }) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const qc = useQueryClient();
  const [term,setTerm]=useState("");
  const [status,setStatus]=useState<"all"|InvoiceStatus>("all");
  const [createOpen,setCreateOpen]=useState(false);
  const [supplier,setSupplier]=useState("");
  const [requestId,setRequestId]=useState("");
  const [number,setNumber]=useState("");
  const [date,setDate]=useState(new Date().toISOString().slice(0,10));
  const [amount,setAmount]=useState("");
  const [tax,setTax]=useState("0");

  const query=useQuery({
    queryKey:["erp","supplier-invoices",restaurantId],
    queryFn:async()=>{
      const {data:rows,error}=await (supabase as any).from("erp_supplier_invoices").select("id,supplier_id,procurement_request_id,invoice_number,invoice_date,amount,tax_amount,status,file_url,expense_id,created_at").eq("restaurant_id",restaurantId).order("invoice_date",{ascending:false}).limit(1000);
      if(error)throw error;
      return (rows??[]).map((row:any)=>({...row,amount:Number(row.amount??0),tax_amount:Number(row.tax_amount??0)})) as Invoice[];
    }
  });

  const rows=useMemo(()=>{
    const q=term.trim().toLowerCase();
    return (query.data??[]).filter(row=>{
      if(status!=="all"&&row.status!==status)return false;
      const supplierName=data.suppliers.find(s=>s.id===row.supplier_id)?.name??"";
      return !q||(row.invoice_number+" "+supplierName+" "+row.status).toLowerCase().includes(q);
    });
  },[data.suppliers,query.data,status,term]);

  const create=useMutation({
    mutationFn:async()=>{
      if(!number.trim())throw new Error(ar?"رقم الفاتورة مطلوب":"Invoice number is required");
      if(!(Number(amount)>=0))throw new Error(ar?"المبلغ غير صالح":"Invalid invoice amount");
      const {error}=await (supabase as any).from("erp_supplier_invoices").insert({
        restaurant_id:restaurantId,
        supplier_id:supplier||null,
        procurement_request_id:requestId||null,
        invoice_number:number.trim(),
        invoice_date:date,
        amount:Number(amount),
        tax_amount:Math.max(0,Number(tax||0)),
        status:requestId?"matched":"draft",
      });
      if(error)throw error;
    },
    onSuccess:async()=>{setCreateOpen(false);setNumber("");setAmount("");setTax("0");setSupplier("");setRequestId("");await qc.invalidateQueries({queryKey:["erp","supplier-invoices",restaurantId]});toast.success(ar?"تم تسجيل فاتورة المورد":"Supplier invoice recorded");},
    onError:error=>toast.error(humanError(error,lang))
  });

  const updateStatus=useMutation({
    mutationFn:async({id,next}:{id:string;next:InvoiceStatus})=>{
      const {error}=await (supabase as any).from("erp_supplier_invoices").update({status:next,updated_at:new Date().toISOString()}).eq("id",id);
      if(error)throw error;
    },
    onSuccess:async()=>{await qc.invalidateQueries({queryKey:["erp","supplier-invoices",restaurantId]});toast.success(ar?"تم تحديث الفاتورة":"Invoice updated");},
    onError:error=>toast.error(humanError(error,lang))
  });

  const totals={
    draft:(query.data??[]).filter(r=>r.status==="draft").length,
    matched:(query.data??[]).filter(r=>r.status==="matched").length,
    approved:(query.data??[]).filter(r=>r.status==="approved").length,
    unpaid:(query.data??[]).filter(r=>["draft","matched","approved"].includes(r.status)).reduce((s,r)=>s+r.amount+r.tax_amount,0),
  };

  return <section className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi icon={FileText} label={ar?"مسودة":"Draft"} value={formatNumber(totals.draft,lang)}/>
      <Kpi icon={ReceiptText} label={ar?"مطابقة":"Matched"} value={formatNumber(totals.matched,lang)}/>
      <Kpi icon={CheckCircle2} label={ar?"معتمدة":"Approved"} value={formatNumber(totals.approved,lang)}/>
      <Kpi icon={WalletCards} label={ar?"قيمة غير مدفوعة":"Open payable"} value={formatMoney(totals.unpaid,currency,lang)}/>
    </div>

    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-col gap-3 border-b border-border p-4 xl:flex-row xl:items-center xl:justify-between"><div><h3 className="font-display text-lg font-bold">{ar?"فواتير الموردين":"Supplier invoices"}</h3><p className="mt-1 text-xs text-muted-foreground">{ar?"اربط فاتورة المورد بطلب شراء ثم مرّرها للموافقة والدفع.":"Match supplier invoices to procurement, then move them through approval and payment."}</p></div><div className="flex flex-col gap-2 sm:flex-row"><div className="relative sm:w-[220px]"><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><Input value={term} onChange={e=>setTerm(e.target.value)} className="ps-9" placeholder={ar?"بحث":"Search invoices"}/></div><Select value={status} onValueChange={v=>setStatus(v as typeof status)}><SelectTrigger className="sm:w-[145px]"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">{ar?"كل الحالات":"All statuses"}</SelectItem>{(["draft","matched","approved","paid","void"] as InvoiceStatus[]).map(v=><SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select><Button onClick={()=>setCreateOpen(true)}><Plus className="size-4"/>{ar?"فاتورة":"Invoice"}</Button></div></div>
      {query.isPending?<div className="p-5"><Skeleton className="h-72 rounded-2xl"/></div>:query.isError?<p className="p-5 text-sm text-destructive">{humanError(query.error,lang)}</p>:!rows.length?<div className="grid min-h-[260px] place-items-center p-8 text-center"><div><FileText className="mx-auto size-9 text-muted-foreground"/><h4 className="mt-3 font-bold">{ar?"لا توجد فواتير موردين":"No supplier invoices"}</h4><p className="mt-1 text-xs text-muted-foreground">{ar?"أضف أول فاتورة وابدأ المطابقة مع المشتريات.":"Add the first invoice and match it to procurement."}</p></div></div>:<div className="divide-y divide-border">{rows.map(row=>{
        const supplierName=data.suppliers.find(s=>s.id===row.supplier_id)?.name??(ar?"بدون مورد":"No supplier");
        const request=data.procurement.find(p=>p.id===row.procurement_request_id);
        const total=row.amount+row.tax_amount;
        return <article key={row.id} className="grid gap-3 p-4 xl:grid-cols-[minmax(0,1.2fr)_auto_auto_auto] xl:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong>{row.invoice_number}</strong><Status status={row.status}/></div><p className="mt-1 text-xs text-muted-foreground">{supplierName} · {formatDate(row.invoice_date,lang)}</p>{request?<p className="mt-1 text-[10px] text-muted-foreground">PO · {request.item_name_snapshot} · {request.po_reference||request.id.slice(0,8)}</p>:null}</div><div className="text-xs"><span className="text-muted-foreground">{ar?"قبل الضريبة":"Net"}</span><strong className="ms-2">{formatMoney(row.amount,currency,lang)}</strong></div><div className="text-end"><strong className="block">{formatMoney(total,currency,lang)}</strong><span className="text-[10px] text-muted-foreground">{ar?"الإجمالي":"total"}</span></div><div className="flex flex-wrap justify-end gap-2">{row.status==="draft"?<Button size="sm" variant="outline" onClick={()=>updateStatus.mutate({id:row.id,next:"matched"})}>{ar?"تأكيد المطابقة":"Match"}</Button>:null}{row.status==="matched"&&canFinance?<Button size="sm" onClick={()=>updateStatus.mutate({id:row.id,next:"approved"})}>{ar?"اعتماد":"Approve"}</Button>:null}{row.status==="approved"&&canFinance?<Button size="sm" onClick={()=>updateStatus.mutate({id:row.id,next:"paid"})}>{ar?"تسجيل مدفوعة":"Mark paid"}</Button>:null}{row.status!=="paid"&&row.status!=="void"?<Button size="sm" variant="ghost" className="text-muted-foreground" onClick={()=>updateStatus.mutate({id:row.id,next:"void"})}>{ar?"إلغاء":"Void"}</Button>:null}</div></article>;
      })}</div>}
    </section>

    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>{ar?"فاتورة مورد جديدة":"New supplier invoice"}</DialogTitle><DialogDescription>{ar?"يمكن ربطها بطلب شراء لسهولة المطابقة والمراجعة.":"Optionally link it to a procurement request for easier matching and audit."}</DialogDescription></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><label className="space-y-1.5 text-sm"><span>{ar?"رقم الفاتورة":"Invoice number"}</span><Input value={number} onChange={e=>setNumber(e.target.value)} maxLength={120}/></label><label className="space-y-1.5 text-sm"><span>{ar?"التاريخ":"Date"}</span><Input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label className="space-y-1.5 text-sm"><span>{ar?"المورد":"Supplier"}</span><select value={supplier} onChange={e=>setSupplier(e.target.value)} className="h-11 w-full rounded-xl border border-input bg-background px-3"><option value="">{ar?"اختر المورد":"Choose supplier"}</option>{data.suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label className="space-y-1.5 text-sm"><span>{ar?"طلب الشراء":"Procurement request"}</span><select value={requestId} onChange={e=>{setRequestId(e.target.value);const req=data.procurement.find(p=>p.id===e.target.value);if(req){setSupplier(req.supplier_id??supplier);setAmount(String(Number(req.quantity)*Number(req.actual_unit_cost??req.estimated_unit_cost)))}}} className="h-11 w-full rounded-xl border border-input bg-background px-3"><option value="">{ar?"بدون ربط":"No link"}</option>{data.procurement.filter(p=>p.status==="received"||p.status==="ordered"||p.status==="approved").map(p=><option key={p.id} value={p.id}>{p.item_name_snapshot} · {p.po_reference||p.id.slice(0,8)}</option>)}</select></label><label className="space-y-1.5 text-sm"><span>{ar?"المبلغ قبل الضريبة":"Net amount"}</span><Input type="number" min="0" step=".001" value={amount} onChange={e=>setAmount(e.target.value)}/></label><label className="space-y-1.5 text-sm"><span>{ar?"الضريبة":"Tax"}</span><Input type="number" min="0" step=".001" value={tax} onChange={e=>setTax(e.target.value)}/></label></div><DialogFooter><Button variant="outline" onClick={()=>setCreateOpen(false)}>{ar?"إلغاء":"Cancel"}</Button><Button disabled={create.isPending||!number.trim()||amount===""} onClick={()=>create.mutate()}>{ar?"حفظ الفاتورة":"Save invoice"}</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}

function Kpi({icon:Icon,label,value}:{icon:typeof FileText;label:string;value:string}){return <article className="qs-stat flex min-h-[106px] items-center gap-4 p-4"><span className="grid size-11 place-items-center rounded-2xl bg-orange-500/10 text-[#ff5a0a]"><Icon className="size-5"/></span><div><p className="text-[11px] font-semibold text-muted-foreground">{label}</p><strong className="mt-1 block font-display text-xl tracking-[-.03em]">{value}</strong></div></article>}
function Status({status}:{status:InvoiceStatus}){return <span className={cn("rounded-full px-2 py-1 text-[9px] font-bold capitalize",status==="paid"?"bg-emerald-500/10 text-emerald-700":status==="approved"?"bg-blue-500/10 text-blue-700":status==="void"?"bg-slate-500/10 text-slate-600":status==="matched"?"bg-violet-500/10 text-violet-700":"bg-amber-500/10 text-amber-700")}>{status}</span>}
