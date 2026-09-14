import { createFileRoute } from "@tanstack/react-router";

import { TablesManagerModern } from "@/components/manage/TablesManagerModern";

export const Route = createFileRoute("/_authenticated/manage/$restaurantId/tables")({
  head: () => ({
    meta: [
      { title: "Tables and QR codes — QuickServe" },
      { name: "description", content: "Create tables, generate QR codes and print QR cards for your restaurant." },
      { property: "og:title", content: "Tables and QR codes — QuickServe" },
      { property: "og:description", content: "Create tables, generate QR codes and print QR cards for your restaurant." },
    ],
  }),
  component: Page,
});

function Page() {
  const { restaurantId } = Route.useParams();
  return <TablesManagerModern restaurantId={restaurantId} />;
}
