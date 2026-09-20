import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, Clock3, Play, Plus, Settings2, Trash2, Workflow } from "lucide-react";
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
  runOperationalRule,
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
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);

  if (scope.isPending || access.isPending) return <div className="min-h-dvh bg-background"><AppHeader /><main className="qs-page"><Skeleton className="h-[560px] rounded-3xl" /></main></div>;
  if (!rid || !membership || !canManage) return <Denied ar={ar} />;

  const activeCount = (rules.data ?? []).filter((row) => row.enabled).length;
  const eventCount = new Set((rules.data ?? []).map((row) => row.event_type)).size;
  const selectedRule = (rules.data ?? []).find((row) => row.id === selectedRuleId) ?? null;

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
        {rules.isPending ? <div className="p-5"><Skeleton className="h-72 rounded-2xl" /></div> : rules.isError ? <p className="p-5 text-sm text-destructive">{humanError(rules.error, lang)}</p> : !(rules.data ?? []).length ? <Empty ar={ar} /> : <div className="divide-y divide-border">{(rules.data ?? []).map((rule) => <RuleRow key={rule.id} rule={rule} restaurantId={rid} ar={ar} lang={lang} onOpen={() => setSelectedRuleId(rule.id)} />)}</div>}
      </section>
    </main>
    <CreateRuleDialog open={createOpen} onOpenChange={setCreateOpen} restaurantId={rid} ar={ar} lang={lang} />
    {selectedRule ? <EditRuleDialog key={selectedRule.id} rule={selectedRule} restaurantId={rid} open onOpenChange={(open) => { if (!open) setSelectedRuleId(null); }} ar={ar} lang={lang} /> : null}
  </div>;
}

function RuleRow({ rule, restaurantId, ar, lang, onOpen }: { rule: OperationalRule; restaurantId: string; ar: boolean; lang: "en" | "ar"; onOpen: () => void }) {
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

  return <article role="button" tabIndex={0} onClick={onOpen} onKeyDown={(eventKey) => { if (eventKey.key === "Enter" || eventKey.key === " ") { eventKey.preventDefault(); onOpen(); } }} className="cursor-pointer p-4 outline-none transition hover:bg-muted/20 focus-visible:ring-2 focus-visible:ring-[#ff5a0a] sm:p-5">
    <div className="grid gap-4 xl:grid-cols-[minmax(220px,1.35fr)_minmax(150px,.8fr)_minmax(150px,.8fr)_120px_150px_auto] xl:items-center">
      <div className="min-w-0"><div className="flex items-center gap-2" onClick={(eventClick) => eventClick.stopPropagation()}><Switch checked={rule.enabled} disabled={save.isPending} onCheckedChange={(enabled) => save.mutate({ enabled })} /><h3 className="truncate font-bold" onClick={(eventClick) => { eventClick.stopPropagation(); onOpen(); }}>{rule.name}</h3></div><p className="mt-1 text-xs text-muted-foreground">{ar ? event?.ar : event?.en}{rule.schedule_time ? ` · ${ar ? "مجدولة" : "Scheduled"} ${rule.schedule_time.slice(0,5)} ${rule.schedule_recurrence ?? ""}` : ""}</p></div>
      <div onClick={(eventClick) => eventClick.stopPropagation()}><Field label={ar ? "المسؤول" : "Target role"}><Select value={rule.target_role ?? "manager"} onValueChange={(value) => save.mutate({ target_role: value as AppRole })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TARGET_ROLES.map((role) => <SelectItem key={role} value={role}>{ROLE_LABELS[role][lang]}</SelectItem>)}</SelectContent></Select></Field></div>
      <div onClick={(eventClick) => eventClick.stopPropagation()}><Field label={ar ? "الأولوية" : "Priority"}><Select value={rule.priority} onValueChange={(value) => save.mutate({ priority: value as WorkPriority })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PRIORITIES.map((priority) => <SelectItem key={priority} value={priority}>{priority}</SelectItem>)}</SelectContent></Select></Field></div>
      <div onClick={(eventClick) => eventClick.stopPropagation()}><Field label={ar ? "المهلة" : "Due min"}><Input type="number" min={0} max={1440} defaultValue={rule.due_minutes} onBlur={(event) => { const due = Math.max(0, Math.min(1440, Number(event.currentTarget.value) || 0)); if (due !== rule.due_minutes) save.mutate({ due_minutes: due }); }} /></Field></div>
      <div className="space-y-2" onClick={(eventClick) => eventClick.stopPropagation()}><span className="block text-[10px] font-bold uppercase tracking-[.08em] text-muted-foreground">{ar ? "موافقة" : "Approval"}</span><div className="flex items-center gap-2"><Switch checked={rule.requires_approval} onCheckedChange={(requires_approval) => save.mutate({ requires_approval, approval_role: requires_approval ? (rule.approval_role ?? "manager") : null })} /><span className="text-xs">{rule.requires_approval ? (ROLE_LABELS[rule.approval_role ?? "manager"]?.[lang] ?? rule.approval_role) : (ar ? "لا" : "No")}</span></div></div>
      <div className="flex items-center gap-1" onClick={(eventClick) => eventClick.stopPropagation()}><Button variant="ghost" size="icon" onClick={onOpen} aria-label={ar ? "تعديل" : "Edit"}><Settings2 className="size-4" /></Button><Button variant="ghost" size="icon" disabled={remove.isPending} onClick={() => remove.mutate()} aria-label={ar ? "حذف" : "Delete"}><Trash2 className="size-4 text-destructive" /></Button></div>
    </div>
  </article>;
}

