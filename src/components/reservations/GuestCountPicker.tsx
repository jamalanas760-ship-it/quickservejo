import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

/** Presets and a separately labelled custom entry share one bounded party count. */
export function GuestCountPicker({ value, onChange, min = 1, max = 100, ar }: {
  value: number; onChange: (value: number) => void; min?: number; max?: number; ar: boolean;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  function commit() {
    const count = Math.max(min, Math.min(max, Math.round(Number(draft) || min)));
    setDraft(String(count)); onChange(count);
  }
  return <div className="rs-guest-picker">
    <div className="rs-choice-rail" aria-label={ar ? "أعداد سريعة" : "Quick party sizes"}>
      {[2, 3, 4, 5, 6].filter(count => count >= min && count <= max).map(count =>
        <button key={count} type="button" aria-pressed={value === count} onClick={() => { setDraft(String(count)); onChange(count); }}>{count}</button>)}
    </div>
    <label className="rs-custom-guests"><span><strong>{ar ? "عدد آخر" : "Custom party size"}</strong><small>{ar ? `من ${min} إلى ${max} ضيف` : `${min}–${max} guests`}</small></span>
      <Input aria-label={ar ? "عدد آخر للضيوف" : "Custom guest count"} type="number" inputMode="numeric" min={min} max={max} step={1} value={draft} onChange={event => {
        const next = event.target.value; setDraft(next);
        const count = Number(next);
        if (next && Number.isInteger(count) && count >= min && count <= max) onChange(count);
      }} onBlur={commit}/>
    </label>
  </div>;
}
