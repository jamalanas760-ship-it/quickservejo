import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import type { CSSProperties } from "react";
import { BarChart3, ChevronDown, ClipboardList, Palette, QrCode, ShoppingBag, Store, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccess } from "@/hooks/useSession";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/manage/$restaurantId")({ component: ManageShell });

const TABS = [
  { to: "/manage/$restaurantId", labelKey: "sa.detail.menu", icon: ClipboardList, exact: true },
  { to: "/manage/$restaurantId/design", labelKey: "sa.detail.design", icon: Palette },
  { to: "/manage/$restaurantId/tables", labelKey: "sa.detail.tables", icon: QrCode },
  { to: "/manage/$restaurantId/staff", labelKey: "sa.detail.staff", icon: Users },
  { to: "/manage/$restaurantId/orders", labelKey: "sa.detail.orders", icon: ShoppingBag },
  { to: "/manage/$restaurantId/analytics", labelKey: "sa.detail.analytics", icon: BarChart3 },
] as const;

function ManageShell() {
  const { restaurantId } = Route.useParams();
  const { t } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: restaurant, isPending } = useRestaurant(restaurantId);
  const access = useAccess();
  const membership = access.membershipFor(restaurantId);
  const allowed = access.isSuperAdmin || Boolean(membership);
  const base = `/manage/${restaurantId}`;
  const accent = restaurant?.primary_color ?? "#3b281b";
  const activeTab = TABS.find((tab) => ("exact" in tab && tab.exact ? pathname === base || pathname === `${base}/` : pathname === tab.to.replace("$restaurantId", restaurantId)));

  if (access.isPending || isPending) return <Skeleton className="mx-auto mt-5 h-[70vh] max-w-6xl rounded-[30px]" />;
  if (!allowed) return <div className="mx-auto mt-10 max-w-xl px-4"><div className="rounded-[30px] border bg-card p-10 text-center shadow-sm"><div className="mx-auto grid size-14 place-items-center rounded-2xl bg-destructive/10 text-destructive"><Store className="size-6" /></div><h1 className="mt-5 text-xl font-bold">{t("sa.unauthorized.title")}</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">{t("sa.unauthorized.body")}</p></div></div>;

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[radial-gradient(circle_at_top_right,rgba(245,147,35,.08),transparent_30%)]" style={{ "--restaurant-accent": accent } as CSSProperties}>
      <div className="mx-auto max-w-[1240px] px-3 pb-24 pt-4 sm:px-6 lg:px-8 lg:pt-6">
        <header className="rounded-[28px] border bg-card/90 p-3 shadow-[0_12px_40px_rgba(0,0,0,.06)] backdrop-blur-xl sm:p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="size-12 shrink-0 overflow-hidden rounded-2xl border bg-background shadow-sm">{restaurant?.logo_url ? <img src={restaurant.logo_url} alt={restaurant.name} className="size-full object-cover"/> : <div className="grid size-full place-items-center bg-[var(--restaurant-accent)] text-white"><Store className="size-5"/></div>}</div>
              <div className="min-w-0"><div className="flex items-center gap-2"><h1 className="truncate text-lg font-black tracking-[-.03em] sm:text-xl">{restaurant?.name ?? t("common.notFound")}</h1>{restaurant?<Badge variant="outline" className="hidden rounded-full border-emerald-200 bg-emerald-50 text-emerald-700 sm:inline-flex">{restaurant.is_active?"Active":"Inactive"}</Badge>:null}</div><p className="truncate text-xs text-muted-foreground">{restaurant ? `/${restaurant.slug}` : ""} · {membership?.role === "restaurant_admin" ? "Admin" : "Workspace"}</p></div>
            </div>
            <Link to="/manage" className="hidden shrink-0 items-center gap-2 rounded-xl border bg-background px-3 py-2 text-sm font-semibold shadow-sm transition hover:bg-muted sm:flex"><Store className="size-4"/> Environments <ChevronDown className="size-4 text-muted-foreground"/></Link>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-muted-foreground">Restaurant workspace</p><p className="mt-1 text-sm font-medium">{activeTab ? t(activeTab.labelKey) : "Overview"}</p></div><span className="rounded-full bg-muted px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{restaurant?.is_active?"Live":"Offline"}</span></div>
        </header>

        <nav className="sticky top-2 z-30 mt-4 hidden gap-1 rounded-2xl border bg-card/95 p-1.5 shadow-lg backdrop-blur-xl md:flex">{TABS.map(tab=>{const href=tab.to.replace("$restaurantId",restaurantId);const active="exact" in tab&&tab.exact?pathname===base||pathname===`${base}/`:pathname===href;const Icon=tab.icon;return <Link key={tab.to} to={tab.to} params={{restaurantId}} className={cn("flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition-all",active?"bg-[var(--restaurant-accent)] text-white shadow-sm":"text-muted-foreground hover:bg-muted hover:text-foreground")}><Icon className="size-4"/>{t(tab.labelKey)}</Link>})}</nav>
        <div className="mt-4 md:hidden"><div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">{TABS.map(tab=>{const href=tab.to.replace("$restaurantId",restaurantId);const active="exact" in tab&&tab.exact?pathname===base||pathname===`${base}/`:pathname===href;const Icon=tab.icon;return <Link key={tab.to} to={tab.to} params={{restaurantId}} className={cn("flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-bold",active?"border-transparent bg-[var(--restaurant-accent)] text-white shadow-sm":"bg-card text-muted-foreground")}><Icon className="size-4"/>{t(tab.labelKey)}</Link>})}</div></div>
        <main className="mt-4"><Outlet /></main>
      </div>
    </div>
  );
}
