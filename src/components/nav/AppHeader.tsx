import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bell, Globe, Menu as MenuIcon } from "lucide-react";

import { BrandLogo } from "@/components/brand/BrandLogo";
import { useAccess, useSupabaseSession } from "@/hooks/useSession";
import { useWorkspaceReport, useWorkspaceScope } from "@/hooks/useWorkspace";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * The app chrome used on every signed-in screen: brand lockup, language
 * switch, notification bell with an open-order count and the account avatar.
 */
export function AppHeader({ onMenu, className, title }: { onMenu?: () => void; className?: string; title?: string }) {
  const { lang, toggleLang } = useI18n();
  const scope = useWorkspaceScope();
  const access = useAccess();
  const session = useSupabaseSession();
  const report = useWorkspaceReport(scope.restaurantId);
  const [initial, setInitial] = useState("A");

  useEffect(() => {
    const user = session.data?.user;
    const meta = user?.user_metadata as { full_name?: string; name?: string } | undefined;
    const source = meta?.full_name || meta?.name || user?.email || "";
    if (source) setInitial(source.slice(0, 1).toUpperCase());
  }, [session.data?.user]);

  const membership = (access.data ?? []).find((row) => row.restaurant_id && row.restaurant);
  const restaurant = access.isSuperAdmin ? null : membership?.restaurant;

  const openOrders = report.data?.openOrders ?? 0;

  return (
    <header className={cn("safe-top sticky top-0 z-40 border-b border-border/60 bg-background/86 shadow-[0_1px_0_color-mix(in_oklab,var(--color-border)_55%,transparent)] backdrop-blur-2xl", className)}>
      <div
        className={cn(
          "mx-auto grid h-16 max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-4",
          onMenu && "ps-14",
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          {onMenu ? (
            <button
              type="button"
              onClick={onMenu}
              aria-label="Menu"
              className="fixed start-4 top-[calc(env(safe-area-inset-top)+0.75rem)] z-50 grid size-10 shrink-0 place-items-center rounded-xl border border-border/70 bg-background/95 text-foreground/80 shadow-sm backdrop-blur-xl transition-colors hover:bg-muted active:scale-95"
            >
              <MenuIcon className="size-5" />
            </button>
          ) : null}
          <Link to={access.isSuperAdmin ? "/super-admin" : "/"} className="flex min-w-0 items-center gap-2.5">
            {restaurant ? (
              <>
                <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-primary text-primary-foreground shadow-sm">
                  {restaurant.logo_url ? <img src={restaurant.logo_url} alt="" className="size-full object-cover" /> : <span className="font-display font-bold">{restaurant.name.slice(0, 1)}</span>}
                </span>
                <span className="truncate font-display text-lg font-semibold tracking-tight">{restaurant.name}</span>
              </>
            ) : (
              <BrandLogo className="size-9 shrink-0" textClassName="truncate text-xl" />
            )}
          </Link>
          {title ? <span className="hidden min-w-0 truncate border-s border-border/80 ps-3 text-xs font-semibold text-muted-foreground md:block">{title}</span> : null}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={toggleLang} className="flex h-10 items-center gap-1.5 rounded-full px-2.5 text-sm font-medium text-foreground/80 hover:bg-muted sm:px-3">
            <Globe className="size-[18px]" aria-hidden />
            <span className="hidden sm:inline">{lang === "ar" ? "English" : "العربية"}</span>
          </button>

          <Link
            to="/notifications"
            aria-label={lang === "ar" ? "الإشعارات" : "Notifications"}
            className="relative grid size-10 place-items-center rounded-full text-foreground/80 hover:bg-muted"
            activeProps={{ className: "relative grid size-10 place-items-center rounded-full bg-accent/15 text-foreground" }}
          >
            <Bell className="size-[20px]" aria-hidden />
            {openOrders > 0 ? (
              <span className="absolute -end-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold leading-4 text-accent-foreground">
                {openOrders > 9 ? "9+" : openOrders}
              </span>
            ) : null}
          </Link>

          <Link to="/profile" aria-label="Profile" className="relative shrink-0">
            <span className="grid size-10 place-items-center rounded-full bg-accent/25 font-display text-base font-bold text-foreground">{initial}</span>
            <span className="absolute bottom-0 end-0 size-2.5 rounded-full border-2 border-background bg-success" />
          </Link>
        </div>
      </div>
    </header>
  );
}
