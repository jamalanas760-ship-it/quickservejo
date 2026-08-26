import { createFileRoute } from "@tanstack/react-router";

import { MenuManager } from "@/components/manage/MenuManager";

export const Route = createFileRoute(
  "/_authenticated/super-admin/restaurants/$restaurantId/menu",
)({
  head: () => ({
    meta: [
      { title: "Menu builder — QuickServe admin" },
      {
        name: "description",
        content:
          "Build bilingual menu categories, products, prices, images and modifier groups for a tenant.",
      },
      { property: "og:title", content: "Menu builder — QuickServe admin" },
      { property: "og:description", content: "Categories, products and modifiers for a tenant." },
    ],
  }),
  component: MenuTab,
});

function MenuTab() {
  const { restaurantId } = Route.useParams();
  return <MenuManager restaurantId={restaurantId} />;
}
