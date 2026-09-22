import { useMemo, useState } from "react";
import { Clock3, Plus, Search, Truck } from "lucide-react";

import type { RecordRequest } from "@/components/backoffice/RecordDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BackOfficeData } from "@/hooks/useBackOffice";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function SuppliersPanel({
  data,
  currency,
  onAction,
}: {
  data: BackOfficeData;
  currency: string;
  onAction: (request: RecordRequest) => void;
}) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const [term, setTerm] = useState("");

  const rows = useMemo(() => {
    const q = term.trim().toLowerCase();
    return data.suppliers
      .map((supplier) => {
        const receipts = data.movements.filter((row) => row.supplier_id === supplier.id && row.movement_type === "receipt");
        const openRequests = data.procurement.filter((row) => row.supplier_id === supplier.id && (row.status === "approved" || row.status === "ordered"));
        const late = openRequests.filter((row) => row.needed_by && row.needed_by < new Date().toLocaleDateString("en-CA")).length;
        const openValue = openRequests.reduce((sum, row) => sum + Number(row.quantity) * Number(row.estimated_unit_cost), 0);
        const latest = [...receipts].sort((a,b)=>b.created_at.localeCompare(a.created_at))[0] ?? null;
        return { supplier, receipts, openRequests, late, openValue, latest };
      })
      .filter((row) => !q || (row.supplier.name + " " + row.supplier.contact).toLowerCase().includes(q))
      .sort((a,b)=>b.late-a.late || b.openValue-a.openValue || a.supplier.name.localeCompare(b.supplier.name));
  }, [data.movements, data.procurement, data.suppliers, term]);

  return <section className="space-y-4">
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div><h3 className="font-display text-lg font-bold">{ar ? "الموردون" : "Suppliers"}</h3><p className="mt-1 text-xs text-muted-foreground">{ar ? "عرض المورد مع قيمة الطلبات المفتوحة وآخر توريد والحالات المتأخرة." : "See each supplier's open purchase value, latest delivery and overdue commitments."}</p></div>
      <div className="flex gap-2"><div className="relative min-w-0 sm:w-[240px]"><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><Input value={term} onChange={e=>setTerm(e.target.value)} className="ps-9" placeholder={ar ? "بحث عن مورد" : "Search suppliers"}/></div><Button onClick={()=>onAction({kind:"supplier"})}><Plus className="size-4"/>{ar ? "مورد" : "Supplier"}</Button></div>
    </div>

    {!rows.length ? <div className="grid min-h-[260px] place-items-center rounded-2xl border border-border bg-card p-8 text-center"><div><Truck className="mx-auto size-9 text-muted-foreground"/><h4 className="mt-3 font-bold">{ar ? "لا يوجد موردون" : "No suppliers yet"}</h4><p className="mt-1 text-xs text-muted-foreground">{ar ? "أضف مورداً لربطه بطلبات الشراء والاستلام." : "Add a supplier to connect procurement and receiving."}</p></div></div> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{rows.map(({supplier,receipts,openRequests,late,openValue,latest})=><article key={supplier.id} className={cn("rounded-2xl border bg-card p-5 transition hover:-translate-y-0.5 hover:shadow-sm",late?"border-amber-300 dark:border-amber-900/60":"border-border")}>
      <div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-orange-500/10 text-[#e85d2a]"><Truck className="size-5"/></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h4 className="truncate font-bold">{supplier.name}</h4>{late?<span className="rounded-full bg-amber-500/10 px-2 py-1 text-[9px] font-bold text-amber-700">{late} {ar ? "متأخر" : "late"}</span>:null}</div><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{supplier.contact||"—"}</p></div></div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs"><div className="rounded-xl bg-muted/45 p-3"><span className="text-muted-foreground">{ar ? "طلبات مفتوحة" : "Open POs"}</span><strong className="mt-1 block">{formatNumber(openRequests.length,lang)}</strong></div><div className="rounded-xl bg-muted/45 p-3"><span className="text-muted-foreground">{ar ? "القيمة المفتوحة" : "Open value"}</span><strong className="mt-1 block">{formatMoney(openValue,currency,lang)}</strong></div></div>
      <div className="mt-4 border-t border-border/70 pt-3"><div className="flex items-center justify-between gap-3 text-xs"><span className="text-muted-foreground">{ar ? "آخر توريد" : "Latest delivery"}</span><strong>{latest?formatDateTime(latest.created_at,lang):(ar?"لا يوجد":"None")}</strong></div><div className="mt-2 flex items-center justify-between gap-3 text-xs"><span className="text-muted-foreground">{ar ? "إجمالي التوريدات" : "Receipts"}</span><strong>{formatNumber(receipts.length,lang)}</strong></div>{late?<p className="mt-3 inline-flex items-center gap-1.5 text-[10px] font-semibold text-amber-700"><Clock3 className="size-3.5"/>{ar ? "يوجد طلب تجاوز تاريخ الحاجة." : "A request is past its needed-by date."}</p>:null}</div>
    </article>)}</div>}
  </section>;
}
