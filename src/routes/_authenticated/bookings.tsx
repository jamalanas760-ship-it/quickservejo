import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarCheck2, CalendarClock, CheckCircle2, Clock3, ExternalLink, Plus, Settings2, UserRoundCheck, UsersRound, XCircle } from "lucide-react";
import { toast } from "sonner";

import { AppHeader } from "@/components/nav/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

  if(scope.isPending||access.isPending)return <div className="min-h-dvh bg-background"><AppHeader/><main className="qs-page"><Skeleton className="h-[560px] rounded-3xl"/></main></div>;
  if(!rid||!membership||!canManage)return <div className="min-h-dvh bg-background"><AppHeader/><main className="qs-page"><section className="qs-card p-10 text-center"><h1 className="font-display text-xl font-bold">{ar?"الحجوزات غير متاحة لهذا الحساب":"Reservations are not available for this account"}</h1><p className="mt-2 text-sm text-muted-foreground">{ar?"تحتاج صلاحية إدارة الطاولات.":"Table-management access is required."}</p></section></main></div>;

  const now=Date.now();
  const all=bookings.data??[];
  const needle=search.trim().toLowerCase();
  const rows=all.filter(row=>!needle||[row.customer_name,row.phone,row.email,row.confirmation_code,row.source].filter(Boolean).join(" ").toLowerCase().includes(needle));
  const active=all.filter(row=>!["completed","cancelled","no_show"].includes(row.status));
  const today=active.filter(row=>new Date(row.booking_at).toDateString()===new Date().toDateString());
  const seated=active.filter(row=>row.status==="seated").length;
  const upcoming=active.filter(row=>new Date(row.booking_at).getTime()>=now).length;

  return <div className="min-h-dvh bg-background">
    <AppHeader title={ar?"الحجوزات":"Reservations"}/>
    <main className="qs-page space-y-5">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div><span className="inline-flex items-center gap-2 rounded-full bg-orange-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.14em] text-[#ff5a0a]"><CalendarCheck2 className="size-3.5"/>{ar?"إدارة الحجوزات":"Reservation desk"}</span><h1 className="qs-page-title mt-3">{ar?"الحجوزات والجلوس":"Reservations & seating"}</h1><p className="qs-page-subtitle max-w-2xl">{ar?"توافر حي، منع الحجوزات المتعارضة، ربط CRM، ورمز تأكيد لكل ضيف.":"Live availability, conflict protection, CRM linking and a private confirmation code for every guest."}</p></div>
        <div className="flex flex-wrap gap-2">
          {restaurant.data?.slug?<Button asChild variant="outline"><Link to="/book/$slug" params={{slug:restaurant.data.slug}} target="_blank"><ExternalLink className="size-4"/>{ar?"رابط الحجز العام":"Public booking page"}</Link></Button>:null}
          {canConfigure?<Button variant="outline" onClick={()=>setSettingsOpen(true)}><Settings2 className="size-4"/>{ar?"الإعدادات":"Settings"}</Button>:null}
          <Button onClick={()=>setCreateOpen(true)}><Plus className="size-4"/>{ar?"حجز جديد":"New reservation"}</Button>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <Metric icon={CalendarClock} label={ar?"حجوزات اليوم":"Today"} value={today.length}/>
        <Metric icon={Clock3} label={ar?"القادمة":"Upcoming"} value={upcoming}/>
        <Metric icon={UserRoundCheck} label={ar?"تم الجلوس":"Seated"} value={seated}/>
      </section>

      <section className="qs-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="qs-section-title">{ar?"جدول الحجوزات":"Reservation schedule"}</h2><p className="mt-1 text-xs text-muted-foreground">{ar?"التأكيد لا يحجز الطاولة تشغيلياً إلا قرب الموعد؛ منع التعارض يتم دائماً من قاعدة البيانات.":"Future reservations do not block live floor status until arrival nears; time conflicts are always enforced in the database."}</p></div><Input className="sm:max-w-xs" value={search} onChange={e=>setSearch(e.target.value)} placeholder={ar?"بحث بالاسم، الهاتف أو الرمز":"Search guest, phone or code"}/></div>
        {bookings.isPending||tables.isPending?<div className="p-5"><Skeleton className="h-72 rounded-2xl"/></div>:bookings.isError?<p className="p-6 text-sm text-destructive">{humanError(bookings.error,lang)}</p>:!rows.length?<div className="p-12 text-center"><CalendarCheck2 className="mx-auto size-8 text-muted-foreground"/><h3 className="mt-3 font-bold">{ar?"لا توجد حجوزات":"No reservations found"}</h3></div>:<div className="divide-y divide-border">{rows.map(booking=><BookingRow key={booking.id} booking={booking} table={(tables.data??[]).find(row=>row.id===booking.table_id)??null} currency={restaurant.data?.currency??"JOD"} ar={ar} lang={lang} busy={transition.isPending} onStatus={(status,reason)=>transition.mutate({id:booking.id,status,reason})}/>)}</div>}
      </section>
    </main>
    <CreateBookingDialog open={createOpen} onOpenChange={setCreateOpen} restaurantId={rid} tables={tables.data??[]} settings={settings.data} ar={ar} lang={lang}/>
    {canConfigure?<BookingSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} restaurantId={rid} settings={settings.data} ar={ar} lang={lang}/>:null}
  </div>;
}

