import { MoreHorizontal } from "@/components/nav/QuickServeIcons";
import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  ChefHat,
  Coins,
  FileText,
  LayoutDashboard,
  Package,
  PackageCheck,
  Printer,
  ShoppingCart,
  AlertTriangle,
  Truck,
} from "lucide-react";

import { MasterKpi } from "@/components/app/MasterPage";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { backOfficeSummary, useBackOffice, type BackOfficeAccess } from "@/hooks/useBackOffice";
import { useAccess } from "@/hooks/useSession";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { humanError } from "@/lib/errors";
import { formatMoney } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { membershipHasCapability } from "@/lib/permissions";
import { QuickActions } from "./QuickActions";
import "./backoffice-studio.css";

type SectionKey =
  | "overview"
  | "kitchen"
  | "inventory"
  | "recipes"
  | "receiving"
  | "procurement"
  | "suppliers"
  | "invoices"
  | "finance"
  | "reports";

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
  const can = (
    capability:
      | "view_erp"
      | "manage_inventory"
      | "manage_procurement"
      | "manage_finance"
      | "manage_restaurant",
  ) =>
    access.isSuperAdmin ||
    Boolean(
      membership &&
      membershipHasCapability(membership.role, membership.permission_overrides, capability),
    );

  const moduleAccess: BackOfficeAccess = {
    inventory: can("manage_inventory"),
    procurement: can("manage_procurement"),
    finance: can("manage_finance"),
  };
  const canApproveProcurement = can("manage_restaurant");
  const allowed =
    access.isSuperAdmin || can("view_erp") || Object.values(moduleAccess).some(Boolean);
  const restaurant = useRestaurant(restaurantId);
  const query = useBackOffice(restaurantId, moduleAccess, allowed);
  const requestedSection = useRouterState({ select: (state) => state.location.hash });
  const [section, setSection] = useState<SectionKey>(
    requestedSection === "inventory" ? "inventory" : "overview",
  );
  useEffect(() => {
    if (requestedSection === "inventory") setSection("inventory");
  }, [requestedSection]);
  const [request, setRequest] = useState<RecordRequest | null>(null);

  if (access.isPending) return <Skeleton className="h-96 rounded-2xl" />;
  if (!allowed)
    return (
      <div role="alert" className="qs-card p-8 text-center">
        <Package className="mx-auto size-9 text-muted-foreground" />
        <h2 className="mt-3 font-bold">{ar ? "ERP غير متاح" : "ERP is not available"}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {ar
            ? "هذا الدور لا يملك صلاحية مساحة الإدارة الخلفية."
            : "This role does not have Back Office access."}
        </p>
      </div>
    );

  const currency = restaurant.data?.currency ?? "JOD";
  const restaurantName = restaurant.data?.name ?? "";
  const data = query.data ?? {
    inventory: [],
    suppliers: [],
    movements: [],
    expenses: [],
    procurement: [],
  };
  const summary = backOfficeSummary(query.data);

  const allSections: Section[] = [
    { key: "overview", en: "Overview", ar: "نظرة عامة", icon: LayoutDashboard, show: true },
    {
      key: "kitchen",
      en: "Kitchen Setup",
      ar: "إعداد المطبخ",
      icon: Printer,
      show: canApproveProcurement,
    },
    {
      key: "inventory",
      en: "Inventory",
      ar: "المخزون",
      icon: Package,
      show: moduleAccess.inventory,
    },
    {
      key: "recipes",
      en: "Recipes & Cost",
      ar: "الوصفات والتكلفة",
      icon: ChefHat,
      show: moduleAccess.inventory || canApproveProcurement,
    },
    {
      key: "receiving",
      en: "Receiving",
      ar: "الاستلام",
      icon: PackageCheck,
      show: moduleAccess.inventory || moduleAccess.procurement,
    },
    {
      key: "procurement",
      en: "Procurement",
      ar: "المشتريات",
      icon: ShoppingCart,
      show: moduleAccess.procurement || canApproveProcurement,
    },
    {
      key: "suppliers",
      en: "Suppliers",
      ar: "الموردون",
      icon: Truck,
      show: moduleAccess.procurement || moduleAccess.inventory || moduleAccess.finance,
    },
    {
      key: "invoices",
      en: "Supplier Invoices",
      ar: "فواتير الموردين",
      icon: FileText,
      show: moduleAccess.procurement || moduleAccess.finance || canApproveProcurement,
    },
    { key: "finance", en: "Finance", ar: "المالية", icon: Coins, show: moduleAccess.finance },
    { key: "reports", en: "Reports", ar: "التقارير", icon: BarChart3, show: true },
  ];
  const sections = allSections.filter((item) => item.show);

  const safeSection = sections.some((item) => item.key === section) ? section : "overview";
  const priorityKeys: SectionKey[] = ["overview", "inventory", "procurement", "finance", "reports"];
  const primarySections = priorityKeys.flatMap(
    (key) => sections.find((item) => item.key === key) ?? [],
  );
  const secondarySections = sections.filter(
    (item) => !primarySections.some((primary) => primary.key === item.key),
  );

  return (
    <section className="bo-studio" style={{ direction: ar ? "rtl" : "ltr" }}>
      <header className="bo-heading">
        <div>
          <h1>{ar ? "الإدارة الخلفية" : "Back Office"}</h1>
          <p>
            {ar
              ? "المخزون والمشتريات والمالية، معاً."
              : "Inventory, purchasing & finance, together."}
          </p>
        </div>
        <QuickActions access={moduleAccess} onAction={setRequest} dropdown />
      </header>
      <nav className="bo-tabs" aria-label={ar ? "وحدات ERP" : "ERP modules"}>
        {primarySections.map(({ key, en, ar: label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setSection(key)}
            aria-current={safeSection === key ? "page" : undefined}
          >
            {ar ? label : en}
          </button>
        ))}
        {secondarySections.length ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-current={
                  secondarySections.some((item) => item.key === safeSection) ? "page" : undefined
                }
              >
                {secondarySections.find((item) => item.key === safeSection)?.[ar ? "ar" : "en"] ??
                  (ar ? "المزيد" : "More")}
                <MoreHorizontal size={14} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="bo-more"
              style={{ direction: ar ? "rtl" : "ltr" }}
            >
              {secondarySections.map(({ key, en, ar: label, icon: Icon }) => (
                <DropdownMenuItem key={key} onSelect={() => setSection(key)}>
                  <span className="bo-icon">
                    <Icon size={16} />
                  </span>
                  <span>{ar ? label : en}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </nav>
      {safeSection === "overview" ? (
        <section className="bo-summary">
          {moduleAccess.inventory ? (
            <MasterKpi
              icon={Package}
              label={ar ? "قيمة المخزون" : "Inventory value"}
              value={formatMoney(summary.valuation.value, currency, lang)}
              hint={ar ? "حسب آخر تكلفة استلام" : "Latest receipt cost"}
              tone="orange"
            />
          ) : null}
          {moduleAccess.inventory ? (
            <MasterKpi
              icon={AlertTriangle}
              label={ar ? "مخزون منخفض" : "Low stock"}
              value={String(summary.lowStock.length)}
              hint={ar ? "عند أو تحت حد إعادة الطلب" : "At or below reorder level"}
              tone="orange"
            />
          ) : null}
          {moduleAccess.procurement || canApproveProcurement ? (
            <MasterKpi
              icon={ShoppingCart}
              label={ar ? "طلبات مفتوحة" : "Open requests"}
              value={String(summary.pendingApproval + summary.pendingReceiving)}
              hint={formatMoney(summary.openProcurementValue, currency, lang)}
              tone="blue"
            />
          ) : null}
          {moduleAccess.finance ? (
            <MasterKpi
              icon={Coins}
              label={ar ? "مصروفات الشهر" : "Month expenses"}
              value={formatMoney(summary.monthTotal, currency, lang)}
              hint={ar ? `${summary.monthCount} قيود` : `${summary.monthCount} entries`}
              tone="purple"
            />
          ) : null}
        </section>
      ) : null}
      <div className={`bo-content bo-${safeSection}`}>
        {query.isError ? (
          <div role="alert" className="qs-card space-y-3 p-6">
            <p className="text-sm text-destructive">{humanError(query.error, lang)}</p>
            <Button variant="outline" onClick={() => void query.refetch()}>
              {ar ? "إعادة المحاولة" : "Try again"}
            </Button>
          </div>
        ) : query.isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-72 rounded-2xl" />
          </div>
        ) : safeSection === "overview" ? (
          <OverviewPanel
            data={data}
            summary={summary}
            access={moduleAccess}
            currency={currency}
            onAction={setRequest}
            onNavigate={setSection}
            canApproveProcurement={canApproveProcurement}
          />
        ) : safeSection === "kitchen" ? (
          <KitchenConfigPanel restaurantId={restaurantId} />
        ) : safeSection === "inventory" ? (
          <InventoryPanel
            restaurantId={restaurantId}
            data={data}
            currency={currency}
            onAction={setRequest}
          />
        ) : safeSection === "recipes" ? (
          <RecipesPanel restaurantId={restaurantId} data={data} currency={currency} />
        ) : safeSection === "receiving" ? (
          <ReceivingPanel
            data={data}
            currency={currency}
            onAction={setRequest}
            onGoProcurement={() => setSection("procurement")}
          />
        ) : safeSection === "procurement" ? (
          <ProcurementPanel
            restaurantId={restaurantId}
            data={data}
            currency={currency}
            canApprove={canApproveProcurement}
            canProcure={moduleAccess.procurement || canApproveProcurement}
            canReceive={moduleAccess.inventory || moduleAccess.procurement || canApproveProcurement}
            onAction={setRequest}
          />
        ) : safeSection === "suppliers" ? (
          <SuppliersPanel
            canManage={moduleAccess.procurement || canApproveProcurement}
            data={data}
            currency={currency}
            onAction={
              moduleAccess.procurement || canApproveProcurement ? setRequest : () => undefined
            }
          />
        ) : safeSection === "invoices" ? (
          <InvoicesPanel
            restaurantId={restaurantId}
            data={data}
            currency={currency}
            canFinance={moduleAccess.finance || canApproveProcurement}
          />
        ) : safeSection === "finance" ? (
          <FinancePanel
            data={data}
            currency={currency}
            restaurantName={restaurantName}
            onAction={setRequest}
          />
        ) : (
          <ReportsPanel
            data={data}
            access={moduleAccess}
            currency={currency}
            restaurantName={restaurantName}
          />
        )}
      </div>

      {request ? <RecordDialog
        restaurantId={restaurantId}
        request={request}
        onClose={() => setRequest(null)}
        inventory={data.inventory}
        suppliers={data.suppliers}
        currency={currency}
      /> : null}
    </section>
  );
}
