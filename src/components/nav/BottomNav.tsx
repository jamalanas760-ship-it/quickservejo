import { Link, useRouterState } from "@tanstack/react-router";
import { Home, LayoutDashboard, MonitorPlay, Store, User } from "lucide-react";

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

const STAFF_ITEMS: Item[] = [
  { to: "/kitchen", icon: MonitorPlay, en: "Display", ar: "الشاشة" },
];

export function BottomNav() {
  const { lang } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { roles, isPending } = useAccess();
  const frontline = !isPending && isFrontlineOnly(roles);
  const items = frontline ? STAFF_ITEMS : ADMIN_ITEMS;

  return (
    <nav aria-label={lang === "ar" ? "التنقل الرئيسي" : "Primary navigation"} className="safe-bottom fixed inset-x-0 bottom-0 z-40 px-2 pb-1 sm:px-3 sm:pb-2 lg:pointer-events-none lg:inset-x-auto lg:start-1/2 lg:w-auto lg:-translate-x-1/2 lg:px-0">
      <div className="pointer-events-auto mx-auto overflow-hidden rounded-2xl border border-border/80 bg-background/96 shadow-[0_12px_40px_rgba(0,0,0,0.12)] backdrop-blur-xl lg:rounded-full">
        <ul className={cn("mx-auto grid w-full", frontline ? "grid-cols-1" : "grid-cols-4", "lg:w-auto lg:min-w-[440px]")}>
          {items.map((item) => {
            const active = item.exact ? pathname === "/" : pathname === item.to || pathname.startsWith(`${item.to}/`);
            const Icon = item.icon;
            return <li key={item.to} className="relative">
              <Link to={item.to as never} aria-current={active ? "page" : undefined} className={cn("relative flex min-h-14 min-w-[72px] flex-col items-center justify-center gap-0.5 px-3 py-1.5 text-[10px] font-semibold transition-all duration-200 active:scale-[0.96] sm:min-h-15 sm:text-[11px] lg:min-h-12 lg:flex-row lg:gap-2 lg:px-5 lg:text-xs", active ? "text-primary" : "text-muted-foreground hover:text-foreground")}>
                <span className={cn("grid size-8 place-items-center rounded-xl transition-all duration-200 lg:size-7 lg:rounded-full", active && "bg-primary/10 shadow-sm")}><Icon className={cn("size-5 lg:size-4.5", active && "stroke-[2.4]")} aria-hidden /></span>
                <span className="max-w-24 truncate">{lang === "ar" ? item.ar : item.en}</span>
                {active ? <span className="absolute inset-x-5 bottom-0 h-0.5 rounded-full bg-primary lg:inset-x-8 lg:bottom-1" aria-hidden /> : null}
              </Link>
            </li>;
          })}
        </ul>
      </div>
    </nav>
  );
}
