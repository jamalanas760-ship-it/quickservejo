import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Search, X, Copy, Table2, BadgeDollarSign, CalendarCheck2, CalendarClock, CalendarDays, CheckCircle2, Clock3, ExternalLink, Globe2, MessageSquareText, MoreHorizontal, Plus, Send, Settings2, Timer, Trash2, UserRoundCheck, UsersRound, XCircle } from "lucide-react";
import { toast } from "sonner";

import { addReservationDays, reservationDay, restaurantDateTime, bookingTimeLabel, defaultBookingHours, validateBookingHours, type WeeklyHours } from "@/lib/reservation-studio";
import "@/components/reservations/reservation-studio.css";
import { AppHeader } from "@/components/nav/AppHeader";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ReservationField as Field } from "@/components/reservations/ReservationField";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAccess } from "@/hooks/useSession";
import { useWorkspaceScope } from "@/hooks/useWorkspace";
import { supabase } from "@/integrations/supabase/client";
import { humanError } from "@/lib/errors";
import { formatMoney } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { membershipHasCapability } from "@/lib/permissions";
import { cn } from "@/lib/utils";

type BookingRouteSearch={create?:boolean};
export const Route = createFileRoute("/_authenticated/bookings")({
  validateSearch:(search:Record<string,unknown>):BookingRouteSearch=>{
    const create=search.create===true||search.create==="1"||search.create==="true";
    return create?{create:true}:{};
  },
  head: () => ({ meta: [{ title: "Reservations — QuickServe" }, { name: "description", content: "Live table availability, reservations and guest seating." }] }),
  component: BookingsPage,
});

type BookingStatus = "pending" | "confirmed" | "seated" | "completed" | "cancelled" | "no_show";
type Booking = {
  id:string; restaurant_id:string; table_id:string|null; customer_name:string; phone:string|null; email:string|null;
  guest_count:number; booking_at:string; ends_at:string; duration_minutes:number; zone:string|null; status:BookingStatus;
  notes:string|null; occasion:string|null; source:string; confirmation_code:string; public_token:string; deposit_amount:number;
  deposit_status:string; cancel_reason:string|null; created_at:string;
};
type FloorTable={id:string;table_number:string;table_name:string|null;zone:string;capacity:number;service_status:string};
type BookingSettings={
  restaurant_id:string;online_enabled:boolean;auto_confirm:boolean;slot_minutes:number;default_duration_minutes:number;
  min_party_size:number;max_party_size:number;min_lead_minutes:number;max_advance_days:number;reminder_hours:number;
  cancellation_cutoff_hours:number;require_phone:boolean;require_email:boolean;deposit_mode:"none"|"fixed"|"per_guest";
  deposit_amount:number;confirmation_channel:string;reminder_channel:string;terms:string|null;weekly_hours?:WeeklyHours;
};

