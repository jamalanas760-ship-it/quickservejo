import { createFileRoute, Outlet } from "@tanstack/react-router";

import { StaffHeader } from "@/components/staff/StaffHeader";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/manage")({
  component: ManageLayout,
});

function ManageLayout() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-background">
      <StaffHeader title={t("sa.manage.title")} />
      <main className="mx-auto max-w-7xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
