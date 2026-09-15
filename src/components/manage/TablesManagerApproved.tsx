import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, ImagePlus, Layers3, Minus, Plus, Printer, QrCode, RotateCw, Save, Square, Table2, Trash2, X, ZoomIn, ZoomOut } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { humanError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { downloadDataUrl, printQrCards, qrDataUrl, tableMenuUrl } from "@/lib/qr";
import { removeRestaurantImage, uploadRestaurantImage } from "@/lib/storage";
import { cn } from "@/lib/utils";

type FloorTable = {
  id: string;
  restaurant_id: string;
  table_number: string;
  table_name: string | null;
  qr_token: string;
  qr_code_url: string | null;
  is_active: boolean;
  zone?: string | null;
  capacity?: number | null;
  shape?: string | null;
  layout?: Record<string, unknown> | null;
};
type Layout = { x:number; y:number; rotation:number; scale:number };
type Shape = "round" | "square" | "rectangle";
type Zone = { id:string; en:string; ar:string };
type DragState = { id:string; pointerId:number; startX:number; startY:number; start:Layout; latest:Layout; mode:"move"|"resize" };

const W = 1000;
const H = 700;
const BASE_ZONES: Zone[] = [
  { id:"main", en:"Main Dining", ar:"الصالة الرئيسية" },
  { id:"patio", en:"Patio", ar:"التراس" },
  { id:"bar", en:"Bar", ar:"البار" },
];
const SLOTS = [
  [170,190],[360,190],[520,190],[170,365],[360,365],[520,365],
  [720,190],[865,190],[720,390],[865,390],[360,575],[535,575],[710,575],[850,575],
];
const clamp=(v:number,min:number,max:number)=>Math.min(max,Math.max(min,v));
function asNumber(value:unknown,fallback:number){const n=Number(value);return Number.isFinite(n)?n:fallback;}
function shapeOf(value:unknown):Shape{return value==="round"||value==="circle"?"round":value==="square"?"square":"rectangle";}
function layoutOf(row:FloorTable,index:number):Layout{const raw=row.layout&&typeof row.layout==="object"?row.layout:{};const slot=SLOTS[index%SLOTS.length]!;return {x:clamp(asNumber(raw.x,slot[0]),55,945),y:clamp(asNumber(raw.y,slot[1]),55,645),rotation:clamp(asNumber(raw.rotation,0),-180,180),scale:clamp(asNumber(raw.scale,1),.68,1.55)};}
function objectValue(value:unknown):Record<string,unknown>{return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};}
function floorPlanFromTheme(value:unknown):string|null{const theme=objectValue(value);const workspace=objectValue(theme.workspace);return typeof workspace.floorPlanBackgroundUrl==="string"&&workspace.floorPlanBackgroundUrl?workspace.floorPlanBackgroundUrl:null;}

