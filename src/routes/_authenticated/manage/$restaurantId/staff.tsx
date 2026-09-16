import { createFileRoute } from "@tanstack/react-router";

import { StaffManager } from "@/components/manage/StaffManager";

export const Route = createFileRoute("/_authenticated/manage/$restaurantId/staff")({
  head: () => ({
    meta: [
      { title: "Team and roles — QuickServe" },
      { name: "description", content: "Invite staff, assign kitchen, waiter or cashier roles and control access." },
      { property: "og:title", content: "Team and roles — QuickServe" },
      { property: "og:description", content: "Invite staff, assign kitchen, waiter or cashier roles and control access." },
    ],
  }),
  component: Page,
});

function Page() {
  const { restaurantId } = Route.useParams();
  return <StaffManager restaurantId={restaurantId} />;
}