function EditRuleDialog({ rule, restaurantId, open, onOpenChange, ar, lang }: { rule: OperationalRule; restaurantId: string; open: boolean; onOpenChange: (open: boolean) => void; ar: boolean; lang: "en" | "ar" }) {
  const qc = useQueryClient();
  const [name, setName] = useState(rule.name);
  const [eventType, setEventType] = useState<OperationalEventType>(rule.event_type);
  const [role, setRole] = useState<AppRole>(rule.target_role ?? "manager");
  const [priority, setPriority] = useState<WorkPriority>(rule.priority);
  const [dueMinutes, setDueMinutes] = useState(String(rule.due_minutes));
  const [approval, setApproval] = useState(rule.requires_approval);
  const [approvalRole, setApprovalRole] = useState<AppRole>(rule.approval_role ?? "restaurant_admin");
  const [scheduleTime, setScheduleTime] = useState(rule.schedule_time?.slice(0, 5) ?? "");
  const [recurrence, setRecurrence] = useState<"daily" | "weekly">(rule.schedule_recurrence ?? "daily");
  const [timezone, setTimezone] = useState(rule.schedule_timezone || "Asia/Amman");

  const save = useMutation({
    mutationFn: () => updateOperationalRule(rule.id, {
      name: name.trim(),
      event_type: eventType,
      target_role: role,
      priority,
      due_minutes: Math.max(0, Math.min(1440, Number(dueMinutes) || 0)),
      requires_approval: approval,
      approval_role: approval ? approvalRole : null,
      schedule_time: scheduleTime || null,
      schedule_recurrence: scheduleTime ? recurrence : null,
      schedule_timezone: timezone.trim() || "Asia/Amman",
    }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["operations", "rules", restaurantId] }),
        qc.invalidateQueries({ queryKey: ["operational-counters", restaurantId] }),
      ]);
      toast.success(ar ? "تم حفظ قاعدة الأتمتة" : "Automation rule saved");
      onOpenChange(false);
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  const runNow = useMutation({
    mutationFn: () => runOperationalRule(rule.id),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["operations", "rules", restaurantId] }),
        qc.invalidateQueries({ queryKey: ["work", restaurantId] }),
        qc.invalidateQueries({ queryKey: ["operational-counters", restaurantId] }),
      ]);
      toast.success(ar ? "تم تشغيل القاعدة الآن" : "Automation ran successfully");
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-[680px]"><DialogHeader><DialogTitle>{ar ? "تعديل قاعدة الأتمتة" : "Edit automation rule"}</DialogTitle><DialogDescription>{ar ? "عدّل منطق القاعدة وجدولها. الجدولة تعمل من الخادم حتى لو كان المتصفح مغلقاً." : "Edit the rule and its schedule. Scheduled execution runs server-side even when the browser is closed."}</DialogDescription></DialogHeader>
    <div className="grid gap-4 py-2 sm:grid-cols-2">
      <Field label={ar ? "اسم القاعدة" : "Rule name"} className="sm:col-span-2"><Input value={name} onChange={(event) => setName(event.target.value)} /></Field>
      <Field label={ar ? "الحدث" : "Trigger"}><Select value={eventType} onValueChange={(value) => setEventType(value as OperationalEventType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{EVENTS.map((event) => <SelectItem key={event.value} value={event.value}>{ar ? event.ar : event.en}</SelectItem>)}</SelectContent></Select></Field>
      <Field label={ar ? "المسؤول" : "Target role"}><Select value={role} onValueChange={(value) => setRole(value as AppRole)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TARGET_ROLES.map((item) => <SelectItem key={item} value={item}>{ROLE_LABELS[item][lang]}</SelectItem>)}</SelectContent></Select></Field>
      <Field label={ar ? "الأولوية" : "Priority"}><Select value={priority} onValueChange={(value) => setPriority(value as WorkPriority)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PRIORITIES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></Field>
      <Field label={ar ? "المهلة بالدقائق" : "Due in minutes"}><Input type="number" min={0} max={1440} value={dueMinutes} onChange={(event) => setDueMinutes(event.target.value)} /></Field>
      <div className="sm:col-span-2 flex items-center justify-between rounded-2xl border border-border p-4"><div><p className="text-sm font-bold">{ar ? "القاعدة فعّالة" : "Rule enabled"}</p><p className="text-xs text-muted-foreground">{ar ? "يمكن تعطيلها من بطاقة القاعدة بدون حذفها." : "You can disable it from the rule card without deleting it."}</p></div><Switch checked={rule.enabled} onCheckedChange={(enabled) => updateOperationalRule(rule.id, { enabled }).then(() => qc.invalidateQueries({ queryKey: ["operations", "rules", restaurantId] })).catch((error) => toast.error(humanError(error, lang)))} /></div>
      <div className="sm:col-span-2 rounded-2xl border border-border p-4"><div className="flex items-center gap-2"><Clock3 className="size-4 text-[#ff5a0a]" /><div><p className="text-sm font-bold">{ar ? "الجدولة" : "Schedule"}</p><p className="text-xs text-muted-foreground">{ar ? "أضف وقتاً لتشغيل القاعدة تلقائياً من الخادم." : "Add a time to run this rule automatically on the server."}</p></div></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><Field label={ar ? "الوقت" : "Time"}><Input type="time" value={scheduleTime} onChange={(event) => setScheduleTime(event.target.value)} /></Field><Field label={ar ? "التكرار" : "Recurrence"}><Select value={recurrence} disabled={!scheduleTime} onValueChange={(value) => setRecurrence(value as "daily" | "weekly")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="daily">{ar ? "يومي" : "Daily"}</SelectItem><SelectItem value="weekly">{ar ? "أسبوعي" : "Weekly"}</SelectItem></SelectContent></Select></Field><Field label={ar ? "المنطقة الزمنية" : "Timezone"}><Input value={timezone} onChange={(event) => setTimezone(event.target.value)} placeholder="Asia/Amman" /></Field></div>{scheduleTime ? <Button type="button" variant="ghost" className="mt-2 px-0 text-xs text-muted-foreground" onClick={() => setScheduleTime("")}>{ar ? "إزالة الجدولة" : "Remove schedule"}</Button> : null}</div>
      <div className="sm:col-span-2 flex items-center justify-between rounded-2xl border border-border p-4"><div><p className="text-sm font-bold">{ar ? "تحتاج موافقة" : "Requires approval"}</p><p className="text-xs text-muted-foreground">{ar ? "أرسل العمل لمسار اعتماد قبل الإغلاق." : "Route generated work through approval before final completion."}</p></div><Switch checked={approval} onCheckedChange={setApproval} /></div>
      {approval ? <Field label={ar ? "دور الموافق" : "Approval role"} className="sm:col-span-2"><Select value={approvalRole} onValueChange={(value) => setApprovalRole(value as AppRole)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TARGET_ROLES.map((item) => <SelectItem key={item} value={item}>{ROLE_LABELS[item][lang]}</SelectItem>)}</SelectContent></Select></Field> : null}
      <div className="sm:col-span-2 rounded-2xl bg-muted/40 p-4 text-xs"><div className="grid gap-2 sm:grid-cols-2"><span><strong>{ar ? "آخر تشغيل:" : "Last run:"}</strong> {rule.last_run_at ? new Date(rule.last_run_at).toLocaleString(ar ? "ar-JO" : "en-US") : "—"}</span><span><strong>{ar ? "التشغيل القادم:" : "Next run:"}</strong> {rule.next_run_at ? new Date(rule.next_run_at).toLocaleString(ar ? "ar-JO" : "en-US") : "—"}</span><span><strong>{ar ? "الحالة:" : "Status:"}</strong> {rule.last_status ?? (ar ? "لم تعمل بعد" : "Never run")}</span>{rule.last_error ? <span className="text-destructive"><strong>{ar ? "آخر خطأ:" : "Last error:"}</strong> {rule.last_error}</span> : null}</div></div>
    </div>
    <DialogFooter className="gap-2 sm:justify-between"><Button variant="outline" disabled={runNow.isPending} onClick={() => runNow.mutate()}><Play className="size-4" />{ar ? "تشغيل الآن" : "Run now"}</Button><div className="flex gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>{ar ? "إلغاء" : "Cancel"}</Button><Button disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>{ar ? "حفظ" : "Save changes"}</Button></div></DialogFooter>
  </DialogContent></Dialog>;
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
