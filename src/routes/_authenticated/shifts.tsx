import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, CalendarClock, CalendarDays, CheckCircle2, ChevronDown, Clock3, Download, Handshake, List, PlayCircle, Plus, Rows3, StopCircle, TimerReset, Trash2, UserPlus, UsersRound } from "lucide-react";
import { toast } from "sonner";

import { MasterEyebrow, MasterKpi, MasterPageHeader } from "@/components/app/MasterPage";
import { AppHeader } from "@/components/nav/AppHeader";
import { DetailRow, DetailSheet, formatStamp } from "@/components/operations/DetailSheet";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";
import {
  acknowledgeShiftHandover,
  assignStaffToShift,
  closeShift,
  createShift,
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

export const Route = createFileRoute("/_authenticated/shifts")({
  head: () => ({ meta: [{ title: "Shifts & Handover — QuickServe" }, { name: "description", content: "Shift scheduling, attendance and operational handover." }] }),
  component: ShiftsPage,
});

type ShiftView = "timeline" | "list";

const HANDOVER_ROLES: AppRole[] = ["restaurant_admin", "operations_manager", "manager", "kitchen", "waiter", "cashier", "host", "inventory", "procurement", "accountant"];

function ShiftsPage() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const scope = useWorkspaceScope();
  const access = useAccess();
  const rid = scope.restaurantId;
  const membership = rid ? access.membershipFor(rid) : null;
  const canView = Boolean(membership && membershipHasCapability(membership.role, membership.permission_overrides, "view_work"));
  const canManage = Boolean(membership && membershipHasCapability(membership.role, membership.permission_overrides, "manage_shifts"));
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
  const [viewMode, setViewMode] = useState<ShiftView>("timeline");

  if (scope.isPending || access.isPending) return <div className="min-h-dvh bg-background"><AppHeader /><main className="qs-page"><Skeleton className="h-[620px] rounded-3xl" /></main></div>;
  if (!rid || !membership || !canView) return <Denied ar={ar} />;

  const today = new Date().toISOString().slice(0, 10);
  const rows = shifts.data ?? [];
  const todayRows = rows.filter((row) => row.shift_date === today);
  const openShiftRow = rows.find((row) => row.status === "open") ?? null;
  const plannedToday = todayRows.filter((row) => row.status === "planned").length;
  const closedToday = todayRows.filter((row) => row.status === "closed").length;
  const pendingHandovers = (handovers.data ?? []).filter((row) => !row.acknowledged_at).length;
  const attentionAssignments = (assignments.data ?? []).filter((row) => row.status === "late" || row.status === "absent").length;
  const needsAttention = attentionAssignments + pendingHandovers;
  const detailShift = rows.find((row) => row.id === detailShiftId) ?? null;
  const detailAssignments = detailShift ? (assignments.data ?? []).filter((row) => row.shift_id === detailShift.id) : [];
  const detailHandover = detailShift ? (handovers.data ?? []).find((row) => row.shift_id === detailShift.id) ?? null : null;
  const memberName = (staffId: string | null) => (staffId ? (members.data ?? []).find((row) => row.id === staffId)?.name ?? null : null);

  return <div className="min-h-dvh bg-background">
    <AppHeader title={ar ? "الورديات والتسليم" : "Shifts & Handover"} />
    <main className="qs-page qs-compact-page qs-viewport-page">
      <MasterPageHeader
        eyebrow={<MasterEyebrow icon={CalendarClock}>{ar ? "جدول الفريق" : "Team schedule"}</MasterEyebrow>}
        title={ar ? "الورديات والتسليم" : "Shifts & Handover"}
        description={ar ? "جدول واضح للحضور، التغطية، التسليم والإجراءات التي تحتاج تدخل أثناء التشغيل." : "A clear workforce workspace for staffing coverage, attendance, handover and shift-critical actions."}
        actions={<div className="flex flex-wrap items-center gap-2"><div className="inline-grid grid-cols-2 rounded-xl border border-border p-1"><button type="button" onClick={() => setViewMode("timeline")} className={cn("inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-xs font-bold", viewMode === "timeline" ? "bg-foreground text-background" : "text-muted-foreground")}><Rows3 className="size-4" />{ar ? "زمني" : "Timeline"}</button><button type="button" onClick={() => setViewMode("list")} className={cn("inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-xs font-bold", viewMode === "list" ? "bg-foreground text-background" : "text-muted-foreground")}><List className="size-4" />{ar ? "قائمة" : "List"}</button></div>{canManage ? <Button onClick={() => setCreateOpen(true)}><Plus className="size-4" />{ar ? "وردية جديدة" : "New shift"}</Button> : null}</div>}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MasterKpi icon={PlayCircle} label={ar ? "نشطة الآن" : "Active now"} value={openShiftRow ? 1 : 0} tone={openShiftRow ? "green" : "slate"} />
        <MasterKpi icon={Clock3} label={ar ? "قادمة اليوم" : "Upcoming today"} value={plannedToday} tone="blue" />
        <MasterKpi icon={AlertTriangle} label={ar ? "تحتاج انتباه" : "Needs attention"} value={needsAttention} tone={needsAttention > 0 ? "red" : "green"} />
        <MasterKpi icon={CheckCircle2} label={ar ? "مكتملة اليوم" : "Completed today"} value={closedToday} tone="purple" />
      </section>

      <div className="shrink-0"><WorkforcePanel restaurantId={rid} currentStaffId={membership.id} canManage={canManage} members={members.data ?? []} shifts={rows} assignments={assignments.data ?? []} ar={ar} lang={lang} /></div>

      {openShiftRow ? <CurrentShift shift={openShiftRow} assignments={(assignments.data ?? []).filter((row) => row.shift_id === openShiftRow.id)} members={members.data ?? []} canManage={canManage} currentStaffId={membership.id} ar={ar} lang={lang} onClose={() => setClosingShift(openShiftRow)} /> : <section className="qs-card flex items-center gap-4 p-5"><span className="grid size-11 place-items-center rounded-2xl bg-muted text-muted-foreground"><CalendarClock className="size-5" /></span><div><h2 className="font-bold">{ar ? "لا توجد وردية مفتوحة" : "No shift is open"}</h2><p className="mt-1 text-xs text-muted-foreground">{ar ? "يمكن لمدير الوردية فتح وردية مخططة عندما يبدأ التشغيل." : "A shift manager can open a planned shift when service starts."}</p></div></section>}

      <section className="qs-viewport-fill grid min-h-0 gap-2 overflow-hidden xl:grid-cols-[minmax(0,1.65fr)_minmax(260px,.7fr)]">
        <div className="qs-card flex min-h-0 flex-col overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5"><div><h2 className="qs-section-title">{ar ? "الورديات" : "Shift schedule"}</h2><p className="mt-1 text-xs text-muted-foreground">{viewMode === "timeline" ? (ar ? "مرتب حسب الوقت لتشاهد تغطية التشغيل بسرعة." : "Ordered by time so coverage is easy to scan.") : (ar ? "قائمة عملية لكل الورديات والإجراءات." : "A practical list of shifts and actions.")}</p></div><span className="rounded-full bg-muted px-3 py-1.5 text-[10px] font-bold text-muted-foreground">{rows.length} {ar ? "وردية" : "shifts"}</span></div>
          {shifts.isPending ? <div className="p-5"><Skeleton className="h-64 rounded-2xl" /></div> : shifts.isError ? <p className="p-5 text-sm text-destructive">{humanError(shifts.error, lang)}</p> : !rows.length ? <EmptyShifts ar={ar} /> : viewMode === "timeline" ? <div className="qs-scroll-region min-h-0 flex-1"><ShiftTimeline rows={rows.slice(0, 20)} assignments={assignments.data ?? []} canManage={canManage} canDelete={canDelete} currentStaffId={membership.id} ar={ar} lang={lang} onOpen={(shift) => setDetailShiftId(shift.id)} onClose={setClosingShift} onDelete={setDeletingShift} /></div> : <div className="qs-scroll-region min-h-0 flex-1 divide-y divide-border">{rows.slice(0, 20).map((shift) => <ShiftRow key={shift.id} shift={shift} assignments={(assignments.data ?? []).filter((row) => row.shift_id === shift.id)} canManage={canManage} canDelete={canDelete} currentStaffId={membership.id} ar={ar} lang={lang} onOpen={() => setDetailShiftId(shift.id)} onClose={() => setClosingShift(shift)} onDelete={() => setDeletingShift(shift)} />)}</div>}
        </div>

        <div className="qs-card qs-scroll-region min-h-0 overflow-hidden">
          <div className="border-b border-border p-5"><h2 className="qs-section-title">{ar ? "آخر التسليمات" : "Recent handovers"}</h2></div>
          {handovers.isPending ? <div className="p-5"><Skeleton className="h-48 rounded-2xl" /></div> : !(handovers.data ?? []).length ? <div className="p-8 text-center text-xs text-muted-foreground">{ar ? "لا توجد تسليمات بعد." : "No handovers yet."}</div> : <div className="divide-y divide-border">{(handovers.data ?? []).slice(0, 8).map((handover) => <HandoverItem key={handover.id} handover={handover} currentStaffId={membership.id} restaurantId={rid} ar={ar} lang={lang} />)}</div>}
        </div>
      </section>
    </main>

    <DetailSheet
      open={Boolean(detailShift)}
      onOpenChange={(open) => { if (!open) setDetailShiftId(null); }}
      title={detailShift?.name ?? ""}
      description={detailShift ? `${detailShift.shift_date} · ${detailShift.status}` : undefined}
      footer={detailShift && canDelete && detailShift.status !== "open" ? <Button variant="destructive" className="w-full gap-2" onClick={() => setDeletingShift(detailShift)}><Trash2 className="size-4" />{ar ? "حذف الوردية" : "Delete shift"}</Button> : undefined}
    >
      {detailShift ? <div>
        {detailShift.notes ? <p className="mb-4 whitespace-pre-wrap rounded-2xl bg-muted/40 p-3 text-sm leading-6">{detailShift.notes}</p> : null}
        <DetailRow label={ar ? "الحالة" : "Status"} value={<Status status={detailShift.status} ar={ar} />} />
        <DetailRow label={ar ? "التاريخ" : "Date"} value={detailShift.shift_date} />
        <DetailRow label={ar ? "الوقت المخطط" : "Planned window"} value={formatWindow(detailShift, ar)} />
        <DetailRow label={ar ? "فُتحت" : "Opened"} value={formatStamp(detailShift.actual_opened_at, ar)} />
        <DetailRow label={ar ? "أُغلقت" : "Closed"} value={formatStamp(detailShift.actual_closed_at, ar)} />
        <DetailRow label={ar ? "فتح بواسطة" : "Opened by"} value={memberName(detailShift.opened_by_staff_id)} />
        <DetailRow label={ar ? "أغلق بواسطة" : "Closed by"} value={memberName(detailShift.closed_by_staff_id)} />
        <DetailRow label={ar ? "أُنشئت" : "Created"} value={formatStamp(detailShift.created_at, ar)} />
        <DetailRow label={ar ? "آخر تحديث" : "Updated"} value={formatStamp(detailShift.updated_at, ar)} />
        <div className="mt-5">
          <h3 className="text-xs font-bold uppercase tracking-[.08em] text-muted-foreground">{ar ? "أعضاء الوردية" : "Shift team"}</h3>
          <div className="mt-2 space-y-2">{detailAssignments.length ? detailAssignments.map((assignment) => <div key={assignment.id} className="rounded-xl border border-border/70 p-3"><div className="flex items-center justify-between gap-3"><strong className="text-sm">{memberName(assignment.staff_id) ?? (ar ? "عضو فريق" : "Team member")}</strong><span className="rounded-full bg-muted px-2 py-1 text-[10px] font-bold capitalize text-muted-foreground">{assignment.status}</span></div><p className="mt-1 text-xs text-muted-foreground">{assignment.role_snapshot ? ROLE_LABELS[assignment.role_snapshot]?.[lang] ?? assignment.role_snapshot : ""}</p>{assignment.notes ? <p className="mt-2 text-xs leading-5 text-muted-foreground">{assignment.notes}</p> : null}</div>) : <p className="text-xs text-muted-foreground">{ar ? "لا يوجد أعضاء معينون." : "No team members assigned."}</p>}</div>
        </div>
        {detailHandover ? <div className="mt-5 rounded-2xl border border-border/70 p-4"><div className="flex items-center gap-2"><Handshake className="size-4 text-[#e85d2a]" /><strong className="text-sm">{ar ? "تسليم الوردية" : "Shift handover"}</strong></div><p className="mt-2 text-sm leading-6">{detailHandover.summary}</p>{detailHandover.unresolved_items ? <p className="mt-2 text-xs leading-5 text-muted-foreground">{detailHandover.unresolved_items}</p> : null}</div> : null}
      </div> : null}
    </DetailSheet>
    {canManage ? <CreateShiftDialog open={createOpen} onOpenChange={setCreateOpen} restaurantId={rid} ar={ar} lang={lang} /> : null}
    {canManage && closingShift ? <CloseShiftDialog shift={closingShift} openWorkCount={openWork.data ?? 0} restaurantId={rid} currentStaffId={membership.id} onClose={() => setClosingShift(null)} ar={ar} lang={lang} /> : null}
    {canDelete && deletingShift ? <DeleteShiftDialog shift={deletingShift} restaurantId={rid} onClose={() => setDeletingShift(null)} ar={ar} lang={lang} /> : null}
  </div>;
}

