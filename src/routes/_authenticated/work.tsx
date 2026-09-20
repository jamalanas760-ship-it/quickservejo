import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Handshake,
  ListTodo,
  Plus,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { AppHeader } from "@/components/nav/AppHeader";
import { DetailRow, DetailSheet, formatStamp } from "@/components/operations/DetailSheet";
import { ShiftHandoverPanel } from "@/components/operations/ShiftHandoverPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAccess } from "@/hooks/useSession";
import { useWorkspaceScope } from "@/hooks/useWorkspace";
import { supabase } from "@/integrations/supabase/client";
import { humanError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { membershipHasCapability, ROLE_LABELS, type AppRole } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/work")({
  head: () => ({ meta: [{ title: "My Work — QuickServe" }, { name: "description", content: "Role-aware tasks, approvals and shift handover." }] }),
  component: WorkPage,
});

type WorkStatus = "open" | "in_progress" | "waiting_approval" | "completed" | "cancelled";
type WorkCategory = "task" | "approval" | "handover" | "alert";
type WorkPriority = "low" | "normal" | "high" | "urgent";
type Tab = "mine" | "team" | "approvals" | "handover" | "completed";

type WorkTask = {
  id: string;
  restaurant_id: string;
  title: string;
  description: string | null;
  category: WorkCategory;
  priority: WorkPriority;
  status: WorkStatus;
  assigned_staff_id: string | null;
  assigned_role: string | null;
  created_by_staff_id: string | null;
  due_at: string | null;
  requires_approval: boolean;
  approval_role: string | null;
  source_type: string | null;
  completion_note: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

type StaffOption = { id: string; name: string; role: AppRole; is_active: boolean };

const priorityTone: Record<WorkPriority, string> = {
  low: "bg-slate-500/10 text-slate-600",
  normal: "bg-blue-500/10 text-blue-600",
  high: "bg-amber-500/10 text-amber-700",
  urgent: "bg-red-500/10 text-red-600",
};

export function WorkPage() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const scope = useWorkspaceScope();
  const access = useAccess();
  const qc = useQueryClient();
  const rid = scope.restaurantId;
  const membership = rid ? access.membershipFor(rid) : null;
  const canView = Boolean(membership && membershipHasCapability(membership.role, membership.permission_overrides, "view_work"));
  const canCreate = Boolean(membership && membershipHasCapability(membership.role, membership.permission_overrides, "create_work"));
  const canManage = Boolean(membership && membershipHasCapability(membership.role, membership.permission_overrides, "manage_work"));
  const canApprove = Boolean(membership && membershipHasCapability(membership.role, membership.permission_overrides, "approve_work"));
  const [tab, setTab] = useState<Tab>("mine");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<WorkTask | null>(null);

  const tasks = useQuery({
    queryKey: ["work", rid],
    enabled: Boolean(rid && canView),
    staleTime: 10_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("work_tasks")
        .select("id,restaurant_id,title,description,category,priority,status,assigned_staff_id,assigned_role,created_by_staff_id,due_at,requires_approval,approval_role,source_type,completion_note,created_at,updated_at,completed_at")
        .eq("restaurant_id", rid!)
        .order("created_at", { ascending: false })
        .limit(250);
      if (error) throw error;
      return (data ?? []) as WorkTask[];
    },
  });

  const staff = useQuery({
    queryKey: ["work", "staff", rid],
    enabled: Boolean(rid && canManage),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase.from("staff") as any)
        .select("id,name,role,is_active")
        .eq("restaurant_id", rid!)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as StaffOption[];
    },
  });

  const visible = useMemo(() => {
    const rows = tasks.data ?? [];
    if (tab === "completed") return rows.filter((row) => row.status === "completed");
    if (tab === "approvals") return rows.filter((row) => row.category === "approval" || row.status === "waiting_approval");
    if (tab === "handover") return rows.filter((row) => row.category === "handover");
    if (tab === "team") return canManage ? rows.filter((row) => row.status !== "completed" && row.status !== "cancelled") : [];
    return rows.filter((row) => row.status !== "completed" && row.status !== "cancelled");
  }, [tasks.data, tab, canManage]);

  const counts = useMemo(() => {
    const rows = tasks.data ?? [];
    return {
      open: rows.filter((row) => row.status === "open" || row.status === "in_progress").length,
      urgent: rows.filter((row) => row.priority === "urgent" && row.status !== "completed" && row.status !== "cancelled").length,
      approvals: rows.filter((row) => row.category === "approval" || row.status === "waiting_approval").length,
      completed: rows.filter((row) => row.status === "completed").length,
    };
  }, [tasks.data]);

  const updateTask = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: WorkStatus }) => {
      const payload: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
      if (status === "completed") payload.completed_at = new Date().toISOString();
      const { error } = await (supabase as any).from("work_tasks").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["work", rid] });
      toast.success(ar ? "تم تحديث المهمة" : "Task updated");
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  // Manager-scoped removal. Until the soft-delete columns ship, the record is
  // retired as `cancelled` so history/audit stays intact and it drops out of
  // every active list. RLS still enforces the restaurant scope server-side.
  const removeTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("work_tasks")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("restaurant_id", rid!);
      if (error) throw error;
    },
    onSuccess: async () => {
      setPendingDelete(null);
      setSelectedId(null);
      await qc.invalidateQueries({ queryKey: ["work", rid] });
      await qc.invalidateQueries({ queryKey: ["operational-counters", rid] });
      toast.success(ar ? "تم حذف عنصر العمل" : "Work item removed");
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  const selected = (tasks.data ?? []).find((row) => row.id === selectedId) ?? null;

  if (scope.isPending || access.isPending) return <div className="min-h-dvh bg-background"><AppHeader /><main className="qs-page"><Skeleton className="h-[620px] rounded-3xl" /></main></div>;

  if (!rid || !membership || !canView) return <div className="min-h-dvh bg-background"><AppHeader /><main className="qs-page"><section className="qs-card p-8 text-center"><ShieldCheck className="mx-auto size-10 text-muted-foreground" /><h1 className="mt-4 text-xl font-bold">{ar ? "مساحة العمل غير متاحة" : "My Work is not available"}</h1><p className="mt-2 text-sm text-muted-foreground">{ar ? "لا يملك هذا الدور صلاحية مساحة العمل لهذا المطعم." : "This role does not have My Work access for this restaurant."}</p></section></main></div>;

  const tabs: Array<{ id: Tab; en: string; ar: string; show: boolean }> = [
    { id: "mine", en: "My Tasks", ar: "مهامي", show: true },
    { id: "team", en: "Team Tasks", ar: "مهام الفريق", show: canManage },
    { id: "approvals", en: "Approvals", ar: "الموافقات", show: canApprove || canManage },
    { id: "handover", en: "Handover", ar: "التسليم", show: true },
    { id: "completed", en: "Completed", ar: "مكتمل", show: true },
  ];

  return <div className="min-h-dvh bg-background">
    <AppHeader title={ar ? "عملي" : "My Work"} />
    <main className="qs-page space-y-5">
      <section className="overflow-hidden rounded-[28px] border border-border bg-card">
        <div className="grid gap-6 p-6 lg:grid-cols-[1fr_auto] lg:items-center sm:p-8">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-orange-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.16em] text-[#ff5a0a]"><ListTodo className="size-3.5" />{ar ? "مركز العمل التشغيلي" : "Operational work center"}</div>
            <h1 className="mt-4 font-display text-3xl font-bold tracking-[-.04em] sm:text-4xl">{ar ? `مرحباً، ${membership.name}` : `Good work starts here, ${membership.name}`}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{ar ? "مكان واحد للمهام والموافقات والتنبيهات وتسليم الوردية — حسب دورك فقط." : "One place for tasks, approvals, alerts and shift handover — scoped to your role and restaurant."}</p>
          </div>
          {canCreate ? <CreateTaskDialog open={createOpen} onOpenChange={setCreateOpen} restaurantId={rid} currentStaffId={membership.id} currentRole={membership.role} staff={staff.data ?? []} canManage={canManage} ar={ar} lang={lang} onCreated={async () => { setCreateOpen(false); await qc.invalidateQueries({ queryKey: ["work", rid] }); }} /> : null}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={ListTodo} label={ar ? "قيد التنفيذ" : "Active work"} value={counts.open} />
        <Metric icon={AlertTriangle} label={ar ? "عاجل" : "Urgent"} value={counts.urgent} tone="urgent" />
        <Metric icon={ShieldCheck} label={ar ? "موافقات" : "Approvals"} value={counts.approvals} />
        <Metric icon={CheckCircle2} label={ar ? "مكتمل" : "Completed"} value={counts.completed} />
      </section>

      <section className="qs-card overflow-hidden">
        <div className="overflow-x-auto border-b border-border p-2"><div className="flex min-w-max gap-1">{tabs.filter((item) => item.show).map((item) => <button key={item.id} type="button" onClick={() => setTab(item.id)} className={cn("rounded-xl px-4 py-2.5 text-xs font-bold transition", tab === item.id ? "bg-[#ff5a0a] text-white shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>{ar ? item.ar : item.en}</button>)}</div></div>
        {tab === "handover" ? <ShiftHandoverPanel restaurantId={rid} currentStaffId={membership.id} currentRole={membership.role} /> : null}
        {tasks.isPending ? <div className="p-5"><Skeleton className="h-64 rounded-2xl" /></div> : tasks.isError ? <p className="p-6 text-sm text-destructive">{humanError(tasks.error, lang)}</p> : visible.length === 0 ? <EmptyState ar={ar} /> : <div className="divide-y divide-border">{visible.map((task) => <TaskRow key={task.id} task={task} staff={staff.data ?? []} ar={ar} canApprove={canApprove} busy={updateTask.isPending} onStatus={(status) => updateTask.mutate({ id: task.id, status })} onOpen={() => setSelectedId(task.id)} />)}</div>}
      </section>
    </main>

    <DetailSheet
      open={Boolean(selected)}
      onOpenChange={(open) => { if (!open) setSelectedId(null); }}
      title={selected?.title ?? ""}
      description={selected ? `${ar ? "نوع" : "Type"}: ${selected.category} · ${selected.status.replaceAll("_", " ")}` : undefined}
      footer={selected && canManage ? <Button variant="destructive" className="w-full gap-2" onClick={() => setPendingDelete(selected)}><Trash2 className="size-4" />{ar ? "حذف عنصر العمل" : "Delete work item"}</Button> : undefined}
    >
      {selected ? <div>
        {selected.description ? <p className="mb-4 whitespace-pre-wrap rounded-2xl bg-muted/40 p-3 text-sm leading-6">{selected.description}</p> : null}
        <DetailRow label={ar ? "النوع" : "Type"} value={<span className="capitalize">{selected.category}</span>} />
        <DetailRow label={ar ? "الحالة" : "Status"} value={<span className="capitalize">{selected.status.replaceAll("_", " ")}</span>} />
        <DetailRow label={ar ? "الأولوية" : "Priority"} value={<Badge className={cn("border-0 capitalize", priorityTone[selected.priority])}>{selected.priority}</Badge>} />
        <DetailRow label={ar ? "المسؤول" : "Assigned to"} value={(selected.assigned_staff_id ? (staff.data ?? []).find((row) => row.id === selected.assigned_staff_id)?.name : null) ?? (selected.assigned_role ? roleLabel(selected.assigned_role, ar) : (ar ? "غير معيّن" : "Unassigned"))} />
        <DetailRow label={ar ? "أنشأها" : "Created by"} value={(selected.created_by_staff_id ? (staff.data ?? []).find((row) => row.id === selected.created_by_staff_id)?.name : null) ?? (ar ? "النظام / الأتمتة" : "System / automation")} />
        <DetailRow label={ar ? "الاستحقاق" : "Due"} value={formatStamp(selected.due_at, ar)} />
        <DetailRow label={ar ? "الموافقة" : "Approval"} value={selected.requires_approval ? (selected.approval_role ? roleLabel(selected.approval_role, ar) : (ar ? "مطلوبة" : "Required")) : (ar ? "غير مطلوبة" : "Not required")} />
        <DetailRow label={ar ? "المصدر" : "Source"} value={selected.source_type ? selected.source_type.replaceAll("_", " ") : (ar ? "يدوي" : "Manual")} />
        <DetailRow label={ar ? "أُنشئت" : "Created"} value={formatStamp(selected.created_at, ar)} />
        <DetailRow label={ar ? "آخر تحديث" : "Updated"} value={formatStamp(selected.updated_at, ar)} />
        <DetailRow label={ar ? "أُكملت" : "Completed"} value={formatStamp(selected.completed_at, ar)} />
        <DetailRow label={ar ? "ملاحظة الإنجاز" : "Completion note"} value={selected.completion_note} />
      </div> : null}
    </DetailSheet>

    <Dialog open={Boolean(pendingDelete)} onOpenChange={(open) => { if (!open) setPendingDelete(null); }}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{ar ? "حذف عنصر العمل؟" : "Delete this work item?"}</DialogTitle>
          <DialogDescription>{ar ? "سيختفي من قوائم العمل النشطة مع الحفاظ على سجله للمراجعة. لا يمكن التراجع من الواجهة." : "It disappears from active work lists while its record is kept for audit. This cannot be undone from the app."}</DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setPendingDelete(null)}>{ar ? "إلغاء" : "Cancel"}</Button>
          <Button variant="destructive" disabled={removeTask.isPending} onClick={() => pendingDelete && removeTask.mutate(pendingDelete.id)}><Trash2 className="size-4" />{ar ? "حذف" : "Delete"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </div>;
}

function Metric({ icon: Icon, label, value, tone }: { icon: typeof ListTodo; label: string; value: number; tone?: "urgent" }) {
  return <article className="qs-stat flex min-h-[112px] items-center gap-4 p-4"><span className={cn("grid size-11 place-items-center rounded-2xl", tone === "urgent" ? "bg-red-500/10 text-red-600" : "bg-orange-500/10 text-[#ff5a0a]")}><Icon className="size-5" /></span><div><p className="text-[11px] font-semibold text-muted-foreground">{label}</p><strong className="mt-1 block font-display text-3xl tracking-[-.04em]">{value}</strong></div></article>;
}

function TaskRow({ task, staff, ar, canApprove, busy, onStatus, onOpen }: { task: WorkTask; staff: StaffOption[]; ar: boolean; canApprove: boolean; busy: boolean; onStatus: (status: WorkStatus) => void; onOpen: () => void }) {
  const assignee = task.assigned_staff_id ? staff.find((row) => row.id === task.assigned_staff_id)?.name : null;
  const overdue = task.due_at && new Date(task.due_at).getTime() < Date.now() && task.status !== "completed";
  const CategoryIcon = task.category === "approval" ? ShieldCheck : task.category === "handover" ? Handshake : task.category === "alert" ? AlertTriangle : ClipboardCheck;
  return <article
    role="button"
    tabIndex={0}
    aria-label={task.title}
    onClick={onOpen}
    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(); } }}
    className="grid cursor-pointer gap-4 p-4 outline-none transition hover:bg-muted/20 focus-visible:ring-2 focus-visible:ring-[#ff5a0a] sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
  >
    <div className="flex min-w-0 gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground"><CategoryIcon className="size-4" /></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold">{task.title}</h3><Badge className={cn("border-0 capitalize", priorityTone[task.priority])}>{task.priority}</Badge>{overdue ? <Badge variant="destructive">{ar ? "متأخر" : "Overdue"}</Badge> : null}</div>{task.description ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{task.description}</p> : null}<div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-semibold text-muted-foreground"><span className="inline-flex items-center gap-1"><UserRound className="size-3" />{assignee ?? (task.assigned_role ? roleLabel(task.assigned_role, ar) : (ar ? "غير معيّن" : "Unassigned"))}</span>{task.due_at ? <span className="inline-flex items-center gap-1"><Clock3 className="size-3" />{new Date(task.due_at).toLocaleString(ar ? "ar-JO" : "en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span> : null}<span className="capitalize">{task.status.replaceAll("_", " ")}</span></div></div></div>
    <div className="flex flex-wrap gap-2 lg:justify-end" onClick={(event) => event.stopPropagation()}>{task.status === "open" ? <Button variant="outline" size="sm" disabled={busy} onClick={() => onStatus("in_progress")}>{ar ? "بدء" : "Start"}</Button> : null}{task.status === "in_progress" && task.requires_approval ? <Button variant="outline" size="sm" disabled={busy} onClick={() => onStatus("waiting_approval")}>{ar ? "إرسال للموافقة" : "Submit"}</Button> : null}{task.status === "in_progress" && !task.requires_approval ? <Button size="sm" disabled={busy} onClick={() => onStatus("completed")}>{ar ? "إكمال" : "Complete"}</Button> : null}{task.status === "waiting_approval" && canApprove ? <Button size="sm" disabled={busy} onClick={() => onStatus("completed")}><CheckCircle2 className="size-4" />{ar ? "اعتماد" : "Approve"}</Button> : null}</div>
  </article>;
}

function CreateTaskDialog({ open, onOpenChange, restaurantId, currentStaffId, currentRole, staff, canManage, ar, lang, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; restaurantId: string; currentStaffId: string; currentRole: AppRole; staff: StaffOption[]; canManage: boolean; ar: boolean; lang: "ar" | "en"; onCreated: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") ?? "").trim();
    if (!title) return;
    const category = String(form.get("category") ?? "task") as WorkCategory;
    const priority = String(form.get("priority") ?? "normal") as WorkPriority;
    const assignment = String(form.get("assignment") ?? `staff:${currentStaffId}`);
    const assignedStaffId = assignment.startsWith("staff:") ? assignment.slice(6) : null;
    const assignedRole = assignment.startsWith("role:") ? assignment.slice(5) : null;
    setSaving(true);
    try {
      const dueRaw = String(form.get("due_at") ?? "");
      const requiresApproval = category === "approval" || form.get("requires_approval") === "on";
      const { error } = await (supabase as any).from("work_tasks").insert({
        restaurant_id: restaurantId,
        title,
        description: String(form.get("description") ?? "").trim() || null,
        category,
        priority,
        assigned_staff_id: assignedStaffId,
        assigned_role: assignedRole,
        created_by_staff_id: currentStaffId,
        due_at: dueRaw ? new Date(dueRaw).toISOString() : null,
        requires_approval: requiresApproval,
        approval_role: requiresApproval ? "restaurant_admin" : null,
        status: "open",
      });
      if (error) throw error;
      toast.success(ar ? "تم إنشاء العمل" : "Work item created");
      await onCreated();
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally { setSaving(false); }
  }
  const roleAssignments = canManage ? (["operations_manager", "manager", "kitchen", "waiter", "cashier", "host", "inventory", "procurement", "accountant"] as AppRole[]) : [currentRole];
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogTrigger asChild><Button className="min-h-11 rounded-xl"><Plus className="size-4" />{ar ? "عمل جديد" : "New work"}</Button></DialogTrigger><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>{ar ? "إنشاء مهمة تشغيلية" : "Create operational work"}</DialogTitle><DialogDescription>{ar ? "عيّن مهمة أو موافقة أو تسليم وردية للشخص أو الدور المناسب." : "Assign a task, approval or handover to the right person or role."}</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={submit}><Field label={ar ? "العنوان" : "Title"}><Input name="title" required maxLength={160} /></Field><Field label={ar ? "الوصف" : "Description"}><Textarea name="description" rows={3} /></Field><div className="grid gap-3 sm:grid-cols-2"><Field label={ar ? "النوع" : "Type"}><Select name="category" defaultValue="task"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="task">{ar ? "مهمة" : "Task"}</SelectItem><SelectItem value="approval">{ar ? "موافقة" : "Approval"}</SelectItem><SelectItem value="handover">{ar ? "تسليم وردية" : "Handover"}</SelectItem><SelectItem value="alert">{ar ? "تنبيه تشغيلي" : "Operational alert"}</SelectItem></SelectContent></Select></Field><Field label={ar ? "الأولوية" : "Priority"}><Select name="priority" defaultValue="normal"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="normal">Normal</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent></Select></Field></div><Field label={ar ? "التعيين" : "Assign to"}><Select name="assignment" defaultValue={`staff:${currentStaffId}`}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={`staff:${currentStaffId}`}>{ar ? "أنا" : "Myself"}</SelectItem>{canManage ? staff.filter((row) => row.id !== currentStaffId).map((row) => <SelectItem key={row.id} value={`staff:${row.id}`}>{row.name} · {ROLE_LABELS[row.role]?.[ar ? "ar" : "en"] ?? row.role}</SelectItem>) : null}{roleAssignments.map((role) => <SelectItem key={role} value={`role:${role}`}>{ar ? "كل" : "All"} {ROLE_LABELS[role]?.[ar ? "ar" : "en"] ?? role}</SelectItem>)}</SelectContent></Select></Field><Field label={ar ? "موعد الاستحقاق" : "Due date"}><Input name="due_at" type="datetime-local" /></Field><label className="flex items-center gap-3 rounded-xl border border-border p-3 text-xs font-semibold"><input name="requires_approval" type="checkbox" className="size-4 accent-[#ff5a0a]" />{ar ? "تتطلب موافقة الإدارة قبل الإغلاق" : "Require management approval before closing"}</label><div className="flex justify-end gap-2 pt-2"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{ar ? "إلغاء" : "Cancel"}</Button><Button type="submit" disabled={saving}>{saving ? (ar ? "جارٍ الإنشاء…" : "Creating…") : (ar ? "إنشاء" : "Create")}</Button></div></form></DialogContent></Dialog>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="space-y-1.5"><Label>{label}</Label>{children}</label>; }
function EmptyState({ ar }: { ar: boolean }) { return <div className="grid min-h-[280px] place-items-center p-8 text-center"><div><CheckCircle2 className="mx-auto size-10 text-emerald-500" /><h3 className="mt-3 font-bold">{ar ? "كل شيء تحت السيطرة" : "Everything is under control"}</h3><p className="mt-1 text-xs text-muted-foreground">{ar ? "لا توجد عناصر في هذا القسم حالياً." : "There are no work items in this section right now."}</p></div></div>; }
function roleLabel(value: string, ar: boolean) { const role = value as AppRole; return ROLE_LABELS[role]?.[ar ? "ar" : "en"] ?? value.replaceAll("_", " "); }
