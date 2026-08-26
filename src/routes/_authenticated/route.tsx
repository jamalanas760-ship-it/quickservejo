import {
  createFileRoute,
  Outlet,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect } from "react";

import { supabase } from "@/integrations/supabase/client";
import { BottomNav } from "@/components/nav/BottomNav";
import { useAccess } from "@/hooks/useSession";
import { frontlineHome, isFrontlineOnly } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth", search: { redirect: location.href } });
    }
    return { user: data.user };
  },
  component: AuthenticatedShell,
});

/** Areas frontline staff (kitchen / waiter / cashier) must never reach. */
const ADMIN_ONLY_PREFIXES = ["/dashboard", "/manage", "/super-admin"];

function AuthenticatedShell() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { roles, isPending } = useAccess();

  const blocked =
    !isPending &&
    isFrontlineOnly(roles) &&
    ADMIN_ONLY_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  useEffect(() => {
    if (blocked) void navigate({ to: frontlineHome(roles), replace: true });
  }, [blocked, navigate, roles]);

  return (
    <>
      <div className="pb-20">{blocked ? null : <Outlet />}</div>
      <BottomNav />
    </>
  );
}
