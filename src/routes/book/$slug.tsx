import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarCheck2, CalendarDays, Clock3, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { PublicGuestShell, PublicInfoCard } from "@/components/public/PublicGuestShell";
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
      if(!slot)throw new Error(ar?"اختر موعداً متاحاً":"Choose an available time");
      const {data,error}=await (supabase as any).rpc("create_public_booking",{
        _slug:slug,_customer_name:name.trim(),_phone:phone.trim(),_email:email.trim(),_guest_count:effectiveGuests,
        _booking_at:slot,_notes:notes.trim()||null,_occasion:occasion.trim()||null,_marketing_opt_in:marketing,
      });
      if(error)throw error;
      return data as Created;
    },
    onSuccess:(data)=>{setCreated(data);toast.success(ar?"تم إرسال الحجز":"Booking submitted");},
    onError:(error)=>toast.error(humanError(error,lang)),
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
    const base=new Date(new Date().toLocaleString("en-US",{timeZone:restaurant.timezone}));
    base.setDate(base.getDate()+settings.max_advance_days);
    return base.toLocaleDateString("en-CA");
  },[restaurant,settings]);

  if(page.isPending)return <main className="min-h-dvh bg-[#f6f7f9] p-4 sm:p-8"><Skeleton className="mx-auto h-[720px] max-w-2xl rounded-[24px]"/></main>;
  if(page.isError||!restaurant||!settings)return <PublicGuestShell title={ar?"الحجز غير متاح":"Booking unavailable"} description={ar?"تعذر تحميل صفحة الحجز لهذا المطعم.":"This restaurant booking page could not be loaded."}><div/></PublicGuestShell>;
  if(!settings.online_enabled)return <PublicGuestShell logoUrl={restaurant.logo_url} brandName={restaurant.name} title={ar?"الحجز الإلكتروني متوقف":"Online reservations are paused"} description={ar?"يرجى التواصل مع المطعم مباشرة في الوقت الحالي.":"Please contact the restaurant directly for now."}><div/></PublicGuestShell>;

  if(waitlisted)return <PublicGuestShell
    logoUrl={restaurant.logo_url}
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
  </PublicGuestShell>;

  if(created)return <PublicGuestShell
    logoUrl={restaurant.logo_url}
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
  </PublicGuestShell>;

  return <PublicGuestShell
    logoUrl={restaurant.logo_url}
    brandName={restaurant.name}
    eyebrow={ar?"QuickServe · حجز طاولة":"QuickServe · Table reservation"}
    title={ar?"احجز طاولتك":"Reserve your table"}
    description={ar?"اختر التاريخ وعدد الضيوف ثم اختر وقتاً متاحاً. يتم فحص التوفر مباشرة قبل تأكيد الحجز.":"Choose a date and party size, then pick a live available time. Availability is checked again before confirmation."}
    footer={<p className="text-center text-[10px] text-muted-foreground">{ar?"التوفر يتحدث مباشرة وقد يتغير حتى لحظة التأكيد.":"Live availability can change until the reservation is confirmed."}</p>}
  >
    <div className="space-y-6">
      <section>
        <StepHeading number="1" icon={CalendarDays} title={ar?"التاريخ وعدد الضيوف":"Date & party size"}/>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label={ar?"التاريخ":"Date"}><Input type="date" min={todayInZone(restaurant.timezone)} max={maxDate} value={effectiveDate} onChange={e=>{setDate(e.target.value);setSlot("");}}/></Field>
          <Field label={ar?"عدد الضيوف":"Guests"}><Input type="number" min={settings.min_party_size} max={settings.max_party_size} value={effectiveGuests} onChange={e=>{setGuests(Number(e.target.value)||settings.min_party_size);setSlot("");}}/></Field>
        </div>
      </section>

      <section className="border-t border-border/80 pt-5">
        <StepHeading number="2" icon={Clock3} title={ar?"الأوقات المتاحة":"Live availability"}/>
        {slots.isPending?<Skeleton className="mt-3 h-28 rounded-2xl"/>:slots.isError?<p className="mt-3 text-sm text-destructive">{humanError(slots.error,lang)}</p>:(slots.data??[]).length===0
          ?<div className="mt-3 rounded-2xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground"><strong className="block text-foreground">{ar?"لا توجد طاولة متاحة حالياً":"No table is currently available"}</strong><span className="mt-1 block">{ar?"أدخل بياناتك أدناه وانضم لقائمة الانتظار لهذا اليوم.":"Enter your details below and join the waitlist for this day."}</span></div>
          :<div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">{(slots.data??[]).map(row=><button key={row.slot_at} type="button" onClick={()=>setSlot(row.slot_at)} className={cn("rounded-xl border px-3 py-3 text-sm font-bold transition",slot===row.slot_at?"border-[#e85d2a] bg-orange-500/10 text-[#e34d00] shadow-sm":"border-border bg-background hover:border-foreground/15 hover:bg-muted/40")}><span className="block">{new Intl.DateTimeFormat(ar?"ar-JO":"en-US",{hour:"2-digit",minute:"2-digit",timeZone:restaurant.timezone}).format(new Date(row.slot_at))}</span><span className="mt-1 block text-[9px] font-medium text-muted-foreground">{row.available_tables} {ar?"طاولات":"tables"}</span></button>)}</div>}
      </section>

      <section className="border-t border-border/80 pt-5">
        <StepHeading number="3" icon={UsersRound} title={ar?"بيانات الحجز":"Guest details"}/>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label={ar?"الاسم":"Name"}><Input value={name} onChange={e=>setName(e.target.value)} maxLength={120} required/></Field>
          <Field label={ar?"الهاتف":"Phone"}><Input value={phone} onChange={e=>setPhone(e.target.value)} inputMode="tel" maxLength={40} required={settings.require_phone}/></Field>
          <Field label={ar?"البريد الإلكتروني":"Email"}><Input value={email} onChange={e=>setEmail(e.target.value)} type="email" maxLength={160} required={settings.require_email}/></Field>
          <Field label={ar?"المناسبة":"Occasion"}><Input value={occasion} onChange={e=>setOccasion(e.target.value)} maxLength={120} placeholder={ar?"عيد ميلاد، ذكرى...":"Birthday, anniversary..."}/></Field>
        </div>
        <Field label={ar?"طلبات أو ملاحظات خاصة":"Special requests"} className="mt-3"><Textarea value={notes} onChange={e=>setNotes(e.target.value)} maxLength={1000} rows={3}/></Field>
        <label className="mt-4 flex items-start gap-3 rounded-xl border border-border/80 bg-muted/20 p-3 text-xs leading-5 text-muted-foreground"><Checkbox checked={marketing} onCheckedChange={value=>setMarketing(value===true)} className="mt-0.5"/><span>{ar?"أوافق على استقبال عروض ورسائل تسويقية من المطعم. هذا اختياري ولا يؤثر على الحجز.":"I agree to receive restaurant marketing messages. This is optional and does not affect the reservation."}</span></label>
      </section>

      {settings.terms?<div className="rounded-xl bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">{settings.terms}</div>:null}

      {(slots.data??[]).length===0
        ?<Button className="h-12 w-full text-sm" variant="outline" disabled={joinWaitlist.isPending||name.trim().length<1||(settings.require_phone&&phone.trim().length<5)||(settings.require_email&&!email.includes("@"))} onClick={()=>joinWaitlist.mutate()}>{joinWaitlist.isPending?(ar?"جارٍ الانضمام…":"Joining waitlist…"):(ar?"انضم لقائمة الانتظار":"Join waitlist")}</Button>
        :<Button className="h-12 w-full text-sm" disabled={create.isPending||!slot||name.trim().length<1||(settings.require_phone&&phone.trim().length<5)||(settings.require_email&&!email.includes("@"))} onClick={()=>create.mutate()}>{create.isPending?(ar?"جارٍ تأكيد التوفر…":"Confirming availability…"):(ar?"احجز الطاولة":"Reserve table")}</Button>}
    </div>
  </PublicGuestShell>;
}

function todayInZone(timezone?:string){
  try{return new Date().toLocaleDateString("en-CA",{timeZone:timezone||"UTC"});}catch{return new Date().toLocaleDateString("en-CA");}
}
function Field({label,children,className}:{label:string;children:React.ReactNode;className?:string}){return <div className={cn("space-y-1.5",className)}><Label className="text-xs font-bold">{label}</Label>{children}</div>;}
function StepHeading({number,icon:Icon,title}:{number:string;icon:typeof CalendarCheck2;title:string}){return <div className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-xl bg-orange-500/10 text-xs font-black text-[#e34d00]">{number}</span><Icon className="size-4 text-[#e85d2a]"/><h2 className="font-bold">{title}</h2></div>;}
