import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Activity, AlertTriangle, CalendarClock, CheckCircle2, CirclePlay, Clock3, Plus, Settings2, Trash2, Workflow, XCircle, Zap } from "lucide-react";
import { toast } from "sonner";

import { AppHeader } from "@/components/nav/AppHeader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  createOperationalRule,
  deleteOperationalRule,
  runOperationalRule,
  updateOperationalRule,
  useAutomationRuns,
  useOperationalRules,
  type AutomationRun,
  type OperationalEventType,
  type OperationalRule,
  type WorkPriority,
} from "@/hooks/useOperations";
import { useAccess } from "@/hooks/useSession";
import { useWorkspaceScope } from "@/hooks/useWorkspace";
import { humanError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { membershipHasCapability, ROLE_LABELS, type AppRole } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/automations")({
  head: () => ({ meta: [{ title: "Automation Control Center — QuickServe" }, { name: "description", content: "Server-side QuickServe automation rules and execution history." }] }),
  component: AutomationControlCenter,
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

function AutomationControlCenter() {
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
  const runs = useAutomationRuns(rid, canManage);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (scope.isPending || access.isPending) return <div className="min-h-dvh bg-background"><AppHeader /><main className="qs-page"><Skeleton className="h-[620px] rounded-3xl" /></main></div>;
  if (!rid || !membership || !canManage) return <Denied ar={ar} />;

  const rows = rules.data ?? [];
  const runRows = runs.data ?? [];
  const selected = rows.find((row) => row.id === selectedId) ?? null;
  const today = new Date().toLocaleDateString("en-CA");
  const executedToday = runRows.filter((row) => new Date(row.started_at).toLocaleDateString("en-CA") === today).length;
  const failed = runRows.filter((row) => row.status === "failed").length;
  const scheduled = rows.filter((row) => row.enabled && row.schedule_time).length;
  const active = rows.filter((row) => row.enabled).length;

  return <div className="min-h-dvh bg-background">
    <AppHeader title={ar ? "مركز الأتمتة" : "Automation Control Center"} />
    <main className="qs-page space-y-5">
      <section className="overflow-hidden rounded-[28px] border border-border bg-card shadow-sm">
        <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end sm:p-8">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-orange-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.16em] text-[#ff5a0a]"><Zap className="size-3.5" />{ar ? "أتمتة من الخادم" : "Server-side automation"}</div>
            <h1 className="mt-4 font-display text-3xl font-bold tracking-[-.04em] sm:text-4xl">{ar ? "حوّل الأحداث المتكررة إلى عمل قابل للمتابعة" : "Turn repeatable events into accountable work"}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{ar ? "القواعد المجدولة تعمل من الخادم حتى لو كان التطبيق مغلقاً، وكل تشغيل يُسجّل بنتيجته وخطئه إن وجد." : "Scheduled rules run on the server even when QuickServe is closed, and every execution is recorded with its result or error."}</p>
          </div>
          <Button onClick={() => setCreateOpen(true)}><Plus className="size-4" />{ar ? "قاعدة جديدة" : "New rule"}</Button>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Workflow} label={ar ? "قواعد فعّالة" : "Active rules"} value={active} />
        <Metric icon={CalendarClock} label={ar ? "مجدولة" : "Scheduled"} value={scheduled} />
        <Metric icon={XCircle} label={ar ? "تشغيلات فاشلة" : "Failed runs"} value={failed} tone={failed ? "danger" : undefined} />
        <Metric icon={Activity} label={ar ? "نفذت اليوم" : "Executed today"} value={executedToday} tone="success" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(330px,.75fr)]">
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5"><div><h2 className="font-display text-lg font-bold">{ar ? "قواعد التشغيل" : "Operational rules"}</h2><p className="mt-1 text-xs text-muted-foreground">{ar ? "اضغط أي قاعدة لتعديل المشغّل والمالك والمهلة والجدولة." : "Open any rule to edit its trigger, owner, due time and schedule."}</p></div><span className="rounded-full bg-muted px-3 py-1 text-[10px] font-bold text-muted-foreground">{rows.length} {ar ? "قاعدة" : "rules"}</span></div>
          {rules.isPending ? <div className="p-5"><Skeleton className="h-72 rounded-2xl" /></div> : rules.isError ? <p className="p-5 text-sm text-destructive">{humanError(rules.error, lang)}</p> : !rows.length ? <EmptyRules ar={ar} onCreate={() => setCreateOpen(true)} /> : <div className="divide-y divide-border">{rows.map((rule) => <RuleCard key={rule.id} rule={rule} restaurantId={rid} ar={ar} lang={lang} onOpen={() => setSelectedId(rule.id)} />)}</div>}
        </div>

        <section className="overflow-hidden rounded-2xl border border-border bg-card self-start">
          <div className="border-b border-border p-5"><h2 className="font-display text-lg font-bold">{ar ? "آخر التشغيلات" : "Recent executions"}</h2><p className="mt-1 text-xs text-muted-foreground">{ar ? "سجل فعلي من الخادم، وليس نشاطاً وهمياً من الواجهة." : "Real server execution history, not simulated browser activity."}</p></div>
          {runs.isPending ? <div className="p-4"><Skeleton className="h-56 rounded-xl" /></div> : !runRows.length ? <div className="p-8 text-center text-xs text-muted-foreground">{ar ? "لم تعمل أي قاعدة بعد." : "No automation has executed yet."}</div> : <div className="divide-y divide-border">{runRows.slice(0,12).map((run) => <RunItem key={run.id} run={run} rule={rows.find((rule) => rule.id === run.rule_id)} ar={ar} />)}</div>}
        </section>
      </section>
    </main>

    <CreateRuleDialog open={createOpen} onOpenChange={setCreateOpen} restaurantId={rid} ar={ar} lang={lang} />
    {selected ? <EditRuleDialog key={selected.id} rule={selected} runs={runRows.filter((run) => run.rule_id === selected.id)} restaurantId={rid} open onOpenChange={(open) => { if (!open) setSelectedId(null); }} ar={ar} lang={lang} /> : null}
  </div>;
}

