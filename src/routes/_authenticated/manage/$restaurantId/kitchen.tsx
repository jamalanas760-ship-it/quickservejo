import { createFileRoute } from "@tanstack/react-router";

import { KitchenDisplay } from "@/components/manage/KitchenDisplay";

export const Route = createFileRoute("/_authenticated/manage/$restaurantId/kitchen")({
  head: () => ({ meta: [{ title: "Kitchen — QuickServe" }, { name: "description", content: "Live kitchen display for QR orders." }] }),
  component: Page,
});

function Page() {
  const { restaurantId } = Route.useParams();
  return <KitchenDisplay restaurantId={restaurantId} />;
}
