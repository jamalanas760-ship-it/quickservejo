import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Clock3, Lock, Pencil, Plus, RotateCcw, UserRound, XCircle } from "lucide-react";
import { toast } from "sonner";

import { DetailRow, DetailSheet, formatStamp } from "@/components/operations/DetailSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { ShiftAssignment } from "@/hooks/useOperations";
import { supabase } from "@/integrations/supabase/client";
import { humanError } from "@/lib/errors";
import { ROLE_LABELS, type AppRole } from "@/lib/permissions";
import { cn } from "@/lib/utils";

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
type Leave = { id: string; staff_id: string; start_date: string; end_date: string; status: string; reason: string };

/** Operational thresholds (not payroll rules). */
const LATE_MIN = 15;
const OVERTIME_MIN = 30;
const WEEKLY_OVERTIME_RISK_H = 40;

const H = (ms: number) => ms / 3_600_000;
const fmtH = (h: number, ar: boolean) => `${h.toFixed(1)}${ar ? "س" : "h"}`;
const fmtTime = (v: string | null | undefined, ar: boolean) => (v ? new Date(v).toLocaleTimeString(ar ? "ar-JO" : "en-US", { hour: "2-digit", minute: "2-digit" }) : "—");
const dayKey = (v: string | Date) => new Date(v).toLocaleDateString("en-CA");
const toLocalInput = (v: string | null) => {
  if (!v) return "";
  const d = new Date(v);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function useWorkforceData(restaurantId: string) {
  return useQuery({
    queryKey: ["workforce", "insights", restaurantId],
    refetchInterval: 30_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 35 * 86400000).toISOString();
      const [timeRes, leaveRes] = await Promise.all([
        (supabase.from as any)("staff_time_entries").select("*").eq("restaurant_id", restaurantId).or(`clock_out.is.null,clock_in.gte.${since}`).order("clock_in", { ascending: false }).limit(1000),
        (supabase.from as any)("staff_leave_requests").select("id,staff_id,start_date,end_date,status,reason").eq("restaurant_id", restaurantId).order("created_at", { ascending: false }).limit(300),
      ]);
      if (timeRes.error) throw timeRes.error;
      if (leaveRes.error) throw leaveRes.error;
      return { entries: (timeRes.data ?? []) as Entry[], leave: (leaveRes.data ?? []) as Leave[] };
    },
  });
}

export type LifecycleStatus = "scheduled" | "working" | "late" | "overtime" | "completed" | "absent" | "off";

/** Scheduled → Clocked in → Clocked out, derived from assignments vs time entries. */
export function memberDayStatus(memberId: string, dateKey: string, assignments: ShiftAssignment[], entries: Entry[], now = Date.now()) {
  const scheduled = assignments.filter((a) => a.staff_id === memberId && a.status !== "released" && a.starts_at && a.ends_at && dayKey(a.starts_at) === dateKey);
  const dayEntries = entries.filter((e) => e.staff_id === memberId && dayKey(e.clock_in) === dateKey);
  const open = dayEntries.find((e) => !e.clock_out) ?? entries.find((e) => e.staff_id === memberId && !e.clock_out);
  const first = scheduled.sort((a, b) => a.starts_at!.localeCompare(b.starts_at!))[0];
  const start = first ? new Date(first.starts_at!).getTime() : null;
  const end = first ? new Date(first.ends_at!).getTime() : null;
  const firstIn = dayEntries.length ? Math.min(...dayEntries.map((e) => new Date(e.clock_in).getTime())) : null;
  const lastOut = dayEntries.every((e) => e.clock_out) && dayEntries.length ? Math.max(...dayEntries.map((e) => new Date(e.clock_out!).getTime())) : null;
  const actualH = dayEntries.reduce((s, e) => s + Math.max(0, H((e.clock_out ? new Date(e.clock_out).getTime() : now) - new Date(e.clock_in).getTime()) - (e.break_minutes || 0) / 60), 0);
  const breakMin = dayEntries.reduce((s, e) => s + (e.break_minutes || 0), 0);
  const scheduledH = scheduled.reduce((s, a) => s + Math.max(0, H(new Date(a.ends_at!).getTime() - new Date(a.starts_at!).getTime())), 0);
  const lateMin = start && firstIn ? Math.max(0, (firstIn - start) / 60000) : start && !firstIn && now > start ? (now - start) / 60000 : 0;
  const earlyMin = end && lastOut ? Math.max(0, (end - lastOut) / 60000) : 0;
  const overtimeMin = end ? Math.max(0, ((lastOut ?? (open ? now : 0)) - end) / 60000) : 0;
  let status: LifecycleStatus = "off";
  if (open) status = overtimeMin >= OVERTIME_MIN ? "overtime" : lateMin >= LATE_MIN ? "late" : "working";
  else if (dayEntries.length) status = overtimeMin >= OVERTIME_MIN ? "overtime" : "completed";
  else if (start && end && now > end) status = "absent";
  else if (start && now > start + LATE_MIN * 60000) status = "late";
  else if (start) status = "scheduled";
  return { status, assignment: first ?? null, firstIn, lastOut, actualH, scheduledH, breakMin, lateMin, earlyMin, overtimeMin, missing: Boolean(start && !firstIn && now > start + LATE_MIN * 60000) };
}

