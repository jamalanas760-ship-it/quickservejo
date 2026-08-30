import { Link, useRouterState } from "@tanstack/react-router";
import { Home, LayoutDashboard, MonitorPlay, Store, User } from "lucide-react";

import { useAccess } from "@/hooks/useSession";
import { useI18n } from "@/lib/i18n";
import { isFrontlineOnly } from "@/lib/permissions";
import { cn } from "@/lib/utils";

type Item = {
  to: string;
  icon: typeof Home;
  en: string;
  ar: string;
  exact?: boolean;
};

const ADMIN_ITEMS: Item[] = [
  { to: "/", icon: Home, en: "Home", ar: "الرئيسية", exact: true },
  { to: "/dashboard", icon: LayoutDashboard, en: "Dashboard", ar: "لوحة التحكم" },
  { to: "/manage", icon: Store, en: "Restaurant", ar: "المطعم" },
  { to: "/profile", icon: User, en: "Profile", ar: "الملف الشخصي" },
];

/** Frontline staff only get their operational display and their own profile. */
const STAFF_ITEMS: Item[] = [
  { to: "/kitchen", icon: MonitorPlay, en: "Orders", ar: "الطلبات" },
  { to: "/profile", icon: User, en: "Profile", ar: "الملف الشخصي" },
];

/** Persistent bottom navigation for the signed-in app (mobile-first, safe-area aware). */
export function BottomNav() {
  const { lang } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { roles, isPending } = useAccess();

  const frontline = !isPending && isFrontlineOnly(roles);
  const items = frontline ? STAFF_ITEMS : ADMIN_ITEMS;

  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur">
      <ul
        className={cn("mx-auto grid max-w-lg", frontline ? "grid-cols-2" : "grid-cols-4")}
      >
        {items.map((item) => {
          const active = item.exact
            ? pathname === "/"
            : pathname === item.to || pathname.startsWith(`${item.to}/`);
          const Icon = item.icon;
          return (
            <li key={item.to} className="relative">
              {active ? (
                <span className="absolute inset-x-3 -top-px h-0.5 rounded-full bg-primary" aria-hidden />
              ) : null}
              <Link
                to={item.to as never}
                className={cn(
                  "flex flex-col items-center gap-1 px-1 py-2 text-[11px] font-medium transition-colors",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "grid size-8 place-items-center rounded-full transition-colors",
                    active && "bg-primary/10",
                  )}
                >
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="truncate">{lang === "ar" ? item.ar : item.en}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
