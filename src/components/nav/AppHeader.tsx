import { Link, useRouterState } from "@tanstack/react-router";
import { BadgeDollarSign, Bell, ChefHat, ChevronDown, Globe2, HandPlatter, Menu as MenuIcon, ShieldCheck, UserRound, UserRoundCog } from "lucide-react";

import { BrandLogo } from "@/components/brand/BrandLogo";
import { RestaurantSwitcher } from "@/components/manage/RestaurantSwitcher";
import { ThemeToggle } from "@/components/nav/ThemeToggle";
import { useAccess, useSupabaseSession } from "@/hooks/useSession";
import { useWorkspaceReport, useWorkspaceScope } from "@/hooks/useWorkspace";
import { avatarPresetUrl } from "@/lib/avatar-presets";
import { useI18n } from "@/lib/i18n";
import { ROLE_LABELS } from "@/lib/permissions";
import { cn } from "@/lib/utils";

function RoleAvatarFallback({ role, superAdmin }: { role: string | null | undefined; superAdmin: boolean }) {
  const iconClass = "size-[18px]";
  if (superAdmin || role === "restaurant_admin") return <ShieldCheck className={iconClass} />;
  if (role === "manager") return <UserRoundCog className={iconClass} />;
  if (role === "kitchen") return <ChefHat className={iconClass} />;
  if (role === "waiter") return <HandPlatter className={iconClass} />;
  if (role === "cashier") return <BadgeDollarSign className={iconClass} />;
  return <UserRound className={iconClass} />;
}

export function AppHeader({ onMenu, className, title }: { onMenu?: () => void; className?: string; title?: string | undefined }) {
  const { lang, toggleLang } = useI18n();
  const scope = useWorkspaceScope();
  const access = useAccess();
  const pathname = useRouterState({ select: state => state.location.pathname });
  const selectedId = pathname.match(/^\/manage\/([^/]+)/)?.[1];
  const session = useSupabaseSession();
  const report = useWorkspaceReport(selectedId ?? scope.restaurantId);

  const membership = (access.data ?? []).find(
    row => row.restaurant_id && row.restaurant && (!selectedId || row.restaurant_id === selectedId),
  ) ?? (access.data ?? []).find(row => row.restaurant_id && row.restaurant);
  const restaurant = membership?.restaurant;
  const user = session.data?.user;
  const meta = user?.user_metadata as { full_name?: string; name?: string; avatar_url?: string } | undefined;
  const avatarUrl = membership?.avatar_url || avatarPresetUrl(membership?.avatar_preset) || meta?.avatar_url || null;
  const displayName = meta?.full_name || meta?.name || membership?.name || user?.email?.split("@")[0] || "QuickServe";
  const role = access.isSuperAdmin ? "super_admin" : membership?.role;
  const roleLabel = role && role in ROLE_LABELS ? ROLE_LABELS[role as keyof typeof ROLE_LABELS][lang] : (lang === "ar" ? "عضو" : "Member");
  const openOrders = report.data?.openOrders ?? 0;

  return (
    <header className={cn("qs-topbar safe-top sticky top-0 z-40", className)}>
      <div className="mx-auto flex h-[68px] w-full max-w-[1600px] items-center gap-3 px-3 sm:px-5 lg:px-6">
        {onMenu ? <button type="button" onClick={onMenu} aria-label="Menu" className="grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-card lg:hidden"><MenuIcon className="size-5" /></button> : null}

        <Link to={access.isSuperAdmin ? "/super-admin" : "/dashboard"} className="shrink-0 lg:hidden" aria-label={restaurant?.name || "QuickServe"}>
          <BrandLogo className="size-8" accentClassName="text-[#ff5a0a]" textClassName="text-lg text-foreground" />
        </Link>

        <div className="hidden min-w-0 items-center gap-3 lg:flex">
          {selectedId ? <RestaurantSwitcher restaurantId={selectedId} /> : (
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{restaurant?.name || scope.restaurantName || (access.isSuperAdmin ? "QuickServe" : "Restaurant")}</p>
              {title ? <p className="truncate text-[11px] text-muted-foreground">{title}</p> : null}
            </div>
          )}
        </div>

        <div className="ms-auto flex items-center gap-1 sm:gap-1.5">
          <ThemeToggle compact />
          <button type="button" onClick={toggleLang} className="inline-flex min-h-10 items-center gap-2 rounded-xl px-2.5 text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label={lang === "ar" ? "Switch to English" : "التبديل إلى العربية"}>
            <Globe2 className="size-[18px]" />
            <span className="hidden text-xs font-semibold xl:inline">{lang === "ar" ? "العربية" : "English"}</span>
            <ChevronDown className="hidden size-3.5 xl:block" />
          </button>
          <Link to="/notifications" className="relative grid size-10 place-items-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label={lang === "ar" ? "الإشعارات" : "Notifications"}>
            <Bell className="size-[19px]" />
            {openOrders > 0 ? <span className="absolute end-1.5 top-1.5 size-2 rounded-full bg-red-500 ring-2 ring-background" /> : null}
          </Link>
          <Link to="/profile" aria-label={lang === "ar" ? "الملف الشخصي" : "Profile"} className="group flex min-h-11 items-center gap-2 rounded-xl px-1.5 transition hover:bg-muted sm:px-2">
            <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-muted-foreground ring-1 ring-border group-hover:ring-primary/30">{avatarUrl ? <img src={avatarUrl} alt="" className="size-full object-cover" /> : <RoleAvatarFallback role={membership?.role} superAdmin={access.isSuperAdmin} />}</span>
            <span className="hidden min-w-0 text-start xl:block"><span className="block max-w-28 truncate text-xs font-bold">{displayName}</span><span className="block text-[10px] text-muted-foreground">{roleLabel}</span></span>
            <ChevronDown className="hidden size-3.5 text-muted-foreground xl:block" />
          </Link>
        </div>
      </div>
    </header>
  );
}
