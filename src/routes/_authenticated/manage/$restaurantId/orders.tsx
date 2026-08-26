import { createFileRoute } from "@tanstack/react-router";

import { OrdersManager } from "@/components/manage/OrdersManager";

export const Route = createFileRoute("/_authenticated/manage/$restaurantId/orders")({
  head: () => ({
    meta: [
      { title: "Orders — QuickServe" },
      { name: "description", content: "Track live and past orders for your restaurant." },
      { property: "og:title", content: "Orders — QuickServe" },
      { property: "og:description", content: "Track live and past orders for your restaurant." },
    ],
  }),
  component: Page,
});

function Page() {
  const { restaurantId } = Route.useParams();
  return <OrdersManager restaurantId={restaurantId} />;
}
