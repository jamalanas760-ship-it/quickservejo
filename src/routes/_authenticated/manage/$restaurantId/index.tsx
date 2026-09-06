import { createFileRoute } from "@tanstack/react-router";

import { PdfMenuManager } from "@/components/manage/PdfMenuManager";

export const Route = createFileRoute("/_authenticated/manage/$restaurantId/")({
  head: () => ({
    meta: [
      { title: "PDF Menu — QuickServe" },
      { name: "description", content: "Upload the restaurant's original PDF menu, link products, and publish QR ordering." },
      { property: "og:title", content: "PDF Menu — QuickServe" },
      { property: "og:description", content: "Preserve the original PDF design and add clickable ordering hotspots." },
    ],
  }),
  component: MenuPage,
});

function MenuPage() {
  const { restaurantId } = Route.useParams();
  return <PdfMenuManager restaurantId={restaurantId} />;
}
