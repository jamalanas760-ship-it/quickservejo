import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarCheck2, CalendarClock, CalendarDays, CheckCircle2, Clock3, ExternalLink, MessageSquareText, Plus, Send, Settings2, Timer, Trash2, UserRoundCheck, UsersRound, XCircle } from "lucide-react";
import { toast } from "sonner";

import { MasterEyebrow, MasterKpi, MasterPageHeader } from "@/components/app/MasterPage";
import { AppHeader } from "@/components/nav/AppHeader";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

export const Route = createFileRoute("/_authenticated/bookings")({
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
  deposit_amount:number;confirmation_channel:string;reminder_channel:string;terms:string|null;
};

function BookingsPage(){
  const {lang}=useI18n(); const ar=lang==="ar";
  const scope=useWorkspaceScope(); const access=useAccess(); const qc=useQueryClient();
  const rid=scope.restaurantId; const membership=rid?access.membershipFor(rid):null;
  const canManage=Boolean(access.isSuperAdmin||(membership&&membershipHasCapability(membership.role,membership.permission_overrides,"manage_tables")));
  const canConfigure=Boolean(access.isSuperAdmin||(membership&&membershipHasCapability(membership.role,membership.permission_overrides,"manage_restaurant")));
  const [createOpen,setCreateOpen]=useState(false);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [deleteTarget,setDeleteTarget]=useState<Booking|null>(null);
  const [messageTarget,setMessageTarget]=useState<Booking|null>(null);
  const [search,setSearch]=useState("");

  const restaurant=useQuery({
    queryKey:["bookings","restaurant",rid],
    enabled:Boolean(rid&&canManage),
    queryFn:async()=>{
      const {data,error}=await supabase.from("restaurants").select("slug,currency,timezone").eq("id",rid!).single();
      if(error)throw error;
      return data;
    },
  });

  const bookings=useQuery<Booking[]>({
    queryKey:["bookings",rid],
    enabled:Boolean(rid&&canManage),
    staleTime:5_000,refetchInterval:20_000,
    queryFn:async()=>{
      const {data,error}=await (supabase as any).from("table_bookings")
        .select("id,restaurant_id,table_id,customer_name,phone,email,guest_count,booking_at,ends_at,duration_minutes,zone,status,notes,occasion,source,confirmation_code,public_token,deposit_amount,deposit_status,cancel_reason,created_at")
        .eq("restaurant_id",rid).order("booking_at",{ascending:true}).limit(500);
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
  if(!rid||!membership||!canManage)return <div className="min-h-dvh bg-background"><AppHeader/><main className="qs-page"><section className="qs-card p-10 text-center"><h1 className="font-display text-xl font-bold">{ar?"الحجوزات غير متاحة لهذا الحساب":"Reservations are not available for this account"}</h1><p className="mt-2 text-sm text-muted-foreground">{ar?"تحتاج صلاحية إدارة الطاولات.":"Table-management access is required."}</p></section></main></div>;

  const now=Date.now();
  const all=bookings.data??[];
  const needle=search.trim().toLowerCase();
  const rows=all.filter(row=>!needle||[row.customer_name,row.phone,row.email,row.confirmation_code,row.source].filter(Boolean).join(" ").toLowerCase().includes(needle));
  const active=all.filter(row=>!["completed","cancelled","no_show"].includes(row.status));
  const today=active.filter(row=>new Date(row.booking_at).toDateString()===new Date().toDateString());
  const seated=active.filter(row=>row.status==="seated").length;
  const pending=active.filter(row=>row.status==="pending").length;
  const upcoming=active.filter(row=>new Date(row.booking_at).getTime()>=now).length;

  return <div className="min-h-dvh bg-background">
    <AppHeader title={ar?"الحجوزات":"Reservations"}/>
    <main className="qs-page qs-compact-page space-y-4">
      <MasterPageHeader
        eyebrow={<MasterEyebrow icon={CalendarCheck2}>{ar?"مكتب الحجوزات":"Reservation Desk"}</MasterEyebrow>}
        title={ar?"الحجوزات والوصول والجلوس":"Reservations, Arrivals & Seating"}
        description={ar?"واجهة تشغيلية واحدة من أول اتصال حتى جلوس الضيف، مع توافر حي ومنع التعارض.":"One operational workspace from first contact to seating, with live availability and conflict protection."}
        actions={<>
          {restaurant.data?.slug?<Button asChild variant="outline"><Link to="/book/$slug" params={{slug:restaurant.data.slug}} target="_blank"><ExternalLink className="size-4"/>{ar?"صفحة الحجز العامة":"Public booking"}</Link></Button>:null}
          {canConfigure?<Button variant="outline" onClick={()=>setSettingsOpen(true)}><Settings2 className="size-4"/>{ar?"الإعدادات":"Settings"}</Button>:null}
          <Button onClick={()=>setCreateOpen(true)}><Plus className="size-4"/>{ar?"حجز جديد":"Add Booking"}</Button>
        </>}
        tabs={<div className="flex gap-1"><Link to="/bookings" className="rounded-[9px] bg-foreground px-4 py-2 text-xs font-bold text-background">{ar?"الحجوزات":"Reservations"}</Link><Link to="/waitlist" className="rounded-[9px] px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-muted">{ar?"قائمة الانتظار":"Waitlist"}</Link></div>}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MasterKpi icon={CalendarClock} label={ar?"حجوزات اليوم":"Today's Reservations"} value={String(today.length)} hint={ar?"جدول اليوم":"Today's book"} tone="orange"/>
        <MasterKpi icon={Clock3} label={ar?"قادمة":"Upcoming"} value={String(upcoming)} hint={ar?"لم تصل بعد":"Still to arrive"} tone="blue"/>
        <MasterKpi icon={CalendarCheck2} label={ar?"بانتظار التأكيد":"Pending"} value={String(pending)} hint={ar?"تحتاج متابعة":"Need follow-up"} tone="purple"/>
        <MasterKpi icon={UserRoundCheck} label={ar?"جالسين الآن":"Seated Now"} value={String(seated)} hint={ar?"في الخدمة":"In service"} tone="green"/>
      </section>

      <section className="qs-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="qs-section-title">{ar?"جدول الحجوزات":"Reservation schedule"}</h2><p className="mt-1 text-xs text-muted-foreground">{ar?"التأكيد لا يحجز الطاولة تشغيلياً إلا قرب الموعد؛ منع التعارض يتم دائماً من قاعدة البيانات.":"Future reservations do not block live floor status until arrival nears; time conflicts are always enforced in the database."}</p></div><Input className="sm:max-w-xs" value={search} onChange={e=>setSearch(e.target.value)} placeholder={ar?"بحث بالاسم، الهاتف أو الرمز":"Search guest, phone or code"}/></div>
        {bookings.isPending||tables.isPending?<div className="p-5"><Skeleton className="h-72 rounded-2xl"/></div>:bookings.isError?<p className="p-6 text-sm text-destructive">{humanError(bookings.error,lang)}</p>:!rows.length?<div className="p-12 text-center"><CalendarCheck2 className="mx-auto size-8 text-muted-foreground"/><h3 className="mt-3 font-bold">{ar?"لا توجد حجوزات":"No reservations found"}</h3></div>:<div className="divide-y divide-border">{rows.map(booking=><BookingRow key={booking.id} booking={booking} table={(tables.data??[]).find(row=>row.id===booking.table_id)??null} currency={restaurant.data?.currency??"JOD"} ar={ar} lang={lang} busy={transition.isPending||deleteReservation.isPending} onStatus={(status,reason)=>transition.mutate({id:booking.id,status,reason})} onMessage={()=>setMessageTarget(booking)} onDelete={()=>setDeleteTarget(booking)}/>)}</div>}
      </section>
    </main>
    <CreateBookingDialog open={createOpen} onOpenChange={setCreateOpen} restaurantId={rid} tables={tables.data??[]} settings={settings.data} ar={ar} lang={lang}/>
    {canConfigure?<BookingSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} restaurantId={rid} settings={settings.data} ar={ar} lang={lang}/>:null}
    <ReservationMessageDialog
      booking={messageTarget}
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

function CreateBookingDialog({open,onOpenChange,restaurantId,tables,settings,ar,lang}:{open:boolean;onOpenChange:(open:boolean)=>void;restaurantId:string;tables:FloorTable[];settings:BookingSettings|null|undefined;ar:boolean;lang:"ar"|"en"}){
  const qc=useQueryClient();
  const [busy,setBusy]=useState(false);
  const initial=bookingDateParts(new Date(Date.now()+60*60_000));
  const [bookingDate,setBookingDate]=useState(initial.date);
  const [bookingTime,setBookingTime]=useState(initial.time);
  const [guests,setGuests]=useState(2);
  const [duration,setDuration]=useState(settings?.default_duration_minutes??90);
  const [selectedTable,setSelectedTable]=useState("auto");
  const [status,setStatus]=useState("pending");
  const [source,setSource]=useState("staff");
  const bookingAt=bookingDate&&bookingTime?`${bookingDate}T${bookingTime}`:"";

  const available=useQuery<FloorTable[]>({
    queryKey:["booking-available-tables",restaurantId,bookingAt,guests,duration],
    enabled:open&&Boolean(bookingAt)&&guests>0,
    queryFn:async()=>{
      const at=new Date(bookingAt);
      if(Number.isNaN(at.getTime()))throw new Error(ar?"اختر تاريخاً ووقتاً صحيحين":"Choose a valid date and time");
      const {data,error}=await (supabase as any).rpc("find_available_booking_tables",{
        _restaurant_id:restaurantId,_booking_at:at.toISOString(),_guest_count:guests,_duration_minutes:duration,
      });
      if(error)throw error;
      return (data??[]) as FloorTable[];
    },
  });

  const availableRows=available.data??[];
  const bestFit=availableRows[0]??null;
  const chosen=selectedTable==="auto"?bestFit:availableRows.find(row=>row.id===selectedTable)??null;
  const canSubmit=Boolean(bookingAt)&&availableRows.length>0&&!busy;

  async function submit(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();
    const form=new FormData(event.currentTarget);
    setBusy(true);
    try{
      const at=new Date(bookingAt);
      if(Number.isNaN(at.getTime()))throw new Error(ar?"اختر تاريخاً ووقتاً صحيحين":"Choose a valid date and time");
      const {error}=await (supabase as any).rpc("create_staff_booking",{
        _restaurant_id:restaurantId,
        _customer_name:String(form.get("customer_name")??"").trim(),
        _phone:String(form.get("phone")??"").trim(),
        _email:String(form.get("email")??"").trim(),
        _guest_count:guests,
        _booking_at:at.toISOString(),
        _table_id:selectedTable==="auto"?null:selectedTable,
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

  return <Dialog open={open} onOpenChange={value=>!busy&&onOpenChange(value)}>
    <DialogContent className="max-h-[94dvh] overflow-hidden p-0 sm:max-w-4xl">
      <div className="border-b border-border bg-gradient-to-r from-orange-500/[.09] via-background to-background px-5 py-5 sm:px-7">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-orange-500/10 text-[#ff5a0a]"><CalendarCheck2 className="size-5"/></span>
            <div>
              <DialogTitle className="text-xl sm:text-2xl">{ar?"حجز جديد":"New reservation"}</DialogTitle>
              <DialogDescription className="mt-1 max-w-2xl">{ar?"أدخل بيانات الضيف ثم اختر التاريخ والوقت بوضوح. يتم فحص التوفر مباشرة ومرة أخيرة عند الحفظ.":"Add the guest, choose date and time clearly, then QuickServe checks availability live and once again when saving."}</DialogDescription>
            </div>
          </div>
        </DialogHeader>
      </div>

      <form onSubmit={submit} className="grid max-h-[calc(94dvh-105px)] overflow-y-auto lg:grid-cols-[minmax(0,1fr)_290px]">
        <div className="space-y-6 p-5 sm:p-7">
          <section>
            <SectionHeading number="1" title={ar?"بيانات الضيف":"Guest details"} subtitle={ar?"المعلومات الأساسية للحجز والتواصل.":"Core reservation and contact information."}/>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label={ar?"اسم الضيف":"Guest name"}><Input className="h-11 rounded-xl" name="customer_name" required maxLength={120} autoFocus/></Field>
              <Field label={ar?"الهاتف":"Phone"}><Input className="h-11 rounded-xl" name="phone" inputMode="tel" maxLength={40}/></Field>
              <Field label={ar?"البريد الإلكتروني":"Email"}><Input className="h-11 rounded-xl" name="email" type="email" maxLength={160}/></Field>
              <Field label={ar?"المناسبة":"Occasion"}><Input className="h-11 rounded-xl" name="occasion" maxLength={120} placeholder={ar?"عيد ميلاد، ذكرى...":"Birthday, anniversary..."}/></Field>
            </div>
          </section>

          <section className="border-t border-border pt-6">
            <SectionHeading number="2" title={ar?"الموعد وعدد الضيوف":"Date, time & party"} subtitle={ar?"التاريخ والوقت منفصلان لتكون عملية الاختيار واضحة وسهلة على جميع الأجهزة.":"Date and time are separated for a clearer, reliable picker on every device."}/>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label={ar?"التاريخ":"Date"}>
                <ReservationDatePicker
                  value={bookingDate}
                  onChange={value=>{setBookingDate(value);setSelectedTable("auto");}}
                  ar={ar}
                  maxAdvanceDays={settings?.max_advance_days??365}
                />
              </Field>
              <Field label={ar?"الوقت":"Time"}>
                <div className="relative"><Clock3 className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><Input className="h-12 rounded-xl ps-10" type="time" step="900" value={bookingTime} onChange={e=>{setBookingTime(e.target.value);setSelectedTable("auto");}} required/></div>
              </Field>
              <Field label={ar?"عدد الضيوف":"Guests"}>
                <div className="relative"><UsersRound className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><Input className="h-12 rounded-xl ps-10" type="number" min="1" max="100" value={guests} onChange={e=>{setGuests(Number(e.target.value)||1);setSelectedTable("auto");}} required/></div>
              </Field>
            </div>

            <div className="mt-4">
              <Label className="text-xs font-bold">{ar?"مدة الحجز":"Reservation duration"}</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {[60,90,120,150,180].map(value=><button key={value} type="button" onClick={()=>{setDuration(value);setSelectedTable("auto");}} className={cn("rounded-xl border px-3.5 py-2 text-xs font-bold transition",duration===value?"border-[#ff5a0a] bg-orange-500/10 text-[#e34d00]":"border-border bg-background hover:bg-muted/50")}>{value<120?`${value} min`:`${value/60} hr`}</button>)}
                <div className="relative w-28"><Timer className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><Input className="h-9 rounded-xl ps-9 text-xs" type="number" min="30" max="360" step="15" value={duration} onChange={e=>{setDuration(Number(e.target.value)||90);setSelectedTable("auto");}}/></div>
              </div>
            </div>
          </section>

          <section className="border-t border-border pt-6">
            <SectionHeading number="3" title={ar?"الطاولة وسير العمل":"Table & workflow"} subtitle={ar?"QuickServe يختار أصغر طاولة مناسبة تلقائياً، أو يمكنك اختيار طاولة متاحة.":"QuickServe auto-selects the smallest suitable table, or you can choose an available table."}/>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Field label={ar?"الطاولة":"Table"}>
                <Select value={selectedTable} onValueChange={setSelectedTable}>
                  <SelectTrigger className="h-11 rounded-xl"><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">{ar?"أفضل طاولة تلقائياً":"Auto-assign best fit"}</SelectItem>
                    {availableRows.map(table=><SelectItem key={table.id} value={table.id}>{table.table_name??`#${table.table_number}`} · {table.capacity} · {table.zone}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={ar?"الحالة":"Status"}>
                <Select value={status} onValueChange={setStatus}><SelectTrigger className="h-11 rounded-xl"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="pending">{statusLabel("pending",ar)}</SelectItem><SelectItem value="confirmed">{statusLabel("confirmed",ar)}</SelectItem></SelectContent></Select>
              </Field>
              <Field label={ar?"المصدر":"Source"}>
                <Select value={source} onValueChange={setSource}><SelectTrigger className="h-11 rounded-xl"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="staff">{ar?"موظف":"Staff"}</SelectItem><SelectItem value="phone">{ar?"هاتف":"Phone"}</SelectItem><SelectItem value="walk_in">{ar?"حضور مباشر":"Walk-in"}</SelectItem></SelectContent></Select>
              </Field>
            </div>
            <Field label={ar?"ملاحظات":"Notes"}><Textarea className="mt-2 min-h-24 rounded-xl" name="notes" maxLength={1000} placeholder={ar?"طلبات خاصة، كرسي أطفال، ملاحظات الوصول...":"Special requests, high chair, arrival notes..."}/></Field>
          </section>
        </div>

        <aside className="border-t border-border bg-muted/20 p-5 lg:border-s lg:border-t-0 sm:p-6">
          <div className="sticky top-0 space-y-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[.15em] text-muted-foreground">{ar?"التوفر المباشر":"Live availability"}</p>
              {available.isPending?<div className="mt-3 space-y-2"><Skeleton className="h-16 rounded-2xl"/><Skeleton className="h-10 rounded-xl"/></div>
                :available.isError?<div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-700">{humanError(available.error,lang)}</div>
                :availableRows.length>0?<div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                  <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="size-4"/><strong className="text-sm">{availableRows.length} {ar?"طاولة متاحة":"tables available"}</strong></div>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">{chosen?(ar?`الاختيار: ${chosen.table_name??`#${chosen.table_number}`} · سعة ${chosen.capacity}`:`Selected: ${chosen.table_name??`#${chosen.table_number}`} · capacity ${chosen.capacity}`):(ar?"سيتم اختيار أفضل طاولة عند الحفظ.":"Best-fit table will be chosen at save time.")}</p>
                </div>
                :<div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/50 dark:bg-amber-950/20"><strong className="text-sm text-amber-800 dark:text-amber-200">{ar?"لا توجد طاولة متاحة":"No table available"}</strong><p className="mt-2 text-xs leading-5 text-muted-foreground">{ar?"غيّر الوقت أو المدة أو عدد الضيوف، أو استخدم قائمة الانتظار.":"Try another time, duration or party size, or use the waitlist."}</p><Button asChild variant="outline" size="sm" className="mt-3 w-full rounded-xl"><Link to="/waitlist">{ar?"فتح قائمة الانتظار":"Open waitlist"}</Link></Button></div>}
            </div>

            <div className="rounded-2xl border border-border bg-background p-4">
              <p className="text-[10px] font-black uppercase tracking-[.15em] text-muted-foreground">{ar?"ملخص الحجز":"Reservation summary"}</p>
              <div className="mt-3 space-y-3 text-sm">
                <SummaryLine label={ar?"التاريخ":"Date"} value={bookingDate||"—"}/>
                <SummaryLine label={ar?"الوقت":"Time"} value={bookingTime||"—"}/>
                <SummaryLine label={ar?"الضيوف":"Guests"} value={String(guests)}/>
                <SummaryLine label={ar?"المدة":"Duration"} value={`${duration} min`}/>
                <SummaryLine label={ar?"الطاولة":"Table"} value={chosen?(chosen.table_name??`#${chosen.table_number}`):(selectedTable==="auto"?(ar?"تلقائي":"Auto"):"—")}/>
              </div>
            </div>

            <div className="rounded-2xl border border-dashed border-border p-4 text-[11px] leading-5 text-muted-foreground">{ar?"يتم إعادة فحص التوفر داخل قاعدة البيانات عند إنشاء الحجز، لذلك لا يمكن لحجزين متزامنين حجز نفس الطاولة لنفس الوقت.":"Availability is rechecked inside the database when creating the reservation, preventing concurrent double-booking."}</div>
          </div>
        </aside>

        <DialogFooter className="sticky bottom-0 z-10 border-t border-border bg-background/95 px-5 py-4 backdrop-blur lg:col-span-2 sm:px-7">
          <Button type="button" variant="outline" className="rounded-xl" onClick={()=>onOpenChange(false)} disabled={busy}>{ar?"إلغاء":"Cancel"}</Button>
          <Button type="submit" className="min-w-40 rounded-xl" disabled={!canSubmit}>{busy?(ar?"جارٍ الحفظ…":"Saving…"):(ar?"إنشاء الحجز":"Create reservation")}</Button>
        </DialogFooter>
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

function BookingSettingsDialog({open,onOpenChange,restaurantId,settings,ar,lang}:{open:boolean;onOpenChange:(open:boolean)=>void;restaurantId:string;settings:BookingSettings|null|undefined;ar:boolean;lang:"ar"|"en"}){
  const qc=useQueryClient();
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
  const [confirmationChannel,setConfirmationChannel]=useState(settings?.confirmation_channel??"none");
  const [reminderChannel,setReminderChannel]=useState(settings?.reminder_channel??"none");
  const [reminderHours,setReminderHours]=useState(settings?.reminder_hours??24);
  const [cancelCutoff,setCancelCutoff]=useState(settings?.cancellation_cutoff_hours??2);

  useEffect(()=>{if(open&&settings){setOnline(settings.online_enabled);setAutoConfirm(settings.auto_confirm);setSlot(settings.slot_minutes);setDuration(settings.default_duration_minutes);setLead(settings.min_lead_minutes);setAdvance(settings.max_advance_days);setMinParty(settings.min_party_size);setMaxParty(settings.max_party_size);setDepositMode(settings.deposit_mode);setDeposit(Number(settings.deposit_amount));setTerms(settings.terms??"");setConfirmationChannel(settings.confirmation_channel??"none");setReminderChannel(settings.reminder_channel??"none");setReminderHours(settings.reminder_hours??24);setCancelCutoff(settings.cancellation_cutoff_hours??2);}},[open,settings]);

  const save=useMutation({
    mutationFn:async()=>{
      const {error}=await (supabase as any).from("booking_settings").upsert({
        restaurant_id:restaurantId,online_enabled:online,auto_confirm:autoConfirm,slot_minutes:slot,
        default_duration_minutes:duration,min_lead_minutes:lead,max_advance_days:advance,min_party_size:minParty,max_party_size:maxParty,
        deposit_mode:depositMode,deposit_amount:Math.max(0,deposit),terms:terms.trim()||null,
        confirmation_channel:confirmationChannel,reminder_channel:reminderChannel,
        reminder_hours:Math.max(1,reminderHours),cancellation_cutoff_hours:Math.max(0,cancelCutoff),
      },{onConflict:"restaurant_id"});
      if(error)throw error;
    },
    onSuccess:async()=>{await qc.invalidateQueries({queryKey:["booking-settings",restaurantId]});toast.success(ar?"تم حفظ إعدادات الحجز":"Booking settings saved");onOpenChange(false);},
    onError:(error)=>toast.error(humanError(error,lang)),
  });

  return <Dialog open={open} onOpenChange={value=>!save.isPending&&onOpenChange(value)}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{ar?"إعدادات الحجز":"Booking settings"}</DialogTitle><DialogDescription>{ar?"تحكم بالتوفر العام، أوقات الحجز، التأكيد والعربون.":"Control public availability, timing, confirmation and deposits."}</DialogDescription></DialogHeader><div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2"><Toggle label={ar?"الحجز العام":"Public booking"} value={online} onChange={setOnline}/><Toggle label={ar?"تأكيد تلقائي":"Auto-confirm"} value={autoConfirm} onChange={setAutoConfirm}/></div>
    <div className="grid gap-4 sm:grid-cols-3"><Field label={ar?"مدة الفترة":"Slot minutes"}><Select value={String(slot)} onValueChange={v=>setSlot(Number(v))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{[15,30,45,60].map(v=><SelectItem key={v} value={String(v)}>{v}</SelectItem>)}</SelectContent></Select></Field><Field label={ar?"مدة الحجز":"Default duration"}><Input type="number" min="30" max="360" step="15" value={duration} onChange={e=>setDuration(Number(e.target.value)||90)}/></Field><Field label={ar?"مهلة قبل الحجز":"Lead minutes"}><Input type="number" min="0" value={lead} onChange={e=>setLead(Number(e.target.value)||0)}/></Field><Field label={ar?"أيام الحجز المسبق":"Advance days"}><Input type="number" min="1" max="365" value={advance} onChange={e=>setAdvance(Number(e.target.value)||90)}/></Field><Field label={ar?"أقل عدد ضيوف":"Min party"}><Input type="number" min="1" value={minParty} onChange={e=>setMinParty(Number(e.target.value)||1)}/></Field><Field label={ar?"أكبر عدد ضيوف":"Max party"}><Input type="number" min={minParty} max="100" value={maxParty} onChange={e=>setMaxParty(Number(e.target.value)||12)}/></Field></div>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={ar?"قناة تأكيد الحجز":"Confirmation channel"}><Select value={confirmationChannel} onValueChange={setConfirmationChannel}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">{ar?"بدون رسالة":"No message"}</SelectItem><SelectItem value="sms">SMS</SelectItem><SelectItem value="whatsapp">WhatsApp</SelectItem><SelectItem value="email">Email</SelectItem></SelectContent></Select></Field>
      <Field label={ar?"قناة التذكير":"Reminder channel"}><Select value={reminderChannel} onValueChange={setReminderChannel}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">{ar?"بدون تذكير":"No reminder"}</SelectItem><SelectItem value="sms">SMS</SelectItem><SelectItem value="whatsapp">WhatsApp</SelectItem><SelectItem value="email">Email</SelectItem></SelectContent></Select></Field>
      <Field label={ar?"التذكير قبل الموعد بالساعات":"Reminder hours before"}><Input type="number" min="1" max="168" value={reminderHours} onChange={e=>setReminderHours(Number(e.target.value)||24)}/></Field>
      <Field label={ar?"مهلة الإلغاء بالساعات":"Cancellation cutoff hours"}><Input type="number" min="0" max="168" value={cancelCutoff} onChange={e=>setCancelCutoff(Number(e.target.value)||0)}/></Field>
    </div>
    <div className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">{ar?"رسائل التأكيد والتذكير لا تُعتبر رسائل تسويقية. يتم إرسالها فقط إذا كانت بيانات Twilio/Resend مضبوطة على الخادم، وإلا تبقى المهمة غير ناجحة ولا يتم تسجيل إرسال وهمي.":"Confirmation and reminder messages are transactional. They send only when Twilio/Resend server credentials are configured; otherwise no fake success is recorded."}</div>
    <div className="grid gap-4 sm:grid-cols-2"><Field label={ar?"نظام العربون":"Deposit mode"}><Select value={depositMode} onValueChange={v=>setDepositMode(v as typeof depositMode)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">{ar?"بدون عربون":"No deposit"}</SelectItem><SelectItem value="fixed">{ar?"مبلغ ثابت":"Fixed amount"}</SelectItem><SelectItem value="per_guest">{ar?"لكل ضيف":"Per guest"}</SelectItem></SelectContent></Select></Field><Field label={ar?"قيمة العربون":"Deposit amount"}><Input type="number" min="0" step="0.001" disabled={depositMode==="none"} value={deposit} onChange={e=>setDeposit(Number(e.target.value)||0)}/></Field></div>
    <Field label={ar?"شروط الحجز":"Booking terms"}><Textarea rows={4} maxLength={2000} value={terms} onChange={e=>setTerms(e.target.value)}/></Field>
  </div><DialogFooter><Button variant="outline" onClick={()=>onOpenChange(false)}>{ar?"إلغاء":"Cancel"}</Button><Button disabled={save.isPending} onClick={()=>save.mutate()}>{ar?"حفظ":"Save settings"}</Button></DialogFooter></DialogContent></Dialog>;
}

function BookingRow({booking,table,currency,ar,lang,busy,onStatus,onMessage,onDelete}:{booking:Booking;table:FloorTable|null;currency:string;ar:boolean;lang:"ar"|"en";busy:boolean;onStatus:(status:BookingStatus,reason?:string)=>void;onMessage:()=>void;onDelete:()=>void}){
  const date=new Intl.DateTimeFormat(ar?"ar-JO":"en-JO",{dateStyle:"medium",timeStyle:"short"}).format(new Date(booking.booking_at));
  return <article className="grid gap-4 p-4 sm:p-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold">{booking.customer_name}</h3><Badge variant={booking.status==="seated"?"default":booking.status==="cancelled"||booking.status==="no_show"?"destructive":"secondary"}>{statusLabel(booking.status,ar)}</Badge><span className="rounded-full bg-muted px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{booking.source}</span></div><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span>{date}</span><span>{booking.duration_minutes} min</span><span className="inline-flex items-center gap-1"><UsersRound className="size-3.5"/>{booking.guest_count}</span><span>{table?(table.table_name??`#${table.table_number}`):(ar?"بدون طاولة":"No table")}</span>{booking.phone?<span>{booking.phone}</span>:null}{booking.email?<span>{booking.email}</span>:null}</div><div className="mt-2 flex flex-wrap gap-2 text-[10px] text-muted-foreground"><span>{ar?"رمز: ":"Code: "}<strong className="font-mono text-foreground">{booking.confirmation_code}</strong></span>{booking.occasion?<span>· {booking.occasion}</span>:null}{booking.deposit_amount>0?<span>· {ar?"عربون ":"Deposit "}{formatMoney(booking.deposit_amount,currency,lang)} ({booking.deposit_status})</span>:null}</div>{booking.notes?<p className="mt-2 text-xs leading-5 text-muted-foreground">{booking.notes}</p>:null}{booking.cancel_reason?<p className="mt-2 text-xs text-red-600">{ar?"سبب الإلغاء: ":"Cancellation: "}{booking.cancel_reason}</p>:null}</div><div className="flex flex-wrap gap-2 xl:justify-end">
    {booking.status==="pending"?<Button size="sm" disabled={busy} onClick={()=>onStatus("confirmed")}><CheckCircle2 className="size-4"/>{ar?"تأكيد":"Confirm"}</Button>:null}
    {booking.status==="confirmed"?<><Button size="sm" disabled={busy} onClick={()=>onStatus("seated")}><UserRoundCheck className="size-4"/>{ar?"تم الجلوس":"Seat guests"}</Button><Button size="sm" variant="outline" disabled={busy} onClick={()=>onStatus("no_show")}><XCircle className="size-4"/>{ar?"لم يحضر":"No-show"}</Button></>:null}
    {booking.status==="seated"?<Button size="sm" variant="outline" disabled={busy} onClick={()=>onStatus("completed")}><CheckCircle2 className="size-4"/>{ar?"اكتمال":"Complete"}</Button>:null}
    {booking.phone?<Button size="sm" variant="outline" disabled={busy} onClick={onMessage}><MessageSquareText className="size-4"/>{ar?"رسالة":"Message"}</Button>:null}
    {(booking.status==="pending"||booking.status==="confirmed")?<Button size="sm" variant="ghost" disabled={busy} onClick={()=>onStatus("cancelled",ar?"ألغاه الموظف":"Cancelled by staff")}><XCircle className="size-4"/>{ar?"إلغاء":"Cancel"}</Button>:null}
    {booking.status!=="seated"&&booking.deposit_status!=="paid"?<Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-500/10 hover:text-red-700" disabled={busy} onClick={onDelete}><Trash2 className="size-4"/>{ar?"حذف":"Delete"}</Button>:null}
  </div></article>;
}

type BookingMessage={
  id:string;direction:"inbound"|"outbound";channel:"sms"|"whatsapp";body:string;
  provider_status:string;last_error:string|null;sent_at:string|null;received_at:string|null;created_at:string;
};

function ReservationMessageDialog({booking,restaurantId,ar,lang,onOpenChange}:{booking:Booking|null;restaurantId:string;ar:boolean;lang:"ar"|"en";onOpenChange:(open:boolean)=>void}){
  const qc=useQueryClient();
  const [channel,setChannel]=useState<"sms"|"whatsapp">("sms");
  const [body,setBody]=useState("");

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
      return (data??[]) as BookingMessage[];
    },
  });

  const send=useMutation({
    mutationFn:async()=>{
      if(!booking)throw new Error("Reservation unavailable");
      const {error}=await (supabase as any).rpc("prepare_booking_message",{
        _booking_id:booking.id,_channel:channel,_body:body.trim(),
      });
      if(error)throw error;
    },
    onSuccess:async()=>{
      setBody("");
      await qc.invalidateQueries({queryKey:["booking-messages",booking?.id]});
      toast.success(ar?"تم وضع الرسالة في طابور الإرسال":"Message queued for delivery");
    },
    onError:(error)=>toast.error(humanError(error,lang)),
  });

  return <Dialog open={Boolean(booking)} onOpenChange={onOpenChange}>
    <DialogContent className="flex max-h-[88dvh] flex-col overflow-hidden p-0 sm:max-w-xl">
      <div className="border-b border-border bg-muted/25 px-5 py-4 sm:px-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><MessageSquareText className="size-5 text-[#ff5a0a]"/>{ar?"محادثة الحجز":"Reservation conversation"}</DialogTitle>
          <DialogDescription>{booking?.customer_name} · {booking?.phone??(ar?"بدون هاتف":"No phone")}</DialogDescription>
        </DialogHeader>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-muted/15 p-4 sm:p-5">
        {messages.isPending?<Skeleton className="h-64 rounded-2xl"/>
          :messages.isError?<div className="rounded-xl bg-red-500/10 p-3 text-sm text-red-700">{humanError(messages.error,lang)}</div>
          :(messages.data??[]).length===0?<div className="grid min-h-52 place-items-center text-center"><div><MessageSquareText className="mx-auto size-8 text-muted-foreground"/><p className="mt-2 text-sm font-semibold">{ar?"ابدأ المحادثة مع الضيف":"Start the guest conversation"}</p><p className="mt-1 text-xs text-muted-foreground">{ar?"الردود الواردة من Twilio ستظهر هنا تلقائياً.":"Inbound Twilio replies appear here automatically."}</p></div></div>
          :<div className="space-y-2">{(messages.data??[]).map(message=><div key={message.id} className={cn("flex",message.direction==="outbound"?"justify-end":"justify-start")}><div className={cn("max-w-[84%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm",message.direction==="outbound"?"rounded-ee-md bg-foreground text-background":"rounded-es-md border border-border bg-card text-foreground")}><p className="whitespace-pre-wrap leading-5">{message.body}</p><div className={cn("mt-1.5 flex flex-wrap items-center gap-2 text-[9px]",message.direction==="outbound"?"text-background/60":"text-muted-foreground")}><span>{message.channel.toUpperCase()}</span><span>{new Date(message.created_at).toLocaleString(ar?"ar-JO":"en-JO",{hour:"2-digit",minute:"2-digit",month:"short",day:"numeric"})}</span><span className="capitalize">{message.provider_status}</span>{message.last_error?<span className="text-red-500">{message.last_error}</span>:null}</div></div></div>)}</div>}
      </div>

      <div className="border-t border-border bg-card p-4 sm:p-5">
        <div className="mb-3 flex gap-2">
          {(["sms","whatsapp"] as const).map(value=><button type="button" key={value} onClick={()=>setChannel(value)} className={cn("rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide",channel===value?"border-[#ff5a0a] bg-orange-500/10 text-[#ff5a0a]":"border-border text-muted-foreground")}>{value}</button>)}
        </div>
        <Textarea rows={3} maxLength={2000} value={body} onChange={e=>setBody(e.target.value)} placeholder={ar?"اكتب رسالة للضيف…":"Write a message to the guest…"}/>
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-[10px] text-muted-foreground">{ar?"الإرسال الفعلي يتطلب إعداد Twilio على الخادم.":"Actual delivery requires Twilio server credentials."}</p>
          <Button disabled={send.isPending||body.trim().length===0||!booking?.phone} onClick={()=>send.mutate()}><Send className="size-4"/>{ar?"إرسال":"Send"}</Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}

function ReservationDatePicker({value,onChange,ar,maxAdvanceDays}:{value:string;onChange:(value:string)=>void;ar:boolean;maxAdvanceDays:number}){
  const selected=parseDateOnly(value);
  const today=startOfLocalDay(new Date());
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

function Metric({icon:Icon,label,value}:{icon:typeof CalendarCheck2;label:string;value:number}){return <article className="flex min-h-[105px] items-center gap-4 bg-card p-5"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-orange-500/10 text-[#ff5a0a]"><Icon className="size-5"/></span><div><p className="text-[11px] font-semibold text-muted-foreground">{label}</p><strong className="mt-1 block font-display text-3xl tracking-[-.04em]">{value}</strong></div></article>;}
function Field({label,children}:{label:string;children:React.ReactNode}){return <div className="space-y-1.5"><Label className="text-xs font-bold">{label}</Label>{children}</div>;}
function Toggle({label,value,onChange}:{label:string;value:boolean;onChange:(v:boolean)=>void}){return <button type="button" onClick={()=>onChange(!value)} className={cn("flex items-center justify-between rounded-xl border p-4 text-start",value?"border-[#ff5a0a] bg-orange-500/5":"border-border")}><span className="text-sm font-semibold">{label}</span><span className={cn("relative h-6 w-11 rounded-full transition",value?"bg-[#ff5a0a]":"bg-muted")}><span className={cn("absolute top-1 size-4 rounded-full bg-white shadow transition",value?"start-6":"start-1")}/></span></button>;}
function bookingDateParts(d:Date){const local=new Date(d.getTime()-d.getTimezoneOffset()*60_000);local.setMinutes(Math.ceil(local.getMinutes()/15)*15,0,0);const value=local.toISOString();return {date:value.slice(0,10),time:value.slice(11,16)};}
function statusLabel(status:string,ar:boolean){const labels:Record<string,[string,string]>={pending:["Pending","قيد الانتظار"],confirmed:["Confirmed","مؤكد"],seated:["Seated","تم الجلوس"],completed:["Completed","مكتمل"],cancelled:["Cancelled","ملغي"],no_show:["No-show","لم يحضر"],free:["Free","متاحة"],reserved:["Reserved","محجوزة"],active:["Active","نشطة"],cleaning:["Cleaning","تنظيف"],out_of_service:["Out of service","خارج الخدمة"]};return labels[status]?.[ar?1:0]??status;}
