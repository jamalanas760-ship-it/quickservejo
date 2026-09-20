import { BarChart3, Coins, Download, Package, ShoppingCart, TrendingDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { backOfficeSummary, type BackOfficeAccess, type BackOfficeData } from "@/hooks/useBackOffice";
import { downloadCsv, expenseCategoryLabel } from "@/lib/erp";
import { formatMoney, formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

export function ReportsPanel({
  data,
  access,
  currency,
  restaurantName,
}: {
  data: BackOfficeData;
  access: BackOfficeAccess;
  currency: string;
  restaurantName: string;
}) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const summary = backOfficeSummary(data);

  const procStatus = ["requested","approved","ordered","received","rejected","cancelled"].map((status) => ({
    status,
    count: data.procurement.filter((row) => row.status === status).length,
  }));

  function exportSnapshot() {
    const rows: (string | number)[][] = [
      ["Inventory items", summary.itemCount],
      ["Low stock", summary.lowStock.length],
      ["Inventory value", summary.valuation.value.toFixed(3)],
      ["Suppliers", summary.supplierCount],
      ["Pending approval", summary.pendingApproval],
      ["Pending receiving", summary.pendingReceiving],
      ["Open procurement value", summary.openProcurementValue.toFixed(3)],
      ["Month expenses", summary.monthTotal.toFixed(3)],
      ["Month expense count", summary.monthCount],
    ];
    downloadCsv(
      `${restaurantName || "restaurant"}-erp-snapshot.csv`,
      ["Metric", "Value"],
      rows,
    );
  }

  return <section className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
      <div><h3 className="font-display text-lg font-bold">{ar ? "تقارير ERP" : "ERP reports"}</h3><p className="mt-1 text-xs text-muted-foreground">{ar ? "ملخص حي مبني على بيانات المخزون والمشتريات والمالية الفعلية." : "A live operational snapshot built from actual inventory, procurement and Finance data."}</p></div>
      <Button variant="outline" onClick={exportSnapshot}><Download className="size-4" />{ar ? "تصدير الملخص" : "Export snapshot"}</Button>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {access.inventory ? <ReportKpi icon={Package} label={ar ? "قيمة المخزون" : "Inventory value"} value={formatMoney(summary.valuation.value,currency,lang)} /> : null}
      {access.procurement ? <ReportKpi icon={ShoppingCart} label={ar ? "قيمة مشتريات مفتوحة" : "Open procurement"} value={formatMoney(summary.openProcurementValue,currency,lang)} /> : null}
      {access.finance ? <ReportKpi icon={Coins} label={ar ? "مصروفات الشهر" : "Month expenses"} value={formatMoney(summary.monthTotal,currency,lang)} /> : null}
      <ReportKpi icon={BarChart3} label={ar ? "حالات تحتاج انتباه" : "Attention items"} value={formatNumber(summary.lowStock.length + summary.pendingApproval + summary.pendingReceiving,lang)} />
    </div>

    <div className="grid gap-4 xl:grid-cols-2">
      {access.procurement ? <section className="rounded-2xl border border-border bg-card p-5"><h4 className="font-bold">{ar ? "مسار المشتريات" : "Procurement status"}</h4><div className="mt-4 space-y-3">{procStatus.map((entry) => {
        const total=Math.max(1,data.procurement.length);
        const share=Math.round(entry.count/total*100);
        return <div key={entry.status}><div className="flex items-center justify-between gap-3 text-xs"><span className="capitalize">{entry.status}</span><strong>{formatNumber(entry.count,lang)}</strong></div><div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[#ff5a0a]" style={{width:`${share}%`}}/></div></div>;
      })}</div></section> : null}

      {access.finance ? <section className="rounded-2xl border border-border bg-card p-5"><div className="flex items-center gap-2"><TrendingDown className="size-4 text-muted-foreground"/><h4 className="font-bold">{ar ? "المصروف حسب الفئة" : "Spend by category"}</h4></div>{summary.monthByCategory.length ? <div className="mt-4 space-y-3">{summary.monthByCategory.map(([category,amount])=>{
        const share=summary.monthTotal>0?Math.round(amount/summary.monthTotal*100):0;
        return <div key={category}><div className="flex items-center justify-between gap-3 text-xs"><span>{expenseCategoryLabel(category,lang)}</span><strong>{formatMoney(amount,currency,lang)}</strong></div><div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-foreground" style={{width:`${share}%`}}/></div></div>;
      })}</div>:<p className="mt-4 text-xs text-muted-foreground">{ar?"لا توجد مصروفات في هذا الشهر.":"No expenses recorded this month."}</p>}</section> : null}
    </div>

    {access.inventory ? <section className="rounded-2xl border border-border bg-card p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h4 className="font-bold">{ar ? "صحة المخزون" : "Inventory health"}</h4><p className="mt-1 text-xs text-muted-foreground">{ar ? "المواد الأقل من حد إعادة الطلب تظهر أولاً." : "Items at or below reorder level are surfaced first."}</p></div><span className="rounded-full bg-muted px-3 py-1 text-[10px] font-bold text-muted-foreground">{formatNumber(summary.lowStock.length,lang)} {ar?"منخفض":"low"}</span></div>{summary.lowStock.length?<div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{summary.lowStock.slice(0,9).map((item)=><div key={item.id} className="rounded-xl border border-border p-3"><strong className="block truncate text-sm">{item.name}</strong><p className="mt-1 text-xs text-muted-foreground">{formatNumber(Number(item.quantity),lang)} {item.unit} · {ar?"حد":"reorder"} {formatNumber(Number(item.reorder_level),lang)}</p></div>)}</div>:<p className="mt-4 text-xs text-muted-foreground">{ar?"كل المواد فوق حد إعادة الطلب.":"All inventory items are above reorder level."}</p>}</section>:null}
  </section>;
}

function ReportKpi({icon:Icon,label,value}:{icon:typeof Package;label:string;value:string}) {
  return <article className="qs-stat min-h-[112px] p-4"><div className="flex items-center gap-2 text-muted-foreground"><Icon className="size-4"/><p className="text-[11px] font-semibold">{label}</p></div><strong className="mt-3 block font-display text-2xl tracking-[-.04em]">{value}</strong></article>;
}
