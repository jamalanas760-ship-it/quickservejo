import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, CalendarCheck2, CalendarDays, Clock3, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { PublicReservationShell } from "@/components/reservations/PublicReservationShell";
import { addReservationDays, reservationDay } from "@/lib/reservation-studio";
import { PublicInfoCard } from "@/components/public/PublicGuestShell";
import { ReservationField as Field } from "@/components/reservations/ReservationField";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { humanError } from "@/lib/errors";
import { formatMoney } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/book/$slug")({
  head: () => ({
    meta: [
      { title: "Book a table — QuickServe" },
      { name: "description", content: "Reserve a table online with live restaurant availability." },
    ],
  }),
  component: PublicBookingPage,
});

type PageData = {
  restaurant:{id:string;name:string;slug:string;logo_url:string|null;cover_image_url:string|null;timezone:string;currency:string};
  settings:{
    online_enabled:boolean;slot_minutes:number;default_duration_minutes:number;min_party_size:number;max_party_size:number;
    min_lead_minutes:number;max_advance_days:number;require_phone:boolean;require_email:boolean;deposit_mode:string;deposit_amount:number;
    weekly_hours:Record<string,{open?:string;close?:string;closed?:boolean}>;terms:string|null;cancellation_cutoff_hours:number;
  };
};
type Slot={slot_at:string;available_tables:number};
type Created={booking_id:string;public_token:string;confirmation_code:string;status:string;booking_at:string;guest_count:number;deposit_amount:number;deposit_status:string;currency:string;restaurant_name:string};
type Waitlisted={id:string;public_token:string;status:string;desired_date:string;guest_count:number;position:number;restaurant_name:string};

