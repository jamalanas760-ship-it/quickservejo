import { ReservationDateControl } from "@/components/reservations/ReservationDateControl";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Search, X, Clock3, RefreshCw, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { ReservationField as Field } from "@/components/reservations/ReservationField";
import { addReservationDays, reservationDay, restaurantDateTime } from "@/lib/reservation-studio";
import { defaultWaitlistVisit } from "@/lib/waitlist-studio";
import "@/components/reservations/reservation-studio.css";
import "@/components/reservations/waitlist-studio.css";
import { AppHeader } from "@/components/nav/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAccess } from "@/hooks/useSession";
import { useWorkspaceScope } from "@/hooks/useWorkspace";
import { supabase } from "@/integrations/supabase/client";
import { humanError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { membershipHasCapability } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/waitlist")({
  validateSearch: (search:Record<string,unknown>): {record?: string} => typeof search.record === "string" ? {record:search.record} : {},
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
type ConversionValue={date:string;time:string;hold:number};
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
  estimated_wait_minutes:number|null;
  offer_booking_at:string|null;
  offer_expires_at:string|null;
  offer_sent_at:string|null;
  offer_count:number;
  last_message_at:string|null;
  last_message_channel:string|null;
  created_at:string;
};

function defaultConversion(row:WaitlistRow,timezone:string):ConversionValue {
  return {...defaultWaitlistVisit(row.desired_date,row.preferred_time,timezone),hold:15};
}

