import { useEffect, useRef, useState } from "react";
import { CreditCard, LoaderCircle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { humanError } from "@/lib/errors";
import { formatMoney } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

type StripeElementLike={mount:(target:HTMLElement)=>void;destroy:()=>void};
type StripeElementsLike={create:(type:"payment",options?:Record<string,unknown>)=>StripeElementLike};
type StripePaymentIntentLike={status:string};
type StripeInstanceLike={
  elements:(options:{clientSecret:string;appearance?:Record<string,unknown>})=>StripeElementsLike;
  confirmPayment:(options:{elements:StripeElementsLike;confirmParams:{return_url:string};redirect:"if_required"})=>Promise<{error?:{message?:string};paymentIntent?:StripePaymentIntentLike}>;
};
declare global{interface Window{Stripe?:(key:string,options?:{stripeAccount:string})=>StripeInstanceLike;}}

type IntentResponse={
  intentRecordId?:string;
  providerIntentId?:string;
  clientSecret?:string;
  publishableKey?:string;
  stripeAccount?:string|null;
  status:string;
  settled?:boolean;
};

async function loadStripeJs(){
  if(window.Stripe)return;
  await new Promise<void>((resolve,reject)=>{
    const existing=document.querySelector<HTMLScriptElement>('script[src="https://js.stripe.com/v3/"]');
    if(existing){existing.addEventListener("load",()=>resolve(),{once:true});existing.addEventListener("error",()=>reject(new Error("Stripe.js failed to load")),{once:true});return;}
    const script=document.createElement("script");
    script.src="https://js.stripe.com/v3/";
    script.async=true;
    script.onload=()=>resolve();
    script.onerror=()=>reject(new Error("Stripe.js failed to load"));
    document.head.appendChild(script);
  });
}

export function BookingDepositPaymentDialog({
  open,onOpenChange,bookingToken,confirmationCode,amount,currency,onSettled,
}:{
  open:boolean;
  onOpenChange:(open:boolean)=>void;
  bookingToken:string;
  confirmationCode:string;
  amount:number;
  currency:string;
  onSettled:()=>void|Promise<void>;
}){
  const {lang}=useI18n();
  const ar=lang==="ar";
  const mountRef=useRef<HTMLDivElement|null>(null);
  const stripeRef=useRef<StripeInstanceLike|null>(null);
  const elementsRef=useRef<StripeElementsLike|null>(null);
  const elementRef=useRef<StripeElementLike|null>(null);
  const [intent,setIntent]=useState<IntentResponse|null>(null);
  const [loading,setLoading]=useState(false);
  const [paying,setPaying]=useState(false);
  const [error,setError]=useState<string|null>(null);

  useEffect(()=>{
    if(!open){
      elementRef.current?.destroy();
      elementRef.current=null;
      elementsRef.current=null;
      stripeRef.current=null;
      setIntent(null);
      setError(null);
      setLoading(false);
      setPaying(false);
      return;
    }
    let cancelled=false;
    setLoading(true);
    setError(null);
    void (async()=>{
      try{
        const {data,error:invokeError}=await supabase.functions.invoke("quickserve-payments",{body:{
          action:"booking_deposit_create",
          bookingToken,
        }});
        if(invokeError)throw invokeError;
        if(data?.settled){
          if(!cancelled){
            toast.success(ar?"العربون مدفوع بالفعل":"Reservation deposit is already paid");
            await onSettled();
            onOpenChange(false);
          }
          return;
        }
        if(!data?.clientSecret||!data?.publishableKey||!data?.intentRecordId)throw new Error(data?.error||"Payment provider did not return a client secret");
        if(!cancelled)setIntent(data as IntentResponse);
      }catch(err){
        if(!cancelled)setError(humanError(err,lang));
      }finally{
        if(!cancelled)setLoading(false);
      }
    })();
    return()=>{cancelled=true;};
  },[ar,bookingToken,lang,onOpenChange,onSettled,open]);

  useEffect(()=>{
    if(!open||!intent?.clientSecret||!intent.publishableKey||!mountRef.current)return;
    let cancelled=false;
    void (async()=>{
      try{
        await loadStripeJs();
        if(cancelled||!mountRef.current||!window.Stripe)return;
        const stripe=intent.stripeAccount
          ? window.Stripe(intent.publishableKey,{stripeAccount:intent.stripeAccount})
          : window.Stripe(intent.publishableKey);
        const elements=stripe.elements({clientSecret:intent.clientSecret,appearance:{theme:"stripe"}});
        const element=elements.create("payment",{layout:"tabs"});
        stripeRef.current=stripe;
        elementsRef.current=elements;
        elementRef.current=element;
        element.mount(mountRef.current);
      }catch(err){
        if(!cancelled)setError(humanError(err,lang));
      }
    })();
    return()=>{cancelled=true;elementRef.current?.destroy();elementRef.current=null;};
  },[intent,lang,open]);

  async function submit(){
    const stripe=stripeRef.current;
    const elements=elementsRef.current;
    if(!stripe||!elements||!intent?.intentRecordId)return;
    setPaying(true);
    setError(null);
    try{
      const result=await stripe.confirmPayment({
        elements,
        confirmParams:{return_url:window.location.href},
        redirect:"if_required",
      });
      if(result.error)throw new Error(result.error.message||"Payment confirmation failed");

      const {data,error:syncError}=await supabase.functions.invoke("quickserve-payments",{body:{
        action:"booking_deposit_sync",
        bookingToken,
        intentRecordId:intent.intentRecordId,
      }});
      if(syncError)throw syncError;

      if(data?.settled){
        toast.success(ar?"تم دفع عربون الحجز بنجاح":"Reservation deposit paid successfully");
        await onSettled();
        onOpenChange(false);
      }else if(result.paymentIntent?.status==="processing"||data?.status==="processing"){
        toast.info(ar?"الدفعة قيد المعالجة وسيتم تحديث الحجز تلقائياً":"Payment is processing and the reservation will update automatically");
        onOpenChange(false);
      }else{
        throw new Error(ar?"لم يؤكد مزود الدفع نجاح العملية بعد":"The payment provider has not confirmed success yet");
      }
    }catch(err){
      setError(humanError(err,lang));
    }finally{
      setPaying(false);
    }
  }

  return <Dialog open={open} onOpenChange={value=>!paying&&onOpenChange(value)}>
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><CreditCard className="size-5 text-[#ff5a0a]"/>{ar?"دفع عربون الحجز":"Pay reservation deposit"}</DialogTitle>
        <DialogDescription>{confirmationCode} · {formatMoney(amount,currency,lang)}</DialogDescription>
      </DialogHeader>

      <div className="rounded-xl border bg-muted/20 p-4">
        {loading?<div className="flex min-h-28 items-center justify-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin"/>{ar?"جارٍ فتح مزود الدفع…":"Opening payment provider…"}</div>
          :error?<div className="rounded-xl bg-red-500/10 p-3 text-sm text-red-700">{error}</div>
          :<div ref={mountRef} className="min-h-24"/>}
      </div>

      <div className="flex items-start gap-2 rounded-xl bg-emerald-500/8 p-3 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600"/>
        <span>{ar?"بيانات البطاقة تذهب مباشرة إلى Stripe ولا يتم تخزينها في QuickServe. تظهر Apple Pay وGoogle Pay تلقائياً عندما يكون الحساب والمتصفح والنطاق مؤهلاً.":"Card details go directly to Stripe and are never stored by QuickServe. Apple Pay and Google Pay appear automatically when the account, browser and domain are eligible."}</span>
      </div>

      <DialogFooter>
        <Button variant="outline" disabled={paying} onClick={()=>onOpenChange(false)}>{ar?"إلغاء":"Cancel"}</Button>
        <Button disabled={loading||paying||Boolean(error)||!intent} onClick={()=>void submit()}>
          {paying?<LoaderCircle className="size-4 animate-spin"/>:<CreditCard className="size-4"/>}
          {paying?(ar?"جارٍ التأكيد…":"Confirming…"):(ar?"دفع العربون":"Pay Deposit")}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
