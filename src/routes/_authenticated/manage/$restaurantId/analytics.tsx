import { createFileRoute } from "@tanstack/react-router";

import { AnalyticsManagerPro } from "@/components/manage/AnalyticsManagerPro";
import { DecisionIntelligencePanel } from "@/components/manage/DecisionIntelligencePanel";

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
  return <div className="space-y-6"><DecisionIntelligencePanel restaurantId={restaurantId} /><AnalyticsManagerPro restaurantId={restaurantId} /></div>;
}
