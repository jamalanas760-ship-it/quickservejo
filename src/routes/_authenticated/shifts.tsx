import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarClock, CheckCircle2, Clock3, Handshake, PlayCircle, Plus, StopCircle, UserPlus, UsersRound } from "lucide-react";
import { toast } from "sonner";

import { AppHeader } from "@/components/nav/AppHeader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  assignStaffToShift,
  closeShift,
  createShift,
  createShiftHandover,
  openShift,
  removeShiftAssignment,
  updateShiftAssignment,
  useOpenWorkCount,
  useShiftAssignments,
  useShiftHandovers,
  useShifts,
  type Shift,
  type ShiftAssignment,
  type ShiftAssignmentStatus,
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
  const shifts = useShifts(rid);
  const shiftIds = useMemo(() => (shifts.data ?? []).map((row) => row.id), [shifts.data]);
  const assignments = useShiftAssignments(rid, shiftIds);
  const handovers = useShiftHandovers(rid);
  const openWork = useOpenWorkCount(rid);
  const members = useWorkspaceMembers(canManage ? rid : null);
  const [createOpen, setCreateOpen] = useState(false);
  const [closingShift, setClosingShift] = useState<Shift | null>(null);

  if (scope.isPending || access.isPending) return <div className="min-h-dvh bg-background"><AppHeader /><main className="qs-page"><Skeleton className="h-[620px] rounded-3xl" /></main></div>;
  if (!rid || !membership || !canView) return <Denied ar={ar} />;

  const today = new Date().toISOString().slice(0, 10);
  const rows = shifts.data ?? [];
  const todayRows = rows.filter((row) => row.shift_date === today);
  const openShiftRow = rows.find((row) => row.status === "open") ?? null;
  const plannedToday = todayRows.filter((row) => row.status === "planned").length;
  const closedToday = todayRows.filter((row) => row.status === "closed").length;
  const pendingHandovers = (handovers.data ?? []).filter((row) => !row.acknowledged_at).length;

  return <div className="min-h-dvh bg-background">
    <AppHeader title={ar ? "الورديات والتسليم" : "Shifts & Handover"} />
    <main className="qs-page space-y-5">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
        <div><h1 className="qs-page-title">{ar ? "إدارة الوردية من البداية للنهاية" : "Run every shift from open to handover"}</h1><p className="qs-page-subtitle max-w-3xl">{ar ? "جدولة الفريق، فتح وإغلاق الوردية، ومشاركة ما لم يُحل قبل التسليم." : "Schedule the team, open and close the shift, and pass unresolved work forward without losing context."}</p></div>
        {canManage ? <Button className="gap-2" onClick={() => setCreateOpen(true)}><Plus className="size-4" />{ar ? "وردية جديدة" : "New shift"}</Button> : null}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={PlayCircle} label={ar ? "وردية مفتوحة" : "Open shift"} value={openShiftRow ? 1 : 0} active={Boolean(openShiftRow)} />
        <Metric icon={Clock3} label={ar ? "مخطط اليوم" : "Planned today"} value={plannedToday} />
        <Metric icon={CheckCircle2} label={ar ? "أُغلقت اليوم" : "Closed today"} value={closedToday} />
        <Metric icon={Handshake} label={ar ? "تسليم بانتظار الاستلام" : "Pending handovers"} value={pendingHandovers} active={pendingHandovers > 0} />
      </section>

      {openShiftRow ? <CurrentShift shift={openShiftRow} assignments={(assignments.data ?? []).filter((row) => row.shift_id === openShiftRow.id)} members={members.data ?? []} canManage={canManage} currentStaffId={membership.id} ar={ar} lang={lang} onClose={() => setClosingShift(openShiftRow)} /> : <section className="qs-card flex items-center gap-4 p-5"><span className="grid size-11 place-items-center rounded-2xl bg-muted text-muted-foreground"><CalendarClock className="size-5" /></span><div><h2 className="font-bold">{ar ? "لا توجد وردية مفتوحة" : "No shift is open"}</h2><p className="mt-1 text-xs text-muted-foreground">{ar ? "يمكن لمدير الوردية فتح وردية مخططة عندما يبدأ التشغيل." : "A shift manager can open a planned shift when service starts."}</p></div></section>}

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,.8fr)]">
        <div className="qs-card overflow-hidden">
          <div className="border-b border-border p-5"><h2 className="qs-section-title">{ar ? "جدول الورديات" : "Shift schedule"}</h2><p className="mt-1 text-xs text-muted-foreground">{ar ? "الورديات التي تسمح سياسات الوصول بعرضها لهذا الحساب." : "Only shifts allowed by this account's role and RLS are shown."}</p></div>
          {shifts.isPending ? <div className="p-5"><Skeleton className="h-64 rounded-2xl" /></div> : shifts.isError ? <p className="p-5 text-sm text-destructive">{humanError(shifts.error, lang)}</p> : !rows.length ? <EmptyShifts ar={ar} /> : <div className="divide-y divide-border">{rows.slice(0, 20).map((shift) => <ShiftRow key={shift.id} shift={shift} assignments={(assignments.data ?? []).filter((row) => row.shift_id === shift.id)} canManage={canManage} currentStaffId={membership.id} ar={ar} lang={lang} onClose={() => setClosingShift(shift)} />)}</div>}
        </div>

        <div className="qs-card overflow-hidden self-start">
          <div className="border-b border-border p-5"><h2 className="qs-section-title">{ar ? "آخر التسليمات" : "Recent handovers"}</h2></div>
          {handovers.isPending ? <div className="p-5"><Skeleton className="h-48 rounded-2xl" /></div> : !(handovers.data ?? []).length ? <div className="p-8 text-center text-xs text-muted-foreground">{ar ? "لا توجد تسليمات بعد." : "No handovers yet."}</div> : <div className="divide-y divide-border">{(handovers.data ?? []).slice(0, 8).map((handover) => <div key={handover.id} className="p-4"><div className="flex items-center gap-2"><Handshake className="size-4 text-[#ff5a0a]" /><strong className="text-sm">{handover.summary}</strong></div>{handover.unresolved_items ? <p className="mt-2 text-xs leading-5 text-muted-foreground">{handover.unresolved_items}</p> : null}<div className="mt-2 flex justify-between gap-2 text-[10px] text-muted-foreground"><span>{handover.target_role ? ROLE_LABELS[handover.target_role]?.[lang] ?? handover.target_role : (ar ? "موظف محدد" : "Specific teammate")}</span><span>{handover.acknowledged_at ? (ar ? "تم الاستلام" : "Acknowledged") : (ar ? "بانتظار الاستلام" : "Pending")}</span></div></div>)}</div>}
        </div>
      </section>
    </main>

    {canManage ? <CreateShiftDialog open={createOpen} onOpenChange={setCreateOpen} restaurantId={rid} ar={ar} lang={lang} /> : null}
    {canManage && closingShift ? <CloseShiftDialog shift={closingShift} openWorkCount={openWork.data ?? 0} restaurantId={rid} currentStaffId={membership.id} onClose={() => setClosingShift(null)} ar={ar} lang={lang} /> : null}
  </div>;
}

