import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Handshake,
  GripVertical,
  LayoutGrid,
  ListTodo,
  Pencil,
  Plus,
  Rows3,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { MasterEyebrow, MasterKpi, MasterPageHeader } from "@/components/app/MasterPage";
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
type ViewMode = "cards" | "list";
type QuickFocus = "all" | "open" | "due_today" | "overdue" | "completed";
type SortMode = "due" | "priority" | "newest";

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
  source_id: string | null;
  completion_note: string | null;
  approval_status: string;
  approval_note: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

type StaffOption = { id: string; name: string; role: AppRole; is_active: boolean };
type WorkActivity = { id: string; actor_staff_id: string | null; action: string; note: string | null; created_at: string };

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
  const canDelete = membership?.role === "restaurant_admin";
  const canApprove = Boolean(membership && membershipHasCapability(membership.role, membership.permission_overrides, "approve_work"));
  const [tab, setTab] = useState<Tab>("mine");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<WorkTask | null>(null);
  const [editingTask, setEditingTask] = useState<WorkTask | null>(null);
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<"all" | WorkPriority>("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | WorkStatus>("all");
  const [creatorFilter, setCreatorFilter] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("due");
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [quickFocus, setQuickFocus] = useState<QuickFocus>("all");
  const [comment, setComment] = useState("");

  const tasks = useQuery({
    queryKey: ["work", rid],
    enabled: Boolean(rid && canView),
    staleTime: 10_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("work_tasks")
        .select("id,restaurant_id,title,description,category,priority,status,assigned_staff_id,assigned_role,created_by_staff_id,due_at,requires_approval,approval_role,source_type,source_id,completion_note,approval_status,approval_note,deleted_at,created_at,updated_at,completed_at")
        .eq("restaurant_id", rid!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(250);
      if (error) throw error;
      return (data ?? []) as WorkTask[];
    },
  });

  const staff = useQuery({
    queryKey: ["work", "staff", rid],
    enabled: Boolean(rid && canView),
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
    const now = Date.now();
    const todayKey = new Date().toLocaleDateString("en-CA");

    let next = tab === "completed"
      ? rows.filter((row) => row.status === "completed")
      : tab === "approvals"
        ? rows.filter((row) => row.category === "approval" || row.status === "waiting_approval")
        : tab === "handover"
          ? rows.filter((row) => row.category === "handover")
          : tab === "team"
            ? (canManage ? rows.filter((row) => row.status !== "completed" && row.status !== "cancelled") : [])
            : rows.filter((row) =>
                row.status !== "completed"
                && row.status !== "cancelled"
                && (row.assigned_staff_id === membership?.id || row.assigned_role === membership?.role || (!row.assigned_staff_id && !row.assigned_role)),
              );

    if (quickFocus === "open") next = next.filter((row) => row.status === "open" || row.status === "in_progress" || row.status === "waiting_approval");
    if (quickFocus === "completed") next = next.filter((row) => row.status === "completed");
    if (quickFocus === "overdue") next = next.filter((row) => row.due_at && new Date(row.due_at).getTime() < now && row.status !== "completed" && row.status !== "cancelled");
    if (quickFocus === "due_today") next = next.filter((row) => row.due_at && new Date(row.due_at).toLocaleDateString("en-CA") === todayKey && row.status !== "completed" && row.status !== "cancelled");

    const q = search.trim().toLowerCase();
    if (q) next = next.filter((row) => [row.title, row.description, row.assigned_role, row.source_type].some((value) => value?.toLowerCase().includes(q)));
    if (priorityFilter !== "all") next = next.filter((row) => row.priority === priorityFilter);
    if (assigneeFilter !== "all") next = next.filter((row) => row.assigned_staff_id === assigneeFilter);
    if (statusFilter !== "all") next = next.filter((row) => row.status === statusFilter);
    if (creatorFilter !== "all") next = next.filter((row) => row.created_by_staff_id === creatorFilter);

    const priorityRank: Record<WorkPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
    return [...next].sort((a, b) => {
      if (sortMode === "priority") return priorityRank[a.priority] - priorityRank[b.priority] || new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortMode === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      const ad = a.due_at ? new Date(a.due_at).getTime() : Number.MAX_SAFE_INTEGER;
      const bd = b.due_at ? new Date(b.due_at).getTime() : Number.MAX_SAFE_INTEGER;
      return ad - bd || priorityRank[a.priority] - priorityRank[b.priority];
    });
  }, [tasks.data, tab, canManage, membership?.id, membership?.role, quickFocus, search, priorityFilter, assigneeFilter, statusFilter, creatorFilter, sortMode]);

  const counts = useMemo(() => {
    const rows = tasks.data ?? [];
    const todayKey = new Date().toLocaleDateString("en-CA");
    const now = Date.now();
    return {
      open: rows.filter((row) => row.status === "open" || row.status === "in_progress" || row.status === "waiting_approval").length,
      dueToday: rows.filter((row) => row.due_at && new Date(row.due_at).toLocaleDateString("en-CA") === todayKey && row.status !== "completed" && row.status !== "cancelled").length,
      overdue: rows.filter((row) => row.due_at && new Date(row.due_at).getTime() < now && row.status !== "completed" && row.status !== "cancelled").length,
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

  const assignTask = useMutation({
    mutationFn: async ({ id, assignedStaffId }: { id: string; assignedStaffId: string }) => {
      if (!canManage) throw new Error("Assignment permission is required.");
      const { error } = await (supabase as any).from("work_tasks")
        .update({ assigned_staff_id: assignedStaffId, assigned_role: null, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("restaurant_id", rid!);
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["work", rid] }),
        qc.invalidateQueries({ queryKey: ["operational-counters", rid] }),
      ]);
      toast.success(ar ? "تم تحديث المسؤول" : "Assignee updated");
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  const editTaskDetails = useMutation({
    mutationFn: async ({ task, title, description, priority, dueAt }: { task: WorkTask; title: string; description: string; priority: WorkPriority; dueAt: string }) => {
      if (task.created_by_staff_id !== membership?.id) throw new Error("Only the creator can edit this work item.");
      const { error } = await (supabase as any).rpc("update_own_work_task_details", {
        _task_id: task.id,
        _title: title.trim(),
        _description: description.trim() || null,
        _priority: priority,
        _due_at: dueAt ? new Date(dueAt).toISOString() : null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setEditingTask(null);
      await qc.invalidateQueries({ queryKey: ["work", rid] });
      toast.success(ar ? "تم تحديث المهمة" : "Work item updated");
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  const removeTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).rpc("archive_work_task", { _task_id: id });
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
  const activity = useQuery({
    queryKey: ["work", "activity", selectedId],
    enabled: Boolean(selectedId),
    staleTime: 10_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("work_task_activity")
        .select("id,actor_staff_id,action,note,created_at")
        .eq("task_id", selectedId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as WorkActivity[];
    },
  });

  const addComment = useMutation({
    mutationFn: async () => {
      if (!selected || !membership || !comment.trim()) return;
      const { error } = await (supabase as any).from("work_task_activity").insert({
        task_id: selected.id,
        restaurant_id: selected.restaurant_id,
        actor_staff_id: membership.id,
        action: "comment",
        note: comment.trim(),
        metadata: {},
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setComment("");
      await qc.invalidateQueries({ queryKey: ["work", "activity", selectedId] });
      toast.success(ar ? "تمت إضافة التعليق" : "Comment added");
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

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
    <main className="qs-page qs-compact-page qs-viewport-page">
      <MasterPageHeader
        eyebrow={<MasterEyebrow icon={ListTodo}>{ar?"مساحة العمل":"My Workspace"}</MasterEyebrow>}
        title={ar?"العمل المطلوب بدون تشتيت":"The Work That Needs Attention"}
        description={ar?`مرحباً ${membership.name}. راقب ما عليك اليوم، ما تأخر وما يحتاج موافقة من مكان واحد.`:`Welcome, ${membership.name}. See what is due today, overdue, and waiting for approval from one focused workspace.`}
        actions={canCreate?<CreateTaskDialog open={createOpen} onOpenChange={setCreateOpen} restaurantId={rid} currentStaffId={membership.id} currentRole={membership.role} staff={staff.data??[]} canManage={canManage} ar={ar} lang={lang} onCreated={async()=>{setCreateOpen(false);await qc.invalidateQueries({queryKey:["work",rid]});}}/>:null}
      />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MasterKpi icon={ListTodo} label={ar?"مفتوح":"Open"} value={String(counts.open)} hint={ar?"عناصر نشطة":"Active items"} tone="orange"/>
        <MasterKpi icon={Clock3} label={ar?"مستحق اليوم":"Due Today"} value={String(counts.dueToday)} hint={ar?"ينتهي اليوم":"Due by end of day"} tone="blue"/>
        <MasterKpi icon={AlertTriangle} label={ar?"متأخر":"Overdue"} value={String(counts.overdue)} hint={ar?"تحتاج انتباه":"Need attention"} tone={counts.overdue>0?"red":"slate"}/>
        <MasterKpi icon={CheckCircle2} label={ar?"مكتمل":"Completed"} value={String(counts.completed)} hint={ar?"مغلقة":"Closed items"} tone="green"/>
      </section>

      <section className="qs-card qs-viewport-fill flex min-h-0 flex-col overflow-hidden">
        <div className="border-b border-border p-3 sm:p-4">
          <div className="grid gap-2 xl:grid-cols-[auto_minmax(0,1fr)] xl:items-center">
            <div className="flex flex-wrap gap-1">{tabs.filter((item) => item.show).map((item) => <button key={item.id} type="button" onClick={() => { setTab(item.id); setQuickFocus("all"); }} className={cn("rounded-[9px] px-3 py-2 text-[11px] font-bold transition", tab === item.id ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>{ar ? item.ar : item.en}</button>)}</div>
            {tab !== "handover" ? <div className="flex flex-wrap items-center gap-1.5 xl:justify-end">
              <div className="qs-search-field min-w-[210px] flex-1 xl:max-w-[250px]"><Search /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="h-9 qs-search-input" placeholder={ar ? "بحث بالعنوان أو الوصف" : "Search work"} /></div>
              <Select value={priorityFilter} onValueChange={(value) => setPriorityFilter(value as "all" | WorkPriority)}><SelectTrigger className="h-9 w-[118px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{ar ? "الأولوية" : "Priority"}</SelectItem><SelectItem value="urgent">Urgent</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="normal">Normal</SelectItem><SelectItem value="low">Low</SelectItem></SelectContent></Select>
              <Select value={assigneeFilter} onValueChange={setAssigneeFilter}><SelectTrigger className="h-9 w-[138px]"><SelectValue placeholder={ar ? "المسؤول" : "Assignee"} /></SelectTrigger><SelectContent><SelectItem value="all">{ar ? "كل المسؤولين" : "All assignees"}</SelectItem>{(staff.data ?? []).map((row)=><SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>)}</SelectContent></Select>
              <Select value={statusFilter} onValueChange={(value)=>setStatusFilter(value as "all" | WorkStatus)}><SelectTrigger className="h-9 w-[126px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{ar ? "كل الحالات" : "All status"}</SelectItem><SelectItem value="open">{ar ? "مفتوح" : "To do"}</SelectItem><SelectItem value="in_progress">{ar ? "قيد التنفيذ" : "In progress"}</SelectItem><SelectItem value="waiting_approval">{ar ? "مراجعة" : "Review"}</SelectItem><SelectItem value="completed">{ar ? "مكتمل" : "Done"}</SelectItem></SelectContent></Select>
              <Select value={creatorFilter} onValueChange={setCreatorFilter}><SelectTrigger className="h-9 w-[132px]"><SelectValue placeholder={ar ? "المنشئ" : "Created by"} /></SelectTrigger><SelectContent><SelectItem value="all">{ar ? "كل المنشئين" : "All creators"}</SelectItem>{(staff.data ?? []).map((row)=><SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>)}</SelectContent></Select>
              <Select value={sortMode} onValueChange={(value) => setSortMode(value as SortMode)}><SelectTrigger className="h-9 w-[112px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="due">{ar ? "الاستحقاق" : "Due date"}</SelectItem><SelectItem value="priority">{ar ? "الأولوية" : "Priority"}</SelectItem><SelectItem value="newest">{ar ? "الأحدث" : "Newest"}</SelectItem></SelectContent></Select>
              <div className="inline-grid grid-cols-2 rounded-[10px] border border-border p-0.5"><button type="button" onClick={() => setViewMode("cards")} aria-label={ar ? "عرض بطاقات" : "Card view"} className={cn("grid size-8 place-items-center rounded-lg", viewMode === "cards" ? "bg-muted text-foreground" : "text-muted-foreground")}><LayoutGrid className="size-4" /></button><button type="button" onClick={() => setViewMode("list")} aria-label={ar ? "عرض قائمة" : "List view"} className={cn("grid size-8 place-items-center rounded-lg", viewMode === "list" ? "bg-muted text-foreground" : "text-muted-foreground")}><Rows3 className="size-4" /></button></div>
            </div> : null}
          </div>
        </div>
        {tab === "handover" ? <ShiftHandoverPanel restaurantId={rid} currentStaffId={membership.id} currentRole={membership.role} /> : null}
        {tab !== "handover" ? tasks.isPending ? <div className="p-5"><Skeleton className="h-64 rounded-2xl" /></div> : tasks.isError ? <p className="p-6 text-sm text-destructive">{humanError(tasks.error, lang)}</p> : visible.length === 0 ? <EmptyState ar={ar} /> : viewMode === "cards" ? <WorkflowBoard tasks={visible} staff={staff.data ?? []} ar={ar} canApprove={canApprove} busy={updateTask.isPending} onStatus={(task, status) => updateTask.mutate({ id: task.id, status })} onOpen={(task) => setSelectedId(task.id)} /> : <div className="qs-scroll-region min-h-0 flex-1 divide-y divide-border">{visible.map((task) => <TaskRow key={task.id} task={task} staff={staff.data ?? []} ar={ar} canApprove={canApprove} busy={updateTask.isPending} onStatus={(status) => updateTask.mutate({ id: task.id, status })} onOpen={() => setSelectedId(task.id)} />)}</div> : null}
      </section>
    </main>

    <DetailSheet
      open={Boolean(selected)}
      onOpenChange={(open) => { if (!open) setSelectedId(null); }}
      title={selected?.title ?? ""}
      description={selected ? `${ar ? "نوع" : "Type"}: ${selected.category} · ${selected.status.replaceAll("_", " ")}` : undefined}
      footer={selected ? <div className="grid w-full gap-2 sm:grid-cols-2">{selected.created_by_staff_id === membership.id ? <Button variant="outline" className="gap-2" onClick={() => setEditingTask(selected)}><Pencil className="size-4" />{ar ? "تعديل المهمة" : "Edit work item"}</Button> : <div className="rounded-xl bg-muted/50 px-3 py-2 text-center text-[10px] font-semibold text-muted-foreground">{ar ? "التعديل متاح لمنشئ المهمة فقط" : "Only the creator can edit core details"}</div>}{canDelete ? <Button variant="destructive" className="gap-2" onClick={() => setPendingDelete(selected)}><Trash2 className="size-4" />{ar ? "حذف عنصر العمل" : "Delete work item"}</Button> : null}</div> : undefined}
    >
      {selected ? <div>
        {selected.description ? <p className="mb-4 whitespace-pre-wrap rounded-2xl bg-muted/40 p-3 text-sm leading-6">{selected.description}</p> : null}
        <DetailRow label={ar ? "النوع" : "Type"} value={<span className="capitalize">{selected.category}</span>} />
        <DetailRow label={ar ? "الحالة" : "Status"} value={<span className="capitalize">{selected.status.replaceAll("_", " ")}</span>} />
        <DetailRow label={ar ? "الأولوية" : "Priority"} value={<Badge className={cn("border-0 capitalize", priorityTone[selected.priority])}>{selected.priority}</Badge>} />
        <DetailRow label={ar ? "المسؤول" : "Assigned to"} value={(selected.assigned_staff_id ? (staff.data ?? []).find((row) => row.id === selected.assigned_staff_id)?.name : null) ?? (selected.assigned_role ? roleLabel(selected.assigned_role, ar) : (ar ? "غير معيّن" : "Unassigned"))} />
        {canManage ? <section className="my-3 rounded-xl border border-border bg-muted/20 p-3"><div className="mb-2 flex items-center justify-between gap-3"><Label className="text-[10px] font-bold uppercase tracking-[.08em] text-muted-foreground">{ar ? "إعادة تعيين المسؤول" : "Reassign"}</Label><span className="text-[9px] text-muted-foreground">{ar ? "تحديث فوري" : "Updates immediately"}</span></div><Select value={selected.assigned_staff_id ?? ""} onValueChange={(value) => assignTask.mutate({ id: selected.id, assignedStaffId: value })}><SelectTrigger className="h-10 rounded-[10px] bg-card"><SelectValue placeholder={ar ? "اختر موظفاً" : "Choose a team member"} /></SelectTrigger><SelectContent>{(staff.data ?? []).map((row) => <SelectItem key={row.id} value={row.id}>{row.name} · {ROLE_LABELS[row.role]?.[lang] ?? row.role}</SelectItem>)}</SelectContent></Select></section> : null}
        <DetailRow label={ar ? "أنشأها" : "Created by"} value={(selected.created_by_staff_id ? (staff.data ?? []).find((row) => row.id === selected.created_by_staff_id)?.name : null) ?? (ar ? "النظام / الأتمتة" : "System / automation")} />
        <DetailRow label={ar ? "الاستحقاق" : "Due"} value={formatStamp(selected.due_at, ar)} />
        <DetailRow label={ar ? "الموافقة" : "Approval"} value={selected.requires_approval ? (selected.approval_role ? roleLabel(selected.approval_role, ar) : (ar ? "مطلوبة" : "Required")) : (ar ? "غير مطلوبة" : "Not required")} />
        <DetailRow label={ar ? "حالة الموافقة" : "Approval status"} value={selected.approval_status?.replaceAll("_", " ")} />
        <DetailRow label={ar ? "ملاحظة الموافقة" : "Approval note"} value={selected.approval_note} />
        <DetailRow label={ar ? "المصدر" : "Source"} value={selected.source_type ? selected.source_type.replaceAll("_", " ") : (ar ? "يدوي" : "Manual")} />
        <DetailRow label={ar ? "مرجع المصدر" : "Source record"} value={selected.source_id} />
        <DetailRow label={ar ? "أُنشئت" : "Created"} value={formatStamp(selected.created_at, ar)} />
        <DetailRow label={ar ? "آخر تحديث" : "Updated"} value={formatStamp(selected.updated_at, ar)} />
        <DetailRow label={ar ? "أُكملت" : "Completed"} value={formatStamp(selected.completed_at, ar)} />
        <DetailRow label={ar ? "ملاحظة الإنجاز" : "Completion note"} value={selected.completion_note} />
        <div className="mt-4 rounded-xl border border-border bg-muted/20 p-3">
          <Label className="text-[10px] font-bold uppercase tracking-[.08em] text-muted-foreground">{ar ? "إضافة تعليق" : "Add comment"}</Label>
          <div className="mt-2 flex gap-2"><Input value={comment} onChange={(event)=>setComment(event.target.value)} onKeyDown={(event)=>{if(event.key==="Enter"&&!event.shiftKey&&comment.trim()){event.preventDefault();addComment.mutate();}}} placeholder={ar ? "اكتب تحديثاً أو ملاحظة..." : "Write an update or note..."} className="h-9"/><Button size="sm" disabled={!comment.trim()||addComment.isPending} onClick={()=>addComment.mutate()}>{ar ? "إضافة" : "Add"}</Button></div>
        </div>
        {(activity.data ?? []).length ? <div className="mt-4"><h3 className="text-xs font-bold uppercase tracking-[.08em] text-muted-foreground">{ar ? "سجل النشاط" : "Activity history"}</h3><div className="mt-2 space-y-2">{(activity.data ?? []).map((item) => <div key={item.id} className={cn("rounded-xl border p-3",item.action==="comment"?"border-orange-200/70 bg-orange-500/[.035] dark:border-orange-900/40":"border-border/70")}><div className="flex items-center justify-between gap-3"><strong className="text-xs capitalize">{item.action==="comment"?(ar?"تعليق":"Comment"):item.action.replaceAll("_", " ")}</strong><span className="text-[10px] text-muted-foreground">{formatStamp(item.created_at, ar)}</span></div>{item.note ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.note}</p> : null}<p className="mt-1 text-[10px] text-muted-foreground">{item.actor_staff_id ? ((staff.data ?? []).find((row) => row.id === item.actor_staff_id)?.name ?? (ar ? "عضو فريق" : "Team member")) : (ar ? "النظام" : "System")}</p></div>)}</div></div> : null}
      </div> : null}
    </DetailSheet>

    <EditTaskDialog
      task={editingTask}
      open={Boolean(editingTask)}
      onOpenChange={(open) => { if (!open) setEditingTask(null); }}
      ar={ar}
      busy={editTaskDetails.isPending}
      onSave={(values) => editingTask && editTaskDetails.mutate({ task: editingTask, ...values })}
    />

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

function Metric({ icon: Icon, label, value, tone, active, onClick }: { icon: typeof ListTodo; label: string; value: number; tone?: "urgent"; active?: boolean; onClick?: () => void }) {
  return <button type="button" onClick={onClick} className={cn("qs-stat flex min-h-[112px] w-full items-center gap-4 p-4 text-start transition hover:-translate-y-0.5 hover:shadow-sm", active && "ring-2 ring-[#ff5a0a]/50")}><span className={cn("grid size-11 place-items-center rounded-2xl", tone === "urgent" ? "bg-red-500/10 text-red-600" : "bg-orange-500/10 text-[#ff5a0a]")}><Icon className="size-5" /></span><div><p className="text-[11px] font-semibold text-muted-foreground">{label}</p><strong className="mt-1 block font-display text-3xl tracking-[-.04em]">{value}</strong></div></button>;
}

function WorkflowBoard({ tasks, staff, ar, canApprove, busy, onStatus, onOpen }: { tasks: WorkTask[]; staff: StaffOption[]; ar: boolean; canApprove: boolean; busy: boolean; onStatus: (task: WorkTask, status: WorkStatus) => void; onOpen: (task: WorkTask) => void }) {
  const columns: Array<{ status: WorkStatus; en: string; ar: string; tone: string }> = [
    { status: "open", en: "To do", ar: "للعمل", tone: "bg-slate-400" },
    { status: "in_progress", en: "In progress", ar: "قيد التنفيذ", tone: "bg-blue-500" },
    { status: "waiting_approval", en: "Review", ar: "مراجعة", tone: "bg-violet-500" },
    { status: "completed", en: "Done", ar: "مكتمل", tone: "bg-emerald-500" },
  ];
  return <div className="qs-workflow-board grid gap-3 p-3 lg:grid-cols-2 xl:grid-cols-4 sm:p-4">
    {columns.map((column) => {
      const rows = tasks.filter((task) => task.status === column.status);
      return <section key={column.status} onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
        event.preventDefault();
        const id = event.dataTransfer.getData("text/work-task-id");
        const task = tasks.find((item) => item.id === id);
        if (task && task.status !== column.status) onStatus(task, column.status);
      }} className="min-w-0 rounded-2xl border border-border bg-muted/20 p-2.5">
        <div className="mb-2 flex items-center justify-between gap-2 px-1 py-1">
          <div className="flex items-center gap-2"><span className={cn("size-2 rounded-full", column.tone)} /><h3 className="text-xs font-black uppercase tracking-[.08em]">{ar ? column.ar : column.en}</h3></div>
          <span className="rounded-full bg-card px-2 py-1 text-[10px] font-bold text-muted-foreground">{rows.length}</span>
        </div>
        <div className="space-y-2.5">
          {rows.map((task) => <div key={task.id} draggable={!busy} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/work-task-id", task.id); }} className="group relative cursor-grab active:cursor-grabbing">
            <span className="pointer-events-none absolute end-3 top-3 z-10 grid size-7 place-items-center rounded-lg bg-card/85 text-muted-foreground opacity-0 shadow-sm transition group-hover:opacity-100"><GripVertical className="size-4" /></span>
            <WorkCard task={task} staff={staff} ar={ar} canApprove={canApprove} busy={busy} onStatus={(status) => onStatus(task, status)} onOpen={() => onOpen(task)} />
          </div>)}
          {rows.length === 0 ? <div className="grid min-h-28 place-items-center rounded-xl border border-dashed border-border bg-card/45 p-3 text-center text-[10px] font-semibold text-muted-foreground">{ar ? "اسحب بطاقة إلى هنا" : "Drag a card here"}</div> : null}
        </div>
      </section>;
    })}
  </div>;
}

function WorkCard({ task, staff, ar, canApprove, busy, onStatus, onOpen }: { task: WorkTask; staff: StaffOption[]; ar: boolean; canApprove: boolean; busy: boolean; onStatus: (status: WorkStatus) => void; onOpen: () => void }) {
  const assignee = task.assigned_staff_id ? staff.find((row) => row.id === task.assigned_staff_id)?.name : null;
  const overdue = task.due_at && new Date(task.due_at).getTime() < Date.now() && task.status !== "completed";
  const CategoryIcon = task.category === "approval" ? ShieldCheck : task.category === "handover" ? Handshake : task.category === "alert" ? AlertTriangle : ClipboardCheck;
  return <article role="button" tabIndex={0} onClick={onOpen} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(); } }} className="group flex min-h-[184px] cursor-pointer flex-col rounded-xl border border-border bg-card p-3.5 text-start outline-none transition hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-[#ff5a0a]">
    <div className="flex items-start justify-between gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-muted text-muted-foreground"><CategoryIcon className="size-4" /></span><div className="flex flex-wrap justify-end gap-1.5"><Badge className={cn("border-0 capitalize", priorityTone[task.priority])}>{task.priority}</Badge>{overdue ? <Badge variant="destructive">{ar ? "متأخر" : "Overdue"}</Badge> : null}</div></div>
    <div className="mt-3 min-w-0 flex-1"><h3 className="line-clamp-2 font-display text-base font-bold leading-6">{task.title}</h3>{task.description ? <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-muted-foreground">{task.description}</p> : <p className="mt-1.5 text-xs text-muted-foreground">{ar ? "لا يوجد وصف إضافي." : "No additional description."}</p>}</div>
    <div className="mt-3 grid gap-1.5 border-t border-border/70 pt-3 text-[10px] font-semibold text-muted-foreground"><span className="inline-flex min-w-0 items-center gap-1.5"><UserRound className="size-3.5 shrink-0" /><span className="truncate">{assignee ?? (task.assigned_role ? roleLabel(task.assigned_role, ar) : (ar ? "غير معيّن" : "Unassigned"))}</span></span>{task.due_at ? <span className="inline-flex items-center gap-1.5"><Clock3 className="size-3.5" />{formatStamp(task.due_at, ar)}</span> : null}</div>
    <div className="mt-3 flex items-center gap-2" onClick={(event) => event.stopPropagation()}>{task.status === "open" ? <Button variant="outline" size="sm" className="flex-1" disabled={busy} onClick={() => onStatus("in_progress")}>{ar ? "بدء" : "Start"}</Button> : null}{task.status === "in_progress" && task.requires_approval ? <Button variant="outline" size="sm" className="flex-1" disabled={busy} onClick={() => onStatus("waiting_approval")}>{ar ? "إرسال للموافقة" : "Submit"}</Button> : null}{task.status === "in_progress" && !task.requires_approval ? <Button size="sm" className="flex-1" disabled={busy} onClick={() => onStatus("completed")}>{ar ? "إكمال" : "Complete"}</Button> : null}{task.status === "waiting_approval" && canApprove ? <Button size="sm" className="flex-1" disabled={busy} onClick={() => onStatus("completed")}><CheckCircle2 className="size-4" />{ar ? "اعتماد" : "Approve"}</Button> : <span className="capitalize text-xs text-muted-foreground">{task.status.replaceAll("_", " ")}</span>}</div>
  </article>;
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

function EditTaskDialog({ task, open, onOpenChange, ar, busy, onSave }: { task: WorkTask | null; open: boolean; onOpenChange: (open: boolean) => void; ar: boolean; busy: boolean; onSave: (values: { title: string; description: string; priority: WorkPriority; dueAt: string }) => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<WorkPriority>("normal");
  const [dueAt, setDueAt] = useState("");
  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setDescription(task.description ?? "");
    setPriority(task.priority);
    setDueAt(task.due_at ? new Date(new Date(task.due_at).getTime() - new Date(task.due_at).getTimezoneOffset() * 60000).toISOString().slice(0,16) : "");
  }, [task]);
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>{ar ? "تعديل المهمة" : "Edit work item"}</DialogTitle><DialogDescription>{ar ? "يمكن لمنشئ المهمة فقط تعديل العنوان والوصف والأولوية والاستحقاق." : "Only the creator can edit title, description, priority and due date."}</DialogDescription></DialogHeader><div className="space-y-4"><Field label={ar ? "العنوان" : "Title"}><Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} /></Field><Field label={ar ? "الوصف" : "Description"}><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} /></Field><div className="grid gap-3 sm:grid-cols-2"><Field label={ar ? "الأولوية" : "Priority"}><Select value={priority} onValueChange={(value) => setPriority(value as WorkPriority)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="normal">Normal</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent></Select></Field><Field label={ar ? "موعد الاستحقاق" : "Due date"}><Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} /></Field></div><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>{ar ? "إلغاء" : "Cancel"}</Button><Button disabled={busy || title.trim().length < 1} onClick={() => onSave({ title, description, priority, dueAt })}><Pencil className="size-4" />{ar ? "حفظ التعديلات" : "Save changes"}</Button></div></div></DialogContent></Dialog>;
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