type TimeEntry = { id: string; staff_id: string; clock_in: string; clock_out: string | null; break_minutes: number };
type LeaveRequest = { id: string; staff_id: string; start_date: string; end_date: string; start_time?: string | null; end_time?: string | null; reason: string; status: "pending" | "approved" | "rejected" | "cancelled"; created_at: string };
type ClockResult = { action?: string; entry_id?: string; at?: string } | null;

function WorkforcePanel({ restaurantId, currentStaffId, canManage, members, shifts, assignments, ar, lang }: { restaurantId: string; currentStaffId: string; canManage: boolean; members: Array<{ id: string; name: string; role: AppRole; is_active: boolean }>; shifts: Shift[]; assignments: ShiftAssignment[]; ar: boolean; lang: "en" | "ar" }) {
  const qc = useQueryClient();
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveStart, setLeaveStart] = useState(new Date().toISOString().slice(0, 10));
  const [leaveEnd, setLeaveEnd] = useState(new Date().toISOString().slice(0, 10));
  const [leaveStartTime, setLeaveStartTime] = useState("09:00");
  const [leaveEndTime, setLeaveEndTime] = useState("17:00");
  const [leaveReason, setLeaveReason] = useState("");
  const [laborOpen, setLaborOpen] = useState(false);

  const workforce = useQuery({
    queryKey: ["workforce", restaurantId],
    refetchInterval: 20_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 14 * 86400000).toISOString();
      const [timeRes, leaveRes] = await Promise.all([
        supabase.from("staff_time_entries" as any).select("id,staff_id,clock_in,clock_out,break_minutes").eq("restaurant_id", restaurantId).or(`clock_out.is.null,clock_in.gte.${since}`).order("clock_in", { ascending: false }).limit(500),
        supabase.from("staff_leave_requests" as any).select("id,staff_id,start_date,end_date,start_time,end_time,reason,status,created_at").eq("restaurant_id", restaurantId).order("created_at", { ascending: false }).limit(300),
      ]);
      if (timeRes.error) throw timeRes.error;
      if (leaveRes.error) throw leaveRes.error;
      return { time: (timeRes.data ?? []) as unknown as TimeEntry[], leave: (leaveRes.data ?? []) as unknown as LeaveRequest[] };
    },
  });

  const openEntry = (workforce.data?.time ?? []).find((entry) => entry.staff_id === currentStaffId && !entry.clock_out) ?? null;
  const clockedIn = (workforce.data?.time ?? []).filter((entry) => !entry.clock_out);
  const pendingLeave = (workforce.data?.leave ?? []).filter((request) => request.status === "pending");
  const todayKey = new Date().toLocaleDateString("en-CA");
  const todayMinutes = (workforce.data?.time ?? []).filter((entry) => entry.clock_in.slice(0,10) === todayKey).reduce((sum, entry) => {
    const end = entry.clock_out ? new Date(entry.clock_out).getTime() : Date.now();
    return sum + Math.max(0, (end - new Date(entry.clock_in).getTime()) / 60000 - Number(entry.break_minutes || 0));
  }, 0);

  const toggleClock = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("toggle_time_clock", { _restaurant_id: restaurantId });
      if (error) throw error;
      return (Array.isArray(data) ? data[0] : data) as ClockResult;
    },
    onSuccess: async (result) => {
      // The RPC is authoritative, but the list query can take a moment to reflect
      // the write. Apply its returned event to the active cache first so the
      // control changes from Clock in to Clock out (and back) immediately.
      const action = result?.action?.toLowerCase();
      const at = result?.at ?? new Date().toISOString();
      const entryId = result?.entry_id;
      qc.setQueryData<{ time: TimeEntry[]; leave: LeaveRequest[] }>(["workforce", restaurantId], (current) => {
        if (!current || !action) return current;
        if (action === "clocked_in") {
          if (!entryId || current.time.some((entry) => entry.id === entryId)) return current;
          return { ...current, time: [{ id: entryId, staff_id: currentStaffId, clock_in: at, clock_out: null, break_minutes: 0 }, ...current.time] };
        }
        if (action === "clocked_out") {
          const target = entryId
            ? current.time.find((entry) => entry.id === entryId)
            : current.time.find((entry) => entry.staff_id === currentStaffId && !entry.clock_out);
          if (!target || target.clock_out) return current;
          return { ...current, time: current.time.map((entry) => entry.id === target.id ? { ...entry, clock_out: at } : entry) };
        }
        return current;
      });
      await qc.invalidateQueries({ queryKey: ["workforce", restaurantId] });
      const clockedOut = result?.action === "clocked_out" || action === "clocked_out";
      toast.success(clockedOut ? (ar ? "تم تسجيل الانصراف" : "Clocked out") : (ar ? "تم تسجيل الحضور" : "Clocked in"));
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  const submitLeave = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).rpc("submit_leave_request", { _restaurant_id: restaurantId, _start: leaveStart, _end: leaveEnd, _start_time: leaveStartTime, _end_time: leaveEndTime, _reason: leaveReason.trim() });
      if (error) throw error;
    },
    onSuccess: async () => {
      setLeaveOpen(false); setLeaveReason("");
      await qc.invalidateQueries({ queryKey: ["workforce", restaurantId] });
      toast.success(ar ? "تم إرسال طلب الإجازة" : "Leave request submitted");
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  const reviewLeave = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" }) => {
      const { error } = await (supabase as any).rpc("review_leave_request", { _request_id: id, _status: status });
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["workforce", restaurantId] });
      toast.success(ar ? "تم تحديث طلب الإجازة" : "Leave request updated");
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  const memberName = (id: string) => members.find((row) => row.id === id)?.name ?? (ar ? "عضو فريق" : "Team member");
  const leaveWindowInvalid = !leaveStart || !leaveEnd || !leaveStartTime || !leaveEndTime || leaveEnd < leaveStart || (leaveEnd === leaveStart && leaveEndTime <= leaveStartTime);

  const weekStart = startOfWeekMonday(new Date());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const thisWeekEntries = (workforce.data?.time ?? []).filter((entry) => {
    const clock = new Date(entry.clock_in).getTime();
    return clock >= weekStart.getTime() && clock < weekEnd.getTime();
  });
  const staffLabor = members.filter((member) => member.is_active).map((member) => {
    const actualHours = thisWeekEntries.filter((entry) => entry.staff_id === member.id).reduce((sum, entry) => {
      const end = entry.clock_out ? Math.min(new Date(entry.clock_out).getTime(), weekEnd.getTime()) : Math.min(Date.now(), weekEnd.getTime());
      const start = Math.max(new Date(entry.clock_in).getTime(), weekStart.getTime());
      return sum + Math.max(0, (end - start) / 3_600_000 - Number(entry.break_minutes || 0) / 60);
    }, 0);
    const scheduledHours = assignments.filter((assignment) => {
      if (assignment.staff_id !== member.id || !assignment.starts_at || !assignment.ends_at) return false;
      const start = new Date(assignment.starts_at).getTime();
      return start >= weekStart.getTime() && start < weekEnd.getTime();
    }).reduce((sum, assignment) => {
      const start = new Date(assignment.starts_at!).getTime();
      const end = new Date(assignment.ends_at!).getTime();
      return sum + Math.max(0, (end - start) / 3_600_000);
    }, 0);
    return { ...member, actualHours, scheduledHours, variance: actualHours - scheduledHours };
  }).filter((member) => member.actualHours > 0 || member.scheduledHours > 0);

  const actualWeekHours = staffLabor.reduce((sum, row) => sum + row.actualHours, 0);
  const scheduledWeekHours = staffLabor.reduce((sum, row) => sum + row.scheduledHours, 0);
  const overPlan = staffLabor.filter((row) => row.scheduledHours > 0 && row.actualHours > row.scheduledHours + 0.25);
  const incompleteClocks = thisWeekEntries.filter((entry) => !entry.clock_out).length;

  function exportPayrollCsv() {
    const headers = ["Staff","Role","Week start","Scheduled hours","Worked hours","Variance hours"];
    const lines = staffLabor.map((row) => [
      row.name,
      ROLE_LABELS[row.role]?.en ?? row.role,
      weekStart.toLocaleDateString("en-CA"),
      row.scheduledHours.toFixed(2),
      row.actualHours.toFixed(2),
      row.variance.toFixed(2),
    ].map(csvCell).join(","));
    const blob = new Blob(["\uFEFF" + [headers.map(csvCell).join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `quickserve-payroll-${weekStart.toLocaleDateString("en-CA")}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return <section className="space-y-4">
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,.8fr)]">
    <div className="qs-card overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="qs-section-title">{ar ? "الحضور والوقت" : "Attendance & time"}</h2><p className="mt-1 text-xs text-muted-foreground">{ar ? "ساعة حضور فعلية مرتبطة بحساب كل موظف." : "A real time clock tied to each staff account."}</p></div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto"><Button variant="outline" onClick={() => setLeaveOpen(true)}><CalendarDays className="size-4"/>{ar ? "طلب إجازة" : "Request leave"}</Button><Button className="min-w-[132px]" variant={openEntry ? "destructive" : "default"} aria-busy={toggleClock.isPending} aria-pressed={Boolean(openEntry)} onClick={() => toggleClock.mutate()} disabled={toggleClock.isPending}>{openEntry ? <StopCircle className="size-4"/> : <TimerReset className="size-4"/>}{toggleClock.isPending ? (ar ? "جارٍ التحديث…" : "Updating…") : openEntry ? (ar ? "انصراف" : "Clock out") : (ar ? "حضور" : "Clock in")}</Button></div>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-3">
        <div className="rounded-xl bg-muted/45 p-3" aria-live="polite"><p className="text-[10px] font-bold uppercase tracking-[.08em] text-muted-foreground">{ar ? "حالتي" : "My status"}</p><strong className="mt-1 block text-sm">{openEntry ? (ar ? "على رأس العمل" : "Clocked in") : (ar ? "خارج الوردية" : "Clocked out")}</strong>{openEntry ? <p className="mt-1 text-[10px] text-muted-foreground">{formatStamp(openEntry.clock_in, ar)}</p> : null}</div>
        <div className="rounded-xl bg-muted/45 p-3"><p className="text-[10px] font-bold uppercase tracking-[.08em] text-muted-foreground">{ar ? "ساعات اليوم" : "Hours today"}</p><strong className="mt-1 block text-sm">{(todayMinutes/60).toFixed(1)}h</strong></div>
        <div className="rounded-xl bg-muted/45 p-3"><p className="text-[10px] font-bold uppercase tracking-[.08em] text-muted-foreground">{ar ? "حاضرون الآن" : "Clocked in now"}</p><strong className="mt-1 block text-sm">{clockedIn.length}</strong></div>
      </div>
      {canManage && clockedIn.length ? <div className="border-t border-border p-4"><p className="mb-2 text-[10px] font-bold uppercase tracking-[.08em] text-muted-foreground">{ar ? "الفريق الموجود الآن" : "Team on the clock"}</p><div className="flex flex-wrap gap-2">{clockedIn.slice(0,12).map(entry=><span key={entry.id} className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold">{memberName(entry.staff_id)} · {new Date(entry.clock_in).toLocaleTimeString(ar?"ar-JO":"en-JO",{hour:"2-digit",minute:"2-digit"})}</span>)}</div></div> : null}
    </div>

    <div className="qs-card overflow-hidden">
      <div className="border-b border-border p-5"><div className="flex items-center justify-between gap-3"><div><h2 className="qs-section-title">{ar ? "طلبات الإجازة" : "Leave requests"}</h2><p className="mt-1 text-xs text-muted-foreground">{canManage ? (ar ? "راجع الطلبات المعلقة." : "Review pending requests.") : (ar ? "آخر طلباتك." : "Your recent requests.")}</p></div>{pendingLeave.length ? <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold text-amber-700">{pendingLeave.length}</span> : null}</div></div>
      <div className="max-h-[260px] divide-y divide-border overflow-y-auto">{(workforce.data?.leave ?? []).filter(request => canManage || request.staff_id===currentStaffId).slice(0,8).map(request=><div key={request.id} className="p-4"><div className="flex items-start justify-between gap-3"><div><strong className="text-sm">{memberName(request.staff_id)}</strong><p className="mt-1 text-xs text-muted-foreground">{request.start_date} · {formatLeaveTime(request.start_time)} → {request.end_date} · {formatLeaveTime(request.end_time)}</p>{request.reason?<p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{request.reason}</p>:null}</div><span className={cn("rounded-full px-2 py-1 text-[9px] font-bold capitalize",request.status==="approved"?"bg-emerald-500/10 text-emerald-700":request.status==="rejected"?"bg-red-500/10 text-red-700":"bg-amber-500/10 text-amber-700")}>{request.status}</span></div>{canManage&&request.status==="pending"?<div className="mt-3 flex gap-2"><Button size="sm" disabled={reviewLeave.isPending} onClick={()=>reviewLeave.mutate({id:request.id,status:"approved"})}>{ar?"اعتماد":"Approve"}</Button><Button size="sm" variant="outline" disabled={reviewLeave.isPending} onClick={()=>reviewLeave.mutate({id:request.id,status:"rejected"})}>{ar?"رفض":"Reject"}</Button></div>:null}</div>)}{!(workforce.data?.leave ?? []).length?<p className="p-6 text-center text-xs text-muted-foreground">{ar ? "لا توجد طلبات إجازة." : "No leave requests yet."}</p>:null}</div>
    </div>
    </div>

    {canManage ? <section className="qs-card overflow-hidden">
      <button type="button" aria-expanded={laborOpen} onClick={() => setLaborOpen((open) => !open)} className="flex w-full flex-col gap-4 p-5 text-start lg:flex-row lg:items-center lg:justify-between">
        <div><div className="flex items-center gap-2"><CalendarClock className="size-4 text-[#e85d2a]"/><h2 className="qs-section-title">{ar ? "العمالة هذا الأسبوع" : "Weekly labor control"}</h2></div><p className="mt-1 text-xs text-muted-foreground">{ar ? "مقارنة ساعات الجدول مع الحضور الفعلي. افتح التفاصيل عند الحاجة." : "Scheduled hours versus actual time-clock hours. Open details when needed."}</p></div>
        <span className="flex items-center gap-3"><span className="grid grid-cols-2 gap-2 sm:grid-cols-4"><LaborMetric label={ar ? "مخطط" : "Scheduled"} value={scheduledWeekHours.toFixed(1) + "h"} /><LaborMetric label={ar ? "فعلي" : "Worked"} value={actualWeekHours.toFixed(1) + "h"} /><LaborMetric label={ar ? "فوق الخطة" : "Over plan"} value={String(overPlan.length)} warning={overPlan.length > 0} /><LaborMetric label={ar ? "دوام مفتوح" : "Open clocks"} value={String(incompleteClocks)} warning={incompleteClocks > 0} /></span><ChevronDown className={cn("size-5 shrink-0 text-muted-foreground transition-transform", laborOpen && "rotate-180")} /></span>
      </button>
      {laborOpen ? <div className="border-t border-border">
        <div className="flex justify-end border-b border-border p-4"><Button variant="outline" disabled={!staffLabor.length} onClick={exportPayrollCsv}><Download className="size-4"/>{ar ? "تصدير CSV للرواتب" : "Export payroll CSV"}</Button></div>
        {staffLabor.length ? <div className="overflow-x-auto"><table className="qs-table min-w-[760px]"><thead><tr><th>{ar ? "الموظف" : "Staff"}</th><th>{ar ? "الدور" : "Role"}</th><th>{ar ? "مخطط" : "Scheduled"}</th><th>{ar ? "فعلي" : "Worked"}</th><th>{ar ? "الفرق" : "Variance"}</th><th>{ar ? "الحالة" : "Status"}</th></tr></thead><tbody>{[...staffLabor].sort((a,b)=>b.actualHours-a.actualHours).map(row=><tr key={row.id}><td><strong>{row.name}</strong></td><td>{ROLE_LABELS[row.role]?.[lang] ?? row.role}</td><td>{row.scheduledHours.toFixed(1)}h</td><td>{row.actualHours.toFixed(1)}h</td><td className={cn(row.variance>0.25?"text-amber-700":row.variance<-0.25?"text-blue-700":"text-muted-foreground")}>{row.variance>=0?"+":""}{row.variance.toFixed(1)}h</td><td><span className={cn("rounded-full px-2 py-1 text-[9px] font-bold",row.scheduledHours>0&&row.actualHours>row.scheduledHours+0.25?"bg-amber-500/10 text-amber-700":"bg-emerald-500/10 text-emerald-700")}>{row.scheduledHours>0&&row.actualHours>row.scheduledHours+0.25?(ar?"فوق الخطة":"Over plan"):(ar?"ضمن الخطة":"On plan")}</span></td></tr>)}</tbody></table></div> : <p className="p-6 text-center text-xs text-muted-foreground">{ar ? "لا توجد ساعات مجدولة أو مسجلة لهذا الأسبوع بعد." : "No scheduled or worked hours recorded for this week yet."}</p>}
      </div> : null}
    </section> : null}

    <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-none gap-0 overflow-hidden p-0 sm:max-w-[560px]">
        <div className="border-b border-border bg-muted/15 px-4 py-3.5 sm:px-4">
          <DialogHeader className="space-y-1.5">
            <DialogTitle className="font-display text-base font-bold sm:text-lg">{ar ? "طلب إجازة" : "Request leave"}</DialogTitle>
            <DialogDescription className="max-w-2xl text-[10px] leading-4">
              {ar ? "حدد بداية ونهاية الإجازة بوضوح، ثم أضف السبب وأرسل الطلب للمراجعة." : "Set the leave start and end clearly, add the reason, then send it for review."}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-3 px-4 py-3.5">
          <section className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="grid gap-0 divide-y divide-border">
              <div className="grid min-w-0 gap-2 p-3 sm:grid-cols-[58px_minmax(0,1.1fr)_minmax(0,.9fr)] sm:items-end">
                <div className="flex items-center gap-2 self-center text-xs font-black uppercase tracking-[.08em] text-muted-foreground sm:pb-3">
                  <span className="grid size-7 place-items-center rounded-[8px] bg-orange-500/10 text-[#e85d2a]"><CalendarDays className="size-4"/></span>
                  <span>{ar ? "من" : "From"}</span>
                </div>
                <Field label={ar ? "التاريخ" : "Date"} className="min-w-0">
                  <Input
                    type="date"
                    value={leaveStart}
                    onChange={e=>{const next=e.target.value;setLeaveStart(next);if(leaveEnd<next)setLeaveEnd(next);}}
                    onClick={e=>(e.currentTarget as HTMLInputElement & {showPicker?:()=>void}).showPicker?.()}
                    className="h-9 min-w-0 w-full cursor-pointer rounded-[9px] px-2.5 text-xs font-semibold"
                  />
                </Field>
                <Field label={ar ? "الوقت" : "Time"} className="min-w-0">
                  <Input
                    type="time"
                    value={leaveStartTime}
                    onChange={e=>setLeaveStartTime(e.target.value)}
                    onClick={e=>(e.currentTarget as HTMLInputElement & {showPicker?:()=>void}).showPicker?.()}
                    className="h-9 min-w-0 w-full cursor-pointer rounded-[9px] px-2.5 text-xs font-semibold"
                  />
                </Field>
              </div>

              <div className="grid min-w-0 gap-2 p-3 sm:grid-cols-[58px_minmax(0,1.1fr)_minmax(0,.9fr)] sm:items-end">
                <div className="flex items-center gap-2 self-center text-xs font-black uppercase tracking-[.08em] text-muted-foreground sm:pb-3">
                  <span className="grid size-7 place-items-center rounded-[8px] bg-blue-500/10 text-blue-600"><Clock3 className="size-4"/></span>
                  <span>{ar ? "إلى" : "To"}</span>
                </div>
                <Field label={ar ? "التاريخ" : "Date"} className="min-w-0">
                  <Input
                    type="date"
                    min={leaveStart}
                    value={leaveEnd}
                    onChange={e=>setLeaveEnd(e.target.value)}
                    onClick={e=>(e.currentTarget as HTMLInputElement & {showPicker?:()=>void}).showPicker?.()}
                    className="h-9 min-w-0 w-full cursor-pointer rounded-[9px] px-2.5 text-xs font-semibold"
                  />
                </Field>
                <Field label={ar ? "الوقت" : "Time"} className="min-w-0">
                  <Input
                    type="time"
                    min={leaveEnd===leaveStart?leaveStartTime:undefined}
                    value={leaveEndTime}
                    onChange={e=>setLeaveEndTime(e.target.value)}
                    onClick={e=>(e.currentTarget as HTMLInputElement & {showPicker?:()=>void}).showPicker?.()}
                    className="h-9 min-w-0 w-full cursor-pointer rounded-[9px] px-2.5 text-xs font-semibold"
                  />
                </Field>
              </div>
            </div>
          </section>

          {leaveWindowInvalid && leaveStart && leaveEnd && leaveStartTime && leaveEndTime ? (
            <p className="rounded-xl border border-red-200 bg-red-500/8 px-3.5 py-2.5 text-xs font-semibold text-red-700 dark:border-red-900/50 dark:text-red-300">
              {ar ? "يجب أن يكون وقت النهاية بعد وقت البداية." : "End date and time must be after the start."}
            </p>
          ) : null}

          <Field label={ar ? "السبب" : "Reason"} className="min-w-0">
            <Textarea
              rows={4}
              value={leaveReason}
              onChange={e=>setLeaveReason(e.target.value)}
              placeholder={ar ? "اكتب سبب الإجازة باختصار..." : "Briefly explain the reason for leave..."}
              className="min-h-[72px] w-full resize-y rounded-[9px]"
            />
          </Field>
        </div>

        <DialogFooter className="border-t border-border bg-muted/10 px-4 py-3">
          <Button variant="outline" className="min-w-20" onClick={()=>setLeaveOpen(false)}>{ar ? "إلغاء" : "Cancel"}</Button>
          <Button className="min-w-24" disabled={submitLeave.isPending||leaveWindowInvalid} onClick={()=>submitLeave.mutate()}>
            {submitLeave.isPending ? (ar ? "جارٍ الإرسال…" : "Submitting…") : (ar ? "إرسال الطلب" : "Submit request")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}

function formatLeaveTime(value: string | null | undefined) { return value ? value.slice(0, 5) : "—"; }

function LaborMetric({label,value,warning=false}:{label:string;value:string;warning?:boolean}){
  return <span className="block min-w-20 rounded-xl bg-muted/45 p-3"><span className="block text-[9px] font-bold uppercase tracking-[.06em] text-muted-foreground">{label}</span><strong className={cn("mt-1 block font-display text-lg",warning&&"text-amber-700")}>{value}</strong></span>;
}

function startOfWeekMonday(date:Date){
  const result=new Date(date);
  result.setHours(0,0,0,0);
  const day=result.getDay();
  result.setDate(result.getDate()-(day===0?6:day-1));
  return result;
}

function csvCell(value:unknown){
  return `"${String(value??"").replaceAll('"','""')}"`;
}

function CurrentShift({ shift, assignments, members, canManage, currentStaffId, ar, lang, onClose }: { shift: Shift; assignments: ShiftAssignment[]; members: Array<{ id: string; name: string; role: AppRole; is_active: boolean }>; canManage: boolean; currentStaffId: string; ar: boolean; lang: "en" | "ar"; onClose: () => void }) {
  const qc = useQueryClient();
  const [memberId, setMemberId] = useState("");
  const assign = useMutation({ mutationFn: async () => { const member = members.find((row) => row.id === memberId); if (!member) return; await assignStaffToShift({ restaurant_id: shift.restaurant_id, shift_id: shift.id, staff_id: member.id, role_snapshot: member.role, starts_at: shift.planned_start, ends_at: shift.planned_end }); }, onSuccess: async () => { setMemberId(""); await qc.invalidateQueries({ queryKey: ["operations", "shift-assignments", shift.restaurant_id] }); toast.success(ar ? "تمت إضافة الموظف للوردية" : "Team member assigned"); }, onError: (error) => toast.error(humanError(error, lang)) });
  const assignedIds = new Set(assignments.map((row) => row.staff_id));
  const available = members.filter((row) => row.is_active && !assignedIds.has(row.id));

  return <section className="qs-card overflow-hidden border-orange-200/80 bg-card dark:border-orange-900/50">
    <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center sm:p-6"><div><div className="flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.08em] text-emerald-700"><span className="size-1.5 rounded-full bg-emerald-500" />{ar ? "مفتوحة الآن" : "Open now"}</span><span className="text-xs text-muted-foreground">{shift.shift_date}</span></div><h2 className="mt-3 font-display text-2xl font-bold tracking-[-.03em]">{shift.name}</h2><p className="mt-1 text-xs text-muted-foreground">{ar ? `${assignments.length} أعضاء في هذه الوردية` : `${assignments.length} team members on this shift`}</p></div>{canManage ? <Button variant="outline" className="gap-2" onClick={onClose}><StopCircle className="size-4" />{ar ? "إغلاق الوردية" : "Close shift"}</Button> : null}</div>
    <div className="border-t border-border/70 p-5"><div className="flex flex-wrap gap-2">{assignments.map((assignment) => { const member = members.find((row) => row.id === assignment.staff_id); return <AssignmentChip key={assignment.id} assignment={assignment} name={member?.name ?? (assignment.staff_id === currentStaffId ? (ar ? "أنت" : "You") : (ar ? "عضو فريق" : "Team member"))} canManage={canManage} isSelf={assignment.staff_id === currentStaffId} restaurantId={shift.restaurant_id} ar={ar} lang={lang} />; })}{!assignments.length ? <span className="text-xs text-muted-foreground">{ar ? "لم تتم إضافة فريق بعد." : "No team members assigned yet."}</span> : null}</div>{canManage && available.length ? <div className="mt-4 flex max-w-xl flex-col gap-2 sm:flex-row"><Select value={memberId} onValueChange={setMemberId}><SelectTrigger className="flex-1"><SelectValue placeholder={ar ? "اختر موظفاً" : "Choose a team member"} /></SelectTrigger><SelectContent>{available.map((member) => <SelectItem key={member.id} value={member.id}>{member.name} · {ROLE_LABELS[member.role]?.[lang] ?? member.role}</SelectItem>)}</SelectContent></Select><Button disabled={!memberId || assign.isPending} onClick={() => assign.mutate()} className="gap-2"><UserPlus className="size-4" />{ar ? "إضافة" : "Assign"}</Button></div> : null}</div>
  </section>;
}

function ShiftTimeline({ rows, assignments, canManage, canDelete, currentStaffId, ar, lang, onOpen, onClose, onDelete }: { rows: Shift[]; assignments: ShiftAssignment[]; canManage: boolean; canDelete: boolean; currentStaffId: string; ar: boolean; lang: "en" | "ar"; onOpen: (shift: Shift) => void; onClose: (shift: Shift) => void; onDelete: (shift: Shift) => void }) {
  const sorted = [...rows].sort((a, b) => {
    const ad = a.planned_start ? new Date(a.planned_start).getTime() : new Date(a.shift_date).getTime();
    const bd = b.planned_start ? new Date(b.planned_start).getTime() : new Date(b.shift_date).getTime();
    return ad - bd;
  });
  return <div className="p-4 sm:p-5"><div className="relative space-y-3 before:absolute before:bottom-4 before:start-[45px] before:top-4 before:w-px before:bg-border sm:before:start-[58px]">{sorted.map((shift) => <div key={shift.id} className="relative grid grid-cols-[76px_minmax(0,1fr)] gap-3 sm:grid-cols-[104px_minmax(0,1fr)]"><div className="relative z-10 pt-4 text-end"><span className="inline-block rounded-lg bg-card px-1.5 text-[10px] font-bold text-muted-foreground">{shift.planned_start ? new Date(shift.planned_start).toLocaleTimeString(ar ? "ar-JO" : "en-JO", { hour: "2-digit", minute: "2-digit" }) : shift.shift_date}</span><span className={cn("ms-auto mt-2 block size-2.5 rounded-full ring-4 ring-card", shift.status === "open" ? "bg-emerald-500" : shift.status === "closed" ? "bg-slate-400" : "bg-[#e85d2a]")} /></div><div className="overflow-hidden rounded-2xl border border-border bg-card"><ShiftRow shift={shift} assignments={assignments.filter((row) => row.shift_id === shift.id)} canManage={canManage} canDelete={canDelete} currentStaffId={currentStaffId} ar={ar} lang={lang} onOpen={() => onOpen(shift)} onClose={() => onClose(shift)} onDelete={() => onDelete(shift)} /></div></div>)}</div></div>;
}

function ShiftRow({ shift, assignments, canManage, canDelete, currentStaffId, ar, lang, onOpen, onClose, onDelete }: { shift: Shift; assignments: ShiftAssignment[]; canManage: boolean; canDelete: boolean; currentStaffId: string; ar: boolean; lang: "en" | "ar"; onOpen: () => void; onClose: () => void; onDelete: () => void }) {
  const qc = useQueryClient();
  const open = useMutation({ mutationFn: () => openShift(shift.id, currentStaffId), onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["operations", "shifts", shift.restaurant_id] }); await qc.invalidateQueries({ queryKey: ["operations", "automated-alerts", shift.restaurant_id] }); toast.success(ar ? "تم فتح الوردية" : "Shift opened"); }, onError: (error) => toast.error(humanError(error, lang)) });
  const self = assignments.find((row) => row.staff_id === currentStaffId) ?? null;
  return <article role="button" tabIndex={0} onClick={onOpen} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(); } }} className="grid cursor-pointer gap-4 p-4 outline-none transition hover:bg-muted/20 focus-visible:ring-2 focus-visible:ring-[#e85d2a] sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold">{shift.name}</h3><Status status={shift.status} ar={ar} />{self ? <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-bold capitalize text-muted-foreground">{self.status}</span> : null}</div>{shift.notes ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{shift.notes}</p> : null}<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground"><span>{shift.shift_date}</span><span>{formatWindow(shift, ar)}</span><span className="inline-flex items-center gap-1"><UsersRound className="size-3" />{assignments.length}</span></div></div><div className="flex flex-wrap items-center gap-2" onClick={(event) => event.stopPropagation()}>{self && !canManage && shift.status === "open" ? <SelfShiftControls assignment={self} restaurantId={shift.restaurant_id} ar={ar} lang={lang} /> : null}{canManage ? <>{shift.status === "planned" ? <Button size="sm" disabled={open.isPending} onClick={() => open.mutate()} className="gap-2"><PlayCircle className="size-4" />{ar ? "فتح" : "Open"}</Button> : null}{shift.status === "open" ? <Button size="sm" variant="outline" onClick={onClose}>{ar ? "إغلاق" : "Close"}</Button> : null}{canDelete && shift.status !== "open" ? <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={onDelete}><Trash2 className="size-4" />{ar ? "حذف" : "Delete"}</Button> : null}</> : null}</div></article>;
}

