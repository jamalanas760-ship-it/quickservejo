import { createFileRoute } from "@tanstack/react-router";

import { useAccess } from "@/hooks/useSession";
import { WaiterFloor } from "@/routes/_authenticated/waiter";
import { TablesManagerPro } from "@/components/manage/TablesManagerPro";

export const Route = createFileRoute("/_authenticated/manage/$restaurantId/tables")({
  head: () => ({
    meta: [
      { title: "Tables and QR codes — QuickServe" },
      {
        name: "description",
        content: "Create tables, generate QR codes and print QR cards for your restaurant.",
      },
      { property: "og:title", content: "Tables and QR codes — QuickServe" },
      {
        property: "og:description",
        content: "Create tables, generate QR codes and print QR cards for your restaurant.",
      },
    ],
  }),
  component: Page,
});

function Page() {
  const { restaurantId } = Route.useParams();
  const access = useAccess();
  const membership = access.membershipFor(restaurantId);
  if (!access.isSuperAdmin && membership?.role === "waiter") return <WaiterFloor />;
  return <TablesManagerPro restaurantId={restaurantId} />;
}
