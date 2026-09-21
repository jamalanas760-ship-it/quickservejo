import { createClient } from "npm:@supabase/supabase-js@2";

function serverKey(){
  const direct=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(direct)return direct;
  const keys=Deno.env.get("SUPABASE_SECRET_KEYS");
  if(keys){try{return JSON.parse(keys).default}catch{}}
  throw new Error("Supabase server secret is unavailable");
}

function base64(bytes:ArrayBuffer){
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

async function twilioSignature(url:string,params:URLSearchParams,token:string){
  const pairs=[...params.entries()].sort(([a],[b])=>a.localeCompare(b));
  let source=url;
  for(const [key,value] of pairs)source+=key+value;
  const cryptoKey=await crypto.subtle.importKey(
    "raw",new TextEncoder().encode(token),{name:"HMAC",hash:"SHA-1"},false,["sign"]
  );
  return base64(await crypto.subtle.sign("HMAC",cryptoKey,new TextEncoder().encode(source)));
}

function normalizeStatus(value:string){
  if(value==="delivered")return "delivered";
  if(value==="sent")return "sent";
  if(value==="failed")return "failed";
  if(value==="undelivered")return "undelivered";
  if(value==="queued"||value==="accepted"||value==="scheduled")return "queued";
  return "sending";
}

const xml=()=>new Response("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>",{
  status:200,headers:{"Content-Type":"application/xml"}
});

Deno.serve(async(req)=>{
  try{
    if(req.method!=="POST")return new Response("Method not allowed",{status:405});
    const token=Deno.env.get("TWILIO_AUTH_TOKEN")?.trim();
    if(!token)return new Response("Twilio is not configured",{status:503});
    const raw=await req.text();
    const params=new URLSearchParams(raw);
    const supplied=req.headers.get("x-twilio-signature")??"";
    const expected=await twilioSignature(req.url,params,token);
    if(!supplied||supplied!==expected)return new Response("Invalid signature",{status:403});

    const admin=createClient(Deno.env.get("SUPABASE_URL")!,serverKey(),{auth:{persistSession:false,autoRefreshToken:false}});
    const messageId=new URL(req.url).searchParams.get("message_id");
    const callbackStatus=params.get("MessageStatus");

    if(messageId&&callbackStatus){
      await admin.rpc("booking_message_provider_update",{
        _message_id:messageId,
        _provider_message_id:params.get("MessageSid")||"",
        _provider_status:normalizeStatus(callbackStatus),
        _from_address:params.get("From")||null,
        _last_error:params.get("ErrorMessage")||null,
      });
      return xml();
    }

    const providerMessageId=params.get("MessageSid")?.trim()||"";
    const from=params.get("From")?.trim()||"";
    const to=params.get("To")?.trim()||"";
    const body=params.get("Body")?.trim()||"";
    const channel=from.startsWith("whatsapp:")||to.startsWith("whatsapp:")?"whatsapp":"sms";
    if(!providerMessageId||!from||!body)return xml();

    const cleanPhone=from.replace(/^whatsapp:/,"");
    const {data:match,error:matchError}=await admin.rpc("match_booking_for_inbound_phone",{_phone:cleanPhone});
    if(matchError)throw matchError;
    const count=Number(match?.match_count??0);
    const bookingId=count===1?String(match.booking_id):null;
    const restaurantId=count===1?String(match.restaurant_id):null;
    const matchStatus=count===1?"matched":count>1?"ambiguous":"unmatched";

    const {error:inboxError}=await admin.from("booking_message_inbox").upsert({
      provider:"twilio",
      provider_message_id:providerMessageId,
      from_address:from,
      to_address:to,
      body:body.slice(0,2000),
      channel,
      match_status:matchStatus,
      matched_restaurant_id:restaurantId,
      matched_booking_id:bookingId,
      received_at:new Date().toISOString(),
    },{onConflict:"provider,provider_message_id"});
    if(inboxError)throw inboxError;

    if(bookingId&&restaurantId){
      const {error:messageError}=await admin.from("booking_messages").upsert({
        restaurant_id:restaurantId,
        booking_id:bookingId,
        direction:"inbound",
        channel,
        from_address:from,
        to_address:to,
        body:body.slice(0,2000),
        provider:"twilio",
        provider_message_id:providerMessageId,
        provider_status:"received",
        received_at:new Date().toISOString(),
      },{onConflict:"provider,provider_message_id"});
      if(messageError)throw messageError;
    }

    return xml();
  }catch(error){
    console.error(error);
    return new Response("Webhook processing failed",{status:500});
  }
});