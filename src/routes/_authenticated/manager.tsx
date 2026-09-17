import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { BarChart3, Boxes, BriefcaseBusiness, CalendarClock, ChefHat, ClipboardList, Table2, UtensilsCrossed, Workflow } from "lucide-react";

import { AppHeader } from "@/components/nav/AppHeader";
import { OperationsPulse } from "@/components/operations/OperationsPulse";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccess } from "@/hooks/useSession";
import { useWorkspaceReport } from "@/hooks/useWorkspace";
import { formatMoney } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { membershipHasCapability, ROLE_LABELS, type Capability } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/manager")({
  head: () => ({ meta: [{ title: "Operations Workspace — QuickServe" }, { name: "description", content: "Role-aware manager and operations workspace." }] }),
  component: ManagerWorkspace,
});

function ManagerWorkspace() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const access = useAccess();
  const membership = (access.data ?? []).find((row) => (row.role === "operations_manager" || row.role === "manager") && row.restaurant_id && row.restaurant) ?? null;
  const restaurantId = membership?.restaurant_id ?? null;
  const report = useWorkspaceReport(restaurantId);

  if (access.isPending) return <div className="min-h-dvh bg-background"><AppHeader /><div className="qs-page"><Skeleton className="h-[520px] rounded-2xl" /></div></div>;
  if (!membership || !restaurantId) return <Navigate to="/profile" replace />;

  const can = (capability: Capability) => membershipHasCapability(membership.role, membership.permission_overrides, capability);
  const roleName = ROLE_LABELS[membership.role]?.[lang] ?? membership.role;
  const links = [
    can("view_work") ? { to: "/work", icon: BriefcaseBusiness, title: ar ? "عملي والموافقات" : "My Work & Approvals", hint: ar ? "المهام العاجلة والتسليم والموافقات في مكان واحد." : "Tasks, handover and approvals in one operational queue." } : null,
    can("manage_shifts") ? { to: "/shifts", icon: CalendarClock, title: ar ? "الورديات والتسليم" : "Shifts & Handover", hint: ar ? "افتح وأغلق الورديات ومرّر العمل غير المحلول للفريق التالي." : "Schedule, open, close and hand unresolved work to the next team." } : null,
    can("manage_work") ? { to: "/automations", icon: Workflow, title: ar ? "قواعد الأتمتة" : "Automation Rules", hint: ar ? "حوّل أحداث التشغيل إلى مهام تلقائية مملوكة بوضوح." : "Convert live restaurant events into clearly owned work." } : null,
    can("view_orders") ? { to: `/manage/${restaurantId}/orders`, icon: ClipboardList, title: ar ? "الطلبات" : "Orders", hint: ar ? "تابع الطلبات وحالاتها." : "Track restaurant orders and status." } : null,
    can("manage_menu") ? { to: `/manage/${restaurantId}`, icon: UtensilsCrossed, title: ar ? "القائمة والتوفر" : "Menu & Availability", hint: ar ? "حدّث التوفر والمحتوى المسموح." : "Manage allowed menu and availability actions." } : null,
    can("manage_tables") ? { to: `/manage/${restaurantId}/tables`, icon: Table2, title: ar ? "الطاولات" : "Tables", hint: ar ? "راقب مخطط الصالة والطاولات." : "Work with tables and floor layout." } : null,
    can("view_erp") ? { to: `/manage/${restaurantId}/operations`, icon: Boxes, title: ar ? "ERP والإدارة الخلفية" : "ERP & Back Office", hint: ar ? "المخزون والموردون والمشتريات والمالية حسب مسؤولياتك." : "Inventory, suppliers, procurement and finance according to your job profile." } : null,
    can("view_analytics") ? { to: `/manage/${restaurantId}/analytics`, icon: BarChart3, title: ar ? "التحليلات" : "Analytics", hint: ar ? "راقب الأداء والتقارير." : "Review performance and reports." } : null,
    can("update_order_status") ? { to: "/kitchen", icon: ChefHat, title: ar ? "عمليات المطبخ" : "Kitchen Operations", hint: ar ? "تابع تدفق التحضير والجاهزية." : "Supervise preparation and ready flow." } : null,
  ].filter(Boolean) as Array<{ to: string; icon: typeof ClipboardList; title: string; hint: string }>;

  return <div className="min-h-dvh bg-background">
    <AppHeader title={ar ? "مساحة العمليات" : "Operations workspace"} />
    <main className="qs-page space-y-5">
      <section className="qs-card overflow-hidden bg-gradient-to-br from-slate-950 to-slate-800 p-6 text-white sm:p-8">
        <p className="text-[10px] font-bold uppercase tracking-[.22em] text-orange-300">{roleName}</p>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-[-.04em] sm:text-4xl">{ar ? `مرحباً، ${membership.name}` : `Welcome, ${membership.name}`}</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/70">{ar ? `إدارة تشغيل ${membership.restaurant?.name ?? "المطعم"} من مساحة مركزة على المسؤوليات والموافقات.` : `Run ${membership.restaurant?.name ?? "the restaurant"} from a focused workspace built around responsibilities and approvals.`}</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <Metric label={ar ? "طلبات اليوم" : "Orders today"} value={String(report.data?.ordersToday ?? 0)} />
        <Metric label={ar ? "المبيعات اليوم" : "Sales today"} value={formatMoney(report.data?.salesToday ?? 0, "JOD", lang)} />
        <Metric label={ar ? "طلبات مفتوحة" : "Open orders"} value={String(report.data?.openOrders ?? 0)} />
      </section>

      <OperationsPulse restaurantId={restaurantId} canManageRules={can("manage_work") || can("manage_shifts")} />

      <section><div className="mb-3"><h2 className="qs-section-title">{ar ? "مساحة العمل" : "Your workspace"}</h2><p className="mt-1 text-xs text-muted-foreground">{ar ? "تظهر الأدوات التي يسمح بها دورك فقط." : "Only tools inside your job profile and assigned permissions are shown."}</p></div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{links.map(({ to, icon: Icon, title, hint }) => <Link key={to} to={to as never} className="qs-card group flex min-h-36 items-start gap-4 p-5 transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-orange-50 text-[#ff5a0a] dark:bg-orange-950/30"><Icon className="size-5" /></span><span className="min-w-0"><strong className="block text-base">{title}</strong><span className="mt-2 block text-xs leading-5 text-muted-foreground">{hint}</span></span></Link>)}</div>
      </section>
    </main>
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <article className="qs-stat p-5"><p className="text-xs font-semibold text-muted-foreground">{label}</p><p className="mt-2 font-display text-3xl font-bold tracking-[-.04em]">{value}</p></article>;
}
