import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, KeyRound, Plus, Send, ShieldCheck, Webhook, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { humanError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type ApiKeyRow = {
  id:string;
  name:string;
  key_prefix:string;
  scopes:string[];
  expires_at:string|null;
  last_used_at:string|null;
  revoked_at:string|null;
  created_at:string;
};

type Endpoint = {
  id:string;
  name:string;
  url:string;
  event_types:string[];
  is_active:boolean;
  last_success_at:string|null;
  last_failure_at:string|null;
  last_error:string|null;
  created_at:string;
};

type Delivery = {
  id:string;
  endpoint_id:string;
  event_type:string;
  status:string;
  attempt_count:number;
  response_status:number|null;
  last_error:string|null;
  created_at:string;
};

const SCOPES = ["restaurant:read","orders:read","orders:write","menu:read","menu:write"] as const;
const EVENTS = ["order.created","order.status_changed","order.payment_changed","payment.completed","refund.completed"] as const;

export function DeveloperConnectPanel({restaurantId}:{restaurantId:string}) {
  const {lang}=useI18n();
  const ar=lang==="ar";
  const qc=useQueryClient();
  const [keyName,setKeyName]=useState("");
  const [selectedScopes,setSelectedScopes]=useState<string[]>(["orders:read","menu:read"]);
  const [revealedKey,setRevealedKey]=useState<string|null>(null);
  const [webhookName,setWebhookName]=useState("");
  const [webhookUrl,setWebhookUrl]=useState("");
  const [selectedEvents,setSelectedEvents]=useState<string[]>(["order.created","order.status_changed","payment.completed"]);
  const [revealedWebhookSecret,setRevealedWebhookSecret]=useState<string|null>(null);

  const keys=useQuery<ApiKeyRow[]>({
    queryKey:["integration-api-keys",restaurantId],
    queryFn:async()=>{
      const {data,error}=await (supabase as any).rpc("list_integration_api_keys",{_restaurant_id:restaurantId});
      if(error)throw error;
      return (data??[]) as ApiKeyRow[];
    },
  });

  const webhooks=useQuery<Endpoint[]>({
    queryKey:["webhook-endpoints",restaurantId],
    queryFn:async()=>{
      const {data,error}=await (supabase as any).from("webhook_endpoints")
        .select("id,name,url,event_types,is_active,last_success_at,last_failure_at,last_error,created_at")
        .eq("restaurant_id",restaurantId).order("created_at",{ascending:false});
      if(error)throw error;
      return (data??[]) as Endpoint[];
    },
  });

  const deliveries=useQuery<Delivery[]>({
    queryKey:["webhook-deliveries",restaurantId],
    refetchInterval:15_000,
    queryFn:async()=>{
      const {data,error}=await (supabase as any).from("webhook_deliveries")
        .select("id,endpoint_id,event_type,status,attempt_count,response_status,last_error,created_at")
        .eq("restaurant_id",restaurantId).order("created_at",{ascending:false}).limit(30);
      if(error)throw error;
      return (data??[]) as Delivery[];
    },
  });

  const endpointNames=useMemo(()=>new Map((webhooks.data??[]).map(row=>[row.id,row.name])),[webhooks.data]);

  const createKey=useMutation({
    mutationFn:async()=>{
      const {data,error}=await (supabase as any).rpc("create_integration_api_key",{
        _restaurant_id:restaurantId,
        _name:keyName.trim(),
        _scopes:selectedScopes,
        _expires_at:null,
      });
      if(error)throw error;
      return data as {id:string;api_key:string;key_prefix:string};
    },
    onSuccess:async(data)=>{
      setRevealedKey(data.api_key);
      setKeyName("");
      await qc.invalidateQueries({queryKey:["integration-api-keys",restaurantId]});
      toast.success(ar?"تم إنشاء المفتاح. انسخه الآن؛ لن يظهر كاملاً مرة أخرى.":"API key created. Copy it now; the full key will not be shown again.");
    },
    onError:(error)=>toast.error(humanError(error,lang)),
  });

  const revokeKey=useMutation({
    mutationFn:async(id:string)=>{
      const {error}=await (supabase as any).rpc("revoke_integration_api_key",{_key_id:id});
      if(error)throw error;
    },
    onSuccess:async()=>qc.invalidateQueries({queryKey:["integration-api-keys",restaurantId]}),
    onError:(error)=>toast.error(humanError(error,lang)),
  });

  const createWebhook=useMutation({
    mutationFn:async()=>{
      const {data,error}=await (supabase as any).rpc("create_webhook_endpoint",{
        _restaurant_id:restaurantId,
        _name:webhookName.trim(),
        _url:webhookUrl.trim(),
        _event_types:selectedEvents,
      });
      if(error)throw error;
      return data as {id:string;signing_secret:string};
    },
    onSuccess:async(data)=>{
      setRevealedWebhookSecret(data.signing_secret);
      setWebhookName("");
      setWebhookUrl("");
      await qc.invalidateQueries({queryKey:["webhook-endpoints",restaurantId]});
      toast.success(ar?"تم إنشاء Webhook. احفظ سر التوقيع الآن.":"Webhook created. Save the signing secret now.");
    },
    onError:(error)=>toast.error(humanError(error,lang)),
  });

  const testWebhook=useMutation({
    mutationFn:async(id:string)=>{
      const {error}=await (supabase as any).rpc("enqueue_webhook_test",{_endpoint_id:id});
      if(error)throw error;
    },
    onSuccess:async()=>{
      await qc.invalidateQueries({queryKey:["webhook-deliveries",restaurantId]});
      toast.success(ar?"تم وضع اختبار Webhook في طابور الإرسال.":"Webhook test queued for delivery.");
    },
    onError:(error)=>toast.error(humanError(error,lang)),
  });

  const disableWebhook=useMutation({
    mutationFn:async(id:string)=>{
      const {error}=await (supabase as any).rpc("disable_webhook_endpoint",{_endpoint_id:id});
      if(error)throw error;
    },
    onSuccess:async()=>qc.invalidateQueries({queryKey:["webhook-endpoints",restaurantId]}),
    onError:(error)=>toast.error(humanError(error,lang)),
  });

  function toggle(value:string,current:string[],setter:(next:string[])=>void){
    setter(current.includes(value)?current.filter(item=>item!==value):[...current,value]);
  }

  async function copy(value:string){
    await navigator.clipboard.writeText(value);
    toast.success(ar?"تم النسخ":"Copied");
  }

  const apiBase=(import.meta.env.VITE_SUPABASE_URL ? String(import.meta.env.VITE_SUPABASE_URL) : "https://YOUR-PROJECT.supabase.co")+"/functions/v1/quickserve-api";

  return <section className="space-y-5">
    <div className="grid gap-4 xl:grid-cols-2">
      <article className="qs-card p-5">
        <div className="flex items-start gap-3"><span className="grid size-10 place-items-center rounded-xl bg-orange-500/10 text-[#ff5a0a]"><KeyRound className="size-4"/></span><div><h2 className="font-display text-lg font-bold">{ar?"مفاتيح API":"API keys"}</h2><p className="mt-1 text-xs text-muted-foreground">{ar?"مفاتيح محددة الصلاحيات للتكاملات الخارجية. يتم تخزين البصمة فقط.":"Scoped keys for external systems. Only the key hash is stored."}</p></div></div>
        <div className="mt-4 rounded-xl bg-muted/40 p-3 text-xs"><strong className="block">{ar?"عنوان API":"API base URL"}</strong><code className="mt-1 block break-all text-muted-foreground">{apiBase}</code></div>
        <div className="mt-4 space-y-3">
          <Input value={keyName} onChange={e=>setKeyName(e.target.value)} placeholder={ar?"اسم المفتاح، مثال: ERP Connector":"Key name, e.g. ERP Connector"}/>
          <div className="flex flex-wrap gap-2">{SCOPES.map(scope=><button type="button" key={scope} onClick={()=>toggle(scope,selectedScopes,setSelectedScopes)} className={cn("rounded-full border px-3 py-1.5 text-[10px] font-semibold",selectedScopes.includes(scope)?"border-[#ff5a0a] bg-orange-500/10 text-[#ff5a0a]":"border-border text-muted-foreground")}>{selectedScopes.includes(scope)?<Check className="me-1 inline size-3"/>:null}{scope}</button>)}</div>
          <Button disabled={createKey.isPending||keyName.trim().length<2||selectedScopes.length===0} onClick={()=>createKey.mutate()}><Plus className="size-4"/>{ar?"إنشاء مفتاح":"Create API key"}</Button>
        </div>
        {revealedKey?<SecretReveal title={ar?"انسخ المفتاح الآن":"Copy this key now"} value={revealedKey} onCopy={copy} onClose={()=>setRevealedKey(null)}/>:null}
        <div className="mt-5 divide-y divide-border">{(keys.data??[]).map(row=><div key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><strong className="text-sm">{row.name}</strong><p className="mt-1 text-[10px] text-muted-foreground">{row.key_prefix}•••• · {row.scopes.join(", ")}</p><p className="mt-1 text-[10px] text-muted-foreground">{row.last_used_at?(ar?"آخر استخدام: ":"Last used: ")+new Date(row.last_used_at).toLocaleString(ar?"ar-JO":"en-US"):(ar?"لم يستخدم بعد":"Never used")}</p></div><div className="flex items-center gap-2">{row.revoked_at?<span className="rounded-full bg-muted px-2 py-1 text-[10px] font-bold text-muted-foreground">{ar?"ملغي":"Revoked"}</span>:<Button size="sm" variant="outline" onClick={()=>revokeKey.mutate(row.id)}>{ar?"إلغاء":"Revoke"}</Button>}</div></div>)}</div>
      </article>

      <article className="qs-card p-5">
        <div className="flex items-start gap-3"><span className="grid size-10 place-items-center rounded-xl bg-orange-500/10 text-[#ff5a0a]"><Webhook className="size-4"/></span><div><h2 className="font-display text-lg font-bold">{ar?"Webhooks موقعة":"Signed webhooks"}</h2><p className="mt-1 text-xs text-muted-foreground">{ar?"إرسال تلقائي مع HMAC، إعادة المحاولة وسجل التسليم.":"Automatic HMAC-signed delivery with retries and delivery logs."}</p></div></div>
        <div className="mt-4 space-y-3">
          <Input value={webhookName} onChange={e=>setWebhookName(e.target.value)} placeholder={ar?"اسم Webhook":"Webhook name"}/>
          <Input value={webhookUrl} onChange={e=>setWebhookUrl(e.target.value)} placeholder="https://example.com/quickserve/webhook"/>
          <div className="flex flex-wrap gap-2">{EVENTS.map(event=><button type="button" key={event} onClick={()=>toggle(event,selectedEvents,setSelectedEvents)} className={cn("rounded-full border px-3 py-1.5 text-[10px] font-semibold",selectedEvents.includes(event)?"border-[#ff5a0a] bg-orange-500/10 text-[#ff5a0a]":"border-border text-muted-foreground")}>{selectedEvents.includes(event)?<Check className="me-1 inline size-3"/>:null}{event}</button>)}</div>
          <Button disabled={createWebhook.isPending||webhookName.trim().length<2||!webhookUrl.startsWith("https://")||selectedEvents.length===0} onClick={()=>createWebhook.mutate()}><Plus className="size-4"/>{ar?"إضافة Webhook":"Add webhook"}</Button>
        </div>
        {revealedWebhookSecret?<SecretReveal title={ar?"سر توقيع Webhook":"Webhook signing secret"} value={revealedWebhookSecret} onCopy={copy} onClose={()=>setRevealedWebhookSecret(null)}/>:null}
        <div className="mt-5 divide-y divide-border">{(webhooks.data??[]).map(row=><div key={row.id} className="py-3"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><strong className="text-sm">{row.name}</strong><span className={cn("rounded-full px-2 py-0.5 text-[9px] font-bold",row.is_active?"bg-emerald-500/10 text-emerald-700":"bg-muted text-muted-foreground")}>{row.is_active?(ar?"نشط":"Active"):(ar?"معطل":"Disabled")}</span></div><p className="mt-1 max-w-[440px] truncate text-[10px] text-muted-foreground">{row.url}</p><p className="mt-1 text-[10px] text-muted-foreground">{row.event_types.join(", ")}</p>{row.last_error?<p className="mt-1 text-[10px] text-red-600">{row.last_error}</p>:null}</div>{row.is_active?<div className="flex gap-2"><Button size="sm" variant="outline" onClick={()=>testWebhook.mutate(row.id)}><Send className="size-3"/>{ar?"اختبار":"Test"}</Button><Button size="sm" variant="outline" onClick={()=>disableWebhook.mutate(row.id)}><X className="size-3"/>{ar?"تعطيل":"Disable"}</Button></div>:null}</div></div>)}</div>
      </article>
    </div>

    <article className="qs-card p-5">
      <div className="flex items-center gap-3"><ShieldCheck className="size-5 text-[#ff5a0a]"/><div><h2 className="font-bold">{ar?"سجل تسليم Webhook":"Webhook delivery log"}</h2><p className="text-xs text-muted-foreground">{ar?"آخر 30 محاولة؛ تتم إعادة المحاولة تلقائياً حتى 5 مرات.":"Latest 30 attempts; failed deliveries retry automatically up to five times."}</p></div></div>
      <div className="mt-4 overflow-x-auto"><table className="qs-table min-w-[760px]"><thead><tr><th>{ar?"Webhook":"Webhook"}</th><th>{ar?"الحدث":"Event"}</th><th>{ar?"الحالة":"Status"}</th><th>{ar?"المحاولات":"Attempts"}</th><th>HTTP</th><th>{ar?"الوقت":"Time"}</th></tr></thead><tbody>{(deliveries.data??[]).map(row=><tr key={row.id}><td>{endpointNames.get(row.endpoint_id)??"—"}</td><td><code className="text-xs">{row.event_type}</code></td><td><span className={cn("rounded-full px-2 py-1 text-[10px] font-bold",row.status==="delivered"?"bg-emerald-500/10 text-emerald-700":row.status==="failed"?"bg-red-500/10 text-red-700":row.status==="retry"?"bg-amber-500/10 text-amber-700":"bg-blue-500/10 text-blue-700")}>{row.status}</span>{row.last_error?<p className="mt-1 max-w-[240px] truncate text-[9px] text-red-600">{row.last_error}</p>:null}</td><td>{row.attempt_count}</td><td>{row.response_status??"—"}</td><td className="text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString(ar?"ar-JO":"en-US")}</td></tr>)}</tbody></table></div>
    </article>
  </section>;
}

function SecretReveal({title,value,onCopy,onClose}:{title:string;value:string;onCopy:(value:string)=>void|Promise<void>;onClose:()=>void}) {
  return <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50/60 p-3 dark:border-amber-900/50 dark:bg-amber-950/10"><div className="flex items-center justify-between gap-3"><strong className="text-xs">{title}</strong><button type="button" onClick={onClose}><X className="size-4"/></button></div><div className="mt-2 flex gap-2"><code className="min-w-0 flex-1 break-all rounded-lg bg-background p-2 text-[11px]">{value}</code><Button size="sm" variant="outline" onClick={()=>void onCopy(value)}><Copy className="size-3"/></Button></div></div>;
}
