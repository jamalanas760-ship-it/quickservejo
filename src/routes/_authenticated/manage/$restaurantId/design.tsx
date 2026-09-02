import { createFileRoute } from "@tanstack/react-router";

import { PdfMenuManager } from "@/components/manage/PdfMenuManager";

export const Route = createFileRoute("/_authenticated/manage/$restaurantId/design")({
  head: () => ({
    meta: [
      { title: "PDF Menu & QR Ordering — QuickServe" },
      {
        name: "description",
        content: "Upload an existing restaurant PDF menu and connect it to QuickServe QR ordering and cart.",
      },
      { property: "og:title", content: "PDF Menu & QR Ordering — QuickServe" },
      { property: "og:description", content: "Turn an existing restaurant PDF menu into a QR ordering experience." },
    ],
  }),
  component: DesignPage,
});

function DesignPage() {
  const { restaurantId } = Route.useParams();
  return <PdfMenuManager restaurantId={restaurantId} />;
}
