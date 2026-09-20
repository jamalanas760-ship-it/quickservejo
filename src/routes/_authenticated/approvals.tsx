import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Check, MessageSquareReply, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";

import { MasterEyebrow, MasterKpi, MasterPageHeader } from "@/components/app/MasterPage";
import { AppHeader } from "@/components/nav/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAccess } from "@/hooks/useSession";
import { useWorkspaceScope } from "@/hooks/useWorkspace";
import { supabase } from "@/integrations/supabase/client";
import { humanError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { membershipHasCapability } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/approvals")({
  head: () => ({ meta: [{ title: "Approvals — QuickServe" }, { name: "description", content: "Secure role-aware operational approval queue." }] }),
  component: ApprovalsPage,
});

type ApprovalStatus = "pending" | "approved" | "rejected" | "changes_requested";
type ApprovalTask = {
  id: string;
  restaurant_id: string;
  title: string;
  description: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  status: string;
  approval_status: ApprovalStatus | "not_required";
  approval_role: string | null;
  approval_staff_id: string | null;
  approval_note: string | null;
  due_at: string | null;
  created_at: string;
  source_type: string | null;
};
type Action = "approve" | "reject" | "changes_requested";

function ApprovalsPage() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const scope = useWorkspaceScope();
  const access = useAccess();
  const qc = useQueryClient();
  const rid = scope.restaurantId;
  const membership = rid ? access.membershipFor(rid) : null;
  const canApprove = Boolean(membership && membershipHasCapability(membership.role, membership.permission_overrides, "approve_work"));
  const [selected, setSelected] = useState<ApprovalTask | null>(null);
  const [action, setAction] = useState<Action>("approve");
  const [note, setNote] = useState("");

  const approvals = useQuery<ApprovalTask[]>({
    queryKey: ["approvals", rid],
    enabled: Boolean(rid && canApprove),
    staleTime: 8_000,
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("work_tasks")
        .select("id,restaurant_id,title,description,priority,status,approval_status,approval_role,approval_staff_id,approval_note,due_at,created_at,source_type")
        .eq("restaurant_id", rid!)
        .eq("requires_approval", true)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as ApprovalTask[];
    },
  });

  const mutation = useMutation({
    mutationFn: async ({ id, action, note }: { id: string; action: Action; note: string }) => {
      const { data, error } = await (supabase as any).rpc("action_work_approval", { _task_id: id, _action: action, _note: note.trim() || null });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      setSelected(null);
      setNote("");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["approvals", rid] }),
        qc.invalidateQueries({ queryKey: ["work", rid] }),
        qc.invalidateQueries({ queryKey: ["notifications", rid] }),
      ]);
      toast.success(ar ? "تم تسجيل قرار الموافقة" : "Approval decision recorded");
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  const rows = approvals.data ?? [];
  const pending = rows.filter((row) => row.approval_status === "pending");
  const history = rows.filter((row) => row.approval_status !== "pending");
  const urgent = pending.filter((row) => row.priority === "urgent").length;
  const overdue = pending.filter((row) => row.due_at && new Date(row.due_at).getTime() < Date.now()).length;
  const title = action === "approve" ? (ar ? "تأكيد الموافقة" : "Approve request") : action === "reject" ? (ar ? "رفض الطلب" : "Reject request") : (ar ? "إعادته للتعديل" : "Return for changes");

  if (scope.isPending || access.isPending) return <div className="min-h-dvh bg-background"><AppHeader /><main className="qs-page"><Skeleton className="h-[600px] rounded-3xl" /></main></div>;
  if (!rid || !membership || !canApprove) return <div className="min-h-dvh bg-background"><AppHeader /><main className="qs-page"><section className="qs-card p-10 text-center"><ShieldCheck className="mx-auto size-10 text-muted-foreground" /><h1 className="mt-4 text-xl font-bold">{ar ? "الموافقات غير متاحة لهذا الدور" : "Approvals are not available for this role"}</h1><Button asChild variant="outline" className="mt-5"><Link to="/work"><ArrowLeft className="size-4" />{ar ? "العودة لعملي" : "Back to My Work"}</Link></Button></section></main></div>;

  return <div className="min-h-dvh bg-background">
    <AppHeader title={ar ? "الموافقات" : "Approvals"} />
    <main className="qs-page space-y-5">
      <MasterPageHeader
        eyebrow={<MasterEyebrow icon={ShieldCheck}>{ar?"حوكمة التشغيل":"Operational Governance"}</MasterEyebrow>}
        title={ar?"الموافقات":"Approvals"}
        description={ar?"اتخذ قرارات واضحة مع سجل تدقيق كامل وصلاحيات يتم التحقق منها في الخادم.":"Make clear operational decisions with a complete audit trail and server-enforced authorization."}
        actions={<Button asChild variant="outline"><Link to="/work">{ar?"فتح عملي":"Open My Work"}</Link></Button>}
      />
      <section className="grid gap-3 sm:grid-cols-3">
        <MasterKpi icon={ShieldCheck} label={ar?"بانتظار القرار":"Pending"} value={String(pending.length)} hint={ar?"تحتاج قرار":"Need a decision"} tone="blue"/>
        <MasterKpi icon={MessageSquareReply} label={ar?"عاجل":"Urgent"} value={String(urgent)} hint={ar?"أولوية قصوى":"Highest priority"} tone={urgent>0?"red":"slate"}/>
        <MasterKpi icon={X} label={ar?"متأخر":"Overdue"} value={String(overdue)} hint={ar?"تجاوز الاستحقاق":"Past due"} tone={overdue>0?"red":"slate"}/>
      </section>

      <section className="qs-card overflow-hidden">
        <div className="border-b border-border p-4 sm:p-5"><h2 className="qs-section-title">{ar ? "طابور الموافقات" : "Approval queue"}</h2><p className="mt-1 text-xs text-muted-foreground">{ar ? "الأعلى أولوية أولاً." : "Act on the items that need a decision."}</p></div>
        {approvals.isPending ? <div className="p-5"><Skeleton className="h-64 rounded-2xl" /></div> : approvals.isError ? <p className="p-6 text-sm text-destructive">{humanError(approvals.error, lang)}</p> : pending.length === 0 ? <div className="p-12 text-center"><Check className="mx-auto size-9 text-emerald-600" /><h3 className="mt-3 font-bold">{ar ? "لا توجد موافقات معلقة" : "Approval queue is clear"}</h3></div> : <div className="divide-y divide-border">{pending.map((task) => <ApprovalRow key={task.id} task={task} ar={ar} busy={mutation.isPending} onAction={(next) => { setSelected(task); setAction(next); setNote(""); }} />)}</div>}
      </section>

      {history.length ? <section className="qs-card overflow-hidden"><div className="border-b border-border p-4 sm:p-5"><h2 className="qs-section-title">{ar ? "آخر القرارات" : "Recent decisions"}</h2></div><div className="divide-y divide-border">{history.slice(0, 20).map((task) => <div key={task.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"><div><strong className="text-sm">{task.title}</strong>{task.approval_note ? <p className="mt-1 text-xs text-muted-foreground">{task.approval_note}</p> : null}</div><StatusBadge status={task.approval_status} ar={ar} /></div>)}</div></section> : null}
    </main>

    <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}>
      <DialogContent><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{selected?.title}</DialogDescription></DialogHeader><Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={ar ? "ملاحظة القرار (اختيارية)" : "Decision note (optional)"} className="min-h-28" /><DialogFooter><Button variant="outline" onClick={() => setSelected(null)}>{ar ? "إلغاء" : "Cancel"}</Button><Button disabled={!selected || mutation.isPending} variant={action === "reject" ? "destructive" : "default"} onClick={() => selected && mutation.mutate({ id: selected.id, action, note })}>{action === "approve" ? <Check className="size-4" /> : action === "reject" ? <X className="size-4" /> : <MessageSquareReply className="size-4" />}{title}</Button></DialogFooter></DialogContent>
    </Dialog>
  </div>;
}

function ApprovalRow({ task, ar, busy, onAction }: { task: ApprovalTask; ar: boolean; busy: boolean; onAction: (action: Action) => void }) {
  const overdue = task.due_at && new Date(task.due_at).getTime() < Date.now();
  return <article className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold">{task.title}</h3><Badge variant={task.priority === "urgent" ? "destructive" : "outline"} className="capitalize">{task.priority}</Badge>{overdue ? <Badge variant="destructive">{ar ? "متأخر" : "Overdue"}</Badge> : null}</div>{task.description ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{task.description}</p> : null}<div className="mt-2 flex flex-wrap gap-3 text-[10px] font-semibold text-muted-foreground"><span>{ar ? "المصدر" : "Source"}: {task.source_type ?? (ar ? "يدوي" : "Manual")}</span>{task.approval_role ? <span>{ar ? "الموافق" : "Approver"}: {task.approval_role.replaceAll("_", " ")}</span> : null}</div></div><div className="flex flex-wrap gap-2 lg:justify-end"><Button size="sm" disabled={busy} onClick={() => onAction("approve")}><Check className="size-4" />{ar ? "موافقة" : "Approve"}</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => onAction("changes_requested")}><MessageSquareReply className="size-4" />{ar ? "تعديل" : "Changes"}</Button><Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={busy} onClick={() => onAction("reject")}><X className="size-4" />{ar ? "رفض" : "Reject"}</Button></div></article>;
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: "urgent" }) {
  return <article className="qs-stat p-4"><p className="text-[11px] font-semibold text-muted-foreground">{label}</p><strong className={cn("mt-2 block font-display text-3xl tracking-[-.04em]", tone === "urgent" && value > 0 && "text-red-600")}>{value}</strong></article>;
}

function StatusBadge({ status, ar }: { status: ApprovalTask["approval_status"]; ar: boolean }) {
  const map = useMemo(() => ({ approved: ar ? "تمت الموافقة" : "Approved", rejected: ar ? "مرفوض" : "Rejected", changes_requested: ar ? "مطلوب تعديل" : "Changes requested", pending: ar ? "معلق" : "Pending", not_required: ar ? "لا يحتاج" : "Not required" }), [ar]);
  return <Badge variant={status === "approved" ? "default" : status === "rejected" ? "destructive" : "secondary"}>{map[status]}</Badge>;
}
