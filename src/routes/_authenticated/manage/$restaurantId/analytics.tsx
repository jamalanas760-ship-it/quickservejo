import { createFileRoute } from "@tanstack/react-router";

import { AnalyticsManagerPro } from "@/components/manage/AnalyticsManagerPro";

export const Route = createFileRoute("/_authenticated/manage/$restaurantId/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — QuickServe" },
      { name: "description", content: "Customizable restaurant analytics, reports, tables and chart visualizations." },
      { property: "og:title", content: "Analytics — QuickServe" },
      { property: "og:description", content: "Customizable restaurant analytics, reports, tables and chart visualizations." },
    ],
  }),
  component: Page,
});

function Page() {
  const { restaurantId } = Route.useParams();
  return <AnalyticsManagerPro restaurantId={restaurantId} />;
}
