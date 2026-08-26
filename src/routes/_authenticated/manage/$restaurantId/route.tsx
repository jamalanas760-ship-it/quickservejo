import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccess } from "@/hooks/useSession";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/manage/$restaurantId")({
  component: ManageShell,
});

const TABS = [
  { to: "/manage/$restaurantId", labelKey: "sa.detail.menu", exact: true },
  { to: "/manage/$restaurantId/tables", labelKey: "sa.detail.tables" },
  { to: "/manage/$restaurantId/staff", labelKey: "sa.detail.staff" },
  { to: "/manage/$restaurantId/orders", labelKey: "sa.detail.orders" },
  { to: "/manage/$restaurantId/analytics", labelKey: "sa.detail.analytics" },
] as const;

function ManageShell() {
  const { restaurantId } = Route.useParams();
  const { t } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: restaurant, isPending } = useRestaurant(restaurantId);
  const access = useAccess();

  const base = `/manage/${restaurantId}`;
  const allowed = access.isSuperAdmin || Boolean(access.membershipFor(restaurantId));

  if (access.isPending || isPending) {
    return <Skeleton className="h-64 rounded-xl" />;
  }

  // The database refuses reads/writes for other tenants; this is the UX mirror.
  if (!allowed) {
    return (
      <div className="panel p-8 text-center">
        <h1 className="text-lg font-semibold">{t("sa.unauthorized.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("sa.unauthorized.body")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="size-11 overflow-hidden rounded-lg border bg-muted">
          {restaurant?.logo_url ? (
            <img
              src={restaurant.logo_url}
              alt={restaurant.name}
              className="size-full object-cover"
            />
          ) : null}
        </div>
        <div>
          <h1 className="text-xl font-semibold">{restaurant?.name ?? t("common.notFound")}</h1>
          <p className="text-xs text-muted-foreground">{restaurant ? `/${restaurant.slug}` : ""}</p>
        </div>
        {restaurant ? (
          <Badge variant={restaurant.is_active ? "secondary" : "outline"}>
            {restaurant.is_active ? t("common.active") : t("common.inactive")}
          </Badge>
        ) : null}
      </div>

      <nav className="flex flex-wrap gap-1 border-b pb-2">
        {TABS.map((tab) => {
          const href = tab.to.replace("$restaurantId", restaurantId);
          const active =
            "exact" in tab && tab.exact ? pathname === base || pathname === `${base}/` : pathname === href;
          return (
            <Link
              key={tab.to}
              to={tab.to}
              params={{ restaurantId }}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-muted",
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
