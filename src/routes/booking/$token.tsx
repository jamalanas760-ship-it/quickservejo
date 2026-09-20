import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck2, CheckCircle2, Clock3, CreditCard, UsersRound, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { BookingDepositPaymentDialog } from "@/components/payments/BookingDepositPaymentDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { humanError } from "@/lib/errors";
import { formatMoney } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

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
    onSuccess:async()=>{await qc.invalidateQueries({queryKey:["public-booking-status",token]});toast.success(ar?"تم إلغاء الحجز":"Reservation cancelled");},
    onError:(error)=>toast.error(humanError(error,lang)),
  });

  if(query.isPending)return <main className="mx-auto min-h-dvh max-w-xl p-4 sm:p-8"><Skeleton className="h-[560px] rounded-[32px]"/></main>;
  if(query.isError||!query.data)return <main className="grid min-h-dvh place-items-center p-6 text-center"><div><CalendarCheck2 className="mx-auto size-10 text-muted-foreground"/><h1 className="mt-4 text-2xl font-bold">{ar?"الحجز غير موجود":"Reservation not found"}</h1></div></main>;
  const {restaurant,booking}=query.data;
  const final=["completed","cancelled","no_show"].includes(booking.status);
  return <main className="min-h-dvh bg-muted/20 p-4 sm:p-8"><section className="mx-auto max-w-xl overflow-hidden rounded-[32px] border bg-card shadow-xl"><div className="border-b p-6 text-center sm:p-8">{restaurant.logo_url?<img src={restaurant.logo_url} alt="" className="mx-auto size-16 rounded-2xl border object-contain p-1"/>:<span className="mx-auto grid size-16 place-items-center rounded-2xl bg-orange-500/10 text-[#ff5a0a]"><CalendarCheck2 className="size-7"/></span>}<h1 className="mt-4 font-display text-2xl font-bold">{restaurant.name}</h1><p className="mt-1 text-xs text-muted-foreground">{ar?"إدارة الحجز":"Reservation management"}</p></div><div className="space-y-5 p-5 sm:p-8"><div className="flex items-center justify-between gap-3"><div><p className="text-xs text-muted-foreground">{ar?"رمز الحجز":"Confirmation code"}</p><strong className="font-mono text-2xl tracking-[.12em]">{booking.confirmation_code}</strong></div><Status value={booking.status} ar={ar}/></div><div className="grid grid-cols-2 gap-3"><Info icon={Clock3} label={ar?"الموعد":"Date & time"} value={new Intl.DateTimeFormat(ar?"ar-JO":"en-US",{dateStyle:"medium",timeStyle:"short",timeZone:restaurant.timezone}).format(new Date(booking.booking_at))}/><Info icon={UsersRound} label={ar?"الضيوف":"Guests"} value={String(booking.guest_count)}/></div>{booking.occasion?<div className="rounded-xl bg-muted/40 p-3 text-sm"><span className="text-xs text-muted-foreground">{ar?"المناسبة":"Occasion"}</span><strong className="mt-1 block">{booking.occasion}</strong></div>:null}{booking.deposit_amount>0?<div className="rounded-xl border p-3 text-sm"><div className="flex justify-between"><span>{ar?"العربون":"Deposit"}</span><strong>{formatMoney(booking.deposit_amount,restaurant.currency,lang)}</strong></div><p className="mt-1 text-xs text-muted-foreground">{ar?"الحالة: ":"Status: "}{booking.deposit_status}</p>{!final&&booking.deposit_status!=="paid"&&booking.deposit_status!=="waived"&&booking.deposit_status!=="refunded"?<Button type="button" className="mt-3 w-full" onClick={()=>setDepositOpen(true)}><CreditCard className="size-4"/>{ar?"دفع العربون":"Pay deposit"}</Button>:booking.deposit_status==="paid"?<div className="mt-3 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-700">{ar?"تم تأكيد دفع العربون":"Deposit payment confirmed"}</div>:null}</div>:null}{booking.can_cancel?<div className="rounded-2xl border border-red-200 p-4 dark:border-red-900/50"><h2 className="font-bold">{ar?"إلغاء الحجز":"Cancel reservation"}</h2><p className="mt-1 text-xs text-muted-foreground">{ar?"يمكنك الإلغاء قبل انتهاء مهلة الإلغاء المحددة من المطعم.":"You can cancel while the restaurant cancellation window is still open."}</p><Input className="mt-3" value={reason} onChange={e=>setReason(e.target.value)} maxLength={500} placeholder={ar?"سبب الإلغاء (اختياري)":"Reason (optional)"}/><Button className="mt-3" variant="destructive" disabled={cancel.isPending} onClick={()=>cancel.mutate()}><XCircle className="size-4"/>{ar?"إلغاء الحجز":"Cancel reservation"}</Button></div>:final?<div className="rounded-xl bg-muted/40 p-4 text-center text-sm text-muted-foreground">{ar?"هذا الحجز مغلق ولا يمكن تعديله.":"This reservation is closed and can no longer be changed."}</div>:null}<Button asChild variant="outline" className="w-full"><Link to="/r/$slug" params={{slug:restaurant.slug}}>{ar?"عرض القائمة":"View menu"}</Link></Button></div></section><BookingDepositPaymentDialog open={depositOpen} onOpenChange={setDepositOpen} bookingToken={token} confirmationCode={booking.confirmation_code} amount={booking.deposit_amount} currency={restaurant.currency} onSettled={async()=>{await qc.invalidateQueries({queryKey:["public-booking-status",token]});}}/></main>;
}
function Status({value,ar}:{value:string;ar:boolean}){const good=value==="confirmed"||value==="seated"||value==="completed";const bad=value==="cancelled"||value==="no_show";return <span className={cn("inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold capitalize",good?"bg-emerald-500/10 text-emerald-700":bad?"bg-red-500/10 text-red-700":"bg-amber-500/10 text-amber-700")}>{good?<CheckCircle2 className="size-3.5"/>:bad?<XCircle className="size-3.5"/>:null}{ar?({pending:"قيد التأكيد",confirmed:"مؤكد",seated:"تم الجلوس",completed:"مكتمل",cancelled:"ملغي",no_show:"لم يحضر"} as Record<string,string>)[value]??value:value.replaceAll("_"," ")}</span>;}
function Info({icon:Icon,label,value}:{icon:typeof Clock3;label:string;value:string}){return <div className="rounded-xl bg-muted/40 p-3"><Icon className="size-4 text-[#ff5a0a]"/><p className="mt-2 text-[10px] text-muted-foreground">{label}</p><strong className="mt-1 block text-sm">{value}</strong></div>;}