function AssignmentChip({ assignment, name, canManage, isSelf, restaurantId, ar, lang }: { assignment: ShiftAssignment; name: string; canManage: boolean; isSelf: boolean; restaurantId: string; ar: boolean; lang: "en" | "ar" }) {
  const qc = useQueryClient();
  const update = useMutation({ mutationFn: (status: ShiftAssignmentStatus) => updateShiftAssignment(assignment.id, { status }), onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["operations", "shift-assignments", restaurantId] }); }, onError: (error) => toast.error(humanError(error, lang)) });
  const remove = useMutation({ mutationFn: () => removeShiftAssignment(assignment.id), onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["operations", "shift-assignments", restaurantId] }); }, onError: (error) => toast.error(humanError(error, lang)) });
  if (!canManage) return <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card p-1 ps-3"><span className="text-xs font-semibold">{name}</span><span className="rounded-full bg-muted px-2 py-1 text-[10px] font-bold capitalize text-muted-foreground">{assignment.status}</span>{isSelf ? <SelfShiftControls assignment={assignment} restaurantId={restaurantId} ar={ar} lang={lang} compact /> : null}</div>;
  return <div className="inline-flex items-center gap-1 rounded-full border border-border bg-card p-1 ps-3"><span className="text-xs font-semibold">{name}</span><Select value={assignment.status} onValueChange={(value) => update.mutate(value as ShiftAssignmentStatus)}><SelectTrigger className="h-7 w-[112px] border-0 bg-transparent px-2 text-[10px] shadow-none"><SelectValue /></SelectTrigger><SelectContent>{(["scheduled","present","late","absent","released"] as ShiftAssignmentStatus[]).map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent></Select><button type="button" onClick={() => remove.mutate()} className="rounded-full px-2 py-1 text-[10px] text-muted-foreground hover:text-destructive" aria-label={ar ? "إزالة" : "Remove"}>×</button></div>;
}