export function TablesManagerApproved({ restaurantId }: { restaurantId:string }) {
  const { lang, t } = useI18n();
  const ar=lang==="ar";
  const qc=useQueryClient();
  const restaurantQuery=useRestaurant(restaurantId);
  const restaurant=restaurantQuery.data;
  const floorRef=useRef<HTMLDivElement|null>(null);
  const floorInputRef=useRef<HTMLInputElement|null>(null);
  const dragRef=useRef<DragState|null>(null);

  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [createOpen,setCreateOpen]=useState(false);
  const [zoneOpen,setZoneOpen]=useState(false);
  const [zoneName,setZoneName]=useState("");
  const [customZones,setCustomZones]=useState<Zone[]>([]);
  const [zoom,setZoom]=useState(1);
  const [mobileMode,setMobileMode]=useState<"floor"|"list">("floor");
  const [draft,setDraft]=useState<Record<string,Layout>>({});
  const [busy,setBusy]=useState(false);
  const [floorBusy,setFloorBusy]=useState(false);
  const [floorPlanUrl,setFloorPlanUrl]=useState<string|null>(null);
  const [qr,setQr]=useState<string|null>(null);
  const [form,setForm]=useState({number:"",name:"",capacity:"4",zone:"main",shape:"square" as Shape,active:true,rotation:"0"});

  const tables=useQuery<FloorTable[]>({queryKey:["platform","tables",restaurantId],queryFn:async()=>{const {data,error}=await supabase.from("restaurant_tables").select("*").eq("restaurant_id",restaurantId).order("table_number",{ascending:true});if(error)throw error;return (data??[]) as unknown as FloorTable[];}});

  useEffect(()=>{setDraft(prev=>{const next:Record<string,Layout>={};(tables.data??[]).forEach((row,i)=>next[row.id]=prev[row.id]??layoutOf(row,i));return next;});},[tables.data]);
  useEffect(()=>{try{const raw=localStorage.getItem(`qs-table-zones:${restaurantId}`);setCustomZones(raw?JSON.parse(raw):[]);}catch{setCustomZones([]);}},[restaurantId]);
  useEffect(()=>{setFloorPlanUrl(floorPlanFromTheme(restaurant?.menu_theme));},[restaurant?.menu_theme]);

  const zones=useMemo(()=>{const map=new Map(BASE_ZONES.map(z=>[z.id,z]));customZones.forEach(z=>map.set(z.id,z));(tables.data??[]).forEach(row=>{const id=row.zone||"main";if(!map.has(id))map.set(id,{id,en:id,ar:id});});return [...map.values()];},[customZones,tables.data]);
  const selected=(tables.data??[]).find(row=>row.id===selectedId)??null;

  useEffect(()=>{if(!selected)return;setForm({number:selected.table_number,name:selected.table_name??"",capacity:String(selected.capacity??4),zone:selected.zone||"main",shape:shapeOf(selected.shape),active:selected.is_active,rotation:String(Math.round((draft[selected.id]??layoutOf(selected,0)).rotation))});},[selectedId]);
  useEffect(()=>{if(!selected||!restaurant)return;let cancelled=false;setQr(null);void qrDataUrl(tableMenuUrl(restaurant.slug,selected.qr_token)).then(value=>{if(!cancelled)setQr(value)});return()=>{cancelled=true};},[selected?.id,selected?.qr_token,restaurant?.slug]);

  async function refresh(){await qc.invalidateQueries({queryKey:["platform","tables",restaurantId]});}
  async function persistLayout(id:string,layout:Layout){const row=(tables.data??[]).find(x=>x.id===id);if(!row)return;const {error}=await (supabase.from("restaurant_tables") as any).update({layout:{...(row.layout??{}),...layout}}).eq("id",id).eq("restaurant_id",restaurantId);if(error)toast.error(humanError(error,lang));}
  function openCreate(){const next=(tables.data??[]).length+1;setForm({number:String(next),name:"",capacity:"4",zone:"main",shape:"square",active:true,rotation:"0"});setCreateOpen(true);}

  async function createTable(){setBusy(true);try{const index=(tables.data??[]).length;const slot=SLOTS[index%SLOTS.length]!;const {data,error}=await (supabase.from("restaurant_tables") as any).insert({restaurant_id:restaurantId,table_number:form.number.trim()||String(index+1),table_name:form.name.trim()||null,qr_token:crypto.randomUUID().replace(/-/g,""),zone:form.zone,capacity:clamp(Number(form.capacity)||4,1,30),shape:form.shape,is_active:form.active,layout:{x:slot[0],y:slot[1],rotation:0,scale:1}}).select("*").single();if(error)throw error;await refresh();setCreateOpen(false);if(data?.id)setSelectedId(data.id);toast.success(ar?"تمت إضافة الطاولة":"Table added");}catch(error){toast.error(humanError(error,lang));}finally{setBusy(false);}}
  async function saveSelected(){if(!selected)return;setBusy(true);try{const current=draft[selected.id]??layoutOf(selected,0);const rotation=clamp(Number(form.rotation)||0,-180,180);const next={...current,rotation};const {error}=await (supabase.from("restaurant_tables") as any).update({table_number:form.number.trim()||selected.table_number,table_name:form.name.trim()||null,capacity:clamp(Number(form.capacity)||4,1,30),zone:form.zone,shape:form.shape,is_active:form.active,layout:{...(selected.layout??{}),...next}}).eq("id",selected.id).eq("restaurant_id",restaurantId);if(error)throw error;setDraft(v=>({...v,[selected.id]:next}));await refresh();toast.success(ar?"تم حفظ التغييرات":"Table changes saved");}catch(error){toast.error(humanError(error,lang));}finally{setBusy(false);}}
  async function deleteSelected(){if(!selected)return;if(!confirm(ar?"حذف هذه الطاولة؟":"Delete this table?"))return;setBusy(true);try{const {error}=await supabase.from("restaurant_tables").delete().eq("id",selected.id).eq("restaurant_id",restaurantId);if(error)throw error;setSelectedId(null);await refresh();toast.success(ar?"تم حذف الطاولة":"Table deleted");}catch(error){toast.error(humanError(error,lang));}finally{setBusy(false);}}
  function addZone(){const clean=zoneName.trim();if(!clean)return;const id=clean.toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g,"-").replace(/^-|-$/g,"")||`zone-${Date.now()}`;const next=[...customZones.filter(z=>z.id!==id),{id,en:clean,ar:clean}];setCustomZones(next);localStorage.setItem(`qs-table-zones:${restaurantId}`,JSON.stringify(next));setZoneName("");setZoneOpen(false);}

  async function persistFloorPlan(nextUrl:string|null){
    const current=await supabase.from("restaurants").select("menu_theme").eq("id",restaurantId).single();
    if(current.error)throw current.error;
    const theme=objectValue(current.data.menu_theme);
    const workspace=objectValue(theme.workspace);
    const {error}=await supabase.from("restaurants").update({menu_theme:{...theme,workspace:{...workspace,floorPlanBackgroundUrl:nextUrl}}}).eq("id",restaurantId);
    if(error)throw error;
    setFloorPlanUrl(nextUrl);
    await qc.invalidateQueries({queryKey:["platform"]});
  }

  async function uploadFloorPlan(file:File|undefined){
    if(!file)return;
    if(!file.type.startsWith("image/")){toast.error(ar?"اختر صورة للمخطط.":"Choose an image file for the floor plan.");return;}
    setFloorBusy(true);
    const previous=floorPlanUrl;
    try{
      const url=await uploadRestaurantImage(restaurantId,"floorplan",file);
      await persistFloorPlan(url);
      if(previous&&previous!==url)void removeRestaurantImage(previous).catch(()=>undefined);
      toast.success(ar?"تم تحديث خلفية المخطط":"Floor plan background updated");
    }catch(error){toast.error(humanError(error,lang));}
    finally{setFloorBusy(false);if(floorInputRef.current)floorInputRef.current.value="";}
  }

  async function clearFloorPlan(){
    if(!floorPlanUrl)return;
    setFloorBusy(true);
    const previous=floorPlanUrl;
    try{await persistFloorPlan(null);void removeRestaurantImage(previous).catch(()=>undefined);toast.success(ar?"تمت إزالة خلفية المخطط":"Floor plan background removed");}
    catch(error){toast.error(humanError(error,lang));}
    finally{setFloorBusy(false);}
  }

  function beginDrag(event:ReactPointerEvent<HTMLElement>,row:FloorTable,mode:"move"|"resize"){const rect=floorRef.current?.getBoundingClientRect();if(!rect)return;event.preventDefault();event.stopPropagation();event.currentTarget.setPointerCapture(event.pointerId);const current=draft[row.id]??layoutOf(row,0);dragRef.current={id:row.id,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,start:current,latest:current,mode};setSelectedId(row.id);}
  function drag(event:ReactPointerEvent<HTMLElement>){const state=dragRef.current;const rect=floorRef.current?.getBoundingClientRect();if(!state||!rect||state.pointerId!==event.pointerId)return;event.preventDefault();const dx=(event.clientX-state.startX)/rect.width*W;const dy=(event.clientY-state.startY)/rect.height*H;let next=state.start;if(state.mode==="move")next={...state.start,x:clamp(state.start.x+dx,55,945),y:clamp(state.start.y+dy,55,645)};else next={...state.start,scale:clamp(state.start.scale+(dx+dy)/420,.68,1.55)};state.latest=next;setDraft(v=>({...v,[state.id]:next}));}
  function endDrag(event:ReactPointerEvent<HTMLElement>){const state=dragRef.current;if(!state||state.pointerId!==event.pointerId)return;dragRef.current=null;try{event.currentTarget.releasePointerCapture(event.pointerId);}catch{}void persistLayout(state.id,state.latest);}
  function rotateSelected(delta:number){if(!selected)return;const current=draft[selected.id]??layoutOf(selected,0);const next={...current,rotation:clamp(current.rotation+delta,-180,180)};setDraft(v=>({...v,[selected.id]:next}));setForm(v=>({...v,rotation:String(Math.round(next.rotation))}));void persistLayout(selected.id,next);}
  async function printSingle(){if(!selected||!restaurant)return;await printQrCards(restaurant.name,t("sa.tables.scan"),[{table_number:selected.table_number,table_name:selected.table_name,url:tableMenuUrl(restaurant.slug,selected.qr_token)}],{back:ar?"← رجوع":"← Back",print:ar?"طباعة":"Print"});}

  if(tables.isPending)return <Skeleton className="h-[720px] rounded-2xl" />;

  return <div className="space-y-5">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="qs-page-title">{ar?"الطاولات و QR":"Tables & QR"}</h1><p className="qs-page-subtitle">{ar?"صمم مخطط الصالة، أدر الطاولات، وأنشئ رموز QR.":"Design your floor plan, manage tables, and generate QR codes."}</p></div><LinkOrders restaurantId={restaurantId} ar={ar} /></header>

    <section className="qs-card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          <button type="button" className="qs-button-primary" onClick={openCreate}><Plus className="size-4" />{ar?"إضافة طاولة":"Add Table"}</button>
          <button type="button" className="qs-button-secondary" onClick={()=>setZoneOpen(true)}><Plus className="size-4" />{ar?"إضافة منطقة":"Add Zone"}</button>
          <input ref={floorInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={event=>void uploadFloorPlan(event.target.files?.[0])}/>
          <button type="button" disabled={floorBusy} className="qs-button-secondary whitespace-nowrap" onClick={()=>floorInputRef.current?.click()}><ImagePlus className="size-4" />{floorBusy?(ar?"جارٍ الرفع…":"Uploading…"):(floorPlanUrl?(ar?"تغيير المخطط":"Replace floor plan"):(ar?"رفع مخطط":"Upload floor plan"))}</button>
          {floorPlanUrl?<button type="button" disabled={floorBusy} className="qs-button-secondary whitespace-nowrap text-destructive" onClick={()=>void clearFloorPlan()}><Trash2 className="size-4" />{ar?"إزالة الخلفية":"Remove background"}</button>:null}
        </div>
        <div className="flex items-center gap-2"><div className="hidden rounded-xl border border-border bg-card p-1 sm:flex"><button type="button" className="grid size-9 place-items-center rounded-lg hover:bg-muted" onClick={()=>setZoom(v=>clamp(v-.1,.7,1.35))}><ZoomOut className="size-4" /></button><span className="grid min-w-14 place-items-center text-xs font-bold">{Math.round(zoom*100)}%</span><button type="button" className="grid size-9 place-items-center rounded-lg hover:bg-muted" onClick={()=>setZoom(v=>clamp(v+.1,.7,1.35))}><ZoomIn className="size-4" /></button></div><button type="button" className="qs-button-secondary whitespace-nowrap"><Layers3 className="size-4" />{ar?"المخطط":"Layout"}</button></div>
      </div>

      <div className="grid min-w-0 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 border-b border-border xl:border-b-0 xl:border-e">
          <div className="flex border-b border-border md:hidden"><button type="button" className={cn("flex-1 py-3 text-xs font-bold",mobileMode==='floor'&&"border-b-2 border-[#ff5a0a] text-[#ff5a0a]")} onClick={()=>setMobileMode('floor')}>{ar?"المخطط":"Floor Plan"}</button><button type="button" className={cn("flex-1 py-3 text-xs font-bold",mobileMode==='list'&&"border-b-2 border-[#ff5a0a] text-[#ff5a0a]")} onClick={()=>setMobileMode('list')}>{ar?"القائمة":"List"}</button></div>
          {mobileMode==='list' ? <div className="space-y-2 p-3 md:hidden">{(tables.data??[]).map(row=><button key={row.id} type="button" onClick={()=>{setSelectedId(row.id);setMobileMode('floor')}} className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-start"><span className="grid size-10 place-items-center rounded-xl bg-orange-50 font-bold text-[#ff5a0a] dark:bg-orange-950/30">T{row.table_number}</span><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{row.table_name||`${ar?'طاولة':'Table'} ${row.table_number}`}</strong><span className="text-xs text-muted-foreground">{row.capacity??4} {ar?'مقاعد':'seats'} · {zones.find(z=>z.id===(row.zone||'main'))?.[ar?'ar':'en']??row.zone}</span></span><i className={cn("size-2 rounded-full",row.is_active?'bg-emerald-500':'bg-slate-400')} /></button>)}</div> : <div className="overflow-auto bg-[#f5f3ef] p-3 dark:bg-[#151a1d]">
            <div
              ref={floorRef}
              className="relative mx-auto min-w-[690px] overflow-hidden rounded-xl border border-[#d7d2ca] bg-[#eee8de] shadow-inner dark:border-slate-700 dark:bg-slate-900"
              style={{
                width:`${zoom*100}%`,
                aspectRatio:`${W}/${H}`,
                ...(floorPlanUrl?{backgroundImage:`linear-gradient(rgba(255,255,255,.08),rgba(255,255,255,.08)),url("${floorPlanUrl}")`,backgroundSize:"100% 100%, contain",backgroundPosition:"center",backgroundRepeat:"no-repeat"}:{}),
              }}
            >
              {floorPlanUrl?null:<FloorArchitecture ar={ar} />}
              {(tables.data??[]).map((row,index)=>{const layout=draft[row.id]??layoutOf(row,index);return <TablePiece key={row.id} row={row} layout={layout} selected={selectedId===row.id} onDown={(e)=>beginDrag(e,row,'move')} onMove={drag} onUp={endDrag} onResizeDown={(e)=>beginDrag(e,row,'resize')} />})}
              {floorPlanUrl?<div className="pointer-events-none absolute start-3 top-3 z-[3] flex max-w-[70%] flex-wrap gap-1.5">{zones.map(z=><span key={z.id} className="rounded-full border border-black/10 bg-white/90 px-2.5 py-1 text-[10px] font-bold text-slate-700 shadow-sm">{ar?z.ar:z.en}</span>)}</div>:null}
            </div>
          </div>}
          <div className="flex flex-wrap items-center gap-4 border-t border-border px-4 py-3 text-[10px] text-muted-foreground"><Legend tone="bg-emerald-500" label={ar?"متاح":"Available"}/><Legend tone="bg-[#ff5a0a]" label={ar?"نشط / مشغول":"Active / Occupied"}/><Legend tone="bg-rose-500" label={ar?"محجوز":"Reserved"}/><Legend tone="bg-slate-400" label={ar?"غير نشط":"Inactive"}/><span className="ms-auto">{tables.data?.length??0} {ar?"طاولة":"Tables"}</span></div>
        </div>

        <aside className="bg-card">
          {selected ? <>
            <div className="qs-panel-header"><div><h2 className="font-display text-lg font-bold">{ar?"طاولة":"Table"} T{selected.table_number}</h2><p className="mt-1 text-xs text-muted-foreground">{form.active?(ar?"نشطة":"Active"):(ar?"غير نشطة":"Inactive")}</p></div><button type="button" className="grid size-9 place-items-center rounded-lg hover:bg-muted" onClick={()=>setSelectedId(null)}><X className="size-4" /></button></div>
            <div className="space-y-4 p-4">
              <Field label={ar?"اسم الطاولة":"Table Name"}><Input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder={`T${selected.table_number}`} /></Field>
              <Field label={ar?"المقاعد":"Seats"}><div className="grid grid-cols-[44px_1fr_44px] overflow-hidden rounded-xl border border-border"><button type="button" onClick={()=>setForm(v=>({...v,capacity:String(clamp((Number(v.capacity)||1)-1,1,30))}))} className="grid min-h-11 place-items-center hover:bg-muted"><Minus className="size-4" /></button><span className="grid place-items-center border-x border-border font-bold">{form.capacity}</span><button type="button" onClick={()=>setForm(v=>({...v,capacity:String(clamp((Number(v.capacity)||1)+1,1,30))}))} className="grid min-h-11 place-items-center hover:bg-muted"><Plus className="size-4" /></button></div></Field>
              <Field label={ar?"المنطقة":"Zone"}><Select value={form.zone} onValueChange={value=>setForm({...form,zone:value})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{zones.map(z=><SelectItem key={z.id} value={z.id}>{ar?z.ar:z.en}</SelectItem>)}</SelectContent></Select></Field>
              <Field label={ar?"الشكل":"Shape"}><Select value={form.shape} onValueChange={value=>setForm({...form,shape:value as Shape})}><SelectTrigger><Square className="me-2 size-4"/><SelectValue /></SelectTrigger><SelectContent><SelectItem value="square">{ar?"مربع":"Square"}</SelectItem><SelectItem value="round">{ar?"دائري":"Round"}</SelectItem><SelectItem value="rectangle">{ar?"مستطيل":"Rectangle"}</SelectItem></SelectContent></Select></Field>
              <Field label={ar?"الدوران":"Rotation"}><div className="flex gap-2"><Input type="number" value={form.rotation} onChange={e=>setForm({...form,rotation:e.target.value})}/><button type="button" className="qs-button-secondary px-3" onClick={()=>rotateSelected(15)}><RotateCw className="size-4" /></button></div></Field>
              <label className="flex items-center justify-between rounded-xl border border-border p-3"><span className="text-sm font-semibold">{ar?"الطاولة نشطة":"Table active"}</span><Switch checked={form.active} onCheckedChange={value=>setForm({...form,active:value})}/></label>
              <div className="border-t border-border pt-4">
                <h3 className="text-sm font-bold">{ar?"رمز QR":"QR Code"}</h3>
                {qr?<div className="mt-3 grid grid-cols-[80px_minmax(0,1fr)] items-center gap-3"><img src={qr} alt="QR" className="size-20 rounded-lg border bg-white p-1"/><div className="min-w-0"><p className="truncate text-xs font-bold">{ar?"طاولة":"Table"} T{selected.table_number}</p><p className="text-[10px] text-muted-foreground">{ar?"امسح للطلب":"Scan to order"}</p><div className="mt-2 grid grid-cols-2 gap-2"><button type="button" className="qs-button-secondary inline-flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap break-normal px-2 py-1 text-[10px]" onClick={()=>downloadDataUrl(qr,`table-${selected.table_number}-qr.png`)}><Download className="size-3 shrink-0"/><span className="whitespace-nowrap">{ar?"تنزيل":"Download"}</span></button><button type="button" className="qs-button-secondary inline-flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap break-normal px-2 py-1 text-[10px]" onClick={()=>void printSingle()}><Printer className="size-3 shrink-0"/><span className="whitespace-nowrap">{ar?"طباعة":"Print"}</span></button></div></div></div>:<Skeleton className="mt-3 h-20 rounded-xl"/>}
              </div>
            </div>
            <div className="safe-bottom sticky bottom-0 grid grid-cols-2 gap-2 border-t border-border bg-card/96 p-4 backdrop-blur"><button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-200 text-sm font-semibold text-red-600 hover:bg-red-50" onClick={()=>void deleteSelected()}><Trash2 className="size-4"/>{ar?"حذف":"Delete Table"}</button><button type="button" className="qs-button-primary" disabled={busy} onClick={()=>void saveSelected()}><Save className="size-4"/>{busy?(ar?"حفظ…":"Saving…"):(ar?"حفظ":"Save Changes")}</button></div>
          </> : <div className="grid min-h-[520px] place-items-center p-6 text-center"><div><Table2 className="mx-auto size-9 text-muted-foreground"/><p className="mt-3 text-sm font-bold">{ar?"اختر طاولة من المخطط":"Select a table on the floor plan"}</p><p className="mt-1 text-xs text-muted-foreground">{ar?"اسحب الطاولات لتغيير مكانها.":"Drag tables to reposition them."}</p></div></div>}
        </aside>
      </div>
    </section>

    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent><DialogHeader><DialogTitle>{ar?"إضافة طاولة":"Add Table"}</DialogTitle><DialogDescription>{ar?"أضف طاولة جديدة إلى مخطّط المطعم.":"Add a new table to the restaurant floor plan."}</DialogDescription></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><Field label={ar?"رقم الطاولة":"Table Number"}><Input value={form.number} onChange={e=>setForm({...form,number:e.target.value})}/></Field><Field label={ar?"الاسم":"Name"}><Input value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></Field><Field label={ar?"المقاعد":"Seats"}><Input type="number" min="1" max="30" value={form.capacity} onChange={e=>setForm({...form,capacity:e.target.value})}/></Field><Field label={ar?"المنطقة":"Zone"}><Select value={form.zone} onValueChange={value=>setForm({...form,zone:value})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{zones.map(z=><SelectItem key={z.id} value={z.id}>{ar?z.ar:z.en}</SelectItem>)}</SelectContent></Select></Field></div><DialogFooter><Button variant="ghost" onClick={()=>setCreateOpen(false)}>{t("common.cancel")}</Button><Button disabled={busy||!form.number.trim()} onClick={()=>void createTable()}>{ar?"إضافة":"Add Table"}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={zoneOpen} onOpenChange={setZoneOpen}><DialogContent><DialogHeader><DialogTitle>{ar?"إضافة منطقة":"Add Zone"}</DialogTitle><DialogDescription>{ar?"أضف منطقة مثل VIP أو الحديقة أو الطابق العلوي.":"Add a zone such as VIP, Garden, or Upper Floor."}</DialogDescription></DialogHeader><Field label={ar?"اسم المنطقة":"Zone name"}><Input value={zoneName} onChange={e=>setZoneName(e.target.value)}/></Field><DialogFooter><Button variant="ghost" onClick={()=>setZoneOpen(false)}>{t("common.cancel")}</Button><Button disabled={!zoneName.trim()} onClick={addZone}>{ar?"إضافة":"Add Zone"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

function FloorArchitecture({ar}:{ar:boolean}){return <><div className="absolute inset-[3%] rounded-lg border-[10px] border-[#756e64] bg-[#d8d2c6] shadow-[inset_0_0_0_2px_rgba(255,255,255,.55)] dark:border-slate-700 dark:bg-slate-800"/><div className="absolute left-[5%] top-[6%] h-[53%] w-[57%] border border-[#c8b8a4] bg-[repeating-linear-gradient(45deg,#e4c9a9_0_8px,#ead3b7_8px_16px)] shadow-inner"><ZoneLabel className="left-[8%] top-[7%]" icon="🍴" label={ar?"الصالة الرئيسية":"Main Dining"}/></div><div className="absolute right-[5%] top-[6%] h-[53%] w-[31%] border border-[#bbb4aa] bg-[radial-gradient(circle_at_20%_25%,rgba(74,132,70,.25)_0_3%,transparent_4%),repeating-linear-gradient(0deg,#c8c2b9_0_18px,#d3cec6_18px_36px)] shadow-inner"><ZoneLabel className="left-[7%] top-[8%]" icon="🌿" label={ar?"التراس":"Patio"}/><div className="absolute right-[8%] top-[7%] size-24 rounded-full bg-[#f2efe9] shadow-[0_10px_18px_rgba(0,0,0,.15)]"/></div><div className="absolute bottom-[5%] left-[22%] h-[31%] w-[73%] border border-[#b8aa98] bg-[repeating-linear-gradient(90deg,#d7b991_0_12px,#ddc29f_12px_24px)] shadow-inner"><ZoneLabel className="left-[6%] top-[8%]" icon="🍸" label={ar?"البار":"Bar"}/><div className="absolute left-[27%] right-[7%] top-[12%] h-10 rounded-md bg-[#9f7047] shadow-md"/></div><div className="absolute bottom-[1%] left-[8%] text-center text-[10px] font-bold text-slate-700 dark:text-slate-300">↑<br/>{ar?"المدخل":"Entrance"}</div><Plant className="left-[4%] top-[3%]"/><Plant className="right-[3%] top-[5%]"/><Plant className="right-[3%] bottom-[5%]"/></>}
function ZoneLabel({className,icon,label}:{className:string;icon:string;label:string}){return <div className={`absolute z-[2] flex items-center gap-2 rounded-xl bg-white/90 px-3 py-2 text-xs font-bold text-slate-800 shadow ${className}`}><span>{icon}</span>{label}</div>}
function Plant({className}:{className:string}){return <span className={`absolute z-[2] grid size-10 place-items-center rounded-full bg-emerald-700 text-lg shadow-md ${className}`}>✦</span>}

function TablePiece({row,layout,selected,onDown,onMove,onUp,onResizeDown}:{row:FloorTable;layout:Layout;selected:boolean;onDown:(e:ReactPointerEvent<HTMLElement>)=>void;onMove:(e:ReactPointerEvent<HTMLElement>)=>void;onUp:(e:ReactPointerEvent<HTMLElement>)=>void;onResizeDown:(e:ReactPointerEvent<HTMLElement>)=>void}){
  const shape=shapeOf(row.shape);const seats=clamp(row.capacity??4,2,8);
  return <div role="button" tabIndex={0} aria-label={`Table ${row.table_number}`} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} className="absolute z-10 touch-none select-none" style={{left:`${layout.x/10}%`,top:`${layout.y/7}%`,width:shape==='rectangle'?'110px':'84px',height:'84px',transform:`translate(-50%,-50%) rotate(${layout.rotation}deg) scale(${layout.scale})`}}><span className={cn("absolute inset-[10px] grid place-items-center border-2 bg-[#b87843] font-display text-sm font-bold text-white shadow-[0_8px_14px_rgba(77,47,23,.22)]",shape==='round'?"rounded-full":shape==='square'?"rounded-xl":"rounded-[14px]",selected?"border-[#2486ff] ring-2 ring-[#2486ff]/35":"border-[#8b5a35]")}>T{row.table_number}</span>{Array.from({length:Math.min(seats,6)},(_,i)=>{const a=(360/Math.min(seats,6))*i-90;const x=50+Math.cos(a*Math.PI/180)*49;const y=50+Math.sin(a*Math.PI/180)*49;return <i key={i} className="absolute h-4 w-6 rounded-[5px] border border-[#7a5a3d] bg-[#9b795c] shadow-sm" style={{left:`${x}%`,top:`${y}%`,transform:`translate(-50%,-50%) rotate(${a+90}deg)`}}/>})}{selected?<><span className="pointer-events-none absolute -inset-1 rounded-xl border border-[#2486ff]"/><button type="button" aria-label="Resize table" onPointerDown={onResizeDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} className="absolute -bottom-2 -right-2 z-30 size-4 rounded-full border-2 border-white bg-[#2486ff] shadow"/></>:null}</div>
}
function Legend({tone,label}:{tone:string;label:string}){return <span className="flex items-center gap-2"><i className={`size-2.5 rounded-full ${tone}`}/>{label}</span>}
function Field({label,children}:{label:string;children:React.ReactNode}){return <div className="min-w-0 space-y-1.5"><Label className="text-xs font-bold">{label}</Label>{children}</div>}
function LinkOrders({restaurantId,ar}:{restaurantId:string;ar:boolean}){return <a href={`/manage/${restaurantId}/orders`} className="qs-button-secondary whitespace-nowrap"><Table2 className="size-4"/>{ar?"عرض الطلبات":"View Orders"}</a>}