function CurrentShift({ shift, assignments, members, canManage, currentStaffId, ar, lang, onClose }: { shift: Shift; assignments: ShiftAssignment[]; members: Array<{ id: string; name: string; role: AppRole; is_active: boolean }>; canManage: boolean; currentStaffId: string; ar: boolean; lang: "en" | "ar"; onClose: () => void }) {
  const qc = useQueryClient();
  const [memberId, setMemberId] = useState("");
  const assign = useMutation({ mutationFn: async () => { const member = members.find((row) => row.id === memberId); if (!member) return; await assignStaffToShift({ restaurant_id: shift.restaurant_id, shift_id: shift.id, staff_id: member.id, role_snapshot: member.role, starts_at: shift.planned_start, ends_at: shift.planned_end }); }, onSuccess: async () => { setMemberId(""); await qc.invalidateQueries({ queryKey: ["operations", "shift-assignments", shift.restaurant_id] }); toast.success(ar ? "تمت إضافة الموظف للوردية" : "Team member assigned"); }, onError: (error) => toast.error(humanError(error, lang)) });
  const assignedIds = new Set(assignments.map((row) => row.staff_id));
  const available = members.filter((row) => row.is_active && !assignedIds.has(row.id));

  return <section className="qs-card overflow-hidden border-orange-200 bg-gradient-to-br from-orange-50/70 to-card dark:border-orange-900/60 dark:from-orange-950/10">
    <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center sm:p-6"><div><div className="flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.08em] text-emerald-700"><span className="size-1.5 rounded-full bg-emerald-500" />{ar ? "مفتوحة الآن" : "Open now"}</span><span className="text-xs text-muted-foreground">{shift.shift_date}</span></div><h2 className="mt-3 font-display text-2xl font-bold tracking-[-.03em]">{shift.name}</h2><p className="mt-1 text-xs text-muted-foreground">{ar ? `${assignments.length} أعضاء في هذه الوردية` : `${assignments.length} team members on this shift`}</p></div>{canManage ? <Button variant="outline" className="gap-2" onClick={onClose}><StopCircle className="size-4" />{ar ? "إغلاق الوردية" : "Close shift"}</Button> : null}</div>
    <div className="border-t border-border/70 p-5"><div className="flex flex-wrap gap-2">{assignments.map((assignment) => { const member = members.find((row) => row.id === assignment.staff_id); return <AssignmentChip key={assignment.id} assignment={assignment} name={member?.name ?? (assignment.staff_id === currentStaffId ? (ar ? "أنت" : "You") : (ar ? "عضو فريق" : "Team member"))} canManage={canManage} restaurantId={shift.restaurant_id} ar={ar} lang={lang} />; })}{!assignments.length ? <span className="text-xs text-muted-foreground">{ar ? "لم تتم إضافة فريق بعد." : "No team members assigned yet."}</span> : null}</div>{canManage && available.length ? <div className="mt-4 flex max-w-xl flex-col gap-2 sm:flex-row"><Select value={memberId} onValueChange={setMemberId}><SelectTrigger className="flex-1"><SelectValue placeholder={ar ? "اختر موظفاً" : "Choose a team member"} /></SelectTrigger><SelectContent>{available.map((member) => <SelectItem key={member.id} value={member.id}>{member.name} · {ROLE_LABELS[member.role]?.[lang] ?? member.role}</SelectItem>)}</SelectContent></Select><Button disabled={!memberId || assign.isPending} onClick={() => assign.mutate()} className="gap-2"><UserPlus className="size-4" />{ar ? "إضافة" : "Assign"}</Button></div> : null}</div>
  </section>;
}

