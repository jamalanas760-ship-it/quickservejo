import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, Clock3, Plus, Trash2, Workflow } from "lucide-react";
import { toast } from "sonner";

import { AppHeader } from "@/components/nav/AppHeader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  createOperationalRule,
  deleteOperationalRule,
  updateOperationalRule,
  useOperationalRules,
  useUrgentAutomatedWork,
  type OperationalEventType,
  type OperationalRule,
  type WorkPriority,
} from "@/hooks/useOperations";
import { useAccess } from "@/hooks/useSession";
import { useWorkspaceScope } from "@/hooks/useWorkspace";
import { humanError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { membershipHasCapability, ROLE_LABELS, type AppRole } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/automations")({
  head: () => ({ meta: [{ title: "Automation Rules — QuickServe" }, { name: "description", content: "Operational event automation for restaurant work." }] }),
  component: AutomationRulesPage,
});

const EVENTS: Array<{ value: OperationalEventType; en: string; ar: string }> = [
  { value: "waiter_call_created", en: "Waiter call created", ar: "طلب نادل جديد" },
  { value: "order_stuck", en: "Order stuck", ar: "طلب متأخر" },
  { value: "low_stock", en: "Low stock", ar: "مخزون منخفض" },
  { value: "shift_opening", en: "Shift opening", ar: "فتح الوردية" },
  { value: "shift_closing", en: "Shift closing", ar: "إغلاق الوردية" },
  { value: "manual_exception", en: "Manual exception", ar: "استثناء يدوي" },
];

const TARGET_ROLES: AppRole[] = ["restaurant_admin", "operations_manager", "manager", "kitchen", "waiter", "cashier", "host", "inventory", "procurement", "accountant"];
const PRIORITIES: WorkPriority[] = ["low", "normal", "high", "urgent"];

function AutomationRulesPage() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const scope = useWorkspaceScope();
  const access = useAccess();
  const rid = scope.restaurantId;
  const membership = rid ? access.membershipFor(rid) : null;
  const canManage = Boolean(membership && (
    membershipHasCapability(membership.role, membership.permission_overrides, "manage_work")
    || membershipHasCapability(membership.role, membership.permission_overrides, "manage_shifts")
  ));
  const rules = useOperationalRules(rid, canManage);
  const alerts = useUrgentAutomatedWork(rid);
  const [createOpen, setCreateOpen] = useState(false);

  if (scope.isPending || access.isPending) return <div className="min-h-dvh bg-background"><AppHeader /><main className="qs-page"><Skeleton className="h-[560px] rounded-3xl" /></main></div>;
  if (!rid || !membership || !canManage) return <Denied ar={ar} />;

  const activeCount = (rules.data ?? []).filter((row) => row.enabled).length;
  const eventCount = new Set((rules.data ?? []).map((row) => row.event_type)).size;

  return <div className="min-h-dvh bg-background">
    <AppHeader title={ar ? "قواعد الأتمتة" : "Automation Rules"} />
    <main className="qs-page space-y-5">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
        <div>
          <h1 className="qs-page-title">{ar ? "حوّل الأحداث إلى عمل واضح" : "Turn events into accountable work"}</h1>
          <p className="qs-page-subtitle max-w-3xl">{ar ? "حدّد من يستلم المهمة، الأولوية، المهلة، والموافقة المطلوبة عند وقوع حدث تشغيلي." : "Define who owns the work, its priority, due time, and approval path when an operational event happens."}</p>
        </div>
        <Button className="gap-2" onClick={() => setCreateOpen(true)}><Plus className="size-4" />{ar ? "قاعدة جديدة" : "New rule"}</Button>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <Metric label={ar ? "قواعد فعّالة" : "Active rules"} value={activeCount} icon={Workflow} />
        <Metric label={ar ? "أنواع أحداث" : "Event types"} value={eventCount} icon={Clock3} />
        <Metric label={ar ? "عمل آلي مفتوح" : "Open automated work"} value={alerts.data?.total ?? 0} icon={AlertTriangle} urgent={(alerts.data?.urgent ?? 0) > 0} />
      </section>

      <section className="qs-card overflow-hidden">
        <div className="border-b border-border p-5"><h2 className="qs-section-title">{ar ? "قواعد التشغيل" : "Operational rules"}</h2><p className="mt-1 text-xs text-muted-foreground">{ar ? "قواعد قاعدة البيانات تمنع تكرار نفس المهمة لنفس الحدث." : "Database-level deduplication prevents duplicate work for the same event and rule."}</p></div>
        {rules.isPending ? <div className="p-5"><Skeleton className="h-72 rounded-2xl" /></div> : rules.isError ? <p className="p-5 text-sm text-destructive">{humanError(rules.error, lang)}</p> : !(rules.data ?? []).length ? <Empty ar={ar} /> : <div className="divide-y divide-border">{(rules.data ?? []).map((rule) => <RuleRow key={rule.id} rule={rule} restaurantId={rid} ar={ar} lang={lang} />)}</div>}
      </section>
    </main>
    <CreateRuleDialog open={createOpen} onOpenChange={setCreateOpen} restaurantId={rid} ar={ar} lang={lang} />
  </div>;
}