function WaitlistPage(){
  const {lang}=useI18n();
  const ar=lang==="ar";
  const isMobile=useIsMobile();
  const pageSize=isMobile?4:6;
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
  const routeRecord = Route.useSearch().record;
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [sheetOpen,setSheetOpen]=useState(false);
  useEffect(()=>{if(routeRecord){setSelectedId(routeRecord);setSheetOpen(true);setDateFilter("");}},[routeRecord]);
  const [cancelTarget,setCancelTarget]=useState<WaitlistRow|null>(null);
  const [dateFilter,setDateFilter]=useState("");
  const [pageIndex,setPageIndex]=useState(0);
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),30_000);return ()=>clearInterval(timer);},[]);
  const restaurant=useQuery({queryKey:["waitlist-restaurant",rid],enabled:Boolean(rid&&canManage),queryFn:async()=>{const {data,error}=await supabase.from("restaurants").select("timezone").eq("id",rid!).single();if(error)throw error;return data;}});
  const settings=useQuery<{default_duration_minutes:number}|null>({queryKey:["waitlist-booking-settings",rid],enabled:Boolean(rid&&canManage),queryFn:async()=>{const {data,error}=await (supabase as any).from("booking_settings").select("default_duration_minutes").eq("restaurant_id",rid!).maybeSingle();if(error)throw error;return data;}});
  const timezone=restaurant.data?.timezone||"UTC";
  const [convertValues,setConvertValues]=useState<Record<string,ConversionValue>>({});

  const query=useQuery<WaitlistRow[]>({
    queryKey:["booking-waitlist",rid],
    enabled:Boolean(rid&&canManage),
    refetchInterval:15_000,
    queryFn:async()=>{
      const {data,error}=await (supabase as any).from("booking_waitlist")
        .select("id,customer_name,phone,email,guest_count,desired_date,preferred_time,occasion,notes,source,status,notified_at,converted_booking_id,cancellation_reason,estimated_wait_minutes,offer_booking_at,offer_expires_at,offer_sent_at,offer_count,last_message_at,last_message_channel,created_at")
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

  const refreshEstimate=useMutation({
    mutationFn:async(row:WaitlistRow)=>{
      const {data,error}=await (supabase as any).rpc("refresh_waitlist_estimate",{_waitlist_id:row.id});
      if(error)throw error;
      return Number(data);
    },
    onSuccess:async(value)=>{
      await qc.invalidateQueries({queryKey:["booking-waitlist",rid]});
      toast.success(ar?`تم تحديث الانتظار التقديري إلى ${value} دقيقة`:`Estimated wait refreshed to ${value} minutes`);
    },
    onError:(error)=>toast.error(humanError(error,lang)),
  });

  const offer=useMutation({
    mutationFn:async(row:WaitlistRow)=>{
      const value=convertValues[row.id]??defaultConversion(row,timezone);
      const date=new Date(restaurantDateTime(value.date,value.time,timezone));
      if(!Number.isFinite(date.getTime()))throw new Error(ar?"اختر تاريخاً ووقتاً صحيحين":"Choose a valid offer date and time");
      const {data,error}=await (supabase as any).rpc("offer_waitlist_entry",{
        _waitlist_id:row.id,
        _booking_at:date.toISOString(),
        _table_id:null,
        _hold_minutes:value.hold,
      });
      if(error)throw error;
      return {...data,hold:value.hold} as {expires_at?:string;channel?:string;hold:number};
    },
    onSuccess:async(data)=>{
      await qc.invalidateQueries({queryKey:["booking-waitlist",rid]});
      toast.success(ar?`تمت إضافة عرض الطاولة للإرسال لمدة ${data.hold} دقيقة`:`Table offer queued for a ${data.hold}-minute hold`);
    },
    onError:(error)=>toast.error(humanError(error,lang)),
  });

  const convert=useMutation({
    mutationFn:async(row:WaitlistRow)=>{
      const value=convertValues[row.id]??defaultConversion(row,timezone);
      const date=new Date(restaurantDateTime(value.date,value.time,timezone));
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
      setSheetOpen(false);
      toast.success(ar?"تم تحويل الضيف إلى حجز مؤكد":"Guest converted to a confirmed reservation");
    },
    onError:(error)=>toast.error(humanError(error,lang)),
  });

  if(scope.isPending||access.isPending)return <div className="min-h-dvh bg-background"><AppHeader/><main className="qs-page"><Skeleton className="h-[560px] rounded-3xl"/></main></div>;
  if(!rid||(!membership&&!access.isSuperAdmin)||!canManage)return <div className="min-h-dvh bg-background"><AppHeader/><main className="qs-page"><section className="qs-card p-10 text-center"><Clock3 className="mx-auto size-10 text-muted-foreground"/><h1 className="mt-4 font-display text-xl font-bold">{ar?"قائمة الانتظار غير متاحة":"Waitlist is not available"}</h1><p className="mt-2 text-sm text-muted-foreground">{ar?"تحتاج صلاحية إدارة الطاولات أو المطعم.":"Table or restaurant management access is required."}</p></section></main></div>;

  const all=query.data??[];
  const active=all.filter(row=>row.status==="waiting"||row.status==="notified");
  const waiting=active.filter(row=>row.status==="waiting");
  const notified=active.filter(row=>row.status==="notified");
  const history=all.filter(row=>!["waiting","notified"].includes(row.status));
  const today=reservationDay(new Date(now),timezone);
  const needle=search.trim().toLowerCase();
  const rows=all.filter(row=>{
    const matchSearch=!needle||[row.customer_name,row.phone,row.email,row.occasion,row.status,row.source].filter(Boolean).join(" ").toLowerCase().includes(needle);
    if(!matchSearch||(dateFilter&&row.desired_date!==dateFilter))return false;
    if(filter==="active")return row.status==="waiting"||row.status==="notified";
    if(filter==="waiting")return row.status==="waiting";
    if(filter==="notified")return row.status==="notified";
    return !["waiting","notified"].includes(row.status);
  });

  const maxPage=Math.max(0,Math.ceil(rows.length/pageSize)-1);
  const currentPage=Math.min(pageIndex,maxPage);
  const visible=rows.slice(currentPage*pageSize,currentPage*pageSize+pageSize);
  const selected=all.find(row=>row.id===selectedId)??visible[0]??null;
  const busy=offer.isPending||convert.isPending||transition.isPending;
  function openGuest(row:WaitlistRow){setSelectedId(row.id);if(window.matchMedia("(max-width: 1000px)").matches)setSheetOpen(true);}
  function visitLabel(row:WaitlistRow){const date=row.desired_date===today?(ar?"اليوم":"Today"):row.desired_date===addReservationDays(today,1)?(ar?"غداً":"Tomorrow"):new Intl.DateTimeFormat(ar?"ar-JO":"en-JO",{month:"short",day:"numeric",timeZone:"UTC"}).format(new Date(row.desired_date+"T12:00:00Z"));return date+(row.preferred_time?" · "+timeLabel(row.preferred_time,ar):"");}
  const details=selected?<WaitlistDetails key={selected.id} row={selected} value={convertValues[selected.id]??defaultConversion(selected,timezone)} onChange={value=>setConvertValues(prev=>({...prev,[selected.id]:value}))} ar={ar} visitLabel={visitLabel(selected)} now={now} duration={settings.data?.default_duration_minutes??90} ready={restaurant.isSuccess&&settings.isSuccess&&!busy} busy={busy} onClose={()=>{setSelectedId(null);setSheetOpen(false);}} onOffer={()=>offer.mutate(selected)} onBook={()=>convert.mutate(selected)} onNotify={()=>transition.mutate({id:selected.id,next:selected.status==="waiting"?"notified":"waiting"})} onCancel={()=>setCancelTarget(selected)} onRefresh={()=>refreshEstimate.mutate(selected)} refreshing={refreshEstimate.isPending}/>:null;

  return <div className="min-h-dvh bg-background">
    <AppHeader title={ar?"قائمة انتظار الحجوزات":"Reservation Waitlist"}/>
    <main className="qs-page qs-compact-page wl-studio">
      <header className="wl-heading"><div><h1><span className="wl-title-full">{ar?"قائمة انتظار الحجوزات":"Reservation Waitlist"}</span><span className="wl-title-short">{ar?"قائمة الانتظار":"Waitlist"}</span></h1><p>{ar?"قائمة واضحة. وترحيب مدروس.":"A clear queue. A thoughtful welcome."}</p></div><div className="wl-date-filter"><ReservationDateControl value={dateFilter} onChange={setDateFilter} ar={ar}/><Button variant="outline" aria-pressed={!dateFilter} onClick={()=>{setDateFilter("");setPageIndex(0);}}>{ar?"كل التواريخ":"All dates"}</Button></div></header>
      <nav className="wl-tabs" aria-label={ar?"الحجوزات وقائمة الانتظار":"Reservations and waitlist"}><Link to="/bookings">{ar?"الحجوزات":"Reservations"}</Link><Link to="/waitlist" aria-current="page">{ar?"قائمة الانتظار":"Waitlist"}</Link></nav>
      <section className="wl-metrics" aria-label={ar?"ملخص قائمة الانتظار":"Waitlist summary"}>{[[ar?"طلبات نشطة":"Active requests",active.length,"active"],[ar?"انتظار":"Waiting",waiting.length,"waiting"],[ar?"تم التواصل":"Notified",notified.length,"notified"]].map(([label,count,tone])=><div key={String(tone)}><span className={`wl-dot wl-dot-${tone}`}/><div><p>{label}</p><strong>{query.isPending?"—":count}</strong></div></div>)}</section>
      <div className="wl-workspace">
        <section className="wl-queue" aria-label={ar?"طابور الانتظار":"Waitlist queue"}>
          <div className="wl-toolbar"><div className="wl-filters">{([["active",ar?"نشطة":"Active",active.length],["waiting",ar?"انتظار":"Waiting",waiting.length],["notified",ar?"تم التواصل":"Notified",notified.length],["history",ar?"السجل":"History",history.length]] as const).map(([key,label,count])=><button key={key} type="button" aria-pressed={filter===key} onClick={()=>{setFilter(key);setPageIndex(0);}}>{label}<span>{count}</span></button>)}</div><div className="wl-search"><Search aria-hidden="true"/><Input aria-label={ar?"ابحث بالاسم أو الهاتف":"Search guest or phone"} placeholder={ar?"ابحث بالاسم أو الهاتف":"Search guest or phone"} value={search} onChange={e=>{setSearch(e.target.value);setPageIndex(0);}}/></div></div>
          {query.isPending?<div className="p-5"><Skeleton className="h-[390px] rounded-xl"/></div>:query.isError?<div className="wl-empty" role="alert"><p>{humanError(query.error,lang)}</p><Button variant="outline" onClick={()=>void query.refetch()}>{ar?"إعادة المحاولة":"Try again"}</Button></div>:rows.length===0?<div className="wl-empty"><Clock3/><h2>{ar?"لا توجد طلبات بهذا الفلتر":"No waitlist requests in this view"}</h2><p>{ar?"غيّر الفلتر أو ابحث عن ضيف آخر.":"Try another filter or search for another guest."}</p>{search||dateFilter||filter!=="active"?<Button variant="outline" onClick={()=>{setSearch("");setDateFilter("");setFilter("active");}}>{ar?"مسح الفلاتر":"Clear filters"}</Button>:null}</div>:<>
            <div className="wl-table-head" aria-hidden="true"><span>{ar?"الضيف":"Guest"}</span><span>{ar?"المجموعة":"Party"}</span><span>{ar?"الزيارة المطلوبة":"Requested visit"}</span><span>{ar?"الحالة":"Status"}</span><span>{ar?"في الانتظار":"Waiting"}</span></div>
            <div className="wl-rows">{visible.map(row=><button type="button" key={row.id} className={cn("wl-row",selected?.id===row.id&&"is-selected")} aria-label={`${ar?"تفاصيل الضيف":"Guest details for"} ${row.customer_name}`} aria-pressed={selected?.id===row.id} onClick={()=>openGuest(row)}><span className="wl-guest"><span className="wl-avatar">{initials(row.customer_name)}</span><span><strong>{row.customer_name}</strong><small dir="auto">{row.phone??row.email??(ar?"لا توجد وسيلة اتصال":"No contact")}</small></span></span><span className="wl-party"><UsersRound/>{row.guest_count} {ar?"ضيوف":"guests"}</span><span className="wl-visit">{visitLabel(row)}</span><span className="wl-row-status"><Status value={row.status} ar={ar}/></span><span className="wl-age">{row.status==="waiting"||row.status==="notified"?formatAge(Math.max(0,Math.floor((now-new Date(row.created_at).getTime())/60_000)),ar):"—"}</span><ChevronRight className="wl-row-chevron"/></button>)}</div>
            <footer className="wl-pagination"><span>{currentPage*pageSize+1}–{Math.min((currentPage+1)*pageSize,rows.length)} / {rows.length} {ar?"طلب":"requests"}</span><div><Button variant="ghost" size="icon" aria-label={ar?"الصفحة السابقة":"Previous page"} disabled={currentPage===0} onClick={()=>setPageIndex(currentPage-1)}><ChevronLeft/></Button><span>{currentPage+1} / {maxPage+1}</span><Button variant="ghost" size="icon" aria-label={ar?"الصفحة التالية":"Next page"} disabled={currentPage===maxPage} onClick={()=>setPageIndex(currentPage+1)}><ChevronRight/></Button></div></footer>
          </>}
        </section>
        {details?<aside className="wl-desktop-details" aria-label={ar?"تفاصيل الضيف":"Guest details"}>{details}</aside>:null}
      </div>
      <Dialog open={sheetOpen&&Boolean(selected)} onOpenChange={setSheetOpen}><DialogContent className="wl-sheet p-0" onOpenAutoFocus={event=>event.preventDefault()}><DialogHeader className="sr-only"><DialogTitle>{ar?"تفاصيل الضيف":"Guest details"}</DialogTitle><DialogDescription>{ar?"تفاصيل الطلب وعرض الطاولة":"Request details and table offer"}</DialogDescription></DialogHeader>{details}</DialogContent></Dialog>
      <AlertDialog open={Boolean(cancelTarget)} onOpenChange={open=>{if(!open)setCancelTarget(null);}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{ar?"إلغاء طلب الانتظار؟":"Cancel waitlist request?"}</AlertDialogTitle><AlertDialogDescription>{cancelTarget?.customer_name} · {ar?"سينتقل الطلب إلى السجل.":"This request will move to History."}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{ar?"رجوع":"Keep request"}</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={()=>{if(cancelTarget){transition.mutate({id:cancelTarget.id,next:"cancelled",reason:"Cancelled by restaurant"});setSheetOpen(false);}}}>{ar?"إلغاء الطلب":"Cancel request"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </main>
  </div>;
}

function WaitlistDetails({row,value,onChange,ar,visitLabel,now,duration,ready,busy,onClose,onOffer,onBook,onNotify,onCancel,onRefresh,refreshing}:{row:WaitlistRow;value:ConversionValue;onChange:(value:ConversionValue)=>void;ar:boolean;visitLabel:string;now:number;duration:number;ready:boolean;busy:boolean;onClose:()=>void;onOffer:()=>void;onBook:()=>void;onNotify:()=>void;onCancel:()=>void;onRefresh:()=>void;refreshing:boolean}){
  const live=row.status==="waiting"||row.status==="notified";
  const activeOffer=Boolean(row.offer_expires_at&&new Date(row.offer_expires_at).getTime()>now);
  const valid=ready&&Boolean(value.date)&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value.time);
  return <div className="wl-details"><div className="wl-detail-title"><h2>{ar?"تفاصيل الضيف":"Guest details"}</h2><button type="button" aria-label={ar?"إغلاق تفاصيل الضيف":"Close guest details"} onClick={onClose}><X/></button></div><div className="wl-detail-guest"><span className="wl-avatar">{initials(row.customer_name)}</span><div><strong>{row.customer_name}</strong><p dir="auto">{row.phone??row.email??(ar?"لا توجد وسيلة اتصال":"No contact")}</p></div><Status value={row.status} ar={ar}/></div><div className="wl-detail-meta"><div><small>{ar?"عدد الضيوف":"Party size"}</small><strong>{row.guest_count} {ar?"ضيوف":"guests"}</strong></div><div><small>{ar?"الزيارة المطلوبة":"Requested visit"}</small><strong>{visitLabel}</strong></div><div><small>{ar?"انضم منذ":"Joined queue"}</small><strong>{formatAge(Math.max(0,Math.floor((now-new Date(row.created_at).getTime())/60_000)),ar)}</strong></div></div>{row.notes?<div className="wl-note"><small>{ar?"ملاحظة الضيف":"Guest note"}</small><p>{row.notes}</p></div>:null}
    {live?<><div className="wl-offer"><h3>{ar?"عرض طاولة":"Offer a table"}</h3>{activeOffer?<div className="wl-active-offer" role="status">{ar?"عرض طاولة نشط · ينتهي خلال ":"Active table offer · expires in "}{Math.max(1,Math.ceil((new Date(row.offer_expires_at!).getTime()-Date.now())/60_000))} {ar?"دقيقة":"min"}</div>:null}<div className="wl-offer-fields"><Field label={ar?"التاريخ":"Date"}><Input aria-label={ar?"تاريخ العرض":"Offer date"} type="date" value={value.date} onChange={e=>onChange({...value,date:e.target.value})}/></Field><Field label={ar?"الوقت":"Time"}><div className="wl-time-chips">{["19:00","19:30","20:00","20:30"].map(time=><button type="button" key={time} aria-pressed={value.time===time} onClick={()=>onChange({...value,time})}>{timeLabel(time,ar)}</button>)}</div><Input aria-label={ar?"وقت العرض":"Offer time"} type="time" step="900" value={value.time} onChange={e=>onChange({...value,time:e.target.value})}/></Field><Field label={ar?"المدة":"Duration"}><Input aria-label={ar?"مدة الحجز من إعدادات المطعم":"Duration from restaurant settings"} value={`${duration} ${ar?"دقيقة":"minutes"}`} readOnly/></Field><Field label={ar?"صلاحية العرض":"Offer validity"}><select aria-label={ar?"صلاحية العرض":"Offer validity"} value={value.hold} onChange={e=>onChange({...value,hold:Number(e.target.value)})}>{[5,10,15,20,30].map(minutes=><option key={minutes} value={minutes}>{minutes} {ar?"دقيقة":"minutes"}</option>)}</select></Field></div><div className="wl-offer-footer"><Button disabled={!valid||activeOffer||(!row.phone&&!row.email)} onClick={onOffer}>{busy?(ar?"جارٍ المعالجة…":"Processing…"):(ar?"إرسال عرض الطاولة":"Send table offer")}</Button><p>{ar?"يتم فحص التوفر قبل الحجز.":"Availability is checked before booking."}</p></div><Button variant="outline" className="wl-book-direct" disabled={!valid} onClick={onBook}>{busy?(ar?"جارٍ المعالجة…":"Processing…"):(ar?"حجز مباشر":"Book directly")}</Button><div className="wl-secondary-actions"><button type="button" disabled={busy} onClick={onNotify}>{row.status==="waiting"?(ar?"تم التواصل":"Mark notified"):(ar?"إعادة للانتظار":"Back to waiting")}</button><button type="button" disabled={busy} onClick={onCancel}>{ar?"إلغاء الطلب":"Cancel request"}</button></div>{row.estimated_wait_minutes!=null?<details className="wl-extra"><summary>{ar?"تفاصيل الانتظار":"Wait estimate"}</summary><p>{ar?"التقدير الحالي: ":"Current estimate: "}{row.estimated_wait_minutes} {ar?"دقيقة":"min"}</p><Button size="sm" variant="ghost" disabled={refreshing||busy} onClick={onRefresh}><RefreshCw className="size-3"/>{ar?"تحديث التقدير":"Refresh estimate"}</Button></details>:null}</div></>:<div className="wl-closed"><strong>{row.converted_booking_id?(ar?"تم إنشاء حجز مؤكد":"Confirmed reservation created"):(ar?"هذا الطلب مغلق":"This request is closed")}</strong>{row.cancellation_reason?<p>{row.cancellation_reason}</p>:null}</div>}
  </div>;
}

function Status({value,ar}:{value:WaitlistStatus;ar:boolean}){
  const labels={waiting:ar?"انتظار":"Waiting",notified:ar?"تم التواصل":"Notified",converted:ar?"تم الحجز":"Booked",cancelled:ar?"ملغى":"Cancelled",expired:ar?"منتهي":"Expired"};
  return <span className={`wl-status wl-status-${value}`}>{labels[value]}</span>;
}
function initials(name:string){return name.trim().split(/\s+/).slice(0,2).map(part=>part[0]?.toUpperCase()??"").join("")||"?";}
function timeLabel(time:string,ar:boolean){return new Intl.DateTimeFormat(ar?"ar-JO":"en-JO",{hour:"numeric",minute:"2-digit",timeZone:"UTC"}).format(new Date("2000-01-01T"+time.slice(0,5)+":00Z"));}
function formatAge(minutes:number,ar:boolean){if(minutes<60)return `${minutes} ${ar?"د":"min"}`;const hours=Math.floor(minutes/60),rest=minutes%60;if(hours<24)return `${hours} ${ar?"س":"h"}${rest?` ${rest} ${ar?"د":"min"}`:""}`;return `${Math.floor(hours/24)} ${ar?"يوم":"d"}`;}
