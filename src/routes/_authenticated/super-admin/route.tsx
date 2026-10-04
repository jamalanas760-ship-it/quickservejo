import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

import { SuperAdminLayout } from "@/components/superadmin/SuperAdminLayout";
import { usePlatformOwner } from "@/hooks/useSuperAdmin";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { humanError } from "@/lib/errors";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/super-admin")({
  component: SuperAdminGate,
});

function SuperAdminGate() {
  const { t, lang } = useI18n();
  const { data: isOwner, isPending, isError, error, refetch } = usePlatformOwner();

  if (isPending) {
    return (
      <div className="min-h-screen space-y-4 p-8">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError) return <main className="grid min-h-dvh place-items-center p-6"><div className="panel max-w-md space-y-3 p-6"><h1 className="text-xl font-semibold">{t("common.error")}</h1><p className="text-sm text-muted-foreground">{humanError(error, lang)}</p><Button onClick={() => void refetch()}>{t("common.retry")}</Button></div></main>;

  if (!isOwner) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="panel max-w-md p-8 text-center">
          <h1 className="text-xl font-semibold">{t("sa.unauthorized.title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("sa.unauthorized.body")}</p>
          <Button asChild className="mt-6">
            <Link to="/dashboard">{t("sa.unauthorized.back")}</Link>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <SuperAdminLayout>
      <Outlet />
    </SuperAdminLayout>
  );
}
