import { useId } from "react";
import { Clock3 } from "lucide-react";

export function TimeInput({
  value,
  onChange,
  ar,
  disabled = false,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  ar: boolean;
  disabled?: boolean;
  label?: string;
}) {
  const id = useId();
  const valid = /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  const [hour, minute] = (valid ? value : "09:00").split(":");
  const h = Number(hour),
    period = h >= 12 ? "pm" : "am";
  function change(nextHour: string, nextMinute: string, nextPeriod: string) {
    onChange(
      `${String((Number(nextHour) % 12) + (nextPeriod === "pm" ? 12 : 0)).padStart(2, "0")}:${nextMinute}`,
    );
  }
  return (
    <fieldset
      disabled={disabled}
      className="qs-clock-input"
      aria-label={label ?? (ar ? "الوقت" : "Time")}
    >
      <Clock3 className="size-5 shrink-0 text-muted-foreground" />
      <div>
        <label htmlFor={`${id}-hour`}>{ar ? "الساعة" : "Hour"}</label>
        <select
          id={`${id}-hour`}
          value={String(h % 12 || 12)}
          onChange={(e) => change(e.target.value, minute, period)}
        >
          {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {String(n).padStart(2, "0")}
            </option>
          ))}
        </select>
      </div>
      <span aria-hidden="true">:</span>
      <div>
        <label htmlFor={`${id}-minute`}>{ar ? "الدقيقة" : "Minute"}</label>
        <select
          id={`${id}-minute`}
          value={minute}
          onChange={(e) => change(String(h % 12 || 12), e.target.value, period)}
        >
          {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0")).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${id}-period`}>{ar ? "الفترة" : "Period"}</label>
        <select
          id={`${id}-period`}
          value={period}
          onChange={(e) => change(String(h % 12 || 12), minute, e.target.value)}
        >
          <option value="am">{ar ? "ص" : "AM"}</option>
          <option value="pm">{ar ? "م" : "PM"}</option>
        </select>
      </div>
    </fieldset>
  );
}
