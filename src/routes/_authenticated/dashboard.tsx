import { createFileRoute } from "@tanstack/react-router";

import { StaffHeader } from "@/components/staff/StaffHeader";
import { useAccess } from "@/hooks/useSession";
import { useI18n } from "@/lib/i18n";
import { ROLE_HOME, ROLE_LABELS } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Workspaces — QuickServe" },
      {
        name: "description",
        content: "Choose a QuickServe workspace: restaurant management, kitchen, waiter or cashier.",
      },
      { property: "og:title", content: "Workspaces — QuickServe" },
      {
        property: "og:description",
        content: "Your QuickServe restaurant workspaces in one place.",
      },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { t, lang, pick } = useI18n();
  const { data, isPending, isError, error, refetch, isSuperAdmin } = useAccess();

  return (
    <div className="min-h-screen bg-background">
      <StaffHeader title={t("nav.dashboard")} />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="text-2xl font-semibold">{t("dash.welcome")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("dash.workspaces")}</p>

        {isPending && (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
        )}

        {isError && (
          <div className="mt-8 panel p-6">
            <p className="font-medium">{t("common.error")}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {error instanceof Error ? error.message : ""}
            </p>
            <Button className="mt-4" size="sm" onClick={() => refetch()}>
              {t("common.retry")}
            </Button>
          </div>
        )}

        {!isPending && !isError && (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {isSuperAdmin && (
              <div className="panel flex flex-col justify-between p-6">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-accent-foreground">
                    {ROLE_LABELS.super_admin[lang]}
                  </span>
                  <h2 className="mt-2 text-lg font-semibold">
                    {lang === "ar" ? "منصة QuickServe" : "QuickServe platform"}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {lang === "ar"
                      ? "إدارة جميع المطاعم والاشتراكات."
                      : "Manage every restaurant and subscription."}
                  </p>
                </div>
                <p className="mt-4 text-xs text-muted-foreground">
                  {lang === "ar"
                    ? `مساحة العمل: ${ROLE_HOME.super_admin} — تُبنى في المرحلة القادمة`
                    : `Workspace: ${ROLE_HOME.super_admin} — ships in the next phase`}
                </p>
              </div>
            )}

            {(data ?? [])
              .filter((m) => m.role !== "super_admin")
              .map((m) => (
                <div key={m.id} className="panel flex flex-col justify-between p-6">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {ROLE_LABELS[m.role][lang]}
                    </span>
                    <h2 className="mt-2 text-lg font-semibold">
                      {pick(m.restaurant?.name, m.restaurant?.name)}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {m.restaurant?.is_active
                        ? lang === "ar"
                          ? "نشط"
                          : "Active"
                        : lang === "ar"
                          ? "غير نشط"
                          : "Inactive"}
                    </p>
                  </div>
                  <p className="mt-4 text-xs text-muted-foreground">
                    {lang === "ar"
                      ? `مساحة العمل: ${ROLE_HOME[m.role]} — تُبنى في المرحلة القادمة`
                      : `Workspace: ${ROLE_HOME[m.role]} — ships in the next phase`}
                  </p>
                </div>
              ))}

            {!isSuperAdmin && (data ?? []).length === 0 && (
              <div className="panel p-6 sm:col-span-2 lg:col-span-3">
                <p className="font-medium">{t("dash.noAccess")}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t("dash.noAccessHelp")}</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
