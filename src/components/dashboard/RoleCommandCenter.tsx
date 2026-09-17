import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  PackageSearch,
  Receipt,
  Table2,
  UsersRound,
  Wallet,
  Workflow,
} from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { useOpenWorkCount, useShiftHandovers, useShifts, useUrgentAutomatedWork } from "@/hooks/useOperations";
import { useAccess } from "@/hooks/useSession";
import { useWorkspaceScope } from "@/hooks/useWorkspace";
import { useI18n } from "@/lib/i18n";
import { membershipHasCapability, ROLE_LABELS, type AppRole, type Capability } from "@/lib/permissions";
import { cn } from "@/lib/utils";

type ActionKey = "work" | "shifts" | "automation" | "orders" | "tables" | "analytics" | "erp";

type CommandAction = {
  key: ActionKey;
  to: string;
  capability: Capability;
  icon: typeof BriefcaseBusiness;
  en: string;
  ar: string;
  hintEn: string;
  hintAr: string;
};

const ROLE_COPY: Record<AppRole, { en: string; ar: string; focusEn: string; focusAr: string }> = {
  super_admin: { en: "Platform command", ar: "قيادة المنصة", focusEn: "Platform-wide control and exceptions", focusAr: "التحكم بالمنصة والاستثناءات" },
  restaurant_admin: { en: "Restaurant command", ar: "قيادة المطعم", focusEn: "Business, people and operational control", focusAr: "إدارة الأعمال والفريق والتشغيل" },
  operations_manager: { en: "Live operations", ar: "التشغيل المباشر", focusEn: "Team workload, shifts and service flow", focusAr: "عبء الفريق والورديات وتدفق الخدمة" },
  manager: { en: "Shift control", ar: "قيادة الوردية", focusEn: "Own the current shift and unresolved work", focusAr: "إدارة الوردية الحالية والعمل غير المحلول" },
  kitchen: { en: "Kitchen priority", ar: "أولوية المطبخ", focusEn: "Kitchen work, prep alerts and handover", focusAr: "عمل المطبخ والتنبيهات والتسليم" },
  waiter: { en: "Floor priority", ar: "أولوية الصالة", focusEn: "Tables, calls, own work and handover", focusAr: "الطاولات والنداءات ومهامك والتسليم" },
  host: { en: "Guest flow", ar: "تدفق الضيوف", focusEn: "Tables, calls, current shift and handover", focusAr: "الطاولات والنداءات والوردية والتسليم" },
  cashier: { en: "Settlement desk", ar: "مكتب التسوية", focusEn: "Payments, open work and shift handover", focusAr: "المدفوعات والعمل المفتوح وتسليم الوردية" },
  inventory: { en: "Stock control", ar: "ضبط المخزون", focusEn: "Inventory work, exceptions and stock movement", focusAr: "مهام المخزون والاستثناءات وحركة المواد" },
  procurement: { en: "Procurement desk", ar: "مكتب المشتريات", focusEn: "Supplier work, purchasing and exceptions", focusAr: "الموردون والمشتريات والاستثناءات" },
  accountant: { en: "Finance desk", ar: "مكتب المالية", focusEn: "Finance work, expenses and operational context", focusAr: "مهام المالية والمصاريف والسياق التشغيلي" },
};

const ROLE_ACTION_ORDER: Partial<Record<AppRole, ActionKey[]>> = {
  restaurant_admin: ["work", "shifts", "automation", "orders", "analytics", "erp", "tables"],
  operations_manager: ["work", "shifts", "orders", "tables", "erp", "analytics", "automation"],
  manager: ["shifts", "work", "orders", "tables", "analytics", "automation"],
  kitchen: ["work", "shifts", "orders"],
  waiter: ["work", "shifts", "tables", "orders"],
  host: ["shifts", "work", "tables", "orders"],
  cashier: ["work", "shifts", "orders"],
  inventory: ["erp", "work", "shifts"],
  procurement: ["erp", "work", "shifts"],
  accountant: ["erp", "work", "analytics", "shifts"],
};

