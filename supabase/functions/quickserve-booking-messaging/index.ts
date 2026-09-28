import { createClient } from "npm:@supabase/supabase-js@2";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, content-type, x-client-info, apikey",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});

function serverKey(){
  const direct=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(direct)return direct;
  const raw=Deno.env.get("SUPABASE_SECRET_KEYS");
  if(raw){try{return JSON.parse(raw).default}catch{}}
  throw new Error("Supabase server secret is unavailable");
}
function publicKey(){
  const direct=Deno.env.get("SUPABASE_ANON_KEY");
  if(direct)return direct;
  const raw=Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if(raw){try{return JSON.parse(raw).default}catch{}}
  throw new Error("Supabase publishable key is unavailable");
}
function normalizeDestination(value:string){
  const raw=value.trim();
  if(raw.startsWith("whatsapp:"))return "whatsapp:"+normalizeDestination(raw.slice(9));
  if(raw.startsWith("+"))return raw;
  let digits=raw.replace(/\D/g,"");
  if(digits.startsWith("00"))digits=digits.slice(2);
  if(digits.startsWith("0")&&digits.length>=9)digits="962"+digits.slice(1);
  return "+"+digits;
}

function providerStatus(value:string){
  if(value==="sent")return "sent";
  if(value==="delivered")return "delivered";
  if(value==="failed")return "failed";
  if(value==="undelivered")return "undelivered";
  if(value==="sending")return "sending";
  return "queued";
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response(null,{headers:cors});
  if(req.method!=="POST")return json({error:"Method not allowed"},405);

  try{
    const auth=req.headers.get("authorization")??"";
    if(!auth.toLowerCase().startsWith("bearer "))return json({error:"Authentication required"},401);

    const userClient=createClient(Deno.env.get("SUPABASE_URL")!,publicKey(),{
      global:{headers:{Authorization:auth}},
      auth:{persistSession:false,autoRefreshToken:false},
    });
    const {data:userData,error:userError}=await userClient.auth.getUser();
    if(userError||!userData.user)return json({error:"Invalid session"},401);

    const body=await req.json().catch(()=>({}));
    const bookingId=String(body.bookingId??"").trim();
    const channel=String(body.channel??"sms").trim().toLowerCase();
    const message=String(body.message??"").trim();
    if(!bookingId)return json({error:"bookingId is required"},400);
    if(!["sms","whatsapp"].includes(channel))return json({error:"Unsupported channel"},400);
    if(!message||message.length>2000)return json({error:"Message must contain 1 to 2000 characters"},400);

    const {data:prepared,error:prepareError}=await userClient.rpc("prepare_booking_message",{
      _booking_id:bookingId,
      _channel:channel,
      _body:message,
    });
    if(prepareError)throw prepareError;
    if(!prepared?.message_id)return json({error:"Unable to prepare reservation message"},409);

    const admin=createClient(Deno.env.get("SUPABASE_URL")!,serverKey(),{auth:{persistSession:false,autoRefreshToken:false}});
    const messageId=String(prepared.message_id);
    const sid=Deno.env.get("TWILIO_ACCOUNT_SID")?.trim();
    const token=Deno.env.get("TWILIO_AUTH_TOKEN")?.trim();
    const sender=channel==="whatsapp"
      ? Deno.env.get("TWILIO_WHATSAPP_FROM")?.trim()
      : Deno.env.get("TWILIO_FROM_NUMBER")?.trim();

    if(!sid||!token||!sender){
      const detail=channel==="whatsapp"
        ?"Twilio WhatsApp credentials are not configured"
        :"Twilio SMS credentials are not configured";
      await admin.rpc("booking_message_provider_update",{
        _message_id:messageId,_provider_message_id:"",_provider_status:"failed",_from_address:"",_last_error:detail,
      });
      return json({error:detail,messageId},503);
    }

    await admin.rpc("booking_message_provider_update",{
      _message_id:messageId,_provider_message_id:"",_provider_status:"sending",_from_address:sender,_last_error:null,
    });

    const destinationRaw=normalizeDestination(String(prepared.phone??""));
    const destination=channel==="whatsapp"&&!destinationRaw.startsWith("whatsapp:")
      ? `whatsapp:${destinationRaw}`
      : destinationRaw;
    const source=channel==="whatsapp"&&!sender.startsWith("whatsapp:")
      ? `whatsapp:${sender}`
      : sender;

    const callback=`${Deno.env.get("SUPABASE_URL")}/functions/v1/quickserve-twilio-booking-webhook?mode=status`;
    const params=new URLSearchParams({
      To:destination,
      From:source,
      Body:message,
      StatusCallback:callback,
    });

    const response=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,{
      method:"POST",
      headers:{
        Authorization:"Basic "+btoa(`${sid}:${token}`),
        "Content-Type":"application/x-www-form-urlencoded",
      },
      body:params,
    });
    const data=await response.json().catch(()=>({}));

    if(!response.ok){
      const detail=String(data?.message||`Twilio HTTP ${response.status}`);
      await admin.rpc("booking_message_provider_update",{
        _message_id:messageId,_provider_message_id:String(data?.sid||""),_provider_status:"failed",_from_address:source,_last_error:detail,
      });
      return json({error:detail,messageId},502);
    }

    const mapped=providerStatus(String(data?.status||"queued"));
    await admin.rpc("booking_message_provider_update",{
      _message_id:messageId,
      _provider_message_id:String(data?.sid||""),
      _provider_status:mapped,
      _from_address:source,
      _last_error:null,
    });

    return json({
      ok:true,
      messageId,
      providerMessageId:String(data?.sid||""),
      status:mapped,
      channel,
    });
  }catch(error){
    console.error(error);
    return json({error:error instanceof Error?error.message:"Reservation message failed"},500);
  }
});