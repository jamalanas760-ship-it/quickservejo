import { useId } from "react";
import { Info, Send } from "lucide-react";
import { workforceDayKey, workforceNextDay } from "@/lib/workforce-hours";
import type { validateMissingPunch } from "@/lib/missing-punch";
import { RequestDatePicker, RequestTimePicker } from "./RequestPickers";
import { WorkforceButton as Button } from "./WorkforceButton";
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
  reason,
  onReason,
  validation,
  pending,
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
  const date = clockIn.slice(0, 10) || clockOut.slice(0, 10);
  const nextDay = Boolean(date && clockOut.slice(0, 10) > date);
  const changeDate = (next: string) => {
    onClockIn(`${next}T${clockIn.slice(11, 16) || "09:00"}`);
    onClockOut(`${nextDay ? workforceNextDay(next) : next}T${clockOut.slice(11, 16) || "17:00"}`);
  };
  const issue: Record<NonNullable<typeof validation.issue>, string> = {
    missing_times: ar
      ? "أكمل التاريخ ووقتي الدخول والانصراف."
      : "Add the date and both session times.",
    invalid_times: ar
      ? "اختر وقتاً صالحاً بتوقيت المطعم."
      : "Choose valid restaurant dates and times.",
    order: ar
      ? "الانصراف يجب أن يلي الدخول."
      : "Clock-out must follow clock-in. Use next day for an overnight shift.",
    too_long: ar ? "الحد الأقصى 36 ساعة." : "A session cannot exceed 36 hours.",
    break: ar ? "تعذر التحقق من المدة." : "Unable to validate the session duration.",
    future: ar ? "لا يمكن تقديم أوقات مستقبلية." : "Missing punches cannot be in the future.",
    reason: ar ? "اكتب سبباً من 3 أحرف على الأقل." : "Enter a reason of at least 3 characters.",
  };
  return (
    <form
      className="wf-punch-composer wf-punch-simple"
      onSubmit={(e) => {
        e.preventDefault();
        if (validation.valid && !pending) onSubmit();
      }}
    >
      <div className="wf-punch-scroll">
        <Label htmlFor={`${id}-mode`}>{ar ? "ما البصمة المفقودة؟" : "What was missed?"}</Label>
        <select
          id={`${id}-mode`}
          className="wf-punch-mode"
          value={mode}
          disabled={pending}
          onChange={(e) => onMode(e.target.value as MissingPunchMode)}
        >
          <option value="both">{ar ? "البصمتان" : "Both punches"}</option>
          <option value="clock_in">{ar ? "الدخول" : "Clock-in"}</option>
          <option value="clock_out">{ar ? "الانصراف" : "Clock-out"}</option>
        </select>
        <RequestDatePicker
          label={ar ? "التاريخ" : "Date"}
          value={date}
          ar={ar}
          timeZone={timeZone}
          max={workforceDayKey(new Date(), timeZone)}
          pastPresets
          disabled={pending}
          onChange={changeDate}
        />
        <div className="wf-punch-date-time">
          <RequestTimePicker
            label={ar ? "الدخول" : "Clock-in"}
            value={clockIn.slice(11, 16)}
            ar={ar}
            disabled={pending}
            onChange={(time) =>
              onClockIn(`${date || workforceDayKey(new Date(), timeZone)}T${time}`)
            }
          />
          <RequestTimePicker
            label={ar ? "الانصراف" : "Clock-out"}
            value={clockOut.slice(11, 16)}
            ar={ar}
            disabled={pending}
            onChange={(time) => {
              const day = date || workforceDayKey(new Date(), timeZone);
              onClockOut(`${nextDay ? workforceNextDay(day) : day}T${time}`);
            }}
          />
        </div>
        <label className="wf-punch-next-day">
          <input
            type="checkbox"
            checked={nextDay}
            disabled={pending || !date}
            onChange={(e) =>
              onClockOut(
                `${e.target.checked ? workforceNextDay(date) : date}T${clockOut.slice(11, 16) || "17:00"}`,
              )
            }
          />
          {ar
            ? "الانصراف في اليوم التالي (وردية ليلية)"
            : "Clock-out on next day (overnight shift)"}
        </label>
        <p className="hr-caption">
          {ar ? "توقيت المطعم" : "Restaurant time"} · {timeZone}
        </p>
        {mode !== "both" && (
          <p className="hr-caption">
            {ar
              ? "راجع وقت الطرف الآخر أيضاً؛ سيعتمد المدير الجلسة كاملة."
              : "Review the other session time too; your manager approves the complete session."}
          </p>
        )}
        <div className="wf-punch-reason">
          <Label htmlFor={`${id}-reason`}>{ar ? "السبب" : "Reason"}</Label>
          <Textarea
            id={`${id}-reason`}
            rows={3}
            required
            minLength={3}
            maxLength={2000}
            value={reason}
            disabled={pending}
            onChange={(e) => onReason(e.target.value)}
            placeholder={ar ? "لماذا لم تسجل البصمة؟" : "Why was this punch missed?"}
          />
        </div>
        {validation.issue && (validation.issue !== "reason" || reason.length > 0) && (
          <p className="wf-punch-validation" role="status">
            {issue[validation.issue]}
          </p>
        )}
        {validation.durationMinutes > 0 && Number.isFinite(validation.durationMinutes) && (
          <p className="wf-punch-duration">
            {ar ? "المدة المقترحة" : "Proposed duration"} ·{" "}
            {Math.floor(validation.durationMinutes / 60)}h {validation.durationMinutes % 60}m
          </p>
        )}
      </div>
      <footer className="wf-punch-footer">
        <p>
          <Info aria-hidden="true" />
          {ar ? "سيراجع مديرك هذا الطلب." : "Your manager will review this correction."}
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
