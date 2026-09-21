import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Copy, Cpu, MonitorSmartphone, PlugZap, Printer, RefreshCw, TabletSmartphone, Unplug, Wifi, WifiOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { DEVICE_ID_KEY, DEVICE_TOKEN_KEY } from "@/components/app/DeviceHeartbeat";
import { MasterEyebrow, MasterKpi, MasterPageHeader } from "@/components/app/MasterPage";
import { AppHeader } from "@/components/nav/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccess } from "@/hooks/useSession";
import { useWorkspaceScope } from "@/hooks/useWorkspace";
import { supabase } from "@/integrations/supabase/client";
import { humanError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { membershipHasCapability } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/devices")({
  head: () => ({
    meta: [
      { title: "Devices & Hardware — QuickServe" },
      { name: "description", content: "Register and monitor restaurant terminals, KDS screens, kiosks, tablets and printers." },
    ],
  }),
  component: DevicesPage,
});

type DeviceType="cashier"|"kds"|"waiter"|"manager"|"kiosk"|"tablet"|"printer"|"other";
type Device={
  id:string;name:string;device_type:DeviceType;kitchen_station_id:string|null;token_prefix:string;is_active:boolean;
  last_seen_at:string|null;last_route:string|null;last_metadata:Record<string,unknown>;created_at:string;
};
type Station={id:string;name:string;name_ar:string|null;is_active:boolean};
type PrinterRow={id:string;name:string;purpose:string;provider:string;endpoint:string|null;is_active:boolean;kitchen_station_id:string|null;updated_at:string};

