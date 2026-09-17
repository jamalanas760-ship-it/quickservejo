import { useState } from "react";
import { BarChart3, ChefHat, Coins, LayoutDashboard, Package, ShoppingCart, Truck } from "lucide-react";

import { FinancePanel } from "@/components/backoffice/FinancePanel";
import { InventoryPanel } from "@/components/backoffice/InventoryPanel";
import { OverviewPanel } from "@/components/backoffice/OverviewPanel";
import { RecordDialog, type RecordRequest } from "@/components/backoffice/RecordDialog";
import { SuppliersPanel } from "@/components/backoffice/SuppliersPanel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { backOfficeSummary, useBackOffice } from "@/hooks/useBackOffice";
import { useAccess } from "@/hooks/useSession";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { humanError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { membershipHasCapability } from "@/lib/permissions";
import { cn } from "@/lib/utils";

type SectionKey = "overview" | "inventory" | "suppliers" | "finance";
const UPCOMING: { labelKey: string; icon: typeof Package }[] = [
  { labelKey: "bo.nav.purchasing", icon: ShoppingCart },
  { labelKey: "bo.nav.recipes", icon: ChefHat },
  { labelKey: "bo.nav.reports", icon: BarChart3 },
];

/** Back Office workspace: each ERP module is exposed only to the job profile responsible for it. */
export function BackOfficeShell({ restaurantId }: { restaurantId: string }) {
  const { t, lang } = useI18n();
  const access = useAccess();
  const membership = access.membershipFor(restaurantId);
  const can = (capability: "view_erp" | "manage_inventory" | "manage_procurement" | "manage_finance") =>
    access.isSuperAdmin || Boolean(membership && membershipHasCapability(membership.role, membership.permission_overrides, capability));
  const moduleAccess = {
    inventory: can("manage_inventory"),
    procurement: can("manage_procurement"),
    finance: can("manage_finance"),
  };
  const allowed = access.isSuperAdmin || can("view_erp") || Object.values(moduleAccess).some(Boolean);
  const restaurant = useRestaurant(restaurantId);
  const query = useBackOffice(restaurantId, moduleAccess, allowed);
  const [section, setSection] = useState<SectionKey>("overview");
  const [request, setRequest] = useState<RecordRequest | null>(null);

  if (access.isPending) return <Skeleton className="h-96 rounded-2xl" />;
  if (!allowed)
    return (
      <div role="alert" className="panel p-8 text-center text-sm text-muted-foreground">
        {lang === "ar" ? "لا يملك هذا الدور صلاحية الوصول إلى ERP." : "This job profile does not have ERP access."}
      </div>
    );

  const currency = restaurant.data?.currency ?? "JOD";
  const restaurantName = restaurant.data?.name ?? "";
  const data = query.data ?? { inventory: [], suppliers: [], movements: [], expenses: [] };
  const summary = backOfficeSummary(query.data);
  const sections: Array<{ key: SectionKey; labelKey: string; icon: typeof Package }> = [
    { key: "overview", labelKey: "bo.nav.overview", icon: LayoutDashboard },
    ...(moduleAccess.inventory ? [{ key: "inventory" as const, labelKey: "bo.nav.inventory", icon: Package }] : []),
    ...(moduleAccess.procurement || moduleAccess.inventory ? [{ key: "suppliers" as const, labelKey: "bo.nav.suppliers", icon: Truck }] : []),
    ...(moduleAccess.finance ? [{ key: "finance" as const, labelKey: "bo.nav.finance", icon: Coins }] : []),
  ];
  const safeSection = sections.some((item) => item.key === section) ? section : "overview";

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="inline-flex rounded-full bg-orange-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[.16em] text-[#ff5a0a]">ERP</span>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight">{t("bo.title")}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{lang === "ar" ? "تظهر وحدات المخزون والمشتريات والمالية حسب مسؤوليات حسابك فقط." : "Inventory, procurement and finance modules are shown according to your account responsibilities."}</p>
        </div>
      </header>

      <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-6">
        <nav aria-label={t("bo.title")} className="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:mb-0 lg:flex-col lg:overflow-visible lg:px-0">
          {sections.map(({ key, labelKey, icon: Icon }) => (
            <button key={key} type="button" onClick={() => setSection(key)} aria-current={safeSection === key ? "page" : undefined} className={cn("flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-medium transition-colors lg:w-full", safeSection === key ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
              <Icon className="size-4 shrink-0" aria-hidden />{t(labelKey)}
            </button>
          ))}
          <div className="hidden lg:mt-4 lg:block lg:border-t lg:pt-4">{UPCOMING.map(({ labelKey, icon: Icon }) => <p key={labelKey} className="flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm text-muted-foreground/60" title={t("bo.soon")}><Icon className="size-4 shrink-0" aria-hidden /><span className="truncate">{t(labelKey)}</span><span className="ms-auto rounded-md bg-muted px-1.5 py-0.5 text-[10px]">{t("bo.soon")}</span></p>)}</div>
        </nav>

        <div className="min-w-0">
          {query.isError ? <div role="alert" className="panel space-y-3 p-6"><p className="text-sm">{humanError(query.error, lang)}</p><Button variant="outline" className="min-h-11" onClick={() => void query.refetch()}>{t("common.retry")}</Button></div>
          : query.isPending ? <div className="space-y-3"><Skeleton className="h-24 rounded-2xl" /><Skeleton className="h-64 rounded-2xl" /></div>
          : safeSection === "overview" ? <OverviewPanel data={data} summary={summary} currency={currency} onAction={moduleAccess.inventory || moduleAccess.procurement || moduleAccess.finance ? setRequest : () => undefined} />
          : safeSection === "inventory" ? <InventoryPanel data={data} currency={currency} onAction={setRequest} />
          : safeSection === "suppliers" ? <SuppliersPanel data={data} onAction={moduleAccess.procurement ? setRequest : () => undefined} />
          : <FinancePanel data={data} currency={currency} restaurantName={restaurantName} onAction={setRequest} />}
        </div>
      </div>

      <RecordDialog restaurantId={restaurantId} request={request} onClose={() => setRequest(null)} inventory={data.inventory} suppliers={data.suppliers} currency={currency} />
    </section>
  );
}
