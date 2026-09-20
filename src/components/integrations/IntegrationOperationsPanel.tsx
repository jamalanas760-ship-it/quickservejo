import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, RefreshCcw, Save, Truck, WalletCards } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { humanError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Connection={id:string;category:"delivery"|"accounting";provider:string;display_name:string;status:string;config:Record<string,unknown>;last_sync_at:string|null;last_error:string|null};
type Job={id:string;connection_id:string;category:string;action:string;external_key:string;status:string;attempt_count:number;response_status:number|null;last_error:string|null;created_at:string};

export function IntegrationOperationsPanel({restaurantId}:{restaurantId:string}){
  const {lang}=useI18n();const ar=lang==="ar";const qc=useQueryClient();
  const [deliveryEndpoint,setDeliveryEndpoint]=useState("");
  const [accountingEndpoint,setAccountingEndpoint]=useState("");
  const [from,setFrom]=useState(()=>{const d=new Date();d.setDate(1);return d.toLocaleDateString("en-CA");});
  const [to,setTo]=useState(()=>new Date().toLocaleDateString("en-CA"));

  const connections=useQuery<Connection[]>({
    queryKey:["integration-ops-connections",restaurantId],
    queryFn:async()=>{
      const {data,error}=await (supabase as any).from("integration_connections")
        .select("id,category,provider,display_name,status,config,last_sync_at,last_error")
        .eq("restaurant_id",restaurantId).in("category",["delivery","accounting"]);
      if(error)throw error;
      const rows=(data??[]) as Connection[];
      const delivery=rows.find(x=>x.category==="delivery");const accounting=rows.find(x=>x.category==="accounting");
      setDeliveryEndpoint(String(delivery?.config?.endpoint_url??""));
      setAccountingEndpoint(String(accounting?.config?.endpoint_url??""));
      return rows;
    },
  });

  const jobs=useQuery<Job[]>({
    queryKey:["integration-jobs",restaurantId],
    refetchInterval:15_000,
    queryFn:async()=>{
      const {data,error}=await (supabase as any).from("integration_jobs")
        .select("id,connection_id,category,action,external_key,status,attempt_count,response_status,last_error,created_at")
        .eq("restaurant_id",restaurantId).order("created_at",{ascending:false}).limit(50);
      if(error)throw error;return (data??[]) as Job[];
    },
  });

  const save=useMutation({
    mutationFn:async({category,endpoint}:{category:"delivery"|"accounting";endpoint:string})=>{
      if(endpoint&&!endpoint.startsWith("https://"))throw new Error(ar?"يجب أن يبدأ الرابط بـ https://":"Endpoint must use https://");
      const existing=(connections.data??[]).find(x=>x.category===category);
      const provider=category==="delivery"?"aggregator":"accounting";
      const payload={
        restaurant_id:restaurantId,category,provider,
        display_name:category==="delivery"?"Delivery provider":"Accounting connector",
        status:endpoint?"configured":"not_configured",
        credential_ref:category==="delivery"?"DELIVERY_PROVIDER_SECRET":"ACCOUNTING_PROVIDER_SECRET",
        config:{...(existing?.config??{}),endpoint_url:endpoint.trim()},
        capabilities:category==="delivery"?["create_order","status_sync"]:["payments","refunds","expenses"],
        last_error:null,
      };
      const {error}=await (supabase as any).from("integration_connections").upsert(payload,{onConflict:"restaurant_id,category,provider"});
      if(error)throw error;
    },
    onSuccess:async()=>{await Promise.all([qc.invalidateQueries({queryKey:["integration-ops-connections",restaurantId]}),qc.invalidateQueries({queryKey:["integrations",restaurantId]})]);toast.success(ar?"تم حفظ إعداد الاتصال":"Integration endpoint saved");},
    onError:(error)=>toast.error(humanError(error,lang)),
  });

  const retry=useMutation({
    mutationFn:async(id:string)=>{const {error}=await (supabase as any).rpc("retry_integration_job",{_job_id:id});if(error)throw error;},
    onSuccess:async()=>{await qc.invalidateQueries({queryKey:["integration-jobs",restaurantId]});toast.success(ar?"تمت إعادة المهمة للطابور":"Job queued for retry");},
    onError:(error)=>toast.error(humanError(error,lang)),
  });

  const exportAccounting=useMutation({
    mutationFn:async()=>{
      const {data,error}=await (supabase as any).rpc("get_accounting_export",{_restaurant_id:restaurantId,_from:from,_to:to});
      if(error)throw error;return data as {transactions:any[];expenses:any[]};
    },
    onSuccess:(data)=>{
      const rows=[
        ["date","entry_type","reference","order_number","payment_method","provider","amount","tip_amount","currency","tax_amount","service_amount","delivery_amount","category","description"],
        ...(data.transactions??[]).map((x:any)=>[x.date,x.entry_type,x.reference??"",x.order_number??"",x.payment_method??"",x.provider??"",x.amount??0,x.tip_amount??0,x.currency??"",x.tax_amount??0,x.service_amount??0,x.delivery_amount??0,"",""]),
        ...(data.expenses??[]).map((x:any)=>[x.date,"expense",x.reference??"","","","",x.amount??0,"","","","","",x.category??"",x.description??""]),
      ];
      const cell=(value:unknown)=>`"${String(value??"").replaceAll('"','""')}"`;
      const csv="\uFEFF"+rows.map(row=>row.map(cell).join(",")).join("\r\n");
      const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
      const link=document.createElement("a");link.href=url;link.download=`quickserve-accounting-${from}-to-${to}.csv`;
      document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);
      toast.success(ar?"تم تصدير ملف المحاسبة":"Accounting CSV exported");
    },
    onError:(error)=>toast.error(humanError(error,lang)),
  });

  const byId=new Map((connections.data??[]).map(x=>[x.id,x]));
  return <section className="space-y-4">
    <div className="grid gap-4 xl:grid-cols-2">
      <ConnectorCard icon={Truck} title={ar?"ربط التوصيل":"Delivery adapter"} description={ar?"واجهة عامة لإنشاء طلبات التوصيل ومزامنة الحالة. يتطلب endpoint متوافق وسر مزود على الخادم.":"Generic delivery adapter for creating delivery jobs and syncing provider status. Requires a compatible HTTPS endpoint and server credential."} endpoint={deliveryEndpoint} setEndpoint={setDeliveryEndpoint} onSave={()=>save.mutate({category:"delivery",endpoint:deliveryEndpoint})} busy={save.isPending} connection={(connections.data??[]).find(x=>x.category==="delivery")}/>
      <ConnectorCard icon={WalletCards} title={ar?"ربط المحاسبة":"Accounting adapter"} description={ar?"يرسل الدفعات والاستردادات والمصروفات إلى مزود المحاسبة بشكل idempotent.":"Posts payments, refunds and expenses to the accounting endpoint with idempotency."} endpoint={accountingEndpoint} setEndpoint={setAccountingEndpoint} onSave={()=>save.mutate({category:"accounting",endpoint:accountingEndpoint})} busy={save.isPending} connection={(connections.data??[]).find(x=>x.category==="accounting")}/>
    </div>

    <article className="qs-card p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="font-display text-lg font-bold">{ar?"تصدير محاسبي":"Accounting export"}</h2><p className="mt-1 text-xs text-muted-foreground">{ar?"بديل يعمل بدون أي مزود خارجي: دفعات، استردادات، ضرائب، خدمة، توصيل ومصروفات.":"Credential-free fallback containing payments, refunds, tax, service, delivery and expenses."}</p></div><div className="flex flex-wrap gap-2"><Input type="date" value={from} onChange={e=>setFrom(e.target.value)} className="w-auto"/><Input type="date" value={to} onChange={e=>setTo(e.target.value)} className="w-auto"/><Button variant="outline" disabled={exportAccounting.isPending||!from||!to} onClick={()=>exportAccounting.mutate()}><Download className="size-4"/>{ar?"تصدير CSV":"Export CSV"}</Button></div></div>
    </article>

    <article className="qs-card overflow-hidden">
      <div className="border-b border-border p-5"><h2 className="font-display text-lg font-bold">{ar?"طابور التكاملات":"Integration job queue"}</h2><p className="mt-1 text-xs text-muted-foreground">{ar?"النجاح يعني أن endpoint الخارجي أعاد استجابة ناجحة، وليس مجرد إنشاء المهمة.":"Completed means the external endpoint actually acknowledged the request—not merely that a job was created."}</p></div>
      <div className="overflow-x-auto"><table className="qs-table min-w-[860px]"><thead><tr><th>{ar?"النوع":"Type"}</th><th>{ar?"المزود":"Provider"}</th><th>{ar?"العملية":"Action"}</th><th>{ar?"الحالة":"Status"}</th><th>{ar?"المحاولات":"Attempts"}</th><th>HTTP</th><th>{ar?"الخطأ":"Error"}</th><th/></tr></thead><tbody>{(jobs.data??[]).map(job=><tr key={job.id}><td>{job.category}</td><td>{byId.get(job.connection_id)?.provider??"—"}</td><td><code className="text-xs">{job.action}</code></td><td><Status value={job.status}/></td><td>{job.attempt_count}</td><td>{job.response_status??"—"}</td><td className="max-w-[260px] truncate text-xs text-muted-foreground">{job.last_error??"—"}</td><td>{["failed","retry"].includes(job.status)?<Button size="sm" variant="ghost" disabled={retry.isPending} onClick={()=>retry.mutate(job.id)}><RefreshCcw className="size-3"/>{ar?"إعادة":"Retry"}</Button>:null}</td></tr>)}</tbody></table>{(jobs.data??[]).length===0?<div className="p-8 text-center text-sm text-muted-foreground">{ar?"لا توجد مهام تكامل بعد.":"No integration jobs yet."}</div>:null}</div>
    </article>
  </section>;
}

