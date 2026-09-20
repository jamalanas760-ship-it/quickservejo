import { createClient } from "npm:@supabase/supabase-js@2";

const json = (body: unknown, status=200) => new Response(JSON.stringify(body), { status, headers:{ "Content-Type":"application/json" } });
function serverKey() {
  const direct = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (direct) return direct;
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeys) { try { return JSON.parse(secretKeys).default; } catch {} }
  throw new Error("Supabase server secret is unavailable");
}
function timingSafeEqual(a:string,b:string){ if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0; }
async function hmacHex(secret:string,payload:string){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const sig=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(payload));return [...new Uint8Array(sig)].map(v=>v.toString(16).padStart(2,"0")).join("");}
async function sha256Hex(value:string){const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return [...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,"0")).join("");}
async function verifyStripe(raw:string,header:string,secret:string){const pairs=header.split(",").map(x=>x.trim().split("="));const timestamp=pairs.find(([k])=>k==="t")?.[1];const signatures=pairs.filter(([k])=>k==="v1").map(([,v])=>v);if(!timestamp||!signatures.length)return false;const age=Math.abs(Math.floor(Date.now()/1000)-Number(timestamp));if(!Number.isFinite(age)||age>300)return false;const expected=await hmacHex(secret,`${timestamp}.${raw}`);return signatures.some(sig=>timingSafeEqual(sig,expected));}

Deno.serve(async(req)=>{
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  const secret=Deno.env.get("STRIPE_WEBHOOK_SECRET")?.trim();
  if(!secret)return json({error:"Stripe webhook secret is not configured"},503);
  const raw=await req.text(); const signature=req.headers.get("stripe-signature")??"";
  if(!(await verifyStripe(raw,signature,secret)))return json({error:"Invalid signature"},400);

  const event=JSON.parse(raw); const admin=createClient(Deno.env.get("SUPABASE_URL")!,serverKey(),{auth:{persistSession:false,autoRefreshToken:false}});
  const object=event?.data?.object??{}; const metadata=object?.metadata??{};
  const restaurantId=metadata.restaurant_id||null; const providerIntentId=object.object==="payment_intent"?object.id:(object.payment_intent||null);
  const digest=await sha256Hex(raw);
  const {data:isNew,error:registerError}=await admin.rpc("register_payment_provider_event",{
    _provider:"stripe",_event_id:String(event.id),_event_type:String(event.type),_restaurant_id:restaurantId,
    _provider_intent_id:providerIntentId,_payload_digest:digest,
  });
  if(registerError)throw registerError;
  if(!isNew)return json({received:true,duplicate:true});

  try{
    if(event.type==="payment_intent.succeeded"){
      const bookingDepositIntentId=metadata.quickserve_booking_deposit_intent_id;
      if(bookingDepositIntentId){
        await admin.rpc("record_booking_deposit_payment",{
          _intent_id:String(bookingDepositIntentId),
          _provider_intent_id:String(object.id),
          _provider_transaction_id:String(object.latest_charge||object.id),
          _provider_event_id:String(event.id),
        });
        await admin.rpc("complete_payment_provider_event",{_provider:"stripe",_event_id:String(event.id),_status:"processed",_error:null});
        return json({received:true,bookingDeposit:true});
      }

      const intentRecordId=metadata.quickserve_intent_id;
      if(!intentRecordId)throw new Error("Missing QuickServe intent metadata");
      await admin.rpc("record_provider_payment",{
        _intent_id:intentRecordId,_provider_intent_id:String(object.id),
        _provider_transaction_id:String(object.latest_charge||object.id),_provider_event_id:String(event.id),
        _method:metadata.method_hint==="wallet"?"wallet":"card",
        _metadata:{stripe_payment_method:object.payment_method||null,source:"stripe_webhook"},
      });
      await admin.rpc("complete_payment_provider_event",{_provider:"stripe",_event_id:String(event.id),_status:"processed",_error:null});
      return json({received:true});
    }
    if(event.type==="payment_intent.payment_failed"||event.type==="payment_intent.canceled"){
      const bookingDepositIntentId=metadata.quickserve_booking_deposit_intent_id;
      if(bookingDepositIntentId){
        await admin.rpc("update_booking_deposit_intent_status",{
          _intent_id:String(bookingDepositIntentId),
          _provider_intent_id:String(object.id),
          _status:event.type==="payment_intent.canceled"?"canceled":"failed",
          _last_error:object.last_payment_error?.message||null,
        });
        await admin.rpc("complete_payment_provider_event",{_provider:"stripe",_event_id:String(event.id),_status:"processed",_error:null});
        return json({received:true,bookingDeposit:true});
      }

      const intentRecordId=metadata.quickserve_intent_id;
      if(intentRecordId)await admin.rpc("update_provider_intent_status",{
        _intent_id:intentRecordId,_provider_intent_id:String(object.id),
        _status:event.type==="payment_intent.canceled"?"canceled":"failed",_last_error:object.last_payment_error?.message||null,
      });
      await admin.rpc("complete_payment_provider_event",{_provider:"stripe",_event_id:String(event.id),_status:"processed",_error:null});
      return json({received:true});
    }
    if(event.type==="charge.refunded"){
      const {data:payment}=await admin.from("payment_transactions").select("id").eq("provider","stripe")
        .eq("provider_transaction_id",String(object.id)).eq("transaction_type","payment").maybeSingle();
      if(payment){
        const c=String(object.currency).toUpperCase();
        const exp=["BIF","CLP","DJF","GNF","JPY","KMF","KRW","MGA","PYG","RWF","UGX","VND","VUV","XAF","XOF","XPF"].includes(c)?0:["BHD","JOD","KWD","OMR","TND"].includes(c)?3:2;
        for(const refund of object.refunds?.data??[]){
          if(refund.status!=="succeeded")continue;
          await admin.rpc("record_provider_refund",{
            _payment_id:payment.id,_provider_refund_id:String(refund.id),_amount:Number(refund.amount)/(10**exp),
            _provider_event_id:String(event.id),_metadata:{source:"stripe_webhook"},
          });
        }
      }
      await admin.rpc("complete_payment_provider_event",{_provider:"stripe",_event_id:String(event.id),_status:"processed",_error:null});
      return json({received:true});
    }
    await admin.rpc("complete_payment_provider_event",{_provider:"stripe",_event_id:String(event.id),_status:"ignored",_error:null});
    return json({received:true,ignored:true});
  }catch(error){
    const detail=error instanceof Error?error.message:"Webhook processing failed";
    await admin.rpc("complete_payment_provider_event",{_provider:"stripe",_event_id:String(event.id),_status:"failed",_error:detail});
    console.error(error);return json({error:detail},500);
  }
});