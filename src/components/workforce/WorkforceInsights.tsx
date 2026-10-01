import { isLiveTeamPunch, teamPunchesByStaff } from "@/lib/team-attendance";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { workforceDayStart, workforceNextDay, workforceDayKey, workforceHours, workforceLocalInput, workforceInputTimestamp } from "@/lib/workforce-hours";
import { RequestDateTimePicker, RequestDatePicker } from "@/components/workforce/RequestPickers";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Lock,
  Pencil,
  Plus,
  RotateCcw,
  UserRound,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { DetailRow, DetailSheet, formatStamp } from "@/components/operations/DetailSheet";
import { WorkforceButton as Button } from "@/components/workforce/WorkforceButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { ShiftAssignment } from "@/hooks/useOperations";
import { supabase } from "@/integrations/supabase/client";
import { humanError } from "@/lib/errors";
import { ROLE_LABELS, type AppRole } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import {
  Inspector,
  Person,
  SearchField,
  WeekControl,
  weekOf,
  moveDay,
  hourLabel,
} from "./WorkforcePrimitives";

export type WorkforceMember = { id: string; name: string; role: AppRole; is_active: boolean };
type Entry = {
  id: string;
  staff_id: string;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number;
  review_status?: "pending" | "approved" | "rejected" | null;
  reviewed_at?: string | null;
  review_note?: string | null;
};
type Leave = {
  id: string;
  staff_id: string;
  start_date: string;
  end_date: string;
  status: string;
  reason: string;
};
type MissingPunchRequest = {
  id: string;
  staff_id: string;
  clock_in: string;
  clock_out: string;
  break_minutes: number;
  reason: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  created_at: string;
};

/** Operational thresholds (not payroll rules). */
const LATE_MIN = 15;
const OVERTIME_MIN = 30;
const WEEKLY_OVERTIME_RISK_H = 40;

const H = (ms: number) => ms / 3_600_000;
const fmtH = (h: number, ar: boolean) => `${h.toFixed(1)}${ar ? "س" : "h"}`;
const fmtTime = (v: string | null | undefined, ar: boolean, timeZone = "Asia/Amman") =>
  v
    ? new Date(v).toLocaleTimeString(ar ? "ar-JO" : "en-US", { timeZone, hour: "2-digit", minute: "2-digit" })
    : "—";
const dayKey = (v: string | Date, timeZone = "Asia/Amman") => workforceDayKey(new Date(v),timeZone);
const toLocalInput = (value: string | null, timeZone = "Asia/Amman") => value ? workforceLocalInput(value,timeZone) : "";

export function useWorkforceData(restaurantId: string, range?: { start: string; end: string }) {
  const restaurant = useRestaurant(restaurantId);
  const timeZone = restaurant.data?.timezone || "Asia/Amman";
  return useQuery({
    queryKey: ["workforce", "insights", restaurantId, range?.start ?? "recent", range?.end ?? "", timeZone],
    refetchInterval: 30_000,
    queryFn: async () => {
      const since = range
        ? new Date(workforceDayStart(range.start,timeZone)).toISOString()
        : new Date(Date.now() - 35 * 86400000).toISOString();
      const until = range
        ? new Date(workforceDayStart(workforceNextDay(range.end),timeZone)).toISOString()
        : new Date(Date.now() + 86400000).toISOString();
      const [timeRes, leaveRes] = await Promise.all([
        (supabase.from as any)("staff_time_entries")
          .select("*")
          .eq("restaurant_id", restaurantId)
          .lt("clock_in", until)
          .or(`clock_out.is.null,clock_out.gte.${since}`)
          .order("clock_in", { ascending: false })
          .limit(1000),
        (supabase.from as any)("staff_leave_requests")
          .select("id,staff_id,start_date,end_date,status,reason")
          .eq("restaurant_id", restaurantId)
          .order("created_at", { ascending: false })
          .limit(300),
      ]);
      if (timeRes.error) throw timeRes.error;
      if (leaveRes.error) throw leaveRes.error;
      return { entries: (timeRes.data ?? []) as Entry[], leave: (leaveRes.data ?? []) as Leave[], timeZone };
    },
  });
}

export type LifecycleStatus =
  "scheduled" | "working" | "late" | "overtime" | "completed" | "absent" | "off";

/** Scheduled → Clocked in → Clocked out, derived from assignments vs time entries. */
export function memberDayStatus(
  memberId: string,
  dateKey: string,
  assignments: ShiftAssignment[],
  entries: Entry[],
  now = Date.now(),
  timeZone = "Asia/Amman",
) {
  const dayKey = (value: string | Date) => workforceDayKey(new Date(value),timeZone);
  const accepted = entries.filter(e => e.review_status !== "rejected" && Date.parse(e.clock_in) <= now && (e.clock_out ? Date.parse(e.clock_out) > Date.parse(e.clock_in) : isLiveTeamPunch(e,now)));
  const liveEntries = teamPunchesByStaff(accepted,now).live;
  const validEntries = accepted.filter(e => e.clock_out || liveEntries.get(e.staff_id) === e);
  const dayStart = workforceDayStart(dateKey,timeZone), dayEnd = workforceDayStart(workforceNextDay(dateKey),timeZone);
  const scheduled = assignments.filter(
    (a) =>
      a.staff_id === memberId &&
      a.status !== "released" &&
      a.starts_at &&
      a.ends_at &&
      Date.parse(a.starts_at) < dayEnd && Date.parse(a.ends_at) > dayStart,
  );
  const dayEntries = validEntries.filter(
    (e) => e.staff_id === memberId && Date.parse(e.clock_in) < dayEnd && (e.clock_out ? Date.parse(e.clock_out) : now) > dayStart,
  );
  const open = dateKey === dayKey(new Date(now)) ? teamPunchesByStaff(validEntries,now).live.get(memberId) : undefined;
  const first = scheduled.sort((a, b) => a.starts_at!.localeCompare(b.starts_at!))[0];
  const start = first ? new Date(first.starts_at!).getTime() : null;
  const end = first ? new Date(first.ends_at!).getTime() : null;
  const firstIn = dayEntries.length
    ? Math.min(...dayEntries.map((e) => new Date(e.clock_in).getTime()))
    : null;
  const lastOut =
    dayEntries.every((e) => e.clock_out) && dayEntries.length
      ? Math.max(...dayEntries.map((e) => new Date(e.clock_out!).getTime()))
      : null;
  const {actualH, plannedH: scheduledH} = workforceHours(memberId,dateKey,assignments,validEntries,now,timeZone);
  const breakMin = dayEntries.reduce((s,e) => s+(e.break_minutes || 0),0);
  const lateMin =
    start && firstIn
      ? Math.max(0, (firstIn - start) / 60000)
      : start && !firstIn && now > start
        ? (now - start) / 60000
        : 0;
  const earlyMin = end && lastOut ? Math.max(0, (end - lastOut) / 60000) : 0;
  const overtimeMin = end ? Math.max(0, ((lastOut ?? (open ? now : 0)) - end) / 60000) : 0;
  let status: LifecycleStatus = "off";
  if (open)
    status = overtimeMin >= OVERTIME_MIN ? "overtime" : lateMin >= LATE_MIN ? "late" : "working";
  else if (dayEntries.length) status = overtimeMin >= OVERTIME_MIN ? "overtime" : "completed";
  else if (start && end && now > end) status = "absent";
  else if (start && now > start + LATE_MIN * 60000) status = "late";
  else if (start) status = "scheduled";
  return {
    status,
    assignment: first ?? null,
    firstIn,
    lastOut,
    actualH,
    scheduledH,
    breakMin,
    lateMin,
    earlyMin,
    overtimeMin,
    missing: Boolean(start && !firstIn && now > start + LATE_MIN * 60000),
  };
}

