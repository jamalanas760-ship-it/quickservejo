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
  UserRoundCog,
  Users,
  UtensilsCrossed,
} from "lucide-react";

import { BrandLogo } from "@/components/brand/BrandLogo";
import { useAccess } from "@/hooks/useSession";
import { useWorkspaceReport } from "@/hooks/useWorkspace";
import { useI18n } from "@/lib/i18n";
import { membershipHasCapability, type Capability } from "@/lib/permissions";
import { readAppearance } from "@/lib/restaurant-appearance";
import { cn } from "@/lib/utils";

type Item = { to: string; icon: typeof Home; en: string; ar: string; exact?: boolean; capability?: Capability };

const FRONTLINE_ITEMS: Record<string, Item> = {
  kitchen: { to: "/kitchen", icon: ChefHat, en: "Kitchen", ar: "المطبخ" },
  waiter: { to: "/waiter", icon: UtensilsCrossed, en: "Floor", ar: "الصالة" },
  cashier: { to: "/cashier", icon: Banknote, en: "Cashier", ar: "الكاشير" },
};

export function BottomNav() {
  const { lang } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const access = useAccess();
  const selectedId = pathname.match(/^\/manage\/([^/]+)/)?.[1];
  const membership = (access.data ?? []).find((row) => row.restaurant_id && row.restaurant && (!selectedId || row.restaurant_id === selectedId))
    ?? (access.data ?? []).find((row) => row.restaurant_id && row.restaurant)
    ?? null;
  const restaurantId = membership?.restaurant_id ?? null;
  const restaurant = membership?.restaurant ?? null;
  const report = useWorkspaceReport(restaurantId);
  const openOrders = report.data?.openOrders ?? 0;

  if (access.isPending || access.isSuperAdmin) return null;

  const role = membership?.role ?? access.roles[0] ?? null;
  const overrides = membership?.permission_overrides ?? null;
  const can = (capability: Capability) => Boolean(role && membershipHasCapability(role, overrides, capability));
  const appearance = readAppearance(restaurant?.menu_theme);
  const useRestaurantLogo = Boolean(restaurant?.logo_url && !appearance.useQuickServeLogo);
  const homeTo = role === "manager" ? "/manager" : "/dashboard";

  const managementItems: Item[] = restaurantId ? [
    { to: homeTo, icon: role === "manager" ? UserRoundCog : Home, en: role === "manager" ? "Manager" : "Home", ar: role === "manager" ? "المدير" : "الرئيسية", exact: true },
    { to: `/manage/${restaurantId}/orders`, icon: ClipboardList, en: "Orders", ar: "الطلبات", capability: "view_orders" },
    { to: `/manage/${restaurantId}`, icon: UtensilsCrossed, en: "Menu", ar: "القائمة", exact: true, capability: "manage_menu" },
    { to: `/manage/${restaurantId}/tables`, icon: Table2, en: "Tables", ar: "الطاولات", capability: "manage_tables" },
    { to: `/manage/${restaurantId}/analytics`, icon: BarChart3, en: "Analytics", ar: "التحليلات", capability: "view_analytics" },
    { to: `/manage/${restaurantId}/staff`, icon: Users, en: "Team", ar: "الفريق", capability: "manage_staff" },
    { to: "/profile", icon: User, en: "Profile", ar: "الحساب", exact: true },
  ].filter((item) => !item.capability || can(item.capability)) : [];

  const frontlineItem = role ? FRONTLINE_ITEMS[role] : undefined;
  const desktopItems: Item[] = role === "manager"
    ? managementItems
    : role === "restaurant_admin"
      ? managementItems
      : frontlineItem
        ? [frontlineItem, { to: "/notifications", icon: BellRing, en: "Alerts", ar: "التنبيهات" }, { to: "/profile", icon: User, en: "Profile", ar: "الحساب" }]
        : restaurantId
          ? managementItems
          : [
              { to: "/dashboard", icon: Home, en: "Home", ar: "الرئيسية" },
              { to: "/manage", icon: Store, en: "Restaurants", ar: "المطاعم" },
              { to: "/profile", icon: Settings, en: "Settings", ar: "الإعدادات" },
            ];

  const mobileItems = desktopItems.length > 5
    ? desktopItems.filter((item) => [homeTo, `/manage/${restaurantId}/orders`, `/manage/${restaurantId}`, `/manage/${restaurantId}/tables`, "/profile"].includes(item.to)).slice(0, 5)
    : desktopItems;

  function activeFor(item: Item) {
    if (item.exact) return pathname.replace(/\/$/, "") === item.to.replace(/\/$/, "");
    return pathname === item.to || pathname.startsWith(`${item.to}/`);
  }

  const brand = useRestaurantLogo ? (
    <span className="flex min-w-0 items-center gap-2">
      <img src={restaurant!.logo_url!} alt="" className="size-9 rounded-xl object-cover ring-1 ring-border" />
      <span className="truncate text-sm font-bold">{restaurant?.name}</span>
    </span>
  ) : (
    <BrandLogo className="size-8" accentClassName="text-[#ff5a0a]" textClassName="text-[18px] text-foreground" />
  );

  return (
    <>
      <aside className="qs-sidebar-shell fixed inset-y-0 start-0 z-50 hidden w-[196px] flex-col lg:flex">
        <div className="flex h-[68px] items-center border-b border-border px-4">
          <Link to={homeTo as never} className="min-w-0 text-foreground" aria-label={restaurant?.name || "QuickServe dashboard"}>{brand}</Link>
        </div>

        <nav className="qs-scroll flex-1 overflow-y-auto px-3 py-5" aria-label={lang === "ar" ? "التنقل الرئيسي" : "Primary navigation"}>
          <ul className="space-y-1">
            {desktopItems.map((item, index) => {
              const active = activeFor(item);
              const Icon = item.icon;
              const isOrders = item.en === "Orders";
              const divider = item.en === "Team" || item.en === "Profile";
              return (
                <li key={`${item.to}-${item.en}`} className={divider && index > 0 ? "mt-4 border-t border-border pt-4" : ""}>
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

        {role === "restaurant_admin" || role === "manager" ? (
          <div className="p-3">
            <div className="rounded-[18px] border border-border/70 bg-card/70 p-4 text-muted-foreground">
              <span className="grid size-8 place-items-center rounded-full bg-orange-50 text-[#ff5a0a] dark:bg-orange-950/30"><ChefHat className="size-4" /></span>
              <p className="mt-3 text-[12px] font-medium leading-5">{lang === "ar" ? "مساحة عمل مصممة لدورك." : "A workspace tailored to your role."}</p>
            </div>
          </div>
        ) : null}
      </aside>

      <nav aria-label={lang === "ar" ? "التنقل الرئيسي" : "Primary navigation"} className="safe-bottom fixed inset-x-3 bottom-2 z-50 lg:hidden">
        <div className="grid overflow-hidden rounded-[20px] border border-border bg-card/96 px-1 shadow-[0_14px_42px_rgba(15,23,42,.16)] backdrop-blur-xl" style={{ gridTemplateColumns: `repeat(${Math.max(1, mobileItems.length)}, minmax(0,1fr))` }}>
          {mobileItems.map((item) => {
            const active = activeFor(item);
            const Icon = item.icon;
            return (
              <Link key={`${item.to}-${item.en}`} to={item.to as never} className={cn("relative flex min-h-[66px] flex-col items-center justify-center gap-1 text-[10px] font-semibold transition", active ? "text-[var(--restaurant-selected-nav,#ff5a0a)]" : "text-muted-foreground")}>
                <Icon className="size-5" />
                <span className="max-w-20 truncate">{lang === "ar" ? item.ar : item.en}</span>
                {active ? <span className="absolute inset-x-5 bottom-0 h-0.5 rounded-full bg-[var(--restaurant-selected-nav,#ff5a0a)]" /> : null}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