export function lifecycleLabel(s: LifecycleStatus, ar: boolean) {
  const m: Record<LifecycleStatus, [string, string]> = { scheduled: ["Scheduled", "مجدول"], working: ["Working", "يعمل"], late: ["Late", "متأخر"], overtime: ["Overtime", "وقت إضافي"], completed: ["Completed", "مكتمل"], absent: ["Absent", "غائب"], off: ["Off", "خارج الجدول"] };
  return m[s][ar ? 1 : 0];
}
export function lifecycleTone(s: LifecycleStatus) {
  return s === "working" ? "bg-emerald-500/10 text-emerald-700" : s === "late" ? "bg-orange-500/10 text-orange-700" : s === "overtime" ? "bg-amber-500/10 text-amber-700" : s === "absent" ? "bg-red-500/10 text-red-700" : s === "completed" ? "bg-slate-500/10 text-slate-700" : s === "scheduled" ? "bg-blue-500/10 text-blue-700" : "bg-muted text-muted-foreground";
}
function Pill({ s, ar }: { s: LifecycleStatus; ar: boolean }) {
  return <span className={cn("inline-flex rounded-full px-2 py-1 text-[10px] font-bold", lifecycleTone(s))}>{lifecycleLabel(s, ar)}</span>;
}
const roleLabel = (r: AppRole, ar: boolean) => ROLE_LABELS[r]?.[ar ? "ar" : "en"] ?? r;
const reviewOf = (e: Entry) => e.review_status ?? "pending";

function EmptyCard({ text }: { text: string }) {
  return <div className="p-8 text-center text-xs text-muted-foreground"><CheckCircle2 className="mx-auto mb-2 size-7 text-emerald-500/70" />{text}</div>;
}

/* ---------------------------- Exceptions feed ---------------------------- */
export function WorkforceExceptions({ restaurantId, members, assignments, ar }: { restaurantId: string; members: WorkforceMember[]; assignments: ShiftAssignment[]; ar: boolean }) {
  const data = useWorkforceData(restaurantId);
  const items = useMemo(() => {
    if (!data.data) return [];
    const today = dayKey(new Date());
    const out: Array<{ key: string; tone: string; title: string; detail: string }> = [];
    for (const m of members.filter((x) => x.is_active)) {
      const d = memberDayStatus(m.id, today, assignments, data.data.entries);
      if (d.missing) out.push({ key: `miss-${m.id}`, tone: "red", title: ar ? `${m.name}: لم يسجّل الدخول` : `${m.name}: missing clock-in`, detail: ar ? `بداية مجدولة ${fmtTime(d.assignment?.starts_at, ar)}` : `Scheduled start ${fmtTime(d.assignment?.starts_at, ar)}` });
      else if (d.firstIn && d.lateMin >= LATE_MIN) out.push({ key: `late-${m.id}`, tone: "orange", title: ar ? `${m.name}: وصول متأخر` : `${m.name}: late arrival`, detail: ar ? `${Math.round(d.lateMin)} دقيقة بعد البداية` : `${Math.round(d.lateMin)} min after scheduled start` });
      if (d.overtimeMin >= OVERTIME_MIN) out.push({ key: `ot-${m.id}`, tone: "amber", title: ar ? `${m.name}: وقت إضافي` : `${m.name}: overtime`, detail: ar ? `${Math.round(d.overtimeMin)} دقيقة بعد نهاية الوردية` : `${Math.round(d.overtimeMin)} min past shift end` });
      // overlapping assignments = shift conflict
      const mine = assignments.filter((a) => a.staff_id === m.id && a.status !== "released" && a.starts_at && a.ends_at && a.starts_at.slice(0, 10) >= today).sort((a, b) => a.starts_at!.localeCompare(b.starts_at!));
      for (let i = 1; i < mine.length; i++) if (mine[i].starts_at! < mine[i - 1].ends_at!) { out.push({ key: `cf-${mine[i].id}`, tone: "red", title: ar ? `${m.name}: تعارض ورديات` : `${m.name}: shift conflict`, detail: `${dayKey(mine[i].starts_at!)} · ${fmtTime(mine[i].starts_at, ar)}` }); break; }
    }
    const unapproved = data.data.entries.filter((e) => e.clock_out && reviewOf(e) === "pending").length;
    if (unapproved) out.push({ key: "ts", tone: "blue", title: ar ? `${unapproved} سجل دوام بانتظار المراجعة` : `${unapproved} timesheet${unapproved === 1 ? "" : "s"} awaiting review`, detail: ar ? "راجع من تبويب سجلات الدوام" : "Review in the Timesheets tab" });
    const pendingLeave = data.data.leave.filter((l) => l.status === "pending").length;
    if (pendingLeave) out.push({ key: "lv", tone: "purple", title: ar ? `${pendingLeave} طلب إجازة معلّق` : `${pendingLeave} pending time-off request${pendingLeave === 1 ? "" : "s"}`, detail: ar ? "بانتظار موافقة المدير" : "Waiting for manager approval" });
    return out;
  }, [data.data, members, assignments, ar]);

  const toneCls: Record<string, string> = { red: "bg-red-500/10 text-red-600", orange: "bg-orange-500/10 text-orange-600", amber: "bg-amber-500/10 text-amber-700", blue: "bg-blue-500/10 text-blue-600", purple: "bg-violet-500/10 text-violet-600" };
  return <section className="qs-card overflow-hidden">
    <div className="flex items-center justify-between gap-3 border-b border-border p-4">
      <div><h2 className="qs-section-title">{ar ? "يحتاج انتباه" : "Needs attention"}</h2><p className="mt-1 text-xs text-muted-foreground">{ar ? `قواعد تشغيلية: تأخر ≥ ${LATE_MIN} د، وقت إضافي ≥ ${OVERTIME_MIN} د.` : `Operational rules: late ≥ ${LATE_MIN} min, overtime ≥ ${OVERTIME_MIN} min past shift end.`}</p></div>
      <span className="rounded-full bg-muted px-3 py-1 text-[10px] font-bold">{items.length}</span>
    </div>
    {data.isPending ? <div className="p-4"><Skeleton className="h-24 rounded-xl" /></div> : data.isError ? <p className="p-5 text-xs text-muted-foreground">{ar ? "تعذر تحميل بيانات الحضور." : "Attendance data is unavailable right now."}</p> : !items.length ? <EmptyCard text={ar ? "لا توجد استثناءات الآن." : "No workforce exceptions right now."} /> :
      <ul className="divide-y divide-border">{items.slice(0, 12).map((i) => <li key={i.key} className="flex items-start gap-3 p-3"><span className={cn("grid size-8 shrink-0 place-items-center rounded-xl", toneCls[i.tone])}><AlertTriangle className="size-4" /></span><span className="min-w-0"><strong className="block text-xs">{i.title}</strong><span className="mt-0.5 block text-[11px] text-muted-foreground">{i.detail}</span></span></li>)}</ul>}
  </section>;
}

