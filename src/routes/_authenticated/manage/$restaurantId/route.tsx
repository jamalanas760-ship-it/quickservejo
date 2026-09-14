import { createFileRoute, Outlet } from "@tanstack/react-router";

import { AppHeader } from "@/components/nav/AppHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccess } from "@/hooks/useSession";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/manage/$restaurantId")({ component: ManageShell });

function ManageShell() {
  const { restaurantId } = Route.useParams();
  const { lang, t } = useI18n();
  const restaurant = useRestaurant(restaurantId);
  const access = useAccess();
  const allowed = access.isSuperAdmin || access.membershipFor(restaurantId)?.role === "restaurant_admin";

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
    <div className="min-h-dvh bg-background">
      <AppHeader title={restaurant.data?.name ?? (lang === "ar" ? "إدارة المطعم" : "Restaurant workspace")} />
      <main className="qs-page min-w-0"><Outlet /></main>
    </div>
  );
}