function SelfShiftControls({ assignment, restaurantId, ar, lang, compact = false }: { assignment: ShiftAssignment; restaurantId: string; ar: boolean; lang: "en" | "ar"; compact?: boolean }) {
  const qc = useQueryClient();
  const update = useMutation({ mutationFn: (status: "present" | "released") => updateOwnShiftAssignmentStatus(assignment.id, status), onSuccess: async (_data, status) => { await qc.invalidateQueries({ queryKey: ["operations", "shift-assignments", restaurantId] }); toast.success(status === "present" ? (ar ? "تم بدء الوردية" : "Shift started") : (ar ? "تم إنهاء الوردية" : "Shift ended")); }, onError: (error) => toast.error(humanError(error, lang)) });
  if (assignment.status === "released") return <span className="px-2 text-[10px] font-bold text-muted-foreground">{ar ? "تم الانتهاء" : "Ended"}</span>;
  const present = assignment.status === "present";
  return <Button size="sm" variant={present ? "outline" : "default"} className={compact ? "h-7 rounded-full px-2 text-[10px]" : "h-9"} disabled={update.isPending} onClick={() => update.mutate(present ? "released" : "present")}>{present ? (ar ? "إنهاء ورديتي" : "End my shift") : (ar ? "بدء ورديتي" : "Start my shift")}</Button>;
}