function DevicesPage(){
  const {lang}=useI18n();
  const ar=lang==="ar";
  const scope=useWorkspaceScope();
  const access=useAccess();
  const rid=scope.restaurantId;
  const membership=rid?access.membershipFor(rid):null;
  const canManage=Boolean(access.isSuperAdmin||(membership&&membershipHasCapability(membership.role,membership.permission_overrides,"manage_restaurant")));
  const qc=useQueryClient();

  const [name,setName]=useState("");
  const [type,setType]=useState<DeviceType>("tablet");
  const [station,setStation]=useState("none");
  const [newToken,setNewToken]=useState<string|null>(null);
  const [newDeviceId,setNewDeviceId]=useState<string|null>(null);

  const devices=useQuery<Device[]>({
    queryKey:["restaurant-devices",rid],
    enabled:Boolean(rid&&canManage),
    refetchInterval:30_000,
    queryFn:async()=>{
      const {data,error}=await (supabase as any).from("restaurant_devices")
        .select("id,name,device_type,kitchen_station_id,token_prefix,is_active,last_seen_at,last_route,last_metadata,created_at")
        .eq("restaurant_id",rid!)
        .order("created_at",{ascending:false});
      if(error)throw error;
      return (data??[]) as Device[];
    },
  });

  const stations=useQuery<Station[]>({
    queryKey:["device-stations",rid],
    enabled:Boolean(rid&&canManage),
    queryFn:async()=>{
      const {data,error}=await (supabase as any).from("kitchen_stations")
        .select("id,name,name_ar,is_active")
        .eq("restaurant_id",rid!).eq("is_active",true).order("display_order");
      if(error)throw error;
      return (data??[]) as Station[];
    },
  });

  const printers=useQuery<PrinterRow[]>({
    queryKey:["device-printers",rid],
    enabled:Boolean(rid&&canManage),
    queryFn:async()=>{
      const {data,error}=await (supabase as any).from("kitchen_printers")
        .select("id,name,purpose,provider,endpoint,is_active,kitchen_station_id,updated_at")
        .eq("restaurant_id",rid!).order("name");
      if(error)throw error;
      return (data??[]) as PrinterRow[];
    },
  });

  const register=useMutation({
    mutationFn:async()=>{
      if(!rid)throw new Error("Restaurant unavailable");
      const {data,error}=await (supabase as any).rpc("register_restaurant_device",{
        _restaurant_id:rid,_name:name.trim(),_device_type:type,_kitchen_station_id:type==="kds"&&station!=="none"?station:null,
      });
      if(error)throw error;
      return data as {id:string;device_token:string;token_prefix:string};
    },
    onSuccess:async(data)=>{
      window.localStorage.setItem(DEVICE_TOKEN_KEY,data.device_token);
      window.localStorage.setItem(DEVICE_ID_KEY,data.id);
      setNewToken(data.device_token);
      setNewDeviceId(data.id);
      const {error}=await (supabase as any).rpc("heartbeat_restaurant_device",{
        _device_token:data.device_token,_route:window.location.pathname,
        _metadata:{viewport:`${window.innerWidth}x${window.innerHeight}`,platform:navigator.platform||null,online:navigator.onLine},
      });
      if(error)console.warn(error);
      setName("");
      await qc.invalidateQueries({queryKey:["restaurant-devices",rid]});
      toast.success(ar?"تم تسجيل هذا الجهاز وأصبح تحت المراقبة":"This device is registered and now monitored");
    },
    onError:(error)=>toast.error(humanError(error,lang)),
  });

  const revoke=useMutation({
    mutationFn:async(id:string)=>{
      const {error}=await (supabase as any).rpc("revoke_restaurant_device",{_device_id:id});
      if(error)throw error;
      return id;
    },
    onSuccess:async(id)=>{
      if(window.localStorage.getItem(DEVICE_ID_KEY)===id){
        window.localStorage.removeItem(DEVICE_TOKEN_KEY);
        window.localStorage.removeItem(DEVICE_ID_KEY);
      }
      await qc.invalidateQueries({queryKey:["restaurant-devices",rid]});
      toast.success(ar?"تم إلغاء الجهاز":"Device revoked");
    },
    onError:(error)=>toast.error(humanError(error,lang)),
  });

  if(scope.isPending||access.isPending)return <div className="min-h-dvh bg-background"><AppHeader/><main className="qs-page"><Skeleton className="h-[600px] rounded-3xl"/></main></div>;
  if(!rid||!canManage)return <div className="min-h-dvh bg-background"><AppHeader/><main className="qs-page"><section className="qs-card p-10 text-center"><MonitorSmartphone className="mx-auto size-10 text-muted-foreground"/><h1 className="mt-4 font-display text-xl font-bold">{ar?"إدارة الأجهزة غير متاحة":"Device management unavailable"}</h1></section></main></div>;

  const now=Date.now();
  const rows=devices.data??[];
  const active=rows.filter(row=>row.is_active);
  const online=active.filter(row=>row.last_seen_at&&now-new Date(row.last_seen_at).getTime()<150_000);
  const stale=active.filter(row=>!row.last_seen_at||now-new Date(row.last_seen_at).getTime()>=150_000);
  const printerRows=printers.data??[];
  const currentDeviceId=typeof window!=="undefined"?window.localStorage.getItem(DEVICE_ID_KEY):null;
  const stationMap=new Map((stations.data??[]).map(row=>[row.id,ar?(row.name_ar||row.name):row.name]));

  async function copyToken(){
    if(!newToken)return;
    await navigator.clipboard.writeText(newToken);
    toast.success(ar?"تم نسخ رمز الجهاز":"Device token copied");
  }

  return <div className="min-h-dvh bg-background">
    <AppHeader title={ar?"الأجهزة والهاردوير":"Devices & Hardware"}/>
    <main className="qs-page space-y-5">
      <MasterPageHeader
        eyebrow={<MasterEyebrow icon={Cpu}>{ar?"صحة التشغيل":"Operational Health"}</MasterEyebrow>}
        title={ar?"مركز الأجهزة والهاردوير":"Devices & Hardware Center"}
        description={ar?"اعرف أي شاشة كاشير أو KDS أو كشك أو جهاز لوحي متصل الآن، وآخر مسار استخدمه، وربطه بمحطة المطبخ.":"Know which cashier, KDS, kiosk and tablet devices are online, when they were last seen, what route they are running and which kitchen station they belong to."}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MasterKpi icon={Wifi} label={ar?"متصلة":"Online"} value={String(online.length)} hint={ar?"نبضة خلال آخر 150 ثانية":"Heartbeat in last 150 sec"} tone="green"/>
        <MasterKpi icon={WifiOff} label={ar?"غير متصلة":"Offline"} value={String(stale.length)} hint={ar?"تحتاج مراجعة":"Needs attention"} tone="orange"/>
        <MasterKpi icon={MonitorSmartphone} label={ar?"أجهزة مسجلة":"Registered"} value={String(active.length)} hint={ar?"أجهزة QuickServe":"QuickServe clients"} tone="blue"/>
        <MasterKpi icon={Printer} label={ar?"طابعات مفعلة":"Active Printers"} value={String(printerRows.filter(row=>row.is_active).length)} hint={ar?`${printerRows.length} طابعة معرفة`:`${printerRows.length} configured`} tone="purple"/>
      </section>

      <section className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        <article className="qs-card p-5">
          <div className="flex items-start gap-3"><span className="grid size-10 place-items-center rounded-xl bg-orange-500/10 text-[#ff5a0a]"><TabletSmartphone className="size-4"/></span><div><h2 className="font-display text-lg font-bold">{ar?"تسجيل هذا الجهاز":"Register this device"}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{ar?"يسمح لـ QuickServe بإرسال نبضة صحة من هذا المتصفح ومراقبة توفره.":"Lets QuickServe heartbeat this browser and monitor its availability."}</p></div></div>
          <div className="mt-5 space-y-3">
            <Input value={name} onChange={e=>setName(e.target.value)} maxLength={120} placeholder={ar?"مثال: كاشير المدخل":"e.g. Front Cashier"}/>
            <Select value={type} onValueChange={v=>setType(v as DeviceType)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>
              <SelectItem value="cashier">{ar?"كاشير":"Cashier"}</SelectItem>
              <SelectItem value="kds">KDS</SelectItem>
              <SelectItem value="waiter">{ar?"جهاز نادل":"Waiter device"}</SelectItem>
              <SelectItem value="manager">{ar?"جهاز مدير":"Manager"}</SelectItem>
              <SelectItem value="kiosk">{ar?"كشك":"Kiosk"}</SelectItem>
              <SelectItem value="tablet">{ar?"جهاز لوحي":"Tablet"}</SelectItem>
              <SelectItem value="other">{ar?"آخر":"Other"}</SelectItem>
            </SelectContent></Select>
            {type==="kds"?<Select value={station} onValueChange={setStation}><SelectTrigger><SelectValue placeholder={ar?"محطة المطبخ":"Kitchen station"}/></SelectTrigger><SelectContent><SelectItem value="none">{ar?"بدون محطة":"No station"}</SelectItem>{(stations.data??[]).map(row=><SelectItem key={row.id} value={row.id}>{ar?(row.name_ar||row.name):row.name}</SelectItem>)}</SelectContent></Select>:null}
            <Button className="w-full" disabled={register.isPending||name.trim().length<1} onClick={()=>register.mutate()}><PlugZap className="size-4"/>{ar?"تسجيل ومراقبة":"Register & monitor"}</Button>
          </div>

          {newToken?<div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/50 dark:bg-amber-950/10"><strong className="text-xs">{ar?"رمز الجهاز يظهر مرة واحدة":"Device token — shown once"}</strong><p className="mt-1 text-[10px] leading-4 text-muted-foreground">{ar?"تم حفظه تلقائياً في هذا المتصفح. انسخه فقط إذا كنت تحتاجه للتشخيص.":"It is already saved in this browser. Copy it only if needed for diagnostics."}</p><div className="mt-2 flex gap-2"><code className="min-w-0 flex-1 break-all rounded-lg bg-background p-2 text-[10px]">{newToken}</code><Button size="sm" variant="outline" onClick={()=>void copyToken()}><Copy className="size-3"/></Button></div></div>:null}
        </article>

        <article className="qs-card overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-border p-5"><div><h2 className="qs-section-title">{ar?"الأجهزة المسجلة":"Registered devices"}</h2><p className="mt-1 text-xs text-muted-foreground">{ar?"Online = نبضة صحة حديثة.":"Online means a recent successful heartbeat."}</p></div><Button variant="outline" size="sm" onClick={()=>qc.invalidateQueries({queryKey:["restaurant-devices",rid]})}><RefreshCw className="size-3.5"/>{ar?"تحديث":"Refresh"}</Button></div>
          {devices.isPending?<div className="p-5"><Skeleton className="h-72 rounded-xl"/></div>:rows.length===0?<div className="grid min-h-72 place-items-center text-center"><div><MonitorSmartphone className="mx-auto size-9 text-muted-foreground"/><p className="mt-3 text-sm text-muted-foreground">{ar?"لم يتم تسجيل أجهزة بعد.":"No devices registered yet."}</p></div></div>:<div className="divide-y divide-border">{rows.map(row=>{
            const isOnline=Boolean(row.is_active&&row.last_seen_at&&now-new Date(row.last_seen_at).getTime()<150_000);
            const isCurrent=row.id===currentDeviceId||row.id===newDeviceId;
            return <div key={row.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <span className={cn("grid size-11 shrink-0 place-items-center rounded-2xl",isOnline?"bg-emerald-500/10 text-emerald-600":"bg-muted text-muted-foreground")}>{isOnline?<Wifi className="size-5"/>:<WifiOff className="size-5"/>}</span>
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{row.name}</strong><span className={cn("rounded-full px-2 py-0.5 text-[9px] font-bold",isOnline?"bg-emerald-500/10 text-emerald-700":row.is_active?"bg-slate-500/10 text-slate-600":"bg-red-500/10 text-red-600")}>{isOnline?(ar?"متصل":"Online"):row.is_active?(ar?"غير متصل":"Offline"):(ar?"ملغي":"Revoked")}</span>{isCurrent?<span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[9px] font-bold text-blue-700">{ar?"هذا الجهاز":"This device"}</span>:null}</div><p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{row.device_type}{row.kitchen_station_id?` · ${stationMap.get(row.kitchen_station_id)??"Station"}`:""} · {row.token_prefix}••••</p><p className="mt-1 text-[10px] text-muted-foreground">{row.last_seen_at?(ar?"آخر نبضة: ":"Last seen: ")+new Date(row.last_seen_at).toLocaleString(ar?"ar-JO":"en-JO"):(ar?"لم يرسل نبضة بعد":"No heartbeat yet")}{row.last_route?` · ${row.last_route}`:""}</p></div>
              </div>
              {row.is_active?<Button size="sm" variant="outline" className="text-red-600" disabled={revoke.isPending} onClick={()=>revoke.mutate(row.id)}><Unplug className="size-3.5"/>{ar?"إلغاء":"Revoke"}</Button>:null}
            </div>;
          })}</div>}
        </article>
      </section>

      <article className="qs-card overflow-hidden">
        <div className="border-b border-border p-5"><div className="flex items-center gap-2"><Printer className="size-5 text-[#ff5a0a]"/><h2 className="qs-section-title">{ar?"طابعات المطبخ":"Kitchen printers"}</h2></div><p className="mt-1 text-xs text-muted-foreground">{ar?"تعريفات الطباعة الحالية المرتبطة بمحطات KDS.":"Current printer definitions and KDS station mappings."}</p></div>
        {printers.isPending?<div className="p-5"><Skeleton className="h-40 rounded-xl"/></div>:printerRows.length===0?<div className="p-8 text-center text-sm text-muted-foreground">{ar?"لا توجد طابعات معرفة.":"No printers configured."}</div>:<div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">{printerRows.map(row=><div key={row.id} className="rounded-2xl border border-border bg-muted/15 p-4"><div className="flex items-start justify-between gap-3"><span className="grid size-10 place-items-center rounded-xl bg-muted"><Printer className="size-4"/></span><span className={cn("rounded-full px-2 py-1 text-[9px] font-bold",row.is_active?"bg-emerald-500/10 text-emerald-700":"bg-muted text-muted-foreground")}>{row.is_active?(ar?"مفعلة":"Active"):(ar?"معطلة":"Disabled")}</span></div><strong className="mt-3 block text-sm">{row.name}</strong><p className="mt-1 text-[10px] text-muted-foreground">{row.provider} · {row.purpose}{row.kitchen_station_id?` · ${stationMap.get(row.kitchen_station_id)??"Station"}`:""}</p>{row.endpoint?<p className="mt-1 truncate text-[10px] text-muted-foreground">{row.endpoint}</p>:null}</div>)}</div>}
      </article>
    </main>
  </div>;
}