function ShiftRow({ shift, assignments, canManage, currentStaffId, ar, lang, onClose }: { shift: Shift; assignments: ShiftAssignment[]; canManage: boolean; currentStaffId: string; ar: boolean; lang: "en" | "ar"; onClose: () => void }) {
  const qc = useQueryClient();
  const open = useMutation({ mutationFn: () => openShift(shift.id, currentStaffId), onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["operations", "shifts", shift.restaurant_id] }); await qc.invalidateQueries({ queryKey: ["operations", "automated-alerts", shift.restaurant_id] }); toast.success(ar ? "تم فتح الوردية" : "Shift opened"); }, onError: (error) => toast.error(humanError(error, lang)) });
  return <article className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold">{shift.name}</h3><Status status={shift.status} ar={ar} /></div><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground"><span>{shift.shift_date}</span><span>{formatWindow(shift, ar)}</span><span className="inline-flex items-center gap-1"><UsersRound className="size-3" />{assignments.length}</span></div></div>{canManage ? <div className="flex gap-2">{shift.status === "planned" ? <Button size="sm" disabled={open.isPending} onClick={() => open.mutate()} className="gap-2"><PlayCircle className="size-4" />{ar ? "فتح" : "Open"}</Button> : null}{shift.status === "open" ? <Button size="sm" variant="outline" onClick={onClose}>{ar ? "إغلاق" : "Close"}</Button> : null}</div> : null}</article>;
}