function HandoverItem({ handover, currentStaffId, restaurantId, ar, lang }: { handover: ShiftHandover; currentStaffId: string; restaurantId: string; ar: boolean; lang: "en" | "ar" }) {
  const qc = useQueryClient();
  const acknowledge = useMutation({ mutationFn: () => acknowledgeShiftHandover(handover.id, currentStaffId), onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["operations", "shift-handovers", restaurantId] }); toast.success(ar ? "تم استلام التسليم" : "Handover acknowledged"); }, onError: (error) => toast.error(humanError(error, lang)) });
  return <div className="p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Handshake className="size-4 text-[#e85d2a]" /><strong className="text-sm">{handover.summary}</strong></div>{handover.unresolved_items ? <p className="mt-2 text-xs leading-5 text-muted-foreground">{handover.unresolved_items}</p> : null}</div>{!handover.acknowledged_at ? <Button size="sm" variant="outline" disabled={acknowledge.isPending} onClick={() => acknowledge.mutate()}>{ar ? "استلام" : "Acknowledge"}</Button> : null}</div><div className="mt-2 flex justify-between gap-2 text-[10px] text-muted-foreground"><span>{handover.target_role ? ROLE_LABELS[handover.target_role]?.[lang] ?? handover.target_role : (ar ? "موظف محدد" : "Specific teammate")}</span><span>{handover.acknowledged_at ? (ar ? "تم الاستلام" : "Acknowledged") : (ar ? "بانتظار الاستلام" : "Pending")}</span></div></div>;
}

