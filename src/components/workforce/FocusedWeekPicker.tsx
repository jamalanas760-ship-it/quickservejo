import { useState } from "react";
import { CalendarDays, ChevronRight } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { arSA, enGB } from "date-fns/locale";
import { weekOf } from "./WorkforcePrimitives";
import { workforceDayKey } from "@/lib/workforce-hours";
const dayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export function FocusedWeekPicker({
  ar,
  date,
  timeZone,
  onApply,
}: {
  ar: boolean;
  date: string;
  timeZone: string;
  onApply: (day: string) => void;
}) {
  const [day, setDay] = useState(date),
    [month, setMonth] = useState(new Date(`${date}T12:00:00`));
  const days = weekOf(day);
  const label = (value: string) =>
    new Date(`${value}T12:00:00`).toLocaleDateString(ar ? "ar-JO" : "en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  return (
    <div className="qs-focused-week">
      <Calendar
        locale={ar ? arSA : enGB}
        weekStartsOn={0}
        month={month}
        onMonthChange={setMonth}
        mode="range"
        selected={{ from: new Date(`${days[0]}T12:00:00`), to: new Date(`${days[6]}T12:00:00`) }}
        onDayClick={(date) => setDay(dayKey(date))}
      />
      <div className="qs-focused-week-summary">
        <p className="qs-focused-caption">{ar ? "الأسبوع المحدد" : "Selected week"}</p>
        <strong>
          <CalendarDays aria-hidden="true" />
          {label(days[0]!)} – {label(days[6]!)}
        </strong>
      </div>
      <button
        type="button"
        className="qs-focused-current"
        onClick={() => {
          const today = workforceDayKey(new Date(), timeZone);
          setDay(today);
          setMonth(new Date(`${today}T12:00:00`));
        }}
      >
        <CalendarDays aria-hidden="true" />
        <span>{ar ? "هذا الأسبوع" : "This week"}</span>
        <ChevronRight aria-hidden="true" />
      </button>
      <Button className="qs-focused-apply" onClick={() => onApply(day)}>
        {ar ? "استخدام هذا الأسبوع" : "Use this week"}
      </Button>
    </div>
  );
}
