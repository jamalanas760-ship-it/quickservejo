import { createFileRoute, Outlet, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";

import { BottomNav } from "@/components/nav/BottomNav";
import { TenantBrandShell } from "@/components/tenant/TenantBrandShell";
import { useAccess } from "@/hooks/useSession";
import { usePresenceHeartbeat } from "@/hooks/usePresenceHeartbeat";
import { getResilientAuthenticatedUser, isAuthNetworkError } from "@/lib/auth-resilience";
import { frontlineHome, isFrontlineOnly } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    let user;
    try {
      user = await getResilientAuthenticatedUser();
    } catch (error) {
      if (isAuthNetworkError(error)) throw redirect({ to: "/auth", search: { redirect: location.href } });
      throw error;
    }
    if (!user) throw redirect({ to: "/auth", search: { redirect: location.href } });
    return { user };
  },
  component: AuthenticatedShell,
});

const FRONTLINE_BLOCKED_PREFIXES = ["/dashboard", "/manage", "/super-admin", "/manager"];
const ERP_SPECIALIST_ROLES = ["inventory", "procurement", "accountant"] as const;

function AuthenticatedShell() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const access = useAccess();
  usePresenceHeartbeat(!access.isPending && !access.isError);
  const { roles, isPending, isError } = access;
  const accessResolved = !isPending && !isError;
  const frontline = accessResolved && isFrontlineOnly(roles);
  const isManager = roles.includes("manager");
  const isErpSpecialist = roles.some((role) => ERP_SPECIALIST_ROLES.includes(role as (typeof ERP_SPECIALIST_ROLES)[number]));
  const isScopedErpRoute = /^\/manage\/[^/]+\/operations(?:\/|$)/.test(pathname);

  // Managers are operational users with a dedicated /manager home and may enter
  // capability-guarded /manage pages. ERP specialists are frontline-scoped users,
  // but must be able to enter only their restaurant's capability-guarded ERP route.
  // Kitchen/waiter/cashier/host users remain isolated from management workspaces.
  const frontlineBlocked = frontline
    && !isManager
    && !(isErpSpecialist && isScopedErpRoute)
    && FRONTLINE_BLOCKED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  const managerWrongHome = isManager && pathname === "/dashboard";
  const roleRouteBlocked = frontline && (
    (pathname.startsWith("/manager") && !isManager) ||
    (pathname.startsWith("/kitchen") && !roles.some((role) => role === "kitchen" || role === "manager")) ||
    (pathname.startsWith("/waiter") && !roles.includes("waiter")) ||
    (pathname.startsWith("/host") && !roles.includes("host")) ||
    (pathname.startsWith("/cashier") && !roles.includes("cashier"))
  );
  const blocked = frontlineBlocked || managerWrongHome || roleRouteBlocked;

  useEffect(() => {
    if (blocked) void navigate({ to: frontlineHome(roles), replace: true });
  }, [blocked, navigate, roles]);

  return (
    <TenantBrandShell>
      <div className={cn("pb-24 lg:min-h-dvh lg:pb-0", !access.isSuperAdmin && "lg:ps-[224px] xl:ps-[224px]")}>
        {blocked ? null : <div key={pathname} className="qs-route-frame"><Outlet /></div>}
      </div>
      <BottomNav />
    </TenantBrandShell>
  );
}