function ConnectorCard({icon:Icon,title,description,endpoint,setEndpoint,onSave,busy,connection}:{icon:typeof Truck;title:string;description:string;endpoint:string;setEndpoint:(v:string)=>void;onSave:()=>void;busy:boolean;connection:Connection|undefined}){
  return <article className="qs-card p-5"><div className="flex items-start justify-between gap-3"><span className="grid size-10 place-items-center rounded-xl bg-orange-500/10 text-[#ff5a0a]"><Icon className="size-4"/></span><Status value={connection?.status??"not_configured"}/></div><h2 className="mt-4 font-display text-lg font-bold">{title}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p><div className="mt-4 flex gap-2"><Input value={endpoint} onChange={e=>setEndpoint(e.target.value)} placeholder="https://provider.example.com/quickserve"/><Button disabled={busy} onClick={onSave}><Save className="size-4"/></Button></div>{connection?.last_sync_at?<p className="mt-2 text-[10px] text-muted-foreground">Last sync: {new Date(connection.last_sync_at).toLocaleString()}</p>:null}{connection?.last_error?<p className="mt-2 text-xs text-red-600">{connection.last_error}</p>:null}</article>;
}
function Status({value}:{value:string}){return <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-bold capitalize",value==="healthy"||value==="completed"?"bg-emerald-500/10 text-emerald-700":value==="error"||value==="failed"?"bg-red-500/10 text-red-700":value==="degraded"||value==="retry"?"bg-amber-500/10 text-amber-700":value==="configured"||value==="queued"||value==="in_flight"?"bg-blue-500/10 text-blue-700":"bg-muted text-muted-foreground")}>{value.replaceAll("_"," ")}</span>;}
