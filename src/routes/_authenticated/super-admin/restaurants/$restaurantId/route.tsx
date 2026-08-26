import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RestaurantSwitcher } from "@/components/manage/RestaurantSwitcher";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/super-admin/restaurants/$restaurantId")({
  component: RestaurantShell,
});

type Tab = { to: string; labelKey: string; exact?: boolean };

const TABS: Tab[] = [
  { to: "/super-admin/restaurants/$restaurantId", labelKey: "sa.detail.overview", exact: true },
  { to: "/super-admin/restaurants/$restaurantId/edit", labelKey: "sa.detail.edit" },
  { to: "/super-admin/restaurants/$restaurantId/menu", labelKey: "sa.detail.menu" },
  { to: "/super-admin/restaurants/$restaurantId/design", labelKey: "sa.detail.design" },
  { to: "/super-admin/restaurants/$restaurantId/tables", labelKey: "sa.detail.tables" },
  { to: "/super-admin/restaurants/$restaurantId/staff", labelKey: "sa.detail.staff" },
  { to: "/super-admin/restaurants/$restaurantId/orders", labelKey: "sa.detail.orders" },
  { to: "/super-admin/restaurants/$restaurantId/analytics", labelKey: "sa.detail.analytics" },
];

function RestaurantShell() {
  const { restaurantId } = Route.useParams();
  const { t } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: restaurant, isPending } = useRestaurant(restaurantId);

  const base = `/super-admin/restaurants/${restaurantId}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="size-12 overflow-hidden rounded-lg border bg-muted">
            {restaurant?.logo_url ? (
              <img
                src={restaurant.logo_url}
                alt={restaurant.name}
                className="size-full object-cover"
              />
            ) : null}
          </div>
          <div>
            {isPending ? (
              <Skeleton className="h-7 w-48" />
            ) : (
              <h1 className="text-xl font-semibold">{restaurant?.name ?? t("common.notFound")}</h1>
            )}
            <p className="text-xs text-muted-foreground">
              {restaurant ? `/${restaurant.slug}` : ""}
            </p>
          </div>
          {restaurant ? (
            <Badge
              variant={
                restaurant.archived_at
                  ? "outline"
                  : restaurant.is_active
                    ? "secondary"
                    : "destructive"
              }
            >
              {restaurant.archived_at
                ? t("sa.status.archived")
                : restaurant.is_active
                  ? t("sa.status.active")
                  : t("sa.status.inactive")}
            </Badge>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <RestaurantSwitcher restaurantId={restaurantId} />
          <Button asChild variant="ghost" size="sm">
            <Link to="/super-admin/restaurants">← {t("sa.rest.title")}</Link>
          </Button>
        </div>
      </div>

      <nav className="flex flex-wrap gap-1 border-b pb-2">
        {TABS.map((tab) => {
          const href = tab.to.replace("$restaurantId", restaurantId);
          const active = tab.exact ? pathname === base || pathname === `${base}/` : pathname === href;
          return (
            <Link
              key={tab.to}
              to={tab.to}
              params={{ restaurantId }}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                active ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {t(tab.labelKey)}
            </Link>
          );
        })}
      </nav>

      <Outlet />
    </div>
  );
}
