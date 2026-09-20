import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, CalendarCheck2, CalendarDays, CheckCircle2, Clock3, RotateCcw, UserRoundCheck, UsersRound, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppHeader } from "@/components/nav/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccess } from "@/hooks/useSession";
import { useWorkspaceScope } from "@/hooks/useWorkspace";
import { supabase } from "@/integrations/supabase/client";
import { humanError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { membershipHasCapability } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/waitlist")({
  head: () => ({
    meta: [
      { title: "Reservation Waitlist — QuickServe" },
      { name: "description", content: "Manage restaurant reservation waitlist guests and convert them into protected reservations." },
    ],
  }),
  component: WaitlistPage,
});

type WaitlistStatus="waiting"|"notified"|"converted"|"cancelled"|"expired";
type WaitlistFilter="active"|"waiting"|"notified"|"history";
type ConversionValue={date:string;time:string};
type WaitlistRow={
  id:string;
  customer_name:string;
  phone:string|null;
  email:string|null;
  guest_count:number;
  desired_date:string;
  preferred_time:string|null;
  occasion:string|null;
  notes:string|null;
  source:string;
  status:WaitlistStatus;
  notified_at:string|null;
  converted_booking_id:string|null;
  cancellation_reason:string|null;
  created_at:string;
};

function defaultConversion(row:WaitlistRow):ConversionValue {
  const now=new Date();
  const today=now.toLocaleDateString("en-CA");
  const baseDate=row.desired_date||today;
  let hour=18;
  let minute=0;
  if(baseDate===today){
    const future=new Date(now.getTime()+60*60_000);
    future.setMinutes(Math.ceil(future.getMinutes()/15)*15,0,0);
    hour=future.getHours();
    minute=future.getMinutes();
  }
  return {date:baseDate,time:`${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}`};
}

