import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/kiosk/$slug")({
  head: () => ({ meta: [{ title: "Self-order kiosk — QuickServe" }] }),
  component: KioskRedirect,
});

function KioskRedirect() {
  const { slug } = Route.useParams();
  return <Navigate to="/r/$slug" params={{ slug }} search={{ mode: "kiosk" }} replace />;
}
