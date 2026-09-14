import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_authenticated/super-admin/restaurants/$restaurantId/design",
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/super-admin/restaurants/$restaurantId/menu",
      params: { restaurantId: params.restaurantId },
      replace: true,
    });
  },
  component: () => null,
});
