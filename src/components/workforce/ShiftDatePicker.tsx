import { useId, useState } from "react";
import { addMonths, format, parseISO, startOfMonth, getDaysInMonth } from "date-fns";
import { arSA, enUS } from "date-fns/locale";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { workforceDayKey } from "@/lib/workforce-hours";

/** Inline calendar: stays in the shift form's focus scope on mobile Safari. */
export function ShiftDatePicker({ label, value, onChange, ar, min, timeZone, disabled = false }: {
  label: string; value: string; onChange: (value: string) => void; ar: boolean;
  min?: string; timeZone?: string; disabled?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const today = workforceDayKey(new Date(), timeZone ?? "UTC");
  const [month, setMonth] = useState(() => startOfMonth(parseISO(value || min || today)));
  const locale = ar ? arSA : enUS;
  const choose = (key: string) => { if (!min || key >= min) { onChange(key); setOpen(false); } };
  const first = month.getDay();
  return <div className="qs-request-picker-field min-w-0">
    <Label htmlFor={id}>{label}</Label>
    <Button id={id} type="button" variant="outline" disabled={disabled} className="qs-request-picker-trigger" aria-expanded={open} aria-controls={`${id}-calendar`} onClick={() => { if (!open) setMonth(startOfMonth(parseISO(value || min || today))); setOpen(!open); }}>
      <CalendarDays/><span>{value ? format(parseISO(value), "EEE, d MMM yyyy", {locale}) : ar ? "اختر التاريخ" : "Choose date"}</span><ChevronDown/>
    </Button>
    {open && <div id={`${id}-calendar`} className="rounded-2xl border bg-background p-2 space-y-2" dir={ar ? "rtl" : "ltr"}>
      <div className="flex min-w-0 items-center gap-1">
        <Button type="button" variant="ghost" className="size-11 shrink-0 p-0" aria-label={ar ? "الشهر السابق" : "Previous month"} onClick={() => setMonth(addMonths(month,-1))}><ChevronLeft/></Button>
        <select aria-label={ar ? "الشهر" : "Month"} className="min-w-0 flex-1 h-11 rounded-lg border bg-background px-1 text-sm" value={month.getMonth()} onChange={e => setMonth(new Date(month.getFullYear(),Number(e.target.value),1))}>{Array.from({length:12},(_,i)=><option key={i} value={i}>{format(new Date(2026,i,1),"MMMM",{locale})}</option>)}</select>
        <select aria-label={ar ? "السنة" : "Year"} className="h-11 w-20 rounded-lg border bg-background px-1 text-sm" value={month.getFullYear()} onChange={e => setMonth(new Date(Number(e.target.value),month.getMonth(),1))}>{Array.from({length:21},(_,i)=>month.getFullYear()-10+i).map(y=><option key={y} value={y}>{y}</option>)}</select>
        <Button type="button" variant="ghost" className="size-11 shrink-0 p-0" aria-label={ar ? "الشهر التالي" : "Next month"} onClick={() => setMonth(addMonths(month,1))}><ChevronRight/></Button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-xs text-muted-foreground">{Array.from({length:7},(_,i)=><span key={i}>{format(new Date(2026,0,4+i),"EEEEE",{locale})}</span>)}</div>
      <div className="grid grid-cols-7 gap-0.5">{Array.from({length:first},(_,i)=><span key={`blank-${i}`}/>)}{Array.from({length:getDaysInMonth(month)},(_,i)=> {
        const day = new Date(month.getFullYear(),month.getMonth(),i+1), key=format(day,"yyyy-MM-dd");
        return <button key={key} type="button" aria-label={format(day,"EEEE, d MMMM yyyy",{locale})} aria-pressed={key===value} disabled={!!min && key<min} onClick={()=>choose(key)} className={`h-11 min-w-0 rounded-lg text-sm font-medium touch-manipulation disabled:opacity-30 ${key===value ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{i+1}</button>;
      })}</div>
      <Button type="button" variant="outline" className="w-full min-h-11" disabled={!!min && today<min} onClick={()=>choose(today)}>{ar ? "اليوم" : "Today"}</Button>
    </div>}
  </div>;
}
