import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_authenticated/super-admin/restaurants/$restaurantId/menu",
)({
  component: LegacyMenuRedirect,
});

function LegacyMenuRedirect() {
  const { restaurantId } = Route.useParams();
  return <Navigate to="/super-admin/restaurants/$restaurantId/design" params={{ restaurantId }} replace />;
}
