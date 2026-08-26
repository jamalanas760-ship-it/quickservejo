import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useAccess } from "@/hooks/useSession";
import { useI18n } from "@/lib/i18n";
import { ROLE_LABELS } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/manage/")({
  head: () => ({
    meta: [
      { title: "My restaurant — QuickServe" },
      {
        name: "description",
        content: "Restaurant admin workspace: menu, tables, QR codes, staff, orders and analytics.",
      },
      { property: "og:title", content: "My restaurant — QuickServe" },
      { property: "og:description", content: "Manage your restaurant on QuickServe." },
    ],
  }),
  component: ManageIndex,
});

function ManageIndex() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const { data, isPending, isSuperAdmin } = useAccess();

  const tenants = (data ?? []).filter((m) => m.restaurant_id);
  const only = tenants.length === 1 ? tenants[0] : null;

  // A staff member with exactly one restaurant goes straight into it.
  useEffect(() => {
    if (only?.restaurant_id) {
      void navigate({
        to: "/manage/$restaurantId",
        params: { restaurantId: only.restaurant_id },
        replace: true,
      });
    }
  }, [navigate, only?.restaurant_id]);

  if (isPending) return <Skeleton className="h-40 rounded-xl" />;

  if (tenants.length === 0) {
    return (
      <div className="panel p-8 text-center">
        <p className="font-medium">{t("dash.noAccess")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("dash.noAccessHelp")}</p>
        {isSuperAdmin ? (
          <Button asChild className="mt-4" size="sm">
            <Link to="/super-admin/restaurants">{t("sa.rest.title")}</Link>
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {tenants.map((m) => (
        <div key={m.id} className="panel flex flex-col justify-between p-6">
          <div>
            <span className="text-xs uppercase text-muted-foreground">
              {ROLE_LABELS[m.role][lang]}
            </span>
            <h2 className="mt-1 text-lg font-semibold">{m.restaurant?.name}</h2>
          </div>
          <Button asChild className="mt-4" size="sm">
            <Link to="/manage/$restaurantId" params={{ restaurantId: m.restaurant_id! }}>
              {t("dash.open")}
            </Link>
          </Button>
        </div>
      ))}
    </div>
  );
}
