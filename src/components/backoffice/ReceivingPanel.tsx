import { useMemo } from "react";
import { CheckCircle2, CircleDollarSign, PackageCheck, ReceiptText, Truck } from "lucide-react";

import type { RecordRequest } from "@/components/backoffice/RecordDialog";
import { Button } from "@/components/ui/button";
import type { BackOfficeData } from "@/hooks/useBackOffice";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function ReceivingPanel({
  data,
  currency,
  onAction,
  onGoProcurement,
}: {
  data: BackOfficeData;
  currency: string;
  onAction: (request: RecordRequest) => void;
  onGoProcurement: () => void;
}) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const receipts = useMemo(
    () => data.movements.filter((row) => row.movement_type === "receipt" && Number(row.quantity) > 0),
    [data.movements],
  );
  const receiptValue = receipts.reduce((sum, row) => sum + Number(row.total_cost ?? Math.abs(Number(row.quantity)) * Number(row.unit_cost)), 0);
  const financePosted = receipts.filter((row) => Boolean(row.finance_expense_id)).length;
  const pendingProcurement = data.procurement.filter((row) => row.status === "approved" || row.status === "ordered");

  return <section className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <ReceiveMetric icon={PackageCheck} label={ar ? "عمليات استلام" : "Receipts"} value={formatNumber(receipts.length, lang)} />
      <ReceiveMetric icon={CircleDollarSign} label={ar ? "قيمة الاستلام" : "Receipt value"} value={formatMoney(receiptValue, currency, lang)} />
      <ReceiveMetric icon={CheckCircle2} label={ar ? "مرحّل للمالية" : "Posted to Finance"} value={formatNumber(financePosted, lang)} tone="success" />
      <ReceiveMetric icon={Truck} label={ar ? "بانتظار الاستلام" : "Awaiting receipt"} value={formatNumber(pendingProcurement.length, lang)} tone={pendingProcurement.length ? "warning" : undefined} />
    </div>

    {pendingProcurement.length ? <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900/60 dark:bg-amber-950/10">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold">{ar ? "توريدات جاهزة للاستلام" : "Supplies ready to receive"}</h3><p className="mt-1 text-xs text-muted-foreground">{ar ? "هذه الطلبات معتمدة أو تم طلبها من المورد." : "These procurement requests are approved or already ordered."}</p></div><Button variant="outline" onClick={onGoProcurement}>{ar ? "فتح المشتريات" : "Open procurement"}</Button></div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{pendingProcurement.slice(0,6).map((row) => <div key={row.id} className="rounded-xl border border-amber-200/70 bg-card p-3 dark:border-amber-900/40"><strong className="block truncate text-sm">{row.item_name_snapshot}</strong><p className="mt-1 text-xs text-muted-foreground">{formatNumber(Number(row.quantity),lang)} {row.unit} · {row.status}</p></div>)}</div>
    </section> : null}

    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <div><h3 className="font-display text-lg font-bold">{ar ? "سجل الاستلام" : "Receiving ledger"}</h3><p className="mt-1 text-xs text-muted-foreground">{ar ? "الكمية × السعر تظهر هنا، مع حالة الترحيل للمالية." : "Quantity × unit price is shown with the linked Finance posting status."}</p></div>
        <Button onClick={() => onAction({ kind: "receive" })}><PackageCheck className="size-4" />{ar ? "استلام توريد" : "Receive supplies"}</Button>
      </div>
      {!receipts.length ? <div className="grid min-h-[260px] place-items-center p-8 text-center"><div><ReceiptText className="mx-auto size-9 text-muted-foreground" /><h4 className="mt-3 font-bold">{ar ? "لا يوجد استلام مسجل" : "No receipts recorded"}</h4><p className="mt-1 text-xs text-muted-foreground">{ar ? "سجل أول استلام وسيظهر الترحيل المالي تلقائياً." : "Record the first receipt and its Finance posting will appear automatically."}</p></div></div> : <div className="divide-y divide-border">{receipts.map((row) => {
        const item=data.inventory.find((item)=>item.id===row.item_id);
        const supplier=data.suppliers.find((supplier)=>supplier.id===row.supplier_id);
        const total=Number(row.total_cost ?? Math.abs(Number(row.quantity))*Number(row.unit_cost));
        return <article key={row.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong className="truncate">{item?.name ?? row.item_id}</strong><span className={cn("rounded-full px-2 py-1 text-[10px] font-bold", row.finance_expense_id ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-700")}>{row.finance_expense_id ? (ar ? "مرحّل تلقائياً" : "AUTO posted") : (ar ? "بانتظار المالية" : "Finance pending")}</span></div><p className="mt-1 text-xs text-muted-foreground">{supplier?.name ?? (ar ? "بدون مورد" : "No supplier")} · {formatDateTime(row.created_at,lang)}</p><p className="mt-1 text-[10px] text-muted-foreground">{row.reason}</p></div>
          <div className="text-end text-xs"><p className="text-muted-foreground">{formatNumber(Number(row.quantity),lang)} × {formatMoney(Number(row.unit_cost),currency,lang)}</p><strong className="mt-1 block text-sm">{formatMoney(total,currency,lang)}</strong></div>
          <span className={cn("grid size-10 place-items-center rounded-xl",row.finance_expense_id?"bg-emerald-500/10 text-emerald-600":"bg-amber-500/10 text-amber-700")}>{row.finance_expense_id?<CheckCircle2 className="size-4"/>:<CircleDollarSign className="size-4"/>}</span>
        </article>;
      })}</div>}
    </section>
  </section>;
}

function ReceiveMetric({icon:Icon,label,value,tone}:{icon:typeof PackageCheck;label:string;value:string;tone?:"success"|"warning"|undefined}) {
  return <article className="qs-stat flex min-h-[105px] items-center gap-4 p-4"><span className={cn("grid size-11 place-items-center rounded-2xl",tone==="success"?"bg-emerald-500/10 text-emerald-700":tone==="warning"?"bg-amber-500/10 text-amber-700":"bg-orange-500/10 text-[#e85d2a]")}><Icon className="size-5"/></span><div><p className="text-[11px] font-semibold text-muted-foreground">{label}</p><strong className="mt-1 block font-display text-xl tracking-[-.03em]">{value}</strong></div></article>;
}