export function lifecycleLabel(s: LifecycleStatus, ar: boolean) {
  const m: Record<LifecycleStatus, [string, string]> = {
    scheduled: ["Scheduled", "مجدول"],
    working: ["Working", "يعمل"],
    late: ["Late", "متأخر"],
    overtime: ["Overtime", "وقت إضافي"],
    completed: ["Completed", "مكتمل"],
    absent: ["Absent", "غائب"],
    off: ["Off", "خارج الجدول"],
  };
  return m[s][ar ? 1 : 0];
}
export function lifecycleTone(s: LifecycleStatus) {
  return s === "working"
    ? "bg-emerald-500/10 text-emerald-700"
    : s === "late"
      ? "bg-orange-500/10 text-orange-700"
      : s === "overtime"
        ? "bg-amber-500/10 text-amber-700"
        : s === "absent"
          ? "bg-red-500/10 text-red-700"
          : s === "completed"
            ? "bg-slate-500/10 text-slate-700"
            : s === "scheduled"
              ? "bg-blue-500/10 text-blue-700"
              : "bg-muted text-muted-foreground";
}
function Pill({ s, ar }: { s: LifecycleStatus; ar: boolean }) {
  return (
    <span
      className={cn("inline-flex rounded-full px-2 py-1 text-[10px] font-bold", lifecycleTone(s))}
    >
      {lifecycleLabel(s, ar)}
    </span>
  );
}
const roleLabel = (r: AppRole, ar: boolean) => ROLE_LABELS[r]?.[ar ? "ar" : "en"] ?? r;
const reviewOf = (e: Entry) => e.review_status ?? "pending";

function EmptyCard({ text }: { text: string }) {
  return (
    <div className="p-8 text-center text-xs text-muted-foreground">
      <CheckCircle2 className="mx-auto mb-2 size-7 text-emerald-500/70" />
      {text}
    </div>
  );
}

