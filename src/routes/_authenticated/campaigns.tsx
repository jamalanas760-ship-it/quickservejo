import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2, Mail, Megaphone, MessageSquareText, Send, UsersRound, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { MasterEyebrow, MasterKpi, MasterPageHeader } from "@/components/app/MasterPage";
import { CrmAutomationPanel } from "@/components/crm/CrmAutomationPanel";
import { AppHeader } from "@/components/nav/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/useSession";
import { useWorkspaceScope } from "@/hooks/useWorkspace";
import { humanError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { membershipHasCapability } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/campaigns")({
  head: () => ({ meta: [{ title: "CRM Campaigns — QuickServe" }, { name: "description", content: "Consent-safe restaurant retention campaigns with scheduled SMS, WhatsApp and email delivery." }] }),
  component: CampaignsPage,
});

type Campaign = {
  id:string; name:string; channel:"sms"|"whatsapp"|"email"; segment_type:string; status:string;
  scheduled_at:string|null; recipient_count:number; sent_count:number; failed_count:number; skipped_count:number;
  last_error:string|null; created_at:string;
};

const SEGMENTS = [
  ["all_opted_in","All opted-in guests","كل العملاء الموافقين"],
  ["vip","VIP / high spend","كبار العملاء / إنفاق مرتفع"],
  ["repeat","Repeat guests","العملاء المتكررون"],
  ["inactive_30","Inactive 30+ days","غير نشط 30+ يوم"],
  ["inactive_60","Inactive 60+ days","غير نشط 60+ يوم"],
  ["inactive_90","Inactive 90+ days","غير نشط 90+ يوم"],
  ["birthday_month","Birthday this month","عيد ميلاد هذا الشهر"],
  ["loyalty_tier","Loyalty tier","فئة ولاء"],
] as const;

