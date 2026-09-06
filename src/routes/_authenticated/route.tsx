import { createFileRoute, Outlet, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";

import { supabase } from "@/integrations/supabase/client";
import { BottomNav } from "@/components/nav/BottomNav";
import { useAccess } from "@/hooks/useSession";
import { frontlineHome, isFrontlineOnly } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth", search: { redirect: location.href } });
    return { user: data.user };
  },
  component: AuthenticatedShell,
});

const STAFF_BLOCKED_PREFIXES = ["/dashboard", "/manage", "/super-admin", "/profile"];
const MANAGEMENT_ONLY_PREFIXES = ["/kitchen"];

function AuthenticatedShell() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { roles, isPending } = useAccess();
  const staff = !isPending && isFrontlineOnly(roles);
  const staffBlocked = staff && STAFF_BLOCKED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const kitchenBlocked = !isPending && !staff && MANAGEMENT_ONLY_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const blocked = staffBlocked || kitchenBlocked;

  useEffect(() => {
    if (staffBlocked) {
      void navigate({ to: frontlineHome(roles), replace: true });
      return;
    }
    if (kitchenBlocked) {
      void navigate({ to: "/", replace: true });
    }
  }, [kitchenBlocked, navigate, roles, staffBlocked]);

  return (
    <>
      <div className="pb-20">{blocked ? null : <Outlet />}</div>
      <BottomNav />
    </>
  );
}
