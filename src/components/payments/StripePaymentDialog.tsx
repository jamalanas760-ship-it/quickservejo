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
  intentRecordId:string;
  providerIntentId:string;
  clientSecret:string;
  publishableKey:string;
  stripeAccount:string|null;
  status:string;
};

async function loadStripeJs(){
  if(window.Stripe)return;
  await new Promise<void>((resolve,reject)=>{
    const existing=document.querySelector<HTMLScriptElement>('script[src="https://js.stripe.com/v3/"]');
    if(existing){existing.addEventListener("load",()=>resolve(),{once:true});existing.addEventListener("error",()=>reject(new Error("Stripe.js failed to load")),{once:true});return;}
    const script=document.createElement("script");script.src="https://js.stripe.com/v3/";script.async=true;
    script.onload=()=>resolve();script.onerror=()=>reject(new Error("Stripe.js failed to load"));document.head.appendChild(script);
  });
}

export function StripePaymentDialog({
  open,onOpenChange,orderId,orderNumber,amount,tip,currency,onSettled,
}:{
  open:boolean;onOpenChange:(open:boolean)=>void;orderId:string;orderNumber:string;amount:number;tip:number;currency:string;onSettled:()=>void|Promise<void>;
}){
  const {lang}=useI18n();const ar=lang==="ar";
  const mountRef=useRef<HTMLDivElement|null>(null);
  const stripeRef=useRef<StripeInstanceLike|null>(null);
  const elementsRef=useRef<StripeElementsLike|null>(null);
  const elementRef=useRef<StripeElementLike|null>(null);
  const [intent,setIntent]=useState<IntentResponse|null>(null);
  const [loading,setLoading]=useState(false);
  const [paying,setPaying]=useState(false);
  const [error,setError]=useState<string|null>(null);

  useEffect(()=>{
    if(!open){elementRef.current?.destroy();elementRef.current=null;elementsRef.current=null;stripeRef.current=null;setIntent(null);setError(null);setLoading(false);setPaying(false);return;}
    let cancelled=false;
    setLoading(true);setError(null);
    void (async()=>{
      try{
        const {data,error:invokeError}=await supabase.functions.invoke("quickserve-payments",{body:{
          action:"create_intent",orderId,amount,tip,methodHint:"card",idempotencyKey:`cashier:${orderId}:${crypto.randomUUID()}`,
        }});
        if(invokeError)throw invokeError;
        if(!data?.clientSecret)throw new Error(data?.error||"Payment provider did not return a client secret");
        if(!cancelled)setIntent(data as IntentResponse);
      }catch(err){if(!cancelled)setError(humanError(err,lang));}
      finally{if(!cancelled)setLoading(false);}
    })();
    return()=>{cancelled=true;};
  },[amount,lang,open,orderId,tip]);

  useEffect(()=>{
    if(!open||!intent||!mountRef.current)return;
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
        stripeRef.current=stripe;elementsRef.current=elements;elementRef.current=element;
        element.mount(mountRef.current);
      }catch(err){if(!cancelled)setError(humanError(err,lang));}
    })();
    return()=>{cancelled=true;elementRef.current?.destroy();elementRef.current=null;};
  },[intent,lang,open]);

  async function submit(){
    const stripe=stripeRef.current;const elements=elementsRef.current;
    if(!stripe||!elements||!intent)return;
    setPaying(true);setError(null);
    try{
      const result=await stripe.confirmPayment({elements,confirmParams:{return_url:window.location.href},redirect:"if_required"});
      if(result.error)throw new Error(result.error.message||"Payment confirmation failed");
      const {data,error:syncError}=await supabase.functions.invoke("quickserve-payments",{body:{action:"sync_intent",intentRecordId:intent.intentRecordId}});
      if(syncError)throw syncError;
      if(data?.settled){
        toast.success(ar?"تم تأكيد الدفعة من مزود الدفع":"Provider payment confirmed");
        await onSettled();onOpenChange(false);
      }else if(result.paymentIntent?.status==="processing"||data?.status==="processing"){
        toast.info(ar?"الدفعة قيد المعالجة وسيتم تحديثها تلقائياً":"Payment is processing and will update automatically");
        onOpenChange(false);
      }else{
        throw new Error(ar?"لم يؤكد مزود الدفع نجاح العملية بعد":"The provider has not confirmed payment success yet");
      }
    }catch(err){setError(humanError(err,lang));}
    finally{setPaying(false);}
  }

  return <Dialog open={open} onOpenChange={value=>!paying&&onOpenChange(value)}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle className="flex items-center gap-2"><CreditCard className="size-5 text-[#e85d2a]"/>{ar?"دفع إلكتروني آمن":"Secure provider payment"}</DialogTitle><DialogDescription>{orderNumber} · {formatMoney(amount+tip,currency,lang)}{tip>0?` (${ar?"يشمل إكرامية":"includes tip"} ${formatMoney(tip,currency,lang)})`:""}</DialogDescription></DialogHeader>
    <div className="rounded-xl border bg-muted/20 p-4">
      {loading?<div className="flex min-h-28 items-center justify-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin"/>{ar?"جارٍ فتح مزود الدفع…":"Opening payment provider…"}</div>:error?<div className="rounded-xl bg-red-500/10 p-3 text-sm text-red-700">{error}</div>:<div ref={mountRef} className="min-h-24"/>}
    </div>
    <div className="flex items-start gap-2 rounded-xl bg-emerald-500/8 p-3 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600"/><span>{ar?"QuickServe لا يستقبل أو يخزن بيانات البطاقة. تظهر Apple Pay وGoogle Pay تلقائياً عندما يسمح حساب Stripe والمتصفح والنطاق بذلك.":"QuickServe never receives or stores card details. Apple Pay and Google Pay appear automatically when the Stripe account, browser and registered domain are eligible."}</span></div>
    <DialogFooter><Button variant="outline" disabled={paying} onClick={()=>onOpenChange(false)}>{ar?"إلغاء":"Cancel"}</Button><Button disabled={loading||paying||Boolean(error)||!intent} onClick={()=>void submit()}>{paying?<LoaderCircle className="size-4 animate-spin"/>:<CreditCard className="size-4"/>}{paying?(ar?"جارٍ التأكيد…":"Confirming…"):(ar?"تأكيد الدفع":"Confirm payment")}</Button></DialogFooter>
  </DialogContent></Dialog>;
}