function BookingsPage(){
  const {lang}=useI18n(); const ar=lang==="ar";
  const routeSearch=Route.useSearch();
  const scope=useWorkspaceScope(); const access=useAccess(); const qc=useQueryClient();
  const rid=scope.restaurantId; const membership=rid?access.membershipFor(rid):null;
  const canManage=Boolean(access.isSuperAdmin||(membership&&membershipHasCapability(membership.role,membership.permission_overrides,"manage_tables")));
  const canConfigure=Boolean(access.isSuperAdmin||(membership&&membershipHasCapability(membership.role,membership.permission_overrides,"manage_restaurant")));
  const [createOpen,setCreateOpen]=useState(false);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [deleteTarget,setDeleteTarget]=useState<Booking|null>(null);
  const [messageTarget,setMessageTarget]=useState<Booking|null>(null);
  const [search,setSearch]=useState("");
  const [view,setView]=useState<"schedule"|"public"|"settings"|"messages">("schedule");
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [selectedDay,setSelectedDay]=useState("");
  const [statusFilter,setStatusFilter]=useState("all");
  const [pageIndex,setPageIndex]=useState(0);

  useEffect(()=>{
    if(routeSearch.create)setCreateOpen(true);
  },[routeSearch.create]);

  const restaurant=useQuery({
    queryKey:["bookings","restaurant",rid],
    enabled:Boolean(rid&&canManage),
    queryFn:async()=>{
      const {data,error}=await supabase.from("restaurants").select("name,slug,currency,timezone,logo_url,cover_image_url").eq("id",rid!).single();
      if(error)throw error;
      return data;
    },
  });

  const timezone=restaurant.data?.timezone||"UTC";
  const day=selectedDay||reservationDay(new Date(),timezone);

  const bookings=useQuery<Booking[]>({
    queryKey:["bookings",rid,day,timezone],
    enabled:Boolean(rid&&canManage&&restaurant.isSuccess),
    staleTime:5_000,refetchInterval:20_000,
    queryFn:async()=>{
      const {data,error}=await (supabase as any).from("table_bookings")
        .select("id,restaurant_id,table_id,customer_name,phone,email,guest_count,booking_at,ends_at,duration_minutes,zone,status,notes,occasion,source,confirmation_code,public_token,deposit_amount,deposit_status,cancel_reason,created_at")
        .eq("restaurant_id",rid)
        .gte("booking_at",restaurantDateTime(day,"00:00",timezone))
        .lt("booking_at",restaurantDateTime(addReservationDays(day,1),"00:00",timezone))
        .order("booking_at",{ascending:true}).limit(500);
      if(error)throw error;
      return (data??[]).map((row:any)=>({...row,deposit_amount:Number(row.deposit_amount??0)})) as Booking[];
    },
  });

  const tables=useQuery<FloorTable[]>({
    queryKey:["bookings","tables",rid],
    enabled:Boolean(rid&&canManage),
    queryFn:async()=>{
      const {data,error}=await (supabase.from("restaurant_tables") as any)
        .select("id,table_number,table_name,zone,capacity,service_status")
        .eq("restaurant_id",rid).eq("is_active",true).order("table_number");
      if(error)throw error;
      return (data??[]) as FloorTable[];
    },
  });

  const settings=useQuery<BookingSettings|null>({
    queryKey:["booking-settings",rid],
    enabled:Boolean(rid&&canManage),
    queryFn:async()=>{
      const {data,error}=await (supabase as any).from("booking_settings").select("*").eq("restaurant_id",rid).maybeSingle();
      if(error)throw error;
      return data as BookingSettings|null;
    },
  });

  useEffect(()=>{
    if(!rid||!canManage)return;
    const refresh=()=>{void qc.invalidateQueries({queryKey:["bookings",rid]});void qc.invalidateQueries({queryKey:["bookings","tables",rid]});};
    const channel=supabase.channel(`bookings:${rid}`)
      .on("postgres_changes",{event:"*",schema:"public",table:"table_bookings",filter:`restaurant_id=eq.${rid}`},refresh)
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"restaurant_tables",filter:`restaurant_id=eq.${rid}`},refresh)
      .subscribe();
    return()=>{void supabase.removeChannel(channel);};
  },[canManage,qc,rid]);

  const transition=useMutation({
    mutationFn:async({id,status,reason}:{id:string;status:BookingStatus;reason?:string|undefined})=>{
      const {error}=await (supabase as any).rpc("transition_booking_status",{_booking_id:id,_next:status,_reason:reason??null});
      if(error)throw error;
    },
    onSuccess:async()=>{await Promise.all([qc.invalidateQueries({queryKey:["bookings",rid]}),qc.invalidateQueries({queryKey:["bookings","tables",rid]})]);toast.success(ar?"تم تحديث الحجز":"Reservation updated");},
    onError:(error)=>toast.error(humanError(error,lang)),
  });

  const deleteReservation=useMutation({
    mutationFn:async(booking:Booking)=>{
      const {data,error}=await (supabase as any).rpc("delete_booking_reservation",{
        _booking_id:booking.id,
        _reason:ar?"تم الحذف من مكتب الحجوزات":"Deleted from Reservation Desk",
      });
      if(error)throw error;
      if(!data)throw new Error(ar?"الحجز غير موجود":"Reservation not found");
    },
    onSuccess:async()=>{
      setDeleteTarget(null);
      await Promise.all([
        qc.invalidateQueries({queryKey:["bookings",rid]}),
        qc.invalidateQueries({queryKey:["bookings","tables",rid]}),
        qc.invalidateQueries({queryKey:["booking-waitlist",rid]}),
      ]);
      toast.success(ar?"تم حذف الحجز":"Reservation deleted");
    },
    onError:(error)=>toast.error(humanError(error,lang)),
  });

  if(scope.isPending||access.isPending)return <div className="min-h-dvh bg-background"><AppHeader/><main className="qs-page"><Skeleton className="h-[560px] rounded-3xl"/></main></div>;
  if(!rid||(!membership&&!access.isSuperAdmin)||!canManage)return <div className="min-h-dvh bg-background"><AppHeader/><main className="qs-page"><section className="qs-card p-10 text-center"><h1 className="font-display text-xl font-bold">{ar?"الحجوزات غير متاحة لهذا الحساب":"Reservations are not available for this account"}</h1><p className="mt-2 text-sm text-muted-foreground">{ar?"تحتاج صلاحية إدارة الطاولات.":"Table-management access is required."}</p></section></main></div>;

  const all=bookings.data??[];
  const needle=search.trim().toLowerCase();
  const dayRows=all.filter(row=>reservationDay(row.booking_at,timezone)===day);
  const active=dayRows.filter(row=>!["completed","cancelled","no_show"].includes(row.status));
  const awaiting=active.filter(row=>row.status==="confirmed"||row.status==="pending");
  const rows=dayRows.filter(row=>(statusFilter==="all"||(statusFilter==="upcoming"?awaiting.includes(row):row.status===statusFilter))&&(!needle||[row.customer_name,row.phone,row.email,row.confirmation_code,row.source].filter(Boolean).join(" ").toLowerCase().includes(needle)));
  const pageCount=Math.max(1,Math.ceil(rows.length/8));
  const currentPage=Math.min(pageIndex,pageCount-1);
  const shown=rows.slice(currentPage*8,currentPage*8+8);
  const selected=all.find(row=>row.id===selectedId)??null;
  const selectedTable=(tables.data??[]).find(row=>row.id===selected?.table_id)??null;
  const messageBooking=messageTarget??selected??all.find(row=>Boolean(row.phone))??null;
  const setDay=(value:string)=>{setSelectedDay(value);setPageIndex(0);};
  const publicUrl=restaurant.data?.slug?`/book/${encodeURIComponent(restaurant.data.slug)}`:null;

  return <div className="min-h-dvh bg-background">
    <AppHeader title={ar?"الحجوزات":"Reservations"}/>
    <main className="qs-page qs-reservations-studio" dir={ar?"rtl":"ltr"}>
      <header className="rs-page-heading">
        <div><h1>{ar?"الحجوزات":"Reservations"}</h1><p>{ar?"ترحيب سلس، من الحجز حتى الجلوس.":"A smooth welcome, from booking to seating."}</p></div>
        <Button disabled={!restaurant.isSuccess||!settings.isSuccess} onClick={()=>setCreateOpen(true)}><Plus className="size-4"/>{ar?"حجز جديد":"Add Booking"}</Button>
      </header>
      <nav className="rs-workspace-tabs" aria-label={ar?"مساحة الحجوزات":"Reservation workspace"}>
        {([["schedule",ar?"الجدول":"Schedule"],["public",ar?"صفحة الحجز العامة":"Public Booking Page"],...(canConfigure?[["settings",ar?"إعدادات الحجز":"Booking Settings"]]:[]),["messages",ar?"الرسائل":"Messages"]] as [typeof view,string][]).map(([key,label])=><button key={key} type="button" aria-current={view===key?"page":undefined} onClick={()=>setView(key)}>{label}</button>)}
      </nav>
      {view==="schedule"?<>
        <div className="rs-subnav"><span>{ar?"الحجوزات":"Reservations"}</span><Link to="/waitlist">{ar?"قائمة الانتظار":"Waitlist"}</Link></div>
        <section className="rs-metrics" aria-label={ar?"ملخص اليوم المحدد":"Selected day summary"}>
          {[[ar?"الحجوزات":"Bookings",dayRows.length,"green"],[ar?"الضيوف المتوقعون":"Expected guests",active.reduce((sum,row)=>sum+row.guest_count,0),"blue"],[ar?"بانتظار الوصول":"Awaiting arrival",awaiting.length,"amber"],[ar?"جالسون":"Seated",active.filter(row=>row.status==="seated").length,"purple"]].map(([label,value,tone])=><div key={String(label)}><i className={`rs-dot ${tone}`}/><span>{label}<strong>{value}</strong></span></div>)}
        </section>
        <div className={cn("rs-schedule-layout",selected&&"has-detail")}>
          <section className="rs-schedule-panel">
            <div className="rs-schedule-toolbar">
              <div className="rs-date-nav"><Button variant="outline" size="icon" aria-label={ar?"اليوم السابق":"Previous day"} onClick={()=>setDay(addReservationDays(day,-1))}><ChevronLeft className="size-4"/></Button><Input type="date" aria-label={ar?"تاريخ الجدول":"Schedule date"} value={day} onChange={e=>{if(e.target.value)setDay(e.target.value);}}/><Button variant="outline" size="icon" aria-label={ar?"اليوم التالي":"Next day"} onClick={()=>setDay(addReservationDays(day,1))}><ChevronRight className="size-4"/></Button><Button variant="outline" onClick={()=>setDay(reservationDay(new Date(),timezone))}>{ar?"اليوم":"Today"}</Button></div>
              <div className="rs-filters">{[["all",ar?"الكل":"All",dayRows.length],["upcoming",ar?"قادمة":"Upcoming",awaiting.length],["seated",ar?"جالسون":"Seated",active.filter(row=>row.status==="seated").length],["pending",ar?"معلقة":"Pending",active.filter(row=>row.status==="pending").length]].map(([key,label,count])=><button key={key} type="button" aria-pressed={statusFilter===key} onClick={()=>{setStatusFilter(String(key));setPageIndex(0);}}>{label}<b>{count}</b></button>)}</div>
              <div className="rs-search"><Search className="size-4"/><Input aria-label={ar?"بحث عن حجز":"Search reservations"} value={search} onChange={e=>{setSearch(e.target.value);setPageIndex(0);}} placeholder={ar?"اسم الضيف، الهاتف أو الرمز":"Guest, phone or code"}/></div>
            </div>
            {bookings.isPending||tables.isPending?<div className="p-5"><Skeleton className="h-72 rounded-xl"/></div>:bookings.isError||tables.isError?<p role="alert" className="p-6 text-sm text-destructive">{humanError(bookings.error??tables.error,lang)}</p>:!rows.length?<div className="rs-empty"><CalendarCheck2 className="size-8"/><h3>{ar?"لا توجد حجوزات":"No reservations found"}</h3><p>{needle? (ar?"جرّب بحثاً آخر.":"Try another search."):(ar?"اختر يوماً آخر أو أضف حجزاً.":"Choose another day or add a booking.")}</p><Button variant="outline" onClick={()=>setCreateOpen(true)}><Plus className="size-4"/>{ar?"حجز جديد":"Add Booking"}</Button></div>:<div className="qs-reservation-table-wrap">
              <div className="qs-reservation-table" role="table" aria-label={ar?"جدول حجوزات الضيوف":"Guest reservation schedule"}>
                <div className="qs-reservation-table-head" role="row">{[ar?"الضيف":"Guest",ar?"الوقت":"Time",ar?"الضيوف":"Guests",ar?"الطاولة":"Table",ar?"الحالة":"Status",ar?"الإجراءات":"Actions"].map(label=><div key={label} role="columnheader">{label}</div>)}</div>
                <div className="qs-reservation-table-body" role="rowgroup">{shown.map(booking=><BookingRow key={booking.id} booking={booking} table={(tables.data??[]).find(row=>row.id===booking.table_id)??null} currency={restaurant.data?.currency??"JOD"} ar={ar} lang={lang} timezone={timezone} selected={selectedId===booking.id} onSelect={()=>setSelectedId(booking.id)} busy={transition.isPending||deleteReservation.isPending} onStatus={(status,reason)=>transition.mutate({id:booking.id,status,reason})} onMessage={()=>setMessageTarget(booking)} onDelete={()=>setDeleteTarget(booking)}/>)}</div>
              </div>
            </div>}
            <footer className="rs-table-footer"><span>{rows.length?`${currentPage*8+1}–${Math.min((currentPage+1)*8,rows.length)} / ${rows.length}`:0} {ar?"حجز":"bookings"}</span><div><Button size="icon" variant="ghost" disabled={currentPage===0} aria-label={ar?"الصفحة السابقة":"Previous page"} onClick={()=>setPageIndex(currentPage-1)}><ChevronLeft className="size-4"/></Button><span>{currentPage+1} / {pageCount}</span><Button size="icon" variant="ghost" disabled={currentPage>=pageCount-1} aria-label={ar?"الصفحة التالية":"Next page"} onClick={()=>setPageIndex(currentPage+1)}><ChevronRight className="size-4"/></Button></div></footer>
          </section>
          {selected?<aside className="rs-detail" aria-label={ar?"تفاصيل الحجز":"Booking details"}>
            <div className="rs-detail-heading"><h2>{ar?"تفاصيل الحجز":"Booking details"}</h2><Button variant="ghost" size="icon" aria-label={ar?"إغلاق التفاصيل":"Close booking details"} onClick={()=>setSelectedId(null)}><X className="size-4"/></Button></div>
            <div className="rs-detail-guest"><span className="qs-reservation-avatar">{selected.customer_name.slice(0,1)}</span><div><strong>{selected.customer_name}</strong><small>{selected.phone??selected.email}</small></div></div>
            <span className={`rs-status rs-status-${selected.status}`}>{statusLabel(selected.status,ar)}</span>
            <div className="rs-detail-lines"><p><CalendarDays className="size-4"/>{new Intl.DateTimeFormat(ar?"ar-JO":"en-JO",{timeZone:timezone,dateStyle:"medium"}).format(new Date(selected.booking_at))}</p><p><Clock3 className="size-4"/>{bookingTimeLabel(selected.booking_at,timezone,ar)} · {selected.duration_minutes} {ar?"دقيقة":"min"}</p><p><UsersRound className="size-4"/>{selected.guest_count} {ar?"ضيوف":"guests"}</p><p><Table2 className="size-4"/>{selectedTable?.table_name??selectedTable?.table_number??(ar?"غير محددة":"Unassigned")} · {selectedTable?.zone??selected.zone??"—"}</p><p className="font-mono text-xs">{selected.confirmation_code}</p></div>
            {selected.notes?<div className="rs-guest-note"><small>{ar?"ملاحظة الضيف":"Guest note"}</small><p>{selected.notes}</p></div>:null}
            <div className="rs-detail-actions">
              {selected.status==="pending"?<Button disabled={transition.isPending} onClick={()=>transition.mutate({id:selected.id,status:"confirmed"})}><CheckCircle2 className="size-4"/>{ar?"تأكيد الحجز":"Confirm booking"}</Button>:null}
              {selected.status==="confirmed"?<Button disabled={transition.isPending} onClick={()=>transition.mutate({id:selected.id,status:"seated"})}><UserRoundCheck className="size-4"/>{ar?"إجلاس الضيف":"Seat guest"}</Button>:null}
              {selected.status==="seated"?<Button disabled={transition.isPending} onClick={()=>transition.mutate({id:selected.id,status:"completed"})}>{ar?"إكمال الزيارة":"Complete visit"}</Button>:null}
              <Button variant="outline" disabled={!selected.phone} onClick={()=>setMessageTarget(selected)}><MessageSquareText className="size-4"/>{ar?"مراسلة الضيف":"Message guest"}</Button>
              {["pending","confirmed"].includes(selected.status)?<Button variant="outline" className="text-destructive" disabled={transition.isPending} onClick={()=>transition.mutate({id:selected.id,status:"cancelled",reason:ar?"ألغاه الموظف":"Cancelled by staff"})}>{ar?"إلغاء الحجز":"Cancel booking"}</Button>:null}
              {selected.status!=="seated"&&selected.deposit_status!=="paid"?<Button variant="ghost" className="text-destructive" disabled={deleteReservation.isPending} onClick={()=>setDeleteTarget(selected)}><Trash2 className="size-4"/>{ar?"حذف الحجز":"Delete booking"}</Button>:null}
            </div>
          </aside>:null}
        </div>
      </>:null}
      {view==="public"?<section className="rs-public-workspace"><div className="rs-public-copy"><Globe2 className="size-6"/><h2>{ar?"صفحة الحجز العامة":"Public Booking Page"}</h2><p>{ar?"رابط واحد يتيح للضيف اختيار الوقت وإرسال الحجز.":"One link for guests to choose their visit and reserve a table."}</p><span className={`rs-status rs-status-${settings.data?.online_enabled?"confirmed":"pending"}`}>{settings.data?.online_enabled?(ar?"تستقبل الحجوزات":"Accepting bookings"):(ar?"الحجز متوقف":"Bookings paused")}</span>{publicUrl?<><Input aria-label={ar?"رابط الحجز العام":"Public booking link"} readOnly value={typeof window!=="undefined"?window.location.origin+publicUrl:publicUrl}/><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>void navigator.clipboard.writeText(window.location.origin+publicUrl).then(()=>toast.success(ar?"تم نسخ الرابط":"Link copied")).catch(()=>toast.error(ar?"تعذر نسخ الرابط":"Could not copy link"))}><Copy className="size-4"/>{ar?"نسخ الرابط":"Copy link"}</Button><Button asChild><a href={publicUrl} target="_blank" rel="noreferrer"><ExternalLink className="size-4"/>{ar?"فتح الصفحة":"Open page"}</a></Button></div></>:null}{canConfigure?<Button variant="ghost" onClick={()=>setView("settings")}><Settings2 className="size-4"/>{ar?"إعدادات الحجز":"Booking Settings"}</Button>:null}</div>{publicUrl?<iframe title={ar?"معاينة صفحة الحجز":"Public booking page preview"} src={publicUrl} className="rs-public-preview"/>:<p>{ar?"رابط المطعم غير متاح":"Restaurant link unavailable"}</p>}</section>:null}
      {view==="settings"&&canConfigure?<BookingSettingsDialog open onOpenChange={()=>setView("schedule")} restaurantId={rid} settings={settings.data} ar={ar} lang={lang} inline/>:null}
      {view==="messages"?<section className="rs-messages-workspace"><div className="rs-message-list"><h2>{ar?"الرسائل":"Messages"}<small>{day}</small></h2>{all.filter(row=>row.phone).map(booking=><button key={booking.id} type="button" aria-pressed={messageBooking?.id===booking.id} onClick={()=>{setSelectedId(booking.id);setMessageTarget(null);}}><span className="qs-reservation-avatar">{booking.customer_name.slice(0,1)}</span><span><strong>{booking.customer_name}</strong><small>{bookingTimeLabel(booking.booking_at,timezone,ar)} · {booking.guest_count} {ar?"ضيوف":"guests"}</small></span></button>)}</div>{messageBooking?<ReservationMessageDialog key={messageBooking.id} booking={messageBooking} restaurantId={rid} ar={ar} lang={lang} timezone={timezone} restaurantName={restaurant.data?.name??""} onOpenChange={()=>{}} inline/>:<div className="rs-empty"><MessageSquareText className="size-8"/><h3>{ar?"لا توجد محادثات بعد":"No conversations yet"}</h3><p>{ar?"أضف حجزاً مع رقم هاتف للبدء.":"Add a booking with a phone number to get started."}</p></div>}</section>:null}
    </main>
    <CreateBookingDialog open={createOpen&&restaurant.isSuccess&&settings.isSuccess} onOpenChange={setCreateOpen} restaurantId={rid} tables={tables.data??[]} settings={settings.data} ar={ar} lang={lang} timezone={timezone}/>
    {canConfigure?<BookingSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} restaurantId={rid} settings={settings.data} ar={ar} lang={lang}/>:null}
    <ReservationMessageDialog
      booking={view==="messages"?null:messageTarget}
      timezone={timezone}
      restaurantName={restaurant.data?.name??""}
      restaurantId={rid}
      ar={ar}
      lang={lang}
      onOpenChange={open=>{if(!open)setMessageTarget(null);}}
    />
    <DeleteReservationDialog
      booking={deleteTarget}
      ar={ar}
      busy={deleteReservation.isPending}
      onOpenChange={open=>{if(!open&&!deleteReservation.isPending)setDeleteTarget(null);}}
      onConfirm={()=>{if(deleteTarget)deleteReservation.mutate(deleteTarget);}}
    />
  </div>;
}

