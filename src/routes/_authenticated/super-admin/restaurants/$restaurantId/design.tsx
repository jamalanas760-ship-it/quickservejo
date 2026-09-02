import { createFileRoute } from "@tanstack/react-router";

import { PdfMenuManager } from "@/components/manage/PdfMenuManager";

export const Route = createFileRoute(
  "/_authenticated/super-admin/restaurants/$restaurantId/design",
)({
  head: () => ({
    meta: [
      { title: "PDF Menu & QR Ordering — QuickServe admin" },
      {
        name: "description",
        content: "Manage a restaurant's original PDF menu and QR ordering entry point.",
      },
      { property: "og:title", content: "PDF Menu & QR Ordering — QuickServe admin" },
      { property: "og:description", content: "Publish a restaurant PDF menu and connect it to QuickServe ordering." },
    ],
  }),
  component: DesignTab,
});

function DesignTab() {
  const { restaurantId } = Route.useParams();
  return <PdfMenuManager restaurantId={restaurantId} />;
}
