import { createFileRoute } from "@tanstack/react-router";

import { UnifiedMenuStudio } from "@/components/manage/UnifiedMenuStudio";

export const Route = createFileRoute("/_authenticated/manage/$restaurantId/design")({
  head: () => ({
    meta: [
      { title: "AI Menu Studio — QuickServe" },
      {
        name: "description",
        content: "A unified AI creative studio that combines editable design systems, art direction and humanized restaurant menu design.",
      },
      { property: "og:title", content: "AI Menu Studio — QuickServe" },
      { property: "og:description", content: "Create original or reference-driven restaurant menus with one intelligent creative workflow." },
    ],
  }),
  component: DesignPage,
});

function DesignPage() {
  const { restaurantId } = Route.useParams();
  return <UnifiedMenuStudio restaurantId={restaurantId} />;
}