function DeleteShiftDialog({ shift, restaurantId, onClose, ar, lang }: { shift: Shift; restaurantId: string; onClose: () => void; ar: boolean; lang: "en" | "ar" }) {
  const qc = useQueryClient();
  const remove = useMutation({ mutationFn: () => deleteShift(shift.id), onSuccess: async () => { await Promise.all([qc.invalidateQueries({ queryKey: ["operations", "shifts", restaurantId] }), qc.invalidateQueries({ queryKey: ["operations", "shift-assignments", restaurantId] }), qc.invalidateQueries({ queryKey: ["operations", "shift-handovers", restaurantId] })]); toast.success(ar ? "تم حذف الوردية" : "Shift deleted"); onClose(); }, onError: (error) => toast.error(humanError(error, lang)) });
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent className="sm:max-w-[460px]"><DialogHeader><DialogTitle>{ar ? "حذف الوردية؟" : "Delete shift?"}</DialogTitle><DialogDescription>{ar ? `سيتم حذف ${shift.name} وتعيينات الفريق المرتبطة بها. تبقى سجلات التسليم محفوظة بدون ربط بالوردية.` : `This removes ${shift.name} and its team assignments. Existing handover records are preserved but detached from the deleted shift.`}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={onClose}>{ar ? "إلغاء" : "Cancel"}</Button><Button variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate()}><Trash2 className="size-4" />{ar ? "حذف الوردية" : "Delete shift"}</Button></DialogFooter></DialogContent></Dialog>;
}