/* ---------------------------- Exceptions feed ---------------------------- */
export function WorkforceExceptions({
  restaurantId,
  currentStaffId,
  members,
  assignments,
  ar,
}: {
  restaurantId: string;
  currentStaffId: string;
  members: WorkforceMember[];
  assignments: ShiftAssignment[];
  ar: boolean;
}) {
  const qc = useQueryClient();
  const data = useWorkforceData(restaurantId);
  const readFeed = useQuery<Array<{ body: string | null }>>({
    queryKey: ["workforce", "attention-reads", restaurantId, currentStaffId],
    enabled: Boolean(currentStaffId),
    staleTime: 10_000,
    queryFn: async () => {
      const { data: rows, error } = await (supabase.from("in_app_notifications" as any) as any)
        .select("body")
        .eq("restaurant_id", restaurantId)
        .eq("staff_id", currentStaffId)
        .eq("source_type", "workforce_alert_read")
        .not("read_at", "is", null)
        .limit(500);
      if (error) throw error;
      return (rows ?? []) as Array<{ body: string | null }>;
    },
  });

  const items = useMemo(() => {
    if (!data.data) return [];
    const today = dayKey(new Date(),data.data?.timeZone);
    const out: Array<{ key: string; tone: string; title: string; detail: string }> = [];
    for (const m of members.filter((x) => x.is_active)) {
      const d = memberDayStatus(m.id, today, assignments, data.data.entries, Date.now(), data.data.timeZone);
      if (d.missing)
        out.push({
          key: `miss-${today}-${m.id}`,
          tone: "red",
          title: ar ? `${m.name}: لم يسجّل الدخول` : `${m.name}: missing clock-in`,
          detail: ar
            ? `بداية مجدولة ${fmtTime(d.assignment?.starts_at, ar)}`
            : `Scheduled start ${fmtTime(d.assignment?.starts_at, ar)}`,
        });
      else if (d.firstIn && d.lateMin >= LATE_MIN)
        out.push({
          key: `late-${today}-${m.id}`,
          tone: "orange",
          title: ar ? `${m.name}: وصول متأخر` : `${m.name}: late arrival`,
          detail: ar
            ? `${Math.round(d.lateMin)} دقيقة بعد البداية`
            : `${Math.round(d.lateMin)} min after scheduled start`,
        });
      if (d.overtimeMin >= OVERTIME_MIN)
        out.push({
          key: `ot-${today}-${m.id}`,
          tone: "amber",
          title: ar ? `${m.name}: وقت إضافي` : `${m.name}: overtime`,
          detail: ar
            ? `${Math.round(d.overtimeMin)} دقيقة بعد نهاية الوردية`
            : `${Math.round(d.overtimeMin)} min past shift end`,
        });
      const mine = assignments
        .filter(
          (a) =>
            a.staff_id === m.id &&
            a.status !== "released" &&
            a.starts_at &&
            a.ends_at &&
            a.starts_at.slice(0, 10) >= today,
        )
        .sort((a, b) => a.starts_at!.localeCompare(b.starts_at!));
      for (let i = 1; i < mine.length; i++)
        if (mine[i].starts_at! < mine[i - 1].ends_at!) {
          out.push({
            key: `cf-${mine[i].id}`,
            tone: "red",
            title: ar ? `${m.name}: تعارض ورديات` : `${m.name}: shift conflict`,
            detail: `${dayKey(mine[i].starts_at!)} · ${fmtTime(mine[i].starts_at, ar)}`,
          });
          break;
        }
    }
    const pendingTimesheets = data.data.entries.filter(
      (e) => e.clock_out && reviewOf(e) === "pending",
    );
    if (pendingTimesheets.length)
      out.push({
        key: `ts-${pendingTimesheets.length}-${pendingTimesheets[0]?.id ?? "none"}`,
        tone: "blue",
        title: ar
          ? `${pendingTimesheets.length} سجل دوام بانتظار المراجعة`
          : `${pendingTimesheets.length} timesheet${pendingTimesheets.length === 1 ? "" : "s"} awaiting review`,
        detail: ar ? "راجع من تبويب سجلات الدوام" : "Review in the Timesheets tab",
      });
    const pendingLeaves = data.data.leave.filter((l) => l.status === "pending");
    if (pendingLeaves.length)
      out.push({
        key: `lv-${pendingLeaves.length}-${pendingLeaves[0]?.id ?? "none"}`,
        tone: "purple",
        title: ar
          ? `${pendingLeaves.length} طلب إجازة معلّق`
          : `${pendingLeaves.length} pending time-off request${pendingLeaves.length === 1 ? "" : "s"}`,
        detail: ar ? "بانتظار موافقة المدير" : "Waiting for manager approval",
      });
    return out;
  }, [data.data, members, assignments, ar]);

  const readKeys = new Set(
    (readFeed.data ?? []).map((row) => row.body).filter((value): value is string => Boolean(value)),
  );
  const unreadItems = items.filter((item) => !readKeys.has(item.key));
  const markRead = useMutation({
    mutationFn: async (keys: string[]) => {
      if (!keys.length) return;
      const { error } = await (supabase as any).rpc("mark_workforce_attention_read", {
        _restaurant_id: restaurantId,
        _alert_keys: keys,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({
        queryKey: ["workforce", "attention-reads", restaurantId, currentStaffId],
      });
    },
    onError: (error) => toast.error(humanError(error, ar ? "ar" : "en")),
  });

  const toneCls: Record<string, string> = {
    red: "bg-red-500/10 text-red-600",
    orange: "bg-orange-500/10 text-orange-600",
    amber: "bg-amber-500/10 text-amber-700",
    blue: "bg-blue-500/10 text-blue-600",
    purple: "bg-violet-500/10 text-violet-600",
  };
  return (
    <section className="qs-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <div>
          <h2 className="qs-section-title">{ar ? "يحتاج انتباه" : "Needs attention"}</h2>
        </div>
        <div className="flex items-center gap-2">
          {unreadItems.length ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2.5 text-[10px]"
              disabled={markRead.isPending}
              onClick={() => markRead.mutate(unreadItems.map((item) => item.key))}
            >
              <CheckCircle2 className="size-3.5" />
              {ar ? "قراءة الكل" : "Mark all read"}
            </Button>
          ) : null}
          <span
            className={cn(
              "rounded-full px-3 py-1 text-[10px] font-bold",
              unreadItems.length
                ? "bg-orange-500/10 text-orange-700"
                : "bg-muted text-muted-foreground",
            )}
          >
            {unreadItems.length} {ar ? "غير مقروء" : "unread"}
          </span>
        </div>
      </div>
      {data.isPending || readFeed.isPending ? (
        <div className="p-4">
          <Skeleton className="h-24 rounded-xl" />
        </div>
      ) : data.isError ? (
        <p className="p-5 text-xs text-muted-foreground">
          {ar ? "تعذر تحميل بيانات الحضور." : "Attendance data is unavailable right now."}
        </p>
      ) : !items.length ? (
        <EmptyCard text={ar ? "لا توجد استثناءات الآن." : "No workforce exceptions right now."} />
      ) : (
        <ul className="divide-y divide-border">
          {items.slice(0, 12).map((item) => {
            const read = readKeys.has(item.key);
            return (
              <li
                key={item.key}
                className={cn(
                  "flex items-start gap-3 p-3 transition-colors",
                  read && "bg-muted/[.14]",
                )}
              >
                <span
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-xl",
                    toneCls[item.tone],
                    read && "opacity-55",
                  )}
                >
                  <AlertTriangle className="size-4" />
                </span>
                <span className={cn("min-w-0 flex-1", read && "opacity-65")}>
                  <strong className="block text-xs">{item.title}</strong>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    {item.detail}
                  </span>
                </span>
                {read ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-[9px] font-bold text-emerald-700">
                    <CheckCircle2 className="size-3" />
                    {ar ? "مقروء" : "Read"}
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 shrink-0 px-2 text-[10px]"
                    disabled={markRead.isPending}
                    onClick={() => markRead.mutate([item.key])}
                  >
                    {ar ? "تعليم كمقروء" : "Mark read"}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------ Member drawer ----------------------------- */
export function MemberWorkforceSheet({
  member,
  onClose,
  restaurantId,
  assignments,
  ar,
  canManageTeam,
}: {
  member: WorkforceMember | null;
  onClose: () => void;
  restaurantId: string;
  assignments: ShiftAssignment[];
  ar: boolean;
  canManageTeam: boolean;
}) {
  const data = useWorkforceData(restaurantId);
  const now = Date.now();
  const today = dayKey(new Date(),data.data?.timeZone);
  const d =
    member && data.data
      ? memberDayStatus(member.id, today, assignments, data.data.entries, now, data.data.timeZone)
      : null;
  const weekAgo = now - 7 * 86400000;
  const weekH =
    member && data.data
      ? data.data.entries
          .filter((e) => e.staff_id === member.id && new Date(e.clock_in).getTime() >= weekAgo)
          .reduce(
            (s, e) =>
              s +
              Math.max(
                0,
                H(
                  (e.clock_out ? new Date(e.clock_out).getTime() : now) -
                    new Date(e.clock_in).getTime(),
                ) -
                  (e.break_minutes || 0) / 60,
              ),
            0,
          )
      : 0;
  const next = member
    ? assignments
        .filter(
          (a) =>
            a.staff_id === member.id &&
            a.status !== "released" &&
            a.ends_at &&
            new Date(a.ends_at).getTime() > now,
        )
        .sort((a, b) => (a.starts_at ?? "").localeCompare(b.starts_at ?? ""))[0]
    : null;
  const leave =
    member && data.data ? data.data.leave.filter((l) => l.staff_id === member.id).slice(0, 3) : [];
  return (
    <DetailSheet
      open={Boolean(member)}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={member?.name ?? ""}
      description={member ? roleLabel(member.role, ar) : undefined}
      footer={
        canManageTeam ? (
          <Button asChild variant="outline" className="w-full">
            <Link to="/manage/$restaurantId/staff" params={{ restaurantId }}>
              <UserRound className="size-4" />
              {ar ? "فتح ملف الفريق" : "Open team profile"}
            </Link>
          </Button>
        ) : undefined
      }
    >
      {!member ? null : data.isPending ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : (
        <div>
          <DetailRow
            label={ar ? "الحالة اليوم" : "Today"}
            value={d ? <Pill s={d.status} ar={ar} /> : "—"}
          />
          <DetailRow
            label={ar ? "المجدول" : "Scheduled"}
            value={
              d?.assignment
                ? `${fmtTime(d.assignment.starts_at, ar)} – ${fmtTime(d.assignment.ends_at, ar)}`
                : ar
                  ? "غير مجدول"
                  : "Not scheduled"
            }
          />
          <DetailRow
            label={ar ? "الفعلي" : "Actual"}
            value={
              d?.firstIn
                ? `${fmtTime(new Date(d.firstIn).toISOString(), ar)} – ${d.lastOut ? fmtTime(new Date(d.lastOut).toISOString(), ar) : ar ? "الآن" : "now"}`
                : "—"
            }
          />
          <DetailRow
            label={ar ? "ساعات اليوم" : "Hours today"}
            value={d ? fmtH(d.actualH, ar) : "—"}
          />
          <DetailRow
            label={ar ? "آخر 7 أيام" : "Last 7 days"}
            value={
              <span className={cn(weekH > WEEKLY_OVERTIME_RISK_H && "font-bold text-amber-700")}>
                {fmtH(weekH, ar)}
              </span>
            }
          />
          <DetailRow
            label={ar ? "الوردية القادمة" : "Next shift"}
            value={
              next?.starts_at
                ? `${dayKey(next.starts_at)} · ${fmtTime(next.starts_at, ar)}`
                : ar
                  ? "لا يوجد"
                  : "None"
            }
          />
          <div className="mt-4">
            <h3 className="text-[10px] font-bold uppercase tracking-[.08em] text-muted-foreground">
              {ar ? "الإجازات" : "Time off"}
            </h3>
            {leave.length ? (
              <ul className="mt-2 space-y-2">
                {leave.map((l) => (
                  <li
                    key={l.id}
                    className="flex items-center justify-between rounded-xl border border-border/70 p-2 text-xs"
                  >
                    <span>
                      {l.start_date} → {l.end_date}
                    </span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold capitalize">
                      {l.status}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                {ar ? "لا توجد طلبات." : "No requests."}
              </p>
            )}
          </div>
        </div>
      )}
    </DetailSheet>
  );
}

/* -------------------------------- Team tab -------------------------------- */
export function WorkforceTeam({
  restaurantId,
  members,
  assignments,
  ar,
  onOpen,
  canManageTeam,
}: {
  restaurantId: string;
  members: WorkforceMember[];
  assignments: ShiftAssignment[];
  ar: boolean;
  onOpen: (m: WorkforceMember) => void;
  canManageTeam: boolean;
}) {
  const data = useWorkforceData(restaurantId);
  const [role, setRole] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const today = dayKey(new Date(),data.data?.timeZone);
  const roles = Array.from(new Set(members.map((m) => m.role)));
  const rows = members.filter(
    (m) =>
      m.is_active &&
      (role === "all" || m.role === role) &&
      m.name.toLowerCase().includes(search.toLowerCase()),
  );
  const selected = members.find((m) => m.id === selectedId);
  const d = selected
    ? memberDayStatus(selected.id, today, assignments, data.data?.entries ?? [], Date.now(), data.data?.timeZone)
    : null;
  return (
    <div className={cn("wf-detail-layout", selected && "has-detail")}>
      <section className="wf-panel">
        <div className="wf-toolbar">
          <h2>
            {ar ? "أعضاء الفريق" : "Team members"} <small>({rows.length})</small>
          </h2>
          <div className="wf-toolbar-actions">
            <SearchField value={search} onChange={setSearch} ar={ar} />
            <RoleFilter value={role} onChange={setRole} roles={roles} ar={ar} />
            {canManageTeam ? (
              <Button asChild variant="outline">
                <Link to="/manage/$restaurantId/staff" params={{ restaurantId }}>
                  {ar ? "إدارة الفريق" : "Manage team"}
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
        <div className="wf-table-scroll">
          <table className="wf-table">
            <thead>
              <tr>
                {[
                  ar ? "عضو الفريق" : "Team member",
                  ar ? "الدور" : "Role",
                  ar ? "الحالة اليوم" : "Today's status",
                  ar ? "الوردية اليوم" : "Today's shift",
                  ar ? "آخر نشاط" : "Last activity",
                ].map((v) => (
                  <th key={v}>{v}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const status = memberDayStatus(m.id, today, assignments, data.data?.entries ?? [], Date.now(), data.data?.timeZone);
                const last = (data.data?.entries ?? []).find((e) => e.staff_id === m.id);
                return (
                  <tr key={m.id} className={m.id === selectedId ? "is-selected" : ""}>
                    <td data-label={ar ? "عضو الفريق" : "Team member"}>
                      <button className="wf-person-button" onClick={() => setSelectedId(m.id)}>
                        <Person member={m} />
                      </button>
                    </td>
                    <td data-label={ar ? "الدور" : "Role"}>{roleLabel(m.role, ar)}</td>
                    <td data-label={ar ? "حالة اليوم" : "Today's status"}>
                      <Pill s={status.status} ar={ar} />
                    </td>
                    <td data-label={ar ? "وردية اليوم" : "Today's shift"}>
                      {status.assignment
                        ? `${fmtTime(status.assignment.starts_at, ar)} – ${fmtTime(status.assignment.ends_at, ar)}`
                        : ar
                          ? "لا وردية"
                          : "No shift"}
                    </td>
                    <td data-label={ar ? "آخر نشاط" : "Last activity"}>
                      {last ? formatStamp(last.clock_out ?? last.clock_in, ar) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {data.isError ? (
          <p className="wf-empty">
            {ar ? "تعذر تحميل بيانات الفريق." : "Team data could not be loaded."}
          </p>
        ) : !rows.length ? (
          <EmptyCard text={ar ? "لا أعضاء مطابقون." : "No matching members."} />
        ) : null}
      </section>
      {selected && d ? (
        <Inspector
          title={ar ? "تفاصيل العضو" : "Member details"}
          onClose={() => setSelectedId(null)}
          footer={
            <Button variant="outline" className="w-full" onClick={() => onOpen(selected)}>
              {ar ? "عرض ملف العضو" : "View member profile"}
            </Button>
          }
        >
          <div className="wf-member-identity">
            <span className="wf-avatar">
              {selected.name
                .split(" ")
                .map((v) => v[0])
                .slice(0, 2)
                .join("")}
            </span>
            <h3>{selected.name}</h3>
            <p>{roleLabel(selected.role, ar)}</p>
            <Pill s={d.status} ar={ar} />
          </div>
          <DetailRow
            label={ar ? "وردية اليوم" : "Today's shift"}
            value={
              d.assignment
                ? `${fmtTime(d.assignment.starts_at, ar)} – ${fmtTime(d.assignment.ends_at, ar)}`
                : "—"
            }
          />
          <DetailRow label={ar ? "ساعات اليوم" : "Hours today"} value={fmtH(d.actualH, ar)} />
          <DetailRow
            label={ar ? "الدخول" : "Clock in"}
            value={d.firstIn ? fmtTime(new Date(d.firstIn).toISOString(), ar) : "—"}
          />
          <DetailRow
            label={ar ? "الخروج" : "Clock out"}
            value={d.lastOut ? fmtTime(new Date(d.lastOut).toISOString(), ar) : "—"}
          />
          {canManageTeam ? (
            <Button asChild variant="outline" className="mt-4 w-full">
              <Link to="/manage/$restaurantId/staff" params={{ restaurantId }}>
                {ar ? "تعيين وردية" : "Assign shift"}
              </Link>
            </Button>
          ) : null}
        </Inspector>
      ) : null}
    </div>
  );
}

function RoleFilter({
  value,
  onChange,
  roles,
  ar,
}: {
  value: string;
  onChange: (v: string) => void;
  roles: AppRole[];
  ar: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="min-h-11 w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{ar ? "كل الأدوار" : "All roles"}</SelectItem>
        {roles.map((r) => (
          <SelectItem key={r} value={r}>
            {roleLabel(r, ar)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/* ------------------------------- Attendance ------------------------------- */
export function WorkforceAttendanceBoard({
  restaurantId,
  members,
  assignments,
  ar,
  onOpen,
}: {
  restaurantId: string;
  members: WorkforceMember[];
  assignments: ShiftAssignment[];
  ar: boolean;
  onOpen: (m: WorkforceMember) => void;
}) {
  const [date, setDate] = useState(() => dayKey(new Date()));
  const data = useWorkforceData(restaurantId, { start: date, end: date });
  const [role, setRole] = useState("all");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const roles = Array.from(new Set(members.map((m) => m.role)));
  const allRows = members
    .filter((m) => m.is_active && (role === "all" || m.role === role))
    .map((m) => ({ m, d: memberDayStatus(m.id, date, assignments, data.data?.entries ?? [], Date.now(), data.data?.timeZone) }))
    .filter((r) => r.d.status !== "off" || r.d.actualH > 0);
  const rows = allRows.filter(
    (r) =>
      r.m.name.toLowerCase().includes(search.toLowerCase()) &&
      (filter === "all" ||
        (filter === "working"
          ? ["working", "late", "overtime"].includes(r.d.status) && !r.d.lastOut && !!r.d.firstIn
          : r.d.status === filter)),
  );
  const selected = allRows.find((r) => r.m.id === selectedId);
  return (
    <section className="space-y-4">
      <div className="wf-metrics">
        {[
          [
            ar ? "على رأس العمل" : "On shift",
            allRows.filter((r) => r.d.firstIn && !r.d.lastOut).length,
          ],
          [ar ? "مكتمل" : "Completed", allRows.filter((r) => r.d.lastOut).length],
          [ar ? "لم يبدأ" : "Not started", allRows.filter((r) => !r.d.firstIn).length],
          [
            ar ? "الاستثناءات" : "Exceptions",
            allRows.filter(
              (r) => ["late", "absent", "overtime"].includes(r.d.status) || r.d.earlyMin >= 15,
            ).length,
          ],
        ].map(([label, value]) => (
          <div key={label}>
            <small>{label}</small>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className={cn("wf-detail-layout", selected && "has-detail")}>
        <section className="wf-panel">
          <div className="wf-toolbar">
            <h2>{ar ? "الحضور" : "Attendance"}</h2>
            <div className="wf-toolbar-actions">
              <RequestDatePicker label={ar ? "تاريخ الحضور" : "Attendance date"} ar={ar} value={date} onChange={value => { setDate(value); setSelectedId(null); }} />
              <RoleFilter value={role} onChange={setRole} roles={roles} ar={ar} />
            </div>
          </div>
          <div className="wf-toolbar">
            <div className="wf-filter-tabs">
              {[
                ["all", ar ? "الكل" : "All"],
                ["working", ar ? "على رأس العمل" : "On shift"],
                ["late", ar ? "متأخر" : "Late"],
                ["completed", ar ? "مكتمل" : "Completed"],
              ].map(([id, label]) => (
                <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>
                  {label}
                </button>
              ))}
            </div>
            <SearchField value={search} onChange={setSearch} ar={ar} />
          </div>
          <div className="wf-table-scroll">
            <table className="wf-table">
              <thead>
                <tr>
                  {[
                    ar ? "عضو الفريق" : "Team member",
                    ar ? "مجدول" : "Scheduled",
                    ar ? "الدخول" : "Clock in",
                    ar ? "الخروج" : "Clock out",
                    ar ? "العمل" : "Worked",
                    ar ? "الحالة" : "Status",
                  ].map((v) => (
                    <th key={v}>{v}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ m, d }) => (
                  <tr key={m.id} className={m.id === selectedId ? "is-selected" : ""}>
                    <td data-label={ar ? "عضو الفريق" : "Team member"}>
                      <button className="wf-person-button" onClick={() => setSelectedId(m.id)}>
                        <Person member={m} />
                        <small>{roleLabel(m.role, ar)}</small>
                      </button>
                    </td>
                    <td data-label={ar ? "مجدول" : "Scheduled"}>
                      {d.assignment
                        ? `${fmtTime(d.assignment.starts_at, ar)} – ${fmtTime(d.assignment.ends_at, ar)}`
                        : "—"}
                    </td>
                    <td data-label={ar ? "الدخول" : "Clock in"}>
                      {d.firstIn ? fmtTime(new Date(d.firstIn).toISOString(), ar) : "—"}
                    </td>
                    <td data-label={ar ? "الخروج" : "Clock out"}>
                      {d.lastOut ? fmtTime(new Date(d.lastOut).toISOString(), ar) : "—"}
                    </td>
                    <td data-label={ar ? "العمل" : "Worked"}>{fmtH(d.actualH, ar)}</td>
                    <td data-label={ar ? "الحالة" : "Status"}>
                      <Pill s={d.status} ar={ar} />
                      {d.earlyMin >= 15 ? (
                        <small className="block text-rose-600">
                          {ar ? "مغادرة مبكرة" : "Left early"}
                        </small>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.isError ? (
            <p className="wf-empty">
              {ar ? "تعذر تحميل الحضور." : "Attendance could not be loaded."}
            </p>
          ) : !rows.length ? (
            <EmptyCard
              text={
                data.isPending
                  ? ar
                    ? "جارٍ التحميل…"
                    : "Loading attendance…"
                  : ar
                    ? "لا حضور مطابق لهذا الفلتر."
                    : "No attendance matches this view."
              }
            />
          ) : null}
        </section>
        {selected ? (
          <Inspector
            title={ar ? "تفاصيل الحضور" : "Attendance details"}
            onClose={() => setSelectedId(null)}
            footer={
              <Button variant="outline" className="w-full" onClick={() => onOpen(selected.m)}>
                {ar ? "عرض سجل العضو" : "View member record"}
              </Button>
            }
          >
            <div className="wf-inspector-person">
              <Person member={selected.m} />
              <p>{roleLabel(selected.m.role, ar)}</p>
            </div>
            <DetailRow
              label={ar ? "مجدول" : "Scheduled"}
              value={`${date} · ${fmtTime(selected.d.assignment?.starts_at, ar)} – ${fmtTime(selected.d.assignment?.ends_at, ar)}`}
            />
            <DetailRow
              label={ar ? "الدخول الفعلي" : "Actual clock in"}
              value={
                selected.d.firstIn ? fmtTime(new Date(selected.d.firstIn).toISOString(), ar) : "—"
              }
            />
            <DetailRow
              label={ar ? "الخروج الفعلي" : "Actual clock out"}
              value={
                selected.d.lastOut ? fmtTime(new Date(selected.d.lastOut).toISOString(), ar) : "—"
              }
            />
            <DetailRow label={ar ? "العمل" : "Worked"} value={fmtH(selected.d.actualH, ar)} />
            <DetailRow
              label={ar ? "الحالة" : "Status"}
              value={<Pill s={selected.d.status} ar={ar} />}
            />
            <DetailRow
              label={ar ? "التأخير" : "Late arrival"}
              value={`${Math.round(selected.d.lateMin)} ${ar ? "دقيقة" : "min"}`}
            />
            <DetailRow
              label={ar ? "مغادرة مبكرة" : "Left early"}
              value={`${Math.round(selected.d.earlyMin)} ${ar ? "دقيقة" : "min"}`}
            />
          </Inspector>
        ) : null}
      </div>
    </section>
  );
}

/* ------------------------------- Timesheets ------------------------------- */
export function WorkforceTimesheets({
  restaurantId,
  members,
  assignments,
  canManage,
  canReopen,
  currentStaffId,
  ar,
  lang,
  onOpenMember,
}: {
  restaurantId: string;
  members: WorkforceMember[];
  assignments: ShiftAssignment[];
  canManage: boolean;
  canReopen: boolean;
  currentStaffId: string;
  ar: boolean;
  lang: "en" | "ar";
  onOpenMember: (m: WorkforceMember) => void;
}) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [period, setPeriod] = useState(() => dayKey(new Date()));
  const rangeDays = weekOf(period);
  const data = useWorkforceData(restaurantId, { start: rangeDays[0], end: rangeDays[6] });
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [missingOpen, setMissingOpen] = useState(false);
  const [reviewingMissing, setReviewingMissing] = useState<MissingPunchRequest | null>(null);
  const reviewSupported =
    (data.data?.entries ?? []).some((e) => "review_status" in e) ||
    !(data.data?.entries ?? []).length;
  const memberById = new Map(members.map((m) => [m.id, m]));
  const days = weekOf(period);
  const periodEntries = (data.data?.entries ?? []).filter(
    (e) =>
      e.clock_out &&
      (canManage || e.staff_id === currentStaffId) &&
      dayKey(e.clock_in) >= days[0] &&
      dayKey(e.clock_in) <= days[6],
  );
  const entries = periodEntries.filter(
    (e) =>
      (filter === "all" || reviewOf(e) === filter) &&
      (memberById.get(e.staff_id)?.name ?? "").toLowerCase().includes(search.toLowerCase()),
  );
  const selected = periodEntries.find((e) => e.id === selectedId);

  const missingRequests = useQuery<MissingPunchRequest[]>({
    queryKey: ["workforce", "missing-punch-requests", restaurantId],
    enabled: canManage,
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data: rows, error } = await (
        supabase.from("staff_missing_punch_requests" as any) as any
      )
        .select("id,staff_id,clock_in,clock_out,break_minutes,reason,status,created_at")
        .eq("restaurant_id", restaurantId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (rows ?? []) as MissingPunchRequest[];
    },
  });

  const act = useMutation({
    mutationFn: async (p: {
      id: string;
      action: "approve" | "reject" | "reopen" | "correct";
      note?: string;
      clock_in?: string;
      clock_out?: string;
      break_minutes?: number;
    }) => {
      const { error } = await (supabase as any).rpc("review_time_entry", {
        _entry_id: p.id,
        _action: p.action,
        _note: p.note ?? null,
        _clock_in: p.clock_in ?? null,
        _clock_out: p.clock_out ?? null,
        _break_minutes: p.break_minutes ?? null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setEditing(null);
      await qc.invalidateQueries({ queryKey: ["workforce"] });
      toast.success(ar ? "تم تحديث سجل الدوام" : "Timesheet updated");
    },
    onError: (e) => toast.error(humanError(e, lang)),
  });

  const scheduledFor = (e: Entry) => {
    const inMs = new Date(e.clock_in).getTime();
    const a = assignments.find(
      (x) =>
        x.staff_id === e.staff_id &&
        x.starts_at &&
        x.ends_at &&
        new Date(x.starts_at).getTime() - 4 * 3_600_000 <= inMs &&
        new Date(x.ends_at).getTime() >= inMs,
    );
    return a
      ? Math.max(0, H(new Date(a.ends_at!).getTime() - new Date(a.starts_at!).getTime()))
      : null;
  };

  const actualHours = (e: Entry) =>
    Math.max(
      0,
      H(new Date(e.clock_out!).getTime() - new Date(e.clock_in).getTime()) -
        (e.break_minutes || 0) / 60,
    );
  const selectedMember = selected ? memberById.get(selected.staff_id) : null;
  return (
    <section className="space-y-4">
      <div className="wf-toolbar">
        <WeekControl
          date={period}
          onChange={(v) => {
            setPeriod(v);
            setSelectedId(null);
          }}
          ar={ar}
        />
        {canManage ? (
          <Button variant="outline" onClick={() => setMissingOpen(true)}>
            <Plus className="size-4" />
            {ar ? "إضافة بصمة ناقصة" : "Add missing punch"}
          </Button>
        ) : null}
      </div>
      <div className="wf-metrics">
        <div>
          <small>{ar ? "مجدول" : "Scheduled"}</small>
          <strong>
            {fmtH(
              assignments
                .filter(
                  (a) =>
                    a.status !== "released" &&
                    a.starts_at &&
                    a.ends_at &&
                    (canManage || a.staff_id === currentStaffId) &&
                    dayKey(a.starts_at) >= days[0] &&
                    dayKey(a.starts_at) <= days[6],
                )
                .reduce(
                  (n, a) =>
                    n +
                    Math.max(
                      0,
                      H(new Date(a.ends_at!).getTime() - new Date(a.starts_at!).getTime()),
                    ),
                  0,
                ),
              ar,
            )}
          </strong>
        </div>
        <div>
          <small>{ar ? "ساعات العمل" : "Worked"}</small>
          <strong>
            {fmtH(
              periodEntries.reduce((n, e) => n + actualHours(e), 0),
              ar,
            )}
          </strong>
        </div>
        <div>
          <small>{ar ? "للمراجعة" : "For review"}</small>
          <strong>{periodEntries.filter((e) => reviewOf(e) === "pending").length}</strong>
        </div>
      </div>
      {canManage && (missingRequests.data?.length ?? 0) > 0 ? (
        <div className="border-b border-border bg-orange-500/[.025] p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <strong className="text-xs">
                {ar ? "طلبات بصمة ناقصة" : "Missing punch requests"}
              </strong>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {ar
                  ? "طلبات الموظفين التي تحتاج موافقة قبل إضافتها لسجل الدوام."
                  : "Employee-submitted corrections that require approval before entering the timesheet."}
              </p>
            </div>
            <span className="rounded-full bg-orange-500/10 px-2.5 py-1 text-[10px] font-bold text-orange-700">
              {missingRequests.data?.length ?? 0}
            </span>
          </div>
          <div className="grid gap-2 lg:grid-cols-2">
            {(missingRequests.data ?? []).slice(0, 6).map((request) => {
              const member = memberById.get(request.staff_id);
              return (
                <button
                  key={request.id}
                  type="button"
                  onClick={() => setReviewingMissing(request)}
                  className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 text-start transition hover:border-orange-200 hover:bg-orange-500/[.025]"
                >
                  <span className="min-w-0">
                    <strong className="block truncate text-xs">
                      {member?.name ?? (ar ? "عضو فريق" : "Team member")}
                    </strong>
                    <span className="mt-1 block text-[10px] tabular-nums text-muted-foreground">
                      {dayKey(request.clock_in)} · {fmtTime(request.clock_in, ar)}–
                      {fmtTime(request.clock_out, ar)}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-blue-500/10 px-2 py-1 text-[9px] font-bold text-blue-700">
                    {ar ? "مراجعة" : "Review"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      <div className={cn("wf-detail-layout", selected && "has-detail")}>
        <section className="wf-panel">
          <div className="wf-toolbar">
            <div className="wf-filter-tabs">
              {(["pending", "approved", "rejected", "all"] as const).map((f) => (
                <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                  {f === "pending"
                    ? ar
                      ? "للمراجعة"
                      : "Review"
                    : f === "approved"
                      ? ar
                        ? "معتمد"
                        : "Approved"
                      : f === "rejected"
                        ? ar
                          ? "مرفوض"
                          : "Rejected"
                        : ar
                          ? "الكل"
                          : "All"}{" "}
                  <small>
                    {periodEntries.filter((e) => f === "all" || reviewOf(e) === f).length}
                  </small>
                </button>
              ))}
            </div>
            <SearchField value={search} onChange={setSearch} ar={ar} />
          </div>
          <div className="wf-table-scroll">
            <table className="wf-table">
              <thead>
                <tr>
                  {[
                    ar ? "عضو الفريق" : "Team member",
                    ar ? "التاريخ" : "Date",
                    ar ? "مجدول" : "Scheduled",
                    ar ? "عمل" : "Worked",
                    ar ? "استراحة" : "Break",
                    ar ? "إضافي" : "Overtime",
                    ar ? "الحالة" : "Status",
                  ].map((v) => (
                    <th key={v}>{v}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.slice(0, 120).map((e) => {
                  const m = memberById.get(e.staff_id),
                    sched = scheduledFor(e),
                    status = reviewOf(e);
                  return (
                    <tr key={e.id} className={e.id === selectedId ? "is-selected" : ""}>
                      <td data-label={ar ? "عضو الفريق" : "Team member"}>
                        <button className="wf-person-button" onClick={() => setSelectedId(e.id)}>
                          {m ? <Person member={m} /> : ar ? "عضو الفريق" : "Team member"}
                          <small>
                            {fmtTime(e.clock_in, ar)} – {fmtTime(e.clock_out, ar)}
                          </small>
                        </button>
                      </td>
                      <td data-label={ar ? "التاريخ" : "Date"}>{dayKey(e.clock_in)}</td>
                      <td data-label={ar ? "مجدول" : "Scheduled"}>
                        {sched === null ? "—" : fmtH(sched, ar)}
                      </td>
                      <td data-label={ar ? "العمل" : "Worked"}>{fmtH(actualHours(e), ar)}</td>
                      <td data-label={ar ? "استراحة" : "Break"}>
                        {e.break_minutes || 0}
                        {ar ? "د" : "m"}
                      </td>
                      <td data-label={ar ? "إضافي" : "Overtime"}>
                        {fmtH(sched === null ? 0 : Math.max(0, actualHours(e) - sched), ar)}
                      </td>
                      <td data-label={ar ? "الحالة" : "Status"}>
                        <span
                          className={cn(
                            "wf-pill",
                            status === "approved"
                              ? "bg-emerald-500/10 text-emerald-700"
                              : status === "rejected"
                                ? "bg-red-500/10 text-red-700"
                                : "bg-blue-500/10 text-blue-700",
                          )}
                        >
                          {status === "approved" ? <Lock className="size-3" /> : null}
                          {status === "approved"
                            ? ar
                              ? "معتمد"
                              : "Approved"
                            : status === "rejected"
                              ? ar
                                ? "مرفوض"
                                : "Rejected"
                              : ar
                                ? "للمراجعة"
                                : "Review"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {data.isError ? (
            <p className="wf-empty">
              {ar ? "تعذر تحميل السجلات." : "Timesheets could not be loaded."}
            </p>
          ) : !entries.length ? (
            <EmptyCard
              text={
                data.isPending
                  ? ar
                    ? "جارٍ التحميل…"
                    : "Loading timesheets…"
                  : ar
                    ? "لا سجلات في هذا الفلتر."
                    : "No timesheets in this view."
              }
            />
          ) : null}
        </section>
        {selected ? (
          <Inspector
            title={ar ? "تفاصيل سجل الدوام" : "Timesheet details"}
            onClose={() => setSelectedId(null)}
            footer={
              canManage && reviewSupported ? (
                reviewOf(selected) === "approved" ? (
                  canReopen ? (
                    <Button
                      variant="outline"
                      className="w-full"
                      disabled={act.isPending}
                      onClick={() =>
                        act.mutate({ id: selected.id, action: "reopen", note: "Reopened" })
                      }
                    >
                      <RotateCcw className="size-4" />
                      {ar ? "إعادة فتح" : "Reopen"}
                    </Button>
                  ) : null
                ) : (
                  <div className="wf-review-actions">
                    <Button
                      variant="outline"
                      disabled={act.isPending}
                      onClick={() => act.mutate({ id: selected.id, action: "reject" })}
                    >
                      {ar ? "رفض" : "Reject"}
                    </Button>
                    <Button
                      disabled={act.isPending}
                      onClick={() => act.mutate({ id: selected.id, action: "approve" })}
                    >
                      {ar ? "اعتماد" : "Approve"}
                    </Button>
                  </div>
                )
              ) : null
            }
          >
            <div className="wf-inspector-person">
              {selectedMember ? <Person member={selectedMember} /> : null}
              <p>{dayKey(selected.clock_in)}</p>
            </div>
            <DetailRow label={ar ? "الدخول" : "Clock in"} value={fmtTime(selected.clock_in, ar)} />
            <DetailRow
              label={ar ? "الخروج" : "Clock out"}
              value={fmtTime(selected.clock_out, ar)}
            />
            <DetailRow label={ar ? "العمل" : "Worked"} value={fmtH(actualHours(selected), ar)} />
            <DetailRow
              label={ar ? "الاستراحة" : "Break"}
              value={`${selected.break_minutes || 0} ${ar ? "دقيقة" : "min"}`}
            />
            <DetailRow
              label={ar ? "ملاحظات المراجعة" : "Review note"}
              value={selected.review_note}
            />
            {reviewOf(selected) === "approved" ? (
              <p className="wf-note">
                <Lock className="size-3.5 inline" />{" "}
                {ar ? "معتمد ومقفل للمراجعة." : "Approved and locked for review."}
              </p>
            ) : canManage && reviewSupported ? (
              <Button
                className="mt-4 w-full"
                variant="outline"
                onClick={() => setEditing(selected)}
              >
                <Pencil className="size-3.5" />
                {ar ? "تصحيح السجل" : "Correct entry"}
              </Button>
            ) : null}
          </Inspector>
        ) : null}
      </div>
      <p className="wf-note">
        {ar
          ? "الساعات تقديرات تشغيلية للتخطيط والمراجعة."
          : "Hours are operational estimates for planning and review."}
      </p>
      {editing ? (
        <CorrectionSheet
          timeZone={data.data?.timeZone ?? "Asia/Amman"}
          entry={editing}
          ar={ar}
          pending={act.isPending}
          onClose={() => setEditing(null)}
          onSave={(p) => act.mutate({ id: editing.id, action: "correct", ...p })}
        />
      ) : null}
      {missingOpen ? (
        <MissingPunchSheet
          restaurantId={restaurantId}
          members={members}
          assignments={assignments}
          ar={ar}
          lang={lang}
          onClose={() => setMissingOpen(false)}
        />
      ) : null}
      {reviewingMissing ? (
        <MissingPunchRequestReviewSheet
          request={reviewingMissing}
          memberName={
            memberById.get(reviewingMissing.staff_id)?.name ?? (ar ? "عضو فريق" : "Team member")
          }
          restaurantId={restaurantId}
          ar={ar}
          lang={lang}
          onClose={() => setReviewingMissing(null)}
        />
      ) : null}
    </section>
  );
}

function MissingPunchRequestReviewSheet({
  request,
  memberName,
  restaurantId,
  ar,
  lang,
  onClose,
}: {
  request: MissingPunchRequest;
  memberName: string;
  restaurantId: string;
  ar: boolean;
  lang: "en" | "ar";
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const review = useMutation({
    mutationFn: async (decision: "approved" | "rejected") => {
      const { error } = await (supabase as any).rpc("review_missing_punch_request", {
        _request_id: request.id,
        _decision: decision,
        _note: note.trim() || null,
      });
      if (error) throw error;
      return decision;
    },
    onSuccess: async (decision) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["workforce"] }),
        qc.invalidateQueries({ queryKey: ["workforce", "missing-punch-requests", restaurantId] }),
        qc.invalidateQueries({ queryKey: ["notifications"] }),
        qc.invalidateQueries({ queryKey: ["platform", "staff-schedule", restaurantId] }),
      ]);
      toast.success(
        decision === "approved"
          ? ar
            ? "تم اعتماد البصمة وإضافتها لسجل الدوام"
            : "Missing punch approved and added to the timesheet"
          : ar
            ? "تم رفض طلب البصمة"
            : "Missing punch request rejected",
      );
      onClose();
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  return (
    <DetailSheet
      open
      onOpenChange={(open) => {
        if (!open && !review.isPending) onClose();
      }}
      title={ar ? "مراجعة بصمة ناقصة" : "Review missing punch"}
      description={memberName}
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            className="min-h-11 border-red-200 text-red-700 hover:bg-red-500/5"
            disabled={review.isPending}
            onClick={() => review.mutate("rejected")}
          >
            <XCircle className="size-4" />
            {ar ? "رفض" : "Reject"}
          </Button>
          <Button
            className="min-h-11"
            disabled={review.isPending}
            onClick={() => review.mutate("approved")}
          >
            <CheckCircle2 className="size-4" />
            {ar ? "اعتماد وإضافة" : "Approve & add"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 py-2">
        <div className="rounded-2xl border border-border bg-muted/20 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">
                {ar ? "الدخول" : "Clock in"}
              </span>
              <strong className="mt-1 block text-sm tabular-nums">
                {formatStamp(request.clock_in, ar)}
              </strong>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">
                {ar ? "الخروج" : "Clock out"}
              </span>
              <strong className="mt-1 block text-sm tabular-nums">
                {formatStamp(request.clock_out, ar)}
              </strong>
            </div>
          </div>
          <div className="mt-3 border-t border-border pt-3">
            <span className="text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">
              {ar ? "سبب الموظف" : "Employee reason"}
            </span>
            <p className="mt-1 text-sm leading-6">{request.reason}</p>
          </div>
          <div className="mt-3 text-[11px] text-muted-foreground">
            {ar ? `استراحة: ${request.break_minutes} دقيقة` : `Break: ${request.break_minutes} min`}
          </div>
        </div>
        <div className="space-y-2">
          <Label>{ar ? "ملاحظة المدير (اختياري)" : "Manager note (optional)"}</Label>
          <Textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={ar ? "أضف ملاحظة للمراجعة..." : "Add a review note..."}
          />
        </div>
        <p className="text-[11px] leading-5 text-muted-foreground">
          {ar
            ? "الاعتماد ينشئ سجل دوام مدقّق. الرفض لا يغيّر سجل الدوام."
            : "Approval creates an audited time entry. Rejection leaves the timesheet unchanged."}
        </p>
      </div>
    </DetailSheet>
  );
}

function MissingPunchSheet({
  restaurantId,
  members,
  assignments,
  ar,
  lang,
  onClose,
}: {
  restaurantId: string;
  members: WorkforceMember[];
  assignments: ShiftAssignment[];
  ar: boolean;
  lang: "en" | "ar";
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const restaurant = useRestaurant(restaurantId);
  const timeZone = restaurant.data?.timezone || "Asia/Amman";
  const activeMembers = members.filter((member) => member.is_active);
  const [staffId, setStaffId] = useState(activeMembers[0]?.id ?? "");
  const selectedAssignment =
    assignments
      .filter(
        (assignment) =>
          assignment.staff_id === staffId &&
          assignment.status !== "released" &&
          assignment.starts_at &&
          assignment.ends_at &&
          new Date(assignment.ends_at).getTime() <= Date.now() + 5 * 60_000,
      )
      .sort((a, b) => new Date(b.ends_at!).getTime() - new Date(a.ends_at!).getTime())[0] ?? null;
  const defaultIn = selectedAssignment?.starts_at ? toLocalInput(selectedAssignment.starts_at,timeZone) : "";
  const defaultOut = selectedAssignment?.ends_at ? toLocalInput(selectedAssignment.ends_at,timeZone) : "";
  const [clockIn, setClockIn] = useState<string | null>(null);
  const [clockOut, setClockOut] = useState<string | null>(null);
  const [breakMinutes, setBreakMinutes] = useState("0");
  const [reason, setReason] = useState("");

  const cin = clockIn ?? defaultIn;
  const cout = clockOut ?? defaultOut;
  const durationMinutes =
    cin && cout ? Math.round((workforceInputTimestamp(cout,timeZone) - workforceInputTimestamp(cin,timeZone)) / 60000) : 0;
  const invalid =
    !staffId ||
    !cin ||
    !cout ||
    !Number.isFinite(durationMinutes) || durationMinutes <= 0 ||
    Number(breakMinutes) < 0 ||
    Number(breakMinutes) >= durationMinutes ||
    !reason.trim() ||
    workforceInputTimestamp(cin,timeZone) > Date.now() + 5 * 60_000 ||
    workforceInputTimestamp(cout,timeZone) > Date.now() + 5 * 60_000;

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).rpc("create_missing_time_entry", {
        _restaurant_id: restaurantId,
        _staff_id: staffId,
        _clock_in: new Date(workforceInputTimestamp(cin,timeZone)).toISOString(),
        _clock_out: new Date(workforceInputTimestamp(cout,timeZone)).toISOString(),
        _break_minutes: Number(breakMinutes) || 0,
        _reason: reason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["workforce"] }),
        qc.invalidateQueries({ queryKey: ["platform", "staff-schedule", restaurantId] }),
        qc.invalidateQueries({ queryKey: ["operations", "shift-assignments", restaurantId] }),
      ]);
      toast.success(ar ? "تمت إضافة البصمة الناقصة للمراجعة" : "Missing punch added for review");
      onClose();
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  const applySchedule = () => {
    if (!selectedAssignment?.starts_at || !selectedAssignment.ends_at) return;
    setClockIn(toLocalInput(selectedAssignment.starts_at,timeZone));
    setClockOut(toLocalInput(selectedAssignment.ends_at,timeZone));
  };

  return (
    <DetailSheet
      open
      onOpenChange={(open) => {
        if (!open && !create.isPending) onClose();
      }}
      title={ar ? "إضافة بصمة ناقصة" : "Add missing punch"}
      description={
        ar
          ? "أضف وقتاً مفقوداً بأمان مع سبب وتدقيق إداري."
          : "Add a missing time entry safely with a required reason and audit trail."
      }
      footer={
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            disabled={create.isPending}
            onClick={onClose}
          >
            {ar ? "إلغاء" : "Cancel"}
          </Button>
          <Button
            className="flex-1"
            disabled={invalid || create.isPending}
            onClick={() => create.mutate()}
          >
            <Clock3 className="size-4" />
            {create.isPending
              ? ar
                ? "جارٍ الحفظ…"
                : "Saving…"
              : ar
                ? "إضافة للمراجعة"
                : "Add for review"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 py-2">
        <div className="rounded-2xl border border-orange-200/70 bg-orange-500/[0.045] p-3 text-xs leading-5 text-muted-foreground dark:border-orange-900/50">
          <strong className="block text-foreground">
            {ar ? "إجراء إداري مدقّق" : "Audited manager action"}
          </strong>
          <span>
            {ar
              ? "سيُنشأ السجل بحالة «للمراجعة» ولن يعتمد تلقائياً."
              : "The entry is created as Review — it is never auto-approved."}
          </span>
        </div>
        <div className="space-y-2">
          <Label>{ar ? "الموظف" : "Team member"}</Label>
          <Select
            value={staffId}
            onValueChange={(value) => {
              setStaffId(value);
              setClockIn("");
              setClockOut("");
            }}
          >
            <SelectTrigger className="min-h-11">
              <SelectValue placeholder={ar ? "اختر موظفاً" : "Choose a team member"} />
            </SelectTrigger>
            <SelectContent>
              {activeMembers.map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  {member.name} · {roleLabel(member.role, ar)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {selectedAssignment?.starts_at && selectedAssignment.ends_at ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/25 p-3">
            <span className="min-w-0 text-[11px] text-muted-foreground">
              <strong className="block truncate text-xs text-foreground">
                {ar ? "الوردية الأقرب" : "Nearest scheduled shift"}
              </strong>
              {fmtTime(selectedAssignment.starts_at, ar)}–{fmtTime(selectedAssignment.ends_at, ar)}
            </span>
            <Button type="button" size="sm" variant="outline" onClick={applySchedule}>
              {ar ? "استخدم وقت الجدول" : "Use schedule"}
            </Button>
          </div>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <RequestDateTimePicker timeZone={timeZone} label={ar ? "الدخول" : "Clock in"} ar={ar}
              value={cin}
              onChange={(value) => setClockIn(value)}
            />
          </div>
          <div className="space-y-2">
            <RequestDateTimePicker timeZone={timeZone} label={ar ? "الخروج" : "Clock out"} ar={ar}
              value={cout}
              onChange={(value) => setClockOut(value)}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>{ar ? "الاستراحة (دقائق)" : "Break (minutes)"}</Label>
          <Input
            type="number"
            min={0}
            className="min-h-11"
            value={breakMinutes}
            onChange={(e) => setBreakMinutes(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>{ar ? "سبب إضافة البصمة (مطلوب)" : "Reason for missing punch (required)"}</Label>
          <Textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={
              ar
                ? "مثال: نسي الموظف تسجيل الدخول وتم التحقق من المدير"
                : "e.g. Employee forgot to clock in; manager verified the shift"
            }
          />
        </div>
        {cin && cout && durationMinutes > 0 ? (
          <p className="text-[11px] font-semibold text-muted-foreground">
            {ar
              ? `المدة المسجلة: ${Math.floor(durationMinutes / 60)}س ${durationMinutes % 60}د`
              : `Recorded duration: ${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m`}
          </p>
        ) : null}
      </div>
    </DetailSheet>
  );
}

function Metric({ l, v, warn }: { l: string; v: string; warn?: boolean }) {
  return (
    <span className="flex items-baseline justify-between gap-2 md:block">
      <span className="text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">
        {l}
      </span>
      <strong className={cn("block text-sm tabular-nums", warn && "text-amber-700")}>{v}</strong>
    </span>
  );
}

function CorrectionSheet({
  entry,
  timeZone = "Asia/Amman",
  ar,
  pending,
  onClose,
  onSave,
}: {
  entry: Entry;
  timeZone?: string;
  ar: boolean;
  pending: boolean;
  onClose: () => void;
  onSave: (p: { clock_in: string; clock_out: string; break_minutes: number; note: string }) => void;
}) {
  const [cin, setCin] = useState(toLocalInput(entry.clock_in,timeZone));
  const [cout, setCout] = useState(toLocalInput(entry.clock_out,timeZone));
  const [brk, setBrk] = useState(String(entry.break_minutes || 0));
  const [reason, setReason] = useState("");
  const invalid =
    !cin || !cout || !Number.isFinite(workforceInputTimestamp(cin,timeZone)) || !Number.isFinite(workforceInputTimestamp(cout,timeZone)) || workforceInputTimestamp(cout,timeZone) <= workforceInputTimestamp(cin,timeZone) || Number(brk) < 0 || !reason.trim();
  return (
    <DetailSheet
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={ar ? "تصحيح سجل الدوام" : "Correct timesheet"}
      description={formatStamp(entry.clock_in, ar) ?? undefined}
      footer={
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            {ar ? "إلغاء" : "Cancel"}
          </Button>
          <Button
            className="flex-1"
            disabled={invalid || pending}
            onClick={() =>
              onSave({
                clock_in: new Date(workforceInputTimestamp(cin,timeZone)).toISOString(),
                clock_out: new Date(workforceInputTimestamp(cout,timeZone)).toISOString(),
                break_minutes: Number(brk),
                note: reason.trim(),
              })
            }
          >
            <Clock3 className="size-4" />
            {ar ? "حفظ التصحيح" : "Save correction"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 py-2">
        <div className="space-y-2">
          <RequestDateTimePicker timeZone={timeZone} label={ar ? "الدخول" : "Clock in"} ar={ar}
            value={cin}
            onChange={(value) => setCin(value)}
          />
        </div>
        <div className="space-y-2">
          <RequestDateTimePicker timeZone={timeZone} label={ar ? "الخروج" : "Clock out"} ar={ar}
            value={cout}
            onChange={(value) => setCout(value)}
          />
        </div>
        <div className="space-y-2">
          <Label>{ar ? "الاستراحة (دقائق)" : "Break (minutes)"}</Label>
          <Input
            type="number"
            min={0}
            className="min-h-11"
            value={brk}
            onChange={(e) => setBrk(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>{ar ? "سبب التصحيح (مطلوب)" : "Reason (required)"}</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={ar ? "مثال: نسي تسجيل الخروج" : "e.g. Forgot to clock out"}
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          {ar
            ? "كل تصحيح يُسجَّل في سجل التدقيق."
            : "Every correction is recorded in the audit trail."}
        </p>
      </div>
    </DetailSheet>
  );
}
