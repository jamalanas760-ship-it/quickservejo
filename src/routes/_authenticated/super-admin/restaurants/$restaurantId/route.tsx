import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, Building2, MoreHorizontal, Store } from "lucide-react";

import { MasterEyebrow, MasterPageHeader } from "@/components/app/MasterPage";
import { RestaurantSwitcher } from "@/components/manage/RestaurantSwitcher";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/super-admin/restaurants/$restaurantId")({
  component: RestaurantShell,
});

type Tab = {
  to: string;
  labelKey?: string;
  label?: { en: string; ar: string };
  exact?: boolean;
};

const TABS: Tab[] = [
  { to: "/super-admin/restaurants/$restaurantId", labelKey: "sa.detail.overview", exact: true },
  { to: "/super-admin/restaurants/$restaurantId/edit", labelKey: "sa.detail.edit" },
  { to: "/super-admin/restaurants/$restaurantId/design", label: { en: "Menu Design", ar: "تصميم القائمة" } },
  { to: "/super-admin/restaurants/$restaurantId/tables", labelKey: "sa.detail.tables" },
  { to: "/super-admin/restaurants/$restaurantId/staff", labelKey: "sa.detail.staff" },
  { to: "/super-admin/restaurants/$restaurantId/orders", labelKey: "sa.detail.orders" },
  { to: "/super-admin/restaurants/$restaurantId/analytics", labelKey: "sa.detail.analytics" },
  { to: "/super-admin/restaurants/$restaurantId/operations", labelKey: "bo.title" },
];
const PRIMARY_TABS = TABS.filter((tab) => [
  "/super-admin/restaurants/$restaurantId",
  "/super-admin/restaurants/$restaurantId/design",
  "/super-admin/restaurants/$restaurantId/orders",
  "/super-admin/restaurants/$restaurantId/staff",
  "/super-admin/restaurants/$restaurantId/operations",
].includes(tab.to));
const SECONDARY_TABS = TABS.filter((tab) => !PRIMARY_TABS.includes(tab));

function RestaurantShell() {
  const { restaurantId } = Route.useParams();
  const { t, lang } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: restaurant, isPending } = useRestaurant(restaurantId);
  const base = `/super-admin/restaurants/${restaurantId}`;
  const ar = lang === "ar";

  return (
    <div className="space-y-5">
      <MasterPageHeader
        eyebrow={<MasterEyebrow icon={Building2}>{ar ? "إدارة المستأجر" : "Tenant management"}</MasterEyebrow>}
        title={isPending ? <Skeleton className="h-9 w-56" /> : restaurant?.name ?? t("common.notFound")}
        description={restaurant ? `/${restaurant.slug} · ${restaurant.archived_at ? (ar ? "مؤرشف" : "Archived") : restaurant.is_active ? (ar ? "نشط" : "Active") : (ar ? "غير نشط" : "Inactive")}` : undefined}
        actions={
          <>
            <RestaurantSwitcher restaurantId={restaurantId} />
            <Button asChild variant="outline">
              <Link to="/super-admin/restaurants"><ArrowLeft className={cn("size-4", ar && "rotate-180")} />{t("sa.rest.title")}</Link>
            </Button>
          </>
        }
        tabs={
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {PRIMARY_TABS.map((tab) => {
              const href = tab.to.replace("$restaurantId", restaurantId);
              const active = tab.exact ? pathname === base || pathname === `${base}/` : pathname === href;
              const label = tab.label ? (ar ? tab.label.ar : tab.label.en) : t(tab.labelKey ?? "");
              return (
                <Link
                  key={tab.to}
                  to={tab.to}
                  params={{ restaurantId }}
                  className={cn(
                    "shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold transition",
                    active ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                  )}
                >
                  {label}
                </Link>
              );
            })}
            <DropdownMenu>
              <DropdownMenuTrigger asChild><button type="button" className={cn("inline-flex min-h-11 shrink-0 items-center gap-2 rounded-[9px] px-3 text-sm font-semibold transition", SECONDARY_TABS.some((tab) => pathname === tab.to.replace("$restaurantId", restaurantId)) ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><MoreHorizontal className="size-4"/>{ar ? "المزيد" : "More"}</button></DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-52">{SECONDARY_TABS.map((tab) => { const label = tab.label ? (ar ? tab.label.ar : tab.label.en) : t(tab.labelKey ?? ""); return <DropdownMenuItem key={tab.to} asChild><Link to={tab.to} params={{restaurantId}}>{label}</Link></DropdownMenuItem>; })}</DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      <div className="min-w-0">
        <Outlet />
      </div>

      {!restaurant && !isPending ? (
        <div className="grid min-h-52 place-items-center rounded-[18px] border border-dashed border-border bg-muted/20 text-center">
          <div><Store className="mx-auto size-8 text-muted-foreground" /><p className="mt-2 text-sm text-muted-foreground">{ar ? "تعذر تحميل المطعم." : "Restaurant could not be loaded."}</p></div>
        </div>
      ) : null}
    </div>
  );
}