function CreateShiftDialog({ open, onOpenChange, restaurantId, ar, lang }: { open: boolean; onOpenChange: (open: boolean) => void; restaurantId: string; ar: boolean; lang: "en" | "ar" }) {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [name, setName] = useState(ar ? "وردية اليوم" : "Service shift");
  const [date, setDate] = useState(today);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");
  const [notes, setNotes] = useState("");
  const create = useMutation({ mutationFn: () => createShift({ restaurant_id: restaurantId, name: name.trim(), shift_date: date, planned_start: start ? `${date}T${start}:00` : null, planned_end: end ? `${date}T${end}:00` : null, notes: notes.trim() || null }), onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["operations", "shifts", restaurantId] }); toast.success(ar ? "تم إنشاء الوردية" : "Shift created"); onOpenChange(false); }, onError: (error) => toast.error(humanError(error, lang)) });
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-[540px]"><DialogHeader><DialogTitle>{ar ? "وردية جديدة" : "Create shift"}</DialogTitle><DialogDescription>{ar ? "أنشئ الوردية أولاً ثم أضف أعضاء الفريق." : "Create the shift, then assign the team."}</DialogDescription></DialogHeader><div className="grid gap-4 py-2 sm:grid-cols-2"><Field label={ar ? "الاسم" : "Name"} className="sm:col-span-2"><Input value={name} onChange={(event) => setName(event.target.value)} /></Field><Field label={ar ? "التاريخ" : "Date"}><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field><div /><Field label={ar ? "البداية" : "Start"}><Input type="time" value={start} onChange={(event) => setStart(event.target.value)} /></Field><Field label={ar ? "النهاية" : "End"}><Input type="time" value={end} onChange={(event) => setEnd(event.target.value)} /></Field><Field label={ar ? "ملاحظات" : "Notes"} className="sm:col-span-2"><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} /></Field></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>{ar ? "إلغاء" : "Cancel"}</Button><Button disabled={!name.trim() || !date || create.isPending} onClick={() => create.mutate()}>{ar ? "إنشاء" : "Create shift"}</Button></DialogFooter></DialogContent></Dialog>;
}