export function RoleCommandCenter({ restaurantId: restaurantIdProp, compact = false, className }: { restaurantId?: string | null; compact?: boolean; className?: string }) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const scope = useWorkspaceScope();
  const access = useAccess();
  const restaurantId = restaurantIdProp ?? scope.restaurantId;
  const membership = restaurantId ? access.membershipFor(restaurantId) : null;
  const shifts = useShifts(restaurantId);
  const work = useOpenWorkCount(restaurantId);
  const alerts = useUrgentAutomatedWork(restaurantId);
  const handovers = useShiftHandovers(restaurantId);

  if (!restaurantId || access.isPending || !membership) return null;

  const can = (capability: Capability) => membershipHasCapability(membership.role, membership.permission_overrides, capability);
  if (!can("view_work")) return null;

  const role = membership.role;
  const copy = ROLE_COPY[role] ?? ROLE_COPY.manager;
  const openShift = (shifts.data ?? []).find((shift) => shift.status === "open") ?? null;
  const pendingHandovers = (handovers.data ?? []).filter((row) => !row.acknowledged_at).length;
  const automated = alerts.data?.total ?? 0;
  const urgent = (alerts.data?.urgent ?? 0) + (alerts.data?.high ?? 0);
  const isPending = shifts.isPending || work.isPending || alerts.isPending || handovers.isPending;

  const allActions: CommandAction[] = [
    { key: "work", to: "/work", capability: "view_work", icon: BriefcaseBusiness, en: "My Work", ar: "عملي", hintEn: "Tasks, approvals and exceptions", hintAr: "المهام والموافقات والاستثناءات" },
    { key: "shifts", to: "/shifts", capability: "view_work", icon: CalendarClock, en: "Shifts", ar: "الورديات", hintEn: "Current shift and handover", hintAr: "الوردية الحالية والتسليم" },
    { key: "automation", to: "/automations", capability: "manage_work", icon: Workflow, en: "Automation", ar: "الأتمتة", hintEn: "Operational event rules", hintAr: "قواعد الأحداث التشغيلية" },
    { key: "orders", to: `/manage/${restaurantId}/orders`, capability: "view_orders", icon: ClipboardList, en: "Orders", ar: "الطلبات", hintEn: "Live service queue", hintAr: "قائمة الخدمة المباشرة" },
    { key: "tables", to: `/manage/${restaurantId}/tables`, capability: "manage_tables", icon: Table2, en: "Tables", ar: "الطاولات", hintEn: "Floor and table state", hintAr: "حالة الصالة والطاولات" },
    { key: "analytics", to: `/manage/${restaurantId}/analytics`, capability: "view_analytics", icon: BarChart3, en: "Analytics", ar: "التحليلات", hintEn: "Performance and trends", hintAr: "الأداء والاتجاهات" },
    { key: "erp", to: `/manage/${restaurantId}/operations`, capability: "view_erp", icon: Boxes, en: role === "inventory" ? "Inventory" : role === "procurement" ? "Procurement" : role === "accountant" ? "Finance" : "ERP", ar: role === "inventory" ? "المخزون" : role === "procurement" ? "المشتريات" : role === "accountant" ? "المالية" : "ERP", hintEn: role === "inventory" ? "Stock and movement control" : role === "procurement" ? "Suppliers and purchasing" : role === "accountant" ? "Expenses and finance" : "Back-office operations", hintAr: role === "inventory" ? "المخزون وحركة المواد" : role === "procurement" ? "الموردون والمشتريات" : role === "accountant" ? "المصاريف والمالية" : "الإدارة الخلفية" },
  ];

  const allowed = allActions.filter((action) => can(action.capability));
  const order = ROLE_ACTION_ORDER[role] ?? ["work", "shifts", "orders", "tables", "analytics", "erp", "automation"];
  const orderIndex = new Map(order.map((key, index) => [key, index]));
  const actions = allowed.sort((a, b) => (orderIndex.get(a.key) ?? 99) - (orderIndex.get(b.key) ?? 99));

  const roleIcon = role === "inventory" ? PackageSearch : role === "procurement" ? Boxes : role === "accountant" ? Receipt : role === "cashier" ? Wallet : role === "restaurant_admin" || role === "operations_manager" || role === "manager" ? UsersRound : BriefcaseBusiness;
  const RoleIcon = roleIcon;

  return (
    <section className={cn("overflow-hidden rounded-[26px] border border-border bg-card", className)}>
      <div className={cn("grid gap-5", compact ? "p-4 sm:p-5" : "p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center")}>
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-orange-500/10 text-[#ff5a0a]"><RoleIcon className="size-5" /></span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><h2 className="font-display text-xl font-bold tracking-[-.03em]">{ar ? copy.ar : copy.en}</h2><span className="rounded-full border border-border bg-muted/40 px-2 py-1 text-[10px] font-bold text-muted-foreground">{ROLE_LABELS[role]?.[lang] ?? role}</span></div>
              <p className="mt-1 text-xs text-muted-foreground">{ar ? copy.focusAr : copy.focusEn}</p>
            </div>
          </div>
        </div>

        {!compact && actions.length ? <div className="flex flex-wrap gap-2 lg:justify-end">{actions.slice(0, 4).map(({ key, to, icon: Icon, en, ar: arLabel }) => <Link key={key} to={to as never} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 text-xs font-bold transition hover:border-orange-300 hover:text-[#ff5a0a]"><Icon className="size-4" />{ar ? arLabel : en}</Link>)}</div> : null}
      </div>

      <div className="grid border-t border-border sm:grid-cols-2 xl:grid-cols-4">
        <StatusCell icon={CalendarClock} label={ar ? "الوردية" : "Shift"} value={isPending ? null : (openShift?.name ?? (ar ? "لا توجد وردية مفتوحة" : "No open shift"))} emphasize={Boolean(openShift)} />
        <StatusCell icon={CheckCircle2} label={ar ? "عمل مفتوح" : "Open work"} value={isPending ? null : String(work.data ?? 0)} />
        <StatusCell icon={AlertTriangle} label={ar ? "عمل آلي" : "Automated work"} value={isPending ? null : String(automated)} detail={urgent ? (ar ? `${urgent} عالي/عاجل` : `${urgent} high / urgent`) : undefined} emphasize={urgent > 0} />
        <StatusCell icon={Workflow} label={ar ? "تسليم بانتظار الاستلام" : "Pending handover"} value={isPending ? null : String(pendingHandovers)} emphasize={pendingHandovers > 0} />
      </div>

      {compact && actions.length ? <div className="flex gap-2 overflow-x-auto border-t border-border p-3">{actions.slice(0, 5).map(({ key, to, icon: Icon, en, ar: arLabel }) => <Link key={key} to={to as never} className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-xl bg-muted/45 px-3 text-xs font-bold transition hover:bg-orange-500/10 hover:text-[#ff5a0a]"><Icon className="size-3.5" />{ar ? arLabel : en}</Link>)}</div> : null}
    </section>
  );
}

function StatusCell({ icon: Icon, label, value, detail, emphasize }: { icon: typeof CalendarClock; label: string; value: string | null; detail?: string; emphasize?: boolean }) {
  return <div className="flex min-h-[86px] items-center gap-3 border-border p-4 max-sm:border-t sm:border-s xl:border-t-0 first:border-s-0"><span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", emphasize ? "bg-orange-500/10 text-[#ff5a0a]" : "bg-muted text-muted-foreground")}><Icon className="size-4" /></span><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[.08em] text-muted-foreground">{label}</p>{value === null ? <Skeleton className="mt-2 h-4 w-20" /> : <p className="mt-1 truncate text-sm font-bold">{value}</p>}{detail ? <p className="mt-0.5 text-[10px] font-semibold text-red-600">{detail}</p> : null}</div></div>;
}
