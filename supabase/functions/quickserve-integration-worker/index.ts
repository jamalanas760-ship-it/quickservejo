import { resolveIntegrationBinding, postIntegrationJson, mapConcurrent } from "../_shared/integration-transport.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";

function serviceKey() {
  const direct = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (direct) return direct;
  const keys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (keys) { try { return JSON.parse(keys).default; } catch {} }
  throw new Error("Supabase server secret is unavailable");
}
const respond = (body: unknown, status=200) => new Response(JSON.stringify(body), { status, headers:{"Content-Type":"application/json"} });

Deno.serve(async(req)=>{
  try{
    const supabase=createClient(Deno.env.get("SUPABASE_URL")!,serviceKey(),{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:init?.signal?AbortSignal.any([init.signal,AbortSignal.timeout(8000)]):AbortSignal.timeout(8000)})}});
    const secret=req.headers.get("x-quickserve-worker")??"";
    const {data:authorized,error:authError}=await supabase.rpc("verify_integration_worker_secret",{_secret:secret});
    if(authError||!authorized)return respond({error:"Unauthorized"},401);

    if (req.method !== "POST") return respond({error:"Method not allowed"},405);
    const {data:jobs,error:jobError}=await supabase.rpc("claim_integration_jobs",{_limit:8});
    if(jobError)throw jobError;

    const results=await mapConcurrent(jobs??[],4,async(job:any)=>{
      // Only the holder of the current, unexpired lease may acknowledge a job.
      const settle=async(patch:Record<string,unknown>)=>{
        const {data,error}=await supabase.from("integration_jobs").update({...patch,lease_token:null,lease_expires_at:null})
          .eq("id",job.id).eq("lease_token",job.lease_token).eq("status","in_flight")
          .gt("lease_expires_at",new Date().toISOString()).select("id").maybeSingle();
        if(error)throw error;
        if(!data)throw new Error("Integration job lease was lost");
      };
      try{
        const {data:connection,error:connectionError}=await supabase.from("integration_connections")
          .select("id,restaurant_id,provider,status,config").eq("id",job.connection_id).eq("restaurant_id",job.restaurant_id).single();
        if(connectionError)throw connectionError;
        if(connection.status==="disabled") {
          await settle({status:"failed",last_error:"Integration is disabled"});
          return {id:job.id,status:"failed"};
        }
        const binding=resolveIntegrationBinding(Deno.env.get("QUICKSERVE_INTEGRATION_BINDINGS"),job,connection);

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

        const response=await postIntegrationJson(binding,job.external_key,outgoing);
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
        await settle({status:"completed",completed_at:new Date().toISOString(),response_status:response.status,response_body:null,last_error:null});
        return {id:job.id,status:"completed"};
      }catch(error:any){
        const attempts=Number(job.attempt_count);
        const final=attempts>=5;
        const delay=Math.min(60,Math.pow(2,Math.max(0,attempts-1)));
        const detail=error instanceof Error && /^(An operator must approve|Integration (endpoint|bindings|credential|provider HTTP|response|job lease))/.test(error.message) ? error.message : "Integration attempt failed; inspect the worker trace";
        try { await settle({
          status:final?"failed":"retry",last_error:detail.slice(0,1000),
          response_status:null,response_body:null,
          next_attempt_at:new Date(Date.now()+delay*60_000).toISOString(),
        }); } catch { return {id:job.id,status:"lease_lost"}; }
        await supabase.from("integration_connections").update({status:final?"error":"degraded",last_error:detail.slice(0,1000),last_tested_at:new Date().toISOString()}).eq("id",job.connection_id);
        if(job.category==="delivery"&&final){
          await supabase.from("orders").update({delivery_status:"failed",delivery_status_updated_at:new Date().toISOString()})
            .eq("id",String(job.payload?.order_id??"")).eq("restaurant_id",job.restaurant_id);
        }
        return {id:job.id,status:final?"failed":"retry",detail};
      }
    });
    return respond({ok:true,processed:results.length,results});
  }catch(error){
    console.error("Integration worker failed",{name:error instanceof Error?error.name:"Unknown"});
    return respond({error:"Integration worker failed"},500);
  }
});