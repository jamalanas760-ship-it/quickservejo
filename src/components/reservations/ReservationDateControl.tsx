import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

export function ReservationDateControl({value,onChange,ar}:{value:string;onChange:(value:string)=>void;ar:boolean}) {
  const [open,setOpen]=useState(false);
  const date=value ? new Date(`${value}T12:00:00`) : undefined;
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild>
    <Button variant="outline" className="rs-date-control"><CalendarDays className="size-4 shrink-0"/>{date?new Intl.DateTimeFormat(ar?"ar-JO":"en-US",{month:"short",day:"numeric",year:"numeric"}).format(date):ar?"اختر تاريخاً":"Choose date"}</Button>
  </PopoverTrigger><PopoverContent align="end" className="w-auto max-w-[calc(100vw-24px)] p-2" onOpenAutoFocus={event=>event.preventDefault()}>
    <Calendar mode="single" selected={date} defaultMonth={date??new Date()} onSelect={next=>{if(next){onChange(`${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,"0")}-${String(next.getDate()).padStart(2,"0")}`);setOpen(false);}}}/>
  </PopoverContent></Popover>;
}
