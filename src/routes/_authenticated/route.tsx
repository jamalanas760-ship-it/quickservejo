import { createFileRoute, Outlet, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";

import { DeviceHeartbeat } from "@/components/app/DeviceHeartbeat";
import { OfflineOperationsBanner } from "@/components/app/OfflineOperationsBanner";
import { BottomNav } from "@/components/nav/BottomNav";
import { AppHeader } from "@/components/nav/AppHeader";
import { TenantBrandShell } from "@/components/tenant/TenantBrandShell";
import { useAccess } from "@/hooks/useSession";
import { usePresenceHeartbeat } from "@/hooks/usePresenceHeartbeat";
import { getResilientAuthenticatedUser, isAuthNetworkError } from "@/lib/auth-resilience";
import { frontlineHome, isFrontlineOnly } from "@/lib/permissions";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location, context }) => {
    let user;
    try {
      // getUser() is a remote validation call. Cache that validation briefly so
      // child-route navigation never waits on Supabase on every click. Auth
      // events invalidate the whole ["auth"] key immediately when state changes.
      user = await context.queryClient.fetchQuery({
        queryKey: ["auth", "route-user"],
        queryFn: getResilientAuthenticatedUser,
        staleTime: 5 * 60_000,
      });
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
  const { lang } = useI18n();
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
  const usesDedicatedChrome = /^\/(super-admin|kitchen|waiter|cashier)(?:\/|$)/.test(pathname);
  const persistentTitle = routeTitle(pathname, lang === "ar");

  useEffect(() => {
    if (blocked) void navigate({ to: frontlineHome(roles), replace: true });
  }, [blocked, navigate, roles]);

  return (
    <TenantBrandShell>
      <div className={cn("pb-24 lg:min-h-dvh lg:pb-0", !access.isSuperAdmin && "lg:ps-[var(--qs-shell-sidebar)]", !usesDedicatedChrome && "qs-persistent-chrome")}>
        {!usesDedicatedChrome ? <AppHeader title={persistentTitle} /> : null}
        {blocked ? null : <div className="qs-route-frame"><Outlet /></div>}
      </div>
      <DeviceHeartbeat />
      <OfflineOperationsBanner />
      <BottomNav />
    </TenantBrandShell>
  );
}

function routeTitle(pathname: string, ar: boolean) {
  const routes: Array<[RegExp, string, string]> = [
    [/^\/dashboard(?:\/|$)/, "Home", "الرئيسية"],
    [/^\/work(?:\/|$)/, "My Work", "عملي"],
    [/^\/shifts(?:\/|$)/, "Shifts & Handover", "الورديات والتسليم"],
    [/^\/approvals(?:\/|$)/, "Approvals", "الموافقات"],
    [/^\/automations(?:\/|$)/, "Automation Control Center", "مركز الأتمتة"],
    [/^\/bookings(?:\/|$)/, "Reservations", "الحجوزات"],
    [/^\/waitlist(?:\/|$)/, "Reservation Waitlist", "قائمة الانتظار"],
    [/^\/guests(?:\/|$)/, "Guests & Loyalty", "الضيوف والولاء"],
    [/^\/campaigns(?:\/|$)/, "CRM Campaigns", "حملات العملاء"],
    [/^\/daily-close(?:\/|$)/, "Daily Close", "إقفال اليوم"],
    [/^\/devices(?:\/|$)/, "Devices & Hardware", "الأجهزة والهاردوير"],
    [/^\/integrations(?:\/|$)/, "QuickServe Connect", "تكاملات QuickServe"],
    [/^\/notifications(?:\/|$)/, "Notifications", "الإشعارات"],
    [/^\/profile(?:\/|$)/, "Profile", "الملف الشخصي"],
    [/^\/manager(?:\/|$)/, "Operations workspace", "مساحة العمليات"],
    [/^\/hq(?:\/|$)/, "HQ", "المجموعة"],
    [/^\/host(?:\/|$)/, "Host", "الاستقبال"],
  ];
  const match = routes.find(([pattern]) => pattern.test(pathname));
  return match ? (ar ? match[2] : match[1]) : undefined;
}