function RuleRow({ rule, restaurantId, ar, lang }: { rule: OperationalRule; restaurantId: string; ar: boolean; lang: "en" | "ar" }) {
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: (patch: Parameters<typeof updateOperationalRule>[1]) => updateOperationalRule(rule.id, patch),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["operations", "rules", restaurantId] }); },
    onError: (error) => toast.error(humanError(error, lang)),
  });
  const remove = useMutation({
    mutationFn: () => deleteOperationalRule(rule.id),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["operations", "rules", restaurantId] }); toast.success(ar ? "تم حذف القاعدة" : "Rule deleted"); },
    onError: (error) => toast.error(humanError(error, lang)),
  });
  const event = EVENTS.find((item) => item.value === rule.event_type);

  return <article className="p-4 sm:p-5">
    <div className="grid gap-4 xl:grid-cols-[minmax(220px,1.35fr)_minmax(150px,.8fr)_minmax(150px,.8fr)_120px_150px_auto] xl:items-center">
      <div className="min-w-0"><div className="flex items-center gap-2"><Switch checked={rule.enabled} disabled={save.isPending} onCheckedChange={(enabled) => save.mutate({ enabled })} /><h3 className="truncate font-bold">{rule.name}</h3></div><p className="mt-1 text-xs text-muted-foreground">{ar ? event?.ar : event?.en}</p></div>
      <Field label={ar ? "المسؤول" : "Target role"}><Select value={rule.target_role ?? "manager"} onValueChange={(value) => save.mutate({ target_role: value as AppRole })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TARGET_ROLES.map((role) => <SelectItem key={role} value={role}>{ROLE_LABELS[role][lang]}</SelectItem>)}</SelectContent></Select></Field>
      <Field label={ar ? "الأولوية" : "Priority"}><Select value={rule.priority} onValueChange={(value) => save.mutate({ priority: value as WorkPriority })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PRIORITIES.map((priority) => <SelectItem key={priority} value={priority}>{priority}</SelectItem>)}</SelectContent></Select></Field>
      <Field label={ar ? "المهلة" : "Due min"}><Input type="number" min={0} max={1440} defaultValue={rule.due_minutes} onBlur={(event) => { const due = Math.max(0, Math.min(1440, Number(event.currentTarget.value) || 0)); if (due !== rule.due_minutes) save.mutate({ due_minutes: due }); }} /></Field>
      <div className="space-y-2"><span className="block text-[10px] font-bold uppercase tracking-[.08em] text-muted-foreground">{ar ? "موافقة" : "Approval"}</span><div className="flex items-center gap-2"><Switch checked={rule.requires_approval} onCheckedChange={(requires_approval) => save.mutate({ requires_approval, approval_role: requires_approval ? (rule.approval_role ?? "manager") : null })} /><span className="text-xs">{rule.requires_approval ? (ROLE_LABELS[rule.approval_role ?? "manager"]?.[lang] ?? rule.approval_role) : (ar ? "لا" : "No")}</span></div></div>
      <Button variant="ghost" size="icon" disabled={remove.isPending} onClick={() => remove.mutate()} aria-label={ar ? "حذف" : "Delete"}><Trash2 className="size-4 text-destructive" /></Button>
    </div>
  </article>;
}

