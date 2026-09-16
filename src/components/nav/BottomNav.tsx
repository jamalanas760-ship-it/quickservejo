import { Link, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  Banknote,
  BellRing,
  ChefHat,
  ClipboardList,
  Home,
  MoreHorizontal,
  Settings,
  Store,
  Table2,
  User,
  Users,
  UtensilsCrossed,
} from "lucide-react";

import { BrandLogo } from "@/components/brand/BrandLogo";
import { useAccess } from "@/hooks/useSession";
import { useWorkspaceReport } from "@/hooks/useWorkspace";
import { useI18n } from "@/lib/i18n";
import { readAppearance } from "@/lib/restaurant-appearance";
import { isFrontlineOnly } from "@/lib/permissions";
import { cn } from "@/lib/utils";

type Item = { to: string; icon: typeof Home; en: string; ar: string; exact?: boolean };

const TASK_ITEMS: Partial<Record<string, Item>> = {
  manager: { to: "/manager", icon: ClipboardList, en: "Manager", ar: "المدير" },
  kitchen: { to: "/kitchen", icon: ChefHat, en: "Kitchen", ar: "المطبخ" },
  waiter: { to: "/waiter", icon: UtensilsCrossed, en: "Floor", ar: "الصالة" },
  cashier: { to: "/cashier", icon: Banknote, en: "Cashier", ar: "الكاشير" },
};

export function BottomNav() {
  const { lang } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const access = useAccess();
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
  const appearance = readAppearance(current?.restaurant?.menu_theme);
  const report = useWorkspaceReport(restaurantId);
  const openOrders = report.data?.openOrders ?? 0;

  if (access.isPending || access.isSuperAdmin) return null;

  const desktopItems: Item[] = frontline
    ? ([task, { to: "/notifications", icon: BellRing, en: "Alerts", ar: "التنبيهات" }, { to: "/profile", icon: User, en: "Profile", ar: "الحساب" }].filter(Boolean) as Item[])
    : restaurantId
    ? [
        { to: "/dashboard", icon: Home, en: "Home", ar: "الرئيسية", exact: true },
        { to: `/manage/${restaurantId}/orders`, icon: ClipboardList, en: "Orders", ar: "الطلبات" },
        { to: `/manage/${restaurantId}`, icon: UtensilsCrossed, en: "Menu", ar: "القائمة", exact: true },
        { to: `/manage/${restaurantId}/tables`, icon: Table2, en: "Tables", ar: "الطاولات" },
        { to: `/manage/${restaurantId}/analytics`, icon: BarChart3, en: "Analytics", ar: "التحليلات" },
        { to: `/manage/${restaurantId}/staff`, icon: Users, en: "Team", ar: "الفريق" },
        { to: "/profile", icon: User, en: "Profile", ar: "الحساب", exact: true },
      ]
    : [
        { to: "/dashboard", icon: Home, en: "Home", ar: "الرئيسية" },
        { to: "/manage", icon: Store, en: "Restaurants", ar: "المطاعم" },
        { to: "/profile", icon: Settings, en: "Settings", ar: "الإعدادات" },
      ];

  const task = access.roles.map((role) => TASK_ITEMS[role]).find(Boolean);
  const mobileItems: Item[] = frontline
    ? ([
        task,
        { to: "/notifications", icon: BellRing, en: "Alerts", ar: "التنبيهات" },
        { to: "/profile", icon: User, en: "Profile", ar: "الحساب" },
      ].filter(Boolean) as Item[])
    : restaurantId
      ? [
          { to: "/dashboard", icon: Home, en: "Home", ar: "الرئيسية", exact: true },
          { to: `/manage/${restaurantId}/orders`, icon: ClipboardList, en: "Orders", ar: "الطلبات" },
          { to: `/manage/${restaurantId}`, icon: UtensilsCrossed, en: "Menu", ar: "القائمة", exact: true },
          { to: `/manage/${restaurantId}/tables`, icon: Table2, en: "Tables", ar: "الطاولات" },
          { to: "/profile", icon: MoreHorizontal, en: "More", ar: "المزيد", exact: true },
        ]
      : desktopItems.slice(0, 3);

  function activeFor(item: Item) {
    if (item.exact) return pathname.replace(/\/$/, "") === item.to.replace(/\/$/, "");
    return pathname === item.to || pathname.startsWith(`${item.to}/`);
  }

  return (
    <>
      <aside className="qs-sidebar-shell fixed inset-y-0 start-0 z-50 hidden w-[196px] flex-col lg:flex" style={{ backgroundColor: appearance.sidebarBackground, color: appearance.sidebarForeground }}>
        <div className="flex h-[68px] items-center border-b border-border px-5">
          <Link to="/dashboard" className="text-inherit" aria-label={current?.restaurant?.name || "QuickServe dashboard"}>
            {current?.restaurant?.logo_url ? <img src={current.restaurant.logo_url} alt={current.restaurant.name} className="h-9 max-w-[150px] object-contain" /> : <BrandLogo className="size-8" accentClassName="text-[#ff5a0a]" textClassName="text-[18px] text-inherit" />}
          </Link>
        </div>

        <nav className="qs-scroll flex-1 overflow-y-auto px-3 py-5" aria-label={lang === "ar" ? "التنقل الرئيسي" : "Primary navigation"}>
          <ul className="space-y-1">
            {desktopItems.map((item, index) => {
              const active = activeFor(item);
              const Icon = item.icon;
              const isOrders = item.en === "Orders";
              return (
                <li key={`${item.to}-${item.en}`} className={index === 5 ? "mt-4 border-t border-border pt-4" : ""}>
                  <Link to={item.to as never} data-active={active} className="qs-sidebar-item" aria-current={active ? "page" : undefined}>
                    <Icon className="size-[18px] shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{lang === "ar" ? item.ar : item.en}</span>
                    {isOrders && openOrders > 0 ? <span className="min-w-6 rounded-full bg-[#ff5a0a] px-1.5 py-0.5 text-center text-[10px] font-bold text-white">{openOrders > 99 ? "99+" : openOrders}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="p-3">
          <div className="rounded-[18px] bg-[#fff4ec] p-4 text-[#596678] dark:bg-orange-950/20 dark:text-slate-300">
            <span className="grid size-8 place-items-center rounded-full bg-white text-[#ff5a0a] shadow-sm dark:bg-slate-900"><ChefHat className="size-4" /></span>
            <p className="mt-3 text-[12px] font-medium leading-5">{lang === "ar" ? "الطعام الجيد يجمع الناس." : "Good food brings people together."}</p>
            <span className="mt-3 block h-0.5 w-5 rounded-full bg-[#ff5a0a]" />
          </div>
        </div>
      </aside>

      <nav aria-label={lang === "ar" ? "التنقل الرئيسي" : "Primary navigation"} className="safe-bottom fixed inset-x-3 bottom-2 z-50 lg:hidden">
        <div className="grid overflow-hidden rounded-[20px] border border-border bg-card/96 px-1 shadow-[0_14px_42px_rgba(15,23,42,.16)] backdrop-blur-xl" style={{ gridTemplateColumns: `repeat(${mobileItems.length}, minmax(0,1fr))` }}>
          {mobileItems.map((item) => {
            const active = activeFor(item);
            const Icon = item.icon;
            return (
              <Link key={`${item.to}-${item.en}`} to={item.to as never} className={cn("relative flex min-h-[66px] flex-col items-center justify-center gap-1 text-[10px] font-semibold transition", active ? "text-[#ff5a0a]" : "text-muted-foreground")}>
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
