import { createFileRoute, Outlet, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";

import { BottomNav } from "@/components/nav/BottomNav";
import { TenantBrandShell } from "@/components/tenant/TenantBrandShell";
import { useAccess } from "@/hooks/useSession";
import { getResilientAuthenticatedUser, isAuthNetworkError } from "@/lib/auth-resilience";
import { frontlineHome, isFrontlineOnly } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    let user;
    try {
      user = await getResilientAuthenticatedUser();
    } catch (error) {
      // A temporary Auth/transport outage must not escape the route guard as a
      // runtime error. Keep authentication authoritative and send the user to
      // the usable sign-in/recovery screen while preserving the return target.
      if (isAuthNetworkError(error)) {
        throw redirect({ to: "/auth", search: { redirect: location.href } });
      }
      throw error;
    }
    if (!user) throw redirect({ to: "/auth", search: { redirect: location.href } });
    return { user };
  },
  component: AuthenticatedShell,
});

const STAFF_BLOCKED_PREFIXES = ["/dashboard", "/manage", "/super-admin"];

function AuthenticatedShell() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { roles, isPending, isError } = useAccess();

  // Never infer permissions from an empty role set caused by a temporary
  // database/network failure. Only redirect once access data resolved cleanly.
  const accessResolved = !isPending && !isError;
  const staff = accessResolved && isFrontlineOnly(roles);
  const staffBlocked = staff && STAFF_BLOCKED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const roleRouteBlocked = staff && (
    (pathname.startsWith("/kitchen") && !roles.some((role) => role === "kitchen" || role === "manager")) ||
    (pathname.startsWith("/waiter") && !roles.includes("waiter")) ||
    (pathname.startsWith("/cashier") && !roles.includes("cashier"))
  );
  const blocked = staffBlocked || roleRouteBlocked;

  useEffect(() => {
    if (staffBlocked || roleRouteBlocked) {
      void navigate({ to: frontlineHome(roles), replace: true });
      return;
    }
  }, [navigate, roles, roleRouteBlocked, staffBlocked]);

  return (
    <TenantBrandShell>
      <div className="pb-24 lg:pb-0">{blocked ? null : <Outlet />}</div>
      <BottomNav />
    </TenantBrandShell>
  );
}
