import { cloneElement, isValidElement, useId, useRef, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarClock, ChevronDown, CirclePlay, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createOperationalRule,
  deleteOperationalRule,
  runOperationalRule,
  updateOperationalRule,
  type AutomationRun,
  type OperationalRule,
  type OperationalEventType,
  type WorkPriority,
} from "@/hooks/useOperations";
import { ROLE_LABELS, type AppRole } from "@/lib/permissions";
import { humanError } from "@/lib/errors";
import {
  EVENTS,
  RuleSwitch as Switch,
  PRIORITIES,
  TARGET_ROLES,
  RulePreview,
  RunHistory,
  formatWhen,
  priorityLabel,
} from "./AutomationPrimitives";

export function RuleEditor({
  restaurantId,
  rule,
  runs,
  ar,
  onClose,
}: {
  restaurantId: string;
  rule?: OperationalRule | undefined;
  runs: AutomationRun[];
  ar: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient(),
    lang = ar ? "ar" : "en",
    editing = Boolean(rule);
  const [name, setName] = useState(rule?.name ?? ""),
    [description, setDescription] = useState(String(rule?.rule_config?.description ?? ""));
  const [eventType, setEventType] = useState<OperationalEventType>(
    rule?.event_type ?? "manual_exception",
  );
  const [role, setRole] = useState<AppRole>(rule?.target_role ?? "manager"),
    [priority, setPriority] = useState<WorkPriority>(rule?.priority ?? "normal");
  const [due, setDue] = useState(String(rule?.due_minutes ?? 15)),
    [enabled, setEnabled] = useState(rule?.enabled ?? true);
  const [approval, setApproval] = useState(rule?.requires_approval ?? false),
    [approvalRole, setApprovalRole] = useState<AppRole>(rule?.approval_role ?? "restaurant_admin");
  const [time, setTime] = useState(rule?.schedule_time?.slice(0, 5) ?? ""),
    [recurrence, setRecurrence] = useState<"daily" | "weekly">(
      rule?.schedule_recurrence ?? "daily",
    ),
    [timezone, setTimezone] = useState(rule?.schedule_timezone ?? "Asia/Amman");
  const [tab, setTab] = useState<"configuration" | "history">("configuration"),
    [confirmDelete, setConfirmDelete] = useState(false);
  const formId = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  const payload = {
    name: name.trim(),
    event_type: eventType,
    enabled,
    priority,
    target_role: role,
    due_minutes: Number(due),
    requires_approval: approval,
    approval_role: approval ? approvalRole : null,
    schedule_time: time || null,
    schedule_recurrence: time ? recurrence : null,
    schedule_timezone: timezone.trim() || "Asia/Amman",
    rule_config: {
      ...rule?.rule_config,
      description: description.trim(),
      action_type: "create_work_task",
    },
  };
  const dirty = Boolean(
    rule &&
    (name !== rule.name ||
      description !== String(rule.rule_config?.description ?? "") ||
      eventType !== rule.event_type ||
      role !== (rule.target_role ?? "manager") ||
      priority !== rule.priority ||
      due !== String(rule.due_minutes) ||
      enabled !== rule.enabled ||
      approval !== rule.requires_approval ||
      approvalRole !== (rule.approval_role ?? "restaurant_admin") ||
      time !== (rule.schedule_time?.slice(0, 5) ?? "") ||
      recurrence !== (rule.schedule_recurrence ?? "daily") ||
      timezone !== (rule.schedule_timezone ?? "Asia/Amman")),
  );
  const invalidate = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["operations", "rules", restaurantId] }),
      qc.invalidateQueries({ queryKey: ["operations", "automation-runs", restaurantId] }),
    ]);
  const save = useMutation({
    mutationFn: async () => {
      if (
        !payload.name ||
        !Number.isInteger(payload.due_minutes) ||
        payload.due_minutes < 0 ||
        payload.due_minutes > 1440
      )
        throw new Error(
          ar
            ? "أدخل اسمًا ومهلة بين 0 و1440 دقيقة."
            : "Enter a name and a due time between 0 and 1440 minutes.",
        );
      if (time) {
        try {
          new Intl.DateTimeFormat("en", { timeZone: payload.schedule_timezone }).format();
        } catch {
          throw new Error(ar ? "أدخل منطقة زمنية صحيحة." : "Enter a valid timezone.");
        }
      }
      if (rule) await updateOperationalRule(rule.id, payload);
      else await createOperationalRule({ ...payload, restaurant_id: restaurantId });
    },
    onSuccess: async () => {
      await invalidate();
      toast.success(
        editing
          ? ar
            ? "تم حفظ القاعدة"
            : "Automation rule saved"
          : ar
            ? "تم إنشاء القاعدة"
            : "Automation rule created",
      );
      onClose();
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });
  const runNow = useMutation({
    mutationFn: () => runOperationalRule(rule!.id),
    onSuccess: async (result) => {
      await Promise.all([
        invalidate(),
        qc.invalidateQueries({ queryKey: ["work", restaurantId] }),
        qc.invalidateQueries({ queryKey: ["operational-counters", restaurantId] }),
      ]);
      if (result)
        toast.success(ar ? "تم تنفيذ القاعدة وإنشاء عمل" : "Rule executed and work created");
      else
        toast.error(
          ar ? "فشل التشغيل. راجع سجل التنفيذ." : "Run failed. Review execution history.",
        );
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });
  const remove = useMutation({
    mutationFn: () => deleteOperationalRule(rule!.id),
    onSuccess: async () => {
      await invalidate();
      toast.success(ar ? "تم حذف القاعدة" : "Rule deleted");
      onClose();
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });
  const busy = save.isPending || remove.isPending || runNow.isPending;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        ref={contentRef}
        className="au-studio au-rule-dialog"
        dir={ar ? "rtl" : "ltr"}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          contentRef.current?.focus({ preventScroll: true });
        }}
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>
            {editing ? (ar ? "تعديل القاعدة" : "Edit rule") : ar ? "قاعدة جديدة" : "New rule"}
          </DialogTitle>
          <DialogDescription>
            {ar
              ? "خصص المشغل والإجراء واحفظ القاعدة."
              : "Configure the trigger and action, then save your rule."}
          </DialogDescription>
        </DialogHeader>
        <section className="au-editor">
          <header className="au-heading">
            <div>
              <button type="button" className="au-back" disabled={busy} onClick={onClose}>
                <ArrowLeft size={14} />
                {ar ? "الأتمتة" : "Automation"}
              </button>
              <h1>
                {editing ? (ar ? "تعديل القاعدة" : "Edit rule") : ar ? "قاعدة جديدة" : "New rule"}
              </h1>
              <p>
                {editing
                  ? ar
                    ? "حدّث تفاصيل هذه القاعدة وطريقة عملها."
                    : "Update the details and behavior of this rule."
                  : ar
                    ? "حوّل حدثاً في المطعم إلى عمل محدد المسؤول."
                    : "Turn a restaurant event into assigned work."}
              </p>
            </div>
            {editing ? (
              <div className="au-enable">
                <Switch
                  checked={enabled}
                  disabled={busy}
                  onCheckedChange={setEnabled}
                  aria-label={ar ? "تفعيل القاعدة" : "Enable rule"}
                />
                <span>{enabled ? (ar ? "فعالة" : "Active") : ar ? "متوقفة" : "Paused"}</span>
              </div>
            ) : null}
          </header>
          {editing ? (
            <div
              className="au-tabs"
              role="tablist"
              aria-label={ar ? "تعديل القاعدة" : "Rule editor views"}
            >
              {(["configuration", "history"] as const).map((t) => (
                <button
                  role="tab"
                  aria-selected={tab === t}
                  aria-controls={`au-editor-${t}`}
                  id={`au-editor-tab-${t}`}
                  key={t}
                  onClick={() => setTab(t)}
                >
                  {t === "configuration"
                    ? ar
                      ? "الإعدادات"
                      : "Configuration"
                    : ar
                      ? "سجل التشغيل"
                      : "Run history"}
                </button>
              ))}
            </div>
          ) : null}
          <form
            id={formId}
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
            className="au-editor-grid"
          >
            <div className="au-editor-fields">
              {tab === "history" ? (
                <section
                  className="au-panel"
                  role="tabpanel"
                  id="au-editor-history"
                  aria-labelledby="au-editor-tab-history"
                >
                  <RunHistory runs={runs} rules={rule ? [rule] : []} ar={ar} />
                  {rule?.last_error ? (
                    <p className="au-rule-error p-4" role="alert">
                      {rule.last_error}
                    </p>
                  ) : null}
                </section>
              ) : (
                <fieldset
                  className="au-panel au-form-panel"
                  disabled={busy}
                  role={editing ? "tabpanel" : undefined}
                  id="au-editor-configuration"
                  aria-labelledby={editing ? "au-editor-tab-configuration" : undefined}
                >
                  <section>
                    <h2>{ar ? "1. تفاصيل القاعدة" : "1. Rule details"}</h2>
                    <Field label={ar ? "الاسم" : "Name"}>
                      <input
                        required
                        maxLength={160}
                        value={name}
                        placeholder={ar ? "اسم القاعدة" : "Rule name"}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </Field>
                    <Field label={ar ? "الوصف" : "Description"}>
                      <textarea
                        rows={3}
                        value={description}
                        placeholder={
                          ar ? "ما الذي يجب على الفريق فعله؟" : "What should the team do?"
                        }
                        onChange={(e) => setDescription(e.target.value)}
                      />
                    </Field>
                  </section>
                  <section>
                    <h2>{ar ? "2. عند وقوع الحدث" : "2. When it happens"}</h2>
                    <Field label={ar ? "المشغّل" : "Trigger"}>
                      <select
                        value={eventType}
                        onChange={(e) => setEventType(e.target.value as OperationalEventType)}
                      >
                        {EVENTS.map((e) => (
                          <option key={e.value} value={e.value}>
                            {ar ? e.ar : e.en}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </section>
                  <section>
                    <h2>{ar ? "3. الإنشاء والتعيين" : "3. Create and assign"}</h2>
                    <Field label={ar ? "الإجراء" : "Action"}>
                      <input value={ar ? "إنشاء عنصر عمل" : "Create work task"} readOnly />
                    </Field>
                    <div className="au-three-fields">
                      <Field label={ar ? "المسؤول" : "Assign to"}>
                        <select value={role} onChange={(e) => setRole(e.target.value as AppRole)}>
                          {TARGET_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r][lang]}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label={ar ? "الأولوية" : "Priority"}>
                        <select
                          value={priority}
                          onChange={(e) => setPriority(e.target.value as WorkPriority)}
                        >
                          {PRIORITIES.map((p) => (
                            <option value={p} key={p}>
                              {priorityLabel(p, ar)}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label={ar ? "المهلة بالدقائق" : "Due in (min)"}>
                        <input
                          required
                          type="number"
                          min={0}
                          max={1440}
                          step={1}
                          value={due}
                          onChange={(e) => setDue(e.target.value)}
                        />
                      </Field>
                    </div>
                    {editing ? (
                      <>
                        <div className="au-approval">
                          <span>{ar ? "تحتاج موافقة" : "Requires approval"}</span>
                          <Switch
                            checked={approval}
                            onCheckedChange={setApproval}
                            aria-label={ar ? "تحتاج موافقة" : "Requires approval"}
                          />
                          <small>
                            {ar
                              ? "يلزم اعتماد العمل قبل اكتماله."
                              : "Work must be approved before it’s marked complete."}
                          </small>
                        </div>
                        {approval ? (
                          <Field label={ar ? "دور الموافق" : "Approval role"}>
                            <select
                              value={approvalRole}
                              onChange={(e) => setApprovalRole(e.target.value as AppRole)}
                            >
                              {TARGET_ROLES.map((r) => (
                                <option key={r} value={r}>
                                  {ROLE_LABELS[r][lang]}
                                </option>
                              ))}
                            </select>
                          </Field>
                        ) : null}
                      </>
                    ) : null}
                  </section>
                  <details className="au-schedule" open={undefined}>
                    <summary>
                      <CalendarClock size={16} />
                      <span>
                        <strong>{ar ? "الجدولة (اختياري)" : "Schedule (optional)"}</strong>
                        <small>
                          {time
                            ? `${time} · ${recurrence === "daily" ? (ar ? "يومي" : "Every day") : ar ? "أسبوعي" : "Weekly"} · ${timezone}`
                            : ar
                              ? "بدون وقت مجدول"
                              : "No scheduled time"}
                        </small>
                      </span>
                      <ChevronDown size={15} />
                    </summary>
                    <div className="au-schedule-fields">
                      <Field label={ar ? "الوقت" : "Time"}>
                        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                      </Field>
                      <Field label={ar ? "التكرار" : "Recurrence"}>
                        <select
                          disabled={!time}
                          value={recurrence}
                          onChange={(e) => setRecurrence(e.target.value as "daily" | "weekly")}
                        >
                          <option value="daily">{ar ? "يومي" : "Daily"}</option>
                          <option value="weekly">{ar ? "أسبوعي" : "Weekly"}</option>
                        </select>
                      </Field>
                      <Field label={ar ? "المنطقة الزمنية" : "Timezone"}>
                        <input
                          dir="ltr"
                          value={timezone}
                          onChange={(e) => setTimezone(e.target.value)}
                        />
                      </Field>
                      {time ? (
                        <button
                          type="button"
                          className="au-text-button"
                          onClick={() => setTime("")}
                        >
                          {ar ? "إزالة الجدولة" : "Remove schedule"}
                        </button>
                      ) : null}
                    </div>
                  </details>
                </fieldset>
              )}
            </div>
            <aside className="au-panel au-editor-preview">
              <h2>
                {editing
                  ? ar
                    ? "ملخص القاعدة"
                    : "Rule summary"
                  : ar
                    ? "معاينة القاعدة"
                    : "Rule preview"}
              </h2>
              {!editing ? (
                <p>
                  {ar
                    ? "إليك ما سيحدث عند تشغيل القاعدة."
                    : "Here’s what will happen when this rule runs."}
                </p>
              ) : null}
              <RulePreview
                value={{
                  event_type: eventType,
                  target_role: role,
                  priority,
                  due_minutes: Number(due) || 0,
                }}
                ar={ar}
              />
              {rule ? (
                <div className="au-run-state">
                  {[
                    [ar ? "آخر تشغيل" : "Last run", formatWhen(rule.last_run_at, ar)],
                    [ar ? "القادم" : "Next run", formatWhen(rule.next_run_at, ar)],
                    [
                      ar ? "الحالة" : "Status",
                      rule.last_status === "success"
                        ? ar
                          ? "ناجح"
                          : "Success"
                        : rule.last_status === "failed"
                          ? ar
                            ? "فشل"
                            : "Failed"
                          : ar
                            ? "لم تعمل"
                            : "Never run",
                    ],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <small>{label}</small>
                      <strong>{value}</strong>
                    </div>
                  ))}
                </div>
              ) : null}
            </aside>
          </form>
          <footer className="au-editor-footer">
            {rule ? (
              <div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || dirty}
                  title={
                    dirty
                      ? ar
                        ? "احفظ التغييرات قبل التشغيل"
                        : "Save changes before running"
                      : undefined
                  }
                  onClick={() => runNow.mutate()}
                >
                  <CirclePlay size={15} />
                  {ar ? "تشغيل الآن" : "Run now"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="au-delete"
                  disabled={busy}
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 size={15} />
                  {ar ? "حذف" : "Delete"}
                </Button>
              </div>
            ) : (
              <span />
            )}
            <div>
              <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
                {ar ? "إلغاء" : "Cancel"}
              </Button>
              <Button
                form={formId}
                type="submit"
                className="au-primary"
                disabled={busy || !name.trim()}
                aria-busy={save.isPending}
              >
                {editing
                  ? ar
                    ? "حفظ التغييرات"
                    : "Save changes"
                  : ar
                    ? "إنشاء القاعدة"
                    : "Create rule"}
              </Button>
            </div>
          </footer>
          <Dialog
            open={confirmDelete}
            onOpenChange={(v) => {
              if (!remove.isPending) setConfirmDelete(v);
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{ar ? "حذف هذه القاعدة؟" : "Delete this rule?"}</DialogTitle>
                <DialogDescription>
                  {ar
                    ? "سيتم حذف القاعدة وسجل تنفيذها. لا يمكن التراجع عن هذه الخطوة."
                    : "The rule and its execution history will be removed. This cannot be undone."}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  disabled={remove.isPending}
                  onClick={() => setConfirmDelete(false)}
                >
                  {ar ? "إلغاء" : "Cancel"}
                </Button>
                <Button
                  variant="destructive"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate()}
                >
                  {ar ? "حذف القاعدة" : "Delete rule"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </section>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className="au-field">
      <label htmlFor={id}>{label}</label>
      {isValidElement<{ id?: string }>(children) ? cloneElement(children, { id }) : children}
    </div>
  );
}
