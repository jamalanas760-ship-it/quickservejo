import {
  ArrowDown,
  CheckCircle2,
  CircleAlert,
  Clock3,
  FileClock,
  Settings2,
  UsersRound,
  Utensils,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  AutomationRun,
  OperationalEventType,
  OperationalRule,
  WorkPriority,
} from "@/hooks/useOperations";
import { ROLE_LABELS, type AppRole } from "@/lib/permissions";

export const EVENTS: Array<{ value: OperationalEventType; en: string; ar: string }> = [
  { value: "waiter_call_created", en: "Waiter call created", ar: "طلب نادل جديد" },
  { value: "order_stuck", en: "Order stuck", ar: "طلب متأخر" },
  { value: "low_stock", en: "Low stock", ar: "مخزون منخفض" },
  { value: "shift_opening", en: "Shift opening", ar: "فتح الوردية" },
  { value: "shift_closing", en: "Shift closing", ar: "إغلاق الوردية" },
  { value: "manual_exception", en: "Manual exception", ar: "استثناء يدوي" },
];
export const TARGET_ROLES: AppRole[] = [
  "restaurant_admin",
  "operations_manager",
  "manager",
  "kitchen",
  "waiter",
  "cashier",
  "host",
  "inventory",
  "procurement",
  "accountant",
];
export const PRIORITIES: WorkPriority[] = ["low", "normal", "high", "urgent"];
export function ruleLabel(event: OperationalEventType, ar: boolean) {
  return EVENTS.find((e) => e.value === event)?.[ar ? "ar" : "en"] ?? event;
}
export function priorityLabel(priority: WorkPriority, ar: boolean) {
  return ar
    ? { low: "منخفضة", normal: "عادية", high: "عالية", urgent: "عاجلة" }[priority]
    : priority.charAt(0).toUpperCase() + priority.slice(1);
}
export function formatWhen(value: string | null, ar: boolean) {
  return value
    ? new Date(value).toLocaleString(ar ? "ar-JO" : "en-JO", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";
}

export function RulePreview({
  value,
  ar,
  compact = false,
}: {
  value: Pick<OperationalRule, "event_type" | "target_role" | "priority" | "due_minutes">;
  ar: boolean;
  compact?: boolean;
}) {
  const owner = value.target_role
    ? ROLE_LABELS[value.target_role]?.[ar ? "ar" : "en"]
    : ar
      ? "بدون مسؤول"
      : "No owner";
  const rows = [
    {
      Icon: Utensils,
      tone: "orange",
      label: ar ? "متى" : "WHEN",
      value: ruleLabel(value.event_type, ar),
      detail: ar ? "عند وقوع هذا الحدث." : "When this event happens.",
    },
    {
      Icon: Settings2,
      tone: "blue",
      label: ar ? "إنشاء" : "CREATE",
      value: ar ? "عنصر عمل" : "Work task",
      detail: ar ? "سيتم إنشاء عنصر عمل جديد." : "A new work task will be created.",
    },
    {
      Icon: UsersRound,
      tone: "green",
      label: ar ? "تعيين" : "ASSIGN",
      value: `${owner} · ${priorityLabel(value.priority, ar)} · ${ar ? "خلال" : "Due in"} ${value.due_minutes} ${ar ? "د" : "min"}`,
      detail: ar
        ? "مع المسؤول والأولوية والمهلة المحددة."
        : "With the selected owner, priority and due time.",
    },
  ];
  return (
    <div
      className={`au-flow ${compact ? "is-compact" : ""}`}
      aria-label={ar ? "معاينة القاعدة" : "Rule preview"}
    >
      {rows.map((r, i) => (
        <div className="au-flow-step" key={r.tone}>
          <div className="au-flow-track">
            <span className={`au-icon ${r.tone}`}>
              <r.Icon size={18} />
            </span>
            {i < 2 ? <ArrowDown className="au-flow-arrow" size={13} /> : null}
          </div>
          <div>
            <small>{r.label}</small>
            <strong>{r.value}</strong>
            {!compact ? <p>{r.detail}</p> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export function RunHistory({
  runs,
  rules = [],
  ar,
  pending,
  error,
  compact = false,
}: {
  runs: AutomationRun[];
  rules?: OperationalRule[];
  ar: boolean;
  pending?: boolean;
  error?: string | undefined;
  compact?: boolean;
}) {
  if (pending)
    return (
      <div className="p-4">
        <Skeleton className="h-24" />
      </div>
    );
  if (error)
    return (
      <p className="au-empty text-destructive" role="alert">
        {error}
      </p>
    );
  if (!runs.length)
    return (
      <div className={`au-empty ${compact ? "is-compact" : ""}`}>
        <FileClock size={28} />
        <strong>{ar ? "لا تشغيلات بعد" : "No runs yet"}</strong>
        <p>
          {ar
            ? "سيظهر سجل التشغيل هنا عند تنفيذ القواعد."
            : "Your run history will appear here when rules start executing."}
        </p>
      </div>
    );
  return (
    <div className="au-runs">
      {runs.map((run) => {
        const Icon =
          run.status === "success" ? CheckCircle2 : run.status === "failed" ? CircleAlert : Clock3;
        return (
          <article key={run.id}>
            <Icon size={18} className={`au-run-icon ${run.status}`} />
            <div>
              <strong>
                {rules.find((r) => r.id === run.rule_id)?.name ??
                  (ar ? "قاعدة أتمتة" : "Automation rule")}
              </strong>
              <p>
                {formatWhen(run.started_at, ar)} ·{" "}
                {ar
                  ? { manual: "يدوي", scheduled: "مجدول", event: "حدث" }[run.triggered_by]
                  : run.triggered_by}
              </p>
              <span className={`au-pill ${run.status}`}>
                {ar
                  ? { success: "ناجح", failed: "فشل", running: "جارٍ التشغيل" }[run.status]
                  : { success: "Success", failed: "Failed", running: "Running" }[run.status]}
              </span>
              {run.result_summary ? <p className="au-run-summary">{run.result_summary}</p> : null}
              {run.error ? <p className="au-rule-error">{run.error}</p> : null}
              {run.work_task_id ? <small>{ar ? "تم إنشاء عمل" : "Work created"}</small> : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function RuleSwitch({
  checked,
  onCheckedChange,
  disabled,
  "aria-label": label,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  "aria-label": string;
}) {
  return (
    <button
      type="button"
      className="au-switch"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      data-state={checked ? "checked" : "unchecked"}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
    >
      <span />
    </button>
  );
}