function CloseShiftDialog({ shift, openWorkCount, restaurantId, currentStaffId, onClose, ar, lang }: { shift: Shift; openWorkCount: number; restaurantId: string; currentStaffId: string; onClose: () => void; ar: boolean; lang: "en" | "ar" }) {
  const qc = useQueryClient();
  const [summary, setSummary] = useState("");
  const [unresolved, setUnresolved] = useState("");
  const [cash, setCash] = useState("");
  const [inventory, setInventory] = useState("");
  const [targetRole, setTargetRole] = useState<AppRole>("manager");
  const mustHandover = openWorkCount > 0;
  const close = useMutation({
    mutationFn: async () => {
      if (mustHandover || summary.trim()) await createShiftHandover({ restaurant_id: restaurantId, shift_id: shift.id, from_staff_id: currentStaffId, to_staff_id: null, target_role: targetRole, summary: summary.trim() || (ar ? "تسليم نهاية الوردية" : "End-of-shift handover"), unresolved_items: unresolved.trim() || null, cash_note: cash.trim() || null, inventory_note: inventory.trim() || null });
      await closeShift(shift.id, currentStaffId);
    },
    onSuccess: async () => { await Promise.all([qc.invalidateQueries({ queryKey: ["operations", "shifts", restaurantId] }), qc.invalidateQueries({ queryKey: ["operations", "shift-handovers", restaurantId] }), qc.invalidateQueries({ queryKey: ["work", restaurantId] })]); toast.success(ar ? "تم إغلاق الوردية وتسليمها" : "Shift closed and handed over"); onClose(); },
    onError: (error) => toast.error(humanError(error, lang)),
  });
  const ready = !mustHandover || summary.trim().length >= 3;
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent className="sm:max-w-[620px]"><DialogHeader><DialogTitle>{ar ? `إغلاق ${shift.name}` : `Close ${shift.name}`}</DialogTitle><DialogDescription>{mustHandover ? (ar ? `يوجد ${openWorkCount} عمل غير محلول. يلزم ملخص تسليم قبل الإغلاق.` : `${openWorkCount} work items remain unresolved. Add a handover summary before closing.`) : (ar ? "يمكن إضافة تسليم اختياري قبل الإغلاق." : "You can add an optional handover before closing.")}</DialogDescription></DialogHeader><div className="grid gap-4 py-2 sm:grid-cols-2"><Field label={ar ? "ملخص التسليم" : "Handover summary"} className="sm:col-span-2"><Textarea rows={3} value={summary} onChange={(event) => setSummary(event.target.value)} placeholder={ar ? "ما الذي يجب أن يعرفه الفريق التالي؟" : "What should the next team know?"} /></Field><Field label={ar ? "أعمال غير محلولة" : "Unresolved items"} className="sm:col-span-2"><Textarea rows={2} value={unresolved} onChange={(event) => setUnresolved(event.target.value)} /></Field><Field label={ar ? "ملاحظة الكاش" : "Cash note"}><Input value={cash} onChange={(event) => setCash(event.target.value)} /></Field><Field label={ar ? "ملاحظة المخزون" : "Inventory note"}><Input value={inventory} onChange={(event) => setInventory(event.target.value)} /></Field><Field label={ar ? "تسليم إلى" : "Handover to"} className="sm:col-span-2"><Select value={targetRole} onValueChange={(value) => setTargetRole(value as AppRole)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{HANDOVER_ROLES.map((role) => <SelectItem key={role} value={role}>{ROLE_LABELS[role][lang]}</SelectItem>)}</SelectContent></Select></Field></div><DialogFooter><Button variant="outline" onClick={onClose}>{ar ? "إلغاء" : "Cancel"}</Button><Button disabled={!ready || close.isPending} onClick={() => close.mutate()}>{ar ? "إغلاق وتسليم" : "Close & hand over"}</Button></DialogFooter></DialogContent></Dialog>;
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) { return <div className={cn("space-y-2", className)}><Label className="text-[10px] font-bold uppercase tracking-[.08em] text-muted-foreground">{label}</Label>{children}</div>; }
function Status({ status, ar }: { status: Shift["status"]; ar: boolean }) { const label = status === "open" ? (ar ? "مفتوحة" : "Open") : status === "closed" ? (ar ? "مغلقة" : "Closed") : (ar ? "مخططة" : "Planned"); return <span className={cn("rounded-full px-2 py-1 text-[10px] font-bold", status === "open" ? "bg-emerald-500/10 text-emerald-700" : status === "closed" ? "bg-slate-500/10 text-slate-600" : "bg-blue-500/10 text-blue-600")}>{label}</span>; }
function formatWindow(shift: Shift, ar: boolean) { const fmt = (value: string | null) => value ? new Date(value).toLocaleTimeString(ar ? "ar-JO" : "en-JO", { hour: "2-digit", minute: "2-digit" }) : "—"; return `${fmt(shift.planned_start)} – ${fmt(shift.planned_end)}`; }
function EmptyShifts({ ar }: { ar: boolean }) { return <div className="p-10 text-center"><CalendarClock className="mx-auto size-9 text-muted-foreground" /><h3 className="mt-3 font-bold">{ar ? "لا توجد ورديات بعد" : "No shifts yet"}</h3><p className="mt-1 text-xs text-muted-foreground">{ar ? "أنشئ أول وردية لبدء الجدولة والتسليم." : "Create the first shift to start scheduling and handover."}</p></div>; }
function Denied({ ar }: { ar: boolean }) { return <div className="min-h-dvh bg-background"><AppHeader /><main className="qs-page"><section className="qs-card p-8 text-center"><CalendarClock className="mx-auto size-10 text-muted-foreground" /><h1 className="mt-4 text-xl font-bold">{ar ? "الورديات غير متاحة" : "Shifts are not available"}</h1><p className="mt-2 text-sm text-muted-foreground">{ar ? "هذا الحساب لا يملك وصول مساحة العمل لهذا المطعم." : "This account does not have work access for this restaurant."}</p></section></main></div>; }