function CreateBookingDialog({open,onOpenChange,restaurantId,tables,settings,ar,lang}:{open:boolean;onOpenChange:(open:boolean)=>void;restaurantId:string;tables:FloorTable[];settings:BookingSettings|null|undefined;ar:boolean;lang:"ar"|"en"}){
  const qc=useQueryClient(); const [busy,setBusy]=useState(false);
  const [bookingAt,setBookingAt]=useState(()=>localInput(new Date(Date.now()+60*60_000)));
  const [guests,setGuests]=useState(2);
  const [duration,setDuration]=useState(settings?.default_duration_minutes??90);
  const available=useQuery<FloorTable[]>({
    queryKey:["booking-available-tables",restaurantId,bookingAt,guests,duration],
    enabled:open&&Boolean(bookingAt)&&guests>0,
    queryFn:async()=>{
      const {data,error}=await (supabase as any).rpc("find_available_booking_tables",{_restaurant_id:restaurantId,_booking_at:new Date(bookingAt).toISOString(),_guest_count:guests,_duration_minutes:duration});
      if(error)throw error;
      return (data??[]) as FloorTable[];
    },
  });

  async function submit(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault(); const form=new FormData(event.currentTarget); setBusy(true);
    try{
      const at=new Date(bookingAt); if(Number.isNaN(at.getTime()))throw new Error(ar?"اختر موعداً صحيحاً":"Choose a valid booking time");
      const tableId=String(form.get("table_id")??"auto");
      const {error}=await (supabase as any).rpc("create_staff_booking",{
        _restaurant_id:restaurantId,_customer_name:String(form.get("customer_name")??"").trim(),
        _phone:String(form.get("phone")??"").trim(),_email:String(form.get("email")??"").trim(),
        _guest_count:guests,_booking_at:at.toISOString(),_table_id:tableId==="auto"?null:tableId,
        _duration_minutes:duration,_status:String(form.get("status")??"pending"),
        _notes:String(form.get("notes")??"").trim()||null,_occasion:String(form.get("occasion")??"").trim()||null,_source:String(form.get("source")??"staff"),
      });
      if(error)throw error;
      await Promise.all([qc.invalidateQueries({queryKey:["bookings",restaurantId]}),qc.invalidateQueries({queryKey:["bookings","tables",restaurantId]})]);
      toast.success(ar?"تم إنشاء الحجز":"Reservation created");onOpenChange(false);
    }catch(error){toast.error(humanError(error,lang));}finally{setBusy(false);}
  }

  const availableRows=available.data??[];
  return <Dialog open={open} onOpenChange={value=>!busy&&onOpenChange(value)}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{ar?"حجز جديد":"New reservation"}</DialogTitle><DialogDescription>{ar?"يتم التحقق من التوفر مرة أخرى عند الحفظ لمنع أي تعارض متزامن.":"Availability is checked again at save time to prevent concurrent double-booking."}</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-4">
    <div className="grid gap-4 sm:grid-cols-2"><Field label={ar?"اسم الضيف":"Guest name"}><Input name="customer_name" required maxLength={120}/></Field><Field label={ar?"الهاتف":"Phone"}><Input name="phone" inputMode="tel" maxLength={40}/></Field><Field label={ar?"البريد":"Email"}><Input name="email" type="email" maxLength={160}/></Field><Field label={ar?"المناسبة":"Occasion"}><Input name="occasion" maxLength={120} placeholder={ar?"عيد ميلاد، ذكرى...":"Birthday, anniversary..."}/></Field></div>
    <div className="grid gap-4 sm:grid-cols-3"><Field label={ar?"الضيوف":"Guests"}><Input type="number" min="1" max="100" value={guests} onChange={e=>setGuests(Number(e.target.value)||1)} required/></Field><Field label={ar?"التاريخ والوقت":"Date & time"}><Input type="datetime-local" value={bookingAt} onChange={e=>setBookingAt(e.target.value)} required/></Field><Field label={ar?"المدة بالدقائق":"Duration"}><Input type="number" min="30" max="360" step="15" value={duration} onChange={e=>setDuration(Number(e.target.value)||90)}/></Field></div>
    <div className="grid gap-4 sm:grid-cols-3"><Field label={ar?"الطاولة":"Table"}><Select name="table_id" defaultValue="auto"><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="auto">{ar?"اختيار تلقائي لأفضل طاولة":"Auto-assign best fit"}</SelectItem>{availableRows.map(table=><SelectItem key={table.id} value={table.id}>{table.table_name??`#${table.table_number}`} · {table.capacity} · {table.zone}</SelectItem>)}</SelectContent></Select>{available.isPending?<span className="text-[10px] text-muted-foreground">{ar?"جارٍ فحص التوفر…":"Checking availability…"}</span>:<span className="text-[10px] text-muted-foreground">{availableRows.length} {ar?"طاولة متاحة":"available tables"}</span>}</Field><Field label={ar?"الحالة":"Status"}><Select name="status" defaultValue="pending"><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="pending">{statusLabel("pending",ar)}</SelectItem><SelectItem value="confirmed">{statusLabel("confirmed",ar)}</SelectItem></SelectContent></Select></Field><Field label={ar?"المصدر":"Source"}><Select name="source" defaultValue="staff"><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="staff">{ar?"موظف":"Staff"}</SelectItem><SelectItem value="phone">{ar?"هاتف":"Phone"}</SelectItem><SelectItem value="walk_in">{ar?"حضور مباشر":"Walk-in"}</SelectItem></SelectContent></Select></Field></div>
    <Field label={ar?"ملاحظات":"Notes"}><Textarea name="notes" maxLength={1000}/></Field>
    <DialogFooter><Button type="button" variant="outline" onClick={()=>onOpenChange(false)} disabled={busy}>{ar?"إلغاء":"Cancel"}</Button><Button type="submit" disabled={busy||availableRows.length===0}>{busy?(ar?"جارٍ الحفظ…":"Saving…"):(ar?"إنشاء الحجز":"Create reservation")}</Button></DialogFooter>
  </form></DialogContent></Dialog>;
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

  useEffect(()=>{if(open&&settings){setOnline(settings.online_enabled);setAutoConfirm(settings.auto_confirm);setSlot(settings.slot_minutes);setDuration(settings.default_duration_minutes);setLead(settings.min_lead_minutes);setAdvance(settings.max_advance_days);setMinParty(settings.min_party_size);setMaxParty(settings.max_party_size);setDepositMode(settings.deposit_mode);setDeposit(Number(settings.deposit_amount));setTerms(settings.terms??"");}},[open,settings]);

  const save=useMutation({
    mutationFn:async()=>{
      const {error}=await (supabase as any).from("booking_settings").upsert({
        restaurant_id:restaurantId,online_enabled:online,auto_confirm:autoConfirm,slot_minutes:slot,
        default_duration_minutes:duration,min_lead_minutes:lead,max_advance_days:advance,min_party_size:minParty,max_party_size:maxParty,
        deposit_mode:depositMode,deposit_amount:Math.max(0,deposit),terms:terms.trim()||null,
      },{onConflict:"restaurant_id"});
      if(error)throw error;
    },
    onSuccess:async()=>{await qc.invalidateQueries({queryKey:["booking-settings",restaurantId]});toast.success(ar?"تم حفظ إعدادات الحجز":"Booking settings saved");onOpenChange(false);},
    onError:(error)=>toast.error(humanError(error,lang)),
  });

  return <Dialog open={open} onOpenChange={value=>!save.isPending&&onOpenChange(value)}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{ar?"إعدادات الحجز":"Booking settings"}</DialogTitle><DialogDescription>{ar?"تحكم بالتوفر العام، أوقات الحجز، التأكيد والعربون.":"Control public availability, timing, confirmation and deposits."}</DialogDescription></DialogHeader><div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2"><Toggle label={ar?"الحجز العام":"Public booking"} value={online} onChange={setOnline}/><Toggle label={ar?"تأكيد تلقائي":"Auto-confirm"} value={autoConfirm} onChange={setAutoConfirm}/></div>
    <div className="grid gap-4 sm:grid-cols-3"><Field label={ar?"مدة الفترة":"Slot minutes"}><Select value={String(slot)} onValueChange={v=>setSlot(Number(v))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{[15,30,45,60].map(v=><SelectItem key={v} value={String(v)}>{v}</SelectItem>)}</SelectContent></Select></Field><Field label={ar?"مدة الحجز":"Default duration"}><Input type="number" min="30" max="360" step="15" value={duration} onChange={e=>setDuration(Number(e.target.value)||90)}/></Field><Field label={ar?"مهلة قبل الحجز":"Lead minutes"}><Input type="number" min="0" value={lead} onChange={e=>setLead(Number(e.target.value)||0)}/></Field><Field label={ar?"أيام الحجز المسبق":"Advance days"}><Input type="number" min="1" max="365" value={advance} onChange={e=>setAdvance(Number(e.target.value)||90)}/></Field><Field label={ar?"أقل عدد ضيوف":"Min party"}><Input type="number" min="1" value={minParty} onChange={e=>setMinParty(Number(e.target.value)||1)}/></Field><Field label={ar?"أكبر عدد ضيوف":"Max party"}><Input type="number" min={minParty} max="100" value={maxParty} onChange={e=>setMaxParty(Number(e.target.value)||12)}/></Field></div>
    <div className="grid gap-4 sm:grid-cols-2"><Field label={ar?"نظام العربون":"Deposit mode"}><Select value={depositMode} onValueChange={v=>setDepositMode(v as typeof depositMode)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">{ar?"بدون عربون":"No deposit"}</SelectItem><SelectItem value="fixed">{ar?"مبلغ ثابت":"Fixed amount"}</SelectItem><SelectItem value="per_guest">{ar?"لكل ضيف":"Per guest"}</SelectItem></SelectContent></Select></Field><Field label={ar?"قيمة العربون":"Deposit amount"}><Input type="number" min="0" step="0.001" disabled={depositMode==="none"} value={deposit} onChange={e=>setDeposit(Number(e.target.value)||0)}/></Field></div>
    <Field label={ar?"شروط الحجز":"Booking terms"}><Textarea rows={4} maxLength={2000} value={terms} onChange={e=>setTerms(e.target.value)}/></Field>
  </div><DialogFooter><Button variant="outline" onClick={()=>onOpenChange(false)}>{ar?"إلغاء":"Cancel"}</Button><Button disabled={save.isPending} onClick={()=>save.mutate()}>{ar?"حفظ":"Save settings"}</Button></DialogFooter></DialogContent></Dialog>;
}

function BookingRow({booking,table,currency,ar,lang,busy,onStatus}:{booking:Booking;table:FloorTable|null;currency:string;ar:boolean;lang:"ar"|"en";busy:boolean;onStatus:(status:BookingStatus,reason?:string)=>void}){
  const date=new Intl.DateTimeFormat(ar?"ar-JO":"en-JO",{dateStyle:"medium",timeStyle:"short"}).format(new Date(booking.booking_at));
  return <article className="grid gap-4 p-4 sm:p-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold">{booking.customer_name}</h3><Badge variant={booking.status==="seated"?"default":booking.status==="cancelled"||booking.status==="no_show"?"destructive":"secondary"}>{statusLabel(booking.status,ar)}</Badge><span className="rounded-full bg-muted px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{booking.source}</span></div><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span>{date}</span><span>{booking.duration_minutes} min</span><span className="inline-flex items-center gap-1"><UsersRound className="size-3.5"/>{booking.guest_count}</span><span>{table?(table.table_name??`#${table.table_number}`):(ar?"بدون طاولة":"No table")}</span>{booking.phone?<span>{booking.phone}</span>:null}{booking.email?<span>{booking.email}</span>:null}</div><div className="mt-2 flex flex-wrap gap-2 text-[10px] text-muted-foreground"><span>{ar?"رمز: ":"Code: "}<strong className="font-mono text-foreground">{booking.confirmation_code}</strong></span>{booking.occasion?<span>· {booking.occasion}</span>:null}{booking.deposit_amount>0?<span>· {ar?"عربون ":"Deposit "}{formatMoney(booking.deposit_amount,currency,lang)} ({booking.deposit_status})</span>:null}</div>{booking.notes?<p className="mt-2 text-xs leading-5 text-muted-foreground">{booking.notes}</p>:null}{booking.cancel_reason?<p className="mt-2 text-xs text-red-600">{ar?"سبب الإلغاء: ":"Cancellation: "}{booking.cancel_reason}</p>:null}</div><div className="flex flex-wrap gap-2 xl:justify-end">
    {booking.status==="pending"?<Button size="sm" disabled={busy} onClick={()=>onStatus("confirmed")}><CheckCircle2 className="size-4"/>{ar?"تأكيد":"Confirm"}</Button>:null}
    {booking.status==="confirmed"?<><Button size="sm" disabled={busy} onClick={()=>onStatus("seated")}><UserRoundCheck className="size-4"/>{ar?"تم الجلوس":"Seat guests"}</Button><Button size="sm" variant="outline" disabled={busy} onClick={()=>onStatus("no_show")}><XCircle className="size-4"/>{ar?"لم يحضر":"No-show"}</Button></>:null}
    {booking.status==="seated"?<Button size="sm" variant="outline" disabled={busy} onClick={()=>onStatus("completed")}><CheckCircle2 className="size-4"/>{ar?"اكتمال":"Complete"}</Button>:null}
    {(booking.status==="pending"||booking.status==="confirmed")?<Button size="sm" variant="ghost" disabled={busy} onClick={()=>onStatus("cancelled",ar?"ألغاه الموظف":"Cancelled by staff")}><XCircle className="size-4"/>{ar?"إلغاء":"Cancel"}</Button>:null}
  </div></article>;
}

function Metric({icon:Icon,label,value}:{icon:typeof CalendarCheck2;label:string;value:number}){return <article className="qs-stat flex min-h-[108px] items-center gap-4 p-4"><span className="grid size-11 place-items-center rounded-2xl bg-orange-500/10 text-[#ff5a0a]"><Icon className="size-5"/></span><div><p className="text-[11px] font-semibold text-muted-foreground">{label}</p><strong className="mt-1 block font-display text-3xl tracking-[-.04em]">{value}</strong></div></article>;}
function Field({label,children}:{label:string;children:React.ReactNode}){return <div className="space-y-1.5"><Label className="text-xs font-bold">{label}</Label>{children}</div>;}
function Toggle({label,value,onChange}:{label:string;value:boolean;onChange:(v:boolean)=>void}){return <button type="button" onClick={()=>onChange(!value)} className={cn("flex items-center justify-between rounded-xl border p-4 text-start",value?"border-[#ff5a0a] bg-orange-500/5":"border-border")}><span className="text-sm font-semibold">{label}</span><span className={cn("relative h-6 w-11 rounded-full transition",value?"bg-[#ff5a0a]":"bg-muted")}><span className={cn("absolute top-1 size-4 rounded-full bg-white shadow transition",value?"start-6":"start-1")}/></span></button>;}
function localInput(d:Date){const local=new Date(d.getTime()-d.getTimezoneOffset()*60_000);local.setMinutes(Math.ceil(local.getMinutes()/15)*15,0,0);return local.toISOString().slice(0,16);}
function statusLabel(status:string,ar:boolean){const labels:Record<string,[string,string]>={pending:["Pending","قيد الانتظار"],confirmed:["Confirmed","مؤكد"],seated:["Seated","تم الجلوس"],completed:["Completed","مكتمل"],cancelled:["Cancelled","ملغي"],no_show:["No-show","لم يحضر"],free:["Free","متاحة"],reserved:["Reserved","محجوزة"],active:["Active","نشطة"],cleaning:["Cleaning","تنظيف"],out_of_service:["Out of service","خارج الخدمة"]};return labels[status]?.[ar?1:0]??status;}
