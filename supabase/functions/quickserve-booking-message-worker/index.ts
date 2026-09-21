import { createClient } from "npm:@supabase/supabase-js@2";

function serverKey(){
  const direct=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(direct)return direct;
  const keys=Deno.env.get("SUPABASE_SECRET_KEYS");
  if(keys){try{return JSON.parse(keys).default}catch{}}
  throw new Error("Supabase server secret is unavailable");
}
const respond=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});

async function sendTwilio(channel:"sms"|"whatsapp",to:string,bodyText:string,statusCallback:string){
  const sid=Deno.env.get("TWILIO_ACCOUNT_SID")?.trim();
  const token=Deno.env.get("TWILIO_AUTH_TOKEN")?.trim();
  const configuredFrom=channel==="whatsapp"?Deno.env.get("TWILIO_WHATSAPP_FROM")?.trim():Deno.env.get("TWILIO_FROM_NUMBER")?.trim();
  if(!sid||!token||!configuredFrom)throw new Error(channel==="whatsapp"?"Twilio WhatsApp credentials are not configured":"Twilio SMS credentials are not configured");
  const destination=channel==="whatsapp"&&!to.startsWith("whatsapp:")?`whatsapp:${to}`:to;
  const source=channel==="whatsapp"&&!configuredFrom.startsWith("whatsapp:")?`whatsapp:${configuredFrom}`:configuredFrom;
  const form=new URLSearchParams({To:destination,From:source,Body:bodyText,StatusCallback:statusCallback});
  const response=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,{
    method:"POST",
    headers:{Authorization:"Basic "+btoa(`${sid}:${token}`),"Content-Type":"application/x-www-form-urlencoded"},
    body:form,
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(String(data?.message||`Twilio HTTP ${response.status}`));
  return {sid:String(data?.sid||""),from:source,status:String(data?.status||"sent")};
}

Deno.serve(async(req)=>{
  try{
    const admin=createClient(Deno.env.get("SUPABASE_URL")!,serverKey(),{auth:{persistSession:false,autoRefreshToken:false}});
    const workerSecret=req.headers.get("x-quickserve-worker")??"";
    const {data:authorized,error:authError}=await admin.rpc("verify_booking_message_worker_secret",{_secret:workerSecret});
    if(authError||!authorized)return respond({error:"Unauthorized"},401);

    const {data:rows,error:readError}=await admin.from("booking_messages")
      .select("id,restaurant_id,booking_id,channel,to_address,body,provider_status,attempt_count")
      .eq("direction","outbound")
      .in("provider_status",["queued","failed"])
      .lte("next_attempt_at",new Date().toISOString())
      .order("created_at")
      .limit(40);
    if(readError)throw readError;

    const publicUrl=(Deno.env.get("SUPABASE_URL")||"").replace(/\/$/,"");
    const results:unknown[]=[];

    for(const row of rows??[]){
      const attempts=Number(row.attempt_count??0)+1;
      if(attempts>4)continue;
      await admin.from("booking_messages").update({
        provider_status:"sending",attempt_count:attempts,last_error:null,
      }).eq("id",row.id);

      try{
        const callback=`${publicUrl}/functions/v1/quickserve-twilio-booking-webhook?message_id=${encodeURIComponent(row.id)}`;
        const sent=await sendTwilio(row.channel as "sms"|"whatsapp",String(row.to_address||""),String(row.body),callback);
        await admin.rpc("booking_message_provider_update",{
          _message_id:row.id,
          _provider_message_id:sent.sid,
          _provider_status:"sent",
          _from_address:sent.from,
          _last_error:null,
        });
        results.push({id:row.id,status:"sent"});
      }catch(error){
        const detail=error instanceof Error?error.message:"Twilio message delivery failed";
        const final=attempts>=4;
        await admin.from("booking_messages").update({
          provider_status:"failed",
          last_error:detail.slice(0,1000),
          next_attempt_at:final
            ? new Date(Date.now()+24*60*60_000).toISOString()
            : new Date(Date.now()+Math.min(30,Math.pow(2,Math.max(0,attempts-1)))*60_000).toISOString(),
        }).eq("id",row.id);
        results.push({id:row.id,status:final?"failed-final":"retry",detail});
      }
    }

    return respond({ok:true,processed:results.length,results});
  }catch(error){
    console.error(error);
    return respond({error:error instanceof Error?error.message:"Booking message worker failed"},500);
  }
});