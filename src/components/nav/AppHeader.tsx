import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { createContext, useContext, useState, type ReactNode } from "react";
import { BadgeDollarSign, Check, ChefHat, ChevronDown, Globe2, HandPlatter, Languages, LogOut, Menu as MenuIcon, ShieldCheck, UserRound, UserRoundCog } from "lucide-react";
import { toast } from "sonner";

import { BrandLogo } from "@/components/brand/BrandLogo";
import { RestaurantSwitcher } from "@/components/manage/RestaurantSwitcher";
import { NotificationBell } from "@/components/nav/NotificationBell";
import { ThemeToggle } from "@/components/nav/ThemeToggle";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useOperationalCounters } from "@/hooks/useOperationalCounters";
import { useAccess, useSupabaseSession } from "@/hooks/useSession";
import { useWorkspaceScope } from "@/hooks/useWorkspace";
import { avatarPresetUrl } from "@/lib/avatar-presets";
import { humanError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { ROLE_LABELS } from "@/lib/permissions";
import { readAppearance } from "@/lib/restaurant-appearance";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

function RoleAvatarFallback({ role, superAdmin }: { role: string | null | undefined; superAdmin: boolean }) {
  const iconClass = "size-[18px]";
  if (superAdmin || role === "restaurant_admin") return <ShieldCheck className={iconClass} />;
  if (role === "manager") return <UserRoundCog className={iconClass} />;
  if (role === "kitchen") return <ChefHat className={iconClass} />;
  if (role === "waiter") return <HandPlatter className={iconClass} />;
  if (role === "cashier") return <BadgeDollarSign className={iconClass} />;
  return <UserRound className={iconClass} />;
}

const NestedAppHeaderContext = createContext(false);
type AppHeaderProps = {
  onMenu?: (() => void) | undefined;
  className?: string | undefined;
  title?: string | undefined;
};

export function SuppressNestedAppHeader({ children }: { children: ReactNode }) {
  return <NestedAppHeaderContext.Provider value>{children}</NestedAppHeaderContext.Provider>;
}

export function AppHeader({ onMenu, className, title }: AppHeaderProps) {
  const suppressed = useContext(NestedAppHeaderContext);
  if (suppressed) return null;
  return <AppHeaderContent onMenu={onMenu} className={className} title={title} />;
}

function AppHeaderContent({ onMenu, className, title }: AppHeaderProps) {
  const { lang, setLang } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);
  const scope = useWorkspaceScope();
  const access = useAccess();
  const pathname = useRouterState({ select: state => state.location.pathname });
  const selectedId = pathname.match(/^\/manage\/([^/]+)/)?.[1];
  const session = useSupabaseSession();

  const membership = (access.data ?? []).find(
    row => row.restaurant_id && row.restaurant && (!selectedId || row.restaurant_id === selectedId),
  ) ?? (access.data ?? []).find(row => row.restaurant_id && row.restaurant);
  const restaurant = membership?.restaurant;
  const restaurantId = selectedId ?? scope.restaurantId ?? membership?.restaurant_id ?? null;
  const counters = useOperationalCounters(restaurantId);
  const appearance = readAppearance(restaurant?.menu_theme);
  const customLogo = Boolean(restaurant?.logo_url && !appearance.useQuickServeLogo);
  const user = session.data?.user;
  const meta = user?.user_metadata as { full_name?: string; name?: string; avatar_url?: string } | undefined;
  const avatarUrl = membership?.avatar_url || avatarPresetUrl(membership?.avatar_preset) || meta?.avatar_url || null;
  const displayName = meta?.full_name || meta?.name || membership?.name || user?.email?.split("@")[0] || "QuickServe";
  const role = access.isSuperAdmin ? "super_admin" : membership?.role;
  const roleLabel = role && role in ROLE_LABELS ? ROLE_LABELS[role as keyof typeof ROLE_LABELS][lang] : (lang === "ar" ? "عضو" : "Member");
  const notificationCount = counters.data.unread;
  const homeTo = membership?.role === "manager" ? "/manager" : access.isSuperAdmin ? "/super-admin" : "/dashboard";

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await queryClient.cancelQueries();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      queryClient.clear();
      await navigate({ to: "/auth", replace: true });
    } catch (error) {
      toast.error(humanError(error, lang));
      setSigningOut(false);
    }
  }

  return (
    <header className={cn("qs-topbar safe-top sticky top-0 z-40", className)}>
      <div className="mx-auto flex h-[var(--qs-shell-topbar)] w-full max-w-[1640px] items-center gap-2 px-2.5 sm:px-4 lg:px-5">
        {onMenu ? <button type="button" onClick={onMenu} aria-label="Menu" className="grid size-8.5 shrink-0 place-items-center rounded-[9px] border border-border bg-card text-foreground shadow-[0_1px_2px_rgba(15,23,42,.03)] transition hover:bg-muted/60 lg:hidden"><MenuIcon className="size-4" /></button> : null}

        <Link to={homeTo as never} className="min-w-0 shrink-0 lg:hidden" aria-label={restaurant?.name || "QuickServe"}>
          {customLogo ? <span className="inline-flex h-8 max-w-[118px] items-center justify-center overflow-hidden rounded-xl border border-border/70 bg-white px-2 shadow-sm"><img src={restaurant!.logo_url!} alt={restaurant?.name ?? "Restaurant"} className="h-6 w-auto max-w-full object-contain" /></span> : <BrandLogo className="size-7" accentClassName="text-[#e85d2a]" textClassName="text-base text-foreground" />}
        </Link>

        <div className="hidden min-w-0 items-center gap-3 lg:flex">
          {selectedId ? <RestaurantSwitcher restaurantId={selectedId} /> : (
            <div className="min-w-0"><p className="truncate text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground">{restaurant?.name || scope.restaurantName || (access.isSuperAdmin ? "QuickServe" : "Restaurant")}</p>{title ? <p className="mt-0.5 truncate text-sm font-bold text-foreground">{title}</p> : null}</div>
          )}
        </div>

        <div className="ms-auto flex items-center gap-1 sm:gap-1.5">
          <ThemeToggle compact className="hidden lg:inline-flex" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="hidden min-h-10 items-center gap-1.5 rounded-[9px] border border-transparent px-2.5 text-muted-foreground transition hover:border-border hover:bg-muted/55 hover:text-foreground lg:inline-flex" aria-label={lang === "ar" ? "اختيار اللغة" : "Choose language"}>
                <Globe2 className="size-4" />
                <span className="hidden text-xs font-semibold xl:inline">{lang === "ar" ? "العربية" : "English"}</span>
                <ChevronDown className="hidden size-3.5 xl:block" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 p-2">
              <DropdownMenuLabel className="flex items-center gap-2 text-xs text-muted-foreground"><Languages className="size-4" />{lang === "ar" ? "لغة الواجهة" : "Interface language"}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setLang("en")} className="min-h-11 cursor-pointer">
                <span className="grid size-7 place-items-center rounded-lg bg-muted text-xs font-black">EN</span>
                <span className="min-w-0 flex-1"><strong className="block text-sm">English</strong><span className="block text-[10px] text-muted-foreground">Left to right</span></span>
                {lang === "en" ? <Check className="size-4 text-primary" /> : null}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setLang("ar")} className="min-h-11 cursor-pointer">
                <span className="grid size-7 place-items-center rounded-lg bg-muted text-xs font-black">ع</span>
                <span className="min-w-0 flex-1"><strong className="block text-sm">العربية</strong><span className="block text-[10px] text-muted-foreground">من اليمين إلى اليسار</span></span>
                {lang === "ar" ? <Check className="size-4 text-primary" /> : null}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <NotificationBell restaurantId={restaurantId} count={notificationCount} ar={lang === "ar"} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label={lang === "ar" ? "قائمة الحساب" : "Account menu"} className="group flex min-h-8 items-center gap-1.5 rounded-[9px] border border-transparent px-1.5 transition hover:border-border hover:bg-muted/55 sm:px-2">
                <span className="grid size-7.5 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-muted-foreground ring-1 ring-border/90 shadow-sm group-hover:ring-primary/30">{avatarUrl ? <img src={avatarUrl} alt="" className="size-full object-cover" /> : <RoleAvatarFallback role={membership?.role} superAdmin={access.isSuperAdmin} />}</span>
                <span className="hidden min-w-0 text-start xl:block"><span className="block max-w-24 truncate text-[11px] font-bold">{displayName}</span><span className="block text-[9px] text-muted-foreground">{roleLabel}</span></span>
                <ChevronDown className="hidden size-3.5 text-muted-foreground xl:block" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 p-2">
              <DropdownMenuLabel className="flex items-center gap-3 py-2">
                <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-muted-foreground ring-1 ring-border">{avatarUrl ? <img src={avatarUrl} alt="" className="size-full object-cover" /> : <RoleAvatarFallback role={membership?.role} superAdmin={access.isSuperAdmin} />}</span>
                <span className="min-w-0"><strong className="block truncate text-sm text-foreground">{displayName}</strong><span className="block truncate text-[11px] font-medium text-muted-foreground">{roleLabel}</span></span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild className="min-h-11 cursor-pointer"><Link to="/profile"><UserRound className="size-4" /><span className="flex-1">{lang === "ar" ? "الملف الشخصي" : "View profile"}</span></Link></DropdownMenuItem>
              <DropdownMenuItem disabled={signingOut} onSelect={() => void signOut()} className="min-h-11 cursor-pointer text-destructive focus:text-destructive"><LogOut className="size-4" />{signingOut ? (lang === "ar" ? "جارٍ تسجيل الخروج…" : "Signing out…") : (lang === "ar" ? "تسجيل الخروج" : "Sign out")}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
