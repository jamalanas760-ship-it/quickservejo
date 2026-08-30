import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { BarChart3, ClipboardList, Palette, QrCode, ShoppingBag, Users } from "lucide-react";

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
  { to: "/manage/$restaurantId", labelKey: "sa.detail.menu", icon: ClipboardList, exact: true },
  { to: "/manage/$restaurantId/design", labelKey: "sa.detail.design", icon: Palette },
  { to: "/manage/$restaurantId/tables", labelKey: "sa.detail.tables", icon: QrCode },
  { to: "/manage/$restaurantId/staff", labelKey: "sa.detail.staff", icon: Users },
  { to: "/manage/$restaurantId/orders", labelKey: "sa.detail.orders", icon: ShoppingBag },
  { to: "/manage/$restaurantId/analytics", labelKey: "sa.detail.analytics", icon: BarChart3 },
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

      <nav className="-mx-1 flex gap-1 overflow-x-auto border-b pb-2">
        {TABS.map((tab) => {
          const href = tab.to.replace("$restaurantId", restaurantId);
          const active =
            "exact" in tab && tab.exact ? pathname === base || pathname === `${base}/` : pathname === href;
          const Icon = tab.icon;
          return (
            <Link
              key={tab.to}
              to={tab.to}
              params={{ restaurantId }}
              className={cn(
                "flex shrink-0 flex-col items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-5" aria-hidden />
              <span>{t(tab.labelKey)}</span>
            </Link>
          );
        })}
      </nav>

      <Outlet />
    </div>
  );
}