function PublicBookingPage(){
  const {slug}=Route.useParams();
  const {lang}=useI18n();
  const [step,setStep]=useState<"visit"|"details">("visit");
  const ar=lang==="ar";
  const [date,setDate]=useState("");
  const [guests,setGuests]=useState(2);
  const [slot,setSlot]=useState("");
  const [name,setName]=useState("");
  const [phone,setPhone]=useState("");
  const [email,setEmail]=useState("");
  const [occasion,setOccasion]=useState("");
  const [notes,setNotes]=useState("");
  const [marketing,setMarketing]=useState(false);
  const [created,setCreated]=useState<Created|null>(null);
  const [waitlisted,setWaitlisted]=useState<Waitlisted|null>(null);

  const page=useQuery<PageData|null>({
    queryKey:["public-booking-page",slug],
    queryFn:async()=>{
      const {data,error}=await (supabase as any).rpc("get_public_booking_page",{_slug:slug});
      if(error)throw error;
      return data as PageData|null;
    },
  });

  const settings=page.data?.settings;
  const restaurant=page.data?.restaurant;
  const effectiveDate=date||todayInZone(restaurant?.timezone);
  const effectiveGuests=Math.max(settings?.min_party_size??1,Math.min(settings?.max_party_size??12,guests));

  const slots=useQuery<Slot[]>({
    queryKey:["public-booking-slots",slug,effectiveDate,effectiveGuests],
    enabled:Boolean(settings?.online_enabled&&effectiveDate&&effectiveGuests),
    queryFn:async()=>{
      const {data,error}=await (supabase as any).rpc("get_public_booking_slots",{_slug:slug,_booking_date:effectiveDate,_guest_count:effectiveGuests});
      if(error)throw error;
      return (data??[]) as Slot[];
    },
  });

  const create=useMutation({
    mutationFn:async()=>{
      if(!slot||(slots.data??[]).every(row=>row.slot_at!==slot)||!slots.isSuccess||slots.isFetching)throw new Error(ar?"اختر موعداً متاحاً":"Choose an available time");
      const {data,error}=await (supabase as any).rpc("create_public_booking",{
        _slug:slug,_customer_name:name.trim(),_phone:phone.trim(),_email:email.trim(),_guest_count:effectiveGuests,
        _booking_at:slot,_notes:notes.trim()||null,_occasion:occasion.trim()||null,_marketing_opt_in:marketing,
      });
      if(error)throw error;
      return data as Created;
    },
    onSuccess:(data)=>{setCreated(data);toast.success(ar?"تم إرسال الحجز":"Booking submitted");},
    onError:(error)=>{void slots.refetch();toast.error(humanError(error,lang));},
  });

  const joinWaitlist=useMutation({
    mutationFn:async()=>{
      const {data,error}=await (supabase as any).rpc("create_public_booking_waitlist",{
        _slug:slug,_customer_name:name.trim(),_phone:phone.trim(),_email:email.trim(),_guest_count:effectiveGuests,
        _desired_date:effectiveDate,_preferred_time:null,_notes:notes.trim()||null,_occasion:occasion.trim()||null,
      });
      if(error)throw error;
      return data as Waitlisted;
    },
    onSuccess:(data)=>{setWaitlisted(data);toast.success(ar?"تمت إضافتك لقائمة الانتظار":"You joined the waitlist");},
    onError:(error)=>toast.error(humanError(error,lang)),
  });

  const maxDate=useMemo(()=>{
    if(!settings||!restaurant)return "";
    return addReservationDays(todayInZone(restaurant.timezone),settings.max_advance_days);
  },[restaurant,settings]);

  if(page.isPending)return <main className="min-h-dvh bg-[#f6f7f9] p-4 sm:p-8"><Skeleton className="mx-auto h-[720px] max-w-2xl rounded-[24px]"/></main>;
  if(page.isError||!restaurant||!settings)return <PublicReservationShell title={ar?"الحجز غير متاح":"Booking unavailable"} description={ar?"تعذر تحميل صفحة الحجز لهذا المطعم.":"This restaurant booking page could not be loaded."}><div/></PublicReservationShell>;
  if(!settings.online_enabled)return <PublicReservationShell logoUrl={restaurant.logo_url} brandName={restaurant.name} title={ar?"الحجز الإلكتروني متوقف":"Online reservations are paused"} description={ar?"يرجى التواصل مع المطعم مباشرة في الوقت الحالي.":"Please contact the restaurant directly for now."}><div/></PublicReservationShell>;

  if(waitlisted)return <PublicReservationShell
    logoUrl={restaurant.logo_url}
    coverUrl={restaurant.cover_image_url}
    brandName={restaurant.name}
    eyebrow={ar?"QuickServe · قائمة الانتظار":"QuickServe · Waitlist"}
    title={ar?"تمت إضافتك لقائمة الانتظار":"You're on the waitlist"}
    description={ar?"سيتواصل المطعم معك عند توفر طاولة مناسبة.":"The restaurant can contact you when a suitable table becomes available."}
    status={{label:ar?"بانتظار طاولة":"Waiting for a table",tone:"blue"}}
    footer={<Button asChild variant="outline" className="w-full"><Link to="/r/$slug" params={{slug}}>{ar?"عرض القائمة":"View menu"}</Link></Button>}
  >
    <div className="grid gap-3 sm:grid-cols-3">
      <PublicInfoCard icon={CalendarDays} label={ar?"التاريخ المطلوب":"Requested date"} value={waitlisted.desired_date}/>
      <PublicInfoCard icon={UsersRound} label={ar?"عدد الضيوف":"Guests"} value={String(waitlisted.guest_count)} tone="blue"/>
      <PublicInfoCard icon={Clock3} label={ar?"ترتيب تقريبي":"Approx. position"} value={"#"+String(waitlisted.position)} tone="slate"/>
    </div>
  </PublicReservationShell>;

  if(created)return <PublicReservationShell
    logoUrl={restaurant.logo_url}
    coverUrl={restaurant.cover_image_url}
    brandName={restaurant.name}
    eyebrow={ar?"QuickServe · الحجز":"QuickServe · Reservation"}
    title={ar?"تم استلام الحجز":"Reservation received"}
    description={created.status==="confirmed"?(ar?"الحجز مؤكد.":"Your reservation is confirmed."):(ar?"الحجز قيد التأكيد من المطعم.":"The restaurant will confirm your reservation shortly.")}
    status={{label:created.status==="confirmed"?(ar?"مؤكد":"Confirmed"):(ar?"قيد التأكيد":"Pending confirmation"),tone:created.status==="confirmed"?"green":"orange"}}
    footer={<div className="grid gap-2 sm:grid-cols-2"><Button asChild><Link to="/booking/$token" params={{token:created.public_token}}>{ar?"إدارة الحجز":"Manage booking"}</Link></Button><Button asChild variant="outline"><Link to="/r/$slug" params={{slug}}>{ar?"عرض القائمة":"View menu"}</Link></Button></div>}
  >
    <section className="rounded-[18px] border border-border/80 bg-background p-5 text-center">
      <p className="text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground">{ar?"رمز الحجز":"Confirmation code"}</p>
      <strong className="mt-1 block font-mono text-3xl tracking-[.16em]">{created.confirmation_code}</strong>
    </section>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <PublicInfoCard icon={Clock3} label={ar?"الموعد":"Date & time"} value={new Intl.DateTimeFormat(ar?"ar-JO":"en-US",{dateStyle:"medium",timeStyle:"short",timeZone:restaurant.timezone}).format(new Date(created.booking_at))}/>
      <PublicInfoCard icon={UsersRound} label={ar?"عدد الضيوف":"Guests"} value={String(created.guest_count)} tone="blue"/>
    </div>
    {created.deposit_amount>0?<div className="mt-3 rounded-[18px] border border-amber-200 bg-amber-50/70 p-4 text-xs leading-5 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">{ar?"يتطلب الحجز عربوناً بقيمة ":"A reservation deposit is required: "}{formatMoney(created.deposit_amount,created.currency,lang)}. {ar?"استخدم إدارة الحجز للدفع بأمان.":"Use Manage booking to pay securely."}</div>:null}
  </PublicReservationShell>;

  const visitReady=slots.isSuccess&&!slots.isFetching&&Boolean(slot&&(slots.data??[]).some(row=>row.slot_at===slot));
  const soldOut=slots.isSuccess&&!slots.isFetching&&(slots.data??[]).length===0;
  const dates=Array.from({length:3},(_,i)=>addReservationDays(effectiveDate,i)).filter(value=>!maxDate||value<=maxDate);
  function submit(event:React.FormEvent<HTMLFormElement>){event.preventDefault();if(soldOut)joinWaitlist.mutate();else if(visitReady)create.mutate();}
  return <PublicReservationShell logoUrl={restaurant.logo_url} coverUrl={restaurant.cover_image_url} brandName={restaurant.name} title={ar?"احجز طاولتك":"Reserve your table"} description={ar?"اختر موعد زيارتك ثم أضف بياناتك.":"Choose your visit, then add your details."}>
    {step==="visit"?<div className="rs-public-visit">
      <Field label={ar?"الضيوف":"Guests"}><div className="rs-choice-rail">{[2,3,4,5,6].filter(value=>value>=settings.min_party_size&&value<=settings.max_party_size).map(value=><button key={value} type="button" aria-pressed={effectiveGuests===value} onClick={()=>{setGuests(value);setSlot("");}}>{value}</button>)}<Input aria-label={ar?"عدد آخر للضيوف":"Custom guest count"} type="number" min={settings.min_party_size} max={settings.max_party_size} value={effectiveGuests} onChange={e=>{setGuests(Number(e.target.value)||settings.min_party_size);setSlot("");}}/></div></Field>
      <Field label={ar?"اختر التاريخ":"Select a date"}><div className="rs-public-dates"><Button variant="ghost" size="icon" disabled={effectiveDate<=todayInZone(restaurant.timezone)} aria-label={ar?"اليوم السابق":"Previous day"} onClick={()=>{setDate(addReservationDays(effectiveDate,-1));setSlot("");}}><ChevronLeft className="size-4"/></Button>{dates.map(value=><button key={value} type="button" aria-pressed={effectiveDate===value} onClick={()=>{setDate(value);setSlot("");}}><small>{new Intl.DateTimeFormat(ar?"ar-JO":"en-JO",{weekday:"short",timeZone:"UTC"}).format(new Date(value+"T12:00:00Z"))}</small><strong>{new Intl.DateTimeFormat(ar?"ar-JO":"en-JO",{month:ar?"2-digit":"short",day:"2-digit",timeZone:"UTC"}).format(new Date(value+"T12:00:00Z"))}</strong></button>)}<Button variant="ghost" size="icon" disabled={effectiveDate>=maxDate} aria-label={ar?"أيام تالية":"Next dates"} onClick={()=>{setDate(addReservationDays(effectiveDate,Math.min(3,Math.max(1,Math.round((Date.parse(maxDate)-Date.parse(effectiveDate))/86400000)))));setSlot("");}}><ChevronRight className="size-4"/></Button></div><Input aria-label={ar?"تاريخ آخر":"Choose another date"} className="mt-2" type="date" min={todayInZone(restaurant.timezone)} max={maxDate} value={effectiveDate} onChange={e=>{if(e.target.value){setDate(e.target.value);setSlot("");}}}/></Field>
      <Field label={ar?"الأوقات المتاحة":"Available times"}>{slots.isPending||slots.isFetching?<Skeleton className="h-24 rounded-xl"/>:slots.isError?<div role="alert" className="rs-public-error"><p>{humanError(slots.error,lang)}</p><Button variant="outline" onClick={()=>void slots.refetch()}>{ar?"إعادة المحاولة":"Try again"}</Button></div>:soldOut?<div className="rs-public-no-slots"><strong>{ar?"لا توجد طاولة متاحة":"No table available"}</strong><p>{ar?"اختر يوماً آخر أو انضم لقائمة الانتظار.":"Choose another date or join the waitlist."}</p></div>:<div className="rs-time-slots rs-public-times">{(slots.data??[]).map(row=><button key={row.slot_at} type="button" aria-pressed={slot===row.slot_at} onClick={()=>setSlot(row.slot_at)}>{new Intl.DateTimeFormat(ar?"ar-JO":"en-JO",{hour:"numeric",minute:"2-digit",timeZone:restaurant.timezone}).format(new Date(row.slot_at))}</button>)}</div>}</Field>
      <Button className="rs-public-continue" disabled={!visitReady&&!soldOut} onClick={()=>setStep("details")}>{soldOut?(ar?"الانضمام لقائمة الانتظار":"Join waitlist"):(ar?"متابعة":"Continue")}<ChevronRight className="size-4"/></Button>
    </div>:<form onSubmit={submit} className="rs-public-details">
      <Button variant="ghost" type="button" onClick={()=>setStep("visit")}><ChevronLeft className="size-4"/>{ar?"تغيير الموعد":"Change visit"}</Button>
      <div className="rs-booking-capsule"><CalendarDays className="size-4"/>{effectiveDate} · {effectiveGuests} {ar?"ضيوف":"guests"}{slot?` · ${new Intl.DateTimeFormat(ar?"ar-JO":"en-JO",{hour:"numeric",minute:"2-digit",timeZone:restaurant.timezone}).format(new Date(slot))}`:""}</div>
      <h2>{ar?"بياناتك":"Your details"}</h2>
      <div className="rs-form-guest-grid"><Field label={ar?"اسم الضيف":"Guest name"}><Input autoComplete="name" value={name} onChange={e=>setName(e.target.value)} maxLength={120} required/></Field><Field label={ar?"رقم الهاتف":"Phone number"}><Input autoComplete="tel" value={phone} onChange={e=>setPhone(e.target.value)} inputMode="tel" maxLength={40} required={settings.require_phone}/></Field><Field label={ar?"البريد الإلكتروني":"Email"}><Input autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} type="email" maxLength={160} required={settings.require_email}/></Field><Field label={ar?"المناسبة (اختياري)":"Occasion (optional)"}><Input value={occasion} onChange={e=>setOccasion(e.target.value)} maxLength={120}/></Field></div>
      <Field label={ar?"طلبات خاصة (اختياري)":"Special requests (optional)"}><Textarea value={notes} onChange={e=>setNotes(e.target.value)} maxLength={1000} rows={2}/></Field>
      <label className="rs-marketing-opt-in"><Checkbox checked={marketing} onCheckedChange={value=>setMarketing(value===true)}/><span>{ar?"أرغب باستقبال عروض المطعم (اختياري).":"I'd like to receive restaurant offers (optional)."}</span></label>
      {settings.terms?<p className="rs-public-terms">{settings.terms}</p>:null}
      {settings.deposit_mode!=="none"&&settings.deposit_amount>0?<p className="rs-public-terms">{ar?"العربون المطلوب: ":"Required deposit: "}{formatMoney(settings.deposit_amount*(settings.deposit_mode==="per_guest"?effectiveGuests:1),restaurant.currency,lang)}</p>:null}
      {!visitReady&&!soldOut?<p role="status" className="text-sm text-muted-foreground">{ar?"راجع الأوقات المتاحة قبل التأكيد.":"Review available times before confirming."}</p>:null}
      <Button type="submit" className="rs-public-continue" disabled={create.isPending||joinWaitlist.isPending||(!visitReady&&!soldOut)||name.trim().length<1||(settings.require_phone&&phone.trim().length<5)}>{create.isPending||joinWaitlist.isPending?(ar?"جارٍ الحفظ…":"Saving…"):soldOut?(ar?"انضم لقائمة الانتظار":"Join waitlist"):(ar?"تأكيد الحجز":"Confirm booking")}</Button>
    </form>}
  </PublicReservationShell>;
}

function todayInZone(timezone?:string){return reservationDay(new Date(),timezone||"UTC");}
