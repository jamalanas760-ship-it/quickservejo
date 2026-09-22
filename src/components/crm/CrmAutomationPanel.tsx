import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Pause, Play, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { humanError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Automation={
  id:string;name:string;trigger_type:"birthday"|"inactive_30"|"loyalty_milestone"|"high_value";
  channel:"sms"|"whatsapp"|"email";config:Record<string,unknown>;subject:string|null;message:string;
  cooldown_days:number;enabled:boolean;last_run_at:string|null;last_error:string|null;
};
const TRIGGERS=[
  ["birthday","Birthday","عيد الميلاد"],
  ["inactive_30","Inactive 30+ days","غير نشط 30+ يوم"],
  ["loyalty_milestone","Loyalty points milestone","هدف نقاط الولاء"],
  ["high_value","High lifetime spend","إنفاق مرتفع"],
] as const;

export function CrmAutomationPanel({restaurantId}:{restaurantId:string}){
  const {lang}=useI18n();const ar=lang==="ar";const qc=useQueryClient();
  const [name,setName]=useState("");
  const [trigger,setTrigger]=useState<Automation["trigger_type"]>("birthday");
  const [channel,setChannel]=useState<Automation["channel"]>("sms");
  const [threshold,setThreshold]=useState("100");
  const [cooldown,setCooldown]=useState("30");
  const [subject,setSubject]=useState("");
  const [message,setMessage]=useState("");

  const query=useQuery<Automation[]>({
    queryKey:["crm-automations",restaurantId],
    queryFn:async()=>{
      const {data,error}=await (supabase as any).from("crm_automations")
        .select("id,name,trigger_type,channel,config,subject,message,cooldown_days,enabled,last_run_at,last_error")
        .eq("restaurant_id",restaurantId).order("created_at",{ascending:false});
      if(error)throw error;return (data??[]) as Automation[];
    },
  });

  const create=useMutation({
    mutationFn:async()=>{
      const config=trigger==="loyalty_milestone"?{points:Math.max(1,Number(threshold)||100)}
        :trigger==="high_value"?{threshold:Math.max(0,Number(threshold)||100)}:{};
      const {error}=await (supabase as any).from("crm_automations").insert({
        restaurant_id:restaurantId,name:name.trim(),trigger_type:trigger,channel,config,
        subject:channel==="email"?subject.trim()||null:null,message:message.trim(),
        cooldown_days:Math.max(1,Number(cooldown)||30),enabled:true,
      });
      if(error)throw error;
    },
    onSuccess:async()=>{setName("");setSubject("");setMessage("");await qc.invalidateQueries({queryKey:["crm-automations",restaurantId]});toast.success(ar?"تم إنشاء الأتمتة":"Automation created");},
    onError:(error)=>toast.error(humanError(error,lang)),
  });

  const toggle=useMutation({
    mutationFn:async(row:Automation)=>{
      const {error}=await (supabase as any).from("crm_automations").update({enabled:!row.enabled}).eq("id",row.id).eq("restaurant_id",restaurantId);
      if(error)throw error;
    },
    onSuccess:async()=>qc.invalidateQueries({queryKey:["crm-automations",restaurantId]}),
    onError:(error)=>toast.error(humanError(error,lang)),
  });
  const remove=useMutation({
    mutationFn:async(id:string)=>{
      const {error}=await (supabase as any).from("crm_automations").delete().eq("id",id).eq("restaurant_id",restaurantId);
      if(error)throw error;
    },
    onSuccess:async()=>qc.invalidateQueries({queryKey:["crm-automations",restaurantId]}),
    onError:(error)=>toast.error(humanError(error,lang)),
  });

  return <section className="grid gap-5 xl:grid-cols-[minmax(0,.85fr)_minmax(0,1.15fr)]">
    <article className="qs-card p-5">
      <div className="flex items-start gap-3"><span className="grid size-10 place-items-center rounded-xl bg-orange-500/10 text-[#e85d2a]"><Bot className="size-4"/></span><div><h2 className="font-display text-xl font-bold">{ar?"أتمتة دورة العميل":"Lifecycle automation"}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{ar?"يتم فحص الشروط كل ساعة، مع احترام الموافقة وفترة التهدئة لكل عميل.":"Rules run hourly with consent checks and a per-guest cooldown."}</p></div></div>
      <div className="mt-4 space-y-3">
        <Input value={name} onChange={e=>setName(e.target.value)} placeholder={ar?"اسم الأتمتة":"Automation name"}/>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold">{ar?"المحفز":"Trigger"}<select className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm" value={trigger} onChange={e=>setTrigger(e.target.value as Automation["trigger_type"])}>{TRIGGERS.map(([value,en,arabic])=><option key={value} value={value}>{ar?arabic:en}</option>)}</select></label>
          <label className="text-xs font-semibold">{ar?"القناة":"Channel"}<select className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm" value={channel} onChange={e=>setChannel(e.target.value as Automation["channel"])}><option value="sms">SMS</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option></select></label>
        </div>
        {(trigger==="loyalty_milestone"||trigger==="high_value")?<Input type="number" min="0" value={threshold} onChange={e=>setThreshold(e.target.value)} placeholder={trigger==="loyalty_milestone"?(ar?"عدد النقاط":"Points threshold"):(ar?"قيمة الإنفاق":"Spend threshold")}/>:null}
        <Input type="number" min="1" max="3650" value={cooldown} onChange={e=>setCooldown(e.target.value)} placeholder={ar?"فترة التهدئة بالأيام":"Cooldown days"}/>
        {channel==="email"?<Input value={subject} onChange={e=>setSubject(e.target.value)} placeholder={ar?"عنوان البريد":"Email subject"}/>:null}
        <Textarea rows={4} maxLength={2000} value={message} onChange={e=>setMessage(e.target.value)} placeholder={ar?"الرسالة — استخدم {{name}} للاسم":"Message — use {{name}} for guest name"}/>
        <Button disabled={create.isPending||name.trim().length<2||message.trim().length===0} onClick={()=>create.mutate()}><Plus className="size-4"/>{ar?"إنشاء الأتمتة":"Create automation"}</Button>
      </div>
    </article>

    <article className="qs-card overflow-hidden">
      <div className="border-b border-border p-5"><h2 className="font-display text-xl font-bold">{ar?"القواعد النشطة":"Automation rules"}</h2><p className="mt-1 text-xs text-muted-foreground">{ar?"الرسائل تمر عبر نفس عامل الحملات؛ إذا لم يكن مزود القناة مهيأ فلن يتم اعتبارها مرسلة.":"Messages use the same campaign worker; unconfigured providers never produce fake sends."}</p></div>
      <div className="divide-y divide-border">{(query.data??[]).map(row=><div key={row.id} className="p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><strong>{row.name}</strong><span className={cn("rounded-full px-2 py-1 text-[9px] font-bold",row.enabled?"bg-emerald-500/10 text-emerald-700":"bg-muted text-muted-foreground")}>{row.enabled?(ar?"نشط":"Active"):(ar?"متوقف":"Paused")}</span></div><p className="mt-1 text-xs text-muted-foreground">{row.trigger_type.replaceAll("_"," ")} · {row.channel.toUpperCase()} · {row.cooldown_days}d cooldown</p>{row.last_run_at?<p className="mt-1 text-[10px] text-muted-foreground">{ar?"آخر فحص: ":"Last run: "}{new Date(row.last_run_at).toLocaleString(ar?"ar-JO":"en-US")}</p>:null}{row.last_error?<p className="mt-2 text-xs text-red-600">{row.last_error}</p>:null}</div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={()=>toggle.mutate(row)}>{row.enabled?<Pause className="size-3"/>:<Play className="size-3"/>}{row.enabled?(ar?"إيقاف":"Pause"):(ar?"تشغيل":"Enable")}</Button><Button size="icon" variant="ghost" className="size-9 text-muted-foreground hover:text-destructive" onClick={()=>remove.mutate(row.id)}><Trash2 className="size-4"/></Button></div></div></div>)}</div>
      {(query.data??[]).length===0?<div className="p-10 text-center text-sm text-muted-foreground">{ar?"لا توجد قواعد تلقائية بعد.":"No lifecycle automations yet."}</div>:null}
    </article>
  </section>;
}
