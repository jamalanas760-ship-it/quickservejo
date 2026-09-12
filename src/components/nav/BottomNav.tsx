import { Link, useRouterState } from "@tanstack/react-router";
import { Banknote, ChefHat, Home, LayoutDashboard, Store, User, Utensils } from "lucide-react";

import { useAccess } from "@/hooks/useSession";
import { useI18n } from "@/lib/i18n";
import { isFrontlineOnly } from "@/lib/permissions";
import { cn } from "@/lib/utils";

type Item = { to: string; icon: typeof Home; en: string; ar: string; exact?: boolean };

const ADMIN_ITEMS: Item[] = [
  { to: "/", icon: Home, en: "Home", ar: "الرئيسية", exact: true },
  { to: "/dashboard", icon: LayoutDashboard, en: "Dashboard", ar: "لوحة التحكم" },
  { to: "/manage", icon: Store, en: "Restaurant", ar: "المطعم" },
  { to: "/profile", icon: User, en: "Profile", ar: "الملف الشخصي" },
];

const TASK_ITEMS: Partial<Record<string, Item>> = {
  manager: { to: "/kitchen", icon: LayoutDashboard, en: "Operations", ar: "العمليات" },
  kitchen: { to: "/kitchen", icon: ChefHat, en: "Kitchen", ar: "المطبخ" },
  waiter: { to: "/waiter", icon: Utensils, en: "Floor", ar: "الصالة" },
  cashier: { to: "/cashier", icon: Banknote, en: "Cashier", ar: "الكاشير" },
};

export function BottomNav() {
  const { lang } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { roles, data, isPending, isSuperAdmin } = useAccess();
  if (isPending || isSuperAdmin) return null;
  const frontline = isFrontlineOnly(roles);
  const task = roles.map((role) => TASK_ITEMS[role]).find(Boolean);
  const items = frontline
    ? [task, { to: "/profile", icon: User, en: "Profile", ar: "الملف الشخصي" }].filter(Boolean) as Item[]
    : ADMIN_ITEMS;
  const selectedId = pathname.match(/^\/manage\/([^/]+)/)?.[1];
  const restaurant = (data ?? []).find((membership) => membership.restaurant && (!selectedId || membership.restaurant_id === selectedId))?.restaurant;

  return (
    <nav aria-label={lang === "ar" ? "التنقل الرئيسي" : "Primary navigation"} className="safe-bottom fixed inset-x-0 bottom-0 z-40 px-2 pb-1 sm:px-3 sm:pb-2 lg:inset-y-0 lg:start-0 lg:end-auto lg:w-64 lg:p-4">
      <div className="mx-auto overflow-hidden rounded-2xl border border-border/80 bg-background/96 shadow-[0_12px_40px_rgba(0,0,0,0.12)] backdrop-blur-xl lg:flex lg:h-full lg:flex-col lg:rounded-[28px] lg:border-white/10 lg:bg-sidebar lg:text-sidebar-foreground lg:shadow-2xl">
        <div className="hidden items-center gap-3 border-b border-white/10 px-5 py-6 lg:flex">
          {restaurant?.logo_url ? <img src={restaurant.logo_url} alt="" className="size-11 rounded-2xl bg-white object-contain p-1" /> : <span className="grid size-11 place-items-center rounded-2xl bg-sidebar-primary text-lg font-black text-sidebar-primary-foreground">{restaurant?.name?.charAt(0) ?? "Q"}</span>}
          <div className="min-w-0"><p className="truncate text-sm font-bold">{restaurant?.name ?? "QuickServe"}</p><p className="text-[11px] text-sidebar-foreground/65">{frontline ? (lang === "ar" ? "مساحة الموظف" : "Staff workspace") : (lang === "ar" ? "إدارة المطعم" : "Restaurant admin")}</p></div>
        </div>
        <ul className={cn("mx-auto grid w-full", items.length === 2 ? "grid-cols-2" : "grid-cols-4", "lg:flex lg:flex-1 lg:flex-col lg:gap-1 lg:p-3")}>
          {items.map((item) => {
            const active = item.exact ? pathname === "/" : pathname === item.to || pathname.startsWith(`${item.to}/`);
            const Icon = item.icon;
            return <li key={item.to} className="relative">
              <Link to={item.to as never} aria-current={active ? "page" : undefined} className={cn("relative flex min-h-14 min-w-[72px] flex-col items-center justify-center gap-0.5 px-3 py-1.5 text-[10px] font-semibold transition-all duration-200 active:scale-[0.96] sm:min-h-15 sm:text-[11px] lg:min-h-12 lg:flex-row lg:justify-start lg:gap-3 lg:rounded-2xl lg:px-3 lg:text-sm", active ? "text-primary lg:bg-white/12 lg:text-sidebar-foreground" : "text-muted-foreground hover:text-foreground lg:text-sidebar-foreground/68 lg:hover:bg-white/8 lg:hover:text-sidebar-foreground")}>
                <span className={cn("grid size-8 place-items-center rounded-xl transition-all duration-200 lg:size-9", active && "bg-primary/10 shadow-sm lg:bg-sidebar-primary lg:text-sidebar-primary-foreground")}><Icon className={cn("size-5", active && "stroke-[2.4]")} aria-hidden /></span>
                <span className="max-w-24 truncate">{lang === "ar" ? item.ar : item.en}</span>
                {active ? <span className="absolute inset-x-5 bottom-0 h-0.5 rounded-full bg-primary lg:hidden" aria-hidden /> : null}
              </Link>
            </li>;
          })}
        </ul>
      </div>
    </nav>
  );
}
