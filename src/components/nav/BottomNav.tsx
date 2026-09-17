import { Link, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  Banknote,
  BellRing,
  BookOpenCheck,
  Boxes,
  BriefcaseBusiness,
  CalendarClock,
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
  Workflow,
} from "lucide-react";

import { BrandLogo } from "@/components/brand/BrandLogo";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useOperationalCounters } from "@/hooks/useOperationalCounters";
import { useAccess } from "@/hooks/useSession";
import { useI18n } from "@/lib/i18n";
import { membershipHasCapability, type Capability } from "@/lib/permissions";
import { readAppearance } from "@/lib/restaurant-appearance";
import { cn } from "@/lib/utils";

type Item = { to: string; icon: typeof Home; en: string; ar: string; exact?: boolean; capability?: Capability; badge?: "tasks" | "shifts" | "orders" | "unread" };

const FRONTLINE_ITEMS: Record<string, Item> = {
  kitchen: { to: "/kitchen", icon: ChefHat, en: "Kitchen", ar: "المطبخ" },
  waiter: { to: "/waiter", icon: UtensilsCrossed, en: "Floor", ar: "الصالة" },
  host: { to: "/host", icon: UtensilsCrossed, en: "Host", ar: "الاستقبال" },
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
  const counters = useOperationalCounters(restaurantId);

  if (access.isPending || access.isSuperAdmin) return null;

  const role = membership?.role ?? access.roles[0] ?? null;
  const overrides = membership?.permission_overrides ?? null;
  const can = (capability: Capability) => Boolean(role && membershipHasCapability(role, overrides, capability));
  const appearance = readAppearance(restaurant?.menu_theme);
  const useRestaurantLogo = Boolean(restaurant?.logo_url && !appearance.useQuickServeLogo);
  const managerial = role === "restaurant_admin" || role === "operations_manager" || role === "manager";
  const erpSpecialist = role === "inventory" || role === "procurement" || role === "accountant";
  const homeTo = role === "operations_manager" || role === "manager" ? "/manager" : erpSpecialist ? "/work" : "/dashboard";

  const managementItems: Item[] = restaurantId ? ([
    { to: homeTo, icon: role === "operations_manager" || role === "manager" ? UserRoundCog : Home, en: role === "operations_manager" ? "Operations" : role === "manager" ? "Shift" : "Home", ar: role === "operations_manager" ? "العمليات" : role === "manager" ? "الوردية" : "الرئيسية", exact: true },
    { to: "/work", icon: BriefcaseBusiness, en: "My Work", ar: "عملي", capability: "view_work", badge: "tasks" },
    { to: "/shifts", icon: CalendarClock, en: "Shifts", ar: "الورديات", capability: "view_work", badge: "shifts" },
    { to: "/bookings", icon: BookOpenCheck, en: "Bookings", ar: "الحجوزات", capability: "manage_tables" },
    { to: "/automations", icon: Workflow, en: "Automation", ar: "الأتمتة", capability: "manage_work" },
    { to: `/manage/${restaurantId}/orders`, icon: ClipboardList, en: "Orders", ar: "الطلبات", capability: "view_orders", badge: "orders" },
    { to: `/manage/${restaurantId}`, icon: UtensilsCrossed, en: "Menu", ar: "القائمة", exact: true, capability: "manage_menu" },
    { to: `/manage/${restaurantId}/tables`, icon: Table2, en: "Tables", ar: "الطاولات", capability: "manage_tables" },
    { to: `/manage/${restaurantId}/operations`, icon: Boxes, en: "ERP", ar: "ERP", capability: "view_erp" },
    { to: `/manage/${restaurantId}/analytics`, icon: BarChart3, en: "Analytics", ar: "التحليلات", capability: "view_analytics" },
    { to: `/manage/${restaurantId}/staff`, icon: Users, en: "Team", ar: "الفريق", capability: "manage_staff" },
    { to: "/notifications", icon: BellRing, en: "Alerts", ar: "التنبيهات", badge: "unread" },
    { to: "/profile", icon: User, en: "Profile", ar: "الحساب", exact: true },
  ] satisfies Item[]).filter((item) => !item.capability || can(item.capability)) : [];

  const frontlineItem = role ? FRONTLINE_ITEMS[role] : undefined;
  const workItem: Item | null = can("view_work") ? { to: "/work", icon: BriefcaseBusiness, en: "My Work", ar: "عملي", badge: "tasks" } : null;
  const shiftItem: Item | null = can("view_work") ? { to: "/shifts", icon: CalendarClock, en: "Shifts", ar: "الورديات", badge: "shifts" } : null;
  const bookingsItem: Item | null = can("manage_tables") ? { to: "/bookings", icon: BookOpenCheck, en: "Bookings", ar: "الحجوزات" } : null;
  const erpItem: Item | null = restaurantId && can("view_erp") ? { to: `/manage/${restaurantId}/operations`, icon: Boxes, en: "ERP", ar: "ERP" } : null;
  const alertsItem: Item = { to: "/notifications", icon: BellRing, en: "Alerts", ar: "التنبيهات", badge: "unread" };
  const profileItem: Item = { to: "/profile", icon: User, en: "Profile", ar: "الحساب" };
  const desktopItems: Item[] = managerial
    ? managementItems
    : erpSpecialist
      ? [workItem, shiftItem, erpItem, alertsItem, profileItem].filter(Boolean) as Item[]
      : frontlineItem
        ? [frontlineItem, workItem, shiftItem, bookingsItem, alertsItem, profileItem].filter(Boolean) as Item[]
        : restaurantId
          ? managementItems
          : [
              { to: "/dashboard", icon: Home, en: "Home", ar: "الرئيسية" },
              { to: "/manage", icon: Store, en: "Restaurants", ar: "المطاعم" },
              { to: "/profile", icon: Settings, en: "Settings", ar: "الإعدادات" },
            ];

  const mobilePriority = [homeTo, role && FRONTLINE_ITEMS[role]?.to, "/work", `/manage/${restaurantId}/orders`, "/bookings", `/manage/${restaurantId}/operations`, "/shifts"].filter(Boolean) as string[];
  const mobileCore: Item[] = [];
  for (const to of mobilePriority) {
    const item = desktopItems.find((candidate) => candidate.to === to);
    if (item && !mobileCore.some((candidate) => candidate.to === item.to) && mobileCore.length < 4) mobileCore.push(item);
  }
  for (const item of desktopItems) {
    if (mobileCore.length >= 4) break;
    if (!mobileCore.some((candidate) => candidate.to === item.to) && item.en !== "Profile" && item.en !== "Alerts") mobileCore.push(item);
  }
  const moreItems = desktopItems.filter((item) => !mobileCore.some((candidate) => candidate.to === item.to));

  function activeFor(item: Item) {
    if (item.exact) return pathname.replace(/\/$/, "") === item.to.replace(/\/$/, "");
    return pathname === item.to || pathname.startsWith(`${item.to}/`);
  }

  function countFor(item: Item) {
    if (!item.badge) return 0;
    return counters.data?.[item.badge] ?? 0;
  }

  const brand = useRestaurantLogo ? (
    <span className="flex min-w-0 items-center gap-2">
      <span className="flex h-10 max-w-[112px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/70 bg-white px-2 shadow-sm"><img src={restaurant!.logo_url!} alt={restaurant?.name ?? "Restaurant"} className="h-7 w-auto max-w-full object-contain" /></span>
      <span className="truncate text-sm font-bold">{restaurant?.name}</span>
    </span>
  ) : (
    <BrandLogo className="size-8" accentClassName="text-[#ff5a0a]" textClassName="text-[18px] text-foreground" />
  );

  const navItem = (item: Item, mobile = false) => {
    const active = activeFor(item);
    const Icon = item.icon;
    const count = countFor(item);
    if (mobile) return <Link key={`${item.to}-${item.en}`} to={item.to as never} className={cn("relative flex min-h-[66px] flex-col items-center justify-center gap-1 text-[10px] font-semibold transition", active ? "text-[var(--restaurant-selected-nav,#ff5a0a)]" : "text-muted-foreground")}>
      <span className="relative"><Icon className="size-5" />{count > 0 ? <span className="absolute -end-2.5 -top-2 min-w-[17px] rounded-full bg-red-500 px-1 text-center text-[8px] font-black leading-[17px] text-white">{count > 99 ? "99+" : count}</span> : null}</span>
      <span className="max-w-20 truncate">{lang === "ar" ? item.ar : item.en}</span>
      {active ? <span className="absolute inset-x-5 bottom-0 h-0.5 rounded-full bg-[var(--restaurant-selected-nav,#ff5a0a)]" /> : null}
    </Link>;
    return <Link to={item.to as never} data-active={active} className="qs-sidebar-item" aria-current={active ? "page" : undefined}>
      <Icon className="size-[18px] shrink-0" />
      <span className="min-w-0 flex-1 truncate">{lang === "ar" ? item.ar : item.en}</span>
      {count > 0 ? <span className="min-w-6 rounded-full bg-[#ff5a0a] px-1.5 py-0.5 text-center text-[10px] font-bold text-white">{count > 99 ? "99+" : count}</span> : null}
    </Link>;
  };

  return (
    <>
      <aside className="qs-sidebar-shell fixed inset-y-0 start-0 z-50 hidden w-[196px] flex-col lg:flex">
        <div className="flex h-[68px] items-center border-b border-border px-4">
          <Link to={homeTo as never} className="min-w-0 text-foreground" aria-label={restaurant?.name || "QuickServe dashboard"}>{brand}</Link>
        </div>
        <nav className="qs-scroll flex-1 overflow-y-auto px-3 py-5" aria-label={lang === "ar" ? "التنقل الرئيسي" : "Primary navigation"}>
          <ul className="space-y-1">
            {desktopItems.map((item, index) => {
              const divider = item.en === "Team" || item.en === "Profile" || item.en === "ERP";
              return <li key={`${item.to}-${item.en}`} className={divider && index > 0 ? "mt-4 border-t border-border pt-4" : ""}>{navItem(item)}</li>;
            })}
          </ul>
        </nav>
        {managerial ? <div className="p-3"><div className="rounded-[18px] border border-border/70 bg-card/70 p-4 text-muted-foreground"><span className="grid size-8 place-items-center rounded-full bg-orange-50 text-[#ff5a0a] dark:bg-orange-950/30"><BriefcaseBusiness className="size-4" /></span><p className="mt-3 text-[12px] font-medium leading-5">{lang === "ar" ? "المهام والموافقات وERP حسب مسؤولياتك." : "Tasks, approvals and ERP are scoped to your responsibilities."}</p></div></div> : null}
      </aside>

      <nav aria-label={lang === "ar" ? "التنقل الرئيسي" : "Primary navigation"} className="safe-bottom fixed inset-x-2 bottom-2 z-50 lg:hidden">
        <div className="grid grid-cols-5 overflow-hidden rounded-[20px] border border-border bg-card/96 px-1 shadow-[0_14px_42px_rgba(15,23,42,.16)] backdrop-blur-xl">
          {mobileCore.map((item) => navItem(item, true))}
          <Sheet>
            <SheetTrigger asChild>
              <button type="button" className={cn("relative flex min-h-[66px] flex-col items-center justify-center gap-1 text-[10px] font-semibold transition", moreItems.some(activeFor) ? "text-[var(--restaurant-selected-nav,#ff5a0a)]" : "text-muted-foreground")}>
                <span className="relative"><MoreHorizontal className="size-5" />{moreItems.reduce((sum, item) => sum + countFor(item), 0) > 0 ? <span className="absolute -end-2.5 -top-2 min-w-[17px] rounded-full bg-red-500 px-1 text-center text-[8px] font-black leading-[17px] text-white">{Math.min(99, moreItems.reduce((sum, item) => sum + countFor(item), 0))}{moreItems.reduce((sum, item) => sum + countFor(item), 0) > 99 ? "+" : ""}</span> : null}</span>
                <span>{lang === "ar" ? "المزيد" : "More"}</span>
              </button>
            </SheetTrigger>
            <SheetContent side={lang === "ar" ? "left" : "right"} className="safe-bottom w-[min(88vw,360px)] overflow-y-auto p-0">
              <SheetHeader className="border-b border-border p-5 text-start"><SheetTitle>{lang === "ar" ? "كل الأدوات" : "All tools"}</SheetTitle></SheetHeader>
              <div className="grid gap-1 p-3">
                {moreItems.map((item) => {
                  const Icon = item.icon;
                  const count = countFor(item);
                  return <Link key={`${item.to}-${item.en}-more`} to={item.to as never} className={cn("flex min-h-14 items-center gap-3 rounded-2xl px-3.5 transition", activeFor(item) ? "bg-orange-500/10 text-[#ff5a0a]" : "hover:bg-muted")}>
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted/70"><Icon className="size-[18px]" /></span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{lang === "ar" ? item.ar : item.en}</span>
                    {count > 0 ? <span className="min-w-6 rounded-full bg-red-500 px-1.5 py-0.5 text-center text-[10px] font-bold text-white">{count > 99 ? "99+" : count}</span> : null}
                  </Link>;
                })}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </>
  );
}
