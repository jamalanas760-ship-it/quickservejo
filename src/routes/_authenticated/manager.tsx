import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { BarChart3, Boxes, BriefcaseBusiness, CalendarClock, ChefHat, ClipboardList, Table2, UtensilsCrossed, Workflow } from "lucide-react";

import { MasterEyebrow, MasterKpi, MasterPageHeader } from "@/components/app/MasterPage";
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
      <MasterPageHeader
        eyebrow={<MasterEyebrow icon={BriefcaseBusiness}>{roleName}</MasterEyebrow>}
        title={ar ? `مرحباً، ${membership.name}` : `Welcome, ${membership.name}`}
        description={ar ? `إدارة تشغيل ${membership.restaurant?.name ?? "المطعم"} من مساحة مركزة على الخدمة والمسؤوليات والموافقات.` : `Run ${membership.restaurant?.name ?? "the restaurant"} from a focused workspace built around service, responsibilities and approvals.`}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MasterKpi icon={ClipboardList} label={ar?"طلبات اليوم":"Orders Today"} value={String(report.data?.ordersToday??0)} hint={ar?"الحركة اليومية":"Daily volume"} tone="blue"/>
        <MasterKpi icon={BarChart3} label={ar?"المبيعات اليوم":"Sales Today"} value={formatMoney(report.data?.salesToday??0,"JOD",lang)} hint={ar?"إيراد اليوم":"Today's revenue"} tone="green"/>
        <MasterKpi icon={ChefHat} label={ar?"طلبات مفتوحة":"Open Orders"} value={String(report.data?.openOrders??0)} hint={ar?"تحتاج متابعة":"Need attention"} tone="orange"/>
        <MasterKpi icon={CalendarClock} label={ar?"متوسط الطلب":"Avg Ticket"} value={formatMoney(report.data?.averageOrder??0,"JOD",lang)} hint={ar?"متوسط 7 أيام":"7-day average"} tone="purple"/>
      </section>

      <OperationsPulse restaurantId={restaurantId} canManageRules={can("manage_work") || can("manage_shifts")} />

      <section><div className="mb-3"><h2 className="qs-section-title">{ar ? "مساحة العمل" : "Your workspace"}</h2><p className="mt-1 text-xs text-muted-foreground">{ar ? "تظهر الأدوات التي يسمح بها دورك فقط." : "Only tools inside your job profile and assigned permissions are shown."}</p></div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{links.map(({ to, icon: Icon, title, hint }) => <Link key={to} to={to as never} className="group flex min-h-36 items-start gap-4 rounded-[18px] border border-border/85 bg-card p-5 shadow-[var(--qs-shadow-card)] transition hover:-translate-y-px hover:border-primary/20 hover:shadow-[var(--qs-shadow-hover)]"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-orange-50 text-[#ff5a0a] dark:bg-orange-950/30"><Icon className="size-5" /></span><span className="min-w-0"><strong className="block text-base">{title}</strong><span className="mt-2 block text-xs leading-5 text-muted-foreground">{hint}</span></span></Link>)}</div>
      </section>
    </main>
  </div>;
}
