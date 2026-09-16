import { createFileRoute, Link } from "@tanstack/react-router";
import { BarChart3, BellRing, ClipboardList, Table2, UtensilsCrossed } from "lucide-react";
import { StaffHeader } from "@/components/staff/StaffHeader";
import { useWorkspaceReport, useWorkspaceScope } from "@/hooks/useWorkspace";
import { formatMoney } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/manager")({
  head: () => ({ meta: [{ title: "Manager — QuickServe" }, { name: "description", content: "Restaurant manager operations workspace." }, { property: "og:title", content: "Manager — QuickServe" }, { property: "og:description", content: "Restaurant manager operations workspace." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ManagerHome,
});

function ManagerHome() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const scope = useWorkspaceScope();
  const report = useWorkspaceReport(scope.restaurantId);
  const rid = scope.restaurantId;
  const links = rid ? [
    { to: `/manage/${rid}/orders`, icon: ClipboardList, en: "Orders", ar: "الطلبات" },
    { to: `/manage/${rid}`, icon: UtensilsCrossed, en: "Menu", ar: "القائمة" },
    { to: `/manage/${rid}/tables`, icon: Table2, en: "Tables", ar: "الطاولات" },
    { to: `/manage/${rid}/analytics`, icon: BarChart3, en: "Analytics", ar: "التحليلات" },
    { to: "/waiter", icon: BellRing, en: "Table alerts", ar: "تنبيهات الطاولات" },
  ] : [];
  return <div className="min-h-dvh bg-background"><StaffHeader title={ar ? "مركز المدير" : "Manager workspace"} /><main className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6"><div><h1 className="qs-page-title">{ar ? "مركز عمليات المطعم" : "Restaurant operations"}</h1><p className="qs-page-subtitle">{scope.restaurantName}</p></div><section className="grid gap-3 sm:grid-cols-3"><div className="qs-stat"><p className="text-xs text-muted-foreground">{ar ? "الطلبات المفتوحة" : "Open orders"}</p><strong className="mt-2 block text-2xl">{report.data?.openOrders ?? 0}</strong></div><div className="qs-stat"><p className="text-xs text-muted-foreground">{ar ? "طلبات اليوم" : "Orders today"}</p><strong className="mt-2 block text-2xl">{report.data?.ordersToday ?? 0}</strong></div><div className="qs-stat"><p className="text-xs text-muted-foreground">{ar ? "مبيعات اليوم" : "Sales today"}</p><strong className="mt-2 block text-2xl">{formatMoney(report.data?.salesToday ?? 0, scope.currency, lang)}</strong></div></section><section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{links.map(({to,icon:Icon,en,ar:arabic})=><Link key={to} to={to as never} className="qs-quick-tile min-h-28"><span className="qs-quick-icon"><Icon className="size-5" /></span><strong>{ar?arabic:en}</strong></Link>)}</section></main></div>;
}