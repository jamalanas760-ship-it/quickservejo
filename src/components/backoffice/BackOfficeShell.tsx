import { useState } from "react";
import { BarChart3, Coins, LayoutDashboard, Package, PackageCheck, ShoppingCart, Truck } from "lucide-react";

import { FinancePanel } from "@/components/backoffice/FinancePanel";
import { InventoryPanel } from "@/components/backoffice/InventoryPanel";
import { OverviewPanel } from "@/components/backoffice/OverviewPanel";
import { ProcurementPanel } from "@/components/backoffice/ProcurementPanel";
import { ReceivingPanel } from "@/components/backoffice/ReceivingPanel";
import { RecordDialog, type RecordRequest } from "@/components/backoffice/RecordDialog";
import { ReportsPanel } from "@/components/backoffice/ReportsPanel";
import { SuppliersPanel } from "@/components/backoffice/SuppliersPanel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { backOfficeSummary, useBackOffice, type BackOfficeAccess } from "@/hooks/useBackOffice";
import { useAccess } from "@/hooks/useSession";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { humanError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { membershipHasCapability } from "@/lib/permissions";
import { cn } from "@/lib/utils";

type SectionKey = "overview" | "inventory" | "receiving" | "procurement" | "suppliers" | "finance" | "reports";

type Section = {
  key: SectionKey;
  en: string;
  ar: string;
  icon: typeof Package;
  show: boolean;
};

export function BackOfficeShell({ restaurantId }: { restaurantId: string }) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const access = useAccess();
  const membership = access.membershipFor(restaurantId);
  const can = (capability: "view_erp" | "manage_inventory" | "manage_procurement" | "manage_finance" | "manage_restaurant") =>
    access.isSuperAdmin || Boolean(membership && membershipHasCapability(membership.role, membership.permission_overrides, capability));

  const moduleAccess: BackOfficeAccess = {
    inventory: can("manage_inventory"),
    procurement: can("manage_procurement"),
    finance: can("manage_finance"),
  };
  const canApproveProcurement = can("manage_restaurant");
  const allowed = access.isSuperAdmin || can("view_erp") || Object.values(moduleAccess).some(Boolean);
  const restaurant = useRestaurant(restaurantId);
  const query = useBackOffice(restaurantId, moduleAccess, allowed);
  const [section, setSection] = useState<SectionKey>("overview");
  const [request, setRequest] = useState<RecordRequest | null>(null);

  if (access.isPending) return <Skeleton className="h-96 rounded-2xl" />;
  if (!allowed) return <div role="alert" className="qs-card p-8 text-center"><Package className="mx-auto size-9 text-muted-foreground" /><h2 className="mt-3 font-bold">{ar ? "ERP غير متاح" : "ERP is not available"}</h2><p className="mt-2 text-sm text-muted-foreground">{ar ? "هذا الدور لا يملك صلاحية مساحة الإدارة الخلفية." : "This role does not have Back Office access."}</p></div>;

  const currency = restaurant.data?.currency ?? "JOD";
  const restaurantName = restaurant.data?.name ?? "";
  const data = query.data ?? { inventory: [], suppliers: [], movements: [], expenses: [], procurement: [] };
  const summary = backOfficeSummary(query.data);

  const sections: Section[] = [
    { key: "overview", en: "Overview", ar: "نظرة عامة", icon: LayoutDashboard, show: true },
    { key: "inventory", en: "Inventory", ar: "المخزون", icon: Package, show: moduleAccess.inventory },
    { key: "receiving", en: "Receiving", ar: "الاستلام", icon: PackageCheck, show: moduleAccess.inventory || moduleAccess.procurement },
    { key: "procurement", en: "Procurement", ar: "المشتريات", icon: ShoppingCart, show: moduleAccess.procurement || canApproveProcurement },
    { key: "suppliers", en: "Suppliers", ar: "الموردون", icon: Truck, show: moduleAccess.procurement || moduleAccess.inventory || moduleAccess.finance },
    { key: "finance", en: "Finance", ar: "المالية", icon: Coins, show: moduleAccess.finance },
    { key: "reports", en: "Reports", ar: "التقارير", icon: BarChart3, show: true },
  ].filter((item) => item.show);

  const safeSection = sections.some((item) => item.key === section) ? section : "overview";
  const attention = summary.lowStock.length + summary.pendingApproval + summary.pendingReceiving;

  return <section className="space-y-5">
    <section className="overflow-hidden rounded-[28px] border border-border bg-card shadow-sm">
      <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end sm:p-8">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-orange-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.16em] text-[#ff5a0a]"><LayoutDashboard className="size-3.5" />ERP · {ar ? "مركز العمليات" : "Operations command center"}</div>
          <h1 className="mt-4 font-display text-3xl font-bold tracking-[-.04em] sm:text-4xl">{ar ? "المخزون والمشتريات والمالية في مساحة واحدة" : "Inventory, purchasing and Finance in one workspace"}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{ar ? "كل حساب يرى الوحدات والإجراءات المرتبطة بمسؤوليته فقط، مع ربط الاستلام بالمخزون والمالية بدون إدخال مزدوج." : "Each account sees only the modules and actions tied to its responsibility, with receiving linked to inventory and Finance without double entry."}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {attention > 0 ? <span className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 text-xs font-bold text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/15"><span className="size-2 rounded-full bg-amber-500" />{attention} {ar ? "تحتاج انتباه" : "need attention"}</span> : <span className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/15"><span className="size-2 rounded-full bg-emerald-500" />{ar ? "لا توجد حالات حرجة" : "No critical items"}</span>}
        </div>
      </div>
    </section>

    <div className="grid gap-5 xl:grid-cols-[220px_minmax(0,1fr)]">
      <nav aria-label={ar ? "وحدات ERP" : "ERP modules"} className="self-start overflow-x-auto xl:sticky xl:top-24 xl:overflow-visible">
        <div className="flex min-w-max gap-1 rounded-2xl border border-border bg-card p-2 xl:min-w-0 xl:flex-col">
          {sections.map(({ key, en, ar: arLabel, icon: Icon }) => <button key={key} type="button" onClick={() => setSection(key)} aria-current={safeSection === key ? "page" : undefined} className={cn("flex min-h-11 items-center gap-3 rounded-xl px-3 text-start text-sm font-semibold transition xl:w-full", safeSection === key ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><Icon className="size-4 shrink-0" /><span>{ar ? arLabel : en}</span>{key === "procurement" && summary.pendingApproval > 0 ? <span className="ms-auto min-w-5 rounded-full bg-[#ff5a0a] px-1.5 py-0.5 text-center text-[9px] font-black text-white">{summary.pendingApproval}</span> : null}{key === "inventory" && summary.lowStock.length > 0 ? <span className="ms-auto min-w-5 rounded-full bg-red-500 px-1.5 py-0.5 text-center text-[9px] font-black text-white">{summary.lowStock.length}</span> : null}</button>)}
        </div>
      </nav>

      <div className="min-w-0">
        {query.isError ? <div role="alert" className="qs-card space-y-3 p-6"><p className="text-sm text-destructive">{humanError(query.error, lang)}</p><Button variant="outline" onClick={() => void query.refetch()}>{ar ? "إعادة المحاولة" : "Try again"}</Button></div>
        : query.isPending ? <div className="space-y-3"><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-72 rounded-2xl" /></div>
        : safeSection === "overview" ? <OverviewPanel data={data} summary={summary} access={moduleAccess} currency={currency} onAction={setRequest} onNavigate={setSection} canApproveProcurement={canApproveProcurement} />
        : safeSection === "inventory" ? <InventoryPanel data={data} currency={currency} onAction={setRequest} />
        : safeSection === "receiving" ? <ReceivingPanel data={data} currency={currency} onAction={setRequest} onGoProcurement={() => setSection("procurement")} />
        : safeSection === "procurement" ? <ProcurementPanel restaurantId={restaurantId} data={data} currency={currency} canApprove={canApproveProcurement} canProcure={moduleAccess.procurement || canApproveProcurement} canReceive={moduleAccess.inventory || moduleAccess.procurement || canApproveProcurement} onAction={setRequest} />
        : safeSection === "suppliers" ? <SuppliersPanel data={data} currency={currency} onAction={moduleAccess.procurement || canApproveProcurement ? setRequest : () => undefined} />
        : safeSection === "finance" ? <FinancePanel data={data} currency={currency} restaurantName={restaurantName} onAction={setRequest} />
        : <ReportsPanel data={data} access={moduleAccess} currency={currency} restaurantName={restaurantName} />}
      </div>
    </div>

    <RecordDialog restaurantId={restaurantId} request={request} onClose={() => setRequest(null)} inventory={data.inventory} suppliers={data.suppliers} currency={currency} />
  </section>;
}
