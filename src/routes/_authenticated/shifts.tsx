import { useRestaurant } from "@/hooks/useSuperAdmin";
import { workforceLocalTimestamp, workforceDayKey, workforceLocalInput, workforceInputTimestamp } from "@/lib/workforce-hours";
import { RequestDateTimePicker } from "@/components/workforce/RequestPickers";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouterState } from "@tanstack/react-router";
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Handshake,
  List,
  PlayCircle,
  Plus,
  Rows3,
  StopCircle,
  TimerReset,
  Trash2,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";

import { RequestDatePicker, RequestTimePicker } from "@/components/workforce/RequestPickers";
import {
  WorkforceToday,
  WorkforceWeekBoard,
  WorkforceLabor,
  weekOf,
  moveDay,
  shiftType,
  timeLabel,
} from "@/components/workforce/WorkforceStudio";
import "@/components/workforce/workforce-studio.css";
import { AppHeader } from "@/components/nav/AppHeader";
import { DetailRow, DetailSheet, formatStamp } from "@/components/operations/DetailSheet";
import { WorkforceButton as Button } from "@/components/workforce/WorkforceButton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";
import {
  acknowledgeShiftHandover,
  assignStaffToShift,
  closeShift,
  createShift,
  createRecurringShifts,
  deleteShift,
  createShiftHandover,
  openShift,
  removeShiftAssignment,
  updateOwnShiftAssignmentStatus,
  updateShiftAssignment,
  useOpenWorkCount,
  useShiftAssignments,
  useShiftHandovers,
  useShifts,
  type Shift,
  type ShiftAssignment,
  type ShiftAssignmentStatus,
  type ShiftHandover,
} from "@/hooks/useOperations";
import { useAccess } from "@/hooks/useSession";
import { useWorkspaceMembers, useWorkspaceScope } from "@/hooks/useWorkspace";
import { humanError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { membershipHasCapability, ROLE_LABELS, type AppRole } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import {
  MemberWorkforceSheet,
  WorkforceAttendanceBoard,
  WorkforceExceptions,
  WorkforceTeam,
  WorkforceTimesheets,
  type WorkforceMember,
} from "@/components/workforce/WorkforceInsights";
import { WorkforceRequests } from "@/components/workforce/WorkforceRequests";

export const Route = createFileRoute("/_authenticated/shifts")({
  head: () => ({
    meta: [
      { title: "Workforce — QuickServe" },
      {
        name: "description",
        content: "Restaurant workforce scheduling, attendance, time off and labor control.",
      },
    ],
  }),
  component: ShiftsPage,
});
type WorkforceSection =
  "overview" | "schedule" | "attendance" | "timesheets" | "time_off" | "team" | "labor";

const HANDOVER_ROLES: AppRole[] = [
  "restaurant_admin",
  "operations_manager",
  "manager",
  "kitchen",
  "waiter",
  "cashier",
  "host",
  "inventory",
  "procurement",
  "accountant",
];
const SHIFT_WEEKDAYS = [
  { value: 0, en: "Sun", ar: "الأحد" },
  { value: 1, en: "Mon", ar: "الاثنين" },
  { value: 2, en: "Tue", ar: "الثلاثاء" },
  { value: 3, en: "Wed", ar: "الأربعاء" },
  { value: 4, en: "Thu", ar: "الخميس" },
  { value: 5, en: "Fri", ar: "الجمعة" },
  { value: 6, en: "Sat", ar: "السبت" },
] as const;

function ShiftsPage() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const scope = useWorkspaceScope();
  const access = useAccess();
  const qc = useQueryClient();
  const rid = scope.restaurantId;
  const restaurant = useRestaurant(rid ?? "");
  const timeZone = restaurant.data?.timezone || "Asia/Amman";
  const membership = rid ? access.membershipFor(rid) : null;
  const canView = Boolean(
    membership &&
    membershipHasCapability(membership.role, membership.permission_overrides, "view_work"),
  );
  const canManage = Boolean(
    membership &&
    membershipHasCapability(membership.role, membership.permission_overrides, "manage_shifts"),
  );
  const canDelete = membership?.role === "restaurant_admin";
  const shifts = useShifts(rid);
  const shiftIds = useMemo(() => (shifts.data ?? []).map((row) => row.id), [shifts.data]);
  const assignments = useShiftAssignments(rid, shiftIds);
  const handovers = useShiftHandovers(rid);
  const openWork = useOpenWorkCount(rid);
  const members = useWorkspaceMembers(canView ? rid : null);
  const [createOpen, setCreateOpen] = useState(false);
  const [closingShift, setClosingShift] = useState<Shift | null>(null);
  const [deletingShift, setDeletingShift] = useState<Shift | null>(null);
  const [detailShiftId, setDetailShiftId] = useState<string | null>(null);
  const requestedSection = useRouterState({ select: (state) => state.location.hash });
  const [workforceSection, setWorkforceSection] = useState<WorkforceSection>(
    ["overview", "schedule", "attendance", "timesheets", "time_off", "team", "labor"].includes(
      requestedSection,
    )
      ? (requestedSection as WorkforceSection)
      : "overview",
  );
  useEffect(() => {
    if (
      ["overview", "schedule", "attendance", "timesheets", "time_off", "team", "labor"].includes(
        requestedSection,
      )
    )
      setWorkforceSection(requestedSection as WorkforceSection);
  }, [requestedSection]);
  const [memberSheet, setMemberSheet] = useState<WorkforceMember | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => workforceDayKey(new Date(),timeZone));
  const [liveNow, setLiveNow] = useState(() => Date.now());
  const [liveToday, setLiveToday] = useState(() => workforceDayKey(new Date(),timeZone));

  useEffect(() => {
    if (!rid || !canView) return;
    let cancelled = false;
    void (async () => {
      const { error } = await (supabase as any).rpc("refresh_recurring_staff_schedules", {
        _restaurant_id: rid,
        _horizon_days: 84,
      });
      if (cancelled || error) return;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["operations", "shifts", rid] }),
        qc.invalidateQueries({ queryKey: ["operations", "shift-assignments", rid] }),
      ]);
    })();
    return () => {
      cancelled = true;
    };
  }, [canView, qc, rid, liveToday]);

  useEffect(() => {
    const refresh = () => {
      const nextNow = Date.now();
      const nextToday = workforceDayKey(new Date(nextNow),timeZone);
      setLiveNow(nextNow);
      setLiveToday((previous) => {
        if (previous !== nextToday) {
          setSelectedDate((current) => (current === previous ? nextToday : current));
        }
        return nextToday;
      });
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [timeZone]);

  const workforceSnapshot = useQuery<{
    time: Array<{ staff_id: string; clock_in: string; clock_out: string | null }>;
    leave: Array<{ status: string }>;
    permissions: Array<{ status: string }>;
  }>({
    queryKey: ["workforce", "live-snapshot", rid, liveToday],
    enabled: Boolean(rid && canView),
    refetchInterval: 20_000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      if (!rid) return { time: [], leave: [], permissions: [] };
      const since = new Date(Date.now() - 36 * 60 * 60_000).toISOString();
      const [timeResult, leaveResult, permissionsResult] = await Promise.all([
        (supabase.from("staff_time_entries" as any) as any)
          .select("staff_id,clock_in,clock_out")
          .eq("restaurant_id", rid)
          .or(`clock_out.is.null,clock_in.gte.${since}`)
          .order("clock_in", { ascending: false })
          .limit(500),
        (supabase.from("staff_leave_requests" as any) as any)
          .select("status")
          .eq("restaurant_id", rid)
          .eq("status", "pending")
          .limit(200),
        (supabase.from("staff_permission_requests" as any) as any)
          .select("status")
          .eq("restaurant_id", rid)
          .eq("status", "pending")
          .limit(200),
      ]);
      if (timeResult.error) throw timeResult.error;
      if (leaveResult.error) throw leaveResult.error;
      if (permissionsResult.error) throw permissionsResult.error;
      return {
        time: (timeResult.data ?? []) as Array<{
          staff_id: string;
          clock_in: string;
          clock_out: string | null;
        }>,
        leave: (leaveResult.data ?? []) as Array<{ status: string }>,
        permissions: (permissionsResult.data ?? []) as Array<{ status: string }>,
      };
    },
  });

  if (scope.isPending || access.isPending) return <WorkforcePageSkeleton ar={ar} />;
  if (!rid || !membership || !canView) return <Denied ar={ar} />;

  const today = liveToday;
  const rows = shifts.data ?? [];
  const selectedRows = rows.filter((row) => row.shift_date === selectedDate);
  const selectedShiftIds = new Set(selectedRows.map((row) => row.id));
  const selectedAssignments = (assignments.data ?? []).filter((row) =>
    selectedShiftIds.has(row.shift_id),
  );
  const openShiftRow = rows.find((row) => row.status === "open") ?? null;
  const scheduledStaff = new Set(
    selectedAssignments.filter((row) => row.status !== "released").map((row) => row.staff_id),
  ).size;
  const activeMemberCount = (members.data ?? []).filter((member) => member.is_active).length;
  const coveragePercent = activeMemberCount
    ? Math.min(100, Math.round((scheduledStaff / activeMemberCount) * 100))
    : 0;
  const openWorkCount = openWork.data ?? 0;
  const onShiftNow = (workforceSnapshot.data?.time ?? []).filter(
    (entry) => !entry.clock_out,
  ).length;
  const upcomingCount = selectedRows.filter((row) => row.status === "planned").length;
  const pendingHandovers = (handovers.data ?? []).filter((row) => !row.acknowledged_at).length;
  const attentionAssignments = new Set(
    selectedAssignments
      .filter(
        (row) =>
          row.status === "late" ||
          row.status === "absent" ||
          (row.starts_at &&
            (workforceSnapshot.data?.time ?? []).some(
              (e) =>
                e.staff_id === row.staff_id &&
                new Date(e.clock_in).toLocaleDateString("en-CA") === selectedDate &&
                new Date(e.clock_in).getTime() - new Date(row.starts_at!).getTime() >= 15 * 60000,
            )),
      )
      .map((row) => row.staff_id),
  ).size;
  const snapshotEntries = workforceSnapshot.data?.time ?? [];
  const openPunches = snapshotEntries.filter((entry) => !entry.clock_out);
  const needPunch =
    selectedDate === today
      ? selectedAssignments.filter((assignment) => {
          if (assignment.status === "released" || !assignment.starts_at) return false;
          const startMs = new Date(assignment.starts_at).getTime();
          const endMs = assignment.ends_at
            ? new Date(assignment.ends_at).getTime()
            : Number.POSITIVE_INFINITY;
          if (!Number.isFinite(startMs) || liveNow < startMs + 15 * 60_000 || liveNow > endMs)
            return false;
          return !snapshotEntries.some((entry) => {
            if (entry.staff_id !== assignment.staff_id) return false;
            const clockIn = new Date(entry.clock_in).getTime();
            const clockOut = entry.clock_out ? new Date(entry.clock_out).getTime() : liveNow;
            return clockIn <= endMs && clockOut >= startMs;
          });
        }).length
      : 0;
  const overtimeRisk =
    selectedDate === today
      ? openPunches.filter((entry) => {
          const assignment = selectedAssignments.find(
            (row) => row.staff_id === entry.staff_id && row.ends_at,
          );
          if (!assignment?.ends_at) return false;
          const endMs = new Date(assignment.ends_at).getTime();
          return Number.isFinite(endMs) && endMs - liveNow <= 30 * 60_000;
        }).length
      : 0;
  const pendingTimeOff =
    (workforceSnapshot.data?.leave.length ?? 0) + (workforceSnapshot.data?.permissions.length ?? 0);
  const needsAttention = attentionAssignments + pendingHandovers + needPunch;
  const detailShift = rows.find((row) => row.id === detailShiftId) ?? null;
  const detailAssignments = detailShift
    ? (assignments.data ?? []).filter((row) => row.shift_id === detailShift.id)
    : [];
  const detailHandover = detailShift
    ? ((handovers.data ?? []).find((row) => row.shift_id === detailShift.id) ?? null)
    : null;
  const memberName = (staffId: string | null) =>
    staffId ? ((members.data ?? []).find((row) => row.id === staffId)?.name ?? null) : null;

  return (
    <div className="min-h-dvh bg-background">
      <AppHeader title={ar ? "القوى العاملة" : "Workforce"} />
      <main className="qs-workforce-screen qs-workforce-shifts wf-studio qs-page qs-compact-page space-y-4">
        <header className="wf-page-heading">
          <div>
            <h1>{ar ? "القوى العاملة" : "Workforce"}</h1>
            <p>
              {ar
                ? "الأفراد والوقت والخدمة — في مساحة عمل واحدة."
                : "People, time, and service — in one workspace."}
            </p>
          </div>
          <div className="wf-heading-actions">
            <span className="wf-date">
              <CalendarDays className="size-4" />
              {new Date(liveNow).toLocaleDateString(ar ? "ar-JO" : "en-US", {
                timeZone,
                weekday: "short",
                month: "short",
                day: "2-digit",
              })}
            </span>
            {canManage ? (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="size-4" />
                {ar ? "إنشاء وردية" : "Create shift"}
              </Button>
            ) : null}
          </div>
        </header>

        <WorkforceNavigation
          active={workforceSection}
          onChange={setWorkforceSection}
          canManage={canManage}
          ar={ar}
        />

        {workforceSection === "overview" || workforceSection === "attendance" ? (
          <div className="qs-workforce-punch-zone">
            <WorkforceClockHero
              restaurantId={rid}
              currentStaffId={membership.id}
              members={members.data ?? []}
              assignments={assignments.data ?? []}
              ar={ar}
              lang={lang}
            />
          </div>
        ) : null}

        <section
          className={cn(
            "qs-workforce-snapshot qs-card grid grid-cols-2 overflow-hidden sm:grid-cols-3 xl:grid-cols-6",
            workforceSection !== "overview" && "hidden",
          )}
        >
          <WorkforceSnapshotStat
            icon={UsersRound}
            label={ar ? "المجدولون" : "Scheduled"}
            value={scheduledStaff}
            hint={formatShiftDateLabel(selectedDate, ar)}
            tone="blue"
          />
          <WorkforceSnapshotStat
            icon={PlayCircle}
            label={ar ? "على رأس العمل" : "On Shift"}
            value={onShiftNow}
            hint={ar ? "الآن" : "Live now"}
            tone="green"
          />
          <WorkforceSnapshotStat
            icon={TimerReset}
            label={ar ? "لم يسجلوا" : "Need Punch"}
            value={needPunch}
            hint={ar ? "بعد 15 دقيقة" : "15 min grace"}
            tone={needPunch ? "red" : "green"}
          />
          <WorkforceSnapshotStat
            icon={AlertTriangle}
            label={ar ? "تحتاج انتباه" : "Attention"}
            value={needsAttention}
            hint={
              pendingHandovers
                ? ar
                  ? "يشمل تسليمات"
                  : "Includes handovers"
                : ar
                  ? "استثناءات اليوم"
                  : "Today's exceptions"
            }
            tone={needsAttention ? "red" : "green"}
          />
          <WorkforceSnapshotStat
            icon={CalendarDays}
            label={ar ? "الطلبات" : "Requests"}
            value={pendingTimeOff}
            hint={ar ? "بانتظار المراجعة" : "Pending review"}
            tone="orange"
          />
          <WorkforceSnapshotStat
            icon={Clock3}
            label={ar ? "وقت إضافي" : "OT Risk"}
            value={overtimeRisk}
            hint={ar ? "خلال 30 دقيقة" : "Within 30 min"}
            tone={overtimeRisk ? "orange" : "green"}
          />
        </section>

        {workforceSection === "overview" ? (
          <section className="wf-split">
            <WorkforceToday
              restaurantId={rid}
              members={members.data ?? []}
              assignments={assignments.data ?? []}
              ar={ar}
              onOpen={setMemberSheet}
              onAttendance={() => setWorkforceSection("attendance")}
            />
            <div className="space-y-4">
              <WorkforceExceptions
                restaurantId={rid}
                currentStaffId={membership.id}
                members={members.data ?? []}
                assignments={assignments.data ?? []}
                ar={ar}
              />
              <section className="wf-panel">
                <header className="wf-toolbar">
                  <h2>{ar ? "الورديات القادمة" : "Upcoming shifts"}</h2>
                </header>
                {rows
                  .filter(
                    (row) =>
                      row.status === "planned" &&
                      row.planned_start &&
                      new Date(row.planned_start).getTime() > liveNow,
                  )
                  .sort((a, b) => a.planned_start!.localeCompare(b.planned_start!))
                  .slice(0, 3)
                  .map((row) => (
                    <button
                      className="wf-upcoming"
                      key={row.id}
                      onClick={() => setDetailShiftId(row.id)}
                    >
                      <span className={`wf-shift-tag wf-shift-${shiftType(row)}`}>
                        {shiftType(row)}
                      </span>
                      <span>
                        <strong>{row.name}</strong>
                        <small>
                          {row.shift_date} · {formatWindow(row, ar)}
                        </small>
                      </span>
                      <ChevronRight className="size-4" />
                    </button>
                  ))}
                {!rows.some(
                  (row) =>
                    row.status === "planned" &&
                    row.planned_start &&
                    new Date(row.planned_start).getTime() > liveNow,
                ) ? (
                  <p className="wf-empty">{ar ? "لا ورديات قادمة." : "No upcoming shifts."}</p>
                ) : null}
              </section>
            </div>
          </section>
        ) : null}
        {workforceSection === "schedule" ? (
          <WorkforceWeekBoard
            restaurantId={rid}
            date={selectedDate}
            onChangeDate={setSelectedDate}
            shifts={rows}
            assignments={assignments.data ?? []}
            members={members.data ?? []}
            ar={ar}
            onOpen={(s) => setDetailShiftId(s.id)}
            onCreate={() => setCreateOpen(true)}
            canManage={canManage}
          />
        ) : null}
        {workforceSection === "labor" && canManage ? (
          <WorkforceLabor
            restaurantId={rid}
            members={members.data ?? []}
            assignments={assignments.data ?? []}
            ar={ar}
            onTimesheets={() => setWorkforceSection("timesheets")}
          />
        ) : null}
        {workforceSection === "attendance" ? (
          <WorkforceAttendanceBoard
            restaurantId={rid}
            members={members.data ?? []}
            assignments={assignments.data ?? []}
            ar={ar}
            onOpen={setMemberSheet}
          />
        ) : null}
        {workforceSection === "timesheets" ? (
          <WorkforceTimesheets
            restaurantId={rid}
            members={members.data ?? []}
            assignments={assignments.data ?? []}
            canManage={canManage}
            canReopen={canDelete}
            currentStaffId={membership.id}
            ar={ar}
            lang={lang}
            onOpenMember={setMemberSheet}
          />
        ) : null}
        {workforceSection === "team" ? (
          <WorkforceTeam
            restaurantId={rid}
            members={members.data ?? []}
            assignments={assignments.data ?? []}
            ar={ar}
            onOpen={setMemberSheet}
            canManageTeam={membershipHasCapability(
              membership.role,
              membership.permission_overrides,
              "manage_staff",
            )}
          />
        ) : null}
        {workforceSection === "time_off" ? (
          <WorkforceRequests
            restaurantId={rid}
            currentStaffId={membership.id}
            canManage={canManage}
            members={members.data ?? []}
            ar={ar}
            lang={lang}
          />
        ) : null}
      </main>

      <MemberWorkforceSheet
        member={memberSheet}
        onClose={() => setMemberSheet(null)}
        restaurantId={rid}
        assignments={assignments.data ?? []}
        ar={ar}
        canManageTeam={membershipHasCapability(
          membership.role,
          membership.permission_overrides,
          "manage_staff",
        )}
      />
      <DetailSheet
        open={Boolean(detailShift)}
        onOpenChange={(open) => {
          if (!open) setDetailShiftId(null);
        }}
        title={detailShift?.name ?? ""}
        description={detailShift ? `${detailShift.shift_date} · ${detailShift.status}` : undefined}
        footer={
          detailShift && canDelete && detailShift.status !== "open" ? (
            <Button
              variant="destructive"
              className="w-full gap-2"
              onClick={() => setDeletingShift(detailShift)}
            >
              <Trash2 className="size-4" />
              {ar ? "حذف الوردية" : "Delete shift"}
            </Button>
          ) : undefined
        }
      >
        {detailShift ? (
          <div className="wf-shift-details">
            <ShiftRow
              shift={detailShift}
              assignments={detailAssignments}
              canManage={canManage}
              canDelete={false}
              currentStaffId={membership.id}
              ar={ar}
              lang={lang}
              onOpen={() => {}}
              onClose={() => setClosingShift(detailShift)}
              onDelete={() => setDeletingShift(detailShift)}
            />
            <CurrentShift
              shift={detailShift}
              assignments={detailAssignments}
              members={members.data ?? []}
              canManage={canManage}
              currentStaffId={membership.id}
              ar={ar}
              lang={lang}
              onClose={() => setClosingShift(detailShift)}
            />
            {detailShift.notes ? (
              <p className="mb-4 whitespace-pre-wrap rounded-2xl bg-muted/40 p-3 text-sm leading-6">
                {detailShift.notes}
              </p>
            ) : null}
            <DetailRow
              label={ar ? "الحالة" : "Status"}
              value={<Status status={detailShift.status} ar={ar} />}
            />
            <DetailRow label={ar ? "التاريخ" : "Date"} value={detailShift.shift_date} />
            <DetailRow
              label={ar ? "الوقت المخطط" : "Planned window"}
              value={formatWindow(detailShift, ar)}
            />
            <DetailRow
              label={ar ? "فُتحت" : "Opened"}
              value={formatStamp(detailShift.actual_opened_at, ar)}
            />
            <DetailRow
              label={ar ? "أُغلقت" : "Closed"}
              value={formatStamp(detailShift.actual_closed_at, ar)}
            />
            <DetailRow
              label={ar ? "فتح بواسطة" : "Opened by"}
              value={memberName(detailShift.opened_by_staff_id)}
            />
            <DetailRow
              label={ar ? "أغلق بواسطة" : "Closed by"}
              value={memberName(detailShift.closed_by_staff_id)}
            />
            <DetailRow
              label={ar ? "أُنشئت" : "Created"}
              value={formatStamp(detailShift.created_at, ar)}
            />
            <DetailRow
              label={ar ? "آخر تحديث" : "Updated"}
              value={formatStamp(detailShift.updated_at, ar)}
            />
            <div className="mt-5">
              <h3 className="text-xs font-bold uppercase tracking-[.08em] text-muted-foreground">
                {ar ? "أعضاء الوردية" : "Shift team"}
              </h3>
              <div className="mt-2 space-y-2">
                {detailAssignments.length ? (
                  detailAssignments.map((assignment) => (
                    <div key={assignment.id} className="rounded-xl border border-border/70 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <strong className="text-sm">
                          {memberName(assignment.staff_id) ?? (ar ? "عضو فريق" : "Team member")}
                        </strong>
                        <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-bold capitalize text-muted-foreground">
                          {assignment.status}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {assignment.role_snapshot
                          ? (ROLE_LABELS[assignment.role_snapshot]?.[lang] ??
                            assignment.role_snapshot)
                          : ""}
                      </p>
                      {assignment.notes ? (
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">
                          {assignment.notes}
                        </p>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {ar ? "لا يوجد أعضاء معينون." : "No team members assigned."}
                  </p>
                )}
              </div>
            </div>
            {detailHandover ? (
              <div className="mt-5 rounded-2xl border border-border/70 p-4">
                <div className="flex items-center gap-2">
                  <Handshake className="size-4 text-[#e85d2a]" />
                  <strong className="text-sm">{ar ? "تسليم الوردية" : "Shift handover"}</strong>
                </div>
                <HandoverItem
                  handover={detailHandover}
                  currentStaffId={membership.id}
                  restaurantId={rid}
                  ar={ar}
                  lang={lang}
                />
                {detailHandover.unresolved_items ? (
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {detailHandover.unresolved_items}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </DetailSheet>
      {canManage ? (
        <CreateShiftDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          restaurantId={rid}
          ar={ar}
          lang={lang}
        />
      ) : null}
      {canManage && closingShift ? (
        <CloseShiftDialog
          shift={closingShift}
          openWorkCount={openWork.data ?? 0}
          restaurantId={rid}
          currentStaffId={membership.id}
          onClose={() => setClosingShift(null)}
          ar={ar}
          lang={lang}
        />
      ) : null}
      {canDelete && deletingShift ? (
        <DeleteShiftDialog
          shift={deletingShift}
          restaurantId={rid}
          onClose={() => setDeletingShift(null)}
          ar={ar}
          lang={lang}
        />
      ) : null}
    </div>
  );
}

function addShiftDays(dateKey: string, amount: number) {
  const value = new Date(`${dateKey}T12:00:00`);
  value.setDate(value.getDate() + amount);
  return value.toLocaleDateString("en-CA");
}
function toWorkforceLocalInput(value: string | null | undefined, timeZone = "Asia/Amman") { return value ? workforceLocalInput(value,timeZone) : ""; }

function formatShiftDateLabel(dateKey: string, ar: boolean) {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString(ar ? "ar-JO" : "en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function WorkforceSnapshotStat({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof CalendarClock;
  label: string;
  value: number;
  hint: string;
  tone: "blue" | "green" | "red" | "orange";
}) {
  const color =
    tone === "blue"
      ? "#3b82f6"
      : tone === "green"
        ? "#22c55e"
        : tone === "red"
          ? "#ff5a0a"
          : "#f59e0b";
  return (
    <article className="qs-workforce-snapshot-item">
      <span className="wf-snapshot-label">
        <i style={{ background: color }} />
        {label}
      </span>
      <strong>{value}</strong>
    </article>
  );
}

function WorkforceNavigation({
  active,
  onChange,
  canManage,
  ar,
}: {
  active: WorkforceSection;
  onChange: (value: WorkforceSection) => void;
  canManage: boolean;
  ar: boolean;
}) {
  const tabs: Array<{ id: WorkforceSection; label: string; icon: typeof CalendarClock }> = [
    { id: "overview", label: ar ? "نظرة عامة" : "Overview", icon: UsersRound },
    { id: "schedule", label: ar ? "الجدول" : "Schedule", icon: CalendarClock },
    { id: "attendance", label: ar ? "الحضور" : "Attendance", icon: TimerReset },
    { id: "timesheets", label: ar ? "سجلات الدوام" : "Timesheets", icon: CheckCircle2 },
    { id: "time_off", label: ar ? "الطلبات" : "Requests", icon: CalendarDays },
    { id: "team", label: ar ? "الفريق" : "Team", icon: UserPlus },
    ...(canManage
      ? [{ id: "labor" as WorkforceSection, label: ar ? "العمالة" : "Labor", icon: Clock3 }]
      : []),
  ];

  return (
    <nav className="wf-tabs" aria-label={ar ? "أقسام القوى العاملة" : "Workforce sections"}>
      <div role="tablist">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const selected = active === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onChange(tab.id)}
              className={selected ? "is-selected" : ""}
            >
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

type TimeEntry = {
  id: string;
  staff_id: string;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number;
};
type ClockStatus = {
  entry_id: string;
  staff_id: string;
  clock_in: string;
  server_now?: string;
  elapsed_seconds?: number;
};
type ClockResult = {
  action?: string;
  entry_id?: string | null;
  staff_id?: string | null;
  at?: string;
  clock_in?: string | null;
} | null;

function WorkforceClockHero({
  restaurantId,
  currentStaffId,
  members,
  assignments,
  ar,
  lang,
}: {
  restaurantId: string;
  currentStaffId: string;
  members: Array<{ id: string; name: string; role: AppRole; is_active: boolean }>;
  assignments: ShiftAssignment[];
  ar: boolean;
  lang: "en" | "ar";
}) {
  const qc = useQueryClient();
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [missingPunchOpen, setMissingPunchOpen] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const clockStatus = useQuery<ClockStatus | null>({
    queryKey: ["workforce-clock", restaurantId, currentStaffId],
    refetchInterval: 10_000,
    staleTime: 2_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_my_time_clock_status", {
        _restaurant_id: restaurantId,
      });
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as ClockStatus | null;
      return row?.entry_id ? row : null;
    },
  });

  const history = useQuery<TimeEntry[]>({
    queryKey: ["workforce-clock-history", restaurantId, currentStaffId],
    refetchInterval: 20_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
      const { data, error } = await (supabase.from("staff_time_entries" as any) as any)
        .select("id,staff_id,clock_in,clock_out,break_minutes")
        .eq("restaurant_id", restaurantId)
        .eq("staff_id", currentStaffId)
        .gte("clock_in", since)
        .order("clock_in", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as TimeEntry[];
    },
  });

  const openEntry: TimeEntry | null = clockStatus.data
    ? {
        id: clockStatus.data.entry_id,
        staff_id: clockStatus.data.staff_id,
        clock_in: clockStatus.data.clock_in,
        clock_out: null,
        break_minutes: 0,
      }
    : null;
  const currentSessionSeconds = openEntry
    ? Math.max(0, Math.floor((clockNow - new Date(openEntry.clock_in).getTime()) / 1000))
    : 0;
  const todayKey = new Date(clockNow).toLocaleDateString("en-CA");
  const todayWorkedSeconds = (history.data ?? [])
    .filter((entry) => new Date(entry.clock_in).toLocaleDateString("en-CA") === todayKey)
    .reduce((sum, entry) => {
      const startMs = new Date(entry.clock_in).getTime();
      const endMs = entry.clock_out ? new Date(entry.clock_out).getTime() : clockNow;
      return (
        sum +
        Math.max(0, Math.floor((endMs - startMs) / 1000) - Number(entry.break_minutes || 0) * 60)
      );
    }, 0);

  const latestCompletedEntry =
    (history.data ?? [])
      .filter((entry) => entry.staff_id === currentStaffId && entry.clock_out)
      .sort((a, b) => new Date(b.clock_out!).getTime() - new Date(a.clock_out!).getTime())[0] ??
    null;
  const latestCompletedSeconds = latestCompletedEntry?.clock_out
    ? Math.max(
        0,
        Math.floor(
          (new Date(latestCompletedEntry.clock_out).getTime() -
            new Date(latestCompletedEntry.clock_in).getTime()) /
            1000,
        ) -
          Number(latestCompletedEntry.break_minutes || 0) * 60,
      )
    : 0;

  const staffMember = members.find((member) => member.id === currentStaffId) ?? null;
  const liveAssignment =
    assignments
      .filter(
        (assignment) =>
          assignment.staff_id === currentStaffId &&
          assignment.status !== "released" &&
          assignment.starts_at &&
          assignment.ends_at,
      )
      .map((assignment) => ({
        assignment,
        startMs: new Date(assignment.starts_at!).getTime(),
        endMs: new Date(assignment.ends_at!).getTime(),
      }))
      .filter((item) => Number.isFinite(item.startMs) && Number.isFinite(item.endMs))
      .sort((a, b) => {
        const aLive = a.startMs <= clockNow && a.endMs >= clockNow;
        const bLive = b.startMs <= clockNow && b.endMs >= clockNow;
        if (aLive !== bLive) return aLive ? -1 : 1;
        return Math.abs(a.startMs - clockNow) - Math.abs(b.startMs - clockNow);
      })[0]?.assignment ?? null;

  const expectedEnd = openEntry ? (liveAssignment?.ends_at ?? null) : null;
  const nextShift = !openEntry
    ? (assignments
        .filter(
          (assignment) =>
            assignment.staff_id === currentStaffId &&
            assignment.status !== "released" &&
            assignment.starts_at &&
            new Date(assignment.starts_at).getTime() >= clockNow,
        )
        .sort((a, b) => new Date(a.starts_at!).getTime() - new Date(b.starts_at!).getTime())[0] ??
      null)
    : null;

  const recentCompletedAssignment =
    assignments
      .filter(
        (assignment) =>
          assignment.staff_id === currentStaffId &&
          assignment.status !== "released" &&
          assignment.starts_at &&
          assignment.ends_at &&
          new Date(assignment.ends_at).getTime() <= clockNow + 5 * 60_000,
      )
      .sort((a, b) => new Date(b.ends_at!).getTime() - new Date(a.ends_at!).getTime())[0] ?? null;

  const toggleClock = useMutation({
    mutationFn: async () => {
      const rpc = openEntry ? "clock_out_staff" : "clock_in_staff";
      const { data, error } = await (supabase as any).rpc(rpc, { _restaurant_id: restaurantId });
      if (error) throw error;
      return (Array.isArray(data) ? data[0] : data) as ClockResult;
    },
    onSuccess: async (result) => {
      const action = result?.action?.toLowerCase();
      const at = result?.at ?? new Date().toISOString();
      const isOut = action === "clocked_out" || action === "already_clocked_out";
      const isIn = action === "clocked_in" || action === "already_clocked_in";
      if (isIn && result?.entry_id && result?.staff_id) {
        qc.setQueryData<ClockStatus | null>(
          ["workforce-clock", restaurantId, currentStaffId],
          () => ({
            entry_id: result.entry_id!,
            staff_id: result.staff_id!,
            clock_in: result.clock_in ?? at,
            server_now: at,
          }),
        );
      } else if (isOut) {
        qc.setQueryData<ClockStatus | null>(
          ["workforce-clock", restaurantId, currentStaffId],
          () => null,
        );
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["workforce-clock", restaurantId, currentStaffId] }),
        qc.invalidateQueries({
          queryKey: ["workforce-clock-history", restaurantId, currentStaffId],
        }),
        qc.invalidateQueries({ queryKey: ["workforce", restaurantId] }),
        qc.invalidateQueries({ queryKey: ["workforce", "live-snapshot", restaurantId] }),
        qc.invalidateQueries({ queryKey: ["workforce", "insights", restaurantId] }),
        qc.invalidateQueries({ queryKey: ["platform", "staff-schedule", restaurantId] }),
        qc.invalidateQueries({ queryKey: ["operations", "shift-assignments", restaurantId] }),
      ]);
      const completedSeconds =
        isOut && result?.clock_in
          ? Math.max(
              0,
              Math.floor((new Date(at).getTime() - new Date(result.clock_in).getTime()) / 1000),
            )
          : 0;
      toast.success(
        isOut
          ? completedSeconds > 0
            ? ar
              ? `تم تسجيل الانصراف · مدة الجلسة ${formatClockDuration(completedSeconds, true)}`
              : `Clocked out · session ${formatClockDuration(completedSeconds, false)}`
            : ar
              ? "تم تسجيل الانصراف"
              : "Clocked out"
          : ar
            ? "تم تسجيل الحضور"
            : "Clocked in",
      );
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  const expectedLabel = expectedEnd
    ? new Date(expectedEnd).toLocaleTimeString(ar ? "ar-JO" : "en-JO", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : nextShift?.starts_at
      ? new Date(nextShift.starts_at).toLocaleTimeString(ar ? "ar-JO" : "en-JO", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";
  const expectedHint = expectedEnd
    ? formatRelativeClock(expectedEnd, clockNow, ar)
    : nextShift?.starts_at
      ? (ar ? "الوردية القادمة" : "Next shift") +
        " · " +
        new Date(nextShift.starts_at).toLocaleDateString(ar ? "ar-JO" : "en-JO", {
          month: "short",
          day: "numeric",
        })
      : ar
        ? "لا توجد وردية قادمة"
        : "No upcoming shift";

  return (
    <>
      <section className="wf-clock" aria-live="polite">
        <div className="wf-clock-person">
          <span className="wf-avatar">
            {(staffMember?.name ?? "T")
              .split(" ")
              .map((v) => v[0])
              .slice(0, 2)
              .join("")}
          </span>
          <span>
            <strong>{staffMember?.name ?? (ar ? "عضو الفريق" : "Team member")}</strong>
            <small>
              <i className={openEntry ? "is-active" : ""} />
              {openEntry
                ? ar
                  ? "على رأس العمل"
                  : "On shift"
                : ar
                  ? "جاهز للبدء"
                  : "Ready to clock in"}
              {openEntry
                ? " · " +
                  (ar ? "الدخول " : "Clocked in ") +
                  new Date(openEntry.clock_in).toLocaleTimeString(ar ? "ar-JO" : "en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  })
                : ""}
            </small>
          </span>
        </div>
        <div className="wf-clock-metric">
          <small>
            {openEntry
              ? ar
                ? "الجلسة الحالية"
                : "Current session"
              : ar
                ? "آخر جلسة"
                : "Last session"}
          </small>
          <strong>
            {formatClockDuration(openEntry ? currentSessionSeconds : latestCompletedSeconds, ar)}
          </strong>
          <small>
            {ar ? "وقت العمل اليوم" : "Worked today"} ·{" "}
            {formatClockDuration(todayWorkedSeconds, ar)}
          </small>
        </div>
        <div className="wf-clock-metric">
          <small>
            {openEntry
              ? ar
                ? "نهاية الوردية"
                : "Shift ends"
              : ar
                ? "الوردية القادمة"
                : "Next shift"}
          </small>
          <strong>{expectedLabel}</strong>
          <small>{expectedHint}</small>
        </div>
        <div className="wf-clock-action">
          <Button
            aria-busy={toggleClock.isPending}
            disabled={toggleClock.isPending || clockStatus.isPending}
            onClick={() => toggleClock.mutate()}
          >
            {toggleClock.isPending
              ? ar
                ? "جارٍ التحديث…"
                : "Updating…"
              : openEntry
                ? ar
                  ? "تسجيل الانصراف"
                  : "Clock out"
                : ar
                  ? "تسجيل الحضور"
                  : "Clock in"}
          </Button>
          <button className="wf-missing" onClick={() => setMissingPunchOpen(true)}>
            {ar ? "نسيت البصمة؟" : "Forgot a punch?"}
          </button>
        </div>
      </section>
      {missingPunchOpen ? (
        <SelfMissingPunchRequestSheet
          restaurantId={restaurantId}
          assignment={recentCompletedAssignment}
          ar={ar}
          lang={lang}
          onClose={() => setMissingPunchOpen(false)}
        />
      ) : null}
    </>
  );
}

function SelfMissingPunchRequestSheet({
  restaurantId,
  assignment,
  ar,
  lang,
  onClose,
}: {
  restaurantId: string;
  assignment: ShiftAssignment | null;
  ar: boolean;
  lang: "en" | "ar";
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const restaurant = useRestaurant(restaurantId);
  const timeZone = restaurant.data?.timezone || "Asia/Amman";
  const scheduledIn = assignment?.starts_at ? toWorkforceLocalInput(assignment.starts_at,timeZone) : "";
  const scheduledOut = assignment?.ends_at ? toWorkforceLocalInput(assignment.ends_at,timeZone) : "";
  const [clockIn, setClockIn] = useState(scheduledIn);
  const [clockOut, setClockOut] = useState(scheduledOut);
  const [breakMinutes, setBreakMinutes] = useState("0");
  const [reason, setReason] = useState("");
  const durationMinutes =
    clockIn && clockOut
      ? Math.round((workforceInputTimestamp(clockOut,timeZone) - workforceInputTimestamp(clockIn,timeZone)) / 60000)
      : 0;
  const invalid =
    !clockIn ||
    !clockOut ||
    !Number.isFinite(durationMinutes) || durationMinutes <= 0 ||
    durationMinutes > 2160 ||
    Number(breakMinutes) < 0 ||
    Number(breakMinutes) >= durationMinutes ||
    reason.trim().length < 3 ||
    workforceInputTimestamp(clockIn,timeZone) > Date.now() + 5 * 60_000 ||
    workforceInputTimestamp(clockOut,timeZone) > Date.now() + 5 * 60_000;

  const submit = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).rpc("submit_missing_punch_request", {
        _restaurant_id: restaurantId,
        _clock_in: new Date(workforceInputTimestamp(clockIn,timeZone)).toISOString(),
        _clock_out: new Date(workforceInputTimestamp(clockOut,timeZone)).toISOString(),
        _break_minutes: Number(breakMinutes) || 0,
        _reason: reason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["workforce"] }),
        qc.invalidateQueries({ queryKey: ["notifications"] }),
        qc.invalidateQueries({ queryKey: ["operations"] }),
      ]);
      toast.success(
        ar
          ? "تم إرسال طلب البصمة للمدير للمراجعة"
          : "Missing punch sent to your manager for review",
      );
      onClose();
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  const applySchedule = () => {
    if (!assignment?.starts_at || !assignment.ends_at) return;
    setClockIn(toWorkforceLocalInput(assignment.starts_at,timeZone));
    setClockOut(toWorkforceLocalInput(assignment.ends_at,timeZone));
  };

  return (
    <DetailSheet
      open
      onOpenChange={(open) => {
        if (!open && !submit.isPending) onClose();
      }}
      title={ar ? "طلب بصمة ناقصة" : "Report missing punch"}
      description={
        ar
          ? "صحّح وقتاً نسيته بدون تعديل سجل الدوام مباشرة."
          : "Report a forgotten clock-in or clock-out without changing the timesheet directly."
      }
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" disabled={submit.isPending} onClick={onClose}>
            {ar ? "إلغاء" : "Cancel"}
          </Button>
          <Button disabled={invalid || submit.isPending} onClick={() => submit.mutate()}>
            <Clock3 className="size-4" />
            {submit.isPending
              ? ar
                ? "جارٍ الإرسال…"
                : "Sending…"
              : ar
                ? "إرسال للمراجعة"
                : "Send for review"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 py-2">
        <div className="rounded-2xl border border-blue-200/70 bg-blue-500/[.045] p-3 text-xs leading-5 text-muted-foreground dark:border-blue-900/50">
          <strong className="block text-foreground">
            {ar ? "طلب آمن بموافقة المدير" : "Manager-approved correction"}
          </strong>
          <span>
            {ar
              ? "لن تتغير ساعاتك مباشرة. بعد موافقة المدير تُضاف البصمة تلقائياً مع سجل تدقيق."
              : "Your hours do not change immediately. Once approved, the punch is added automatically with an audit trail."}
          </span>
        </div>
        {assignment?.starts_at && assignment.ends_at ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/25 p-3">
            <span className="min-w-0">
              <strong className="block text-xs">
                {ar ? "آخر وردية مكتملة" : "Latest completed shift"}
              </strong>
              <span className="mt-1 block text-[10px] tabular-nums text-muted-foreground">
                {formatStamp(assignment.starts_at, ar)} → {formatStamp(assignment.ends_at, ar)}
              </span>
            </span>
            <Button type="button" size="sm" variant="outline" onClick={applySchedule}>
              {ar ? "استخدم الجدول" : "Use schedule"}
            </Button>
          </div>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <RequestDateTimePicker timeZone={timeZone} label={ar ? "وقت الدخول" : "Clock in"} ar={ar}
              value={clockIn}
              onChange={(value) => setClockIn(value)}
            />
          </div>
          <div className="space-y-2">
            <RequestDateTimePicker timeZone={timeZone} label={ar ? "وقت الخروج" : "Clock out"} ar={ar}
              value={clockOut}
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
            onChange={(event) => setBreakMinutes(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>{ar ? "ما الذي نسيته؟ (مطلوب)" : "What was missed? (required)"}</Label>
          <Textarea
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={
              ar
                ? "مثال: نسيت تسجيل الانصراف بعد انتهاء ورديتي."
                : "e.g. I forgot to clock out after my shift ended."
            }
          />
        </div>
        {durationMinutes > 0 ? (
          <p className="text-[11px] font-semibold text-muted-foreground">
            {ar
              ? `المدة المقترحة: ${Math.floor(durationMinutes / 60)}س ${durationMinutes % 60}د`
              : `Proposed duration: ${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m`}
          </p>
        ) : null}
      </div>
    </DetailSheet>
  );
}
function formatClockDuration(seconds: number, ar: boolean) {
  const total = Math.max(0, Math.floor(seconds / 60));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return ar
    ? String(hours) + "س " + String(minutes) + "د"
    : String(hours) + "h " + String(minutes) + "m";
}
function formatRelativeClock(value: string, nowMs: number, ar: boolean) {
  const diff = Math.max(0, new Date(value).getTime() - nowMs);
  const total = Math.floor(diff / 60000);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return ar ? "بعد " + hours + "س " + minutes + "د" : "in " + hours + "h " + minutes + "m";
}
function localShiftDateTimeIso(date: string, time: string, addDays = 0, timeZone = "Asia/Amman") {
  return new Date(workforceLocalTimestamp(addDays ? addShiftDays(date,addDays) : date,time,timeZone)).toISOString();
}

function countRecurringDays(startDate: string, endDate: string, weekdays: number[]) {
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  if (
    !weekdays.length ||
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end < start
  )
    return 0;
  let count = 0;
  for (const day = new Date(start); day <= end; day.setDate(day.getDate() + 1))
    if (weekdays.includes(day.getDay())) count += 1;
  return count;
}
function formatTimeInputForSummary(value: string, ar: boolean) {
  if (!value) return "—";
  const [hour, minute] = value.split(":").map(Number);
  const date = new Date(2000, 0, 1, hour || 0, minute || 0);
  return date.toLocaleTimeString(ar ? "ar-JO" : "en-US", { hour: "2-digit", minute: "2-digit" });
}

function CurrentShift({
  shift,
  assignments,
  members,
  canManage,
  currentStaffId,
  ar,
  lang,
  onClose,
}: {
  shift: Shift;
  assignments: ShiftAssignment[];
  members: Array<{ id: string; name: string; role: AppRole; is_active: boolean }>;
  canManage: boolean;
  currentStaffId: string;
  ar: boolean;
  lang: "en" | "ar";
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [memberId, setMemberId] = useState("");
  const assign = useMutation({
    mutationFn: async () => {
      const member = members.find((row) => row.id === memberId);
      if (!member) return;
      await assignStaffToShift({
        restaurant_id: shift.restaurant_id,
        shift_id: shift.id,
        staff_id: member.id,
        role_snapshot: member.role,
        starts_at: shift.planned_start,
        ends_at: shift.planned_end,
      });
    },
    onSuccess: async () => {
      setMemberId("");
      await qc.invalidateQueries({
        queryKey: ["operations", "shift-assignments", shift.restaurant_id],
      });
      toast.success(ar ? "تمت إضافة الموظف للوردية" : "Team member assigned");
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });
  const assignedIds = new Set(assignments.map((row) => row.staff_id));
  const available = members.filter((row) => row.is_active && !assignedIds.has(row.id));

  return (
    <section className="qs-card overflow-hidden border-orange-200/80 bg-card dark:border-orange-900/50">
      <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center sm:p-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.08em] text-emerald-700">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              {ar ? "الفريق المعيّن" : "Assigned team"}
            </span>
            <span className="text-xs text-muted-foreground">{shift.shift_date}</span>
          </div>
          <h2 className="mt-3 font-display text-2xl font-bold tracking-[-.03em]">{shift.name}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {ar
              ? `${assignments.length} أعضاء في هذه الوردية`
              : `${assignments.length} team members on this shift`}
          </p>
        </div>
        {canManage && shift.status === "open" ? (
          <Button variant="outline" className="gap-2" onClick={onClose}>
            <StopCircle className="size-4" />
            {ar ? "إغلاق الوردية" : "Close shift"}
          </Button>
        ) : null}
      </div>
      <div className="border-t border-border/70 p-5">
        <div className="flex flex-wrap gap-2">
          {assignments.map((assignment) => {
            const member = members.find((row) => row.id === assignment.staff_id);
            return (
              <AssignmentChip
                key={assignment.id}
                assignment={assignment}
                name={
                  member?.name ??
                  (assignment.staff_id === currentStaffId
                    ? ar
                      ? "أنت"
                      : "You"
                    : ar
                      ? "عضو فريق"
                      : "Team member")
                }
                canManage={canManage}
                isSelf={assignment.staff_id === currentStaffId}
                restaurantId={shift.restaurant_id}
                ar={ar}
                lang={lang}
              />
            );
          })}
          {!assignments.length ? (
            <span className="text-xs text-muted-foreground">
              {ar ? "لم تتم إضافة فريق بعد." : "No team members assigned yet."}
            </span>
          ) : null}
        </div>
        {canManage && available.length ? (
          <div className="mt-4 flex max-w-xl flex-col gap-2 sm:flex-row">
            <Select value={memberId} onValueChange={setMemberId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder={ar ? "اختر موظفاً" : "Choose a team member"} />
              </SelectTrigger>
              <SelectContent>
                {available.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.name} · {ROLE_LABELS[member.role]?.[lang] ?? member.role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              disabled={!memberId || assign.isPending}
              onClick={() => assign.mutate()}
              className="gap-2"
            >
              <UserPlus className="size-4" />
              {ar ? "إضافة" : "Assign"}
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ShiftRow({
  shift,
  assignments,
  canManage,
  canDelete,
  currentStaffId,
  ar,
  lang,
  onOpen,
  onClose,
  onDelete,
}: {
  shift: Shift;
  assignments: ShiftAssignment[];
  canManage: boolean;
  canDelete: boolean;
  currentStaffId: string;
  ar: boolean;
  lang: "en" | "ar";
  onOpen: () => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  const qc = useQueryClient();
  const open = useMutation({
    mutationFn: () => openShift(shift.id, currentStaffId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["operations", "shifts", shift.restaurant_id] });
      await qc.invalidateQueries({
        queryKey: ["operations", "automated-alerts", shift.restaurant_id],
      });
      toast.success(ar ? "تم فتح الوردية" : "Shift opened");
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });
  const self = assignments.find((row) => row.staff_id === currentStaffId) ?? null;
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className="grid cursor-pointer gap-4 p-4 outline-none transition hover:bg-muted/20 focus-visible:ring-2 focus-visible:ring-[#e85d2a] sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
    >
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-bold">{shift.name}</h3>
          <Status status={shift.status} ar={ar} />
          {self ? (
            <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-bold capitalize text-muted-foreground">
              {self.status}
            </span>
          ) : null}
        </div>
        {shift.notes ? (
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{shift.notes}</p>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
          <span>{shift.shift_date}</span>
          <span>{formatWindow(shift, ar)}</span>
          <span className="inline-flex items-center gap-1">
            <UsersRound className="size-3" />
            {assignments.length}
          </span>
        </div>
      </div>
      <div
        className="flex flex-wrap items-center gap-2"
        onClick={(event) => event.stopPropagation()}
      >
        {self && !canManage && shift.status === "open" ? (
          <SelfShiftControls
            assignment={self}
            restaurantId={shift.restaurant_id}
            ar={ar}
            lang={lang}
          />
        ) : null}
        {canManage ? (
          <>
            {shift.status === "planned" ? (
              <Button
                size="sm"
                disabled={open.isPending}
                onClick={() => open.mutate()}
                className="gap-2"
              >
                <PlayCircle className="size-4" />
                {ar ? "فتح" : "Open"}
              </Button>
            ) : null}
            {shift.status === "open" ? (
              <Button size="sm" variant="outline" onClick={onClose}>
                {ar ? "إغلاق" : "Close"}
              </Button>
            ) : null}
            {canDelete && shift.status !== "open" ? (
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="size-4" />
                {ar ? "حذف" : "Delete"}
              </Button>
            ) : null}
          </>
        ) : null}
      </div>
    </article>
  );
}

function AssignmentChip({
  assignment,
  name,
  canManage,
  isSelf,
  restaurantId,
  ar,
  lang,
}: {
  assignment: ShiftAssignment;
  name: string;
  canManage: boolean;
  isSelf: boolean;
  restaurantId: string;
  ar: boolean;
  lang: "en" | "ar";
}) {
  const qc = useQueryClient();
  const update = useMutation({
    mutationFn: (status: ShiftAssignmentStatus) => updateShiftAssignment(assignment.id, { status }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["operations", "shift-assignments", restaurantId] });
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });
  const remove = useMutation({
    mutationFn: () => removeShiftAssignment(assignment.id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["operations", "shift-assignments", restaurantId] });
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });
  if (!canManage)
    return (
      <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card p-1 ps-3">
        <span className="text-xs font-semibold">{name}</span>
        <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-bold capitalize text-muted-foreground">
          {assignment.status}
        </span>
        {isSelf ? (
          <SelfShiftControls
            assignment={assignment}
            restaurantId={restaurantId}
            ar={ar}
            lang={lang}
            compact
          />
        ) : null}
      </div>
    );
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-border bg-card p-1 ps-3">
      <span className="text-xs font-semibold">{name}</span>
      <Select
        value={assignment.status}
        onValueChange={(value) => update.mutate(value as ShiftAssignmentStatus)}
      >
        <SelectTrigger className="h-7 w-[112px] border-0 bg-transparent px-2 text-[10px] shadow-none">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(["scheduled", "present", "late", "absent", "released"] as ShiftAssignmentStatus[]).map(
            (status) => (
              <SelectItem key={status} value={status}>
                {status}
              </SelectItem>
            ),
          )}
        </SelectContent>
      </Select>
      <button
        type="button"
        onClick={() => remove.mutate()}
        className="rounded-full px-2 py-1 text-[10px] text-muted-foreground hover:text-destructive"
        aria-label={ar ? "إزالة" : "Remove"}
      >
        ×
      </button>
    </div>
  );
}

function SelfShiftControls({
  assignment,
  restaurantId,
  ar,
  lang,
  compact = false,
}: {
  assignment: ShiftAssignment;
  restaurantId: string;
  ar: boolean;
  lang: "en" | "ar";
  compact?: boolean;
}) {
  const qc = useQueryClient();
  const update = useMutation({
    mutationFn: (status: "present" | "released") =>
      updateOwnShiftAssignmentStatus(assignment.id, status),
    onSuccess: async (_data, status) => {
      await qc.invalidateQueries({ queryKey: ["operations", "shift-assignments", restaurantId] });
      toast.success(
        status === "present"
          ? ar
            ? "تم بدء الوردية"
            : "Shift started"
          : ar
            ? "تم إنهاء الوردية"
            : "Shift ended",
      );
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });
  if (assignment.status === "released")
    return (
      <span className="px-2 text-[10px] font-bold text-muted-foreground">
        {ar ? "تم الانتهاء" : "Ended"}
      </span>
    );
  const present = assignment.status === "present";
  return (
    <Button
      size="sm"
      variant={present ? "outline" : "default"}
      className={compact ? "h-7 rounded-full px-2 text-[10px]" : "h-9"}
      disabled={update.isPending}
      onClick={() => update.mutate(present ? "released" : "present")}
    >
      {present ? (ar ? "إنهاء ورديتي" : "End my shift") : ar ? "بدء ورديتي" : "Start my shift"}
    </Button>
  );
}

function HandoverItem({
  handover,
  currentStaffId,
  restaurantId,
  ar,
  lang,
}: {
  handover: ShiftHandover;
  currentStaffId: string;
  restaurantId: string;
  ar: boolean;
  lang: "en" | "ar";
}) {
  const qc = useQueryClient();
  const acknowledge = useMutation({
    mutationFn: () => acknowledgeShiftHandover(handover.id, currentStaffId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["operations", "shift-handovers", restaurantId] });
      toast.success(ar ? "تم استلام التسليم" : "Handover acknowledged");
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });
  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Handshake className="size-4 text-[#e85d2a]" />
            <strong className="text-sm">{handover.summary}</strong>
          </div>
          {handover.unresolved_items ? (
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {handover.unresolved_items}
            </p>
          ) : null}
        </div>
        {!handover.acknowledged_at ? (
          <Button
            size="sm"
            variant="outline"
            disabled={acknowledge.isPending}
            onClick={() => acknowledge.mutate()}
          >
            {ar ? "استلام" : "Acknowledge"}
          </Button>
        ) : null}
      </div>
      <div className="mt-2 flex justify-between gap-2 text-[10px] text-muted-foreground">
        <span>
          {handover.target_role
            ? (ROLE_LABELS[handover.target_role]?.[lang] ?? handover.target_role)
            : ar
              ? "موظف محدد"
              : "Specific teammate"}
        </span>
        <span>
          {handover.acknowledged_at
            ? ar
              ? "تم الاستلام"
              : "Acknowledged"
            : ar
              ? "بانتظار الاستلام"
              : "Pending"}
        </span>
      </div>
    </div>
  );
}

function DeleteShiftDialog({
  shift,
  restaurantId,
  onClose,
  ar,
  lang,
}: {
  shift: Shift;
  restaurantId: string;
  onClose: () => void;
  ar: boolean;
  lang: "en" | "ar";
}) {
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: () => deleteShift(shift.id),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["operations", "shifts", restaurantId] }),
        qc.invalidateQueries({ queryKey: ["operations", "shift-assignments", restaurantId] }),
        qc.invalidateQueries({ queryKey: ["operations", "shift-handovers", restaurantId] }),
      ]);
      toast.success(ar ? "تم حذف الوردية" : "Shift deleted");
      onClose();
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{ar ? "حذف الوردية؟" : "Delete shift?"}</DialogTitle>
          <DialogDescription>
            {ar
              ? `سيتم حذف ${shift.name} وتعيينات الفريق المرتبطة بها. تبقى سجلات التسليم محفوظة بدون ربط بالوردية.`
              : `This removes ${shift.name} and its team assignments. Existing handover records are preserved but detached from the deleted shift.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {ar ? "إلغاء" : "Cancel"}
          </Button>
          <Button variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate()}>
            <Trash2 className="size-4" />
            {ar ? "حذف الوردية" : "Delete shift"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateShiftDialog({
  open,
  onOpenChange,
  restaurantId,
  ar,
  lang,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restaurantId: string;
  ar: boolean;
  lang: "en" | "ar";
}) {
  const qc = useQueryClient();
  const restaurant = useRestaurant(restaurantId);
  const timeZone = restaurant.data?.timezone || "Asia/Amman";
  const today = workforceDayKey(new Date(),timeZone);
  const [mode, setMode] = useState<"single" | "recurring">("single");
  const [name, setName] = useState(ar ? "وردية اليوم" : "Service shift");
  const [date, setDate] = useState(today);
  const [rangeEnd, setRangeEnd] = useState(() => addShiftDays(today, 83));
  const [weekdays, setWeekdays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");
  const [notes, setNotes] = useState("");
  const [type, setType] = useState<"A" | "B" | "C">("A");
  const [assigned, setAssigned] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const members = useWorkspaceMembers(restaurantId);
  const activeMembers = (members.data ?? []).filter((m) => m.is_active);

  const overnight = Boolean(start && end && end <= start);

  const create = useMutation({
    mutationFn: async () => {
      const started = new Date().toISOString();
      const savedNotes = `Shift type: ${type}${notes.trim() ? `\n${notes.trim()}` : ""}`;
      let created: Shift[] = [];
      let count = 1;
      if (mode === "recurring") {
        count = await createRecurringShifts({
          restaurant_id: restaurantId,
          name: name.trim(),
          start_date: date,
          end_date: rangeEnd,
          weekdays,
          planned_start: start,
          planned_end: end,
          notes: savedNotes,
        });
        if (assigned.length && count) {
          const result = await supabase
            .from("shifts" as any)
            .select("*")
            .eq("restaurant_id", restaurantId)
            .eq("name", name.trim())
            .eq("notes", savedNotes)
            .gte("created_at", started)
            .gte("shift_date", date)
            .lte("shift_date", rangeEnd);
          if (result.error || (result.data?.length ?? 0) !== count) {
            toast.warning(
              ar
                ? "تم إنشاء الجدول. افتح الورديات لتعيين الفريق."
                : "Schedule created. Open the shifts to assign your team.",
            );
            return count;
          }
          created = result.data as unknown as Shift[];
        }
      } else {
        const row = await createShift({
          restaurant_id: restaurantId,
          name: name.trim(),
          shift_date: date,
          planned_start: localShiftDateTimeIso(date, start, 0, timeZone),
          planned_end: localShiftDateTimeIso(date, end, overnight ? 1 : 0, timeZone),
          notes: savedNotes,
        });
        created = [row];
      }
      let failedAssignments = 0;
      for (const shift of created) {
        const results = await Promise.allSettled(
          assigned.map((id) => {
            const member = activeMembers.find((m) => m.id === id)!;
            return assignStaffToShift({
              restaurant_id: restaurantId,
              shift_id: shift.id,
              staff_id: id,
              role_snapshot: member.role,
              starts_at: shift.planned_start,
              ends_at: shift.planned_end,
            });
          }),
        );
        failedAssignments += results.filter((r) => r.status === "rejected").length;
      }
      if (failedAssignments)
        toast.warning(
          ar
            ? "تم إنشاء الورديات، لكن بعض التعيينات تحتاج مراجعة من تفاصيل الوردية."
            : "Shifts created; some assignments need review in shift details.",
        );
      return count;
    },
    onSuccess: async (count) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["operations", "shifts", restaurantId] }),
        qc.invalidateQueries({ queryKey: ["operations", "shift-assignments", restaurantId] }),
        qc.invalidateQueries({ queryKey: ["workforce"] }),
      ]);
      setAssigned([]);
      toast.success(
        mode === "recurring"
          ? ar
            ? `تم إنشاء ${count} ورديات مجدولة`
            : `${count} scheduled shifts created`
          : ar
            ? "تم إنشاء الوردية"
            : "Shift created",
      );
      onOpenChange(false);
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  function applyDays(days: number[]) {
    setWeekdays(days);
  }
  function toggleDay(day: number) {
    setWeekdays((current) =>
      current.includes(day) ? current.filter((value) => value !== day) : [...current, day].sort(),
    );
  }
  function setRecurringRange(days: number) {
    setRangeEnd(addShiftDays(date, Math.max(0, days - 1)));
  }
  const invalidRange = mode === "recurring" && rangeEnd < date;
  const recurringDays =
    mode === "recurring" && !invalidRange ? countRecurringDays(date, rangeEnd, weekdays) : 0;
  const tooLong =
    mode === "recurring" &&
    (new Date(`${rangeEnd}T12:00:00`).getTime() - new Date(`${date}T12:00:00`).getTime()) /
      86400000 >
      366;
  const ready = Boolean(
    name.trim() &&
    date &&
    start &&
    end &&
    !invalidRange &&
    !tooLong &&
    (mode === "single" || recurringDays > 0),
  );
  const minutes = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5));
  const durationH = (minutes(end) - minutes(start) + (overnight ? 1440 : 0)) / 60;
  const count = mode === "single" ? 1 : recurringDays;
  const previewDates: string[] = [];
  if (date && rangeEnd && !invalidRange && !tooLong)
    for (
      let d = date;
      d <= (mode === "single" ? date : rangeEnd) && previewDates.length < 3;
      d = moveDay(d, 1)
    )
      if (mode === "single" || weekdays.includes(new Date(`${d}T12:00:00`).getDay()))
        previewDates.push(d);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!create.isPending) onOpenChange(next);
      }}
    >
      <DialogContent
        className="qs-create-shift-dialog wf-form-dialog wf-shift-dialog"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className="wf-dialog-heading">
          <DialogTitle>{ar ? "إنشاء جدول الورديات" : "Create shift schedule"}</DialogTitle>
          <DialogDescription>
            {ar
              ? "خطط لوردية واحدة أو كررها في أيام العمل المحددة."
              : "Plan one shift or repeat it across selected workdays."}
          </DialogDescription>
        </DialogHeader>
        <div className="wf-dialog-scroll">
          <div className="wf-filter-tabs wf-form-tabs">
            <button aria-pressed={mode === "single"} onClick={() => setMode("single")}>
              {ar ? "وردية واحدة" : "Single shift"}
            </button>
            <button aria-pressed={mode === "recurring"} onClick={() => setMode("recurring")}>
              {ar ? "جدول متكرر" : "Recurring schedule"}
            </button>
          </div>
          <div className="wf-shift-form-layout">
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
                <Field label={ar ? "اسم الوردية" : "Shift name"}>
                  <Input maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
                </Field>
                <Field label={ar ? "نوع الوردية" : "Shift type"}>
                  <div className="wf-type-options">
                    {(["A", "B", "C"] as const).map((t) => (
                      <button key={t} aria-pressed={t === type} onClick={() => setType(t)}>
                        {t}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <RequestDatePicker
                  timeZone={timeZone}
                  label={
                    mode === "single"
                      ? ar
                        ? "التاريخ"
                        : "Date"
                      : ar
                        ? "تاريخ البداية"
                        : "Start date"
                  }
                  value={date}
                  onChange={(d) => {
                    setDate(d);
                    if (rangeEnd < d) setRangeEnd(addShiftDays(d, 27));
                  }}
                  ar={ar}
                />
                {mode === "recurring" ? (
                  <RequestDatePicker
                  timeZone={timeZone}
                    label={ar ? "تاريخ النهاية" : "End date"}
                    value={rangeEnd}
                    min={date}
                    onChange={setRangeEnd}
                    ar={ar}
                  />
                ) : null}
              </div>
              {mode === "recurring" ? (
                <Field label={ar ? "أيام العمل" : "Workdays"}>
                  <div className="wf-workdays">
                    {SHIFT_WEEKDAYS.map((d) => (
                      <button
                        key={d.value}
                        aria-pressed={weekdays.includes(d.value)}
                        onClick={() => toggleDay(d.value)}
                      >
                        {weekdays.includes(d.value) ? "✓ " : ""}
                        {ar ? d.ar : d.en}
                      </button>
                    ))}
                  </div>
                  <div className="wf-quick-days">
                    <button onClick={() => applyDays([0, 1, 2, 3, 4])}>
                      {ar ? "الأحد–الخميس" : "Sun–Thu"}
                    </button>
                    <button onClick={() => applyDays([5, 6])}>
                      {ar ? "نهاية الأسبوع" : "Weekend"}
                    </button>
                    <button onClick={() => setRecurringRange(28)}>
                      {ar ? "4 أسابيع" : "4 weeks"}
                    </button>
                  </div>
                </Field>
              ) : null}
              <div className="grid grid-cols-2 gap-3">
                <RequestTimePicker
                  label={ar ? "وقت البداية" : "Start time"}
                  value={start}
                  onChange={setStart}
                  ar={ar}
                />
                <RequestTimePicker
                  label={ar ? "وقت النهاية" : "End time"}
                  value={end}
                  onChange={setEnd}
                  ar={ar}
                />
              </div>
              <p className="wf-note">
                {ar
                  ? "أوقات النهاية قبل البداية تستمر في اليوم التالي."
                  : "End times before start continue into the next day."}
              </p>
              <Field label={ar ? "تعيين أعضاء الفريق" : "Assign team members"}>
                <Input
                  aria-label={ar ? "بحث الأعضاء" : "Search members"}
                  placeholder={ar ? "ابحث باسم الموظف…" : "Search staff by name…"}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <div className="wf-member-options">
                  {activeMembers
                    .filter((m) => m.name.toLowerCase().includes(search.toLowerCase()))
                    .map((m) => (
                      <button
                        key={m.id}
                        aria-pressed={assigned.includes(m.id)}
                        onClick={() =>
                          setAssigned((ids) =>
                            ids.includes(m.id) ? ids.filter((id) => id !== m.id) : [...ids, m.id],
                          )
                        }
                      >
                        {assigned.includes(m.id) ? (
                          <CheckCircle2 className="size-3.5" />
                        ) : (
                          <Plus className="size-3.5" />
                        )}
                        {m.name}
                      </button>
                    ))}
                </div>
              </Field>
              <Field label={ar ? "ملاحظات (اختياري)" : "Notes (optional)"}>
                <Textarea
                  maxLength={2000}
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </Field>
              {invalidRange || tooLong ? (
                <p role="alert" className="text-xs text-destructive">
                  {ar
                    ? "اختر فترة صالحة لا تتجاوز 366 يوماً."
                    : "Choose a valid date range of at most 366 days."}
                </p>
              ) : null}
            </div>
            <aside className="wf-schedule-preview">
              <h3>{ar ? "معاينة الجدول" : "Schedule preview"}</h3>
              <div className="wf-preview-metrics">
                <span>
                  <strong>{count}</strong>
                  <small>{ar ? "ورديات" : "shifts"}</small>
                </span>
                <span>
                  <strong>{durationH}h</strong>
                  <small>{ar ? "لكل وردية" : "per shift"}</small>
                </span>
                <span>
                  <strong>{count * durationH}h</strong>
                  <small>{ar ? "لكل عضو معيّن" : "per assigned member"}</small>
                </span>
              </div>
              <p>
                <CalendarDays className="size-4" />
                {date}
                {mode === "recurring" ? ` – ${rangeEnd}` : ""}
              </p>
              <p>
                {ar ? "النوع" : "Type"}: {type}
              </p>
              <p>
                <UsersRound className="size-4" />
                {assigned.length} {ar ? "أعضاء معيّنون" : "members assigned"}
              </p>
              <h4>{ar ? "الورديات القادمة" : "Next shifts"}</h4>
              {previewDates.map((d) => (
                <div className="wf-preview-shift" key={d}>
                  <span>
                    {new Date(`${d}T12:00:00`).toLocaleDateString(ar ? "ar-JO" : "en-US", {
                      weekday: "short",
                      month: "short",
                      day: "2-digit",
                    })}
                  </span>
                  <strong>
                    {formatTimeInputForSummary(start, ar)} – {formatTimeInputForSummary(end, ar)}
                    <small>
                      {durationH} {ar ? "ساعات" : "hours"}
                    </small>
                  </strong>
                </div>
              ))}
              <p className="wf-note">
                {mode === "recurring"
                  ? ar
                    ? "يتكرر في أيام العمل المحددة."
                    : "Repeats on selected workdays."
                  : ar
                    ? "ينشئ وردية واحدة فقط."
                    : "Creates one shift only."}
              </p>
            </aside>
          </div>
        </div>
        <DialogFooter className="wf-form-footer">
          <small>
            {count} {ar ? "ورديات" : "shifts"} · {assigned.length}{" "}
            {ar ? "أعضاء الفريق" : "team members"}
          </small>
          <Button variant="outline" disabled={create.isPending} onClick={() => onOpenChange(false)}>
            {ar ? "إلغاء" : "Cancel"}
          </Button>
          <Button disabled={!ready || create.isPending} onClick={() => create.mutate()}>
            {create.isPending
              ? ar
                ? "جارٍ الإنشاء…"
                : "Creating…"
              : mode === "recurring"
                ? ar
                  ? "إنشاء الجدول"
                  : "Create schedule"
                : ar
                  ? "إنشاء الوردية"
                  : "Create shift"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CloseShiftDialog({
  shift,
  openWorkCount,
  restaurantId,
  currentStaffId,
  onClose,
  ar,
  lang,
}: {
  shift: Shift;
  openWorkCount: number;
  restaurantId: string;
  currentStaffId: string;
  onClose: () => void;
  ar: boolean;
  lang: "en" | "ar";
}) {
  const qc = useQueryClient();
  const [summary, setSummary] = useState("");
  const [unresolved, setUnresolved] = useState("");
  const [cash, setCash] = useState("");
  const [inventory, setInventory] = useState("");
  const [targetRole, setTargetRole] = useState<AppRole>("manager");
  const mustHandover = openWorkCount > 0;
  const close = useMutation({
    mutationFn: async () => {
      if (mustHandover || summary.trim())
        await createShiftHandover({
          restaurant_id: restaurantId,
          shift_id: shift.id,
          from_staff_id: currentStaffId,
          to_staff_id: null,
          target_role: targetRole,
          summary: summary.trim() || (ar ? "تسليم نهاية الوردية" : "End-of-shift handover"),
          unresolved_items: unresolved.trim() || null,
          cash_note: cash.trim() || null,
          inventory_note: inventory.trim() || null,
        });
      await closeShift(shift.id, currentStaffId);
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["operations", "shifts", restaurantId] }),
        qc.invalidateQueries({ queryKey: ["operations", "shift-handovers", restaurantId] }),
        qc.invalidateQueries({ queryKey: ["work", restaurantId] }),
      ]);
      toast.success(ar ? "تم إغلاق الوردية وتسليمها" : "Shift closed and handed over");
      onClose();
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });
  const ready = !mustHandover || summary.trim().length >= 3;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle>{ar ? `إغلاق ${shift.name}` : `Close ${shift.name}`}</DialogTitle>
          <DialogDescription>
            {mustHandover
              ? ar
                ? `يوجد ${openWorkCount} عمل غير محلول. يلزم ملخص تسليم قبل الإغلاق.`
                : `${openWorkCount} work items remain unresolved. Add a handover summary before closing.`
              : ar
                ? "يمكن إضافة تسليم اختياري قبل الإغلاق."
                : "You can add an optional handover before closing."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <Field label={ar ? "ملخص التسليم" : "Handover summary"} className="sm:col-span-2">
            <Textarea
              rows={3}
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              placeholder={
                ar ? "ما الذي يجب أن يعرفه الفريق التالي؟" : "What should the next team know?"
              }
            />
          </Field>
          <Field label={ar ? "أعمال غير محلولة" : "Unresolved items"} className="sm:col-span-2">
            <Textarea
              rows={2}
              value={unresolved}
              onChange={(event) => setUnresolved(event.target.value)}
            />
          </Field>
          <Field label={ar ? "ملاحظة الكاش" : "Cash note"}>
            <Input value={cash} onChange={(event) => setCash(event.target.value)} />
          </Field>
          <Field label={ar ? "ملاحظة المخزون" : "Inventory note"}>
            <Input value={inventory} onChange={(event) => setInventory(event.target.value)} />
          </Field>
          <Field label={ar ? "تسليم إلى" : "Handover to"} className="sm:col-span-2">
            <Select value={targetRole} onValueChange={(value) => setTargetRole(value as AppRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HANDOVER_ROLES.map((role) => (
                  <SelectItem key={role} value={role}>
                    {ROLE_LABELS[role][lang]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {ar ? "إلغاء" : "Cancel"}
          </Button>
          <Button disabled={!ready || close.isPending} onClick={() => close.mutate()}>
            {ar ? "إغلاق وتسليم" : "Close & hand over"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label className="text-[10px] font-bold uppercase tracking-[.08em] text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}
function Status({ status, ar }: { status: Shift["status"]; ar: boolean }) {
  const label =
    status === "open"
      ? ar
        ? "مفتوحة"
        : "Open"
      : status === "closed"
        ? ar
          ? "مغلقة"
          : "Closed"
        : ar
          ? "مخططة"
          : "Planned";
  return (
    <span
      className={cn(
        "rounded-full px-2 py-1 text-[10px] font-bold",
        status === "open"
          ? "bg-emerald-500/10 text-emerald-700"
          : status === "closed"
            ? "bg-slate-500/10 text-slate-600"
            : "bg-blue-500/10 text-blue-600",
      )}
    >
      {label}
    </span>
  );
}
function formatWindow(shift: Shift, ar: boolean) {
  const fmt = (value: string | null) =>
    value
      ? new Date(value).toLocaleTimeString(ar ? "ar-JO" : "en-JO", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";
  return `${fmt(shift.planned_start)} – ${fmt(shift.planned_end)}`;
}
function WorkforcePageSkeleton({ ar }: { ar: boolean }) {
  return (
    <div className="min-h-dvh bg-background">
      <AppHeader title={ar ? "القوى العاملة" : "Workforce"} />
      <main
        className="qs-workforce-screen qs-page space-y-4"
        aria-busy="true"
        aria-label={ar ? "جارٍ تحميل القوى العاملة" : "Loading Workforce"}
      >
        <section className="qs-card overflow-hidden p-5 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 flex-1 space-y-3">
              <Skeleton className="h-5 w-36 rounded-full" />
              <Skeleton className="h-9 w-64 max-w-full rounded-xl" />
              <Skeleton className="h-4 w-[460px] max-w-full rounded-lg" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-10 w-28 rounded-xl" />
              <Skeleton className="h-10 w-32 rounded-xl" />
            </div>
          </div>
        </section>
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <article key={index} className="qs-card p-4">
              <div className="flex items-start justify-between">
                <Skeleton className="size-9 rounded-xl" />
                <Skeleton className="h-4 w-14 rounded-full" />
              </div>
              <Skeleton className="mt-5 h-7 w-16 rounded-lg" />
              <Skeleton className="mt-2 h-3 w-24 rounded-lg" />
            </article>
          ))}
        </section>
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,.7fr)]">
          <div className="qs-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-border p-4">
              <div className="space-y-2">
                <Skeleton className="h-5 w-36 rounded-lg" />
                <Skeleton className="h-3 w-48 rounded-lg" />
              </div>
              <Skeleton className="h-8 w-20 rounded-full" />
            </div>
            <div className="space-y-3 p-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="grid grid-cols-[76px_minmax(0,1fr)] gap-3">
                  <Skeleton className="h-14 rounded-xl" />
                  <Skeleton className="h-14 rounded-xl" />
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-4">
            <div className="qs-card p-4">
              <Skeleton className="h-4 w-28 rounded-lg" />
              <Skeleton className="mt-3 h-8 w-20 rounded-lg" />
              <Skeleton className="mt-4 h-2 w-full rounded-full" />
            </div>
            <div className="qs-card p-4">
              <Skeleton className="h-4 w-32 rounded-lg" />
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="mt-3 h-10 w-full rounded-xl" />
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function Denied({ ar }: { ar: boolean }) {
  return (
    <div className="min-h-dvh bg-background">
      <AppHeader />
      <main className="qs-page">
        <section className="qs-card p-8 text-center">
          <CalendarClock className="mx-auto size-10 text-muted-foreground" />
          <h1 className="mt-4 text-xl font-bold">
            {ar ? "الورديات غير متاحة" : "Shifts are not available"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {ar
              ? "هذا الحساب لا يملك وصول مساحة العمل لهذا المطعم."
              : "This account does not have work access for this restaurant."}
          </p>
        </section>
      </main>
    </div>
  );
}
