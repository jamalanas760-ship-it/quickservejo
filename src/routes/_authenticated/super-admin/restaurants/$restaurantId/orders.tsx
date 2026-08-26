import { createFileRoute } from "@tanstack/react-router";

import { OrdersManager } from "@/components/manage/OrdersManager";

export const Route = createFileRoute(
  "/_authenticated/super-admin/restaurants/$restaurantId/orders",
)({
  head: () => ({
    meta: [
      { title: "Restaurant orders — QuickServe admin" },
      {
        name: "description",
        content: "Live and historical orders for a single QuickServe restaurant tenant.",
      },
      { property: "og:title", content: "Restaurant orders — QuickServe admin" },
      { property: "og:description", content: "Order history for one tenant." },
    ],
  }),
  component: OrdersTab,
});

function OrdersTab() {
  const { restaurantId } = Route.useParams();
  return <OrdersManager restaurantId={restaurantId} />;
}
