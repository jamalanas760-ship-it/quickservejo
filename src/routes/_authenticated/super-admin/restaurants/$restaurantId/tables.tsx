import { createFileRoute } from "@tanstack/react-router";

import { TablesManager } from "@/components/manage/TablesManager";

export const Route = createFileRoute(
  "/_authenticated/super-admin/restaurants/$restaurantId/tables",
)({
  head: () => ({
    meta: [
      { title: "Tables & QR codes — QuickServe admin" },
      {
        name: "description",
        content: "Create restaurant tables, regenerate QR tokens and print scannable QR cards.",
      },
      { property: "og:title", content: "Tables & QR codes — QuickServe admin" },
      {
        property: "og:description",
        content: "QR code management for a QuickServe restaurant.",
      },
    ],
  }),
  component: TablesTab,
});

function TablesTab() {
  const { restaurantId } = Route.useParams();
  return <TablesManager restaurantId={restaurantId} />;
}
