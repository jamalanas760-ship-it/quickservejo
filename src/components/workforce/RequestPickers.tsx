import { TimeInput } from "@/components/reservations/TimeInput";
import { workforceDayKey } from "@/lib/workforce-hours";
import { useId, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { arSA, enUS } from "date-fns/locale";
import { CalendarDays, ChevronDown, Clock3 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

type PickerProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  ar: boolean;
  disabled?: boolean;
};

export function RequestDatePicker({
  label,
  value,
  onChange,
  ar,
  min,
  timeZone,
  disabled = false,
}: PickerProps & { min?: string; timeZone?: string | undefined }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const selected = value ? parseISO(value) : undefined;
  const today = timeZone ? parseISO(workforceDayKey(new Date(), timeZone)) : new Date();
  const minimum = min ? parseISO(min) : undefined;

  function choose(date: Date | undefined) {
    if (!date) return;
    const next = format(date, "yyyy-MM-dd");
    if (min && next < min) return;
    onChange(next);
    setOpen(false);
  }

  return (
    <div className="qs-request-picker-field">
      <Label htmlFor={id}>{label}</Label>
      <Dialog open={open} onOpenChange={setOpen}>
          <Button
            id={id}
            disabled={disabled}
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={open}
            type="button"
            variant="outline"
            className="qs-request-picker-trigger"
            aria-label={label}
          >
            <CalendarDays data-icon="inline-start" />
            <span>
              {selected
                ? format(selected, "EEE, d MMM yyyy", { locale: ar ? arSA : enUS })
                : ar
                  ? "اختر التاريخ"
                  : "Choose date"}
            </span>
            <ChevronDown data-icon="inline-end" />
          </Button>
        <DialogContent className="qs-picker-dialog qs-date-picker-dialog" dir={ar ? "rtl" : "ltr"} onOpenAutoFocus={event => event.preventDefault()}>
          <DialogHeader><DialogTitle>{label}</DialogTitle><DialogDescription>{ar ? "اختر يوم الوردية من التقويم." : "Choose a date from the calendar."}</DialogDescription></DialogHeader>
          <Calendar
            mode="single"
            required
            selected={selected}
            defaultMonth={selected ?? minimum ?? today}
            onSelect={choose}
            disabled={minimum ? { before: minimum } : undefined}
            locale={ar ? arSA : enUS}
            formatters={{
              formatMonthDropdown: (date) => format(date, "MMM", { locale: ar ? arSA : enUS }),
            }}
            dir={ar ? "rtl" : "ltr"}
            captionLayout="dropdown"
            startMonth={
              new Date(
                Math.min(today.getFullYear() - 5, selected?.getFullYear() ?? today.getFullYear()),
                0,
              )
            }
            endMonth={
              new Date(
                Math.max(today.getFullYear() + 10, selected?.getFullYear() ?? today.getFullYear()),
                11,
              )
            }
            autoFocus
          />
          <div className="qs-request-date-presets">
            {[today, addDays(today, 1)].map((date, index) => (
              <Button
                key={index}
                type="button"
                variant="outline"
                size="sm"
                disabled={Boolean(min && format(date, "yyyy-MM-dd") < min)}
                onClick={() => choose(date)}
              >
                {index === 0 ? (ar ? "اليوم" : "Today") : ar ? "غداً" : "Tomorrow"}
              </Button>
            ))}
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

export function RequestTimePicker({ label, value, onChange, ar, disabled = false, inline = false }: PickerProps & { inline?: boolean }) {
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

  const editor = <>
    <TimeInput ar={ar} label={label} value={`${String(Number(draft.hour)%12+(draft.period==="pm"?12:0)).padStart(2,"0")}:${draft.minute}`} onChange={next=>setDraft(clockParts(next))}/>
    <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={()=>setOpen(false)}>{ar?"إلغاء":"Cancel"}</Button><Button type="button" onClick={apply}>{ar?"تأكيد الوقت":"Apply time"}</Button></div>
  </>;
  const trigger = <Button
            id={id}
            onClick={() => { setDraft(clockParts(value)); setOpen(previous => !previous); }}
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
          </Button>;
  return <div className="qs-request-picker-field min-w-0">
    <Label htmlFor={id}>{label}</Label>
    {inline ? <>{trigger}{open && <div className="rounded-2xl border bg-background p-3 space-y-3" dir={ar ? "rtl" : "ltr"}>{editor}</div>}</> :
      <Dialog open={open} onOpenChange={setOpen}>{trigger}
        <DialogContent className="qs-picker-dialog qs-time-picker-dialog" dir={ar ? "rtl" : "ltr"} onOpenAutoFocus={event => event.preventDefault()}>
          <DialogHeader><DialogTitle>{label}</DialogTitle><DialogDescription>{ar ? "اختر الساعة والدقيقة ثم أكد الوقت." : "Tap an hour, choose minutes, then apply."}</DialogDescription></DialogHeader>
          {editor}
        </DialogContent>
      </Dialog>}
  </div>;
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