function CreateBookingDialog({open,onOpenChange,restaurantId,tables,settings,ar,lang,timezone}:{open:boolean;onOpenChange:(open:boolean)=>void;restaurantId:string;tables:FloorTable[];settings:BookingSettings|null|undefined;ar:boolean;lang:"ar"|"en";timezone:string}){
  const qc=useQueryClient();
  const [busy,setBusy]=useState(false);
  const initial={date:reservationDay(new Date(Date.now()+60*60_000),timezone),time:new Intl.DateTimeFormat("en-GB",{timeZone:timezone,hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(Date.now()+60*60_000))};
  const [bookingDate,setBookingDate]=useState(initial.date);
  const [bookingTime,setBookingTime]=useState(initial.time);
  const [guests,setGuests]=useState(2);
  const [duration,setDuration]=useState(settings?.default_duration_minutes??90);
  const [selectedTable,setSelectedTable]=useState("auto");
  const [status,setStatus]=useState("pending");
  const [source,setSource]=useState("staff");
  const [zone,setZone]=useState("any");
  useEffect(()=>{if(open){setBookingDate(initial.date);setBookingTime(initial.time);setGuests(settings?.min_party_size&&settings.min_party_size>2?settings.min_party_size:2);setDuration(settings?.default_duration_minutes??90);setSelectedTable("auto");setZone("any");setStatus(settings?.auto_confirm?"confirmed":"pending");}},[open]);
  const bookingAt=bookingDate&&bookingTime?`${bookingDate}T${bookingTime}`:"";

  const available=useQuery<FloorTable[]>({
    queryKey:["booking-available-tables",restaurantId,bookingAt,guests,duration,timezone],
    enabled:open&&Boolean(bookingAt)&&guests>0,
    queryFn:async()=>{
      const at=new Date(restaurantDateTime(bookingDate,bookingTime,timezone));
      const {data,error}=await (supabase as any).rpc("find_available_booking_tables",{
        _restaurant_id:restaurantId,_booking_at:at.toISOString(),_guest_count:guests,_duration_minutes:duration,
      });
      if(error)throw error;
      return (data??[]) as FloorTable[];
    },
  });

  const availableRows=(available.data??[]).filter(row=>zone==="any"||row.zone===zone);
  const bestFit=availableRows[0]??null;
  const chosen=selectedTable==="auto"?bestFit:availableRows.find(row=>row.id===selectedTable)??null;
  const canSubmit=Boolean(bookingAt)&&Boolean(chosen)&&!available.isFetching&&!available.isError&&!busy;

  async function submit(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!canSubmit)return;
    const form=new FormData(event.currentTarget);
    setBusy(true);
    try{
      const at=new Date(restaurantDateTime(bookingDate,bookingTime,timezone));
      const {error}=await (supabase as any).rpc("create_staff_booking",{
        _restaurant_id:restaurantId,
        _customer_name:String(form.get("customer_name")??"").trim(),
        _phone:String(form.get("phone")??"").trim(),
        _email:String(form.get("email")??"").trim(),
        _guest_count:guests,
        _booking_at:at.toISOString(),
        _table_id:chosen?.id??null,
        _duration_minutes:duration,
        _status:status,
        _notes:String(form.get("notes")??"").trim()||null,
        _occasion:String(form.get("occasion")??"").trim()||null,
        _source:source,
      });
      if(error)throw error;
      await Promise.all([
        qc.invalidateQueries({queryKey:["bookings",restaurantId]}),
        qc.invalidateQueries({queryKey:["bookings","tables",restaurantId]}),
      ]);
      toast.success(ar?"تم إنشاء الحجز":"Reservation created");
      onOpenChange(false);
    }catch(error){
      toast.error(humanError(error,lang));
    }finally{
      setBusy(false);
    }
  }

  const dateValue=parseDateOnly(bookingDate);
  const zones=Array.from(new Set(tables.map(row=>row.zone)));
  const quickTimes=Array.from({length:8},(_,i)=>`${String(18+Math.floor(i/2)).padStart(2,"0")}:${i%2?"30":"00"}`);
  return <Dialog open={open} onOpenChange={value=>!busy&&onOpenChange(value)}>
    <DialogContent className="qs-booking-create-dialog rs-create-dialog p-0" onOpenAutoFocus={event=>{if(window.matchMedia("(max-width: 767px)").matches)event.preventDefault();}}>
      <DialogHeader className="rs-form-heading"><div><DialogTitle>{ar?"حجز جديد":"Add booking"}</DialogTitle><DialogDescription>{ar?"بيانات الضيف · الموعد · التأكيد":"Guest · Visit · Confirm"}</DialogDescription></div></DialogHeader>
      <form onSubmit={submit} className="qs-booking-create-form rs-create-form">
        <div className="qs-booking-create-scroll-body rs-create-body">
          <div className="rs-form-guest-grid"><Field label={ar?"اسم الضيف":"Guest name"}><Input name="customer_name" autoComplete="name" required maxLength={120}/></Field><Field label={ar?"رقم الهاتف":"Phone number"}><Input name="phone" inputMode="tel" autoComplete="tel" required={settings?.require_phone??true} maxLength={40} placeholder="+962"/></Field></div>
          <div className="rs-visit-grid">
            <section className="rs-visit-date">
              <div className="qs-booking-guests-field"><Field label={ar?"عدد الضيوف":"Number of guests"}><div className="rs-choice-rail">{[2,3,4,5,6].map(value=><button key={value} type="button" aria-pressed={guests===value} onClick={()=>{setGuests(value);setSelectedTable("auto");}}>{value}</button>)}<Input aria-label={ar?"عدد آخر للضيوف":"Custom guest count"} type="number" min="1" max="100" value={guests} onChange={e=>{setGuests(Number(e.target.value)||1);setSelectedTable("auto");}}/></div></Field></div>
              <div className="qs-booking-date-field"><Field label={ar?"التاريخ":"Date"}><ReservationDatePicker timezone={timezone} value={bookingDate} onChange={value=>{setBookingDate(value);setSelectedTable("auto");}} ar={ar} maxAdvanceDays={settings?.max_advance_days??365}/></Field></div>
              <Calendar mode="single" selected={dateValue} defaultMonth={dateValue??new Date()} onSelect={value=>{if(value){setBookingDate(formatDateOnly(value));setSelectedTable("auto");}}} disabled={{before:parseDateOnly(reservationDay(new Date(),timezone))!,after:parseDateOnly(addReservationDays(reservationDay(new Date(),timezone),settings?.max_advance_days??365))!}} className="rs-inline-calendar"/>
            </section>
            <section className="rs-visit-options">
              <div className="qs-booking-time-field"><Field label={ar?"الوقت":"Time"}><div className="rs-time-slots">{quickTimes.map(time=><button key={time} type="button" aria-pressed={bookingTime===time} onClick={()=>{setBookingTime(time);setSelectedTable("auto");}}>{new Intl.DateTimeFormat(ar?"ar-JO":"en-JO",{hour:"numeric",minute:"2-digit",timeZone:"UTC"}).format(new Date(`2000-01-01T${time}:00Z`))}</button>)}</div><Input aria-label={ar?"وقت مخصص":"Custom booking time"} className="mt-2" type="time" step="60" value={bookingTime} onChange={e=>{setBookingTime(e.target.value);setSelectedTable("auto");}} required/></Field></div>
              <Field label={ar?"منطقة الجلوس":"Seating area"}><div className="rs-choice-rail rs-zone-rail">{["any",...zones].map(value=><button key={value} type="button" aria-pressed={zone===value} onClick={()=>{setZone(value);setSelectedTable("auto");}}>{value==="any"?(ar?"أي منطقة":"Any area"):value}</button>)}</div></Field>
              <Field label={ar?"الطاولة":"Table"}><Select value={selectedTable} onValueChange={setSelectedTable}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="auto">{ar?"أفضل طاولة تلقائياً":"Auto-assign best fit"}</SelectItem>{availableRows.map(table=><SelectItem key={table.id} value={table.id}>{table.table_name??`#${table.table_number}`} · {table.capacity} {ar?"مقاعد":"seats"}</SelectItem>)}</SelectContent></Select></Field>
              <div className="rs-live-availability" role="status">{available.isFetching?(ar?"جارٍ فحص التوفر…":"Checking availability…"):available.isError?<span className="text-destructive">{humanError(available.error,lang)}</span>:chosen?<span><CheckCircle2 className="size-4"/>{availableRows.length} {ar?"طاولات متاحة":"tables available"} · {chosen.table_name??`#${chosen.table_number}`}</span>:<span className="text-amber-700">{ar?"لا توجد طاولة مناسبة. اختر وقتاً أو منطقة أخرى.":"No suitable table. Try another time or area."}</span>}</div>
              <Field label={ar?"طلبات خاصة (اختياري)":"Special requests (optional)"}><Textarea name="notes" maxLength={1000} rows={2}/></Field>
            </section>
          </div>
          <details className="rs-optional-fields" open={settings?.require_email}><summary>{ar?"خيارات إضافية":"Additional details"}</summary><div className="rs-form-guest-grid mt-3"><Field label={ar?"البريد الإلكتروني":"Email"}><Input name="email" type="email" autoComplete="email" required={settings?.require_email??false} maxLength={160}/></Field><Field label={ar?"المناسبة":"Occasion"}><Input name="occasion" maxLength={120}/></Field><Field label={ar?"الحالة":"Status"}><Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="pending">{statusLabel("pending",ar)}</SelectItem><SelectItem value="confirmed">{statusLabel("confirmed",ar)}</SelectItem></SelectContent></Select></Field><Field label={ar?"المصدر":"Source"}><Select value={source} onValueChange={setSource}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="staff">{ar?"موظف":"Staff"}</SelectItem><SelectItem value="phone">{ar?"هاتف":"Phone"}</SelectItem><SelectItem value="walk_in">{ar?"حضور مباشر":"Walk-in"}</SelectItem></SelectContent></Select></Field></div></details>
          <div className="qs-booking-duration-rail rs-duration"><Field label={ar?"مدة الزيارة":"Visit duration"}><Select value={String(duration)} onValueChange={v=>{setDuration(Number(v));setSelectedTable("auto");}}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{[30,60,90,120,150,180,240,300,360].map(value=><SelectItem key={value} value={String(value)}>{value} {ar?"دقيقة":"min"}</SelectItem>)}</SelectContent></Select></Field></div>
        </div>
        <DialogFooter className="qs-booking-create-footer rs-form-footer"><span><UsersRound className="size-4"/>{guests} {ar?"ضيوف":"guests"} · {bookingTime} · {chosen?.table_name??chosen?.table_number??"—"}</span><div><Button type="button" variant="outline" disabled={busy} onClick={()=>onOpenChange(false)}>{ar?"إلغاء":"Cancel"}</Button><Button type="submit" disabled={!canSubmit}>{busy?(ar?"جارٍ الحفظ…":"Saving…"):(ar?"إنشاء الحجز":"Create booking")}</Button></div></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

function SectionHeading({number,title,subtitle}:{number:string;title:string;subtitle:string}){
  return <div className="flex items-start gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-lg bg-orange-500/10 text-xs font-black text-[#e34d00]">{number}</span><div><h3 className="text-sm font-black">{title}</h3><p className="mt-0.5 text-xs leading-5 text-muted-foreground">{subtitle}</p></div></div>;
}

function SummaryLine({label,value}:{label:string;value:string}){
  return <div className="flex items-center justify-between gap-3"><span className="text-xs text-muted-foreground">{label}</span><strong className="text-end text-xs">{value}</strong></div>;
}

function BookingSettingsDialog({open,onOpenChange,restaurantId,settings,ar,lang,inline=false}:{open:boolean;onOpenChange:(open:boolean)=>void;restaurantId:string;settings:BookingSettings|null|undefined;ar:boolean;lang:"ar"|"en";inline?:boolean}){
  const qc=useQueryClient();
  const [pane,setPane]=useState("availability");
  const [hours,setHours]=useState<WeeklyHours>(settings?.weekly_hours??defaultBookingHours());
  const [requirePhone,setRequirePhone]=useState(settings?.require_phone??true);
  const [requireEmail,setRequireEmail]=useState(settings?.require_email??false);
  const [online,setOnline]=useState(settings?.online_enabled??true);
  const [autoConfirm,setAutoConfirm]=useState(settings?.auto_confirm??false);
  const [slot,setSlot]=useState(settings?.slot_minutes??30);
  const [duration,setDuration]=useState(settings?.default_duration_minutes??90);
  const [lead,setLead]=useState(settings?.min_lead_minutes??60);
  const [advance,setAdvance]=useState(settings?.max_advance_days??90);
  const [minParty,setMinParty]=useState(settings?.min_party_size??1);
  const [maxParty,setMaxParty]=useState(settings?.max_party_size??12);
  const [depositMode,setDepositMode]=useState<"none"|"fixed"|"per_guest">(settings?.deposit_mode??"none");
  const [deposit,setDeposit]=useState(Number(settings?.deposit_amount??0));
  const [terms,setTerms]=useState(settings?.terms??"");
  const [confirmationChannel,setConfirmationChannel]=useState(settings?.confirmation_channel==="sms"?"none":settings?.confirmation_channel??"none");
  const [reminderChannel,setReminderChannel]=useState(settings?.reminder_channel==="sms"?"none":settings?.reminder_channel??"none");
  const [reminderHours,setReminderHours]=useState(settings?.reminder_hours??24);
  const [cancelCutoff,setCancelCutoff]=useState(settings?.cancellation_cutoff_hours??2);

  useEffect(()=>{if(open&&settings){setHours(settings.weekly_hours??defaultBookingHours());setRequirePhone(settings.require_phone);setRequireEmail(settings.require_email);setOnline(settings.online_enabled);setAutoConfirm(settings.auto_confirm);setSlot(settings.slot_minutes);setDuration(settings.default_duration_minutes);setLead(settings.min_lead_minutes);setAdvance(settings.max_advance_days);setMinParty(settings.min_party_size);setMaxParty(settings.max_party_size);setDepositMode(settings.deposit_mode);setDeposit(Number(settings.deposit_amount));setTerms(settings.terms??"");setConfirmationChannel(settings.confirmation_channel==="sms"?"none":settings.confirmation_channel??"none");setReminderChannel(settings.reminder_channel==="sms"?"none":settings.reminder_channel??"none");setReminderHours(settings.reminder_hours??24);setCancelCutoff(settings.cancellation_cutoff_hours??2);}},[open,settings]);

  const save=useMutation({
    mutationFn:async()=>{
      if(!validateBookingHours(hours))throw new Error(ar?"اختر وقت إغلاق بعد وقت الفتح لكل يوم.":"Closing time must be after opening time for each day.");
      if(!Number.isInteger(minParty)||!Number.isInteger(maxParty)||minParty<1||maxParty<minParty||maxParty>100||duration<30||duration>360||advance<1||advance>365||lead<0||reminderHours<1||reminderHours>168||cancelCutoff<0||cancelCutoff>168||deposit<0)throw new Error(ar?"راجع حدود الحجز والقيم المدخلة.":"Review booking limits and entered values.");
      const {error}=await (supabase as any).from("booking_settings").upsert({
        restaurant_id:restaurantId,weekly_hours:hours,require_phone:requirePhone,require_email:requireEmail,online_enabled:online,auto_confirm:autoConfirm,slot_minutes:slot,
        default_duration_minutes:duration,min_lead_minutes:lead,max_advance_days:advance,min_party_size:minParty,max_party_size:maxParty,
        deposit_mode:depositMode,deposit_amount:Math.max(0,deposit),terms:terms.trim()||null,
        confirmation_channel:confirmationChannel,reminder_channel:reminderChannel,
        reminder_hours:Math.max(1,reminderHours),cancellation_cutoff_hours:Math.max(0,cancelCutoff),
      },{onConflict:"restaurant_id"});
      if(error)throw error;
    },
    onSuccess:async()=>{await qc.invalidateQueries({queryKey:["booking-settings",restaurantId]});toast.success(ar?"تم حفظ إعدادات الحجز":"Booking settings saved");if(!inline)onOpenChange(false);},
    onError:(error)=>toast.error(humanError(error,lang)),
  });

  const content=<div className="rs-settings-panel qs-booking-settings-dialog">
    <div className="rs-settings-heading"><div><h2>{ar?"إعدادات الحجز":"Booking settings"}</h2><p>{ar?"التوفر · قواعد الحجز · الإشعارات":"Availability · booking rules · notifications"}</p></div><Button disabled={save.isPending||settings===undefined} onClick={()=>save.mutate()}>{save.isPending?(ar?"جارٍ الحفظ…":"Saving…"):(ar?"حفظ التغييرات":"Save changes")}</Button></div>
    <div className="rs-settings-layout"><nav aria-label={ar?"أقسام الإعدادات":"Settings sections"} className="rs-settings-nav">{[["availability",ar?"التوفر":"Availability"],["rules",ar?"قواعد الحجز":"Booking rules"],["notifications",ar?"الإشعارات":"Notifications"],["deposits",ar?"العربون والشروط":"Deposits & terms"]].map(([key,label])=><button key={key} type="button" aria-current={pane===key?"page":undefined} onClick={()=>setPane(key)}>{label}</button>)}</nav>
      <div className="qs-booking-settings-body rs-settings-content">
        <section className="qs-booking-settings-section" hidden={pane!=="availability"}>
          <div className="qs-booking-settings-section-head">
            <span><Globe2 className="size-4"/></span>
            <div><strong>{ar?"التوفر العام":"Availability"}</strong><p>{ar?"تحكم بكيفية استقبال الحجوزات الجديدة.":"Control how new reservations enter the system."}</p></div>
          </div>
          <div className="rs-weekly-hours">
            {["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].map((label,index)=>{const key=String(index),row=hours[key]??{closed:true,open:"12:00",close:"23:00"};return <div className="rs-weekday" key={key}><span>{ar?["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"][index]:label}</span><button type="button" role="switch" aria-checked={!row.closed} aria-label={`${label} ${ar?"الحجوزات":"bookings"}`} className="rs-switch" onClick={()=>setHours({...hours,[key]:{...row,closed:!row.closed}})}><i/></button><Input type="time" aria-label={`${label} ${ar?"وقت الفتح":"opening time"}`} disabled={Boolean(row.closed)} value={row.open??"12:00"} onChange={e=>setHours({...hours,[key]:{...row,open:e.target.value}})}/><span>–</span><Input type="time" aria-label={`${label} ${ar?"وقت الإغلاق":"closing time"}`} disabled={Boolean(row.closed)} value={row.close??"23:00"} onChange={e=>setHours({...hours,[key]:{...row,close:e.target.value}})}/></div>;})}
          </div>
          <div className="qs-booking-settings-toggle-grid">
            <Toggle label={ar?"الحجز العام":"Public booking"} value={online} onChange={setOnline}/>
            <Toggle label={ar?"تأكيد تلقائي":"Auto-confirm"} value={autoConfirm} onChange={setAutoConfirm}/><Toggle label={ar?"الهاتف مطلوب":"Require phone"} value={requirePhone} onChange={setRequirePhone}/><Toggle label={ar?"البريد مطلوب":"Require email"} value={requireEmail} onChange={setRequireEmail}/>
          </div>
        </section>

        <section className="qs-booking-settings-section" hidden={pane!=="rules"}>
          <div className="qs-booking-settings-section-head">
            <span><Clock3 className="size-4"/></span>
            <div><strong>{ar?"قواعد الوقت والسعة":"Timing & capacity"}</strong><p>{ar?"اضبط الفترات والمدة ومهلة الحجز وحدود عدد الضيوف.":"Set slots, duration, booking windows and party limits."}</p></div>
          </div>
          <div className="qs-booking-settings-grid">
            <Field label={ar?"مدة الفترة":"Slot minutes"}><Select value={String(slot)} onValueChange={v=>setSlot(Number(v))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{[15,30,45,60].map(v=><SelectItem key={v} value={String(v)}>{v}</SelectItem>)}</SelectContent></Select></Field>
            <Field label={ar?"مدة الحجز":"Default duration"}><Input inputMode="numeric" type="number" min="30" max="360" step="15" value={duration} onChange={e=>setDuration(Number(e.target.value)||90)}/></Field>
            <Field label={ar?"مهلة قبل الحجز":"Lead minutes"}><Input inputMode="numeric" type="number" min="0" value={lead} onChange={e=>setLead(Number(e.target.value)||0)}/></Field>
            <Field label={ar?"أيام الحجز المسبق":"Advance days"}><Input inputMode="numeric" type="number" min="1" max="365" value={advance} onChange={e=>setAdvance(Number(e.target.value)||90)}/></Field>
            <Field label={ar?"أقل عدد ضيوف":"Min party"}><Input inputMode="numeric" type="number" min="1" value={minParty} onChange={e=>setMinParty(Number(e.target.value)||1)}/></Field>
            <Field label={ar?"أكبر عدد ضيوف":"Max party"}><Input inputMode="numeric" type="number" min={minParty} max="100" value={maxParty} onChange={e=>setMaxParty(Number(e.target.value)||12)}/></Field>
          </div>
        </section>

        <section className="qs-booking-settings-section" hidden={pane!=="notifications"}>
          <div className="qs-booking-settings-section-head">
            <span><MessageSquareText className="size-4"/></span>
            <div><strong>{ar?"تواصل الضيف":"Guest messaging"}</strong><p>{ar?"اختر قنوات التأكيد والتذكير ومواعيدها.":"Choose confirmation and reminder channels and timing."}</p></div>
          </div>
          <div className="qs-booking-settings-grid">
            <Field label={ar?"قناة تأكيد الحجز":"Confirmation channel"}><Select value={confirmationChannel} onValueChange={setConfirmationChannel}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">{ar?"بدون رسالة":"No message"}</SelectItem><SelectItem value="whatsapp">WhatsApp</SelectItem><SelectItem value="email">Email</SelectItem></SelectContent></Select></Field>
            <Field label={ar?"قناة التذكير":"Reminder channel"}><Select value={reminderChannel} onValueChange={setReminderChannel}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">{ar?"بدون تذكير":"No reminder"}</SelectItem><SelectItem value="whatsapp">WhatsApp</SelectItem><SelectItem value="email">Email</SelectItem></SelectContent></Select></Field>
            <Field label={ar?"التذكير قبل الموعد بالساعات":"Reminder hours before"}><Input inputMode="numeric" type="number" min="1" max="168" value={reminderHours} onChange={e=>setReminderHours(Number(e.target.value)||24)}/></Field>
            <Field label={ar?"مهلة الإلغاء بالساعات":"Cancellation cutoff hours"}><Input inputMode="numeric" type="number" min="0" max="168" value={cancelCutoff} onChange={e=>setCancelCutoff(Number(e.target.value)||0)}/></Field>
          </div>
          <div className="qs-booking-settings-note">{ar?"اختر طريقة إرسال التأكيدات والتذكيرات، أو راسل الضيف مباشرة من الحجز.":"Choose how guests receive confirmations and reminders. You can also message a guest directly from their booking."}</div>
        </section>

        <section className="qs-booking-settings-section" hidden={pane!=="deposits"}>
          <div className="qs-booking-settings-section-head">
            <span><BadgeDollarSign className="size-4"/></span>
            <div><strong>{ar?"العربون والشروط":"Deposits & terms"}</strong><p>{ar?"حدد سياسة العربون والشروط التي تظهر للحجز.":"Define the deposit policy and booking terms."}</p></div>
          </div>
          <div className="qs-booking-settings-grid">
            <Field label={ar?"نظام العربون":"Deposit mode"}><Select value={depositMode} onValueChange={v=>setDepositMode(v as typeof depositMode)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">{ar?"بدون عربون":"No deposit"}</SelectItem><SelectItem value="fixed">{ar?"مبلغ ثابت":"Fixed amount"}</SelectItem><SelectItem value="per_guest">{ar?"لكل ضيف":"Per guest"}</SelectItem></SelectContent></Select></Field>
            <Field label={ar?"قيمة العربون":"Deposit amount"}><Input inputMode="decimal" type="number" min="0" step="0.001" disabled={depositMode==="none"} value={deposit} onChange={e=>setDeposit(Number(e.target.value)||0)}/></Field>
          </div>
          <Field label={ar?"شروط الحجز":"Booking terms"}><Textarea className="qs-booking-settings-terms" rows={4} maxLength={2000} value={terms} onChange={e=>setTerms(e.target.value)} placeholder={ar?"سياسة التأخير، الإلغاء، العربون...":"Late arrival, cancellation and deposit policy..."}/></Field>
        </section>
      </div>

    </div>
    <div className="qs-booking-settings-footer rs-settings-footer"><p>{ar?"تطبق أوقات التوفر حسب المنطقة الزمنية للمطعم.":"Availability uses the restaurant timezone."}</p><Button variant="outline" disabled={save.isPending} onClick={()=>onOpenChange(false)}>{ar?"رجوع للجدول":"Back to schedule"}</Button></div>
  </div>;
  if(inline)return content;
  return <Dialog open={open} onOpenChange={value=>!save.isPending&&onOpenChange(value)}><DialogContent className="rs-settings-modal p-0" onOpenAutoFocus={event=>{if(window.matchMedia("(max-width: 767px)").matches)event.preventDefault();}}><DialogHeader className="sr-only"><DialogTitle>{ar?"إعدادات الحجز":"Booking settings"}</DialogTitle><DialogDescription>{ar?"إعدادات الحجز للمطعم":"Restaurant booking settings"}</DialogDescription></DialogHeader>{content}</DialogContent></Dialog>;
}

function BookingRow({booking,table,currency,ar,lang,busy,onStatus,onMessage,onDelete,timezone,selected,onSelect}:{booking:Booking;table:FloorTable|null;currency:string;ar:boolean;lang:"ar"|"en";busy:boolean;onStatus:(status:BookingStatus,reason?:string)=>void;onMessage:()=>void;onDelete:()=>void;timezone:string;selected:boolean;onSelect:()=>void}){
  const at=new Date(booking.booking_at);
  const dateLabel=new Intl.DateTimeFormat(ar?"ar-JO":"en-JO",{month:"short",day:"numeric",year:"numeric",timeZone:timezone}).format(at);
  const timeLabel=new Intl.DateTimeFormat(ar?"ar-JO":"en-JO",{hour:"numeric",minute:"2-digit",timeZone:timezone}).format(at);
  const tableLabel=table?(table.table_name??`#${table.table_number}`):(ar?"غير محددة":"Unassigned");
  const zoneLabel=table?.zone??booking.zone??(ar?"تعيين تلقائي":"Auto assign");
  const canDelete=booking.status!=="seated"&&booking.deposit_status!=="paid";
  const canCancel=booking.status==="pending"||booking.status==="confirmed";

  return <article className={cn("qs-reservation-row",selected&&"is-selected")} role="row" onClick={onSelect}>
    <div className="qs-reservation-cell qs-reservation-guest" role="cell" data-label={ar?"الضيف":"Guest"}>
      <div className="qs-reservation-guest-head">
        <span className="qs-reservation-avatar">{booking.customer_name.trim().slice(0,1).toUpperCase()||"G"}</span>
        <span className="min-w-0 flex-1">
          <button type="button" className="qs-reservation-guest-name" aria-label={`${ar?"تفاصيل حجز":"Booking details for"} ${booking.customer_name}`} onClick={onSelect}>{booking.customer_name}</button>
          <small>{booking.phone??booking.email??(ar?"لا توجد وسيلة اتصال":"No contact")}</small>
        </span>
        <span className="qs-reservation-mobile-status"><span className={`rs-status rs-status-${booking.status}`}>{statusLabel(booking.status,ar)}</span></span>
      </div>
      <div className="qs-reservation-meta-line">
        <span>{ar?"رمز":"Code"} <b>{booking.confirmation_code}</b></span>
        <span>{booking.source}</span>
      </div>
    </div>

    <div className="qs-reservation-cell qs-reservation-time" role="cell" data-label={ar?"الموعد":"Date & time"}>
      <strong>{timeLabel}</strong>
      <span>{dateLabel} · {booking.duration_minutes} {ar?"د":"min"}</span>
    </div>

    <div className="qs-reservation-cell qs-reservation-party" role="cell" data-label={ar?"الضيوف":"Guests"}>
      <strong><UsersRound className="size-3.5"/>{booking.guest_count}</strong>
      <span>{booking.occasion??(ar?"زيارة عادية":"Standard visit")}</span>
    </div>

    <div className="qs-reservation-cell qs-reservation-table-cell" role="cell" data-label={ar?"الطاولة":"Table"}>
      <strong>{tableLabel}</strong>
      <span>{zoneLabel}</span>
    </div>

    <div className="qs-reservation-cell qs-reservation-status" role="cell" data-label={ar?"الحالة":"Status"}>
      <span className={`rs-status rs-status-${booking.status}`}>{statusLabel(booking.status,ar)}</span>
      {booking.deposit_amount>0?<span className="qs-reservation-deposit">{ar?"عربون":"Deposit"} · {formatMoney(booking.deposit_amount,currency,lang)}</span>:null}
      {booking.cancel_reason?<span className="qs-reservation-warning">{booking.cancel_reason}</span>:null}
    </div>

    <div className="qs-reservation-cell qs-reservation-actions" role="cell" data-label={ar?"الإجراءات":"Actions"}>
      <div className="qs-reservation-primary-actions">
        <Button size="icon" variant="outline" disabled={busy||!booking.phone} aria-label={`${ar?"مراسلة":"Message"} ${booking.customer_name}`} onClick={event=>{event.stopPropagation();onMessage();}}><MessageSquareText className="size-4"/></Button>
      </div>
      {(booking.status==="confirmed"||canCancel||canDelete)?<DropdownMenu>
        <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="qs-reservation-more" disabled={busy} aria-label={ar?"إجراءات إضافية":"More reservation actions"}><MoreHorizontal className="size-4"/></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          {booking.status==="confirmed"?<DropdownMenuItem onSelect={()=>onStatus("no_show")}><XCircle/>{ar?"لم يحضر":"No-show"}</DropdownMenuItem>:null}
          {canCancel?<DropdownMenuItem onSelect={()=>onStatus("cancelled",ar?"ألغاه الموظف":"Cancelled by staff")}><XCircle/>{ar?"إلغاء الحجز":"Cancel reservation"}</DropdownMenuItem>:null}
          {canDelete?<DropdownMenuItem className="text-red-600 focus:text-red-700" onSelect={onDelete}><Trash2/>{ar?"حذف":"Delete"}</DropdownMenuItem>:null}
        </DropdownMenuContent>
      </DropdownMenu>:null}
    </div>

    {booking.notes?<p className="qs-reservation-row-note">{booking.notes}</p>:null}
  </article>;
}

type BookingMessage={
  id:string;direction:"inbound"|"outbound";channel:"sms"|"whatsapp";body:string;
  provider_status:string;last_error:string|null;sent_at:string|null;received_at:string|null;created_at:string;
};

function ReservationMessageDialog({booking,restaurantId,ar,lang,onOpenChange,inline=false,timezone,restaurantName}:{booking:Booking|null;restaurantId:string;ar:boolean;lang:"ar"|"en";onOpenChange:(open:boolean)=>void;inline?:boolean;timezone:string;restaurantName:string}){
  const qc=useQueryClient();
  const channel="whatsapp" as const;
  const [body,setBody]=useState("");
  const template=(kind:string)=>{
    if(!booking)return "";
    const time=bookingTimeLabel(booking.booking_at,timezone,ar);
    const date=new Intl.DateTimeFormat(ar?"ar-JO":"en-JO",{timeZone:timezone,dateStyle:"medium"}).format(new Date(booking.booking_at));
    const link=typeof window!=="undefined"?`${window.location.origin}/booking/${booking.public_token}`:"";
    if(kind==="cancellation")return ar?`مرحباً ${booking.customer_name}، تم إلغاء حجزك في ${restaurantName} بتاريخ ${date} الساعة ${time}. تواصل معنا إذا احتجت مساعدة.`:`Hi ${booking.customer_name}, your booking at ${restaurantName} on ${date} at ${time} has been cancelled. Please contact us if you need help.`;
    if(kind==="reminder")return ar?`مرحباً ${booking.customer_name}، تذكير بحجزك لـ ${booking.guest_count} ضيوف في ${restaurantName} بتاريخ ${date} الساعة ${time}. ${link}`:`Hi ${booking.customer_name}, a reminder of your reservation for ${booking.guest_count} guests at ${restaurantName} on ${date} at ${time}. ${link}`;
    const confirmed=["confirmed","seated","completed"].includes(booking.status);
    return ar?`مرحباً ${booking.customer_name}، ${confirmed?"حجزك مؤكد":"تم استلام حجزك وهو قيد التأكيد"} لـ ${booking.guest_count} ضيوف في ${restaurantName} بتاريخ ${date} الساعة ${time}. ${link}`:`Hi ${booking.customer_name}, your booking for ${booking.guest_count} guests at ${restaurantName} on ${date} at ${time} ${confirmed?"is confirmed":"has been received and is awaiting confirmation"}. ${link}`;
  };
  useEffect(()=>{setBody("");},[booking?.id]);

  const providerStatus=useQuery<{
    whatsapp:{configured:boolean;mode:"provider"|"handoff"};
  }>({
    queryKey:["booking-messaging-provider-status"],
    enabled:Boolean(booking),
    staleTime:60_000,
    queryFn:async()=>{
      const {data,error}=await supabase.functions.invoke("quickserve-booking-messaging",{
        body:{action:"status"},
      });
      if(error)throw error;
      if(data?.error)throw new Error(String(data.error));
      return data.providers;
    },
  });

  const messages=useQuery<BookingMessage[]>({
    queryKey:["booking-messages",booking?.id],
    enabled:Boolean(booking?.id),
    refetchInterval:8_000,
    queryFn:async()=>{
      const {data,error}=await (supabase as any).from("booking_messages")
        .select("id,direction,channel,body,provider_status,last_error,sent_at,received_at,created_at")
        .eq("restaurant_id",restaurantId)
        .eq("booking_id",booking!.id)
        .order("created_at",{ascending:true})
        .limit(200);
      if(error)throw error;
      return ((data??[]) as BookingMessage[]).filter(row=>row.channel==="whatsapp");
    },
  });

  const send=useMutation({
    mutationFn:async()=>{
      if(!booking)throw new Error("Reservation unavailable");
      const message=body.trim();
      const {data,error}=await supabase.functions.invoke("quickserve-booking-messaging",{
        body:{bookingId:booking.id,channel,message},
      });
      if(error)throw error;
      if(data?.error)throw new Error(String(data.error));
      return data as {ok?:boolean;status?:string;messageId?:string};
    },
    onSuccess:async(result)=>{
      setBody("");
      await qc.invalidateQueries({queryKey:["booking-messages",booking?.id]});
      toast.success(
        ar
          ? `تم إرسال الرسالة إلى مزود الخدمة · ${result?.status??"sent"}`
          : `Message accepted by provider · ${result?.status??"sent"}`,
      );
    },
    onError:async(error)=>{
      await qc.invalidateQueries({queryKey:["booking-messages",booking?.id]});
      toast.error(ar?"تعذر الإرسال التلقائي. استخدم زر فتح WhatsApp للإرسال مباشرة من حسابك.":"Automatic WhatsApp delivery failed. Use Open WhatsApp to send directly from your account.");
    },
  });

  const whatsappLink=booking?.phone?buildWhatsAppLink(booking.phone,body):null;
  const whatsappConfigured=providerStatus.data?.whatsapp.configured===true;

  async function recordWhatsAppHandoff(){
    if(!booking)return;
    try{
      await (supabase as any).rpc("record_booking_whatsapp_handoff",{
        _booking_id:booking.id,
        _body_length:body.trim().length,
      });
    }catch{}
  }

  async function openWhatsApp(){
    if(!whatsappLink)return;
    window.open(whatsappLink,"_blank","noopener,noreferrer");
    await recordWhatsAppHandoff();
    toast.success(ar?"تم فتح WhatsApp والرسالة جاهزة. اضغط إرسال داخل WhatsApp لإيصالها.":"WhatsApp opened with the message ready. Press Send in WhatsApp to deliver it.");
  }

  async function handlePrimarySend(){
    if(!whatsappConfigured){
      await openWhatsApp();
      return;
    }
    send.mutate();
  }

  const content=<div className="rs-message-thread">
    <header className="rs-thread-heading"><span className="qs-reservation-avatar">{booking?.customer_name.slice(0,1)}</span><div><strong>{booking?.customer_name}</strong><small>{booking?.phone??(ar?"بدون هاتف":"No phone")}</small></div><span className="rs-whatsapp-label">WhatsApp</span></header>
    {booking?<div className="rs-booking-capsule"><CalendarDays className="size-4"/>{new Intl.DateTimeFormat(ar?"ar-JO":"en-JO",{timeZone:timezone,dateStyle:"medium"}).format(new Date(booking.booking_at))} · {bookingTimeLabel(booking.booking_at,timezone,ar)} · {booking.guest_count} {ar?"ضيوف":"guests"}</div>:null}
      <div className="min-h-0 flex-1 overflow-y-auto rs-message-history p-4 sm:p-5">
        {messages.isPending?<Skeleton className="h-64 rounded-2xl"/>
          :messages.isError?<div className="rounded-xl bg-red-500/10 p-3 text-sm text-red-700">{humanError(messages.error,lang)}</div>
          :(messages.data??[]).length===0?<div className="grid min-h-52 place-items-center text-center"><div><MessageSquareText className="mx-auto size-8 text-muted-foreground"/><p className="mt-2 text-sm font-semibold">{ar?"ابدأ المحادثة مع الضيف":"Start the guest conversation"}</p><p className="mt-1 text-xs text-muted-foreground">{ar?"تظهر هنا الرسائل الواردة عبر حساب WhatsApp المتصل.":"Messages received through your connected WhatsApp account appear here."}</p></div></div>
          :<div className="space-y-2">{(messages.data??[]).map(message=><div key={message.id} className={cn("flex",message.direction==="outbound"?"justify-end":"justify-start")}><div className={cn("max-w-[84%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm",message.direction==="outbound"?"rounded-ee-md bg-orange-500/10 text-foreground":"rounded-es-md border border-border bg-card text-foreground")}><p className="whitespace-pre-wrap leading-5">{message.body}</p><div className={cn("mt-1.5 flex flex-wrap items-center gap-2 text-[9px]",message.direction==="outbound"?"text-muted-foreground":"text-muted-foreground")}><span>{message.channel.toUpperCase()}</span><span>{new Date(message.created_at).toLocaleString(ar?"ar-JO":"en-JO",{hour:"2-digit",minute:"2-digit",month:"short",day:"numeric"})}</span><span className="capitalize">{message.provider_status}</span>{message.last_error?<span className="text-red-500">{friendlyBookingMessageError(message.last_error,ar)}</span>:null}</div></div></div>)}</div>}
      </div>

      <div className="qs-reservation-message-composer border-t border-border bg-card p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="qs-whatsapp-channel-pill">WhatsApp</span>
          <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-bold",whatsappConfigured?"bg-emerald-500/10 text-emerald-700":"bg-amber-500/10 text-amber-700")}>
            {providerStatus.isPending?(ar?"فحص الاتصال…":"Checking provider…"):whatsappConfigured?(ar?"الإرسال التلقائي جاهز":"Automatic ready"):(ar?"وضع WhatsApp المباشر":"Direct WhatsApp mode")}
          </span>
        </div>
        <div className="rs-template-rail">{[["confirmation",ar?"التأكيد":"Confirmation"],["reminder",ar?"تذكير":"Reminder"],["cancellation",ar?"إلغاء":"Cancellation"]].map(([key,label])=><button key={key} type="button" disabled={key==="cancellation"&&booking?.status!=="cancelled"} onClick={()=>setBody(template(key))}>{label}</button>)}</div>
        <span className="rs-draft-label">{ar?"مسودة":"Draft"}</span>
        <Textarea rows={3} maxLength={2000} value={body} onChange={e=>setBody(e.target.value)} placeholder={ar?"اكتب رسالة للضيف…":"Write a message to the guest…"}/>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-sm text-[10px] font-semibold leading-4 text-muted-foreground">
            {ar?"راجع الرسالة وأرسلها في WhatsApp.":"Review and send in WhatsApp."}
          </p>
          <div className="flex items-center gap-2">
            {whatsappConfigured?<Button type="button" variant="outline" disabled={!whatsappLink||body.trim().length===0} onClick={()=>void openWhatsApp()}><ExternalLink className="size-4"/>{ar?"فتح WhatsApp":"Open WhatsApp"}</Button>:null}
            <Button disabled={send.isPending||providerStatus.isPending||body.trim().length===0||!booking?.phone} aria-label={!whatsappConfigured?(ar?"إرسال عبر WhatsApp":"Send via WhatsApp"):undefined} onClick={()=>void handlePrimarySend()}>
              {!whatsappConfigured?<ExternalLink className="size-4"/>:<Send className="size-4"/>}
              {send.isPending?(ar?"جارٍ الإرسال…":"Sending…"):!whatsappConfigured?(ar?"فتح WhatsApp":"Open WhatsApp"):(ar?"إرسال":"Send")}
            </Button>
          </div>
        </div>
      </div>
  </div>;
  if(inline)return content;
  return <Dialog open={Boolean(booking)} onOpenChange={onOpenChange}><DialogContent className="qs-reservation-message-dialog rs-message-modal p-0"><DialogHeader className="sr-only"><DialogTitle>{ar?"رسائل الحجز":"Booking messages"}</DialogTitle><DialogDescription>{booking?.customer_name}</DialogDescription></DialogHeader>{content}</DialogContent></Dialog>;
}

function friendlyBookingMessageError(value:string,ar:boolean){
  if(/credentials are not configured/i.test(value))return ar?"مزود WhatsApp غير متصل":"WhatsApp provider not connected";
  return value;
}
function normalizeWhatsAppPhone(value:string){
  let digits=value.replace(/\D/g,"");
  if(digits.startsWith("00"))digits=digits.slice(2);
  if(digits.startsWith("0")&&digits.length>=9)digits="962"+digits.slice(1);
  return digits;
}
function buildWhatsAppLink(phone:string,message:string){
  const digits=normalizeWhatsAppPhone(phone);
  if(digits.length<8)return null;
  return "https://wa.me/"+digits+"?text="+encodeURIComponent(message.trim());
}

function ReservationDatePicker({value,onChange,ar,maxAdvanceDays,timezone}:{value:string;onChange:(value:string)=>void;ar:boolean;maxAdvanceDays:number;timezone:string}){
  const selected=parseDateOnly(value);
  const today=parseDateOnly(reservationDay(new Date(),timezone))!;
  const maxDate=new Date(today);
  maxDate.setDate(maxDate.getDate()+Math.max(1,maxAdvanceDays));

  return <Popover>
    <PopoverTrigger asChild>
      <Button type="button" variant="outline" className="h-12 w-full justify-start rounded-xl px-3 text-start font-normal">
        <CalendarDays className="me-2 size-4 shrink-0 text-muted-foreground"/>
        <span className={cn("min-w-0 flex-1 truncate",!selected&&"text-muted-foreground")}>
          {selected?new Intl.DateTimeFormat(ar?"ar-JO":"en-JO",{weekday:"short",year:"numeric",month:"short",day:"numeric"}).format(selected):(ar?"اختر التاريخ":"Choose date")}
        </span>
      </Button>
    </PopoverTrigger>
    <PopoverContent className="w-auto overflow-hidden rounded-2xl p-0" align="start" sideOffset={8}>
      <Calendar
        mode="single"
        selected={selected}
        onSelect={date=>{if(date)onChange(formatDateOnly(date));}}
        disabled={{before:today,after:maxDate}}
        defaultMonth={selected??today}
        startMonth={today}
        endMonth={maxDate}
        captionLayout="dropdown"
        className="p-3 [--cell-size:2.35rem]"
      />
      <div className="flex items-center justify-between border-t border-border px-3 py-2">
        <span className="text-[10px] text-muted-foreground">{ar?"اختيار موثوق بدون قص داخل الحقل":"Clear calendar selection"}</span>
        <Button type="button" size="sm" variant="ghost" onClick={()=>onChange(formatDateOnly(today))}>{ar?"اليوم":"Today"}</Button>
      </div>
    </PopoverContent>
  </Popover>;
}

function DeleteReservationDialog({booking,ar,busy,onOpenChange,onConfirm}:{booking:Booking|null;ar:boolean;busy:boolean;onOpenChange:(open:boolean)=>void;onConfirm:()=>void}){
  const blocked=booking?.status==="seated"||booking?.deposit_status==="paid";
  return <AlertDialog open={Boolean(booking)} onOpenChange={onOpenChange}>
    <AlertDialogContent className="rounded-2xl">
      <AlertDialogHeader>
        <div className="mx-auto mb-2 grid size-12 place-items-center rounded-2xl bg-red-500/10 text-red-600 sm:mx-0"><Trash2 className="size-5"/></div>
        <AlertDialogTitle>{ar?"حذف الحجز نهائياً؟":"Delete this reservation permanently?"}</AlertDialogTitle>
        <AlertDialogDescription>
          {blocked
            ? (ar?"لا يمكن حذف حجز نشط على الطاولة أو حجز بعربون مدفوع. أنهِ سير العمل أو أعد العربون أولاً.":"An actively seated reservation or one with a paid deposit cannot be deleted. Complete the workflow or refund the deposit first.")
            : (ar?`سيتم حذف حجز ${booking?.customer_name??""} وسجلات الإشعار/الدفع المرتبطة به. يتم الاحتفاظ بسجل تدقيق لعملية الحذف.`:`This will permanently delete ${booking?.customer_name??""}'s reservation and its booking-only notification/payment records. An audit record of the deletion is retained.`)}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={busy}>{ar?"رجوع":"Keep reservation"}</AlertDialogCancel>
        <AlertDialogAction
          disabled={busy||blocked}
          onClick={event=>{if(blocked){event.preventDefault();return;}onConfirm();}}
          className="bg-red-600 text-white hover:bg-red-700 focus:ring-red-500"
        >
          {busy?(ar?"جارٍ الحذف…":"Deleting…"):(ar?"حذف الحجز":"Delete reservation")}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}

function parseDateOnly(value:string){
  const parts=value.split("-").map(Number);
  if(parts.length!==3||parts.some(Number.isNaN))return undefined;
  const [year,month,day]=parts;
  if(!year||!month||!day)return undefined;
  return new Date(year,month-1,day);
}
function formatDateOnly(date:Date){
  const year=date.getFullYear();
  const month=String(date.getMonth()+1).padStart(2,"0");
  const day=String(date.getDate()).padStart(2,"0");
  return `${year}-${month}-${day}`;
}
function startOfLocalDay(date:Date){
  const copy=new Date(date);
  copy.setHours(0,0,0,0);
  return copy;
}

function Metric({icon:Icon,label,value}:{icon:typeof CalendarCheck2;label:string;value:number}){return <article className="flex min-h-[88px] items-center gap-3 bg-card p-3.5"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-orange-500/10 text-[#e85d2a]"><Icon className="size-5"/></span><div><p className="text-[11px] font-semibold text-muted-foreground">{label}</p><strong className="mt-1 block font-display text-2xl tracking-[-.04em]">{value}</strong></div></article>;}
function Toggle({label,value,onChange}:{label:string;value:boolean;onChange:(v:boolean)=>void}){return <button type="button" aria-pressed={value} onClick={()=>onChange(!value)} className={cn("qs-booking-setting-toggle",value&&"is-active")}><span><strong>{label}</strong><small>{value?"On":"Off"}</small></span><i aria-hidden="true"><b/></i></button>;}
function bookingDateParts(d:Date){const local=new Date(d.getTime()-d.getTimezoneOffset()*60_000);local.setMinutes(Math.ceil(local.getMinutes()/15)*15,0,0);const value=local.toISOString();return {date:value.slice(0,10),time:value.slice(11,16)};}
function statusLabel(status:string,ar:boolean){const labels:Record<string,[string,string]>={pending:["Pending","قيد الانتظار"],confirmed:["Confirmed","مؤكد"],seated:["Seated","تم الجلوس"],completed:["Completed","مكتمل"],cancelled:["Cancelled","ملغي"],no_show:["No-show","لم يحضر"],free:["Free","متاحة"],reserved:["Reserved","محجوزة"],active:["Active","نشطة"],cleaning:["Cleaning","تنظيف"],out_of_service:["Out of service","خارج الخدمة"]};return labels[status]?.[ar?1:0]??status;}
