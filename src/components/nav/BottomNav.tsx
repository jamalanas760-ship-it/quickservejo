import { Link, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  Banknote,
  BellRing,
  ChefHat,
  ClipboardList,
  Home,
  LayoutDashboard,
  Settings,
  Store,
  Table2,
  User,
  Users,
  UtensilsCrossed,
} from "lucide-react";

import { BrandLogo } from "@/components/brand/BrandLogo";
import { useAccess, useSupabaseSession } from "@/hooks/useSession";
import { useWorkspaceReport } from "@/hooks/useWorkspace";
import { useI18n } from "@/lib/i18n";
import { isFrontlineOnly } from "@/lib/permissions";
import { cn } from "@/lib/utils";

type Item = { to: string; icon: typeof Home; en: string; ar: string; exact?: boolean };

const TASK_ITEMS: Partial<Record<string, Item>> = {
  manager: { to: "/kitchen", icon: LayoutDashboard, en: "Operations", ar: "العمليات" },
  kitchen: { to: "/kitchen", icon: ChefHat, en: "Kitchen", ar: "المطبخ" },
  waiter: { to: "/waiter", icon: UtensilsCrossed, en: "Floor", ar: "الصالة" },
  cashier: { to: "/cashier", icon: Banknote, en: "Cashier", ar: "الكاشير" },
};