function AssignmentChip({ assignment, name, canManage, restaurantId, ar, lang }: { assignment: ShiftAssignment; name: string; canManage: boolean; restaurantId: string; ar: boolean; lang: "en" | "ar" }) {
  const qc = useQueryClient();
  const update = useMutation({ mutationFn: (status: ShiftAssignmentStatus) => updateShiftAssignment(assignment.id, { status }), onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["operations", "shift-assignments", restaurantId] }); }, onError: (error) => toast.error(humanError(error, lang)) });
  const remove = useMutation({ mutationFn: () => removeShiftAssignment(assignment.id), onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["operations", "shift-assignments", restaurantId] }); }, onError: (error) => toast.error(humanError(error, lang)) });
  if (!canManage) return <span className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold">{name}</span>;
  return <div className="inline-flex items-center gap-1 rounded-full border border-border bg-card p-1 ps-3"><span className="text-xs font-semibold">{name}</span><Select value={assignment.status} onValueChange={(value) => update.mutate(value as ShiftAssignmentStatus)}><SelectTrigger className="h-7 w-[112px] border-0 bg-transparent px-2 text-[10px] shadow-none"><SelectValue /></SelectTrigger><SelectContent>{(["scheduled","present","late","absent","released"] as ShiftAssignmentStatus[]).map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent></Select><button type="button" onClick={() => remove.mutate()} className="rounded-full px-2 py-1 text-[10px] text-muted-foreground hover:text-destructive" aria-label={ar ? "إزالة" : "Remove"}>×</button></div>;
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
function Metric({ icon: Icon, label, value, active }: { icon: typeof CalendarClock; label: string; value: number; active?: boolean }) { return <article className="qs-stat flex min-h-28 items-center gap-4 p-4"><span className={cn("grid size-11 place-items-center rounded-2xl", active ? "bg-orange-500/10 text-[#ff5a0a]" : "bg-muted text-muted-foreground")}><Icon className="size-5" /></span><div><p className="text-xs font-semibold text-muted-foreground">{label}</p><p className="mt-1 font-display text-3xl font-bold tracking-[-.04em]">{value}</p></div></article>; }
function Status({ status, ar }: { status: Shift["status"]; ar: boolean }) { const label = status === "open" ? (ar ? "مفتوحة" : "Open") : status === "closed" ? (ar ? "مغلقة" : "Closed") : (ar ? "مخططة" : "Planned"); return <span className={cn("rounded-full px-2 py-1 text-[10px] font-bold", status === "open" ? "bg-emerald-500/10 text-emerald-700" : status === "closed" ? "bg-slate-500/10 text-slate-600" : "bg-blue-500/10 text-blue-600")}>{label}</span>; }
function formatWindow(shift: Shift, ar: boolean) { const fmt = (value: string | null) => value ? new Date(value).toLocaleTimeString(ar ? "ar-JO" : "en-JO", { hour: "2-digit", minute: "2-digit" }) : "—"; return `${fmt(shift.planned_start)} – ${fmt(shift.planned_end)}`; }
function EmptyShifts({ ar }: { ar: boolean }) { return <div className="p-10 text-center"><CalendarClock className="mx-auto size-9 text-muted-foreground" /><h3 className="mt-3 font-bold">{ar ? "لا توجد ورديات بعد" : "No shifts yet"}</h3><p className="mt-1 text-xs text-muted-foreground">{ar ? "أنشئ أول وردية لبدء الجدولة والتسليم." : "Create the first shift to start scheduling and handover."}</p></div>; }
function Denied({ ar }: { ar: boolean }) { return <div className="min-h-dvh bg-background"><AppHeader /><main className="qs-page"><section className="qs-card p-8 text-center"><CalendarClock className="mx-auto size-10 text-muted-foreground" /><h1 className="mt-4 text-xl font-bold">{ar ? "الورديات غير متاحة" : "Shifts are not available"}</h1><p className="mt-2 text-sm text-muted-foreground">{ar ? "هذا الحساب لا يملك وصول مساحة العمل لهذا المطعم." : "This account does not have work access for this restaurant."}</p></section></main></div>; }
