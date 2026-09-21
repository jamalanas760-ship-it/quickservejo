import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import {
  BarChart3,
  Banknote,
  BellRing,
  Boxes,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  ChefHat,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  Home,
  HeartHandshake,
  Megaphone,
  MonitorSmartphone,
  MoreHorizontal,
  PlugZap,
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
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useOperationalCounters } from "@/hooks/useOperationalCounters";
import { useAccess } from "@/hooks/useSession";
import { useI18n } from "@/lib/i18n";
import { membershipHasCapability, type Capability } from "@/lib/permissions";
import { readAppearance } from "@/lib/restaurant-appearance";
import { cn } from "@/lib/utils";

type NavGroup = "overview" | "service" | "operations" | "growth" | "admin";
type Item = { to: string; icon: typeof Home; en: string; ar: string; exact?: boolean; capability?: Capability; badge?: "tasks" | "shifts" | "orders" | "unread"; group?: NavGroup };

const FRONTLINE_ITEMS: Record<string, Item> = {
  kitchen: { to: "/kitchen", icon: ChefHat, en: "Kitchen", ar: "المطبخ" },
  waiter: { to: "/waiter", icon: UtensilsCrossed, en: "Floor", ar: "الصالة" },
  host: { to: "/host", icon: UtensilsCrossed, en: "Host", ar: "الاستقبال" },
  cashier: { to: "/cashier", icon: Banknote, en: "Cashier", ar: "الكاشير" },
};

