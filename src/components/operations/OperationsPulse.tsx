import { Link } from "@tanstack/react-router";
import { AlertTriangle, CalendarClock, Workflow } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { useShiftHandovers, useShifts, useUrgentAutomatedWork } from "@/hooks/useOperations";
import { useI18n } from "@/lib/i18n";

export function OperationsPulse({ restaurantId, canManageRules }: { restaurantId: string; canManageRules: boolean }) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const alerts = useUrgentAutomatedWork(restaurantId);
  const shifts = useShifts(restaurantId);
  const handovers = useShiftHandovers(restaurantId);

  if (alerts.isPending || shifts.isPending || handovers.isPending) {
    return <Skeleton className="h-24 rounded-2xl" />;
  }

  const openShift = (shifts.data ?? []).find((shift) => shift.status === "open");
  const unacknowledged = (handovers.data ?? []).filter((row) => !row.acknowledged_at).length;
  const alertCount = alerts.data?.total ?? 0;

  return (
    <section className="qs-card overflow-hidden">
      <div className="grid divide-y divide-border md:grid-cols-3 md:divide-x md:divide-y-0 rtl:md:divide-x-reverse">
        <Link to="/work" className="flex min-h-24 items-center gap-3 p-4 transition hover:bg-muted/25">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-red-500/10 text-red-600"><AlertTriangle className="size-4" /></span>
          <span><strong className="block text-sm">{ar ? "تنبيهات تشغيلية" : "Operational alerts"}</strong><span className="mt-1 block text-xs text-muted-foreground">{alertCount ? (ar ? `${alertCount} بحاجة للمتابعة` : `${alertCount} need attention`) : (ar ? "لا توجد تنبيهات عاجلة" : "No urgent automated work")}</span></span>
        </Link>
        <Link to="/shifts" className="flex min-h-24 items-center gap-3 p-4 transition hover:bg-muted/25">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-orange-500/10 text-[#e85d2a]"><CalendarClock className="size-4" /></span>
          <span><strong className="block text-sm">{ar ? "الوردية الحالية" : "Current shift"}</strong><span className="mt-1 block text-xs text-muted-foreground">{openShift ? openShift.name : (ar ? "لا توجد وردية مفتوحة" : "No shift is open")}{unacknowledged ? ` · ${ar ? `${unacknowledged} تسليم` : `${unacknowledged} handover`}` : ""}</span></span>
        </Link>
        {canManageRules ? <Link to="/automations" className="flex min-h-24 items-center gap-3 p-4 transition hover:bg-muted/25">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-500/10 text-blue-600"><Workflow className="size-4" /></span>
          <span><strong className="block text-sm">{ar ? "قواعد الأتمتة" : "Automation rules"}</strong><span className="mt-1 block text-xs text-muted-foreground">{ar ? "حوّل الأحداث إلى مهام تلقائياً" : "Turn live events into assigned work"}</span></span>
        </Link> : <div className="flex min-h-24 items-center gap-3 p-4 text-muted-foreground"><Workflow className="size-5" /><span className="text-xs">{ar ? "الأتمتة مُدارة من المشرفين" : "Automation is managed by supervisors"}</span></div>}
      </div>
    </section>
  );
}
