import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import type { CSSProperties } from "react";
import { BarChart3, ClipboardList, QrCode, ShoppingBag, Store, Users, Package, ArrowLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { AppHeader } from "@/components/nav/AppHeader";
import { useAccess } from "@/hooks/useSession";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/manage/$restaurantId")({ component: ManageShell });
const TABS = [
  { suffix: "", en: "Menu", ar: "القائمة", icon: ClipboardList },
  { suffix: "/tables", en: "Tables & QR", ar: "الطاولات وQR", icon: QrCode },
  { suffix: "/staff", en: "Team", ar: "الفريق", icon: Users },
  { suffix: "/orders", en: "Orders", ar: "الطلبات", icon: ShoppingBag },
  { suffix: "/analytics", en: "Analytics", ar: "التحليلات", icon: BarChart3 },
  { suffix: "/operations", en: "Operations", ar: "العمليات", icon: Package },
] as const;
function ManageShell() {
  const { restaurantId } = Route.useParams();
  const { lang, t } = useI18n(); const ar = lang === "ar";
  const pathname = useRouterState({ select: s => s.location.pathname });
  const restaurant = useRestaurant(restaurantId);
  const access = useAccess();
  const allowed = access.isSuperAdmin || access.membershipFor(restaurantId)?.role === "restaurant_admin";
  const base = `/manage/${restaurantId}`;
  if (access.isPending || restaurant.isPending) return <Skeleton className="mx-auto mt-6 h-[70vh] max-w-6xl rounded-2xl" />;
  if (!allowed) return <div role="alert" className="panel mx-auto mt-10 max-w-lg p-8 text-center"><h1 className="text-xl font-semibold">{t("sa.unauthorized.title")}</h1><p className="mt-3 text-muted-foreground">{t("sa.unauthorized.body")}</p></div>;
  return <div className="min-h-dvh bg-background">
    <AppHeader title={ar ? "إدارة المطعم" : "Restaurant workspace"} />
    <div className="mx-auto max-w-[1320px] px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl border bg-card">{restaurant.data?.logo_url ? <img src={restaurant.data.logo_url} alt="" className="size-full object-contain p-1" /> : <Store className="size-6 text-primary" />}</div>
          <div className="min-w-0"><p className="text-xs text-muted-foreground">{ar ? "مساحة المطعم" : "Restaurant workspace"}</p><h1 className="mt-1 truncate text-xl font-semibold">{restaurant.data?.name ?? t("common.notFound")}</h1></div>
        </div>
        <Link to="/manage" className="flex min-h-11 shrink-0 items-center gap-2 rounded-xl border bg-card px-3 text-sm hover:bg-muted"><ArrowLeft className="size-4" /><span className="hidden sm:inline">{ar ? "المطاعم" : "Restaurants"}</span></Link>
      </header>
      <nav aria-label={ar ? "أقسام المطعم" : "Restaurant sections"} className="mb-6 flex gap-1 overflow-x-auto border-b pb-1">
        {TABS.map(({suffix,en,ar:arabic,icon:Icon}) => { const active = pathname.replace(/\/$/,"") === `${base}${suffix}`;
          return <Link key={suffix} to={`${base}${suffix}` as never} aria-current={active ? "page" : undefined} className={cn("flex min-h-12 shrink-0 items-center gap-2 rounded-t-lg border-b-2 px-4 text-sm font-medium transition-colors",active?"border-primary bg-primary/5 text-primary":"border-transparent text-muted-foreground hover:bg-muted hover:text-foreground")}><Icon className="size-4" />{ar ? arabic : en}</Link>;
        })}
      </nav>
      <main className="min-w-0"><Outlet /></main>
    </div>
  </div>;
}
