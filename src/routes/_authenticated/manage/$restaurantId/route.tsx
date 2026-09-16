import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import type { CSSProperties } from "react";

import { AppHeader } from "@/components/nav/AppHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccess } from "@/hooks/useSession";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { useI18n } from "@/lib/i18n";
import { membershipHasCapability, type Capability } from "@/lib/permissions";
import { readAppearance } from "@/lib/restaurant-appearance";

export const Route = createFileRoute("/_authenticated/manage/$restaurantId")({ component: ManageShell });

function requiredCapability(pathname: string, restaurantId: string): Capability {
  const base = `/manage/${restaurantId}`;
  const suffix = pathname.replace(/\/$/, "").slice(base.length);
  if (!suffix) return "manage_menu";
  if (suffix.startsWith("/orders")) return "view_orders";
  if (suffix.startsWith("/tables")) return "manage_tables";
  if (suffix.startsWith("/analytics")) return "view_analytics";
  if (suffix.startsWith("/staff")) return "manage_staff";
  return "manage_restaurant";
}

function ManageShell() {
  const { restaurantId } = Route.useParams();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { lang, t } = useI18n();
  const restaurant = useRestaurant(restaurantId);
  const access = useAccess();
  const membership = access.membershipFor(restaurantId);
  const required = requiredCapability(pathname, restaurantId);
  const allowed = access.isSuperAdmin || Boolean(membership && membershipHasCapability(membership.role, membership.permission_overrides, required));
  const appearance = readAppearance(restaurant.data?.menu_theme);
  const restaurantTheme = {
    "--restaurant-light-bg": appearance.lightBackground,
    "--restaurant-dark-bg": appearance.darkBackground,
  } as CSSProperties;

  if (access.isPending || restaurant.isPending) {
    return <div className="min-h-dvh bg-background"><AppHeader /><div className="qs-page"><Skeleton className="h-[72vh] rounded-2xl" /></div></div>;
  }

  if (!allowed) {
    return (
      <div className="min-h-dvh bg-background">
        <AppHeader />
        <div role="alert" className="qs-card mx-auto mt-10 max-w-lg p-8 text-center">
          <h1 className="text-xl font-semibold">{t("sa.unauthorized.title")}</h1>
          <p className="mt-3 text-muted-foreground">{t("sa.unauthorized.body")}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`.restaurant-theme-scope{background:var(--restaurant-light-bg)}.dark .restaurant-theme-scope{background:var(--restaurant-dark-bg)}`}</style>
      <div className="restaurant-theme-scope min-h-dvh transition-colors" style={restaurantTheme}>
        <AppHeader title={restaurant.data?.name ?? (lang === "ar" ? "مساحة عمل المطعم" : "Restaurant workspace")} />
        <main className="qs-page min-w-0"><Outlet /></main>
      </div>
    </>
  );
}
