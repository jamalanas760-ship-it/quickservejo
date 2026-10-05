import { useEffect, useRef } from "react";

function TimeWheel({ values, value, onChange, label, disabled }: {
  values: string[]; value: string; onChange: (value: string) => void; label: string; disabled: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  useEffect(() => {
    const top = Math.max(0, values.indexOf(value)) * 44;
    if (ref.current && Math.abs(ref.current.scrollTop - top) > 2) ref.current.scrollTop = top;
  }, [value, values]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const select = (index: number) => {
    const next = values[Math.max(0, Math.min(values.length - 1, index))];
    if (next !== latest.current.value) latest.current.onChange(next);
  };
  return <div className="qs-time-wheel-column">
    <span className="qs-time-wheel-label">{label}</span>
    <div className="qs-time-wheel-window">
      <div ref={ref} className="qs-time-wheel" role="listbox" aria-label={label} aria-disabled={disabled} tabIndex={disabled ? -1 : 0}
        onScroll={() => {
          clearTimeout(timer.current);
          timer.current = setTimeout(() => { if (!disabled && ref.current) select(Math.round(ref.current.scrollTop / 44)); }, 120);
        }}
        onKeyDown={e => {
          const index = values.indexOf(value);
          if (["ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) {
            e.preventDefault();
            select(e.key === "Home" ? 0 : e.key === "End" ? values.length - 1 : index + (e.key === "ArrowDown" ? 1 : -1));
          }
        }}>
        {values.map(n => <div key={n} role="option" aria-selected={n === value} onClick={() => !disabled && latest.current.onChange(n)}>{n}</div>)}
      </div>
    </div>
  </div>;
}
const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

export function TimeInput({ value, onChange, ar, disabled = false, label }: {
  value: string; onChange: (value: string) => void; ar: boolean; disabled?: boolean; label?: string;
}) {
  const [hour, minute] = (/^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : "09:00").split(":");
  const h = Number(hour), period = h >= 12 ? "pm" : "am", hour12 = String(h % 12 || 12).padStart(2, "0");
  function change(nextHour: string, nextMinute: string, nextPeriod: string) {
    onChange(`${String((Number(nextHour) % 12) + (nextPeriod === "pm" ? 12 : 0)).padStart(2, "0")}:${nextMinute}`);
  }
  return <fieldset className="qs-time-picker" disabled={disabled} aria-label={label ?? (ar ? "الوقت" : "Time")}>
    <div className="qs-time-picker-body" dir="ltr">
      <TimeWheel values={HOURS} value={hour12} label={ar ? "الساعة" : "Hour"} disabled={disabled} onChange={v => change(v, minute, period)} />
      <span className="qs-time-separator" aria-hidden="true">:</span>
      <TimeWheel values={MINUTES} value={minute} label={ar ? "الدقيقة" : "Minute"} disabled={disabled} onChange={v => change(hour12, v, period)} />
      <div className="qs-time-meridiem" role="group" aria-label={ar ? "الفترة" : "Period"}>
        {["am", "pm"].map(p => <button key={p} type="button" disabled={disabled} aria-pressed={period === p} onClick={() => change(hour12, minute, p)}>{ar ? (p === "am" ? "ص" : "م") : p.toUpperCase()}</button>)}
      </div>
    </div>
    <p className="qs-time-hint">{ar ? "مرّر أو اضغط لتغيير الوقت" : "Scroll or tap to set the time"}</p>
  </fieldset>;
}
