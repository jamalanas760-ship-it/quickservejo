import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  return <fieldset className="qs-time-selects" disabled={disabled} aria-label={label ?? (ar ? "الوقت" : "Time")} dir="ltr">
    <Select value={hour12} disabled={disabled} onValueChange={v => change(v, minute, period)}>
      <SelectTrigger aria-label={ar ? "الساعة" : "Hour"}><SelectValue /></SelectTrigger>
      <SelectContent className="qs-time-options"><SelectGroup>{HOURS.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectGroup></SelectContent>
    </Select>
    <Select value={minute} disabled={disabled} onValueChange={v => change(hour12, v, period)}>
      <SelectTrigger aria-label={ar ? "الدقيقة" : "Minute"}><SelectValue /></SelectTrigger>
      <SelectContent className="qs-time-options"><SelectGroup>{MINUTES.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectGroup></SelectContent>
    </Select>
    <Select value={period} disabled={disabled} onValueChange={v => change(hour12, minute, v)}>
      <SelectTrigger aria-label={ar ? "الفترة" : "Period"}><SelectValue /></SelectTrigger>
      <SelectContent className="qs-time-options"><SelectGroup>{["am", "pm"].map(p => <SelectItem key={p} value={p}>{ar ? (p === "am" ? "ص" : "م") : p.toUpperCase()}</SelectItem>)}</SelectGroup></SelectContent>
    </Select>
  </fieldset>;
}