function WaitlistPage(){
  const {lang}=useI18n();
  const ar=lang==="ar";
  const scope=useWorkspaceScope();
  const access=useAccess();
  const qc=useQueryClient();
  const rid=scope.restaurantId;
  const membership=rid?access.membershipFor(rid):null;
  const canManage=Boolean(access.isSuperAdmin||(membership&&(
    membershipHasCapability(membership.role,membership.permission_overrides,"manage_tables")
    || membershipHasCapability(membership.role,membership.permission_overrides,"manage_restaurant")
  )));
  const [search,setSearch]=useState("");
  const [filter,setFilter]=useState<WaitlistFilter>("active");
  const [convertValues,setConvertValues]=useState<Record<string,ConversionValue>>({});

  const query=useQuery<WaitlistRow[]>({
    queryKey:["booking-waitlist",rid],
    enabled:Boolean(rid&&canManage),
    refetchInterval:15_000,
    queryFn:async()=>{
      const {data,error}=await (supabase as any).from("booking_waitlist")
        .select("id,customer_name,phone,email,guest_count,desired_date,preferred_time,occasion,notes,source,status,notified_at,converted_booking_id,cancellation_reason,created_at")
        .eq("restaurant_id",rid!)
        .order("desired_date",{ascending:true})
        .order("created_at",{ascending:true})
        .limit(500);
      if(error)throw error;
      return (data??[]) as WaitlistRow[];
    },
  });

  const transition=useMutation({
    mutationFn:async({id,next,reason}:{id:string;next:"waiting"|"notified"|"cancelled"|"expired";reason?:string})=>{
      const {error}=await (supabase as any).rpc("transition_booking_waitlist",{
        _waitlist_id:id,_next:next,_reason:reason??null,
      });
      if(error)throw error;
    },
    onSuccess:async()=>{
      await qc.invalidateQueries({queryKey:["booking-waitlist",rid]});
      toast.success(ar?"تم تحديث قائمة الانتظار":"Waitlist updated");
    },
    onError:(error)=>toast.error(humanError(error,lang)),
  });

  const convert=useMutation({
    mutationFn:async(row:WaitlistRow)=>{
      const value=convertValues[row.id]??defaultConversion(row);
      const date=new Date(`${value.date}T${value.time}`);
      if(!Number.isFinite(date.getTime()))throw new Error(ar?"اختر تاريخاً ووقتاً صحيحين":"Choose a valid reservation date and time");
      const {data,error}=await (supabase as any).rpc("convert_booking_waitlist",{
        _waitlist_id:row.id,
        _booking_at:date.toISOString(),
        _table_id:null,
      });
      if(error)throw error;
      return String(data);
    },
    onSuccess:async()=>{
      await Promise.all([
        qc.invalidateQueries({queryKey:["booking-waitlist",rid]}),
        qc.invalidateQueries({queryKey:["bookings",rid]}),
      ]);
      toast.success(ar?"تم تحويل الضيف إلى حجز مؤكد":"Guest converted to a confirmed reservation");
    },
    onError:(error)=>toast.error(humanError(error,lang)),
  });

  if(scope.isPending||access.isPending)return <div className="min-h-dvh bg-background"><AppHeader/><main className="qs-page"><Skeleton className="h-[560px] rounded-3xl"/></main></div>;
  if(!rid||!membership||!canManage)return <div className="min-h-dvh bg-background"><AppHeader/><main className="qs-page"><section className="qs-card p-10 text-center"><Clock3 className="mx-auto size-10 text-muted-foreground"/><h1 className="mt-4 font-display text-xl font-bold">{ar?"قائمة الانتظار غير متاحة":"Waitlist is not available"}</h1><p className="mt-2 text-sm text-muted-foreground">{ar?"تحتاج صلاحية إدارة الطاولات أو المطعم.":"Table or restaurant management access is required."}</p></section></main></div>;

  const all=query.data??[];
  const active=all.filter(row=>row.status==="waiting"||row.status==="notified");
  const waiting=active.filter(row=>row.status==="waiting");
  const notified=active.filter(row=>row.status==="notified");
  const history=all.filter(row=>!["waiting","notified"].includes(row.status));
  const today=new Date().toLocaleDateString("en-CA");
  const todayCount=active.filter(row=>row.desired_date===today).length;
  const oldestMinutes=active.length?Math.max(...active.map(row=>Math.max(0,Math.floor((Date.now()-new Date(row.created_at).getTime())/60_000)))):0;
  const needle=search.trim().toLowerCase();
  const rows=all.filter(row=>{
    const matchSearch=!needle||[row.customer_name,row.phone,row.email,row.occasion,row.status,row.source].filter(Boolean).join(" ").toLowerCase().includes(needle);
    if(!matchSearch)return false;
    if(filter==="active")return row.status==="waiting"||row.status==="notified";
    if(filter==="waiting")return row.status==="waiting";
    if(filter==="notified")return row.status==="notified";
    return !["waiting","notified"].includes(row.status);
  });

  return <div className="min-h-dvh bg-background">
    <AppHeader title={ar?"قائمة انتظار الحجوزات":"Reservation Waitlist"}/>
    <main className="qs-page space-y-5">
      <section className="overflow-hidden rounded-[28px] border border-border/70 bg-card shadow-[0_18px_50px_rgba(15,23,42,.06)]">
        <div className="border-b border-border/70 bg-gradient-to-br from-blue-500/[.07] via-background to-background p-5 sm:p-7">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-blue-200/70 bg-blue-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.16em] text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-300"><Clock3 className="size-3.5"/>{ar?"إدارة الطلب":"Demand control"}</span>
              <h1 className="mt-3 font-display text-3xl font-black tracking-[-.035em] sm:text-4xl">{ar?"قائمة انتظار الحجوزات":"Reservation waitlist"}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{ar?"حوّل الطلب غير المتاح إلى فرصة: رتّب الأولويات، تواصل مع الضيف، ثم حوّله لحجز مؤكد من نفس شاشة التشغيل.":"Turn unavailable demand into booked covers: prioritize guests, contact them, and convert to a protected reservation from the same operational desk."}</p>
            </div>
            <Input className="h-11 max-w-sm rounded-xl bg-background/90" value={search} onChange={e=>setSearch(e.target.value)} placeholder={ar?"ابحث بالاسم، الهاتف أو البريد":"Search name, phone or email"}/>
          </div>
          <div className="mt-6 inline-flex rounded-2xl border border-border bg-background/90 p-1 shadow-sm">
            <Link to="/bookings" className="rounded-xl px-4 py-2 text-xs font-bold text-muted-foreground transition hover:bg-muted/60 hover:text-foreground">{ar?"الحجوزات":"Reservations"}</Link>
            <Link to="/waitlist" className="rounded-xl bg-foreground px-4 py-2 text-xs font-bold text-background shadow-sm">{ar?"قائمة الانتظار":"Waitlist"}</Link>
          </div>
        </div>
        <div className="grid gap-px bg-border/70 sm:grid-cols-2 xl:grid-cols-4">
          <Metric icon={UsersRound} label={ar?"طلبات نشطة":"Active requests"} value={active.length}/>
          <Metric icon={Clock3} label={ar?"بانتظار التواصل":"Waiting"} value={waiting.length}/>
          <Metric icon={BellRing} label={ar?"تم التواصل":"Notified"} value={notified.length}/>
          <Metric icon={CalendarCheck2} label={ar?"طلبات اليوم":"Today"} value={todayCount} hint={active.length?(ar?"أقدم طلب "+formatAge(oldestMinutes,ar):"Oldest "+formatAge(oldestMinutes,ar)):undefined}/>
        </div>
      </section>

      <section className="qs-card overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-border p-5 lg:flex-row lg:items-center lg:justify-between">
          <div><h2 className="qs-section-title">{ar?"طابور الانتظار":"Waitlist queue"}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{ar?"رتّب الطلبات حسب الحالة، ثم اختر تاريخ ووقت التحويل بشكل واضح. يتم إعادة فحص التوفر عند الإنشاء.":"Filter by status, then choose a clear conversion date and time. Availability is checked again when the reservation is created."}</p></div>
          <div className="flex flex-wrap gap-2">
            <FilterChip active={filter==="active"} onClick={()=>setFilter("active")} label={ar?"نشطة":"Active"} count={active.length}/>
            <FilterChip active={filter==="waiting"} onClick={()=>setFilter("waiting")} label={ar?"انتظار":"Waiting"} count={waiting.length}/>
            <FilterChip active={filter==="notified"} onClick={()=>setFilter("notified")} label={ar?"تم التواصل":"Notified"} count={notified.length}/>
            <FilterChip active={filter==="history"} onClick={()=>setFilter("history")} label={ar?"السجل":"History"} count={history.length}/>
          </div>
        </div>
        {query.isPending?<div className="p-5"><Skeleton className="h-[420px] rounded-xl"/></div>
          :query.isError?<div className="p-5 text-sm text-destructive">{humanError(query.error,lang)}</div>
          :rows.length===0?<div className="grid min-h-[320px] place-items-center p-8 text-center"><div><Clock3 className="mx-auto size-10 text-muted-foreground"/><h3 className="mt-3 font-bold">{ar?"لا توجد طلبات بهذا الفلتر":"No waitlist requests in this view"}</h3><p className="mt-1 text-sm text-muted-foreground">{ar?"غيّر الفلتر أو ابحث عن ضيف آخر.":"Try another filter or search for another guest."}</p></div></div>
          :<div className="divide-y divide-border">{rows.map(row=>{
            const live=row.status==="waiting"||row.status==="notified";
            const value=convertValues[row.id]??defaultConversion(row);
            const ageMinutes=Math.max(0,Math.floor((Date.now()-new Date(row.created_at).getTime())/60_000));
            return <article key={row.id} className="p-3 sm:p-4">
              <div className="grid gap-5 rounded-2xl border border-border/80 bg-card p-4 shadow-sm transition hover:shadow-md sm:p-5 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-start">
                <div className="min-w-0">
                  <div className="flex items-start gap-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-muted text-sm font-black">{initials(row.customer_name)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><strong className="text-base">{row.customer_name}</strong><Status value={row.status}/></div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Meta icon={UsersRound} text={String(row.guest_count)+" "+(ar?"ضيوف":"guests")}/>
                        <Meta icon={CalendarDays} text={row.desired_date}/>
                        {row.preferred_time?<Meta icon={Clock3} text={row.preferred_time}/>:null}
                        {live?<span className={cn("rounded-full px-2.5 py-1 text-[10px] font-semibold",ageMinutes>=120?"bg-red-500/10 text-red-700":ageMinutes>=45?"bg-amber-500/10 text-amber-700":"bg-muted text-muted-foreground")}>{ar?"منذ ":"Waiting "}{formatAge(ageMinutes,ar)}</span>:null}
                      </div>
                      <div className="mt-3 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                        {row.phone?<span>{ar?"هاتف: ":"Phone: "}<strong className="font-semibold text-foreground">{row.phone}</strong></span>:null}
                        {row.email?<span>{ar?"بريد: ":"Email: "}<strong className="font-semibold text-foreground">{row.email}</strong></span>:null}
                        {row.occasion?<span>{ar?"المناسبة: ":"Occasion: "}<strong className="font-semibold text-foreground">{row.occasion}</strong></span>:null}
                        <span>{ar?"المصدر: ":"Source: "}<strong className="font-semibold capitalize text-foreground">{row.source.replaceAll("_"," ")}</strong></span>
                      </div>
                      {row.notes?<div className="mt-3 rounded-xl bg-muted/45 px-3 py-2 text-xs leading-5 text-muted-foreground">{row.notes}</div>:null}
                      {row.cancellation_reason?<div className="mt-3 rounded-xl bg-red-500/8 px-3 py-2 text-xs text-red-700">{row.cancellation_reason}</div>:null}
                    </div>
                  </div>
                </div>

                {live?<div className="rounded-2xl border border-border bg-muted/20 p-4">
                  <div className="flex items-center gap-2"><UserRoundCheck className="size-4 text-[#ff5a0a]"/><strong className="text-sm">{ar?"تحويل إلى حجز":"Convert to reservation"}</strong></div>
                  <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{ar?"اختر الموعد المقترح. يتم تعيين أفضل طاولة متاحة تلقائياً عند التحويل.":"Choose the proposed slot. The best-fit available table is assigned automatically during conversion."}</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1.5"><span className="text-[10px] font-bold text-muted-foreground">{ar?"التاريخ":"Date"}</span><Input className="h-10 rounded-xl bg-background" type="date" value={value.date} onChange={e=>setConvertValues(prev=>({...prev,[row.id]:{...value,date:e.target.value}}))}/></label>
                    <label className="space-y-1.5"><span className="text-[10px] font-bold text-muted-foreground">{ar?"الوقت":"Time"}</span><Input className="h-10 rounded-xl bg-background" type="time" step="900" value={value.time} onChange={e=>setConvertValues(prev=>({...prev,[row.id]:{...value,time:e.target.value}}))}/></label>
                  </div>
                  <Button className="mt-3 w-full rounded-xl" disabled={convert.isPending} onClick={()=>convert.mutate(row)}><UserRoundCheck className="size-4"/>{convert.isPending?(ar?"جارٍ فحص التوفر…":"Checking availability…"):(ar?"إنشاء حجز مؤكد":"Create confirmed reservation")}</Button>
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                    {row.status==="waiting"?<Button size="sm" variant="outline" className="rounded-xl" disabled={transition.isPending} onClick={()=>transition.mutate({id:row.id,next:"notified"})}><BellRing className="size-3"/>{ar?"تم التواصل":"Mark notified"}</Button>:<Button size="sm" variant="outline" className="rounded-xl" disabled={transition.isPending} onClick={()=>transition.mutate({id:row.id,next:"waiting"})}><RotateCcw className="size-3"/>{ar?"إرجاع للانتظار":"Back to waiting"}</Button>}
                    <Button size="sm" variant="ghost" className="rounded-xl text-muted-foreground" disabled={transition.isPending} onClick={()=>transition.mutate({id:row.id,next:"cancelled",reason:"Cancelled by restaurant"})}><XCircle className="size-3"/>{ar?"إلغاء الطلب":"Cancel request"}</Button>
                  </div>
                </div>:<div className="flex min-h-24 items-center justify-center rounded-2xl border border-dashed border-border bg-muted/15 p-4 text-center">
                  {row.converted_booking_id?<div><CheckCircle2 className="mx-auto size-5 text-emerald-600"/><strong className="mt-2 block text-xs text-emerald-700">{ar?"تم إنشاء حجز مؤكد":"Confirmed reservation created"}</strong></div>:<span className="text-xs text-muted-foreground">{ar?"هذا الطلب مغلق":"This request is closed"}</span>}
                </div>}
              </div>
            </article>;
          })}</div>}
      </section>
    </main>
  </div>;
}