/* ------------------------------ Member drawer ----------------------------- */
export function MemberWorkforceSheet({ member, onClose, restaurantId, assignments, ar, canManageTeam }: { member: WorkforceMember | null; onClose: () => void; restaurantId: string; assignments: ShiftAssignment[]; ar: boolean; canManageTeam: boolean }) {
  const data = useWorkforceData(restaurantId);
  const now = Date.now();
  const today = dayKey(new Date());
  const d = member && data.data ? memberDayStatus(member.id, today, assignments, data.data.entries, now) : null;
  const weekAgo = now - 7 * 86400000;
  const weekH = member && data.data ? data.data.entries.filter((e) => e.staff_id === member.id && new Date(e.clock_in).getTime() >= weekAgo).reduce((s, e) => s + Math.max(0, H((e.clock_out ? new Date(e.clock_out).getTime() : now) - new Date(e.clock_in).getTime()) - (e.break_minutes || 0) / 60), 0) : 0;
  const next = member ? assignments.filter((a) => a.staff_id === member.id && a.status !== "released" && a.ends_at && new Date(a.ends_at).getTime() > now).sort((a, b) => (a.starts_at ?? "").localeCompare(b.starts_at ?? ""))[0] : null;
  const leave = member && data.data ? data.data.leave.filter((l) => l.staff_id === member.id).slice(0, 3) : [];
  return <DetailSheet open={Boolean(member)} onOpenChange={(o) => { if (!o) onClose(); }} title={member?.name ?? ""} description={member ? roleLabel(member.role, ar) : undefined}
    footer={canManageTeam ? <Button asChild variant="outline" className="w-full"><Link to="/manage/$restaurantId/staff" params={{ restaurantId }}><UserRound className="size-4" />{ar ? "فتح ملف الفريق" : "Open team profile"}</Link></Button> : undefined}>
    {!member ? null : data.isPending ? <Skeleton className="h-40 rounded-xl" /> : <div>
      <DetailRow label={ar ? "الحالة اليوم" : "Today"} value={d ? <Pill s={d.status} ar={ar} /> : "—"} />
      <DetailRow label={ar ? "المجدول" : "Scheduled"} value={d?.assignment ? `${fmtTime(d.assignment.starts_at, ar)} – ${fmtTime(d.assignment.ends_at, ar)}` : (ar ? "غير مجدول" : "Not scheduled")} />
      <DetailRow label={ar ? "الفعلي" : "Actual"} value={d?.firstIn ? `${fmtTime(new Date(d.firstIn).toISOString(), ar)} – ${d.lastOut ? fmtTime(new Date(d.lastOut).toISOString(), ar) : (ar ? "الآن" : "now")}` : "—"} />
      <DetailRow label={ar ? "ساعات اليوم" : "Hours today"} value={d ? fmtH(d.actualH, ar) : "—"} />
      <DetailRow label={ar ? "آخر 7 أيام" : "Last 7 days"} value={<span className={cn(weekH > WEEKLY_OVERTIME_RISK_H && "font-bold text-amber-700")}>{fmtH(weekH, ar)}</span>} />
      <DetailRow label={ar ? "الوردية القادمة" : "Next shift"} value={next?.starts_at ? `${dayKey(next.starts_at)} · ${fmtTime(next.starts_at, ar)}` : (ar ? "لا يوجد" : "None")} />
      <div className="mt-4"><h3 className="text-[10px] font-bold uppercase tracking-[.08em] text-muted-foreground">{ar ? "الإجازات" : "Time off"}</h3>
        {leave.length ? <ul className="mt-2 space-y-2">{leave.map((l) => <li key={l.id} className="flex items-center justify-between rounded-xl border border-border/70 p-2 text-xs"><span>{l.start_date} → {l.end_date}</span><span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold capitalize">{l.status}</span></li>)}</ul> : <p className="mt-2 text-xs text-muted-foreground">{ar ? "لا توجد طلبات." : "No requests."}</p>}
      </div>
    </div>}
  </DetailSheet>;
}

/* -------------------------------- Team tab -------------------------------- */
export function WorkforceTeam({ restaurantId, members, assignments, ar, onOpen, canManageTeam }: { restaurantId: string; members: WorkforceMember[]; assignments: ShiftAssignment[]; ar: boolean; onOpen: (m: WorkforceMember) => void; canManageTeam: boolean }) {
  const data = useWorkforceData(restaurantId);
  const [role, setRole] = useState<string>("all");
  const today = dayKey(new Date());
  const roles = Array.from(new Set(members.map((m) => m.role)));
  const rows = members.filter((m) => m.is_active && (role === "all" || m.role === role));
  return <section className="qs-card overflow-hidden">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
      <div><h2 className="qs-section-title">{ar ? "الفريق" : "Team"}</h2><p className="mt-1 text-xs text-muted-foreground">{ar ? "الحالة اليوم والوردية القادمة والساعات." : "Today's status, next shift and hours for each member."}</p></div>
      <div className="flex flex-wrap items-center gap-2">
        <RoleFilter value={role} onChange={setRole} roles={roles} ar={ar} />
        {canManageTeam ? <Button asChild variant="outline" className="min-h-11"><Link to="/manage/$restaurantId/staff" params={{ restaurantId }}>{ar ? "إدارة الفريق" : "Manage team"}</Link></Button> : null}
      </div>
    </div>
    {data.isPending ? <div className="p-4"><Skeleton className="h-40 rounded-xl" /></div> : !rows.length ? <EmptyCard text={ar ? "لا يوجد أعضاء نشطون." : "No active team members."} /> :
      <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3">{rows.map((m) => { const d = memberDayStatus(m.id, today, assignments, data.data?.entries ?? []); return <button key={m.id} type="button" onClick={() => onOpen(m)} className="flex min-h-16 items-center gap-3 rounded-2xl border border-border bg-card p-3 text-start transition duration-200 hover:border-orange-200 hover:shadow-sm">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-sm font-bold">{m.name.slice(0, 1).toUpperCase()}</span>
        <span className="min-w-0 flex-1"><strong className="block truncate text-sm">{m.name}</strong><span className="block truncate text-[11px] text-muted-foreground">{roleLabel(m.role, ar)} · {d.assignment ? `${fmtTime(d.assignment.starts_at, ar)}–${fmtTime(d.assignment.ends_at, ar)}` : (ar ? "بلا وردية اليوم" : "No shift today")}</span></span>
        <Pill s={d.status} ar={ar} />
      </button>; })}</div>}
  </section>;
}

