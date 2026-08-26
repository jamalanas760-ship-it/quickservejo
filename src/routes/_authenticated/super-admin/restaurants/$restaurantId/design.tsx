import { createFileRoute } from "@tanstack/react-router";

import { MenuDesigner } from "@/components/manage/MenuDesigner";

export const Route = createFileRoute(
  "/_authenticated/super-admin/restaurants/$restaurantId/design",
)({
  head: () => ({
    meta: [
      { title: "Menu design studio — QuickServe admin" },
      {
        name: "description",
        content:
          "Design a tenant's QR menu: template, palette, typography, layout and AI-generated themes with live preview.",
      },
      { property: "og:title", content: "Menu design studio — QuickServe admin" },
      { property: "og:description", content: "Per-tenant menu templates and themes." },
    ],
  }),
  component: DesignTab,
});

function DesignTab() {
  const { restaurantId } = Route.useParams();
  return <MenuDesigner restaurantId={restaurantId} />;
}