function RuleCard({rule,restaurantId,ar,lang,onOpen}:{rule:OperationalRule;restaurantId:string;ar:boolean;lang:"en"|"ar";onOpen:()=>void}) {
  const qc=useQueryClient();
  const toggle=useMutation({
    mutationFn:(enabled:boolean)=>updateOperationalRule(rule.id,{enabled}),
    onSuccess:async()=>{await qc.invalidateQueries({queryKey:["operations","rules",restaurantId]})},
    onError:(error)=>toast.error(humanError(error,lang)),
  });
  const event=EVENTS.find((item)=>item.value===rule.event_type);
  return <article role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e)=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onOpen()}}} className="cursor-pointer p-4 outline-none transition hover:bg-muted/20 focus-visible:ring-2 focus-visible:ring-[#ff5a0a] sm:p-5">
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><span onClick={(e)=>e.stopPropagation()}><Switch checked={rule.enabled} disabled={toggle.isPending} onCheckedChange={(enabled)=>toggle.mutate(enabled)}/></span><h3 className="font-bold">{rule.name}</h3><RuleStatus status={rule.last_status}/>{rule.schedule_time?<span className="rounded-full bg-blue-500/10 px-2 py-1 text-[10px] font-bold text-blue-700">{ar?"مجدولة":"Scheduled"}</span>:null}</div>
        <p className="mt-1 text-xs text-muted-foreground">{ar?event?.ar:event?.en} · {rule.target_role ? ROLE_LABELS[rule.target_role]?.[lang] ?? rule.target_role : (ar?"بدون مالك":"No owner")} · {rule.priority}</p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground"><span>{ar?"المهلة":"Due"} {rule.due_minutes}m</span><span>{ar?"آخر تشغيل":"Last"} {formatWhen(rule.last_run_at,ar)}</span><span>{ar?"القادم":"Next"} {formatWhen(rule.next_run_at,ar)}</span></div>
        {rule.last_error?<p className="mt-2 line-clamp-2 rounded-lg bg-red-500/10 px-2.5 py-2 text-[10px] text-red-700">{rule.last_error}</p>:null}
      </div>
      <Button variant="outline" size="sm" onClick={(e)=>{e.stopPropagation();onOpen()}}><Settings2 className="size-4"/>{ar?"تعديل":"Edit"}</Button>
    </div>
  </article>;
}

