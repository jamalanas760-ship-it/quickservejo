from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one match, got {count} for {old[:120]!r}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")

# Navigation: make Shifts available to all work-enabled restaurant roles and Automation
# available only to work managers. Keep capability-based rendering as the UX boundary.
replace_once(
    "src/components/nav/BottomNav.tsx",
    "  BriefcaseBusiness,\n  ChefHat,\n  ClipboardList,",
    "  BriefcaseBusiness,\n  CalendarClock,\n  ChefHat,\n  ClipboardList,",
)
replace_once(
    "src/components/nav/BottomNav.tsx",
    "  UserRoundCog,\n  Users,\n  UtensilsCrossed,",
    "  UserRoundCog,\n  Users,\n  UtensilsCrossed,\n  Workflow,",
)
replace_once(
    "src/components/nav/BottomNav.tsx",
    '    { to: "/work", icon: BriefcaseBusiness, en: "My Work", ar: "عملي", capability: "view_work" },\n    { to: `/manage/${restaurantId}/orders`, icon: ClipboardList, en: "Orders", ar: "الطلبات", capability: "view_orders" },',
    '    { to: "/work", icon: BriefcaseBusiness, en: "My Work", ar: "عملي", capability: "view_work" },\n    { to: "/shifts", icon: CalendarClock, en: "Shifts", ar: "الورديات", capability: "view_work" },\n    { to: "/automations", icon: Workflow, en: "Automation", ar: "الأتمتة", capability: "manage_work" },\n    { to: `/manage/${restaurantId}/orders`, icon: ClipboardList, en: "Orders", ar: "الطلبات", capability: "view_orders" },',
)
replace_once(
    "src/components/nav/BottomNav.tsx",
    '  const workItem: Item | null = can("view_work") ? { to: "/work", icon: BriefcaseBusiness, en: "My Work", ar: "عملي" } : null;\n  const erpItem:',
    '  const workItem: Item | null = can("view_work") ? { to: "/work", icon: BriefcaseBusiness, en: "My Work", ar: "عملي" } : null;\n  const shiftItem: Item | null = can("view_work") ? { to: "/shifts", icon: CalendarClock, en: "Shifts", ar: "الورديات" } : null;\n  const erpItem:',
)
replace_once(
    "src/components/nav/BottomNav.tsx",
    '      ? [workItem, erpItem, { to: "/notifications", icon: BellRing, en: "Alerts", ar: "التنبيهات" }, { to: "/profile", icon: User, en: "Profile", ar: "الحساب" }].filter(Boolean) as Item[]\n      : frontlineItem\n        ? [frontlineItem, workItem, { to: "/notifications", icon: BellRing, en: "Alerts", ar: "التنبيهات" }, { to: "/profile", icon: User, en: "Profile", ar: "الحساب" }].filter(Boolean) as Item[]',
    '      ? [workItem, shiftItem, erpItem, { to: "/notifications", icon: BellRing, en: "Alerts", ar: "التنبيهات" }, { to: "/profile", icon: User, en: "Profile", ar: "الحساب" }].filter(Boolean) as Item[]\n      : frontlineItem\n        ? [frontlineItem, workItem, shiftItem, { to: "/notifications", icon: BellRing, en: "Alerts", ar: "التنبيهات" }, { to: "/profile", icon: User, en: "Profile", ar: "الحساب" }].filter(Boolean) as Item[]',
)
replace_once(
    "src/components/nav/BottomNav.tsx",
    '  const mobilePriority = [homeTo, "/work", `/manage/${restaurantId}/orders`, `/manage/${restaurantId}/operations`, "/profile"];',
    '  const mobilePriority = [homeTo, "/work", "/shifts", `/manage/${restaurantId}/orders`, `/manage/${restaurantId}/operations`, "/profile"];',
)

