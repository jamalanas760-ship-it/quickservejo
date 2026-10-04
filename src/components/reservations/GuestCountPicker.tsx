import { useState } from "react";
import { Input } from "@/components/ui/input";

/** Presets and a separately labelled custom entry share one bounded party count. */
export function GuestCountPicker({ value, onChange, min = 1, max = 100, ar }: {
  value: number; onChange: (value: number) => void; min?: number; max?: number; ar: boolean;
}) {
  const [draft, setDraft] = useState("");
  return <div className="rs-guest-picker">
    <div className="rs-choice-rail" aria-label={ar ? "أعداد سريعة" : "Quick party sizes"}>
      {[2, 3, 4, 5, 6].filter(count => count >= min && count <= max).map(count =>
        <button key={count} type="button" aria-pressed={value === count} onClick={() => { setDraft(""); onChange(count); }}>{count}</button>)}
    </div>
    <label className="rs-custom-guests"><span><strong>{ar ? "عدد آخر" : "Custom party size"}</strong><small>{ar ? "أدخل عدد الضيوف" : "Enter your guest count"}</small></span>
      <Input aria-label={ar ? "عدد آخر للضيوف" : "Custom guest count"} type="number" inputMode="numeric" min={min} max={max} step={1} placeholder={ar ? "العدد" : "Count"} value={draft} onChange={event => {
        const next = event.target.value; setDraft(next);
        const count = Number(next);
        if (next && Number.isInteger(count) && count >= min && count <= max) onChange(count);
      }}/>
    </label>
  </div>;
}
