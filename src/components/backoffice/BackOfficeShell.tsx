import { useState } from "react";
import { BarChart3, ChefHat, Coins, FileText, LayoutDashboard, MoreHorizontal, Package, PackageCheck, Printer, ShoppingCart, Truck } from "lucide-react";

import { MasterPageHeader } from "@/components/app/MasterPage";
import { FinancePanel } from "@/components/backoffice/FinancePanel";
import { KitchenConfigPanel } from "@/components/manage/KitchenConfigPanel";
import { InventoryPanel } from "@/components/backoffice/InventoryPanel";
import { InvoicesPanel } from "@/components/backoffice/InvoicesPanel";
import { OverviewPanel } from "@/components/backoffice/OverviewPanel";
import { ProcurementPanel } from "@/components/backoffice/ProcurementPanel";
import { RecipesPanel } from "@/components/backoffice/RecipesPanel";
import { ReceivingPanel } from "@/components/backoffice/ReceivingPanel";
import { RecordDialog, type RecordRequest } from "@/components/backoffice/RecordDialog";
import { ReportsPanel } from "@/components/backoffice/ReportsPanel";
import { SuppliersPanel } from "@/components/backoffice/SuppliersPanel";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { backOfficeSummary, useBackOffice, type BackOfficeAccess } from "@/hooks/useBackOffice";
import { useAccess } from "@/hooks/useSession";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { humanError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { membershipHasCapability } from "@/lib/permissions";
import { cn } from "@/lib/utils";

type SectionKey = "overview" | "kitchen" | "inventory" | "recipes" | "receiving" | "procurement" | "suppliers" | "invoices" | "finance" | "reports";

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

  const allSections: Section[] = [
    { key: "overview", en: "Overview", ar: "نظرة عامة", icon: LayoutDashboard, show: true },
    { key: "kitchen", en: "Kitchen Setup", ar: "إعداد المطبخ", icon: Printer, show: canApproveProcurement },
    { key: "inventory", en: "Inventory", ar: "المخزون", icon: Package, show: moduleAccess.inventory },
    { key: "recipes", en: "Recipes & Cost", ar: "الوصفات والتكلفة", icon: ChefHat, show: moduleAccess.inventory || canApproveProcurement },
    { key: "receiving", en: "Receiving", ar: "الاستلام", icon: PackageCheck, show: moduleAccess.inventory || moduleAccess.procurement },
    { key: "procurement", en: "Procurement", ar: "المشتريات", icon: ShoppingCart, show: moduleAccess.procurement || canApproveProcurement },
    { key: "suppliers", en: "Suppliers", ar: "الموردون", icon: Truck, show: moduleAccess.procurement || moduleAccess.inventory || moduleAccess.finance },
    { key: "invoices", en: "Supplier Invoices", ar: "فواتير الموردين", icon: FileText, show: moduleAccess.procurement || moduleAccess.finance || canApproveProcurement },
    { key: "finance", en: "Finance", ar: "المالية", icon: Coins, show: moduleAccess.finance },
    { key: "reports", en: "Reports", ar: "التقارير", icon: BarChart3, show: true },
  ];
  const sections = allSections.filter((item) => item.show);

  const safeSection = sections.some((item) => item.key === section) ? section : "overview";
  const attention = summary.lowStock.length + summary.pendingApproval + summary.pendingReceiving;
  const priorityKeys: SectionKey[] = ["overview", "inventory", "procurement", "finance", "reports"];
  const primarySections = priorityKeys.flatMap((key) => sections.find((item) => item.key === key) ?? []);
  const secondarySections = sections.filter((item) => !primarySections.some((primary) => primary.key === item.key));

  return <section className="qs-viewport-fill flex h-full min-h-0 flex-col gap-4">
    <MasterPageHeader
      title={ar ? "المخزون والمشتريات والمالية" : "Inventory, Purchasing & Finance"}
      description={ar ? "مساحة تشغيل موحدة للمخزون والاستلام والمشتريات والموردين والمالية والتقارير، مع صلاحيات حسب الدور." : "One operational workspace for inventory, receiving, procurement, suppliers, finance and reporting, scoped by role."}
      actions={attention > 0 ? <span className="qs-status border-amber-200 bg-amber-50 text-amber-700"><span className="size-1.5 rounded-full bg-amber-500" />{attention} {ar ? "تحتاج انتباه" : "need attention"}</span> : <span className="qs-status border-emerald-200 bg-emerald-50 text-emerald-700"><span className="size-1.5 rounded-full bg-emerald-500" />{ar ? "مستقر" : "All clear"}</span>}
    />

    <div className="qs-viewport-fill grid min-h-0 gap-4 xl:grid-cols-[196px_minmax(0,1fr)]">
      <nav aria-label={ar ? "وحدات ERP" : "ERP modules"} className="self-start overflow-x-auto xl:sticky xl:top-24 xl:overflow-visible">
        <div className="flex min-w-max gap-1 rounded-[12px] border border-border bg-card p-1.5 xl:min-w-0 xl:flex-col">
          {primarySections.map(({ key, en, ar: arLabel, icon: Icon }) => <button key={key} type="button" onClick={() => setSection(key)} aria-current={safeSection === key ? "page" : undefined} className={cn("flex min-h-11 items-center gap-2.5 rounded-[9px] px-3 text-start text-sm font-semibold transition xl:w-full", safeSection === key ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><Icon className="size-4 shrink-0" /><span>{ar ? arLabel : en}</span>{key === "procurement" && summary.pendingApproval > 0 ? <span className="ms-auto min-w-5 rounded-full bg-[#e85d2a] px-1.5 py-0.5 text-center text-[10px] font-bold text-white">{summary.pendingApproval}</span> : null}{key === "inventory" && summary.lowStock.length > 0 ? <span className="ms-auto min-w-5 rounded-full bg-red-500 px-1.5 py-0.5 text-center text-[10px] font-bold text-white">{summary.lowStock.length}</span> : null}</button>)}
          {secondarySections.length ? <DropdownMenu><DropdownMenuTrigger asChild><button type="button" aria-current={secondarySections.some((item) => item.key === safeSection) ? "page" : undefined} className={cn("flex min-h-11 items-center gap-2.5 rounded-[9px] px-3 text-start text-sm font-semibold transition xl:w-full", secondarySections.some((item) => item.key === safeSection) ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><MoreHorizontal className="size-4"/><span>{ar ? "المزيد" : "More"}</span><span className="ms-auto text-xs opacity-70">{secondarySections.length}</span></button></DropdownMenuTrigger><DropdownMenuContent align="start" className="min-w-60">{secondarySections.map(({key,en,ar:arLabel,icon:Icon}) => <DropdownMenuItem key={key} onSelect={() => setSection(key)}><Icon className="size-4"/>{ar ? arLabel : en}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu> : null}
        </div>
      </nav>

      <div className="qs-scroll-region min-h-0 min-w-0 xl:pe-1">
        {query.isError ? <div role="alert" className="qs-card space-y-3 p-6"><p className="text-sm text-destructive">{humanError(query.error, lang)}</p><Button variant="outline" onClick={() => void query.refetch()}>{ar ? "إعادة المحاولة" : "Try again"}</Button></div>
        : query.isPending ? <div className="space-y-3"><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-72 rounded-2xl" /></div>
        : safeSection === "overview" ? <OverviewPanel data={data} summary={summary} access={moduleAccess} currency={currency} onAction={setRequest} onNavigate={setSection} canApproveProcurement={canApproveProcurement} />
        : safeSection === "kitchen" ? <KitchenConfigPanel restaurantId={restaurantId} />
        : safeSection === "inventory" ? <InventoryPanel restaurantId={restaurantId} data={data} currency={currency} onAction={setRequest} />
        : safeSection === "recipes" ? <RecipesPanel restaurantId={restaurantId} data={data} currency={currency} />
        : safeSection === "receiving" ? <ReceivingPanel data={data} currency={currency} onAction={setRequest} onGoProcurement={() => setSection("procurement")} />
        : safeSection === "procurement" ? <ProcurementPanel restaurantId={restaurantId} data={data} currency={currency} canApprove={canApproveProcurement} canProcure={moduleAccess.procurement || canApproveProcurement} canReceive={moduleAccess.inventory || moduleAccess.procurement || canApproveProcurement} onAction={setRequest} />
        : safeSection === "suppliers" ? <SuppliersPanel data={data} currency={currency} onAction={moduleAccess.procurement || canApproveProcurement ? setRequest : () => undefined} />
        : safeSection === "invoices" ? <InvoicesPanel restaurantId={restaurantId} data={data} currency={currency} canFinance={moduleAccess.finance || canApproveProcurement} />
        : safeSection === "finance" ? <FinancePanel data={data} currency={currency} restaurantName={restaurantName} onAction={setRequest} />
        : <ReportsPanel data={data} access={moduleAccess} currency={currency} restaurantName={restaurantName} />}
      </div>
    </div>

    <RecordDialog restaurantId={restaurantId} request={request} onClose={() => setRequest(null)} inventory={data.inventory} suppliers={data.suppliers} currency={currency} />
  </section>;
}