export function BottomNav() {
  const { lang } = useI18n();
  const [moreOpen, setMoreOpen] = useState(false);
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
  const multiLocation = new Set((access.data ?? []).map((row) => row.restaurant_id).filter(Boolean)).size > 1;
  const erpSpecialist = role === "inventory" || role === "procurement" || role === "accountant";
  const homeTo = role === "operations_manager" || role === "manager" ? "/manager" : erpSpecialist ? "/work" : "/dashboard";

  const managementItems: Item[] = restaurantId ? ([
    { to: homeTo, icon: role === "operations_manager" || role === "manager" ? UserRoundCog : Home, en: role === "operations_manager" ? "Operations" : role === "manager" ? "Shift" : "Home", ar: role === "operations_manager" ? "العمليات" : role === "manager" ? "الوردية" : "الرئيسية", exact: true, group: "overview" },
    { to: "/hq", icon: Building2, en: "HQ", ar: "المجموعة", group: "overview" },
    { to: "/work", icon: BriefcaseBusiness, en: "My Work", ar: "عملي", capability: "view_work", badge: "tasks", group: "overview" },
    { to: "/shifts", icon: CalendarClock, en: "Shifts", ar: "الورديات", capability: "view_work", badge: "shifts", group: "operations" },
    { to: "/automations", icon: Workflow, en: "Automation", ar: "الأتمتة", capability: "manage_work", group: "operations" },
    { to: `/manage/${restaurantId}/orders`, icon: ClipboardList, en: "Orders", ar: "الطلبات", capability: "view_orders", badge: "orders", group: "service" },
    { to: `/manage/${restaurantId}`, icon: UtensilsCrossed, en: "Menu", ar: "القائمة", exact: true, capability: "manage_menu", group: "service" },
    { to: `/manage/${restaurantId}/tables`, icon: Table2, en: "Tables", ar: "الطاولات", capability: "manage_tables", group: "service" },
    { to: "/bookings", icon: CalendarClock, en: "Reservations", ar: "الحجوزات", capability: "manage_tables", group: "service" },
    { to: "/waitlist", icon: Clock3, en: "Waitlist", ar: "الانتظار", capability: "manage_tables", group: "service" },
    { to: `/manage/${restaurantId}/operations`, icon: Boxes, en: "ERP", ar: "ERP", capability: "view_erp", group: "operations" },
    { to: `/manage/${restaurantId}/analytics`, icon: BarChart3, en: "Analytics", ar: "التحليلات", capability: "view_analytics", group: "operations" },
    { to: "/daily-close", icon: ClipboardCheck, en: "Daily Close", ar: "إقفال اليوم", capability: "manage_payments", group: "operations" },
    { to: "/guests", icon: HeartHandshake, en: "Guests", ar: "الضيوف", capability: "view_analytics", group: "growth" },
    { to: "/campaigns", icon: Megaphone, en: "Campaigns", ar: "الحملات", capability: "manage_restaurant", group: "growth" },
    { to: "/integrations", icon: PlugZap, en: "Connect", ar: "التكاملات", capability: "manage_restaurant", group: "admin" },
    { to: "/devices", icon: MonitorSmartphone, en: "Devices", ar: "الأجهزة", capability: "manage_restaurant", group: "admin" },
    { to: `/manage/${restaurantId}/staff`, icon: Users, en: "Team", ar: "الفريق", capability: "manage_staff", group: "admin" },
    { to: "/profile", icon: User, en: "Profile", ar: "الحساب", exact: true, group: "admin" },
  ] satisfies Item[]).filter((item) => (item.to !== "/hq" || multiLocation) && (!item.capability || can(item.capability))) : [];

  const frontlineItem = role ? FRONTLINE_ITEMS[role] : undefined;
  const workItem: Item | null = can("view_work") ? { to: "/work", icon: BriefcaseBusiness, en: "My Work", ar: "عملي", badge: "tasks" } : null;
  const shiftItem: Item | null = can("view_work") ? { to: "/shifts", icon: CalendarClock, en: "Shifts", ar: "الورديات", badge: "shifts" } : null;
  const erpItem: Item | null = restaurantId && can("view_erp") ? { to: `/manage/${restaurantId}/operations`, icon: Boxes, en: "ERP", ar: "ERP" } : null;
  const desktopItems: Item[] = managerial
    ? managementItems
    : erpSpecialist
      ? [workItem, shiftItem, erpItem, { to: "/notifications", icon: BellRing, en: "Alerts", ar: "التنبيهات", badge: "unread" }, { to: "/profile", icon: User, en: "Profile", ar: "الحساب" }].filter(Boolean) as Item[]
      : frontlineItem
        ? [frontlineItem, workItem, shiftItem, { to: "/notifications", icon: BellRing, en: "Alerts", ar: "التنبيهات", badge: "unread" }, { to: "/profile", icon: User, en: "Profile", ar: "الحساب" }].filter(Boolean) as Item[]
        : restaurantId
          ? managementItems
          : [
              { to: "/dashboard", icon: Home, en: "Home", ar: "الرئيسية" },
              { to: "/manage", icon: Store, en: "Restaurants", ar: "المطاعم" },
              { to: "/profile", icon: Settings, en: "Settings", ar: "الإعدادات" },
            ];

  const mobilePriority = managerial
    ? [homeTo, `/manage/${restaurantId}/orders`, "/bookings", "/work"]
    : [homeTo, "/work", "/shifts", `/manage/${restaurantId}/operations`, "/profile"];
  const mobilePrimary = desktopItems.length > 5
    ? mobilePriority.flatMap((to) => desktopItems.find((item) => item.to === to) ?? []).filter((item, index, list) => list.findIndex(candidate => candidate.to === item.to) === index).slice(0, 4)
    : desktopItems;
  const mobileHasMore = desktopItems.some(item => !mobilePrimary.some(primary => primary.to === item.to));

  function groupLabel(group: NavGroup) {
    const labels: Record<NavGroup, { en: string; ar: string }> = {
      overview: { en: "Overview", ar: "نظرة عامة" },
      service: { en: "Service", ar: "الخدمة" },
      operations: { en: "Operations", ar: "العمليات" },
      growth: { en: "Guests & Growth", ar: "الضيوف والنمو" },
      admin: { en: "Administration", ar: "الإدارة" },
    };
    return lang === "ar" ? labels[group].ar : labels[group].en;
  }

  function countFor(item: Item) {
    return item.badge ? counters.data[item.badge] : 0;
  }

  function activeFor(item: Item) {
    if (item.exact) return pathname.replace(/\/$/, "") === item.to.replace(/\/$/, "");
    return pathname === item.to || pathname.startsWith(`${item.to}/`);
  }

  const brand = useRestaurantLogo ? (
    <span className="flex min-w-0 items-center gap-2">
      <span className="flex h-10 max-w-[112px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/70 bg-white px-2 shadow-sm"><img src={restaurant!.logo_url!} alt={restaurant?.name ?? "Restaurant"} className="h-7 w-auto max-w-full object-contain" /></span>
      <span className="truncate text-sm font-bold">{restaurant?.name}</span>
    </span>
  ) : (
    <BrandLogo className="size-8" accentClassName="text-[#ff5a0a]" textClassName="text-[18px] text-foreground" />
  );

  return (
    <>
      <aside className="qs-sidebar-shell fixed inset-y-0 start-0 z-50 hidden flex-col lg:flex">
        <div className="flex h-[var(--qs-shell-topbar)] items-center border-b border-border/80 px-4">
          <Link to={homeTo as never} className="min-w-0 text-foreground" aria-label={restaurant?.name || "QuickServe dashboard"}>{brand}</Link>
        </div>

        <nav className="qs-scroll flex-1 overflow-y-auto px-3 py-4" aria-label={lang === "ar" ? "التنقل الرئيسي" : "Primary navigation"}>
          <ul className="space-y-1">
            {desktopItems.map((item, index) => {
              const active = activeFor(item);
              const Icon = item.icon;
              const count = countFor(item);
              const previousGroup = index > 0 ? desktopItems[index - 1]?.group : undefined;
              const showGroup = managerial && item.group && item.group !== previousGroup;
              return (
                <li key={`${item.to}-${item.en}`} className={showGroup && index > 0 ? "mt-5" : ""}>
                  {showGroup ? <p className="mb-2 px-3 text-[9px] font-extrabold uppercase tracking-[.14em] text-muted-foreground">{groupLabel(item.group!)}</p> : null}
                  <Link to={item.to as never} data-active={active} className="qs-sidebar-item" aria-current={active ? "page" : undefined}>
                    <Icon className="size-[18px] shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{lang === "ar" ? item.ar : item.en}</span>
                    {count > 0 ? <span className="min-w-6 rounded-full bg-[#ff5a0a] px-1.5 py-0.5 text-center text-[10px] font-bold text-white shadow-sm">{count > 99 ? "99+" : count}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {managerial ? (
          <div className="p-3">
            <div className="qs-sidebar-support rounded-[18px] border p-4">
              <span className="grid size-8 place-items-center rounded-full bg-orange-50 text-[#ff5a0a] dark:bg-orange-950/30"><BriefcaseBusiness className="size-4" /></span>
              <p className="mt-3 text-[12px] font-medium leading-5">{lang === "ar" ? "المهام والموافقات وERP حسب مسؤولياتك." : "Tasks, approvals and ERP are scoped to your responsibilities."}</p>
            </div>
          </div>
        ) : null}
      </aside>

      <nav aria-label={lang === "ar" ? "التنقل الرئيسي" : "Primary navigation"} className="safe-bottom fixed inset-x-3 bottom-2 z-50 lg:hidden">
        <div className="grid overflow-hidden rounded-[19px] border border-border bg-card/96 px-1 shadow-[0_14px_42px_rgba(15,23,42,.16)] backdrop-blur-xl" style={{ gridTemplateColumns: `repeat(${Math.max(1, mobilePrimary.length + (mobileHasMore ? 1 : 0))}, minmax(0,1fr))` }}>
          {mobilePrimary.map((item) => {
            const active = activeFor(item);
            const Icon = item.icon;
            const count = countFor(item);
            return (
              <Link key={`${item.to}-${item.en}`} to={item.to as never} className={cn("relative flex min-h-[66px] flex-col items-center justify-center gap-1 text-[10px] font-semibold transition", active ? "text-[var(--restaurant-selected-nav,#ff5a0a)]" : "text-muted-foreground")}>
                <span className="relative"><Icon className="size-5" />{count > 0 ? <span className="absolute -end-2.5 -top-2 min-w-[17px] rounded-full bg-red-500 px-1 text-center text-[8px] font-black leading-[17px] text-white">{count > 99 ? "99+" : count}</span> : null}</span>
                <span className="max-w-20 truncate">{lang === "ar" ? item.ar : item.en}</span>
                {active ? <span className="absolute inset-x-5 bottom-0 h-0.5 rounded-full bg-[var(--restaurant-selected-nav,#ff5a0a)]" /> : null}
              </Link>
            );
          })}
          {mobileHasMore ? (
            <button type="button" onClick={() => setMoreOpen(true)} className={cn("relative flex min-h-[62px] flex-col items-center justify-center gap-1 text-[10px] font-semibold text-muted-foreground transition hover:text-foreground")}>
              <MoreHorizontal className="size-5" />
              <span>{lang === "ar" ? "المزيد" : "More"}</span>
            </button>
          ) : null}
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="max-h-[78dvh] overflow-y-auto rounded-t-[24px] border-x-0 border-b-0 p-0 lg:hidden">
          <SheetHeader className="sticky top-0 z-10 border-b border-border bg-card/95 px-5 py-4 text-start backdrop-blur-xl">
            <SheetTitle>{lang === "ar" ? "مساحة QuickServe" : "QuickServe workspace"}</SheetTitle>
            <SheetDescription>{lang === "ar" ? "كل الأدوات التي يسمح بها دورك، مرتبة حسب العمل." : "All tools available to your role, organized by workflow."}</SheetDescription>
          </SheetHeader>
          <div className="space-y-5 p-4 pb-[calc(24px+env(safe-area-inset-bottom))]">
            {(["overview","service","operations","growth","admin"] as NavGroup[]).map(group => {
              const items = desktopItems.filter(item => item.group === group || (!item.group && group === "overview"));
              if (items.length === 0) return null;
              return <section key={group}>
                <p className="mb-2 px-1 text-[10px] font-black uppercase tracking-[.14em] text-muted-foreground">{groupLabel(group)}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {items.map(item => {
                    const Icon = item.icon;
                    const active = activeFor(item);
                    const count = countFor(item);
                    return <Link key={`${item.to}-more`} to={item.to as never} onClick={() => setMoreOpen(false)} className={cn("flex min-h-14 items-center gap-3 rounded-[14px] border px-3.5 py-3 text-sm font-bold transition", active ? "border-primary/25 bg-primary/8 text-foreground" : "border-border bg-card text-foreground hover:bg-muted/50")}>
                      <span className={cn("grid size-9 shrink-0 place-items-center rounded-[11px]", active ? "bg-primary/12 text-primary" : "bg-muted text-muted-foreground")}><Icon className="size-[17px]" /></span>
                      <span className="min-w-0 flex-1 truncate text-start">{lang === "ar" ? item.ar : item.en}</span>
                      {count > 0 ? <span className="min-w-6 rounded-full bg-red-500 px-1.5 py-1 text-center text-[9px] font-black text-white">{count > 99 ? "99+" : count}</span> : null}
                    </Link>;
                  })}
                </div>
              </section>;
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