export function BottomNav() {
  const { lang } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const access = useAccess();
  const session = useSupabaseSession();

  const frontline = isFrontlineOnly(access.roles);
  const selectedId = pathname.match(/^\/manage\/([^/]+)/)?.[1];
  const membership = (access.data ?? []).find(
    (row) => row.restaurant_id && row.restaurant && (!selectedId || row.restaurant_id === selectedId),
  );
  const adminMembership = (access.data ?? []).find(
    (row) => row.role === "restaurant_admin" && row.restaurant_id && row.restaurant,
  );
  const current = membership ?? adminMembership ?? (access.data ?? []).find((row) => row.restaurant_id && row.restaurant);
  const restaurantId = current?.restaurant_id ?? null;
  const report = useWorkspaceReport(restaurantId);
  const openOrders = report.data?.openOrders ?? 0;

  if (access.isPending || access.isSuperAdmin) return null;

  const desktopItems: Item[] = restaurantId
    ? [
        { to: "/dashboard", icon: Home, en: "Overview", ar: "نظرة عامة" },
        { to: `/manage/${restaurantId}/orders`, icon: ClipboardList, en: "Orders", ar: "الطلبات" },
        { to: `/manage/${restaurantId}`, icon: UtensilsCrossed, en: "Menu", ar: "القائمة", exact: true },
        { to: `/manage/${restaurantId}/tables`, icon: Table2, en: "Tables", ar: "الطاولات" },
        { to: `/manage/${restaurantId}/staff`, icon: Users, en: "Staff", ar: "الفريق" },
        { to: "/kitchen", icon: ChefHat, en: "Kitchen Display", ar: "شاشة المطبخ" },
        { to: `/manage/${restaurantId}/analytics`, icon: BarChart3, en: "Analytics", ar: "التحليلات" },
        { to: "/manage", icon: Store, en: "Restaurants", ar: "المطاعم", exact: true },
        { to: "/profile", icon: Settings, en: "Settings", ar: "الإعدادات" },
      ]
    : [
        { to: "/dashboard", icon: Home, en: "Overview", ar: "نظرة عامة" },
        { to: "/manage", icon: Store, en: "Restaurants", ar: "المطاعم" },
        { to: "/profile", icon: Settings, en: "Settings", ar: "الإعدادات" },
      ];

  const task = access.roles.map((role) => TASK_ITEMS[role]).find(Boolean);
  const mobileItems = frontline
    ? ([task, { to: "/notifications", icon: BellRing, en: "Alerts", ar: "التنبيهات" }, { to: "/profile", icon: User, en: "Profile", ar: "الحساب" }].filter(Boolean) as Item[])
    : desktopItems.slice(0, 4);

  const user = session.data?.user;
  const meta = user?.user_metadata as { full_name?: string; name?: string } | undefined;
  const displayName = meta?.full_name || meta?.name || user?.email?.split("@")[0] || "QuickServe User";

  function activeFor(item: Item) {
    if (item.exact) return pathname.replace(/\/$/, "") === item.to.replace(/\/$/, "");
    return pathname === item.to || pathname.startsWith(`${item.to}/`);
  }

  return (
    <>
      <aside className="qs-sidebar-shell fixed inset-y-0 start-0 z-50 hidden w-[236px] flex-col lg:flex">
        <div className="flex h-[70px] items-center border-b border-white/5 px-5">
          <Link to="/dashboard" className="text-white">
            <BrandLogo className="size-9" accentClassName="text-white" textClassName="text-[20px] text-white" />
          </Link>
        </div>

        <nav className="qs-scroll flex-1 overflow-y-auto px-3 py-5" aria-label={lang === "ar" ? "التنقل الرئيسي" : "Primary navigation"}>
          <ul className="space-y-1">
            {desktopItems.map((item) => {
              const active = activeFor(item);
              const Icon = item.icon;
              const isOrders = item.en === "Orders";
              return (
                <li key={`${item.to}-${item.en}`}>
                  <Link to={item.to as never} data-active={active} className="qs-sidebar-item" aria-current={active ? "page" : undefined}>
                    <Icon className="size-[19px] shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{lang === "ar" ? item.ar : item.en}</span>
                    {isOrders && openOrders > 0 ? (
                      <span className="min-w-6 rounded-full bg-[#ff5a0a] px-1.5 py-0.5 text-center text-[10px] font-bold text-white">{openOrders > 99 ? "99+" : openOrders}</span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="mx-3 mb-4 overflow-hidden rounded-[14px] border border-white/8 bg-white/[.04]">
          <div className="relative h-[178px] overflow-hidden p-4">
            <img src="/signin-restaurant.webp" alt="" className="absolute inset-0 h-full w-full object-cover opacity-35" loading="lazy" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#101519] via-[#101519]/75 to-transparent" />
            <div className="relative flex h-full flex-col justify-end">
              <p className="font-display text-[15px] font-bold leading-5 text-white">Faster Operations<br />Happier Guests</p>
              <p className="mt-2 text-[11px] leading-4 text-white/60">Powering great food experiences every day.</p>
            </div>
          </div>
        </div>

        <Link to="/profile" className="flex items-center gap-3 border-t border-white/6 px-4 py-4 text-white hover:bg-white/[.04]">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#ff5a0a] font-display text-sm font-bold text-white">{displayName.slice(0, 1).toUpperCase()}</span>
          <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-bold">{displayName}</span><span className="block text-[10px] text-white/55">{frontline ? "Staff" : "Manager"}</span></span>
        </Link>
      </aside>

      <nav aria-label={lang === "ar" ? "التنقل الرئيسي" : "Primary navigation"} className="safe-bottom fixed inset-x-2 bottom-1 z-50 lg:hidden">
        <div className="grid overflow-hidden rounded-2xl border border-border bg-card/95 shadow-[0_14px_42px_rgba(0,0,0,.16)] backdrop-blur-xl" style={{ gridTemplateColumns: `repeat(${mobileItems.length}, minmax(0,1fr))` }}>
          {mobileItems.map((item) => {
            const active = activeFor(item);
            const Icon = item.icon;
            return (
              <Link key={`${item.to}-${item.en}`} to={item.to as never} className={cn("relative flex min-h-16 flex-col items-center justify-center gap-1 text-[10px] font-semibold", active ? "text-[#ff5a0a]" : "text-muted-foreground")}>
                <Icon className="size-5" />
                <span className="max-w-20 truncate">{lang === "ar" ? item.ar : item.en}</span>
                {active ? <span className="absolute inset-x-5 bottom-0 h-0.5 rounded-full bg-[#ff5a0a]" /> : null}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
