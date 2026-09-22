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
  Globe2,
  HeartHandshake,
  Megaphone,
  MonitorSmartphone,
  MoreHorizontal,
  LayoutGrid,
  PlugZap,
  Search,
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
import { ThemeToggle } from "@/components/nav/ThemeToggle";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const { lang, toggleLang } = useI18n();
  const [moreOpen, setMoreOpen] = useState(false);
  const [toolSearch, setToolSearch] = useState("");
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
  const desktopPriority = managerial
    ? [homeTo, `/manage/${restaurantId}/orders`, "/bookings", `/manage/${restaurantId}`, `/manage/${restaurantId}/staff`, `/manage/${restaurantId}/analytics`]
    : [homeTo, "/work", "/shifts", `/manage/${restaurantId}/operations`, "/notifications", "/profile"];
  const desktopPrimary = desktopItems.length > 6
    ? desktopPriority
        .flatMap((to) => desktopItems.find((item) => item.to === to) ?? [])
        .filter((item, index, list) => list.findIndex((candidate) => candidate.to === item.to) === index)
        .slice(0, 6)
    : desktopItems;
  const desktopHasMore = desktopItems.some((item) => !desktopPrimary.some((primary) => primary.to === item.to));
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

  function changeMoreOpen(open: boolean) {
    setMoreOpen(open);
    if (!open) setToolSearch("");
  }

  const normalizedToolSearch = toolSearch.trim().toLocaleLowerCase(lang === "ar" ? "ar" : "en");
  const visibleTools = normalizedToolSearch
    ? desktopItems.filter((item) => `${item.en} ${item.ar}`.toLocaleLowerCase(lang === "ar" ? "ar" : "en").includes(normalizedToolSearch))
    : desktopItems;

  const brand = useRestaurantLogo ? (
    <span className="flex min-w-0 items-center gap-2">
      <span className="flex h-10 max-w-[112px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/70 bg-white px-2 shadow-sm"><img src={restaurant!.logo_url!} alt={restaurant?.name ?? "Restaurant"} className="h-7 w-auto max-w-full object-contain" /></span>
      <span className="truncate text-sm font-bold">{restaurant?.name}</span>
    </span>
  ) : (
    <BrandLogo className="size-8" accentClassName="text-[#e85d2a]" textClassName="text-[18px] text-foreground" />
  );

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="qs-tablet-nav-trigger fixed start-4 top-3 z-50 shadow-sm"
        onClick={() => setMoreOpen(true)}
        aria-label={lang === "ar" ? "فتح مساحة العمل" : "Open workspace navigation"}
      >
        <LayoutGrid className="size-5" />
      </Button>
      <aside className="qs-sidebar-shell fixed inset-y-0 start-0 z-50 hidden flex-col lg:flex">
        <div className="flex h-[var(--qs-shell-topbar)] items-center border-b border-border/80 px-4">
          <Link to={homeTo as never} className="min-w-0 text-foreground" aria-label={restaurant?.name || "QuickServe dashboard"}>{brand}</Link>
        </div>

        <nav className="qs-scroll flex-1 overflow-y-auto px-3 py-4" aria-label={lang === "ar" ? "التنقل الرئيسي" : "Primary navigation"}>
          <ul className="space-y-1">
            {desktopPrimary.map((item) => {
              const active = activeFor(item);
              const Icon = item.icon;
              const count = countFor(item);
              return (
                <li key={`${item.to}-${item.en}`}>
                  <Link to={item.to as never} data-active={active} className="qs-sidebar-item" aria-current={active ? "page" : undefined}>
                    <Icon className="size-[18px] shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{lang === "ar" ? item.ar : item.en}</span>
                    {count > 0 ? <span className="min-w-6 rounded-full bg-[#e85d2a] px-1.5 py-0.5 text-center text-[10px] font-bold text-white shadow-sm">{count > 99 ? "99+" : count}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-border/80 p-3">
          {desktopHasMore ? (
            <button type="button" className="qs-sidebar-item w-full" onClick={() => setMoreOpen(true)} aria-expanded={moreOpen}>
              <MoreHorizontal className="size-[18px] shrink-0" />
              <span className="min-w-0 flex-1 text-start">{lang === "ar" ? "كل الأدوات" : "All tools"}</span>
              <span className="text-xs text-muted-foreground">{desktopItems.length - desktopPrimary.length}</span>
            </button>
          ) : null}
          {!desktopPrimary.some((item)=>item.to==="/profile")?<Link to="/profile" data-active={activeFor({ to: "/profile", icon: Settings, en: "Settings", ar: "الإعدادات", exact: true })} className="qs-sidebar-item mt-1">
            <Settings className="size-[18px] shrink-0" />
            <span className="min-w-0 flex-1 truncate">{lang === "ar" ? "الإعدادات" : "Settings"}</span>
          </Link>:null}
        </div>
      </aside>

      <nav aria-label={lang === "ar" ? "التنقل الرئيسي" : "Primary navigation"} className="safe-bottom fixed inset-x-3 bottom-2 z-50 lg:hidden">
        <div className="grid overflow-hidden rounded-[19px] border border-border bg-card/96 px-1 shadow-[0_14px_42px_rgba(15,23,42,.16)] backdrop-blur-xl" style={{ gridTemplateColumns: `repeat(${Math.max(1, mobilePrimary.length + (mobileHasMore ? 1 : 0))}, minmax(0,1fr))` }}>
          {mobilePrimary.map((item) => {
            const active = activeFor(item);
            const Icon = item.icon;
            const count = countFor(item);
            return (
              <Link key={`${item.to}-${item.en}`} to={item.to as never} aria-current={active?"page":undefined} className={cn("relative flex min-h-[66px] flex-col items-center justify-center gap-1 text-[10px] font-semibold transition", active ? "text-[var(--restaurant-selected-nav,#e85d2a)]" : "text-muted-foreground")}>
                <span className="relative"><Icon className="size-5" />{count > 0 ? <span className="absolute -end-2.5 -top-2 min-w-[17px] rounded-full bg-red-500 px-1 text-center text-[8px] font-black leading-[17px] text-white">{count > 99 ? "99+" : count}</span> : null}</span>
                <span className="max-w-20 truncate">{lang === "ar" ? item.ar : item.en}</span>
                {active ? <span className="absolute inset-x-5 bottom-0 h-0.5 rounded-full bg-[var(--restaurant-selected-nav,#e85d2a)]" /> : null}
              </Link>
            );
          })}
          {mobileHasMore ? (
            <button type="button" onClick={() => setMoreOpen(true)} aria-expanded={moreOpen} className={cn("relative flex min-h-[62px] flex-col items-center justify-center gap-1 text-[10px] font-semibold text-muted-foreground transition hover:text-foreground")}>
              <MoreHorizontal className="size-5" />
              <span>{lang === "ar" ? "المزيد" : "More"}</span>
            </button>
          ) : null}
        </div>
      </nav>

      <Dialog open={moreOpen} onOpenChange={changeMoreOpen}>
        <DialogContent className="max-h-[min(90dvh,780px)] max-w-[920px] gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-border bg-card px-5 py-5 pe-14 text-start sm:px-6">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><LayoutGrid className="size-5" /></span>
              <div className="min-w-0">
                <DialogTitle>{lang === "ar" ? "كل أدوات مساحة العمل" : "All workspace tools"}</DialogTitle>
                <DialogDescription>{lang === "ar" ? "انتقل بسرعة إلى أي أداة متاحة لدورك." : "Find and open any tool available to your role."}</DialogDescription>
              </div>
            </div>
            <div className="qs-search-field mt-4">
              <Search />
              <Input autoFocus value={toolSearch} onChange={(event) => setToolSearch(event.target.value)} placeholder={lang === "ar" ? "ابحث عن الطلبات، الفريق، التحليلات…" : "Search orders, team, analytics…"} aria-label={lang === "ar" ? "البحث في الأدوات" : "Search tools"} />
            </div>
          </DialogHeader>
          <div className="qs-scroll max-h-[calc(90dvh-190px)] overflow-y-auto overscroll-contain p-4 pb-[calc(20px+env(safe-area-inset-bottom))] sm:p-6">
            <div className="space-y-6">
            {(["overview","service","operations","growth","admin"] as NavGroup[]).map(group => {
              const items = visibleTools.filter(item => item.group === group || (!item.group && group === "overview"));
              if (items.length === 0) return null;
              return <section key={group}>
                <p className="mb-2.5 px-1 text-[10px] font-black uppercase tracking-[.14em] text-muted-foreground">{groupLabel(group)}</p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map(item => {
                    const Icon = item.icon;
                    const active = activeFor(item);
                    const count = countFor(item);
                    return <Link key={`${item.to}-more`} to={item.to as never} onClick={() => changeMoreOpen(false)} className={cn("group flex min-h-[58px] items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-bold transition", active ? "border-primary/30 bg-primary/8 text-foreground" : "border-border/80 bg-card text-foreground hover:border-primary/20 hover:bg-muted/45")}>
                      <span className={cn("grid size-9 shrink-0 place-items-center rounded-[10px] transition", active ? "bg-primary/12 text-primary" : "bg-muted text-muted-foreground group-hover:text-foreground")}><Icon className="size-[17px]" /></span>
                      <span className="min-w-0 flex-1 text-start leading-5">{lang === "ar" ? item.ar : item.en}</span>
                      {count > 0 ? <span className="min-w-6 rounded-full bg-red-500 px-1.5 py-1 text-center text-[9px] font-black text-white">{count > 99 ? "99+" : count}</span> : null}
                    </Link>;
                  })}
                </div>
              </section>;
            })}
            {visibleTools.length === 0 ? <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center"><div><Search className="mx-auto size-6 text-muted-foreground"/><p className="mt-3 text-sm font-bold">{lang === "ar" ? "لم نعثر على أداة مطابقة" : "No matching tool"}</p><button type="button" onClick={() => setToolSearch("")} className="mt-2 text-xs font-bold text-primary">{lang === "ar" ? "مسح البحث" : "Clear search"}</button></div></div> : null}
            <section className="border-t border-border pt-5 lg:hidden">
              <p className="mb-3 px-1 text-xs font-bold text-muted-foreground">{lang === "ar" ? "التفضيلات" : "Preferences"}</p>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={toggleLang} className="qs-button-secondary"><Globe2 className="size-4" />{lang === "ar" ? "English" : "العربية"}</button>
                <ThemeToggle />
              </div>
            </section>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