function CreateRuleDialog({ open, onOpenChange, restaurantId, ar, lang }: { open: boolean; onOpenChange: (open: boolean) => void; restaurantId: string; ar: boolean; lang: "en" | "ar" }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [eventType, setEventType] = useState<OperationalEventType>("manual_exception");
  const [role, setRole] = useState<AppRole>("manager");
  const [priority, setPriority] = useState<WorkPriority>("normal");
  const [dueMinutes, setDueMinutes] = useState("15");
  const [approval, setApproval] = useState(false);
  const [approvalRole, setApprovalRole] = useState<AppRole>("manager");
  const create = useMutation({
    mutationFn: () => createOperationalRule({ restaurant_id: restaurantId, name: name.trim(), event_type: eventType, enabled: true, priority, target_role: role, due_minutes: Math.max(0, Math.min(1440, Number(dueMinutes) || 0)), requires_approval: approval, approval_role: approval ? approvalRole : null }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["operations", "rules", restaurantId] }); toast.success(ar ? "تم إنشاء القاعدة" : "Rule created"); onOpenChange(false); setName(""); },
    onError: (error) => toast.error(humanError(error, lang)),
  });
  const ready = name.trim().length > 0;

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-[560px]"><DialogHeader><DialogTitle>{ar ? "قاعدة أتمتة جديدة" : "New automation rule"}</DialogTitle><DialogDescription>{ar ? "حوّل حدثاً تشغيلياً إلى مهمة مملوكة بوضوح." : "Turn an operational event into clearly owned work."}</DialogDescription></DialogHeader><div className="grid gap-4 py-2 sm:grid-cols-2"><Field label={ar ? "اسم القاعدة" : "Rule name"} className="sm:col-span-2"><Input value={name} onChange={(event) => setName(event.target.value)} /></Field><Field label={ar ? "الحدث" : "Event"}><Select value={eventType} onValueChange={(value) => setEventType(value as OperationalEventType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{EVENTS.map((event) => <SelectItem key={event.value} value={event.value}>{ar ? event.ar : event.en}</SelectItem>)}</SelectContent></Select></Field><Field label={ar ? "المسؤول" : "Target role"}><Select value={role} onValueChange={(value) => setRole(value as AppRole)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TARGET_ROLES.map((item) => <SelectItem key={item} value={item}>{ROLE_LABELS[item][lang]}</SelectItem>)}</SelectContent></Select></Field><Field label={ar ? "الأولوية" : "Priority"}><Select value={priority} onValueChange={(value) => setPriority(value as WorkPriority)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PRIORITIES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></Field><Field label={ar ? "المهلة بالدقائق" : "Due in minutes"}><Input type="number" min={0} max={1440} value={dueMinutes} onChange={(event) => setDueMinutes(event.target.value)} /></Field><div className="sm:col-span-2 flex items-center justify-between rounded-2xl border border-border p-4"><div><p className="text-sm font-bold">{ar ? "تحتاج موافقة" : "Requires approval"}</p><p className="text-xs text-muted-foreground">{ar ? "أرسل المهمة لمسار اعتماد قبل الإغلاق." : "Route work through approval before final completion."}</p></div><Switch checked={approval} onCheckedChange={setApproval} /></div>{approval ? <Field label={ar ? "دور الموافق" : "Approval role"} className="sm:col-span-2"><Select value={approvalRole} onValueChange={(value) => setApprovalRole(value as AppRole)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TARGET_ROLES.map((item) => <SelectItem key={item} value={item}>{ROLE_LABELS[item][lang]}</SelectItem>)}</SelectContent></Select></Field> : null}</div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>{ar ? "إلغاء" : "Cancel"}</Button><Button disabled={!ready || create.isPending} onClick={() => create.mutate()}>{ar ? "إنشاء" : "Create rule"}</Button></DialogFooter></DialogContent></Dialog>;
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) { return <div className={`space-y-2 ${className}`}><Label className="text-[10px] font-bold uppercase tracking-[.08em] text-muted-foreground">{label}</Label>{children}</div>; }
function Metric({ label, value, icon: Icon, urgent }: { label: string; value: number; icon: typeof Workflow; urgent?: boolean }) { return <article className="qs-stat flex min-h-28 items-center gap-4 p-4"><span className={`grid size-11 place-items-center rounded-2xl ${urgent ? "bg-red-500/10 text-red-600" : "bg-orange-500/10 text-[#ff5a0a]"}`}><Icon className="size-5" /></span><div><p className="text-xs font-semibold text-muted-foreground">{label}</p><p className="mt-1 font-display text-3xl font-bold tracking-[-.04em]">{value}</p></div></article>; }
function Empty({ ar }: { ar: boolean }) { return <div className="p-10 text-center"><Workflow className="mx-auto size-9 text-muted-foreground" /><h3 className="mt-3 font-bold">{ar ? "لا توجد قواعد بعد" : "No automation rules yet"}</h3><p className="mt-1 text-xs text-muted-foreground">{ar ? "ابدأ بقاعدة بسيطة ثم وسّعها حسب التشغيل." : "Start with one clear rule and expand from real operations."}</p></div>; }
function Denied({ ar }: { ar: boolean }) { return <div className="min-h-dvh bg-background"><AppHeader /><main className="qs-page"><section className="qs-card p-8 text-center"><AlertTriangle className="mx-auto size-9 text-muted-foreground" /><h1 className="mt-4 text-xl font-bold">{ar ? "غير متاح" : "Automation access unavailable"}</h1><p className="mt-2 text-sm text-muted-foreground">{ar ? "هذه المساحة مخصصة لمديري العمل أو الورديات." : "This workspace is limited to work or shift managers."}</p><Button asChild className="mt-5"><Link to="/work">{ar ? "العودة لعملي" : "Back to My Work"}</Link></Button></section></main></div>; }
