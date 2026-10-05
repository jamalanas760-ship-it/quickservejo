import { useId } from "react";
import { Clock3 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function TimeInput({ value, onChange, ar, disabled = false, label }: {
  value: string; onChange: (value: string) => void; ar: boolean; disabled?: boolean; label?: string;
}) {
  const id = useId();
  const valid = /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  const [hour, minute] = (valid ? value : "09:00").split(":");
  const h = Number(hour), period = h >= 12 ? "pm" : "am";
  function change(nextHour: string, nextMinute: string, nextPeriod: string) {
    onChange(`${String((Number(nextHour) % 12) + (nextPeriod === "pm" ? 12 : 0)).padStart(2, "0")}:${nextMinute}`);
  }
  const hour12 = String(h % 12 || 12);
  return (
    <fieldset className="qs-clock-input" aria-label={label ?? (ar ? "الوقت" : "Time")} disabled={disabled}>
      <div className="qs-clock-caption"><Clock3 size={16} /><span>{ar ? "الوقت المحدد" : "Selected time"}</span></div>
      <div className="qs-clock-digits" dir="ltr">
        <div className="qs-clock-unit">
          <label id={`${id}-hour`}>{ar ? "الساعة" : "Hour"}</label>
          <Select disabled={disabled} value={hour12} onValueChange={v => change(v, minute, period)}>
            <SelectTrigger aria-labelledby={`${id}-hour`}><SelectValue /></SelectTrigger>
            <SelectContent className="qs-clock-options" position="item-aligned">
              {Array.from({length: 12}, (_, i) => i + 1).map(n => <SelectItem key={n} value={String(n)}>{String(n).padStart(2, "0")}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <span className="qs-clock-colon" aria-hidden="true">:</span>
        <div className="qs-clock-unit">
          <label id={`${id}-minute`}>{ar ? "الدقيقة" : "Minute"}</label>
          <Select disabled={disabled} value={minute} onValueChange={v => change(hour12, v, period)}>
            <SelectTrigger aria-labelledby={`${id}-minute`}><SelectValue /></SelectTrigger>
            <SelectContent className="qs-clock-options" position="item-aligned">
              {Array.from({length: 60}, (_, i) => String(i).padStart(2, "0")).map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="qs-clock-period" role="group" aria-label={ar ? "الفترة" : "Period"}>
          {["am", "pm"].map(p => <button key={p} type="button" disabled={disabled} aria-pressed={period === p} onClick={() => change(hour12, minute, p)}>{ar ? (p === "am" ? "ص" : "م") : p.toUpperCase()}</button>)}
        </div>
      </div>
    </fieldset>
  );
}
