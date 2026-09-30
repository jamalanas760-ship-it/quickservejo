import { useId, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { arSA, enUS } from "date-fns/locale";
import { CalendarDays, ChevronDown, Clock3 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type PickerProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  ar: boolean;
};

export function RequestDatePicker({
  label,
  value,
  onChange,
  ar,
  min,
}: PickerProps & { min?: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const selected = value ? parseISO(value) : undefined;
  const today = new Date();
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
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
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
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className="qs-request-date-popover"
          dir={ar ? "rtl" : "ltr"}
          aria-label={label}
          onEscapeKeyDown={(event) => event.stopPropagation()}
        >
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
        </PopoverContent>
      </Popover>
    </div>
  );
}

function clockParts(value: string) {
  const [hour, minute] = (value || "09:00").split(":");
  const hour24 = Number(hour);
  return {
    hour: String(hour24 % 12 || 12),
    minute: minute.slice(0, 2),
    period: hour24 >= 12 ? "pm" : "am",
  };
}

export function RequestTimePicker({ label, value, onChange, ar }: PickerProps) {
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

  return (
    <div className="qs-request-picker-field">
      <Label htmlFor={id}>{label}</Label>
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (next) setDraft(clockParts(value));
          setOpen(next);
        }}
      >
        <PopoverTrigger asChild>
          <Button
            id={id}
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
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className="qs-request-time-popover"
          dir={ar ? "rtl" : "ltr"}
          aria-label={label}
          onEscapeKeyDown={(event) => event.stopPropagation()}
        >
          <p className="text-sm font-semibold">{label}</p>
          <div className="grid grid-cols-2 gap-3" dir="ltr">
            <div className="qs-request-picker-field">
              <Label htmlFor={`${id}-hour`}>{ar ? "الساعة" : "Hour"}</Label>
              <Select
                value={draft.hour}
                onValueChange={(hour) => setDraft((previous) => ({ ...previous, hour }))}
              >
                <SelectTrigger id={`${id}-hour`} className="min-h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((hour) => (
                      <SelectItem key={hour} value={hour}>
                        {hour.padStart(2, "0")}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="qs-request-picker-field">
              <Label htmlFor={`${id}-minute`}>{ar ? "الدقيقة" : "Minute"}</Label>
              <Select
                value={draft.minute}
                onValueChange={(minute) => setDraft((previous) => ({ ...previous, minute }))}
              >
                <SelectTrigger id={`${id}-minute`} className="min-h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0")).map(
                      (minute) => (
                        <SelectItem key={minute} value={minute}>
                          {minute}
                        </SelectItem>
                      ),
                    )}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>
          <ToggleGroup
            type="single"
            variant="outline"
            value={draft.period}
            onValueChange={(period) => {
              if (period) setDraft((previous) => ({ ...previous, period }));
            }}
            aria-label={ar ? "الفترة" : "Time period"}
            className="qs-request-time-period"
          >
            <ToggleGroupItem value="am">{periodLabel("am")}</ToggleGroupItem>
            <ToggleGroupItem value="pm">{periodLabel("pm")}</ToggleGroupItem>
          </ToggleGroup>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {ar ? "إلغاء" : "Cancel"}
            </Button>
            <Button type="button" onClick={apply}>
              {ar ? "تأكيد الوقت" : "Apply time"}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
