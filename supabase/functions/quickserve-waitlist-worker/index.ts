import { createClient } from "npm:@supabase/supabase-js@2";

function serviceKey(){
  const direct=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); if(direct)return direct;
  const keys=Deno.env.get("SUPABASE_SECRET_KEYS"); if(keys){try{return JSON.parse(keys).default}catch{}}
  throw new Error("Supabase server secret is unavailable");
}
const respond=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});

async function sendTwilio(channel:"sms"|"whatsapp",to:string,message:string){
  const sid=Deno.env.get("TWILIO_ACCOUNT_SID")?.trim();
  const token=Deno.env.get("TWILIO_AUTH_TOKEN")?.trim();
  const from=channel==="whatsapp"?Deno.env.get("TWILIO_WHATSAPP_FROM")?.trim():Deno.env.get("TWILIO_FROM_NUMBER")?.trim();
  if(!sid||!token||!from)throw new Error(channel==="whatsapp"?"Twilio WhatsApp credentials are not configured":"Twilio SMS credentials are not configured");
  const destination=channel==="whatsapp"&&!to.startsWith("whatsapp:")?`whatsapp:${to}`:to;
  const source=channel==="whatsapp"&&!from.startsWith("whatsapp:")?`whatsapp:${from}`:from;
  const body=new URLSearchParams({To:destination,From:source,Body:message});
  const res=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,{
    method:"POST",headers:{Authorization:"Basic "+btoa(`${sid}:${token}`),"Content-Type":"application/x-www-form-urlencoded"},body
  });
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(String(data?.message||`Twilio HTTP ${res.status}`));
  return String(data?.sid||"");
}

async function sendEmail(to:string,subject:string,message:string){
  const key=Deno.env.get("RESEND_API_KEY")?.trim();
  const from=Deno.env.get("RESEND_FROM_EMAIL")?.trim();
  if(!key||!from)throw new Error("Resend email credentials are not configured");
  const res=await fetch("https://api.resend.com/emails",{
    method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},
    body:JSON.stringify({from,to:[to],subject,text:message})
  });
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(String(data?.message||`Resend HTTP ${res.status}`));
  return String(data?.id||"");
}

function formatAt(value:string,timezone:string){
  try{return new Intl.DateTimeFormat("en-US",{dateStyle:"medium",timeStyle:"short",timeZone:timezone}).format(new Date(value))}
  catch{return new Date(value).toLocaleString()}
}

Deno.serve(async req=>{
  try{
    const supabase=createClient(Deno.env.get("SUPABASE_URL")!,serviceKey(),{auth:{persistSession:false,autoRefreshToken:false}});
    const workerSecret=req.headers.get("x-quickserve-worker")??"";
    const {data:authorized,error:authError}=await supabase.rpc("verify_waitlist_worker_secret",{_secret:workerSecret});
    if(authError||!authorized)return respond({error:"Unauthorized"},401);

    const {data:jobs,error:jobsError}=await supabase.from("waitlist_notification_jobs")
      .select("id,restaurant_id,waitlist_id,offer_sequence,channel,destination,status,attempt_count")
      .in("status",["queued","retry"]).lte("next_attempt_at",new Date().toISOString()).order("created_at").limit(40);
    if(jobsError)throw jobsError;

    const publicBase=(Deno.env.get("QUICKSERVE_PUBLIC_URL")?.trim()||"https://quickservejo.lovable.app").replace(/\/$/,"");
    const results:unknown[]=[];

    for(const job of jobs??[]){
      const attempts=Number(job.attempt_count??0)+1;
      await supabase.from("waitlist_notification_jobs").update({status:"sending",attempt_count:attempts,last_error:null}).eq("id",job.id);
      try{
        const [{data:waitlist,error:waitError},{data:restaurant,error:restaurantError}]=await Promise.all([
          supabase.from("booking_waitlist")
            .select("id,customer_name,guest_count,status,public_token,offer_booking_at,offer_expires_at,offer_count")
            .eq("id",job.waitlist_id).eq("restaurant_id",job.restaurant_id).single(),
          supabase.from("restaurants").select("name,timezone").eq("id",job.restaurant_id).single(),
        ]);
        if(waitError)throw waitError;
        if(restaurantError)throw restaurantError;

        if(waitlist.status!=="notified"||!waitlist.offer_booking_at||!waitlist.offer_expires_at||Number(waitlist.offer_count)!==Number(job.offer_sequence)){
          await supabase.from("waitlist_notification_jobs").update({status:"skipped",last_error:"Offer is no longer active"}).eq("id",job.id);
          results.push({id:job.id,status:"skipped"});
          continue;
        }
        if(new Date(waitlist.offer_expires_at).getTime()<=Date.now()){
          await supabase.from("waitlist_notification_jobs").update({status:"skipped",last_error:"Offer expired before delivery"}).eq("id",job.id);
          results.push({id:job.id,status:"skipped"});
          continue;
        }

        const when=formatAt(waitlist.offer_booking_at,restaurant.timezone||"UTC");
        const remaining=Math.max(1,Math.ceil((new Date(waitlist.offer_expires_at).getTime()-Date.now())/60000));
        const link=`${publicBase}/waitlist/${waitlist.public_token}`;
        const subject=`Table available · ${restaurant.name}`;
        const message=`Hi ${waitlist.customer_name}, a table is available at ${restaurant.name} for ${waitlist.guest_count} guest(s) at ${when}. This offer is held for about ${remaining} minutes. Accept or decline here: ${link}`;

        const reference=job.channel==="email"
          ? await sendEmail(job.destination,subject,message)
          : await sendTwilio(job.channel as "sms"|"whatsapp",job.destination,message);

        const sentAt=new Date().toISOString();
        await Promise.all([
          supabase.from("waitlist_notification_jobs").update({status:"sent",provider_reference:reference||null,sent_at:sentAt,last_error:null}).eq("id",job.id),
          supabase.from("booking_waitlist").update({offer_sent_at:sentAt,last_message_at:sentAt,last_message_channel:job.channel}).eq("id",waitlist.id),
        ]);
        results.push({id:job.id,status:"sent"});
      }catch(error){
        const final=attempts>=3;
        const detail=error instanceof Error?error.message:"Waitlist offer delivery failed";
        await supabase.from("waitlist_notification_jobs").update({
          status:final?"failed":"retry",last_error:detail.slice(0,1000),
          next_attempt_at:new Date(Date.now()+Math.min(30,Math.pow(2,Math.max(0,attempts-1)))*60_000).toISOString()
        }).eq("id",job.id);
        results.push({id:job.id,status:final?"failed":"retry",detail});
      }
    }

    return respond({ok:true,processed:results.length,results});
  }catch(error){
    console.error(error);
    return respond({error:error instanceof Error?error.message:"Waitlist worker failed"},500);
  }
});