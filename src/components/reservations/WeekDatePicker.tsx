import { useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { addReservationDays } from "@/lib/reservation-studio";

export function WeekDatePicker({
  value,
  onChange,
  min,
  max,
  ar,
}: {
  value: string;
  onChange: (day: string) => void;
  min: string;
  max: string;
  ar: boolean;
}) {
  const [start, setStart] = useState(value || min);
  const days = Array.from({ length: 7 }, (_, i) => addReservationDays(start, i));
  const locale = ar ? "ar-JO" : "en-JO";
  const date = (day: string) => new Date(`${day}T12:00:00Z`);
  return (
    <div className="qs-week-picker">
      <div className="qs-date-summary"><CalendarDays size={18} /><div><small>{ar ? "التاريخ المحدد" : "Selected date"}</small><strong>{new Intl.DateTimeFormat(locale, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(date(value || min))}</strong></div></div>
      <div className="qs-week-heading">
        <button
          type="button"
          aria-label={ar ? "الأسبوع السابق" : "Previous week"}
          disabled={start <= min}
          onClick={() =>
            setStart(addReservationDays(start, -7) < min ? min : addReservationDays(start, -7))
          }
        >
          <ChevronLeft className="size-4 rtl:rotate-180" />
        </button>
        <span aria-live="polite">
          {new Intl.DateTimeFormat(locale, {
            month: "short",
            day: "numeric",
            timeZone: "UTC",
          }).format(date(start))}{" "}
          –{" "}
          {new Intl.DateTimeFormat(locale, {
            month: "short",
            day: "numeric",
            year: "numeric",
            timeZone: "UTC",
          }).format(date(days[6]))}
        </span>
        <button
          type="button"
          aria-label={ar ? "الأسبوع التالي" : "Next week"}
          disabled={days[6] >= max}
          onClick={() => setStart(addReservationDays(start, 7))}
        >
          <ChevronRight className="size-4 rtl:rotate-180" />
        </button>
      </div>
      <div className="qs-week-days" role="group" aria-label={ar ? "اختر يوماً" : "Choose a day"}>
        {days.map((day) => (
          <button
            key={day}
            type="button"
            aria-label={new Intl.DateTimeFormat(locale, {
              dateStyle: "full",
              timeZone: "UTC",
            }).format(date(day))}
            aria-pressed={day === value}
            disabled={day < min || day > max}
            onClick={() => onChange(day)}
          >
            <small>
              {new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(
                date(day),
              )}
            </small>
            <strong>{date(day).getUTCDate()}</strong>
          </button>
        ))}
      </div>
    </div>
  );
}
