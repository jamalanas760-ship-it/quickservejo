import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, CalendarCheck2, Clock3, RotateCcw, UserRoundCheck, UsersRound, XCircle } from "lucide-react";
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

function localDateTimeValue(date:string) {
  const now=new Date();
  const hh=String(Math.max(now.getHours()+1,12)%24).padStart(2,"0");
  return `${date}T${hh}:00`;
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
  const [convertTimes,setConvertTimes]=useState<Record<string,string>>({});

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
      const input=convertTimes[row.id]||localDateTimeValue(row.desired_date);
      const date=new Date(input);
      if(!Number.isFinite(date.getTime()))throw new Error("Choose a valid reservation time");
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
  const needle=search.trim().toLowerCase();
  const rows=all.filter(row=>!needle||[row.customer_name,row.phone,row.email,row.occasion,row.status].filter(Boolean).join(" ").toLowerCase().includes(needle));
  const active=all.filter(row=>row.status==="waiting"||row.status==="notified");
  const notified=active.filter(row=>row.status==="notified").length;
  const today=new Date().toLocaleDateString("en-CA");
  const todayCount=active.filter(row=>row.desired_date===today).length;

  return <div className="min-h-dvh bg-background">
    <AppHeader title={ar?"قائمة انتظار الحجوزات":"Reservation Waitlist"}/>
    <main className="qs-page space-y-5">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-orange-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.14em] text-[#ff5a0a]"><Clock3 className="size-3.5"/>{ar?"إدارة الطلب":"Demand control"}</span>
          <h1 className="qs-page-title mt-3">{ar?"قائمة انتظار الحجوزات":"Reservation waitlist"}</h1>
          <p className="qs-page-subtitle max-w-2xl">{ar?"رتّب الطلبات غير المتاحة، تواصل مع الضيف، ثم حوّله إلى حجز مؤكد مع فحص التوفر والتعارض من قاعدة البيانات.":"Queue unavailable reservation demand, contact the guest, then convert them into a confirmed reservation with database-enforced availability and conflict checks."}</p>
        </div>
        <Input className="max-w-sm" value={search} onChange={e=>setSearch(e.target.value)} placeholder={ar?"ابحث بالاسم أو الهاتف أو البريد":"Search name, phone or email"}/>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <Metric icon={UsersRound} label={ar?"قيد الانتظار":"Waiting"} value={active.length}/>
        <Metric icon={BellRing} label={ar?"تم التواصل":"Notified"} value={notified}/>
        <Metric icon={CalendarCheck2} label={ar?"طلبات اليوم":"Today"} value={todayCount}/>
      </section>

      <section className="qs-card overflow-hidden">
        <div className="border-b border-border p-5"><h2 className="qs-section-title">{ar?"طابور الانتظار":"Waitlist queue"}</h2><p className="mt-1 text-xs text-muted-foreground">{ar?"التحويل إلى حجز يختار أفضل طاولة متاحة تلقائياً إذا لم تحدد طاولة يدوياً.":"Conversion uses the protected booking engine and automatically chooses the best-fit available table."}</p></div>
        {query.isPending?<div className="p-5"><Skeleton className="h-[420px] rounded-xl"/></div>
          :query.isError?<div className="p-5 text-sm text-destructive">{humanError(query.error,lang)}</div>
          :rows.length===0?<div className="grid min-h-[300px] place-items-center p-8 text-center"><div><Clock3 className="mx-auto size-9 text-muted-foreground"/><p className="mt-3 text-sm text-muted-foreground">{ar?"لا توجد طلبات في قائمة الانتظار.":"No waitlist requests."}</p></div></div>
          :<div className="divide-y divide-border">{rows.map(row=>{
            const live=row.status==="waiting"||row.status==="notified";
            const conversionValue=convertTimes[row.id]??localDateTimeValue(row.desired_date);
            return <article key={row.id} className="p-4 sm:p-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><strong className="text-base">{row.customer_name}</strong><Status value={row.status}/></div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>{row.guest_count} {ar?"ضيوف":"guests"}</span>
                    <span>{row.desired_date}</span>
                    {row.phone?<span>{row.phone}</span>:null}
                    {row.email?<span>{row.email}</span>:null}
                    <span className="capitalize">{row.source.replaceAll("_"," ")}</span>
                  </div>
                  {row.occasion||row.notes?<p className="mt-2 text-xs text-muted-foreground">{[row.occasion,row.notes].filter(Boolean).join(" · ")}</p>:null}
                  {row.cancellation_reason?<p className="mt-2 text-xs text-red-600">{row.cancellation_reason}</p>:null}
                </div>

                {live?<div className="w-full space-y-2 xl:max-w-[420px]">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input type="datetime-local" value={conversionValue} onChange={e=>setConvertTimes(prev=>({...prev,[row.id]:e.target.value}))}/>
                    <Button disabled={convert.isPending} onClick={()=>convert.mutate(row)}><UserRoundCheck className="size-4"/>{ar?"تحويل لحجز":"Convert"}</Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {row.status==="waiting"?<Button size="sm" variant="outline" disabled={transition.isPending} onClick={()=>transition.mutate({id:row.id,next:"notified"})}><BellRing className="size-3"/>{ar?"تم التواصل":"Mark notified"}</Button>:<Button size="sm" variant="outline" disabled={transition.isPending} onClick={()=>transition.mutate({id:row.id,next:"waiting"})}><RotateCcw className="size-3"/>{ar?"إرجاع للانتظار":"Back to waiting"}</Button>}
                    <Button size="sm" variant="outline" disabled={transition.isPending} onClick={()=>transition.mutate({id:row.id,next:"cancelled",reason:"Cancelled by restaurant"})}><XCircle className="size-3"/>{ar?"إلغاء":"Cancel"}</Button>
                  </div>
                </div>:row.converted_booking_id?<span className="text-xs font-semibold text-emerald-700">{ar?"تم إنشاء حجز مؤكد":"Confirmed reservation created"}</span>:null}
              </div>
            </article>;
          })}</div>}
      </section>
    </main>
  </div>;
}

function Metric({icon:Icon,label,value}:{icon:typeof UsersRound;label:string;value:number}){
  return <article className="qs-stat min-h-[105px] p-4"><div className="flex items-center gap-2"><span className="grid size-9 place-items-center rounded-xl bg-orange-500/10 text-[#ff5a0a]"><Icon className="size-4"/></span><span className="text-[11px] font-semibold text-muted-foreground">{label}</span></div><strong className="mt-3 block font-display text-2xl">{value}</strong></article>;
}

function Status({value}:{value:WaitlistStatus}){
  const classes=value==="converted"?"bg-emerald-500/10 text-emerald-700":value==="notified"?"bg-blue-500/10 text-blue-700":value==="waiting"?"bg-amber-500/10 text-amber-700":"bg-muted text-muted-foreground";
  return <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-bold capitalize",classes)}>{value.replaceAll("_"," ")}</span>;
}
