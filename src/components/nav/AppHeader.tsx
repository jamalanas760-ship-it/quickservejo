import { Link, useRouterState } from "@tanstack/react-router";
import { useMemo } from "react";
import { Bell, CalendarDays, ChevronDown, Globe, MapPin, Menu as MenuIcon, Search } from "lucide-react";

import { BrandLogo } from "@/components/brand/BrandLogo";
import { ThemeToggle } from "@/components/nav/ThemeToggle";
import { useAccess, useSupabaseSession } from "@/hooks/useSession";
import { useWorkspaceReport, useWorkspaceScope } from "@/hooks/useWorkspace";
import { useI18n } from "@/lib/i18n";
import { avatarPresetUrl } from "@/lib/avatar-presets";
import { cn } from "@/lib/utils";

export function AppHeader({ onMenu, className, title }: { onMenu?: () => void; className?: string; title?: string | undefined }) {
  const { lang, toggleLang } = useI18n();
  const scope = useWorkspaceScope();
  const access = useAccess();
  const pathname = useRouterState({ select: state => state.location.pathname });
  const selectedId = pathname.match(/^\/manage\/([^/]+)/)?.[1];
  const session = useSupabaseSession();
  const report = useWorkspaceReport(scope.restaurantId);

  const membership = (access.data ?? []).find(
    row => row.restaurant_id && row.restaurant && (!selectedId || row.restaurant_id === selectedId),
  ) ?? (access.data ?? []).find(row => row.restaurant_id && row.restaurant);
  const restaurant = membership?.restaurant;
  const user = session.data?.user;
  const meta = user?.user_metadata as { full_name?: string; name?: string; avatar_url?: string } | undefined;
  const source = meta?.full_name || meta?.name || membership?.name || user?.email || "QuickServe";
  const initial = source.slice(0, 1).toUpperCase();
  const avatarUrl = membership?.avatar_url || avatarPresetUrl(membership?.avatar_preset) || meta?.avatar_url || null;
  const openOrders = report.data?.openOrders ?? 0;
  const dateLabel = useMemo(
    () => new Intl.DateTimeFormat(lang === "ar" ? "ar-JO" : "en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date()),
    [lang],
  );

  return (
    <header className={cn("qs-topbar safe-top sticky top-0 z-40", className)}>
      <div className="mx-auto flex h-[70px] w-full max-w-[1600px] items-center gap-3 px-3 sm:px-5 lg:px-7">
        {onMenu ? <button type="button" onClick={onMenu} aria-label="Menu" className="grid size-10 shrink-0 place-items-center rounded-xl border bg-card lg:hidden"><MenuIcon className="size-5" /></button> : null}

        <Link to={access.isSuperAdmin ? "/super-admin" : "/dashboard"} className="shrink-0 lg:hidden" aria-label={restaurant?.name || "QuickServe"}>
          {!access.isSuperAdmin && restaurant?.logo_url ? <span className="grid size-9 place-items-center overflow-hidden rounded-xl border border-border bg-card p-1 shadow-sm"><img src={restaurant.logo_url} alt="" className="size-full object-contain" /></span> : <BrandLogo className="size-8" accentClassName="text-[#ff5a0a]" textClassName="hidden text-lg sm:inline" />}
        </Link>

        <div className="relative hidden min-w-0 flex-1 lg:block lg:max-w-[480px]">
          <Search className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input aria-label={lang === "ar" ? "بحث" : "Search"} className="qs-topbar-search w-full ps-11 pe-4 text-[13px] outline-none placeholder:text-muted-foreground focus:border-[#ff5a0a] focus:ring-2 focus:ring-[#ff5a0a]/10" placeholder={lang === "ar" ? "ابحث في الطلبات والقائمة والموظفين..." : "Search orders, menu items, staff..."} />
        </div>

        {title ? <span className="hidden min-w-0 truncate text-sm font-semibold text-foreground xl:block">{title}</span> : null}

        <div className="ms-auto flex items-center gap-1.5 sm:gap-2">
          <button type="button" className="qs-control hidden h-10 items-center gap-2 px-3 text-[12px] font-semibold md:flex"><MapPin className="size-4 text-muted-foreground" /><span className="max-w-40 truncate">{restaurant?.name || scope.restaurantName || (access.isSuperAdmin ? "All Locations" : "Restaurant")}</span><ChevronDown className="size-3.5 text-muted-foreground" /></button>
          <button type="button" className="qs-control hidden h-10 items-center gap-2 px-3 text-[12px] font-semibold xl:flex"><CalendarDays className="size-4 text-muted-foreground" /><span>{lang === "ar" ? "اليوم، " : "Today, "}{dateLabel}</span><ChevronDown className="size-3.5 text-muted-foreground" /></button>
          <ThemeToggle compact />
          <button type="button" onClick={toggleLang} className="grid size-10 place-items-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label={lang === "ar" ? "Switch to English" : "التبديل إلى العربية"}><Globe className="size-[18px]" /></button>
          <Link to="/notifications" className="relative grid size-10 place-items-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label={lang === "ar" ? "الإشعارات" : "Notifications"}><Bell className="size-[19px]" />{openOrders > 0 ? <span className="absolute end-1.5 top-1.5 size-2 rounded-full bg-red-500 ring-2 ring-background" /> : null}</Link>
          <Link to="/profile" aria-label={lang === "ar" ? "الملف الشخصي" : "Profile"} className="grid size-10 place-items-center overflow-hidden rounded-full bg-muted font-display text-sm font-bold text-foreground ring-1 ring-border">{avatarUrl ? <img src={avatarUrl} alt="" className="size-full object-cover" /> : initial}</Link>
        </div>
      </div>
    </header>
  );
}