function EditRuleDialog({rule,runs,restaurantId,open,onOpenChange,ar,lang}:{rule:OperationalRule;runs:AutomationRun[];restaurantId:string;open:boolean;onOpenChange:(open:boolean)=>void;ar:boolean;lang:"en"|"ar"}) {
  const qc=useQueryClient();
  const [name,setName]=useState(rule.name);
  const [description,setDescription]=useState(String(rule.rule_config?.description??""));
  const [eventType,setEventType]=useState<OperationalEventType>(rule.event_type);
  const [role,setRole]=useState<AppRole>(rule.target_role??"manager");
  const [priority,setPriority]=useState<WorkPriority>(rule.priority);
  const [dueMinutes,setDueMinutes]=useState(String(rule.due_minutes));
  const [approval,setApproval]=useState(rule.requires_approval);
  const [approvalRole,setApprovalRole]=useState<AppRole>(rule.approval_role??"restaurant_admin");
  const [scheduleTime,setScheduleTime]=useState(rule.schedule_time?.slice(0,5)??"");
  const [recurrence,setRecurrence]=useState<"daily"|"weekly">(rule.schedule_recurrence??"daily");
  const [timezone,setTimezone]=useState(rule.schedule_timezone||"Asia/Amman");
  const [confirmDelete,setConfirmDelete]=useState(false);

  const save=useMutation({
    mutationFn:()=>updateOperationalRule(rule.id,{
      name:name.trim(),
      event_type:eventType,
      target_role:role,
      priority,
      due_minutes:Math.max(0,Math.min(1440,Number(dueMinutes)||0)),
      requires_approval:approval,
      approval_role:approval?approvalRole:null,
      schedule_time:scheduleTime||null,
      schedule_recurrence:scheduleTime?recurrence:null,
      schedule_timezone:timezone.trim()||"Asia/Amman",
      rule_config:{...rule.rule_config,description:description.trim(),action_type:"create_work_task"},
    }),
    onSuccess:async()=>{await qc.invalidateQueries({queryKey:["operations","rules",restaurantId]});toast.success(ar?"تم حفظ القاعدة":"Automation rule saved");onOpenChange(false)},
    onError:(error)=>toast.error(humanError(error,lang)),
  });

  const runNow=useMutation({
    mutationFn:()=>runOperationalRule(rule.id),
    onSuccess:async(result)=>{
      await Promise.all([
        qc.invalidateQueries({queryKey:["operations","rules",restaurantId]}),
        qc.invalidateQueries({queryKey:["operations","automation-runs",restaurantId]}),
        qc.invalidateQueries({queryKey:["work",restaurantId]}),
        qc.invalidateQueries({queryKey:["operational-counters",restaurantId]}),
      ]);
      if (result) toast.success(ar?"تم تنفيذ القاعدة وإنشاء عمل":"Rule executed and work created");
      else toast.error(ar?"فشل التشغيل. راجع سجل التنفيذ.":"Run failed. Review execution history.");
    },
    onError:(error)=>toast.error(humanError(error,lang)),
  });

  const remove=useMutation({
    mutationFn:()=>deleteOperationalRule(rule.id),
    onSuccess:async()=>{await Promise.all([qc.invalidateQueries({queryKey:["operations","rules",restaurantId]}),qc.invalidateQueries({queryKey:["operations","automation-runs",restaurantId]})]);toast.success(ar?"تم حذف القاعدة":"Rule deleted");onOpenChange(false)},
    onError:(error)=>toast.error(humanError(error,lang)),
  });

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-[760px]"><DialogHeader><DialogTitle>{ar?"تعديل قاعدة الأتمتة":"Edit automation rule"}</DialogTitle><DialogDescription>{ar?"المنطق الحقيقي والجدولة والسجل في مكان واحد.":"Configure the real trigger, ownership, schedule and execution history."}</DialogDescription></DialogHeader>
    <div className="space-y-5 py-2">
      <SectionTitle icon={Settings2} title={ar?"القاعدة":"Rule"} subtitle={ar?"الاسم والوصف والإجراء الناتج.":"Name, description and resulting action."}/>
      <div className="grid gap-4 sm:grid-cols-2"><Field label={ar?"الاسم":"Name"} className="sm:col-span-2"><Input value={name} onChange={(e)=>setName(e.target.value)}/></Field><Field label={ar?"الوصف":"Description"} className="sm:col-span-2"><Textarea rows={3} value={description} onChange={(e)=>setDescription(e.target.value)} placeholder={ar?"ما الذي يجب على الفريق فعله؟":"What should the team do?"}/></Field><Field label={ar?"الإجراء":"Action"}><div className="flex min-h-11 items-center rounded-xl border border-border bg-muted/35 px-3 text-sm font-semibold">{ar?"إنشاء عنصر عمل":"Create work item"}</div></Field><Field label={ar?"الأولوية":"Priority"}><Select value={priority} onValueChange={(v)=>setPriority(v as WorkPriority)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{PRIORITIES.map((p)=><SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></Field></div>

      <SectionTitle icon={Zap} title={ar?"المشغّل والملكية":"Trigger & ownership"} subtitle={ar?"متى تبدأ القاعدة ولمن يُسند العمل.":"When the rule fires and who owns the work."}/>
      <div className="grid gap-4 sm:grid-cols-2"><Field label={ar?"المشغّل":"Trigger"}><Select value={eventType} onValueChange={(v)=>setEventType(v as OperationalEventType)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{EVENTS.map((event)=><SelectItem key={event.value} value={event.value}>{ar?event.ar:event.en}</SelectItem>)}</SelectContent></Select></Field><Field label={ar?"الدور المسؤول":"Target role"}><Select value={role} onValueChange={(v)=>setRole(v as AppRole)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{TARGET_ROLES.map((item)=><SelectItem key={item} value={item}>{ROLE_LABELS[item][lang]}</SelectItem>)}</SelectContent></Select></Field><Field label={ar?"المهلة بالدقائق":"Due in minutes"}><Input type="number" min={0} max={1440} value={dueMinutes} onChange={(e)=>setDueMinutes(e.target.value)}/></Field><div className="flex items-center justify-between rounded-xl border border-border p-3"><div><p className="text-sm font-bold">{ar?"تحتاج موافقة":"Requires approval"}</p><p className="text-[10px] text-muted-foreground">{ar?"يمر العمل بموافقة قبل الإكمال.":"Work must be approved before completion."}</p></div><Switch checked={approval} onCheckedChange={setApproval}/></div>{approval?<Field label={ar?"دور الموافق":"Approval role"} className="sm:col-span-2"><Select value={approvalRole} onValueChange={(v)=>setApprovalRole(v as AppRole)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{TARGET_ROLES.map((item)=><SelectItem key={item} value={item}>{ROLE_LABELS[item][lang]}</SelectItem>)}</SelectContent></Select></Field>:null}</div>

      <SectionTitle icon={CalendarClock} title={ar?"الجدولة":"Schedule"} subtitle={ar?"اختياري. تعمل من الخادم ولا تحتاج بقاء المتصفح مفتوحاً.":"Optional. Runs server-side and does not depend on an open browser."}/>
      <div className="grid gap-4 rounded-2xl border border-border p-4 sm:grid-cols-3"><Field label={ar?"الوقت":"Time"}><Input type="time" value={scheduleTime} onChange={(e)=>setScheduleTime(e.target.value)}/></Field><Field label={ar?"التكرار":"Recurrence"}><Select value={recurrence} disabled={!scheduleTime} onValueChange={(v)=>setRecurrence(v as "daily"|"weekly")}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="daily">{ar?"يومي":"Daily"}</SelectItem><SelectItem value="weekly">{ar?"أسبوعي":"Weekly"}</SelectItem></SelectContent></Select></Field><Field label={ar?"المنطقة الزمنية":"Timezone"}><Input value={timezone} onChange={(e)=>setTimezone(e.target.value)}/></Field>{scheduleTime?<Button type="button" variant="ghost" className="sm:col-span-3 justify-start px-0 text-xs text-muted-foreground" onClick={()=>setScheduleTime("")}>{ar?"إزالة الجدولة":"Remove schedule"}</Button>:null}</div>

      <SectionTitle icon={Activity} title={ar?"التنفيذ":"Execution"} subtitle={ar?"آخر نتيجة وسجل التشغيل لهذه القاعدة.":"Latest state and recent runs for this rule."}/>
      <div className="grid gap-3 sm:grid-cols-3"><StateCard label={ar?"آخر تشغيل":"Last run"} value={formatWhen(rule.last_run_at,ar)}/><StateCard label={ar?"التشغيل القادم":"Next run"} value={formatWhen(rule.next_run_at,ar)}/><StateCard label={ar?"الحالة":"Status"} value={rule.last_status??(ar?"لم تعمل":"Never")}/></div>
      {rule.last_error?<div className="rounded-xl border border-red-200 bg-red-50/60 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/10">{rule.last_error}</div>:null}
      <div className="overflow-hidden rounded-xl border border-border">{runs.length?runs.slice(0,6).map((run)=><RunItem key={run.id} run={run} rule={rule} ar={ar}/>):<p className="p-4 text-xs text-muted-foreground">{ar?"لا يوجد سجل تشغيل بعد.":"No execution history yet."}</p>}</div>

      {confirmDelete?<div className="rounded-2xl border border-red-200 bg-red-50/60 p-4 dark:border-red-900/50 dark:bg-red-950/10"><p className="text-sm font-bold text-red-700">{ar?"تأكيد حذف القاعدة؟":"Delete this rule?"}</p><p className="mt-1 text-xs text-muted-foreground">{ar?"سيتم حذف سجل القاعدة وتشغيلاتها المرتبطة.":"The rule and its execution history will be removed."}</p><div className="mt-3 flex gap-2"><Button variant="outline" onClick={()=>setConfirmDelete(false)}>{ar?"إلغاء":"Cancel"}</Button><Button variant="destructive" disabled={remove.isPending} onClick={()=>remove.mutate()}><Trash2 className="size-4"/>{ar?"حذف":"Delete"}</Button></div></div>:null}
    </div>
    <DialogFooter className="gap-2 sm:justify-between"><div className="flex gap-2"><Button variant="outline" disabled={runNow.isPending} onClick={()=>runNow.mutate()}><CirclePlay className="size-4"/>{ar?"تشغيل الآن":"Run now"}</Button><Button variant="ghost" className="text-destructive" onClick={()=>setConfirmDelete(true)}><Trash2 className="size-4"/>{ar?"حذف":"Delete"}</Button></div><div className="flex gap-2"><Button variant="outline" onClick={()=>onOpenChange(false)}>{ar?"إلغاء":"Cancel"}</Button><Button disabled={!name.trim()||save.isPending} onClick={()=>save.mutate()}>{ar?"حفظ":"Save changes"}</Button></div></DialogFooter>
  </DialogContent></Dialog>;
}

function CreateRuleDialog({open,onOpenChange,restaurantId,ar,lang}:{open:boolean;onOpenChange:(open:boolean)=>void;restaurantId:string;ar:boolean;lang:"en"|"ar"}) {
  const qc=useQueryClient();
  const [name,setName]=useState("");
  const [eventType,setEventType]=useState<OperationalEventType>("manual_exception");
  const [role,setRole]=useState<AppRole>("manager");
  const [priority,setPriority]=useState<WorkPriority>("normal");
  const [dueMinutes,setDueMinutes]=useState("15");
  const [scheduleTime,setScheduleTime]=useState("");

  const create=useMutation({
    mutationFn:()=>createOperationalRule({
      restaurant_id:restaurantId,
      name:name.trim(),
      event_type:eventType,
      enabled:true,
      priority,
      target_role:role,
      due_minutes:Math.max(0,Math.min(1440,Number(dueMinutes)||15)),
      requires_approval:false,
      approval_role:null,
      schedule_time:scheduleTime||null,
      schedule_recurrence:scheduleTime?"daily":null,
      schedule_timezone:"Asia/Amman",
      rule_config:{action_type:"create_work_task"},
    }),
    onSuccess:async()=>{await qc.invalidateQueries({queryKey:["operations","rules",restaurantId]});toast.success(ar?"تم إنشاء قاعدة الأتمتة":"Automation rule created");setName("");setScheduleTime("");onOpenChange(false)},
    onError:(error)=>toast.error(humanError(error,lang)),
  });

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-[620px]"><DialogHeader><DialogTitle>{ar?"قاعدة أتمتة جديدة":"New automation rule"}</DialogTitle><DialogDescription>{ar?"ابدأ بالأساسيات، ثم افتح القاعدة لتخصيص الموافقة والجدولة بالكامل.":"Start with the essentials, then open the rule for full approval and schedule controls."}</DialogDescription></DialogHeader><div className="grid gap-4 py-2 sm:grid-cols-2"><Field label={ar?"الاسم":"Name"} className="sm:col-span-2"><Input value={name} onChange={(e)=>setName(e.target.value)}/></Field><Field label={ar?"المشغّل":"Trigger"}><Select value={eventType} onValueChange={(v)=>setEventType(v as OperationalEventType)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{EVENTS.map((event)=><SelectItem key={event.value} value={event.value}>{ar?event.ar:event.en}</SelectItem>)}</SelectContent></Select></Field><Field label={ar?"الدور المسؤول":"Target role"}><Select value={role} onValueChange={(v)=>setRole(v as AppRole)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{TARGET_ROLES.map((item)=><SelectItem key={item} value={item}>{ROLE_LABELS[item][lang]}</SelectItem>)}</SelectContent></Select></Field><Field label={ar?"الأولوية":"Priority"}><Select value={priority} onValueChange={(v)=>setPriority(v as WorkPriority)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{PRIORITIES.map((p)=><SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></Field><Field label={ar?"المهلة بالدقائق":"Due minutes"}><Input type="number" min={0} max={1440} value={dueMinutes} onChange={(e)=>setDueMinutes(e.target.value)}/></Field><Field label={ar?"وقت يومي اختياري":"Optional daily time"} className="sm:col-span-2"><Input type="time" value={scheduleTime} onChange={(e)=>setScheduleTime(e.target.value)}/></Field></div><DialogFooter><Button variant="outline" onClick={()=>onOpenChange(false)}>{ar?"إلغاء":"Cancel"}</Button><Button disabled={!name.trim()||create.isPending} onClick={()=>create.mutate()}>{ar?"إنشاء القاعدة":"Create rule"}</Button></DialogFooter></DialogContent></Dialog>;
}

function RunItem({run,rule,ar}:{run:AutomationRun;rule?:OperationalRule | undefined;ar:boolean}) {
  return <div className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><RunStatus status={run.status}/><strong className="truncate text-xs">{rule?.name??(ar?"قاعدة أتمتة":"Automation rule")}</strong></div><p className="mt-1 text-[10px] text-muted-foreground">{run.triggered_by} · {formatWhen(run.started_at,ar)}</p>{run.result_summary?<p className="mt-1 text-xs text-muted-foreground">{run.result_summary}</p>:null}{run.error?<p className="mt-2 line-clamp-3 text-[10px] text-red-700">{run.error}</p>:null}</div>{run.work_task_id?<span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-1 text-[9px] font-bold text-emerald-700">{ar?"عمل منشأ":"Work created"}</span>:null}</div></div>;
}

function Metric({icon:Icon,label,value,tone}:{icon:typeof Workflow;label:string;value:number;tone?:"danger"|"success"|undefined}){return <article className="qs-stat flex min-h-[106px] items-center gap-4 p-4"><span className={cn("grid size-11 place-items-center rounded-2xl",tone==="danger"?"bg-red-500/10 text-red-600":tone==="success"?"bg-emerald-500/10 text-emerald-700":"bg-orange-500/10 text-[#ff5a0a]")}><Icon className="size-5"/></span><div><p className="text-[11px] font-semibold text-muted-foreground">{label}</p><strong className="mt-1 block font-display text-3xl tracking-[-.04em]">{value}</strong></div></article>}
function RuleStatus({status}:{status:OperationalRule["last_status"]}){return status==="failed"?<span className="rounded-full bg-red-500/10 px-2 py-1 text-[9px] font-bold text-red-700">Failed</span>:status==="success"?<span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[9px] font-bold text-emerald-700">Success</span>:<span className="rounded-full bg-muted px-2 py-1 text-[9px] font-bold text-muted-foreground">Never</span>}
function RunStatus({status}:{status:AutomationRun["status"]}){return status==="failed"?<span className="grid size-6 place-items-center rounded-full bg-red-500/10 text-red-600"><AlertTriangle className="size-3.5"/></span>:status==="success"?<span className="grid size-6 place-items-center rounded-full bg-emerald-500/10 text-emerald-600"><CheckCircle2 className="size-3.5"/></span>:<span className="grid size-6 place-items-center rounded-full bg-blue-500/10 text-blue-600"><Clock3 className="size-3.5"/></span>}
function SectionTitle({icon:Icon,title,subtitle}:{icon:typeof Settings2;title:string;subtitle:string}){return <div className="flex items-start gap-3 border-t border-border pt-5 first:border-t-0 first:pt-0"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-orange-500/10 text-[#ff5a0a]"><Icon className="size-4"/></span><div><h3 className="text-sm font-bold">{title}</h3><p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p></div></div>}
function StateCard({label,value}:{label:string;value:string}){return <div className="rounded-xl bg-muted/45 p-3"><p className="text-[10px] font-bold uppercase tracking-[.08em] text-muted-foreground">{label}</p><strong className="mt-1 block text-sm capitalize">{value}</strong></div>}
function Field({label,children,className=""}:{label:string;children:React.ReactNode;className?:string}){return <div className={cn("space-y-2",className)}><Label className="text-[10px] font-bold uppercase tracking-[.08em] text-muted-foreground">{label}</Label>{children}</div>}
function formatWhen(value:string|null,ar:boolean){if(!value)return "—";return new Date(value).toLocaleString(ar?"ar-JO":"en-JO",{dateStyle:"medium",timeStyle:"short"})}
function EmptyRules({ar,onCreate}:{ar:boolean;onCreate:()=>void}){return <div className="grid min-h-[300px] place-items-center p-8 text-center"><div><Workflow className="mx-auto size-9 text-muted-foreground"/><h3 className="mt-3 font-bold">{ar?"لا توجد قواعد بعد":"No automation rules yet"}</h3><p className="mt-1 text-xs text-muted-foreground">{ar?"أنشئ قاعدة لتحويل حدث تشغيلي إلى عمل تلقائي.":"Create a rule to turn an operational event into automatic work."}</p><Button className="mt-4" onClick={onCreate}><Plus className="size-4"/>{ar?"قاعدة جديدة":"New rule"}</Button></div></div>}
function Denied({ar}:{ar:boolean}){return <div className="min-h-dvh bg-background"><AppHeader/><main className="qs-page"><section className="qs-card p-8 text-center"><Zap className="mx-auto size-10 text-muted-foreground"/><h1 className="mt-4 text-xl font-bold">{ar?"الأتمتة غير متاحة":"Automation is not available"}</h1><p className="mt-2 text-sm text-muted-foreground">{ar?"هذا الحساب لا يملك صلاحية إدارة قواعد التشغيل.":"This account does not have permission to manage automation rules."}</p></section></main></div>}
