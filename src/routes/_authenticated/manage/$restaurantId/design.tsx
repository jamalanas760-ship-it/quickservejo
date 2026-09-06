import { createFileRoute } from "@tanstack/react-router";

import { MasterMenuDesigner } from "@/components/manage/MasterMenuDesigner";

export const Route = createFileRoute("/_authenticated/manage/$restaurantId/design")({
  head: () => ({
    meta: [
      { title: "Master Menu Designer — QuickServe" },
      { name: "description", content: "Create, refine and publish an art-directed restaurant menu with AI and a persistent live preview." },
      { property: "og:title", content: "Master Menu Designer — QuickServe" },
      { property: "og:description", content: "Design a premium restaurant menu with AI and preview every change instantly." },
    ],
  }),
  component: DesignPage,
});

function DesignPage() {
  const { restaurantId } = Route.useParams();
  return <MasterMenuDesigner restaurantId={restaurantId} />;
}
