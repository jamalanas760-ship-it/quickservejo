import { createFileRoute } from "@tanstack/react-router";

import { StaffManager } from "@/components/manage/StaffManager";

export const Route = createFileRoute(
  "/_authenticated/super-admin/restaurants/$restaurantId/staff",
)({
  head: () => ({
    meta: [
      { title: "Restaurant staff — QuickServe admin" },
      {
        name: "description",
        content: "Invite staff, assign roles and control access for a QuickServe restaurant.",
      },
      { property: "og:title", content: "Restaurant staff — QuickServe admin" },
      { property: "og:description", content: "Team and role management for a tenant." },
    ],
  }),
  component: StaffTab,
});

function StaffTab() {
  const { restaurantId } = Route.useParams();
  return <StaffManager restaurantId={restaurantId} />;
}
