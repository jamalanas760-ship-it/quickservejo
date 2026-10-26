import { finishLeasedJob, ambiguousDelivery } from "../_shared/notification-lease.ts";
import { mapConcurrent } from "../_shared/integration-transport.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";

function serviceKey(){
  const direct=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(direct)return direct;
  const keys=Deno.env.get("SUPABASE_SECRET_KEYS");if(keys){try{return JSON.parse(keys).default}catch{}}
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
    method:"POST",redirect:"error",signal:AbortSignal.timeout(10_000),headers:{Authorization:"Basic "+btoa(`${sid}:${token}`),"Content-Type":"application/x-www-form-urlencoded"},body
  });
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(String(data?.message||`Twilio HTTP ${res.status}`));
  return String(data?.sid||"");
}
async function sendEmail(to:string,subject:string,message:string,deliveryKey:string){
  const key=Deno.env.get("RESEND_API_KEY")?.trim();const from=Deno.env.get("RESEND_FROM_EMAIL")?.trim();
  if(!key||!from)throw new Error("Resend email credentials are not configured");
  const res=await fetch("https://api.resend.com/emails",{method:"POST",redirect:"error",signal:AbortSignal.timeout(10_000),headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json","Idempotency-Key":deliveryKey},body:JSON.stringify({from,to:[to],subject,text:message})});
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(String(data?.message||`Resend HTTP ${res.status}`));
  return String(data?.id||"");
}
function formatAt(value:string,timezone:string){
  try{return new Intl.DateTimeFormat("en-US",{dateStyle:"medium",timeStyle:"short",timeZone:timezone}).format(new Date(value));}
  catch{return new Date(value).toLocaleString();}
}

Deno.serve(async req=>{
  try{
    const supabase=createClient(Deno.env.get("SUPABASE_URL")!,serviceKey(),{auth:{persistSession:false,autoRefreshToken:false}});
    const secret=req.headers.get("x-quickserve-worker")??"";
    const {data:ok,error:authError}=await supabase.rpc("verify_booking_worker_secret",{_secret:secret});
    if(authError||!ok)return respond({error:"Unauthorized"},401);

    const {data:jobs,error:jobError}=await supabase.rpc("claim_notification_jobs",{_queue:"booking_notification_jobs"});
    if(jobError)throw jobError;

    const results:any[]=[];
    await mapConcurrent(jobs??[],4,async(job:any)=>{
      try{
        const {data:booking,error:bookingError}=await supabase.from("table_bookings")
          .select("id,customer_name,booking_at,guest_count,status,confirmation_code,public_token")
          .eq("id",job.booking_id).eq("restaurant_id",job.restaurant_id).single();
        if(bookingError)throw bookingError;
        const {data:restaurant,error:restaurantError}=await supabase.from("restaurants").select("name,timezone").eq("id",job.restaurant_id).single();
        if(restaurantError)throw restaurantError;

        if(["cancelled","no_show","completed"].includes(booking.status)){
          await finishLeasedJob(supabase,"booking_notification_jobs",job,{status:"skipped",last_error:"Reservation is no longer active"});
          results.push({id:job.id,status:"skipped"});return;
        }

        const date=formatAt(booking.booking_at,restaurant.timezone||"UTC");
        const publicBase=Deno.env.get("QUICKSERVE_PUBLIC_URL")?.replace(/\/$/,"")||"";
        const link=publicBase?`${publicBase}/booking/${booking.public_token}`:"";
        const isReminder=job.notification_type==="reminder";
        const subject=isReminder?`Reservation reminder · ${restaurant.name}`:`Reservation confirmed · ${restaurant.name}`;
        const message=isReminder
          ? `Hi ${booking.customer_name}, reminder: your reservation at ${restaurant.name} is ${date} for ${booking.guest_count} guest(s). Confirmation: ${booking.confirmation_code}.${link?` Manage: ${link}`:""}`
          : `Hi ${booking.customer_name}, your reservation at ${restaurant.name} is confirmed for ${date}, ${booking.guest_count} guest(s). Confirmation: ${booking.confirmation_code}.${link?` Manage: ${link}`:""}`;

        const ref=job.channel==="email"
          ? await sendEmail(job.destination,subject,message,job.id)
          : await sendTwilio(job.channel as "sms"|"whatsapp",job.destination,message);

        await finishLeasedJob(supabase,"booking_notification_jobs",job,{status:"sent",provider_reference:ref||null,sent_at:new Date().toISOString(),last_error:null});
        await supabase.from("table_bookings").update(job.notification_type==="confirmation"
          ?{confirmation_sent_at:new Date().toISOString()}
          :{reminder_sent_at:new Date().toISOString()}
        ).eq("id",job.booking_id).eq("restaurant_id",job.restaurant_id);
        results.push({id:job.id,status:"sent"});
      }catch(error){
        const attempts=Number(job.attempt_count);const final=attempts>=3 || ambiguousDelivery(error);
        const detail=ambiguousDelivery(error)?"Delivery outcome unknown; reconcile with provider before retry":"Provider delivery failed; inspect the provider dashboard";
        await finishLeasedJob(supabase,"booking_notification_jobs",job,{
          status:final?"failed":"retry",attempt_count:final?3:attempts,last_error:detail.slice(0,1000),
          next_attempt_at:new Date(Date.now()+Math.min(60,Math.pow(2,Math.max(0,attempts-1)))*60_000).toISOString()
        });
        results.push({id:job.id,status:final?"failed":"retry",detail});
      }
    });

    return respond({ok:true,processed:results.length,results});
  }catch(error){
    console.error(error);return respond({error:error instanceof Error?error.message:"Booking worker failed"},500);
  }
});