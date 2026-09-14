import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Bell,
  Building2,
  ClipboardList,
  CreditCard,
  FileClock,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  Search,
  Settings,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { ThemeToggle } from "@/components/nav/ThemeToggle";
import { cn } from "@/lib/utils";
import { GlobalSearch } from "@/components/superadmin/GlobalSearch";
import { useRestaurantsWithStats } from "@/hooks/useSuperAdmin";
import { healthOf } from "@/lib/health";

type NavItem = { to: string; en: string; ar: string; icon: typeof LayoutDashboard; exact?: boolean };
const NAV: NavItem[] = [
  { to: "/super-admin", en: "Overview", ar: "نظرة عامة", icon: LayoutDashboard, exact: true },
  { to: "/super-admin/restaurants", en: "Restaurants", ar: "المطاعم", icon: Building2 },
  { to: "/super-admin/licenses", en: "Licenses", ar: "التراخيص", icon: KeyRound },
  { to: "/super-admin/orders", en: "Orders", ar: "الطلبات", icon: ClipboardList },
  { to: "/super-admin/analytics", en: "Analytics", ar: "التحليلات", icon: BarChart3 },
  { to: "/super-admin/subscriptions", en: "Billing", ar: "الفوترة", icon: CreditCard },
  { to: "/super-admin/audit-logs", en: "Audit Logs", ar: "سجل التدقيق", icon: FileClock },
  { to: "/super-admin/settings", en: "Settings", ar: "الإعدادات", icon: Settings },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { lang } = useI18n();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return (
    <nav className="space-y-1">
      {NAV.map((item) => {
        const active = item.exact ? pathname === item.to || pathname === `${item.to}/` : pathname.startsWith(item.to);
        const Icon = item.icon;
        return (
          <Link key={item.to} to={item.to as never} onClick={onNavigate} data-active={active} className="qs-sidebar-item" aria-current={active ? "page" : undefined}>
            <Icon className="size-[19px] shrink-0" />
            <span className="truncate">{lang === "ar" ? item.ar : item.en}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { lang } = useI18n();
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[70px] items-center border-b border-white/5 px-5">
        <Link to={"/super-admin" as never} onClick={onNavigate} className="text-white"><BrandLogo className="size-9" accentClassName="text-white" textClassName="text-[20px] text-white" /></Link>
      </div>
      <div className="qs-scroll flex-1 overflow-y-auto px-3 py-5"><NavLinks onNavigate={onNavigate} /></div>
      <div className="mx-3 mb-4 overflow-hidden rounded-[14px] border border-white/8 bg-white/[.04]">
        <div className="relative h-[165px] overflow-hidden p-4"><img src="/signin-restaurant.webp" alt="" className="absolute inset-0 h-full w-full object-cover opacity-35" loading="lazy" /><div className="absolute inset-0 bg-gradient-to-t from-[#101519] via-[#101519]/75 to-transparent" /><div className="relative flex h-full flex-col justify-end"><p className="font-display text-[15px] font-bold leading-5 text-white">{lang === "ar" ? "تحكم أوضح\nنمو أسرع" : "Smarter Control\nBigger Growth"}</p><p className="mt-2 text-[11px] leading-4 text-white/60">{lang === "ar" ? "إدارة جميع المطاعم من مكان واحد." : "Run every restaurant from one place."}</p></div></div>
      </div>
      <div className="border-t border-white/6 px-4 py-4 text-white"><p className="text-[13px] font-bold">QuickServe</p><p className="text-[10px] text-white/55">Platform Owner</p></div>
    </div>
  );
}

function Notifications() {
  const { lang } = useI18n();
  const { data } = useRestaurantsWithStats();
  const alerts = (data ?? []).map((restaurant) => ({ restaurant, health: healthOf(restaurant) })).filter((entry) => entry.health.level !== "healthy").slice(0, 8);
  return (
    <Popover>
      <PopoverTrigger asChild><button type="button" className="relative grid size-10 place-items-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={lang === "ar" ? "الإشعارات" : "Notifications"}><Bell className="size-[19px]" />{alerts.length ? <span className="absolute end-1.5 top-1.5 size-2 rounded-full bg-red-500 ring-2 ring-background" /> : null}</button></PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-1.5rem))]"><p className="text-sm font-bold">{lang === "ar" ? "تنبيهات المنصة" : "Platform alerts"}</p>{alerts.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">{lang === "ar" ? "كل شيء يعمل بشكل جيد." : "Everything looks healthy."}</p> : <ul className="mt-3 space-y-3">{alerts.map(({ restaurant, health }) => <li key={restaurant.id}><Link to={"/super-admin/restaurants/$restaurantId" as never} params={{ restaurantId: restaurant.id } as never} className="text-sm font-semibold hover:underline">{restaurant.name}</Link><p className="mt-0.5 text-xs text-muted-foreground">{health.missing.map((item) => lang === "ar" ? item.labelAr : item.labelEn).join(" · ")}</p></li>)}</ul>}</PopoverContent>
    </Popover>
  );
}

export function SuperAdminLayout({ children }: { children: ReactNode }) {
  const { lang, toggleLang } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => { void supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null)); }, []);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen((value) => !value); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  async function signOut() { await queryClient.cancelQueries(); queryClient.clear(); await supabase.auth.signOut(); navigate({ to: "/auth", replace: true }); }

  return (
    <div className="min-h-dvh bg-background lg:ps-[236px]">
      <aside className="qs-sidebar-shell fixed inset-y-0 start-0 z-50 hidden w-[236px] lg:block"><SidebarContent /></aside>
      <header className="qs-topbar safe-top sticky top-0 z-40">
        <div className="mx-auto flex h-[70px] w-full max-w-[1600px] items-center gap-3 px-3 sm:px-5 lg:px-7">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}><SheetTrigger asChild><Button variant="ghost" size="icon" className="size-10 lg:hidden"><MenuIcon className="size-5" /></Button></SheetTrigger><SheetContent side="left" className="w-[86vw] max-w-[260px] bg-[#151a1e] p-0 text-white"><SheetTitle className="sr-only">QuickServe</SheetTitle><SidebarContent onNavigate={() => setMobileOpen(false)} /></SheetContent></Sheet>
          <Link to={"/super-admin" as never} className="lg:hidden"><BrandLogo className="size-8" accentClassName="text-[#ff5a0a]" textClassName="hidden sm:inline" /></Link>
          <button type="button" onClick={() => setSearchOpen(true)} className="qs-topbar-search hidden min-w-0 max-w-[480px] flex-1 items-center gap-3 px-4 text-start text-[13px] text-muted-foreground md:flex"><Search className="size-4" /><span className="min-w-0 flex-1 truncate">{lang === "ar" ? "ابحث في المطاعم والطلبات..." : "Search restaurants, orders, settings..."}</span><kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px]">⌘K</kbd></button>
          <div className="ms-auto flex items-center gap-1.5"><ThemeToggle compact /><Notifications /><button type="button" onClick={toggleLang} className="grid size-10 place-items-center rounded-xl text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground">{lang === "ar" ? "EN" : "ع"}</button><DropdownMenu><DropdownMenuTrigger asChild><button type="button" className="grid size-10 place-items-center rounded-full bg-muted ring-1 ring-border"><Users className="size-4" /></button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuLabel className="max-w-56 truncate">{email ?? "QuickServe Owner"}</DropdownMenuLabel><DropdownMenuSeparator /><DropdownMenuItem asChild><Link to="/dashboard">{lang === "ar" ? "لوحة المطعم" : "Restaurant dashboard"}</Link></DropdownMenuItem><DropdownMenuItem onClick={() => void signOut()}><LogOut className="size-4" />{lang === "ar" ? "تسجيل الخروج" : "Sign out"}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
        </div>
      </header>
      <main className={cn("mx-auto min-h-[calc(100dvh-70px)] w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-7")}>{children}</main>
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
