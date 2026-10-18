import { useId, useState } from "react";
import { ChevronDown, Info, List, Send } from "lucide-react";
import { workforceDayKey } from "@/lib/workforce-hours";
import type { validateMissingPunch } from "@/lib/missing-punch";
import { RequestDatePicker, RequestTimePicker } from "./RequestPickers";
import { WorkforceButton as Button } from "./WorkforceButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type MissingPunchMode = "clock_in" | "clock_out" | "both";
export function MissingPunchComposer({
  ar,
  timeZone,
  mode,
  onMode,
  clockIn,
  clockOut,
  onClockIn,
  onClockOut,
  breakMinutes,
  onBreakMinutes,
  reason,
  onReason,
  validation,
  pending,
  scheduledIn,
  scheduledOut,
  onUseSchedule,
  onSubmit,
}: {
  ar: boolean;
  timeZone: string;
  mode: MissingPunchMode;
  onMode: (value: MissingPunchMode) => void;
  clockIn: string;
  clockOut: string;
  onClockIn: (value: string) => void;
  onClockOut: (value: string) => void;
  breakMinutes: string;
  onBreakMinutes: (value: string) => void;
  reason: string;
  onReason: (value: string) => void;
  validation: ReturnType<typeof validateMissingPunch>;
  pending: boolean;
  scheduledIn: string;
  scheduledOut: string;
  onUseSchedule: () => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const labels: Record<MissingPunchMode, string> = {
    clock_in: ar ? "دخول مفقود" : "Missing clock-in",
    clock_out: ar ? "انصراف مفقود" : "Missing clock-out",
    both: ar ? "البصمتان مفقودتان" : "Both punches",
  };
  const issueText: Record<NonNullable<typeof validation.issue>, string> = {
    missing_times: ar
      ? "أكمل وقتي الدخول والانصراف؛ راجع التفاصيل الإضافية لوقت الجلسة الآخر."
      : "Add both session times. The other time is available in additional details.",
    invalid_times: ar
      ? "اختر تاريخًا ووقتًا صالحين بتوقيت المطعم."
      : "Choose valid dates and times in restaurant time.",
    order: ar
      ? "يجب أن يكون الانصراف بعد الدخول بدقيقة على الأقل."
      : "Clock-out must be at least one minute after clock-in.",
    too_long: ar ? "لا يمكن أن تتجاوز الجلسة 36 ساعة." : "A session cannot exceed 36 hours.",
    break: ar
      ? "أدخل دقائق استراحة صحيحة وأقل من مدة الجلسة."
      : "Enter whole break minutes shorter than the session.",
    future: ar ? "لا يمكن طلب بصمة في المستقبل." : "Missing punches cannot be in the future.",
    reason: ar ? "أدخل سببًا من 3 أحرف على الأقل." : "Enter a reason of at least 3 characters.",
  };
  const field = (kind: "clock_in" | "clock_out") => {
    const value = kind === "clock_in" ? clockIn : clockOut;
    const change = kind === "clock_in" ? onClockIn : onClockOut;
    const [date = "", time = ""] = value.split("T");
    const title =
      kind === "clock_in" ? (ar ? "وقت الدخول" : "Clock-in") : ar ? "وقت الانصراف" : "Clock-out";
    return (
      <fieldset className="wf-punch-time-group" disabled={pending}>
        <legend>{title}</legend>
        <p>
          {ar ? "وقت المطعم" : "Restaurant time"} · {timeZone}
        </p>
        <div className="wf-punch-date-time">
          <RequestDatePicker
            label={ar ? "التاريخ" : "Date"}
            context={title}
            value={date}
            ar={ar}
            timeZone={timeZone}
            max={workforceDayKey(new Date(), timeZone)}
            pastPresets
            disabled={pending}
            onChange={(next) => change(`${next}T${time || "09:00"}`)}
          />
          <RequestTimePicker
            label={ar ? "الوقت" : "Time"}
            value={time}
            ar={ar}
            disabled={pending}
            onChange={(next) => change(`${date || workforceDayKey(new Date(), timeZone)}T${next}`)}
          />
        </div>
      </fieldset>
    );
  };
  const displayTime = (value: string) => (value ? value.split("T")[1]?.slice(0, 5) || "—" : "—");
  const displayDay = scheduledIn || clockIn || clockOut;
  const dayLabel = displayDay
    ? new Date(`${displayDay.slice(0, 10)}T12:00:00Z`).toLocaleDateString(ar ? "ar-JO" : "en-GB", {
        timeZone: "UTC",
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : ar
      ? "لم يحدد التاريخ"
      : "No date selected";
  return (
    <form
      className="wf-punch-composer"
      onSubmit={(event) => {
        event.preventDefault();
        if (validation.valid && !pending) onSubmit();
      }}
    >
      <div className="wf-punch-scroll">
        <p className="wf-punch-context-line">
          {dayLabel} ·{" "}
          <span dir="ltr">
            {displayTime(scheduledIn || clockIn)} – {displayTime(scheduledOut || clockOut)}
          </span>
        </p>
        <Label htmlFor={`${id}-mode`}>{ar ? "ما البصمة المفقودة؟" : "What was missed?"}</Label>
        <select
          id={`${id}-mode`}
          className="wf-punch-mode"
          value={mode}
          disabled={pending}
          onChange={(event) => {
            const value = event.target.value as MissingPunchMode;
            onMode(value);
            if ((value === "clock_out" && !clockIn) || (value === "clock_in" && !clockOut))
              setExpanded(true);
          }}
        >
          {(["clock_in", "clock_out", "both"] as const).map((value) => (
            <option key={value} value={value}>
              {labels[value]}
            </option>
          ))}
        </select>
        <div className="wf-punch-layout">
          <div className="wf-punch-fields">
            {mode !== "clock_out" && field("clock_in")}
            {mode !== "clock_in" && field("clock_out")}
            <div className="wf-punch-reason">
              <Label htmlFor={`${id}-reason`}>{ar ? "السبب (مطلوب)" : "Reason (required)"}</Label>
              <Textarea
                id={`${id}-reason`}
                rows={3}
                value={reason}
                disabled={pending}
                required
                minLength={3}
                onChange={(event) => onReason(event.target.value)}
                placeholder={ar ? "لماذا لم تسجل البصمة؟" : "Why was this punch missed?"}
              />
            </div>
            <details
              className="wf-punch-details"
              open={expanded}
              onToggle={(event) => setExpanded(event.currentTarget.open)}
            >
              <summary>
                <List aria-hidden="true" />
                <span>
                  <strong>{ar ? "الاستراحة والتفاصيل الإضافية" : "Session details & break"}</strong>
                  <small>
                    {ar
                      ? "راجع أوقات الجلسة والاستراحة."
                      : "Review session times and break minutes."}
                  </small>
                </span>
                <ChevronDown aria-hidden="true" />
              </summary>
              <div>
                {scheduledIn && scheduledOut && (
                  <button
                    type="button"
                    className="wf-punch-use-schedule"
                    disabled={pending}
                    onClick={onUseSchedule}
                  >
                    {ar ? "استخدم أوقات الجدول" : "Use schedule times"}
                  </button>
                )}
                {mode === "clock_out" && field("clock_in")}
                {mode === "clock_in" && field("clock_out")}
                <Label htmlFor={`${id}-break`}>
                  {ar ? "الاستراحة (دقائق)" : "Break (minutes)"}
                </Label>
                <Input
                  id={`${id}-break`}
                  type="number"
                  min={0}
                  step={1}
                  value={breakMinutes}
                  disabled={pending}
                  onChange={(event) => onBreakMinutes(event.target.value)}
                />
              </div>
            </details>
            {validation.issue && (validation.issue !== "reason" || reason.length > 0) && (
              <p className="wf-punch-validation" role="status">
                {issueText[validation.issue]}
              </p>
            )}
            {validation.durationMinutes > 0 && Number.isFinite(validation.durationMinutes) && (
              <p className="wf-punch-duration">
                {ar ? "مدة الجلسة المقترحة" : "Proposed session"} ·{" "}
                {Math.floor(validation.durationMinutes / 60)}
                {ar ? "س" : "h"} {validation.durationMinutes % 60}
                {ar ? "د" : "m"}
              </p>
            )}
          </div>
        </div>
      </div>
      <footer className="wf-punch-footer">
        <p>
          <Info aria-hidden="true" />
          {ar
            ? "سيتم إرسال طلب التصحيح للمراجعة."
            : "A correction request will be sent for review."}
        </p>
        <div>
          <Button type="submit" disabled={!validation.valid || pending} aria-busy={pending}>
            <Send className="size-4" />
            {pending ? (ar ? "جارٍ الإرسال…" : "Sending…") : ar ? "إرسال الطلب" : "Send request"}
          </Button>
        </div>
      </footer>
    </form>
  );
}
