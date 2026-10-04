import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Clock3 } from "lucide-react";

type TimeOption = { value: string; label: string };
/** Six choices at a time, without a nested scroll area or native wheel picker. */
export function TimeSlotPicker({options,value,onChange,ar}:{options:TimeOption[];value:string;onChange:(value:string)=>void;ar:boolean}) {
  const [page,setPage]=useState(0);
  const pages=Math.max(1,Math.ceil(options.length/6));
  const key=options.map(option=>option.value).join('|');
  useEffect(()=>setPage(0),[key]);
  const current=Math.min(page,pages-1);
  const selected=options.find(option=>option.value===value);
  return <div className="rs-time-picker">
    <div className="rs-time-picker-summary"><Clock3 className="size-4"/><span>{selected?.label??(ar?"اختر وقتاً":"Choose a time")}</span><small>{ar?"حسب توقيت المطعم":"Restaurant local time"}</small></div>
    <div className="rs-time-slots rs-time-page">{options.slice(current*6,current*6+6).map(option=><button key={option.value} type="button" aria-pressed={value===option.value} onClick={()=>onChange(option.value)}>{option.label}</button>)}</div>
    {pages>1?<div className="rs-time-page-nav"><button type="button" disabled={current===0} onClick={()=>setPage(current-1)}><ChevronLeft className="size-4"/>{ar?"أوقات أبكر":"Earlier"}</button><span aria-live="polite">{current+1} / {pages}</span><button type="button" disabled={current===pages-1} onClick={()=>setPage(current+1)}>{ar?"أوقات لاحقة":"Later"}<ChevronRight className="size-4"/></button></div>:null}
  </div>;
}
