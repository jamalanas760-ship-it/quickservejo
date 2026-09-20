import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock3, PackageCheck, Search, ShoppingCart, Truck, XCircle } from "lucide-react";
import { toast } from "sonner";

import type { RecordRequest } from "@/components/backoffice/RecordDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { BackOfficeData } from "@/hooks/useBackOffice";
import { backOfficeKey } from "@/hooks/useBackOffice";
import { humanError } from "@/lib/errors";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { receiveProcurementRequest, setProcurementStatus, type ProcurementRequest, type ProcurementStatus } from "@/lib/erp";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Filter = "all" | ProcurementStatus;

const STEPS: ProcurementStatus[] = ["requested", "approved", "ordered", "received"];

export function ProcurementPanel({
  restaurantId,
  data,
  currency,
  canApprove,
  canProcure,
  canReceive,
  onAction,
}: {
  restaurantId: string;
  data: BackOfficeData;
  currency: string;
  canApprove: boolean;
  canProcure: boolean;
  canReceive: boolean;
  onAction: (request: RecordRequest) => void;
}) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const qc = useQueryClient();
  const [term, setTerm] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [orderTarget, setOrderTarget] = useState<ProcurementRequest | null>(null);
  const [receiveTarget, setReceiveTarget] = useState<ProcurementRequest | null>(null);
  const [poRef, setPoRef] = useState("");
  const [receiveCost, setReceiveCost] = useState("");

  const rows = useMemo(() => {
    const q = term.trim().toLowerCase();
    return data.procurement.filter((row) => {
      if (filter !== "all" && row.status !== filter) return false;
      if (!q) return true;
      const supplier = data.suppliers.find((item) => item.id === row.supplier_id)?.name ?? "";
      return [row.item_name_snapshot, row.po_reference, row.notes, supplier, row.status]
        .some((value) => value.toLowerCase().includes(q));
    });
  }, [data.procurement, data.suppliers, filter, term]);

  const counts = {
    requested: data.procurement.filter((row) => row.status === "requested").length,
    approved: data.procurement.filter((row) => row.status === "approved").length,
    ordered: data.procurement.filter((row) => row.status === "ordered").length,
    received: data.procurement.filter((row) => row.status === "received").length,
  };

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: backOfficeKey(restaurantId) });
    await qc.invalidateQueries({ queryKey: ["platform", "erp-signals"] });
  };

  const statusMutation = useMutation({
    mutationFn: ({ id, status, poReference }: { id: string; status: "approved" | "rejected" | "ordered" | "cancelled"; poReference?: string }) =>
      setProcurementStatus(id, status, poReference),
    onSuccess: async (_data, variables) => {
      await refresh();
      toast.success(
        variables.status === "approved" ? (ar ? "تم اعتماد طلب الشراء" : "Procurement request approved")
        : variables.status === "ordered" ? (ar ? "تم تسجيل أمر الشراء" : "Purchase order recorded")
        : variables.status === "rejected" ? (ar ? "تم رفض الطلب" : "Request rejected")
        : (ar ? "تم إلغاء الطلب" : "Request cancelled"),
      );
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  const receiveMutation = useMutation({
    mutationFn: ({ id, unitCost }: { id: string; unitCost: number }) => receiveProcurementRequest(id, unitCost),
    onSuccess: async () => {
      await refresh();
      setReceiveTarget(null);
      setReceiveCost("");
      toast.success(ar ? "تم الاستلام وتحديث المخزون والمالية" : "Received — inventory and Finance were updated");
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  function submitOrder() {
    if (!orderTarget) return;
    const reference = poRef.trim();
    statusMutation.mutate(
      reference
        ? { id: orderTarget.id, status: "ordered", poReference: reference }
        : { id: orderTarget.id, status: "ordered" },
    );
    setOrderTarget(null);
    setPoRef("");
  }

  function submitReceive() {
    if (!receiveTarget) return;
    const cost = Number(receiveCost || receiveTarget.estimated_unit_cost);
    if (!(cost > 0)) {
      toast.error(ar ? "أدخل سعر وحدة صالح" : "Enter a valid unit cost");
      return;
    }
    receiveMutation.mutate({ id: receiveTarget.id, unitCost: cost });
  }

  return <section className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <ProcMetric icon={Clock3} label={ar ? "بانتظار الاعتماد" : "Awaiting approval"} value={counts.requested} tone="warning" />
      <ProcMetric icon={CheckCircle2} label={ar ? "معتمد" : "Approved"} value={counts.approved} />
      <ProcMetric icon={ShoppingCart} label={ar ? "تم الطلب" : "Ordered"} value={counts.ordered} />
      <ProcMetric icon={PackageCheck} label={ar ? "تم الاستلام" : "Received"} value={counts.received} tone="success" />
    </div>

    <div className="rounded-2xl border border-border bg-card">
      <div className="flex flex-col gap-3 border-b border-border p-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h3 className="font-display text-lg font-bold">{ar ? "مسار المشتريات" : "Procurement workflow"}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{ar ? "طلب ← اعتماد ← شراء ← استلام ← تسجيل مالي تلقائي" : "Request → Approval → Purchase → Receiving → automatic Finance posting"}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative sm:w-[230px]"><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={term} onChange={(event) => setTerm(event.target.value)} className="ps-9" placeholder={ar ? "بحث في الطلبات" : "Search requests"} /></div>
          <Select value={filter} onValueChange={(value) => setFilter(value as Filter)}><SelectTrigger className="sm:w-[160px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{ar ? "كل الحالات" : "All statuses"}</SelectItem>{(["requested","approved","ordered","received","rejected","cancelled"] as ProcurementStatus[]).map((status) => <SelectItem key={status} value={status}>{statusLabel(status, ar)}</SelectItem>)}</SelectContent></Select>
          {canProcure ? <Button onClick={() => onAction({ kind: "procurement" })}><ShoppingCart className="size-4" />{ar ? "طلب شراء جديد" : "New request"}</Button> : null}
        </div>
      </div>

      {rows.length === 0 ? <div className="grid min-h-[260px] place-items-center p-8 text-center"><div><ShoppingCart className="mx-auto size-9 text-muted-foreground" /><h4 className="mt-3 font-bold">{ar ? "لا توجد طلبات مطابقة" : "No procurement requests"}</h4><p className="mt-1 text-xs text-muted-foreground">{ar ? "أنشئ أول طلب شراء أو غيّر الفلاتر." : "Create the first request or adjust the filters."}</p></div></div> : <div className="divide-y divide-border">{rows.map((row) => {
        const supplier = data.suppliers.find((item) => item.id === row.supplier_id);
        const total = Number(row.quantity) * Number(row.actual_unit_cost ?? row.estimated_unit_cost);
        const overdue = Boolean(row.needed_by && row.needed_by < new Date().toLocaleDateString("en-CA") && !["received","rejected","cancelled"].includes(row.status));
        return <article key={row.id} className="p-4 sm:p-5">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(210px,.8fr)_minmax(180px,.65fr)_auto] xl:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><h4 className="font-bold">{row.item_name_snapshot}</h4><StatusBadge status={row.status} />{overdue ? <Badge variant="destructive">{ar ? "متأخر" : "Late"}</Badge> : null}</div>
              <p className="mt-1 text-xs text-muted-foreground">{formatNumber(Number(row.quantity), lang)} {row.unit} · {supplier?.name ?? (ar ? "المورد غير محدد" : "Supplier not selected")}</p>
              {row.notes ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{row.notes}</p> : null}
            </div>
            <WorkflowProgress status={row.status} ar={ar} />
            <div className="text-sm"><p className="text-[10px] font-bold uppercase tracking-[.08em] text-muted-foreground">{ar ? "القيمة" : "Value"}</p><strong className="mt-1 block">{formatMoney(total, currency, lang)}</strong>{row.needed_by ? <p className="mt-1 text-[10px] text-muted-foreground">{ar ? "مطلوب" : "Needed"} {formatDate(row.needed_by, lang)}</p> : null}{row.po_reference ? <p className="mt-1 text-[10px] text-muted-foreground">PO · {row.po_reference}</p> : null}</div>
            <div className="flex flex-wrap gap-2 xl:justify-end">
              {row.status === "requested" && canApprove ? <><Button size="sm" disabled={statusMutation.isPending} onClick={() => statusMutation.mutate({ id: row.id, status: "approved" })}>{ar ? "اعتماد" : "Approve"}</Button><Button size="sm" variant="outline" disabled={statusMutation.isPending} onClick={() => statusMutation.mutate({ id: row.id, status: "rejected" })}><XCircle className="size-4" />{ar ? "رفض" : "Reject"}</Button></> : null}
              {row.status === "approved" && canProcure ? <Button size="sm" onClick={() => { setOrderTarget(row); setPoRef(row.po_reference); }}><Truck className="size-4" />{ar ? "تم الشراء" : "Mark ordered"}</Button> : null}
              {(row.status === "ordered" || row.status === "approved") && canReceive ? <Button size="sm" variant="outline" onClick={() => { setReceiveTarget(row); setReceiveCost(String((row.actual_unit_cost ?? row.estimated_unit_cost) || "")); }}><PackageCheck className="size-4" />{ar ? "استلام" : "Receive"}</Button> : null}
              {["requested","approved","ordered"].includes(row.status) && canProcure ? <Button size="sm" variant="ghost" className="text-muted-foreground" disabled={statusMutation.isPending} onClick={() => statusMutation.mutate({ id: row.id, status: "cancelled" })}>{ar ? "إلغاء" : "Cancel"}</Button> : null}
            </div>
          </div>
        </article>;
      })}</div>}
    </div>

    <Dialog open={Boolean(orderTarget)} onOpenChange={(open) => { if (!open) setOrderTarget(null); }}>
      <DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>{ar ? "تسجيل أمر الشراء" : "Record purchase order"}</DialogTitle><DialogDescription>{ar ? "أضف مرجع أمر الشراء إن وجد. يمكن تركه فارغاً." : "Add the purchase order reference if available. It can be left blank."}</DialogDescription></DialogHeader><Input value={poRef} onChange={(event) => setPoRef(event.target.value)} placeholder="PO-2026-001" /><DialogFooter><Button variant="outline" onClick={() => setOrderTarget(null)}>{ar ? "إلغاء" : "Cancel"}</Button><Button disabled={statusMutation.isPending} onClick={submitOrder}>{ar ? "تأكيد الطلب" : "Confirm ordered"}</Button></DialogFooter></DialogContent>
    </Dialog>

    <Dialog open={Boolean(receiveTarget)} onOpenChange={(open) => { if (!open) setReceiveTarget(null); }}>
      <DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>{ar ? "استلام التوريد" : "Receive supply"}</DialogTitle><DialogDescription>{receiveTarget ? `${receiveTarget.item_name_snapshot} · ${receiveTarget.quantity} ${receiveTarget.unit}` : ""}</DialogDescription></DialogHeader><div className="space-y-2"><label className="text-xs font-bold text-muted-foreground">{ar ? "سعر الوحدة الفعلي" : "Actual unit cost"} ({currency})</label><Input type="number" min="0.001" step="0.001" value={receiveCost} onChange={(event) => setReceiveCost(event.target.value)} />{receiveTarget ? <p className="rounded-xl bg-muted/45 p-3 text-xs text-muted-foreground">{ar ? "الإجمالي الذي سيتم ترحيله للمالية:" : "Total that will post to Finance:"} <strong className="text-foreground">{formatMoney(Number(receiveTarget.quantity) * (Number(receiveCost) || 0), currency, lang)}</strong></p> : null}</div><DialogFooter><Button variant="outline" onClick={() => setReceiveTarget(null)}>{ar ? "إلغاء" : "Cancel"}</Button><Button disabled={receiveMutation.isPending} onClick={submitReceive}><PackageCheck className="size-4" />{ar ? "استلام وترحيل" : "Receive & post"}</Button></DialogFooter></DialogContent>
    </Dialog>
  </section>;
}

function ProcMetric({ icon: Icon, label, value, tone }: { icon: typeof Clock3; label: string; value: number; tone?: "warning" | "success" }) {
  return <article className="qs-stat flex min-h-[105px] items-center gap-4 p-4"><span className={cn("grid size-11 place-items-center rounded-2xl", tone === "warning" ? "bg-amber-500/10 text-amber-700" : tone === "success" ? "bg-emerald-500/10 text-emerald-700" : "bg-orange-500/10 text-[#ff5a0a]")}><Icon className="size-5" /></span><div><p className="text-[11px] font-semibold text-muted-foreground">{label}</p><strong className="mt-1 block font-display text-3xl tracking-[-.04em]">{value}</strong></div></article>;
}

function StatusBadge({ status }: { status: ProcurementStatus }) {
  const styles: Record<ProcurementStatus, string> = {
    requested: "border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-950/20",
    approved: "border-blue-200 bg-blue-50 text-blue-700 dark:bg-blue-950/20",
    ordered: "border-violet-200 bg-violet-50 text-violet-700 dark:bg-violet-950/20",
    received: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20",
    rejected: "border-red-200 bg-red-50 text-red-700 dark:bg-red-950/20",
    cancelled: "border-slate-200 bg-slate-50 text-slate-600 dark:bg-slate-900/30",
  };
  return <Badge variant="outline" className={cn("capitalize", styles[status])}>{status}</Badge>;
}

function WorkflowProgress({ status, ar }: { status: ProcurementStatus; ar: boolean }) {
  if (status === "rejected" || status === "cancelled") return <p className="text-xs font-semibold text-muted-foreground">{statusLabel(status, ar)}</p>;
  const index = STEPS.indexOf(status);
  return <div className="min-w-0"><div className="flex items-center gap-1">{STEPS.map((step, i) => <span key={step} className={cn("h-1.5 flex-1 rounded-full", i <= index ? "bg-[#ff5a0a]" : "bg-muted")} />)}</div><div className="mt-2 flex justify-between gap-1 text-[9px] font-semibold text-muted-foreground">{STEPS.map((step) => <span key={step}>{statusLabel(step, ar)}</span>)}</div></div>;
}

function statusLabel(status: ProcurementStatus, ar: boolean) {
  const labels: Record<ProcurementStatus, [string,string]> = {
    requested:["Requested","مطلوب"],
    approved:["Approved","معتمد"],
    rejected:["Rejected","مرفوض"],
    ordered:["Ordered","تم الطلب"],
    received:["Received","مستلم"],
    cancelled:["Cancelled","ملغي"],
  };
  return labels[status][ar ? 1 : 0];
}
