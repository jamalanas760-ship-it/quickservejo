import { Navigate } from "@tanstack/react-router";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccess } from "@/hooks/useSession";
import { frontlineHome, isFrontlineOnly } from "@/lib/permissions";

/** Legacy signed-in workspace home removed: route directly to the canonical role experience. */
export function WorkspaceHome() {
  const access = useAccess();

  if (access.isPending) {
    return <div className="mx-auto max-w-5xl p-4 sm:p-6"><Skeleton className="h-40 rounded-3xl" /></div>;
  }

  if (access.isSuperAdmin) return <Navigate to="/super-admin" replace />;
  if (isFrontlineOnly(access.roles)) return <Navigate to={frontlineHome(access.roles) as never} replace />;
  return <Navigate to="/dashboard" replace />;
}
