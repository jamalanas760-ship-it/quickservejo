import "./approved-punch-pickers.css";
import { TimeInput } from "@/components/reservations/TimeInput";
import { workforceDayKey } from "@/lib/workforce-hours";
import { useId, useState } from "react";
import { addDays, addMonths, format, isValid, parseISO, startOfMonth } from "date-fns";
import { arSA, enUS } from "date-fns/locale";
import {
  ArrowRight,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type PickerProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  ar: boolean;
  disabled?: boolean;
};

function HiddenCalendarCaption() {
  return <></>;
}

export function RequestDatePicker({
  label,
  value,
  onChange,
  ar,
  min,
  max,
  timeZone,
  context,
  pastPresets = false,
  disabled = false,
}: PickerProps & {
  min?: string | undefined;
  max?: string | undefined;
  timeZone?: string | undefined;
  context?: string | undefined;
  pastPresets?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [jump, setJump] = useState(false);
  const selected = value && isValid(parseISO(value)) ? parseISO(value) : undefined;
  const today = timeZone ? parseISO(workforceDayKey(new Date(), timeZone)) : new Date();
  const minimum = min && isValid(parseISO(min)) ? parseISO(min) : undefined;
  const maximum = max && isValid(parseISO(max)) ? parseISO(max) : undefined;
  const [draft, setDraft] = useState<Date | undefined>(selected);
  const [month, setMonth] = useState(startOfMonth(selected ?? today));
  const locale = ar ? arSA : enUS;
  const firstYear = Math.min(
    today.getFullYear() - 5,
    selected?.getFullYear() ?? today.getFullYear(),
    minimum?.getFullYear() ?? today.getFullYear(),
  );
  const lastYear = Math.max(
    today.getFullYear() + 10,
    selected?.getFullYear() ?? today.getFullYear(),
    maximum?.getFullYear() ?? today.getFullYear(),
  );
  const firstMonth = startOfMonth(minimum ?? new Date(firstYear, 0));
  const lastMonth = startOfMonth(maximum ?? new Date(lastYear, 11));
  const allowed = (date: Date | undefined) =>
    Boolean(
      date &&
      isValid(date) &&
      (!min || format(date, "yyyy-MM-dd") >= min) &&
      (!max || format(date, "yyyy-MM-dd") <= max),
    );
  const changeOpen = (next: boolean) => {
    if (next && disabled) return;
    if (next) {
      const initial =
        selected ??
        (minimum && today < minimum ? minimum : maximum && today > maximum ? maximum : today);
      setDraft(selected);
      const initialMonth = startOfMonth(initial);
      setMonth(
        initialMonth < firstMonth
          ? firstMonth
          : initialMonth > lastMonth
            ? lastMonth
            : initialMonth,
      );
      setJump(false);
    }
    setOpen(next);
  };
  const choose = (date: Date | undefined) => {
    if (disabled || !allowed(date)) return;
    setDraft(date);
    setMonth(startOfMonth(date!));
  };
  const confirm = () => {
    if (disabled || !allowed(draft)) return;
    onChange(format(draft!, "yyyy-MM-dd"));
    setOpen(false);
  };
  return (
    <div className="qs-request-picker-field">
      <Label htmlFor={id}>{label}</Label>
      <Dialog open={open} onOpenChange={changeOpen}>
        <Button
          id={id}
          disabled={disabled}
          onClick={() => changeOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          type="button"
          variant="outline"
          className="qs-request-picker-trigger"
          aria-label={context ? `${context} · ${label}` : label}
        >
          <CalendarDays data-icon="inline-start" />
          <span>
            {selected
              ? format(selected, "d MMM yyyy", { locale })
              : ar
                ? "اختر التاريخ"
                : "Choose date"}
          </span>
          <ChevronDown data-icon="inline-end" />
        </Button>
        <DialogContent className="wf-compact-date-dialog" dir={ar ? "rtl" : "ltr"}>
          <div className="wf-picker-handle" aria-hidden="true" />
          <DialogHeader>
            <DialogTitle>{ar ? "اختر التاريخ" : "Choose date"}</DialogTitle>
            <DialogDescription>
              {context ?? label}
              {timeZone ? ` · ${timeZone}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="wf-date-body">
            <div className="wf-date-nav">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={ar ? "الشهر السابق" : "Previous month"}
                disabled={month <= firstMonth}
                onClick={() => setMonth(addMonths(month, -1))}
              >
                <ChevronLeft className="size-5 rtl:rotate-180" />
              </Button>
              <button
                type="button"
                className="wf-date-month"
                aria-expanded={jump}
                aria-controls={`${id}-jump`}
                onClick={() => setJump((value) => !value)}
              >
                {format(month, "MMMM yyyy", { locale })}
                <ChevronDown className="size-4" />
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={ar ? "الشهر التالي" : "Next month"}
                disabled={month >= lastMonth}
                onClick={() => setMonth(addMonths(month, 1))}
              >
                <ChevronRight className="size-5 rtl:rotate-180" />
              </Button>
            </div>
            {jump && (
              <div className="wf-date-jump" id={`${id}-jump`}>
                <label>
                  {ar ? "الشهر" : "Month"}
                  <select
                    value={month.getMonth()}
                    onChange={(event) => {
                      const next = new Date(month.getFullYear(), Number(event.target.value), 1);
                      setMonth(
                        next < firstMonth ? firstMonth : next > lastMonth ? lastMonth : next,
                      );
                    }}
                  >
                    {Array.from({ length: 12 }, (_, index) => (
                      <option
                        key={index}
                        value={index}
                        disabled={
                          new Date(month.getFullYear(), index, 1) < firstMonth ||
                          new Date(month.getFullYear(), index, 1) > lastMonth
                        }
                      >
                        {format(new Date(2026, index, 1), "MMMM", { locale })}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {ar ? "السنة" : "Year"}
                  <select
                    value={month.getFullYear()}
                    onChange={(event) => {
                      const next = new Date(Number(event.target.value), month.getMonth(), 1);
                      setMonth(
                        next < firstMonth ? firstMonth : next > lastMonth ? lastMonth : next,
                      );
                    }}
                  >
                    {Array.from({ length: lastYear - firstYear + 1 }, (_, index) => (
                      <option
                        key={index}
                        value={firstYear + index}
                        disabled={
                          firstYear + index < firstMonth.getFullYear() ||
                          firstYear + index > lastMonth.getFullYear()
                        }
                      >
                        {firstYear + index}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            <Calendar
              mode="single"
              selected={draft}
              month={month}
              onMonthChange={setMonth}
              onSelect={choose}
              disabled={[
                ...(minimum ? [{ before: minimum }] : []),
                ...(maximum ? [{ after: maximum }] : []),
              ]}
              locale={locale}
              dir={ar ? "rtl" : "ltr"}
              weekStartsOn={0}
              hideNavigation
              components={{ MonthCaption: HiddenCalendarCaption }}
              startMonth={firstMonth}
              endMonth={lastMonth}
            />
            <div className="wf-date-presets">
              {[today, addDays(today, pastPresets ? -1 : 1)].map((date, index) => (
                <Button
                  key={index}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!allowed(date)}
                  aria-pressed={Boolean(
                    draft && format(draft, "yyyy-MM-dd") === format(date, "yyyy-MM-dd"),
                  )}
                  onClick={() => choose(date)}
                >
                  {index === 0
                    ? ar
                      ? "اليوم"
                      : "Today"
                    : pastPresets
                      ? ar
                        ? "أمس"
                        : "Yesterday"
                      : ar
                        ? "غداً"
                        : "Tomorrow"}
                </Button>
              ))}
            </div>
          </div>
          <div className="wf-date-footer">
            <div>
              <small>{ar ? "التاريخ المحدد" : "Selected date"}</small>
              <strong>
                {draft
                  ? format(draft, "EEE, d MMM yyyy", { locale })
                  : ar
                    ? "اختر يومًا"
                    : "Select a day"}
              </strong>
            </div>
            <Button type="button" disabled={disabled || !allowed(draft)} onClick={confirm}>
              {ar ? "تأكيد التاريخ" : "Confirm date"}
              <ArrowRight className="size-4 rtl:rotate-180" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function clockParts(value: string) {
  const [hour, minute = "00"] = (/^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : "09:00").split(
    ":",
  );
  const hour24 = Number(hour);
  return {
    hour: String(hour24 % 12 || 12),
    minute: minute.slice(0, 2),
    period: hour24 >= 12 ? "pm" : "am",
  };
}

export function RequestTimePicker({
  label,
  value,
  onChange,
  ar,
  disabled = false,
  inline = false,
}: PickerProps & { inline?: boolean }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => clockParts(value));
  const current = clockParts(value);
  const periodLabel = (period: string) =>
    period === "am" ? (ar ? "صباحاً" : "AM") : ar ? "مساءً" : "PM";

  function apply() {
    const hour24 = (Number(draft.hour) % 12) + (draft.period === "pm" ? 12 : 0);
    onChange(`${String(hour24).padStart(2, "0")}:${draft.minute}`);
    setOpen(false);
  }

  const editor = (
    <>
      <TimeInput
        ar={ar}
        label={label}
        value={`${String((Number(draft.hour) % 12) + (draft.period === "pm" ? 12 : 0)).padStart(2, "0")}:${draft.minute}`}
        onChange={(next) => setDraft(clockParts(next))}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          {ar ? "إلغاء" : "Cancel"}
        </Button>
        <Button type="button" onClick={apply}>
          {ar ? "تأكيد الوقت" : "Apply time"}
        </Button>
      </div>
    </>
  );
  const trigger = (
    <Button
      id={id}
      onClick={() => {
        setDraft(clockParts(value));
        setOpen((previous) => !previous);
      }}
      aria-haspopup={inline ? undefined : "dialog"}
      aria-expanded={open}
      disabled={disabled}
      type="button"
      variant="outline"
      className="qs-request-picker-trigger"
      aria-label={label}
    >
      <Clock3 data-icon="inline-start" />
      <span dir="ltr">
        {current.hour.padStart(2, "0")}:{current.minute} {periodLabel(current.period)}
      </span>
      <ChevronDown data-icon="inline-end" />
    </Button>
  );
  return (
    <div className="qs-request-picker-field min-w-0">
      <Label htmlFor={id}>{label}</Label>
      {inline ? (
        <>
          {trigger}
          {open && (
            <div
              className="rounded-2xl border bg-background p-3 space-y-3"
              dir={ar ? "rtl" : "ltr"}
            >
              {editor}
            </div>
          )}
        </>
      ) : (
        <Dialog open={open} onOpenChange={setOpen}>
          {trigger}
          <DialogContent
            className="qs-picker-dialog qs-time-picker-dialog"
            dir={ar ? "rtl" : "ltr"}
            onOpenAutoFocus={(event) => event.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle>{label}</DialogTitle>
              <DialogDescription>
                {ar
                  ? "اختر الساعة والدقيقة ثم أكد الوقت."
                  : "Tap an hour, choose minutes, then apply."}
              </DialogDescription>
            </DialogHeader>
            {editor}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/** Keep the existing local datetime value while giving both parts full click targets. */
export function RequestDateTimePicker({
  label,
  value,
  onChange,
  ar,
  timeZone,
}: PickerProps & { timeZone?: string }) {
  const [date = "", time = ""] = value.split("T");
  return (
    <div
      className="qs-request-datetime-picker"
      role="group"
      aria-label={label || (ar ? "التاريخ والوقت" : "Date and time")}
    >
      <div className="flex items-center justify-between gap-2">
        {label ? <p className="text-sm font-medium">{label}</p> : <span />}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={!value}
          onClick={() => onChange("")}
        >
          {ar ? "مسح" : "Clear"}
        </Button>
      </div>
      {timeZone ? (
        <p className="mb-2 text-xs text-muted-foreground">
          {ar ? "وقت المطعم" : "Restaurant time"} · {timeZone}
        </p>
      ) : null}
      <div className="grid min-w-0 gap-2">
        <RequestDatePicker
          label={ar ? "التاريخ" : "Date"}
          value={date}
          ar={ar}
          timeZone={timeZone}
          onChange={(next) => onChange(`${next}T${time || "09:00"}`)}
        />
        <RequestTimePicker
          label={ar ? "الوقت" : "Time"}
          value={time}
          ar={ar}
          onChange={(next) =>
            onChange(
              `${date || (timeZone ? workforceDayKey(new Date(), timeZone) : format(new Date(), "yyyy-MM-dd"))}T${next}`,
            )
          }
        />
      </div>
    </div>
  );
}