function FilterChip({active,onClick,label,count}:{active:boolean;onClick:()=>void;label:string;count:number}){
  return <button type="button" onClick={onClick} className={cn("inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition",active?"border-foreground bg-foreground text-background shadow-sm":"border-border bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground")}><span>{label}</span><span className={cn("min-w-5 rounded-full px-1.5 py-0.5 text-[9px]",active?"bg-background/15":"bg-muted")}>{count}</span></button>;
}

function Metric({icon:Icon,label,value,hint}:{icon:typeof UsersRound;label:string;value:number;hint?:string}){
  return <article className="flex min-h-[105px] items-center gap-4 bg-card p-5"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-blue-500/10 text-blue-600"><Icon className="size-5"/></span><div><p className="text-[11px] font-semibold text-muted-foreground">{label}</p><strong className="mt-1 block font-display text-3xl tracking-[-.04em]">{value}</strong>{hint?<p className="mt-0.5 text-[9px] text-muted-foreground">{hint}</p>:null}</div></article>;
}

function Meta({icon:Icon,text}:{icon:typeof UsersRound;text:string}){
  return <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold text-muted-foreground"><Icon className="size-3"/>{text}</span>;
}

function Status({value}:{value:WaitlistStatus}){
  const classes=value==="converted"?"bg-emerald-500/10 text-emerald-700":value==="notified"?"bg-blue-500/10 text-blue-700":value==="waiting"?"bg-amber-500/10 text-amber-700":"bg-muted text-muted-foreground";
  return <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-bold capitalize",classes)}>{value.replaceAll("_"," ")}</span>;
}


function initials(name:string){
  return name.trim().split(/\s+/).slice(0,2).map(part=>part[0]?.toUpperCase()??"").join("")||"?";
}

function formatAge(minutes:number,ar:boolean){
  if(minutes<60)return ar?String(minutes)+" د":String(minutes)+"m";
  const hours=Math.floor(minutes/60);
  const mins=minutes%60;
  if(hours<24)return ar?String(hours)+" س"+(mins?" "+String(mins)+" د":""):String(hours)+"h"+(mins?" "+String(mins)+"m":"");
  const days=Math.floor(hours/24);
  return ar?String(days)+" يوم":String(days)+"d";
}
