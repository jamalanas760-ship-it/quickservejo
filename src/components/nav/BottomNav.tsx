import { Link, useRouterState } from "@tanstack/react-router";
import { Home, LayoutDashboard, Store, User } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Item = {
  to: string;
  icon: typeof Home;
  en: string;
  ar: string;
  exact?: boolean;
};

const ITEMS: Item[] = [
  { to: "/", icon: Home, en: "Home", ar: "الرئيسية", exact: true },
  { to: "/dashboard", icon: LayoutDashboard, en: "Dashboard", ar: "لوحة التحكم" },
  { to: "/manage", icon: Store, en: "Restaurant", ar: "المطعم" },
  { to: "/profile", icon: User, en: "Profile", ar: "الملف الشخصي" },
];

/** Persistent bottom navigation for the signed-in app (mobile-first, safe-area aware). */
export function BottomNav() {
  const { lang } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur">
      <ul className="mx-auto grid max-w-lg grid-cols-4">
        {ITEMS.map((item) => {
          const active = item.exact
            ? pathname === "/"
            : pathname === item.to || pathname.startsWith(`${item.to}/`);
          const Icon = item.icon;
          return (
            <li key={item.to}>
              <Link
                to={item.to as never}
                className={cn(
                  "flex flex-col items-center gap-1 px-1 py-2 text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-5" aria-hidden />
                <span className="truncate">{lang === "ar" ? item.ar : item.en}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
