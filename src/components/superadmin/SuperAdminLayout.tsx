import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Building2,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  Menu as MenuIcon,
  Search,
  Settings,
  ShieldCheck,
  Users,
  Bell,
  LogOut,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { cn } from "@/lib/utils";
import { GlobalSearch } from "@/components/superadmin/GlobalSearch";
import { useRestaurantsWithStats } from "@/hooks/useSuperAdmin";
import { healthOf } from "@/lib/health";

type NavItem = {
  to: string;
  labelKey: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
};

const NAV: NavItem[] = [
  { to: "/super-admin", labelKey: "sa.nav.dashboard", icon: LayoutDashboard, exact: true },
  { to: "/super-admin/restaurants", labelKey: "sa.nav.restaurants", icon: Building2 },
  { to: "/super-admin/orders", labelKey: "sa.nav.orders", icon: ClipboardList },
  { to: "/super-admin/analytics", labelKey: "sa.nav.analytics", icon: BarChart3 },
  { to: "/super-admin/subscriptions", labelKey: "sa.nav.subscriptions", icon: CreditCard },
  { to: "/super-admin/audit-logs", labelKey: "sa.nav.audit", icon: ShieldCheck },
  { to: "/super-admin/settings", labelKey: "sa.nav.settings", icon: Settings },
];

function NavLinks({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  const { t } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav className="space-y-1">
      {NAV.map((item) => {
        const active = item.exact
          ? pathname === item.to || pathname === `${item.to}/`
          : pathname.startsWith(item.to);
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to as never}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {t(item.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  const { t } = useI18n();
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <Link to={"/super-admin" as never} onClick={onNavigate} className="px-2">
        <BrandLogo className="size-8" accentClassName="text-sidebar-primary" />
        <span className="mt-0.5 block text-xs text-sidebar-foreground/60">{t("sa.brand")}</span>
      </Link>
      <NavLinks onNavigate={onNavigate} />
      <div className="mt-auto px-2 text-xs text-sidebar-foreground/50">
        {t("sa.settings.securityNote")}
      </div>
    </div>
  );
}

function Notifications() {
  const { t, lang } = useI18n();
  const { data } = useRestaurantsWithStats();
  const alerts = (data ?? [])
    .map((r) => ({ restaurant: r, health: healthOf(r) }))
    .filter((x) => x.health.level !== "healthy")
    .slice(0, 8);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("sa.notifications")}>
          <Bell className="size-4" />
          {alerts.length > 0 ? (
            <span className="absolute end-1.5 top-1.5 size-2 rounded-full bg-destructive" />
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <p className="text-sm font-semibold">{t("sa.notifications")}</p>
        {alerts.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("sa.notifications.empty")}</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {alerts.map(({ restaurant, health }) => (
              <li key={restaurant.id} className="text-sm">
                <Link
                  to={"/super-admin/restaurants/$restaurantId" as never}
                  params={{ restaurantId: restaurant.id } as never}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {restaurant.name}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {health.missing.map((m) => (lang === "ar" ? m.labelAr : m.labelEn)).join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function SuperAdminLayout({ children }: { children: ReactNode }) {
  const { t, toggleLang } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="hidden border-e bg-sidebar text-sidebar-foreground lg:block">
        <div className="sticky top-0 h-screen overflow-y-auto">
          <SidebarContent />
        </div>
      </aside>

      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b bg-background/95 px-4 py-3 backdrop-blur">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label={t("sa.brand")}>
                <MenuIcon className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 bg-sidebar p-0 text-sidebar-foreground">
              <SheetTitle className="sr-only">{t("sa.brand")}</SheetTitle>
              <SidebarContent onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>

          <Button
            variant="outline"
            size="sm"
            className="min-w-0 flex-1 justify-start gap-2 text-muted-foreground sm:max-w-sm"
            onClick={() => setSearchOpen(true)}
          >
            <Search className="size-4 shrink-0" />
            <span className="truncate">{t("sa.search.open")}</span>
            <kbd className="ms-auto hidden text-xs sm:inline">⌘K</kbd>
          </Button>

          <div className="ms-auto flex items-center gap-1">
            <Badge variant="secondary" className="hidden sm:inline-flex">
              {t("sa.brand")}
            </Badge>
            <Notifications />
            <Button variant="ghost" size="sm" onClick={toggleLang}>
              {t("common.language")}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={t("sa.profile")}>
                  <Users className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="max-w-56 truncate">
                  {email ?? t("sa.profile")}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/dashboard">{t("nav.dashboard")}</Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void signOut()}>
                  <LogOut className="size-4" />
                  {t("nav.signOut")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>

      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