# Operations manager workspace: surface live operations pulse + direct shift/automation tools.
replace_once(
    "src/routes/_authenticated/manager.tsx",
    'import { BarChart3, Boxes, BriefcaseBusiness, ChefHat, ClipboardList, Table2, UtensilsCrossed } from "lucide-react";',
    'import { BarChart3, Boxes, BriefcaseBusiness, CalendarClock, ChefHat, ClipboardList, Table2, UtensilsCrossed, Workflow } from "lucide-react";',
)
replace_once(
    "src/routes/_authenticated/manager.tsx",
    'import { AppHeader } from "@/components/nav/AppHeader";\nimport { Skeleton } from "@/components/ui/skeleton";',
    'import { AppHeader } from "@/components/nav/AppHeader";\nimport { OperationsPulse } from "@/components/operations/OperationsPulse";\nimport { Skeleton } from "@/components/ui/skeleton";',
)
replace_once(
    "src/routes/_authenticated/manager.tsx",
    '    can("view_work") ? { to: "/work", icon: BriefcaseBusiness, title: ar ? "عملي والموافقات" : "My Work & Approvals", hint: ar ? "المهام العاجلة والتسليم والموافقات في مكان واحد." : "Tasks, handover and approvals in one operational queue." } : null,\n    can("view_orders")',
    '    can("view_work") ? { to: "/work", icon: BriefcaseBusiness, title: ar ? "عملي والموافقات" : "My Work & Approvals", hint: ar ? "المهام العاجلة والتسليم والموافقات في مكان واحد." : "Tasks, handover and approvals in one operational queue." } : null,\n    can("manage_shifts") ? { to: "/shifts", icon: CalendarClock, title: ar ? "الورديات والتسليم" : "Shifts & Handover", hint: ar ? "افتح وأغلق الورديات ومرّر العمل غير المحلول للفريق التالي." : "Schedule, open, close and hand unresolved work to the next team." } : null,\n    can("manage_work") ? { to: "/automations", icon: Workflow, title: ar ? "قواعد الأتمتة" : "Automation Rules", hint: ar ? "حوّل أحداث التشغيل إلى مهام تلقائية مملوكة بوضوح." : "Convert live restaurant events into clearly owned work." } : null,\n    can("view_orders")',
)
replace_once(
    "src/routes/_authenticated/manager.tsx",
    '      <section className="grid gap-3 sm:grid-cols-3">\n        <Metric label={ar ? "طلبات اليوم" : "Orders today"} value={String(report.data?.ordersToday ?? 0)} />\n        <Metric label={ar ? "المبيعات اليوم" : "Sales today"} value={formatMoney(report.data?.salesToday ?? 0, "JOD", lang)} />\n        <Metric label={ar ? "طلبات مفتوحة" : "Open orders"} value={String(report.data?.openOrders ?? 0)} />\n      </section>\n\n      <section><div className="mb-3">',
    '      <section className="grid gap-3 sm:grid-cols-3">\n        <Metric label={ar ? "طلبات اليوم" : "Orders today"} value={String(report.data?.ordersToday ?? 0)} />\n        <Metric label={ar ? "المبيعات اليوم" : "Sales today"} value={formatMoney(report.data?.salesToday ?? 0, "JOD", lang)} />\n        <Metric label={ar ? "طلبات مفتوحة" : "Open orders"} value={String(report.data?.openOrders ?? 0)} />\n      </section>\n\n      <OperationsPulse restaurantId={restaurantId} canManageRules={can("manage_work") || can("manage_shifts")} />\n\n      <section><div className="mb-3">',
)

# My Work: real shift handovers appear in the existing Handover tab alongside legacy
# handover work items so there is no duplicate top-level work surface.
replace_once(
    "src/routes/_authenticated/work.tsx",
    'import { AppHeader } from "@/components/nav/AppHeader";\nimport { Badge } from "@/components/ui/badge";',
    'import { AppHeader } from "@/components/nav/AppHeader";\nimport { ShiftHandoverPanel } from "@/components/operations/ShiftHandoverPanel";\nimport { Badge } from "@/components/ui/badge";',
)
replace_once(
    "src/routes/_authenticated/work.tsx",
    '        <div className="overflow-x-auto border-b border-border p-2"><div className="flex min-w-max gap-1">{tabs.filter((item) => item.show).map((item) => <button key={item.id} type="button" onClick={() => setTab(item.id)} className={cn("rounded-xl px-4 py-2.5 text-xs font-bold transition", tab === item.id ? "bg-[#ff5a0a] text-white shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>{ar ? item.ar : item.en}</button>)}</div></div>\n        {tasks.isPending ?',
    '        <div className="overflow-x-auto border-b border-border p-2"><div className="flex min-w-max gap-1">{tabs.filter((item) => item.show).map((item) => <button key={item.id} type="button" onClick={() => setTab(item.id)} className={cn("rounded-xl px-4 py-2.5 text-xs font-bold transition", tab === item.id ? "bg-[#ff5a0a] text-white shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>{ar ? item.ar : item.en}</button>)}</div></div>\n        {tab === "handover" ? <ShiftHandoverPanel restaurantId={rid} currentStaffId={membership.id} currentRole={membership.role} /> : null}\n        {tasks.isPending ?',
)

print("Phase 2 UI integration patches applied.")