function CampaignsPage() {
  const {lang}=useI18n();
  const ar=lang==="ar";
  const scope=useWorkspaceScope();
  const access=useAccess();
  const rid=scope.restaurantId;
  const membership=rid?access.membershipFor(rid):null;
  const canManage=Boolean(access.isSuperAdmin||(membership&&membershipHasCapability(membership.role,membership.permission_overrides,"manage_restaurant")));
  const qc=useQueryClient();

  const [name,setName]=useState("");
  const [channel,setChannel]=useState<"sms"|"whatsapp"|"email">("sms");
  const [segment,setSegment]=useState("all_opted_in");
  const [threshold,setThreshold]=useState("100");
  const [tier,setTier]=useState("gold");
  const [subject,setSubject]=useState("");
  const [message,setMessage]=useState("");
  const [scheduledAt,setScheduledAt]=useState(()=>new Date(Date.now()+5*60_000).toISOString().slice(0,16));
  const [preview,setPreview]=useState<{count:number;sample:Array<{id:string;name:string|null;visits:number;lifetime_spend:number}>}|null>(null);

  const campaigns=useQuery<Campaign[]>({
    queryKey:["crm-campaigns",rid],
    enabled:Boolean(rid&&canManage),
    refetchInterval:20_000,
    queryFn:async()=>{
      const {data,error}=await (supabase as any).from("crm_campaigns")
        .select("id,name,channel,segment_type,status,scheduled_at,recipient_count,sent_count,failed_count,skipped_count,last_error,created_at")
        .eq("restaurant_id",rid!).order("created_at",{ascending:false}).limit(100);
      if(error)throw error;
      return (data??[]) as Campaign[];
    },
  });

  const segmentConfig=useMemo(()=>{
    if(segment==="vip") return {min_spend:Number(threshold)||100};
    if(segment==="repeat") return {min_visits:Math.max(2,Number(threshold)||2)};
    if(segment==="loyalty_tier") return {tier:tier.trim().toLowerCase()};
    return {};
  },[segment,threshold,tier]);

  const previewMutation=useMutation({
    mutationFn:async()=>{
      const {data,error}=await (supabase as any).rpc("preview_campaign_segment",{
        _restaurant_id:rid,_segment_type:segment,_segment_config:segmentConfig,_channel:channel,
      });
      if(error)throw error;
      return data as {count:number;sample:Array<{id:string;name:string|null;visits:number;lifetime_spend:number}>};
    },
    onSuccess:setPreview,
    onError:(error)=>toast.error(humanError(error,lang)),
  });

  const createAndSchedule=useMutation({
    mutationFn:async()=>{
      if(!rid)throw new Error("Restaurant required");
      const {data:id,error:createError}=await (supabase as any).rpc("create_crm_campaign",{
        _restaurant_id:rid,_name:name.trim(),_channel:channel,_segment_type:segment,_segment_config:segmentConfig,
        _subject:channel==="email"?subject.trim():null,_message:message.trim(),
      });
      if(createError)throw createError;
      const scheduleIso=new Date(scheduledAt).toISOString();
      const {data:count,error:scheduleError}=await (supabase as any).rpc("schedule_crm_campaign",{_campaign_id:id,_scheduled_at:scheduleIso});
      if(scheduleError)throw scheduleError;
      return {id:String(id),count:Number(count)};
    },
    onSuccess:async(result)=>{
      await qc.invalidateQueries({queryKey:["crm-campaigns",rid]});
      setName("");setSubject("");setMessage("");setPreview(null);
      toast.success(ar?`تمت جدولة الحملة لـ ${result.count} مستلم موافق.`:`Campaign scheduled for ${result.count} opted-in recipients.`);
    },
    onError:(error)=>toast.error(humanError(error,lang)),
  });

  const cancel=useMutation({
    mutationFn:async(id:string)=>{
      const {error}=await (supabase as any).rpc("cancel_crm_campaign",{_campaign_id:id});
      if(error)throw error;
    },
    onSuccess:async()=>qc.invalidateQueries({queryKey:["crm-campaigns",rid]}),
    onError:(error)=>toast.error(humanError(error,lang)),
  });

  if(scope.isPending||access.isPending)return <div className="min-h-dvh bg-background"><AppHeader/><main className="qs-page"><Skeleton className="h-[600px] rounded-3xl"/></main></div>;
  if(!rid||!canManage)return <div className="min-h-dvh bg-background"><AppHeader/><main className="qs-page"><section className="qs-card p-8 text-center"><Megaphone className="mx-auto size-10 text-muted-foreground"/><h1 className="mt-4 text-xl font-bold">{ar?"الحملات غير متاحة":"Campaigns are not available"}</h1></section></main></div>;

  return <div className="min-h-dvh bg-background">
    <AppHeader title={ar?"حملات العملاء":"CRM Campaigns"}/>
    <main className="qs-page qs-compact-page qs-viewport-page">
      <MasterPageHeader
        eyebrow={<MasterEyebrow icon={Megaphone}>{ar?"احتفاظ العملاء":"Retention"}</MasterEyebrow>}
        title={ar?"حملات العملاء":"CRM Campaigns"}
        description={ar?"أنشئ حملات موافقة وآمنة، عاين الجمهور، وجدول الإرسال مع متابعة حقيقية للنتائج.":"Build consent-safe campaigns, preview the audience, schedule delivery and monitor real provider outcomes."}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MasterKpi icon={Megaphone} label={ar?"كل الحملات":"Campaigns"} value={(campaigns.data??[]).length} tone="slate" />
        <MasterKpi icon={Send} label={ar?"مكتملة":"Completed"} value={(campaigns.data??[]).filter(row=>row.status==="completed").length} tone="green" />
        <MasterKpi icon={CalendarClock} label={ar?"مجدولة":"Scheduled"} value={(campaigns.data??[]).filter(row=>row.status==="scheduled"||row.status==="processing").length} tone="blue" />
        <MasterKpi icon={XCircle} label={ar?"تحتاج تدخل":"Needs attention"} value={(campaigns.data??[]).filter(row=>row.status==="blocked"||row.failed_count>0).length} tone={(campaigns.data??[]).some(row=>row.status==="blocked"||row.failed_count>0)?"red":"slate"} />
      </section>

      <section className="qs-viewport-fill grid min-h-0 gap-2 overflow-hidden xl:grid-cols-[minmax(0,.78fr)_minmax(0,1.22fr)]">
        <article className="qs-card qs-scroll-region min-h-0 p-3">
          <h2 className="font-display text-lg font-bold">{ar?"إنشاء حملة":"Create campaign"}</h2>
          <div className="mt-3 space-y-3">
            <Input value={name} onChange={e=>setName(e.target.value)} placeholder={ar?"اسم الحملة":"Campaign name"}/>
            <div className="grid grid-cols-3 gap-2">{(["sms","whatsapp","email"] as const).map(value=><button key={value} type="button" onClick={()=>{setChannel(value);setPreview(null);}} className={cn("rounded-[10px] border p-2.5 text-[11px] font-bold capitalize",channel===value?"border-[#ff5a0a] bg-orange-500/10 text-[#ff5a0a]":"border-border")}>{value==="email"?<Mail className="mx-auto mb-1 size-4"/>:<MessageSquareText className="mx-auto mb-1 size-4"/>}{value}</button>)}</div>
            <label className="block text-xs font-semibold">{ar?"الشريحة":"Segment"}<select value={segment} onChange={e=>{setSegment(e.target.value);setPreview(null);}} className="mt-1.5 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm">{SEGMENTS.map(([value,en,arabic])=><option key={value} value={value}>{ar?arabic:en}</option>)}</select></label>
            {segment==="vip"?<Input type="number" min="0" value={threshold} onChange={e=>setThreshold(e.target.value)} placeholder={ar?"حد الإنفاق":"Minimum spend"}/>:segment==="repeat"?<Input type="number" min="2" value={threshold} onChange={e=>setThreshold(e.target.value)} placeholder={ar?"أقل عدد زيارات":"Minimum visits"}/>:segment==="loyalty_tier"?<Input value={tier} onChange={e=>setTier(e.target.value)} placeholder={ar?"فئة الولاء":"Loyalty tier"}/>:null}
            <Button variant="outline" onClick={()=>previewMutation.mutate()} disabled={previewMutation.isPending}><UsersRound className="size-4"/>{ar?"معاينة الجمهور":"Preview audience"}</Button>
            {preview?<div className="rounded-xl bg-muted/40 p-3"><strong className="text-sm">{preview.count} {ar?"مستلم مؤهل":"eligible recipients"}</strong>{preview.sample.length?<div className="mt-2 text-[10px] text-muted-foreground">{preview.sample.map(row=>row.name||"Guest").join(" · ")}</div>:null}</div>:null}
            {channel==="email"?<Input value={subject} onChange={e=>setSubject(e.target.value)} placeholder={ar?"عنوان البريد":"Email subject"}/>:null}
            <Textarea rows={4} value={message} onChange={e=>setMessage(e.target.value)} maxLength={2000} placeholder={ar?"الرسالة — يمكنك استخدام {{name}}":"Message — you can use {{name}}"}/>
            <label className="block text-xs font-semibold">{ar?"وقت الإرسال":"Send at"}<Input className="mt-2" type="datetime-local" value={scheduledAt} onChange={e=>setScheduledAt(e.target.value)}/></label>
            <div className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">{channel==="email"?(ar?"يتطلب RESEND_API_KEY و RESEND_FROM_EMAIL في بيئة Edge Function.":"Requires RESEND_API_KEY and RESEND_FROM_EMAIL in the Edge Function environment."):(ar?"يتطلب بيانات Twilio على الخادم. إذا كانت غير مضبوطة ستظهر الحملة Blocked ولن يتم احتساب أي إرسال.":"Requires Twilio server credentials. If absent, the campaign becomes Blocked and no delivery is counted.")}</div>
            <Button disabled={createAndSchedule.isPending||name.trim().length<2||message.trim().length===0||!scheduledAt||preview?.count===0} onClick={()=>createAndSchedule.mutate()}><CalendarClock className="size-4"/>{ar?"إنشاء وجدولة":"Create & schedule"}</Button>
          </div>
        </article>

        <article className="qs-card flex min-h-0 flex-col overflow-hidden">
          <div className="border-b border-border p-4"><h2 className="font-display text-xl font-bold">{ar?"سجل الحملات":"Campaign history"}</h2><p className="mt-1 text-xs text-muted-foreground">{ar?"الحالة والأرقام من طابور التسليم الحقيقي.":"Statuses and counts come from the real delivery queue."}</p></div>
          {campaigns.isPending?<div className="p-5"><Skeleton className="h-80 rounded-xl"/></div>:(campaigns.data??[]).length===0?<div className="grid min-h-[240px] place-items-center p-6 text-center"><div><Megaphone className="mx-auto size-9 text-muted-foreground"/><p className="mt-3 text-sm text-muted-foreground">{ar?"لا توجد حملات بعد.":"No campaigns yet."}</p></div></div>:<div className="qs-scroll-region min-h-0 flex-1 divide-y divide-border">{(campaigns.data??[]).map(row=><div key={row.id} className="p-3.5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><strong>{row.name}</strong><Status status={row.status}/></div><p className="mt-1 text-xs text-muted-foreground">{row.channel.toUpperCase()} · {row.segment_type.replaceAll("_"," ")} · {row.scheduled_at?new Date(row.scheduled_at).toLocaleString(ar?"ar-JO":"en-US"):"—"}</p></div>{["draft","scheduled","processing","blocked"].includes(row.status)?<Button size="sm" variant="outline" onClick={()=>cancel.mutate(row.id)}><XCircle className="size-3"/>{ar?"إلغاء":"Cancel"}</Button>:null}</div><div className="mt-3 grid grid-cols-4 gap-2 text-center text-[10px]"><Count label={ar?"الجمهور":"Audience"} value={row.recipient_count}/><Count label={ar?"أرسل":"Sent"} value={row.sent_count}/><Count label={ar?"فشل":"Failed"} value={row.failed_count}/><Count label={ar?"تخطي":"Skipped"} value={row.skipped_count}/></div>{row.last_error?<p className="mt-3 rounded-lg bg-amber-500/10 p-2 text-xs text-amber-800">{row.last_error}</p>:null}</div>)}</div>}
        </article>
      </section>
      <div className="max-h-[92px] shrink-0 overflow-y-auto"><CrmAutomationPanel restaurantId={rid}/></div>
    </main>
  </div>;
}

function Status({status}:{status:string}) {
  const good=status==="completed"; const bad=status==="blocked"; const active=status==="scheduled"||status==="processing";
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-bold capitalize",good?"bg-emerald-500/10 text-emerald-700":bad?"bg-amber-500/10 text-amber-700":active?"bg-blue-500/10 text-blue-700":"bg-muted text-muted-foreground")}>{good?<CheckCircle2 className="size-3"/>:active?<Send className="size-3"/>:null}{status}</span>;
}
function Count({label,value}:{label:string;value:number}){return <div className="rounded-lg bg-muted/40 p-2"><strong className="block text-sm">{value}</strong><span className="text-muted-foreground">{label}</span></div>}
