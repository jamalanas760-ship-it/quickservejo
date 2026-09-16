import { createFileRoute } from "@tanstack/react-router";

import { AnalyticsManager } from "@/components/manage/AnalyticsManager";

export const Route = createFileRoute("/_authenticated/manage/$restaurantId/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — QuickServe" },
      { name: "description", content: "Revenue, order counts, average order value and peak hours." },
      { property: "og:title", content: "Analytics — QuickServe" },
      { property: "og:description", content: "Revenue, order counts, average order value and peak hours." },
    ],
  }),
  component: Page,
});

function Page() {
  const { restaurantId } = Route.useParams();
  return <AnalyticsManager restaurantId={restaurantId} />;
}
