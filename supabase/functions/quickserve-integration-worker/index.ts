import { createClient } from "npm:@supabase/supabase-js@2";

function serviceKey() {
  const direct = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (direct) return direct;
  const keys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (keys) { try { return JSON.parse(keys).default; } catch {} }
  throw new Error("Supabase server secret is unavailable");
}
const respond = (body: unknown, status=200) => new Response(JSON.stringify(body), { status, headers:{"Content-Type":"application/json"} });

function credential(category:string) {
  if (category === "delivery") return Deno.env.get("DELIVERY_PROVIDER_SECRET")?.trim() || "";
  if (category === "accounting") return Deno.env.get("ACCOUNTING_PROVIDER_SECRET")?.trim() || "";
  return "";
}
async function postJson(url:string, secret:string, externalKey:string, payload:unknown) {
  const res = await fetch(url, {
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "Authorization":`Bearer ${secret}`,
      "Idempotency-Key":externalKey,
      "User-Agent":"QuickServe-Connect/1.0",
    },
    body:JSON.stringify(payload),
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw:text }; }
  if (!res.ok) throw Object.assign(new Error(String(data?.message || data?.error || `HTTP ${res.status}`)), { status:res.status, body:text });
  return { status:res.status, data, raw:text };
}

Deno.serve(async(req)=>{
  try{
    const supabase=createClient(Deno.env.get("SUPABASE_URL")!,serviceKey(),{auth:{persistSession:false,autoRefreshToken:false}});
    const secret=req.headers.get("x-quickserve-worker")??"";
    const {data:authorized,error:authError}=await supabase.rpc("verify_integration_worker_secret",{_secret:secret});
    if(authError||!authorized)return respond({error:"Unauthorized"},401);

    const {data:jobs,error:jobError}=await supabase.from("integration_jobs")
      .select("id,restaurant_id,connection_id,category,action,external_key,payload,status,attempt_count")
      .in("status",["queued","retry"]).lte("next_attempt_at",new Date().toISOString())
      .order("created_at").limit(25);
    if(jobError)throw jobError;

    const results:any[]=[];
    for(const job of jobs??[]){
      const {data:connection,error:connectionError}=await supabase.from("integration_connections")
        .select("id,provider,display_name,status,config").eq("id",job.connection_id).maybeSingle();
      if(connectionError)throw connectionError;
      if(!connection||connection.status==="disabled"){
        await supabase.from("integration_jobs").update({status:"failed",last_error:"Integration connection is unavailable",attempt_count:Number(job.attempt_count)+1}).eq("id",job.id);
        results.push({id:job.id,status:"failed"});continue;
      }
      const endpoint=String(connection.config?.endpoint_url??"").trim();
      const providerSecret=credential(job.category);
      if(!endpoint.startsWith("https://")||!providerSecret){
        const detail=!endpoint.startsWith("https://")?"HTTPS endpoint URL is not configured":`${job.category==="delivery"?"DELIVERY_PROVIDER_SECRET":"ACCOUNTING_PROVIDER_SECRET"} is not configured`;
        await supabase.from("integration_jobs").update({
          status:"retry",attempt_count:Number(job.attempt_count)+1,last_error:detail,
          next_attempt_at:new Date(Date.now()+60*60_000).toISOString(),
        }).eq("id",job.id);
        await supabase.from("integration_connections").update({status:"degraded",last_error:detail,last_tested_at:new Date().toISOString()}).eq("id",connection.id);
        results.push({id:job.id,status:"blocked",detail});continue;
      }

      await supabase.from("integration_jobs").update({status:"in_flight",request_started_at:new Date().toISOString(),attempt_count:Number(job.attempt_count)+1,last_error:null}).eq("id",job.id);
      try{
        let outgoing:any={event:job.action,idempotency_key:job.external_key,restaurant_id:job.restaurant_id};

        if(job.category==="delivery"&&job.action==="create_order"){
          const orderId=String(job.payload?.order_id??"");
          const [{data:order,error:orderError},{data:items,error:itemsError}]=await Promise.all([
            supabase.from("orders").select("id,order_number,total,currency,guest_name,guest_phone,guest_email,delivery_address,scheduled_for,customer_notes,created_at").eq("id",orderId).eq("restaurant_id",job.restaurant_id).single(),
            supabase.from("order_items").select("product_name_snapshot_en,product_name_snapshot_ar,quantity,unit_price,total_price,notes").eq("order_id",orderId).eq("restaurant_id",job.restaurant_id),
          ]);
          if(orderError)throw orderError;if(itemsError)throw itemsError;
          outgoing={...outgoing,order:{...order,items:items??[]},provider:connection.provider};
        } else if(job.category==="accounting"&&job.action==="post_payment"){
          const paymentId=String(job.payload?.payment_id??"");
          const {data:payment,error}=await supabase.from("payment_transactions")
            .select("id,order_id,transaction_type,method,amount,tip_amount,reference,status,provider,provider_transaction_id,created_at,orders(order_number,currency,tax_amount,service_amount,delivery_amount,total)")
            .eq("id",paymentId).eq("restaurant_id",job.restaurant_id).single();
          if(error)throw error;
          outgoing={...outgoing,entry:payment,provider:connection.provider};
        } else if(job.category==="accounting"&&job.action==="post_expense"){
          const expenseId=String(job.payload?.expense_id??"");
          const {data:expense,error}=await supabase.from("erp_expenses")
            .select("id,description,category,amount,expense_date,reference,source_type,source_id,supplier_id,created_at")
            .eq("id",expenseId).eq("restaurant_id",job.restaurant_id).single();
          if(error)throw error;
          outgoing={...outgoing,entry:expense,provider:connection.provider};
        } else throw new Error("Unsupported integration job");

        const response=await postJson(endpoint,providerSecret,job.external_key,outgoing);
        await supabase.from("integration_jobs").update({
          status:"completed",completed_at:new Date().toISOString(),response_status:response.status,response_body:response.raw.slice(0,4000),last_error:null,
        }).eq("id",job.id);
        await supabase.from("integration_connections").update({status:"healthy",last_sync_at:new Date().toISOString(),last_error:null}).eq("id",connection.id);

        if(job.category==="delivery"){
          const orderId=String(job.payload?.order_id??"");
          const reference=String(response.data?.reference??response.data?.id??response.data?.delivery_id??"").trim();
          const status=String(response.data?.status??"accepted").toLowerCase();
          const allowed=["pending","accepted","driver_assigned","picked_up","on_the_way","delivered","cancelled","failed"];
          await supabase.from("orders").update({
            delivery_provider:connection.provider,
            delivery_provider_reference:reference||null,
            delivery_status:allowed.includes(status)?status:"accepted",
            delivery_status_updated_at:new Date().toISOString(),
          }).eq("id",orderId).eq("restaurant_id",job.restaurant_id);
        }
        results.push({id:job.id,status:"completed"});
      }catch(error:any){
        const attempts=Number(job.attempt_count)+1;
        const final=attempts>=5;
        const delay=Math.min(60,Math.pow(2,Math.max(0,attempts-1)));
        const detail=error instanceof Error?error.message:"Integration delivery failed";
        await supabase.from("integration_jobs").update({
          status:final?"failed":"retry",last_error:detail.slice(0,1000),
          response_status:Number(error?.status)||null,response_body:String(error?.body??"").slice(0,4000),
          next_attempt_at:new Date(Date.now()+delay*60_000).toISOString(),
        }).eq("id",job.id);
        await supabase.from("integration_connections").update({status:final?"error":"degraded",last_error:detail.slice(0,1000),last_tested_at:new Date().toISOString()}).eq("id",connection.id);
        if(job.category==="delivery"&&final){
          await supabase.from("orders").update({delivery_status:"failed",delivery_status_updated_at:new Date().toISOString()})
            .eq("id",String(job.payload?.order_id??"")).eq("restaurant_id",job.restaurant_id);
        }
        results.push({id:job.id,status:final?"failed":"retry",detail});
      }
    }
    return respond({ok:true,processed:results.length,results});
  }catch(error){
    console.error(error);
    return respond({error:error instanceof Error?error.message:"Integration worker failed"},500);
  }
});