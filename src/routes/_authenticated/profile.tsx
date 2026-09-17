import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Bell, Building2, CalendarDays, CheckCircle2, LogOut, Mail, ShieldCheck, User } from "lucide-react";

import { AppHeader } from "@/components/nav/AppHeader";
import { ProfileAvatarEditor } from "@/components/profile/ProfileAvatarEditor";
import { RestaurantProfileSettings } from "@/components/profile/RestaurantProfileSettings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAccess, useSupabaseSession } from "@/hooks/useSession";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { useWorkspaceScope } from "@/hooks/useWorkspace";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { ROLE_LABELS } from "@/lib/permissions";
import { cn } from "@/lib/utils";

type Notifications = { newOrders:boolean; tableAlerts:boolean; system:boolean; marketing:boolean; sound:boolean; orderSounds:boolean; tableSounds:boolean };
const DEFAULT_NOTIF:Notifications={newOrders:true,tableAlerts:true,system:true,marketing:false,sound:true,orderSounds:true,tableSounds:false};

export const Route=createFileRoute("/_authenticated/profile")({head:()=>({meta:[{title:"Profile & Alerts — QuickServe"}]}),component:ProfilePage});

function ProfilePage(){
  const {lang}=useI18n(); const ar=lang==="ar"; const navigate=useNavigate(); const qc=useQueryClient(); const access=useAccess(); const session=useSupabaseSession(); const scope=useWorkspaceScope(); const rid=scope.restaurantId; const {data:restaurant}=useRestaurant(rid??"");
  const [notif,setNotif]=useState<Notifications>(DEFAULT_NOTIF); const user=session.data?.user; const meta=user?.user_metadata as {full_name?:string;name?:string}|undefined; const membership=rid?access.membershipFor(rid):(access.data??[]).find(row=>row.restaurant_id)??null;
  const displayName=meta?.full_name||meta?.name||membership?.name||user?.email?.split("@")[0]||(ar?"المستخدم":"User"); const email=user?.email??"—"; const role=access.isSuperAdmin?"super_admin":membership?.role; const roleLabel=role&&role in ROLE_LABELS?ROLE_LABELS[role as keyof typeof ROLE_LABELS][lang]:(ar?"عضو":"Member"); const notifKey=`quickserve.notifications:${user?.id??"guest"}`;
  useEffect(()=>{try{const raw=localStorage.getItem(notifKey);if(raw)setNotif({...DEFAULT_NOTIF,...JSON.parse(raw)});}catch{setNotif(DEFAULT_NOTIF)}},[notifKey]);
  function toggle(key:keyof Notifications,value:boolean){const next={...notif,[key]:value,...(key==="sound"&&!value?{orderSounds:false,tableSounds:false}:{})};setNotif(next);try{localStorage.setItem(notifKey,JSON.stringify(next))}catch{}}
  async function signOut(){await qc.cancelQueries();qc.clear();await supabase.auth.signOut();navigate({to:"/auth",replace:true});}
  const rows:[keyof Notifications,string,string,string,string][]=[
    ["newOrders","Order Notifications","إشعارات الطلبات","Get notified when new orders arrive","تلقي تنبيه عند وصول طلب جديد"],
    ["tableAlerts","Table Alerts","تنبيهات الطاولات","Get notified about table status changes","تلقي تنبيه عند تغيّر حالة الطاولة"],
    ["system","System Updates","تحديثات النظام","Important system announcements","إعلانات النظام المهمة"],
    ["marketing","Marketing & Product News","أخبار المنتج والتسويق","Tips, features and product updates","نصائح وميزات وتحديثات المنتج"],
    ["sound","Play Notification Sounds","تشغيل أصوات التنبيه","Play a sound for enabled alerts","تشغيل صوت للتنبيهات المفعلة"],
    ["orderSounds","Order Sounds","أصوات الطلبات","Play a sound for new orders","تشغيل صوت للطلبات الجديدة"],
    ["tableSounds","Table Alert Sounds","أصوات تنبيهات الطاولة","Play a sound for table changes","تشغيل صوت لتغييرات الطاولات"],
  ];

  return <div className="min-h-dvh bg-background"><AppHeader/><main className="qs-page space-y-5">
    <header className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="mb-2 text-[10px] font-bold uppercase tracking-[.24em] text-muted-foreground">{ar?"الحساب":"Account"}</p><h1 className="qs-page-title">{ar?"الملف الشخصي والتنبيهات":"Profile & Alerts"}</h1><p className="qs-page-subtitle">{ar?"أدر صورتك وتفضيلات الإشعارات. معلومات الحساب للعرض فقط.":"Manage your profile picture and notification preferences. Account details are read-only."}</p></div><Button variant="outline" className="self-start rounded-xl sm:self-auto" onClick={()=>void signOut()}><LogOut className="size-4"/>{ar?"تسجيل الخروج":"Sign out"}</Button></header>

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.02fr)_minmax(360px,.98fr)]">
      <section className="qs-card overflow-hidden"><div className="qs-panel-header"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-full bg-muted"><User className="size-5"/></span><div><h2 className="font-display text-lg font-bold">{ar?"معلومات الملف الشخصي":"Profile Information"}</h2><p className="mt-1 text-xs text-muted-foreground">{ar?"يمكنك تغيير الصورة فقط. بقية البيانات للعرض.":"Only your profile image can be changed here."}</p></div></div></div><div className="p-4 sm:p-5"><ProfileAvatarEditor restaurantId={rid}/><div className="mt-5 overflow-hidden rounded-xl border border-border"><ReadOnly icon={<User className="size-4"/>} label={ar?"الاسم الكامل":"Full Name"} value={displayName}/><ReadOnly icon={<Mail className="size-4"/>} label={ar?"البريد الإلكتروني":"Email Address"} value={email}/><ReadOnly icon={<ShieldCheck className="size-4"/>} label={ar?"الدور":"Role"} value={roleLabel}/><ReadOnly icon={<Building2 className="size-4"/>} label={ar?"المطعم":"Restaurant"} value={restaurant?.name??scope.restaurantName??"—"}/><ReadOnly icon={<CheckCircle2 className="size-4"/>} label={ar?"حالة الحساب":"Account Status"} value={ar?"نشط":"Active"} accent/><ReadOnly icon={<CalendarDays className="size-4"/>} label={ar?"عضو منذ":"Member Since"} value={user?.created_at?formatDate(user.created_at,lang):"—"} last/></div></div></section>

      <section className="qs-card overflow-hidden"><div className="qs-panel-header"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-full bg-orange-50 text-[#ff5a0a] dark:bg-orange-950/30"><Bell className="size-5"/></span><div><h2 className="font-display text-lg font-bold">{ar?"التنبيهات والإشعارات":"Alerts & Notifications"}</h2><p className="mt-1 text-xs text-muted-foreground">{ar?"تحكم بكيفية وصول التنبيهات. يتم الحفظ تلقائياً.":"Control how you stay informed. Changes are saved automatically."}</p></div></div></div><div className="p-4 sm:p-5"><p className="mb-2 text-[10px] font-bold uppercase tracking-[.18em] text-muted-foreground">{ar?"الإشعارات":"Notifications"}</p><div className="divide-y divide-border">{rows.map(([key,en,arabic,hintEn,hintAr],index)=><div key={key} className={cn("flex min-h-[70px] items-center gap-4 py-3",index===4&&"mt-4 border-t-2 border-border pt-5")}><span className={cn("grid size-10 shrink-0 place-items-center rounded-full",index%4===0?"bg-orange-50 text-[#ff5a0a]":index%4===1?"bg-emerald-50 text-emerald-600":index%4===2?"bg-blue-50 text-blue-600":"bg-violet-50 text-violet-600")}><Bell className="size-4"/></span><span className="min-w-0 flex-1"><strong className="block text-sm">{ar?arabic:en}</strong><span className="mt-1 block text-xs text-muted-foreground">{ar?hintAr:hintEn}</span></span><Switch checked={notif[key]} onCheckedChange={value=>toggle(key,value)} aria-label={ar?arabic:en}/></div>)}</div></div></section>
    </div>
    {rid ? <RestaurantProfileSettings restaurantId={rid} /> : null}
  </main></div>;
}
function ReadOnly({icon,label,value,last,accent}:{icon:React.ReactNode;label:string;value:string;last?:boolean;accent?:boolean}){return <div className={cn("grid grid-cols-[34px_minmax(105px,.65fr)_minmax(0,1.35fr)] items-center gap-2 px-4 py-3.5",!last&&"border-b border-border")}><span className="grid size-8 place-items-center rounded-lg bg-muted/60 text-muted-foreground">{icon}</span><span className="text-xs font-semibold text-muted-foreground">{label}</span><span className={cn("truncate text-end text-sm font-semibold",accent&&"text-emerald-600")}>{value}</span></div>}
