import { createFileRoute } from "@tanstack/react-router";

import { AnalyticsManager } from "@/components/manage/AnalyticsManager";

export const Route = createFileRoute(
  "/_authenticated/super-admin/restaurants/$restaurantId/analytics",
)({
  head: () => ({
    meta: [
      { title: "Restaurant analytics — QuickServe admin" },
      {
        name: "description",
        content: "Orders, revenue, average order value and peak hours for one restaurant tenant.",
      },
      { property: "og:title", content: "Restaurant analytics — QuickServe admin" },
      { property: "og:description", content: "Performance metrics for one tenant." },
    ],
  }),
  component: AnalyticsTab,
});

function AnalyticsTab() {
  const { restaurantId } = Route.useParams();
  return <AnalyticsManager restaurantId={restaurantId} />;
}
