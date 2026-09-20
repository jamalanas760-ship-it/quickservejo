import { AlertTriangle, Coins, Package, PackageCheck, Receipt, ShoppingCart, Truck } from "lucide-react";

import type { RecordRequest } from "@/components/backoffice/RecordDialog";
import { Button } from "@/components/ui/button";
import type { BackOfficeAccess, BackOfficeData } from "@/hooks/useBackOffice";
import { backOfficeSummary } from "@/hooks/useBackOffice";
import { expenseCategoryLabel } from "@/lib/erp";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Summary = ReturnType<typeof backOfficeSummary>;
type NavTarget = "overview" | "inventory" | "receiving" | "procurement" | "suppliers" | "finance" | "reports";

export function OverviewPanel({
  data,
  summary,
  access,
  currency,
  onAction,
  onNavigate,
  canApproveProcurement,
}: {
  data: BackOfficeData;
  summary: Summary;
  access: BackOfficeAccess;
  currency: string;
  onAction: (request: RecordRequest) => void;
  onNavigate: (section: NavTarget) => void;
  canApproveProcurement: boolean;
}) {
  const { lang } = useI18n();
  const ar = lang === "ar";

  const receiptPendingFinance = data.movements.filter((row) => row.movement_type === "receipt" && !row.finance_expense_id).length;
  const activity = [
    ...data.procurement.slice(0, 12).map((row) => ({
      id: "p-" + row.id,
      at: row.updated_at,
      title: row.item_name_snapshot,
      detail: (ar ? "مشتريات" : "Procurement") + " · " + row.status,
      amount: formatMoney(Number(row.quantity) * Number(row.actual_unit_cost ?? row.estimated_unit_cost), currency, lang),
    })),
    ...data.movements.slice(0, 12).map((row) => ({
      id: "m-" + row.id,
      at: row.created_at,
      title: data.inventory.find((item) => item.id === row.item_id)?.name ?? (ar ? "حركة مخزون" : "Stock movement"),
      detail: row.reason,
      amount: (Number(row.quantity) > 0 ? "+" : "") + formatNumber(Number(row.quantity), lang),
    })),
    ...data.expenses.slice(0, 12).map((row) => ({
      id: "e-" + row.id,
      at: row.created_at,
      title: row.description,
      detail: expenseCategoryLabel(row.category, lang) + " · " + (row.source_type ? "AUTO" : "MANUAL"),
      amount: formatMoney(Number(row.amount), currency, lang),
    })),
  ].sort((a,b)=>b.at.localeCompare(a.at)).slice(0,8);

  const attention = [
    ...(access.inventory && summary.lowStock.length ? [{
      id:"low", icon:AlertTriangle, title: ar ? "مخزون منخفض" : "Low stock", detail: ar ? summary.lowStock.length + " مادة عند أو تحت حد إعادة الطلب" : summary.lowStock.length + " items are at or below reorder level", action:()=>onNavigate("inventory"), tone:"danger" as const,
    }] : []),
    ...((access.procurement || canApproveProcurement) && summary.pendingApproval ? [{
      id:"approval", icon:ShoppingCart, title: ar ? "طلبات شراء بانتظار الاعتماد" : "Procurement awaiting approval", detail: ar ? summary.pendingApproval + " طلب يحتاج قراراً" : summary.pendingApproval + " requests need a decision", action:()=>onNavigate("procurement"), tone:"warning" as const,
    }] : []),
    ...((access.procurement || access.inventory) && summary.pendingReceiving ? [{
      id:"receiving", icon:PackageCheck, title: ar ? "توريدات بانتظار الاستلام" : "Supplies waiting to be received", detail: ar ? summary.pendingReceiving + " طلب معتمد أو تم طلبه" : summary.pendingReceiving + " approved or ordered requests", action:()=>onNavigate("receiving"), tone:"warning" as const,
    }] : []),
    ...(access.finance && receiptPendingFinance ? [{
      id:"finance", icon:Coins, title: ar ? "استلام غير مرحّل للمالية" : "Receipt missing Finance posting", detail: ar ? receiptPendingFinance + " حركة استلام تحتاج مراجعة" : receiptPendingFinance + " receipt movements need review", action:()=>onNavigate("finance"), tone:"danger" as const,
    }] : []),
  ];

  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {access.inventory ? <OverviewKpi icon={Coins} label={ar ? "قيمة المخزون" : "Inventory value"} value={formatMoney(summary.valuation.value,currency,lang)} hint={summary.valuation.itemsWithoutCost ? (ar ? summary.valuation.itemsWithoutCost + " بدون تكلفة" : summary.valuation.itemsWithoutCost + " without cost") : (ar ? "حسب آخر سعر استلام" : "Latest receipt cost")} /> : null}
      {access.inventory ? <OverviewKpi icon={AlertTriangle} label={ar ? "مخزون منخفض" : "Low stock"} value={formatNumber(summary.lowStock.length,lang)} tone={summary.lowStock.length ? "danger" : undefined} /> : null}
      {access.procurement || canApproveProcurement ? <OverviewKpi icon={ShoppingCart} label={ar ? "طلبات شراء مفتوحة" : "Open procurement"} value={formatNumber(summary.pendingApproval+summary.pendingReceiving,lang)} hint={formatMoney(summary.openProcurementValue,currency,lang)} /> : null}
      {access.finance ? <OverviewKpi icon={Receipt} label={ar ? "مصروفات الشهر" : "Month expenses"} value={formatMoney(summary.monthTotal,currency,lang)} hint={formatNumber(summary.monthCount,lang) + " " + (ar ? "قيد" : "entries")} /> : null}
      {!access.inventory && !access.procurement && !access.finance ? <OverviewKpi icon={Package} label={ar ? "الوحدات" : "Modules"} value="ERP" /> : null}
    </div>

    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,.75fr)]">
      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-border p-5"><h3 className="font-display text-lg font-bold">{ar ? "تحتاج انتباه" : "Attention needed"}</h3><p className="mt-1 text-xs text-muted-foreground">{ar ? "الاستثناءات التي تستحق الإجراء الآن فقط." : "Only exceptions that need action now."}</p></div>
        {attention.length ? <div className="divide-y divide-border">{attention.map((item)=><button key={item.id} type="button" onClick={item.action} className="flex w-full items-center gap-3 p-4 text-start transition hover:bg-muted/30"><span className={cn("grid size-10 shrink-0 place-items-center rounded-xl",item.tone==="danger"?"bg-red-500/10 text-red-600":"bg-amber-500/10 text-amber-700")}><item.icon className="size-4"/></span><span className="min-w-0 flex-1"><strong className="block text-sm">{item.title}</strong><span className="mt-0.5 block text-xs text-muted-foreground">{item.detail}</span></span><span className="text-xs font-bold text-[#ff5a0a]">{ar ? "فتح" : "Open"}</span></button>)}</div> : <div className="grid min-h-[220px] place-items-center p-8 text-center"><div><PackageCheck className="mx-auto size-9 text-emerald-600"/><h4 className="mt-3 font-bold">{ar ? "كل شيء تحت السيطرة" : "Everything looks under control"}</h4><p className="mt-1 text-xs text-muted-foreground">{ar ? "لا توجد استثناءات تحتاج تدخلاً الآن." : "No operational exceptions need action right now."}</p></div></div>}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h3 className="font-display text-lg font-bold">{ar ? "إجراءات سريعة" : "Quick actions"}</h3><p className="mt-1 text-xs text-muted-foreground">{ar ? "اختصارات لأكثر الإجراءات استخداماً حسب صلاحياتك." : "Shortcuts to the actions allowed for your account."}</p>
        <div className="mt-4 grid gap-2">
          {access.inventory ? <Button variant="outline" className="justify-start" onClick={()=>onAction({kind:"receive"})}><PackageCheck className="size-4"/>{ar ? "استلام توريد" : "Receive supplies"}</Button> : null}
          {access.procurement ? <Button variant="outline" className="justify-start" onClick={()=>onAction({kind:"procurement"})}><ShoppingCart className="size-4"/>{ar ? "طلب شراء" : "Create procurement request"}</Button> : null}
          {access.finance ? <Button variant="outline" className="justify-start" onClick={()=>onAction({kind:"expense"})}><Receipt className="size-4"/>{ar ? "مصروف يدوي" : "Record manual expense"}</Button> : null}
          {access.procurement ? <Button variant="outline" className="justify-start" onClick={()=>onAction({kind:"supplier"})}><Truck className="size-4"/>{ar ? "إضافة مورد" : "Add supplier"}</Button> : null}
          {access.inventory ? <Button variant="outline" className="justify-start" onClick={()=>onAction({kind:"item"})}><Package className="size-4"/>{ar ? "إضافة مادة مخزون" : "Add inventory item"}</Button> : null}
        </div>
      </section>
    </div>

    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border p-5"><div><h3 className="font-display text-lg font-bold">{ar ? "آخر النشاطات" : "Recent activity"}</h3><p className="mt-1 text-xs text-muted-foreground">{ar ? "حركات مرتبطة بالمخزون والمشتريات والمالية." : "Recent inventory, procurement and Finance events."}</p></div><Button variant="ghost" size="sm" onClick={()=>onNavigate("reports")}>{ar ? "التقارير" : "Reports"}</Button></div>
      {activity.length ? <div className="divide-y divide-border">{activity.map((entry)=><div key={entry.id} className="flex items-start justify-between gap-4 p-4"><div className="min-w-0"><strong className="block truncate text-sm">{entry.title}</strong><p className="mt-1 truncate text-xs text-muted-foreground">{entry.detail}</p><time className="mt-1 block text-[10px] text-muted-foreground">{formatDateTime(entry.at,lang)}</time></div><span className="shrink-0 text-xs font-bold tabular-nums">{entry.amount}</span></div>)}</div> : <div className="p-8 text-center text-xs text-muted-foreground">{ar ? "لا يوجد نشاط مسجل بعد." : "No ERP activity recorded yet."}</div>}
    </section>
  </div>;
}

function OverviewKpi({icon:Icon,label,value,hint,tone}:{icon:typeof Coins;label:string;value:string;hint?:string;tone?:"danger"|undefined}) {
  return <article className="qs-stat min-h-[116px] p-4"><div className="flex items-center gap-2"><span className={cn("grid size-9 place-items-center rounded-xl",tone==="danger"?"bg-red-500/10 text-red-600":"bg-orange-500/10 text-[#ff5a0a]")}><Icon className="size-4"/></span><p className="text-[11px] font-semibold text-muted-foreground">{label}</p></div><strong className="mt-3 block font-display text-2xl tracking-[-.04em]">{value}</strong>{hint?<p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>:null}</article>;
}
