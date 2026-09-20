import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck2, Clock3, CreditCard, UsersRound, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { BookingDepositPaymentDialog } from "@/components/payments/BookingDepositPaymentDialog";
import { PublicGuestShell, PublicInfoCard } from "@/components/public/PublicGuestShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { humanError } from "@/lib/errors";
import { formatMoney } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/booking/$token")({
  head:()=>({meta:[{title:"Manage reservation — QuickServe"}]}),
  component:BookingStatusPage,
});

type Data={
  restaurant:{name:string;slug:string;logo_url:string|null;currency:string;timezone:string};
  booking:{confirmation_code:string;booking_at:string;ends_at:string;guest_count:number;status:string;occasion:string|null;deposit_amount:number;deposit_status:string;can_cancel:boolean};
};

function BookingStatusPage(){
  const {token}=Route.useParams();
  const {lang}=useI18n();
  const ar=lang==="ar";
  const qc=useQueryClient();
  const [reason,setReason]=useState("");
  const [depositOpen,setDepositOpen]=useState(false);

  const query=useQuery<Data|null>({
    queryKey:["public-booking-status",token],
    queryFn:async()=>{
      const {data,error}=await (supabase as any).rpc("get_public_booking_status",{_token:token});
      if(error)throw error;
      return data as Data|null;
    },
  });

  const cancel=useMutation({
    mutationFn:async()=>{
      const {data,error}=await (supabase as any).rpc("cancel_public_booking",{_token:token,_reason:reason.trim()||null});
      if(error)throw error;
      if(!data)throw new Error("Booking not found");
    },
    onSuccess:async()=>{
      await qc.invalidateQueries({queryKey:["public-booking-status",token]});
      toast.success(ar?"تم إلغاء الحجز":"Reservation cancelled");
    },
    onError:(error)=>toast.error(humanError(error,lang)),
  });

  if(query.isPending)return <main className="min-h-dvh bg-[#f6f7f9] p-4 sm:p-8"><Skeleton className="mx-auto h-[560px] max-w-2xl rounded-[24px]"/></main>;
  if(query.isError||!query.data)return <PublicGuestShell title={ar?"الحجز غير موجود":"Reservation not found"} description={ar?"قد يكون الرابط غير صالح أو لم يعد الحجز متاحاً.":"This link may be invalid or the reservation is no longer available."}><div/></PublicGuestShell>;

  const {restaurant,booking}=query.data;
  const final=["completed","cancelled","no_show"].includes(booking.status);
  const good=booking.status==="confirmed"||booking.status==="seated"||booking.status==="completed";
  const bad=booking.status==="cancelled"||booking.status==="no_show";
  const statusLabel=ar
    ? ({pending:"قيد التأكيد",confirmed:"مؤكد",seated:"تم الجلوس",completed:"مكتمل",cancelled:"ملغي",no_show:"لم يحضر"} as Record<string,string>)[booking.status]??booking.status
    : booking.status.replaceAll("_"," ");

  return <>
    <PublicGuestShell
      logoUrl={restaurant.logo_url}
      brandName={restaurant.name}
      eyebrow={ar?"QuickServe · الحجز":"QuickServe · Reservation"}
      title={ar?"إدارة الحجز":"Manage reservation"}
      description={ar?"راجع تفاصيل الحجز، حالة العربون وخيارات الإلغاء من مكان واحد.":"Review your booking details, deposit status and available actions in one place."}
      status={{label:statusLabel,tone:good?"green":bad?"red":"orange"}}
      footer={<Button asChild variant="outline" className="w-full"><Link to="/r/$slug" params={{slug:restaurant.slug}}>{ar?"عرض قائمة المطعم":"View restaurant menu"}</Link></Button>}
    >
      <div className="space-y-4">
        <section className="rounded-[18px] border border-border/80 bg-background p-4">
          <p className="text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground">{ar?"رمز الحجز":"Confirmation code"}</p>
          <strong className="mt-1 block font-mono text-2xl tracking-[.14em]">{booking.confirmation_code}</strong>
        </section>

        <div className="grid gap-3 sm:grid-cols-2">
          <PublicInfoCard
            icon={Clock3}
            label={ar?"الموعد":"Date & time"}
            value={new Intl.DateTimeFormat(ar?"ar-JO":"en-US",{dateStyle:"medium",timeStyle:"short",timeZone:restaurant.timezone}).format(new Date(booking.booking_at))}
          />
          <PublicInfoCard icon={UsersRound} label={ar?"الضيوف":"Guests"} value={String(booking.guest_count)} tone="blue"/>
        </div>

        {booking.occasion?<section className="rounded-[18px] border border-border/80 bg-muted/25 p-4"><p className="text-[10px] font-semibold uppercase tracking-[.08em] text-muted-foreground">{ar?"المناسبة":"Occasion"}</p><strong className="mt-1 block text-sm">{booking.occasion}</strong></section>:null}

        {booking.deposit_amount>0?<section className="rounded-[18px] border border-border/80 bg-background p-4">
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-[10px] font-semibold uppercase tracking-[.08em] text-muted-foreground">{ar?"العربون":"Deposit"}</p><strong className="mt-1 block text-lg">{formatMoney(booking.deposit_amount,restaurant.currency,lang)}</strong></div>
            <span className="rounded-full bg-muted px-3 py-1.5 text-[10px] font-bold capitalize text-muted-foreground">{booking.deposit_status.replaceAll("_"," ")}</span>
          </div>
          {!final&&booking.deposit_status!=="paid"&&booking.deposit_status!=="waived"&&booking.deposit_status!=="refunded"
            ?<Button type="button" className="mt-4 w-full" onClick={()=>setDepositOpen(true)}><CreditCard className="size-4"/>{ar?"دفع العربون":"Pay deposit"}</Button>
            :booking.deposit_status==="paid"
              ?<div className="mt-4 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-700">{ar?"تم تأكيد دفع العربون":"Deposit payment confirmed"}</div>
              :null}
        </section>:null}

        {booking.can_cancel?<section className="rounded-[18px] border border-red-200/80 bg-red-50/40 p-4 dark:border-red-900/50 dark:bg-red-950/10">
          <div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-red-500/10 text-red-600"><XCircle className="size-4"/></span><div><h2 className="font-bold">{ar?"إلغاء الحجز":"Cancel reservation"}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{ar?"يمكنك الإلغاء قبل انتهاء مهلة الإلغاء المحددة من المطعم.":"You can cancel while the restaurant cancellation window is still open."}</p></div></div>
          <Input className="mt-3" value={reason} onChange={e=>setReason(e.target.value)} maxLength={500} placeholder={ar?"سبب الإلغاء (اختياري)":"Reason (optional)"}/>
          <Button className="mt-3 w-full sm:w-auto" variant="destructive" disabled={cancel.isPending} onClick={()=>cancel.mutate()}><XCircle className="size-4"/>{ar?"إلغاء الحجز":"Cancel reservation"}</Button>
        </section>:final?<section className="rounded-[18px] border border-border/80 bg-muted/25 p-4 text-center text-sm text-muted-foreground">{ar?"هذا الحجز مغلق ولا يمكن تعديله.":"This reservation is closed and can no longer be changed."}</section>:null}
      </div>
    </PublicGuestShell>

    <BookingDepositPaymentDialog
      open={depositOpen}
      onOpenChange={setDepositOpen}
      bookingToken={token}
      confirmationCode={booking.confirmation_code}
      amount={booking.deposit_amount}
      currency={restaurant.currency}
      onSettled={async()=>{await qc.invalidateQueries({queryKey:["public-booking-status",token]});}}
    />
  </>;
}
