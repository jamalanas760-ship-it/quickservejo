import { useState } from "react";
import { BarChart3, ChefHat, Coins, LayoutDashboard, Package, ShoppingCart, Truck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FinancePanel } from "@/components/backoffice/FinancePanel";
import { InventoryPanel } from "@/components/backoffice/InventoryPanel";
import { OverviewPanel } from "@/components/backoffice/OverviewPanel";
import { RecordDialog, type RecordRequest } from "@/components/backoffice/RecordDialog";
import { SuppliersPanel } from "@/components/backoffice/SuppliersPanel";
import { backOfficeSummary, useBackOffice } from "@/hooks/useBackOffice";
import { useAccess } from "@/hooks/useSession";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { humanError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type SectionKey = "overview" | "inventory" | "suppliers" | "finance";
const SECTIONS: { key: SectionKey; labelKey: string; icon: typeof Package }[] = [
  { key: "overview", labelKey: "bo.nav.overview", icon: LayoutDashboard },
  { key: "inventory", labelKey: "bo.nav.inventory", icon: Package },
  { key: "suppliers", labelKey: "bo.nav.suppliers", icon: Truck },
  { key: "finance", labelKey: "bo.nav.finance", icon: Coins },
];
const UPCOMING: { labelKey: string; icon: typeof Package }[] = [
  { labelKey: "bo.nav.purchasing", icon: ShoppingCart },
  { labelKey: "bo.nav.recipes", icon: ChefHat },
  { labelKey: "bo.nav.reports", icon: BarChart3 },
];

/** Back Office workspace: overview, inventory, suppliers and finance for one tenant. */
export function BackOfficeShell({ restaurantId }: { restaurantId: string }) {
  const { t } = useI18n();
  const { lang } = useI18n();
  const access = useAccess();
  const allowed = access.isSuperAdmin || access.membershipFor(restaurantId)?.role === "restaurant_admin";
  const restaurant = useRestaurant(restaurantId);
  const query = useBackOffice(restaurantId, allowed);
  const [section, setSection] = useState<SectionKey>("overview");
  const [request, setRequest] = useState<RecordRequest | null>(null);

  if (access.isPending) return <Skeleton className="h-96 rounded-2xl" />;
  if (!allowed)
    return (
      <div role="alert" className="panel p-8 text-center text-sm text-muted-foreground">
        {t("bo.onlyAdmins")}
      </div>
    );

  const currency = restaurant.data?.currency ?? "JOD";
  const restaurantName = restaurant.data?.name ?? "";
  const data = query.data ?? { inventory: [], suppliers: [], movements: [], expenses: [] };
  const summary = backOfficeSummary(query.data);

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{t("bo.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("bo.subtitle")}</p>
        </div>
      </header>

      <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-6">
        <nav
          aria-label={t("bo.title")}
          className="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:mb-0 lg:flex-col lg:overflow-visible lg:px-0"
        >
          {SECTIONS.map(({ key, labelKey, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setSection(key)}
              aria-current={section === key ? "page" : undefined}
              className={cn(
                "flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-medium transition-colors lg:w-full",
                section === key
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              {t(labelKey)}
            </button>
          ))}
          <div className="hidden lg:mt-4 lg:block lg:border-t lg:pt-4">
            {UPCOMING.map(({ labelKey, icon: Icon }) => (
              <p
                key={labelKey}
                className="flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm text-muted-foreground/60"
                title={t("bo.soon")}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="truncate">{t(labelKey)}</span>
                <span className="ms-auto rounded-md bg-muted px-1.5 py-0.5 text-[10px]">{t("bo.soon")}</span>
              </p>
            ))}
          </div>
        </nav>

        <div className="min-w-0">
          {query.isError ? (
            <div role="alert" className="panel space-y-3 p-6">
              <p className="text-sm">{humanError(query.error, lang)}</p>
              <Button variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
                {t("common.retry")}
              </Button>
            </div>
          ) : query.isPending ? (
            <div className="space-y-3">
              <Skeleton className="h-24 rounded-2xl" />
              <Skeleton className="h-64 rounded-2xl" />
            </div>
          ) : section === "overview" ? (
            <OverviewPanel data={data} summary={summary} currency={currency} onAction={setRequest} />
          ) : section === "inventory" ? (
            <InventoryPanel data={data} currency={currency} onAction={setRequest} />
          ) : section === "suppliers" ? (
            <SuppliersPanel data={data} onAction={setRequest} />
          ) : (
            <FinancePanel
              data={data}
              currency={currency}
              restaurantName={restaurantName}
              onAction={setRequest}
            />
          )}
        </div>
      </div>

      <RecordDialog
        restaurantId={restaurantId}
        request={request}
        onClose={() => setRequest(null)}
        inventory={data.inventory}
        suppliers={data.suppliers}
        currency={currency}
      />
    </section>
  );
}
