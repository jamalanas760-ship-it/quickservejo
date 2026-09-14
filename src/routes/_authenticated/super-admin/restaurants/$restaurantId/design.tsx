import { createFileRoute } from "@tanstack/react-router";

import { MasterMenuDesigner } from "@/components/manage/MasterMenuDesigner";

export const Route = createFileRoute(
  "/_authenticated/super-admin/restaurants/$restaurantId/design",
)({
  head: () => ({
    meta: [
      { title: "Menu Design — QuickServe admin" },
      {
        name: "description",
        content: "Design and manage the standard menu, clickable PDF menu, and guest menu appearance.",
      },
      { property: "og:title", content: "Menu Design — QuickServe admin" },
      {
        property: "og:description",
        content: "Manage menu products, PDF ordering, and the guest menu design from one workspace.",
      },
    ],
  }),
  component: DesignTab,
});

function DesignTab() {
  const { restaurantId } = Route.useParams();
  return <MasterMenuDesigner restaurantId={restaurantId} />;
}
