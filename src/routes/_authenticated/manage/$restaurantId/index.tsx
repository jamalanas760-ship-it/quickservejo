import { createFileRoute } from "@tanstack/react-router";

import { MenuManager } from "@/components/manage/MenuManager";

export const Route = createFileRoute("/_authenticated/manage/$restaurantId/")({
  head: () => ({
    meta: [
      { title: "Menu builder — QuickServe" },
      {
        name: "description",
        content:
          "Build your QuickServe menu: categories, products, modifiers, prices and availability.",
      },
      { property: "og:title", content: "Menu builder — QuickServe" },
      { property: "og:description", content: "Categories, products and modifiers." },
    ],
  }),
  component: MenuPage,
});

function MenuPage() {
  const { restaurantId } = Route.useParams();
  return <MenuManager restaurantId={restaurantId} />;
}