function RoleFilter({ value, onChange, roles, ar }: { value: string; onChange: (v: string) => void; roles: AppRole[]; ar: boolean }) {
  return <Select value={value} onValueChange={onChange}><SelectTrigger className="min-h-11 w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{ar ? "كل الأدوار" : "All roles"}</SelectItem>{roles.map((r) => <SelectItem key={r} value={r}>{roleLabel(r, ar)}</SelectItem>)}</SelectContent></Select>;
}

/* ------------------------------- Attendance ------------------------------- */
export function WorkforceAttendanceBoard({ restaurantId, members, assignments, ar, onOpen }: { restaurantId: string; members: WorkforceMember[]; assignments: ShiftAssignment[]; ar: boolean; onOpen: (m: WorkforceMember) => void }) {
  const data = useWorkforceData(restaurantId);
  const [date, setDate] = useState(() => dayKey(new Date()));
  const [role, setRole] = useState("all");
  const roles = Array.from(new Set(members.map((m) => m.role)));
  const rows = members.filter((m) => m.is_active && (role === "all" || m.role === role)).map((m) => ({ m, d: memberDayStatus(m.id, date, assignments, data.data?.entries ?? []) }))
    .filter((r) => r.d.status !== "off" || r.d.actualH > 0);
  return <section className="qs-card overflow-hidden">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
      <div><h2 className="qs-section-title">{ar ? "حضور اليوم" : "Attendance board"}</h2><p className="mt-1 text-xs text-muted-foreground">{ar ? "المجدول مقابل الفعلي لكل عضو." : "Scheduled vs actual for each team member."}</p></div>
      <div className="flex flex-wrap gap-2"><Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="min-h-11 w-40" aria-label={ar ? "التاريخ" : "Date"} /><RoleFilter value={role} onChange={setRole} roles={roles} ar={ar} /></div>
    </div>
    {data.isPending ? <div className="p-4"><Skeleton className="h-40 rounded-xl" /></div> : !rows.length ? <EmptyCard text={ar ? "لا يوجد أحد مجدول أو مسجل في هذا اليوم." : "Nobody is scheduled or clocked in on this day."} /> : <>
      <div className="hidden md:block"><table className="w-full text-sm"><thead className="bg-muted/30 text-[10px] uppercase tracking-[.06em] text-muted-foreground"><tr><th className="p-3 text-start">{ar ? "العضو" : "Member"}</th><th className="p-3 text-start">{ar ? "المجدول" : "Scheduled"}</th><th className="p-3 text-start">{ar ? "الفعلي" : "Actual"}</th><th className="p-3 text-start">{ar ? "الساعات" : "Hours"}</th><th className="p-3 text-start">{ar ? "الحالة" : "Status"}</th></tr></thead>
        <tbody className="divide-y divide-border">{rows.map(({ m, d }) => <tr key={m.id} className="cursor-pointer hover:bg-muted/20" onClick={() => onOpen(m)}><td className="p-3"><strong className="block text-xs">{m.name}</strong><span className="text-[10px] text-muted-foreground">{roleLabel(m.role, ar)}</span></td><td className="p-3 text-xs tabular-nums">{d.assignment ? `${fmtTime(d.assignment.starts_at, ar)} – ${fmtTime(d.assignment.ends_at, ar)}` : "—"}</td><td className="p-3 text-xs tabular-nums">{d.firstIn ? `${fmtTime(new Date(d.firstIn).toISOString(), ar)} – ${d.lastOut ? fmtTime(new Date(d.lastOut).toISOString(), ar) : "…"}` : "—"}{d.earlyMin >= 15 ? <span className="ms-2 text-[10px] font-bold text-rose-600">{ar ? "مغادرة مبكرة" : "Left early"}</span> : null}</td><td className="p-3 text-xs tabular-nums">{fmtH(d.actualH, ar)} / {fmtH(d.scheduledH, ar)}</td><td className="p-3"><Pill s={d.status} ar={ar} /></td></tr>)}</tbody></table></div>
      <ul className="divide-y divide-border md:hidden">{rows.map(({ m, d }) => <li key={m.id}><button type="button" onClick={() => onOpen(m)} className="flex min-h-16 w-full items-center justify-between gap-3 p-3 text-start"><span className="min-w-0"><strong className="block truncate text-sm">{m.name}</strong><span className="mt-0.5 block text-[11px] tabular-nums text-muted-foreground">{d.assignment ? `${fmtTime(d.assignment.starts_at, ar)}–${fmtTime(d.assignment.ends_at, ar)}` : "—"} · {fmtH(d.actualH, ar)}</span></span><Pill s={d.status} ar={ar} /></button></li>)}</ul>
    </>}
  </section>;
}

