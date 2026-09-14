import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";

import { StaffHeader } from "@/components/staff/StaffHeader";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/manage")({
  component: ManageLayout,
});

function ManageLayout() {
  const { t } = useI18n();
  const pathname = useRouterState({ select: (state) => state.location.pathname.replace(/\/$/, "") });
  const atRestaurantPicker = pathname === "/manage";

  // Restaurant workspaces render their own single AppHeader in
  // /manage/$restaurantId/route.tsx. Keeping another header here caused the
  // duplicated mobile banner on Orders, Menu, Tables, Staff, and Analytics.
  if (!atRestaurantPicker) return <Outlet />;

  return (
    <div className="min-h-screen bg-background">
      <StaffHeader title={t("sa.manage.title")} />
      <main className="mx-auto max-w-7xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
