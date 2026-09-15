import { createFileRoute } from "@tanstack/react-router";

import { StaffManagerAdvanced } from "@/components/manage/StaffManagerAdvanced";

export const Route = createFileRoute("/_authenticated/manage/$restaurantId/staff")({
  head: () => ({
    meta: [
      { title: "Team and permissions — QuickServe" },
      { name: "description", content: "Manage staff, secure permissions, passwords and access for your restaurant." },
      { property: "og:title", content: "Team and permissions — QuickServe" },
      { property: "og:description", content: "Manage staff, secure permissions, passwords and access for your restaurant." },
    ],
  }),
  component: Page,
});

function Page() {
  const { restaurantId } = Route.useParams();
  return <StaffManagerAdvanced restaurantId={restaurantId} />;
}