/* ------------------------------- Timesheets ------------------------------- */
export function WorkforceTimesheets({ restaurantId, members, assignments, canManage, canReopen, currentStaffId, ar, lang, onOpenMember }: { restaurantId: string; members: WorkforceMember[]; assignments: ShiftAssignment[]; canManage: boolean; canReopen: boolean; currentStaffId: string; ar: boolean; lang: "en" | "ar"; onOpenMember: (m: WorkforceMember) => void }) {
  const qc = useQueryClient();
  const data = useWorkforceData(restaurantId);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [editing, setEditing] = useState<Entry | null>(null);
  const [missingOpen, setMissingOpen] = useState(false);
  const reviewSupported = (data.data?.entries ?? []).some((e) => "review_status" in e) || !(data.data?.entries ?? []).length;
  const memberById = new Map(members.map((m) => [m.id, m]));
  const entries = (data.data?.entries ?? []).filter((e) => e.clock_out && (canManage || e.staff_id === currentStaffId) && (filter === "all" || reviewOf(e) === filter));

  const act = useMutation({
    mutationFn: async (p: { id: string; action: "approve" | "reject" | "reopen" | "correct"; note?: string; clock_in?: string; clock_out?: string; break_minutes?: number }) => {
      const { error } = await (supabase as any).rpc("review_time_entry", { _entry_id: p.id, _action: p.action, _note: p.note ?? null, _clock_in: p.clock_in ?? null, _clock_out: p.clock_out ?? null, _break_minutes: p.break_minutes ?? null });
      if (error) throw error;
    },
    onSuccess: async () => { setEditing(null); await qc.invalidateQueries({ queryKey: ["workforce"] }); toast.success(ar ? "تم تحديث سجل الدوام" : "Timesheet updated"); },
    onError: (e) => toast.error(humanError(e, lang)),
  });

  const scheduledFor = (e: Entry) => {
    const inMs = new Date(e.clock_in).getTime();
    const a = assignments.find((x) => x.staff_id === e.staff_id && x.starts_at && x.ends_at && new Date(x.starts_at).getTime() - 4 * 3_600_000 <= inMs && new Date(x.ends_at).getTime() >= inMs);
    return a ? Math.max(0, H(new Date(a.ends_at!).getTime() - new Date(a.starts_at!).getTime())) : null;
  };

  return <section className="qs-card overflow-hidden">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
      <div className="min-w-0"><h2 className="qs-section-title">{ar ? "سجلات الدوام" : "Timesheets"}</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">{ar ? "المجدول ← الدخول ← الخروج ← المراجعة ← الاعتماد. الأرقام تقديرات تشغيلية وليست رواتب." : "Scheduled → Clocked in → Clocked out → Review → Approved. Hours are operational estimates, not payroll."}</p></div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="inline-grid grid-cols-4 rounded-xl border border-border bg-card p-1">{(["pending", "approved", "rejected", "all"] as const).map((f) => <button key={f} type="button" onClick={() => setFilter(f)} className={cn("min-h-10 rounded-lg px-3 text-xs font-bold", filter === f ? "bg-orange-500/10 text-[#cf4818]" : "text-muted-foreground hover:bg-muted")}>{f === "pending" ? (ar ? "للمراجعة" : "Review") : f === "approved" ? (ar ? "معتمد" : "Approved") : f === "rejected" ? (ar ? "مرفوض" : "Rejected") : (ar ? "الكل" : "All")}</button>)}</div>
        {canManage ? <Button type="button" variant="outline" className="min-h-11 gap-2 border-orange-200 bg-orange-500/[0.045] text-[#cf4818] hover:bg-orange-500/10 dark:border-orange-900/60" onClick={() => setMissingOpen(true)}><Plus className="size-4" />{ar ? "إضافة بصمة ناقصة" : "Add missing punch"}</Button> : null}
      </div>
    </div>
    {!reviewSupported ? <p className="border-b border-amber-200 bg-amber-500/5 p-3 text-xs text-amber-800">{ar ? "اعتماد السجلات يتطلب تحديث قاعدة البيانات المعلّق. يمكنك عرض الساعات الآن." : "Approval requires a pending database update. Hours are visible now; approve/correct will activate once it is applied."}</p> : null}
    {data.isPending ? <div className="p-4"><Skeleton className="h-40 rounded-xl" /></div> : data.isError ? <p className="p-5 text-xs text-muted-foreground">{ar ? "تعذر تحميل السجلات." : "Timesheets are unavailable right now."}</p> : !entries.length ? <EmptyCard text={ar ? "لا توجد سجلات في هذا الفلتر." : "No timesheets in this view."} /> :
      <ul className="divide-y divide-border">{entries.slice(0, 120).map((e) => {
        const m = memberById.get(e.staff_id);
        const actual = Math.max(0, H(new Date(e.clock_out!).getTime() - new Date(e.clock_in).getTime()) - (e.break_minutes || 0) / 60);
        const sched = scheduledFor(e);
        const ot = sched !== null ? Math.max(0, actual - sched) : 0;
        const status = reviewOf(e);
        const locked = status === "approved";
        return <li key={e.id} className="grid gap-3 p-3 md:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,.6fr))_auto] md:items-center">
          <button type="button" className="min-w-0 text-start" onClick={() => m && onOpenMember(m)}><strong className="block truncate text-sm">{m?.name ?? (ar ? "عضو فريق" : "Team member")}</strong><span className="block text-[11px] tabular-nums text-muted-foreground">{dayKey(e.clock_in)} · {fmtTime(e.clock_in, ar)}–{fmtTime(e.clock_out, ar)}</span></button>
          <Metric l={ar ? "مجدول" : "Sched."} v={sched !== null ? fmtH(sched, ar) : "—"} />
          <Metric l={ar ? "فعلي" : "Actual"} v={fmtH(actual, ar)} />
          <Metric l={ar ? "استراحة" : "Break"} v={`${e.break_minutes || 0}${ar ? "د" : "m"}`} />
          <Metric l={ar ? "إضافي" : "OT"} v={fmtH(ot, ar)} warn={ot * 60 >= OVERTIME_MIN} />
          <div className="flex flex-wrap items-center gap-1.5 md:justify-end">
            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold", status === "approved" ? "bg-emerald-500/10 text-emerald-700" : status === "rejected" ? "bg-red-500/10 text-red-700" : "bg-blue-500/10 text-blue-700")}>{locked ? <Lock className="size-3" /> : null}{status === "approved" ? (ar ? "معتمد" : "Approved") : status === "rejected" ? (ar ? "مرفوض" : "Rejected") : (ar ? "للمراجعة" : "Review")}</span>
            {canManage && reviewSupported ? locked ? (canReopen ? <Button size="sm" variant="ghost" className="min-h-10" disabled={act.isPending} onClick={() => act.mutate({ id: e.id, action: "reopen", note: "Reopened" })}><RotateCcw className="size-4" />{ar ? "إعادة فتح" : "Reopen"}</Button> : null) : <>
              <Button size="sm" variant="outline" className="min-h-10" onClick={() => setEditing(e)} aria-label={ar ? "تصحيح" : "Correct"}><Pencil className="size-4" /></Button>
              <Button size="sm" variant="outline" className="min-h-10" disabled={act.isPending} onClick={() => act.mutate({ id: e.id, action: "reject" })} aria-label={ar ? "رفض" : "Reject"}><XCircle className="size-4 text-red-600" /></Button>
              <Button size="sm" className="min-h-10" disabled={act.isPending} onClick={() => act.mutate({ id: e.id, action: "approve" })}><CheckCircle2 className="size-4" />{ar ? "اعتماد" : "Approve"}</Button>
            </> : null}
          </div>
        </li>;
      })}</ul>}
    {editing ? <CorrectionSheet entry={editing} ar={ar} pending={act.isPending} onClose={() => setEditing(null)} onSave={(p) => act.mutate({ id: editing.id, action: "correct", ...p })} /> : null}
    {missingOpen ? <MissingPunchSheet restaurantId={restaurantId} members={members} assignments={assignments} ar={ar} lang={lang} onClose={() => setMissingOpen(false)} /> : null}
  </section>;
}

function MissingPunchSheet({ restaurantId, members, assignments, ar, lang, onClose }: { restaurantId: string; members: WorkforceMember[]; assignments: ShiftAssignment[]; ar: boolean; lang: "en" | "ar"; onClose: () => void }) {
  const qc = useQueryClient();
  const activeMembers = members.filter((member) => member.is_active);
  const [staffId, setStaffId] = useState(activeMembers[0]?.id ?? "");
  const selectedAssignment = assignments
    .filter((assignment) => assignment.staff_id === staffId && assignment.status !== "released" && assignment.starts_at && assignment.ends_at && new Date(assignment.ends_at).getTime() <= Date.now() + 5 * 60_000)
    .sort((a, b) => new Date(b.ends_at!).getTime() - new Date(a.ends_at!).getTime())[0] ?? null;
  const defaultIn = selectedAssignment?.starts_at ? toLocalInput(selectedAssignment.starts_at) : "";
  const defaultOut = selectedAssignment?.ends_at ? toLocalInput(selectedAssignment.ends_at) : "";
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");
  const [breakMinutes, setBreakMinutes] = useState("0");
  const [reason, setReason] = useState("");

  const cin = clockIn || defaultIn;
  const cout = clockOut || defaultOut;
  const durationMinutes = cin && cout ? Math.round((new Date(cout).getTime() - new Date(cin).getTime()) / 60000) : 0;
  const invalid = !staffId || !cin || !cout || durationMinutes <= 0 || Number(breakMinutes) < 0 || Number(breakMinutes) >= durationMinutes || !reason.trim() || new Date(cin).getTime() > Date.now() + 5 * 60_000 || new Date(cout).getTime() > Date.now() + 5 * 60_000;

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).rpc("create_missing_time_entry", {
        _restaurant_id: restaurantId,
        _staff_id: staffId,
        _clock_in: new Date(cin).toISOString(),
        _clock_out: new Date(cout).toISOString(),
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
    setClockIn(toLocalInput(selectedAssignment.starts_at));
    setClockOut(toLocalInput(selectedAssignment.ends_at));
  };

  return <DetailSheet
    open
    onOpenChange={(open) => { if (!open && !create.isPending) onClose(); }}
    title={ar ? "إضافة بصمة ناقصة" : "Add missing punch"}
    description={ar ? "أضف وقتاً مفقوداً بأمان مع سبب وتدقيق إداري." : "Add a missing time entry safely with a required reason and audit trail."}
    footer={<div className="flex gap-2"><Button variant="outline" className="flex-1" disabled={create.isPending} onClick={onClose}>{ar ? "إلغاء" : "Cancel"}</Button><Button className="flex-1" disabled={invalid || create.isPending} onClick={() => create.mutate()}><Clock3 className="size-4" />{create.isPending ? (ar ? "جارٍ الحفظ…" : "Saving…") : (ar ? "إضافة للمراجعة" : "Add for review")}</Button></div>}
  >
    <div className="space-y-4 py-2">
      <div className="rounded-2xl border border-orange-200/70 bg-orange-500/[0.045] p-3 text-xs leading-5 text-muted-foreground dark:border-orange-900/50">
        <strong className="block text-foreground">{ar ? "إجراء إداري مدقّق" : "Audited manager action"}</strong>
        <span>{ar ? "سيُنشأ السجل بحالة «للمراجعة» ولن يعتمد تلقائياً." : "The entry is created as Review — it is never auto-approved."}</span>
      </div>
      <div className="space-y-2"><Label>{ar ? "الموظف" : "Team member"}</Label><Select value={staffId} onValueChange={(value) => { setStaffId(value); setClockIn(""); setClockOut(""); }}><SelectTrigger className="min-h-11"><SelectValue placeholder={ar ? "اختر موظفاً" : "Choose a team member"} /></SelectTrigger><SelectContent>{activeMembers.map((member) => <SelectItem key={member.id} value={member.id}>{member.name} · {roleLabel(member.role, ar)}</SelectItem>)}</SelectContent></Select></div>
      {selectedAssignment?.starts_at && selectedAssignment.ends_at ? <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/25 p-3"><span className="min-w-0 text-[11px] text-muted-foreground"><strong className="block truncate text-xs text-foreground">{ar ? "الوردية الأقرب" : "Nearest scheduled shift"}</strong>{fmtTime(selectedAssignment.starts_at, ar)}–{fmtTime(selectedAssignment.ends_at, ar)}</span><Button type="button" size="sm" variant="outline" onClick={applySchedule}>{ar ? "استخدم وقت الجدول" : "Use schedule"}</Button></div> : null}
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>{ar ? "الدخول" : "Clock in"}</Label><Input type="datetime-local" className="min-h-11" value={cin} onChange={(e) => setClockIn(e.target.value)} /></div><div className="space-y-2"><Label>{ar ? "الخروج" : "Clock out"}</Label><Input type="datetime-local" className="min-h-11" value={cout} onChange={(e) => setClockOut(e.target.value)} /></div></div>
      <div className="space-y-2"><Label>{ar ? "الاستراحة (دقائق)" : "Break (minutes)"}</Label><Input type="number" min={0} className="min-h-11" value={breakMinutes} onChange={(e) => setBreakMinutes(e.target.value)} /></div>
      <div className="space-y-2"><Label>{ar ? "سبب إضافة البصمة (مطلوب)" : "Reason for missing punch (required)"}</Label><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={ar ? "مثال: نسي الموظف تسجيل الدخول وتم التحقق من المدير" : "e.g. Employee forgot to clock in; manager verified the shift"} /></div>
      {cin && cout && durationMinutes > 0 ? <p className="text-[11px] font-semibold text-muted-foreground">{ar ? `المدة المسجلة: ${Math.floor(durationMinutes / 60)}س ${durationMinutes % 60}د` : `Recorded duration: ${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m`}</p> : null}
    </div>
  </DetailSheet>;
}

function Metric({ l, v, warn }: { l: string; v: string; warn?: boolean }) {
  return <span className="flex items-baseline justify-between gap-2 md:block"><span className="text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">{l}</span><strong className={cn("block text-sm tabular-nums", warn && "text-amber-700")}>{v}</strong></span>;
}

function CorrectionSheet({ entry, ar, pending, onClose, onSave }: { entry: Entry; ar: boolean; pending: boolean; onClose: () => void; onSave: (p: { clock_in: string; clock_out: string; break_minutes: number; note: string }) => void }) {
  const [cin, setCin] = useState(toLocalInput(entry.clock_in));
  const [cout, setCout] = useState(toLocalInput(entry.clock_out));
  const [brk, setBrk] = useState(String(entry.break_minutes || 0));
  const [reason, setReason] = useState("");
  const invalid = !cin || !cout || new Date(cout) <= new Date(cin) || Number(brk) < 0 || !reason.trim();
  return <DetailSheet open onOpenChange={(o) => { if (!o) onClose(); }} title={ar ? "تصحيح سجل الدوام" : "Correct timesheet"} description={formatStamp(entry.clock_in, ar) ?? undefined}
    footer={<div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={onClose}>{ar ? "إلغاء" : "Cancel"}</Button><Button className="flex-1" disabled={invalid || pending} onClick={() => onSave({ clock_in: new Date(cin).toISOString(), clock_out: new Date(cout).toISOString(), break_minutes: Number(brk), note: reason.trim() })}><Clock3 className="size-4" />{ar ? "حفظ التصحيح" : "Save correction"}</Button></div>}>
    <div className="space-y-4 py-2">
      <div className="space-y-2"><Label>{ar ? "الدخول" : "Clock in"}</Label><Input type="datetime-local" className="min-h-11" value={cin} onChange={(e) => setCin(e.target.value)} /></div>
      <div className="space-y-2"><Label>{ar ? "الخروج" : "Clock out"}</Label><Input type="datetime-local" className="min-h-11" value={cout} onChange={(e) => setCout(e.target.value)} /></div>
      <div className="space-y-2"><Label>{ar ? "الاستراحة (دقائق)" : "Break (minutes)"}</Label><Input type="number" min={0} className="min-h-11" value={brk} onChange={(e) => setBrk(e.target.value)} /></div>
      <div className="space-y-2"><Label>{ar ? "سبب التصحيح (مطلوب)" : "Reason (required)"}</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={ar ? "مثال: نسي تسجيل الخروج" : "e.g. Forgot to clock out"} /></div>
      <p className="text-[11px] text-muted-foreground">{ar ? "كل تصحيح يُسجَّل في سجل التدقيق." : "Every correction is recorded in the audit trail."}</p>
    </div>
  </DetailSheet>;
}
