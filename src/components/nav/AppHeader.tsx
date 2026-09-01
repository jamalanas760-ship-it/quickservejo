import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bell, Globe, Menu as MenuIcon } from "lucide-react";

import { BrandLogo } from "@/components/brand/BrandLogo";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceReport, useWorkspaceScope } from "@/hooks/useWorkspace";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * The app chrome used on every signed-in screen: brand lockup, language
 * switch, notification bell with an open-order count and the account avatar.
 */
export function AppHeader({ onMenu, className }: { onMenu?: () => void; className?: string }) {
  const { lang, toggleLang } = useI18n();
  const scope = useWorkspaceScope();
  const report = useWorkspaceReport(scope.restaurantId);
  const [initial, setInitial] = useState("A");

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      const meta = data.user?.user_metadata as { full_name?: string; name?: string } | undefined;
      const source = meta?.full_name || meta?.name || data.user?.email || "";
      if (source) setInitial(source.slice(0, 1).toUpperCase());
    });
  }, []);

  const openOrders = report.data?.openOrders ?? 0;

  return (
    <header className={cn("safe-top sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur-xl", className)}>
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
          <Link to="/" className="flex min-w-0 items-center">
            <BrandLogo className="size-9 shrink-0" textClassName="truncate text-xl" />
          </Link>
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
