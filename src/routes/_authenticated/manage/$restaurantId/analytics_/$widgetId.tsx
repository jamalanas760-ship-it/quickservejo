import { createFileRoute, redirect } from "@tanstack/react-router";

import { isAnalyticsDetailWidget } from "@/components/manage/AnalyticsDetailPage";
import { AnalyticsManagerPro } from "@/components/manage/AnalyticsManagerPro";

export const Route = createFileRoute("/_authenticated/manage/$restaurantId/analytics_/$widgetId")({
  beforeLoad: ({ params }) => {
    if (!isAnalyticsDetailWidget(params.widgetId)) {
      throw redirect({
        to: "/manage/$restaurantId/analytics",
        params: { restaurantId: params.restaurantId },
      });
    }
  },
  component: AnalyticsWidgetDetailPage,
});

function AnalyticsWidgetDetailPage() {
  const { restaurantId, widgetId } = Route.useParams();
  if (!isAnalyticsDetailWidget(widgetId)) return null;
  return <AnalyticsManagerPro restaurantId={restaurantId} detailWidget={widgetId} />;
}

