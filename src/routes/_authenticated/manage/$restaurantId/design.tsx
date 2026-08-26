import { createFileRoute } from "@tanstack/react-router";

import { MenuDesigner } from "@/components/manage/MenuDesigner";

export const Route = createFileRoute("/_authenticated/manage/$restaurantId/design")({
  head: () => ({
    meta: [
      { title: "Menu design studio — QuickServe" },
      {
        name: "description",
        content:
          "Choose a menu template, colours, fonts, layout and icons for your QR menu with a live phone preview.",
      },
      { property: "og:title", content: "Menu design studio — QuickServe" },
      { property: "og:description", content: "Templates, colours and layout for your QR menu." },
    ],
  }),
  component: DesignPage,
});

function DesignPage() {
  const { restaurantId } = Route.useParams();
  return <MenuDesigner restaurantId={restaurantId} />;
}
