import { createFileRoute, redirect } from "@tanstack/react-router";

import { HomeMetricDetail, isHomeMetricId } from "@/components/dashboard/HomeMetricDetail";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { useWorkspaceScope } from "@/hooks/useWorkspace";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/dashboard_/$metric")({
  beforeLoad: ({ params }) => {
    if (!isHomeMetricId(params.metric)) throw redirect({ to: "/dashboard" });
  },
  component: DashboardMetricPage,
});

function DashboardMetricPage() {
  const { metric } = Route.useParams();
  const { lang } = useI18n();
  const ar = lang === "ar";
  const scope = useWorkspaceScope();
  const restaurantId = scope.restaurantId;
  const restaurant = useRestaurant(restaurantId ?? "");

  if (!restaurantId || !isHomeMetricId(metric)) {
    return (
      <div className="qs-page">
        <div className="qs-card p-8 text-center text-sm text-muted-foreground">
          {ar ? "اختر مطعماً لعرض تفاصيل المؤشر." : "Select a restaurant to view this metric."}
        </div>
      </div>
    );
  }

  return (
    <HomeMetricDetail
      metric={metric}
      restaurantId={restaurantId}
      restaurantName={restaurant.data?.name ?? scope.restaurantName ?? (ar ? "المطعم" : "Restaurant")}
      currency={scope.currency}
    />
  );
}
