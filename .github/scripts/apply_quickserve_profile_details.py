from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[2]

def read(p): return (ROOT/p).read_text(encoding='utf-8')
def write(p,s):
    f=ROOT/p; f.parent.mkdir(parents=True,exist_ok=True); f.write_text(s.rstrip()+"\n",encoding='utf-8')
def once(s,old,new,label):
    c=s.count(old)
    if c!=1: raise RuntimeError(f'{label}: expected 1 match, got {c}')
    return s.replace(old,new,1)

# 1) Extend restaurant appearance with cover focal/zoom controls.
p='src/lib/restaurant-appearance.ts'
s=read(p)
s=once(s,'  selectedNavColor: string;\n','  selectedNavColor: string;\n  coverPositionX: number;\n  coverPositionY: number;\n  coverZoom: number;\n','appearance type')
s=once(s,'function color(value: unknown, fallback: string) {\n','function numberInRange(value: unknown, fallback: number, min: number, max: number) {\n  const numeric = Number(value);\n  return Number.isFinite(numeric) ? Math.min(max, Math.max(min, numeric)) : fallback;\n}\n\nfunction color(value: unknown, fallback: string) {\n','appearance helper')
s=once(s,'    selectedNavColor: color(value.selectedNavColor, "#ff5a0a"),\n','    selectedNavColor: color(value.selectedNavColor, "#ff5a0a"),\n    coverPositionX: numberInRange(value.coverPositionX, 50, 0, 100),\n    coverPositionY: numberInRange(value.coverPositionY, 50, 0, 100),\n    coverZoom: numberInRange(value.coverZoom, 100, 100, 220),\n','appearance defaults')
write(p,s)

# 2) New profile-scoped restaurant settings component.
profile_settings=r'''import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Crop, Image as ImageIcon, Move, Save, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";

import { ApplicationColorStudio } from "@/components/manage/ApplicationColorStudio";
import { ImageUploader } from "@/components/media/ImageUploader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useAccess } from "@/hooks/useSession";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { supabase } from "@/integrations/supabase/client";
import { humanError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { readAppearance } from "@/lib/restaurant-appearance";

export function RestaurantProfileSettings({ restaurantId }: { restaurantId: string }) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const access = useAccess();
  const restaurant = useRestaurant(restaurantId);
  const qc = useQueryClient();
  const canEdit = access.isSuperAdmin || access.membershipFor(restaurantId)?.role === "restaurant_admin";

  if (restaurant.isPending || access.isPending) return <Skeleton className="h-[520px] rounded-2xl" />;
  if (!canEdit || !restaurant.data) return null;

  const item = restaurant.data;
  return <RestaurantProfileSettingsForm key={`${restaurantId}:${item.updated_at}`} restaurant={item} ar={ar} lang={lang} qc={qc} />;
}

function RestaurantProfileSettingsForm({ restaurant, ar, lang, qc }: { restaurant: any; ar: boolean; lang: "ar" | "en"; qc: ReturnType<typeof useQueryClient> }) {
  const [brand, setBrand] = useState(() => readAppearance(restaurant.menu_theme));
  const [form, setForm] = useState({
    logo_url: restaurant.logo_url as string | null,
    cover_image_url: restaurant.cover_image_url as string | null,
    primary_color: restaurant.primary_color as string,
    accent_color: restaurant.accent_color as string,
  });
  const [saving, setSaving] = useState(false);
  const field = <K extends keyof typeof form>(key: K, value: typeof form[K]) => setForm((current) => ({ ...current, [key]: value }));

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const current = await supabase.from("restaurants").select("menu_theme").eq("id", restaurant.id).single();
      if (current.error) throw current.error;
      const theme = current.data.menu_theme && typeof current.data.menu_theme === "object" && !Array.isArray(current.data.menu_theme) ? current.data.menu_theme as Record<string, unknown> : {};
      const workspace = theme.workspace && typeof theme.workspace === "object" && !Array.isArray(theme.workspace) ? theme.workspace as Record<string, unknown> : {};
      const menuTheme = { ...theme, workspace: { ...workspace, ...brand } };
      const { error } = await supabase.from("restaurants").update({
        logo_url: form.logo_url,
        cover_image_url: form.cover_image_url,
        primary_color: form.primary_color,
        accent_color: form.accent_color,
        background_color: brand.lightBackground,
        menu_theme: menuTheme,
      }).eq("id", restaurant.id);
      if (error) throw error;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["platform"] }),
        qc.invalidateQueries({ queryKey: ["staff", "memberships"] }),
        qc.invalidateQueries({ queryKey: ["diner"] }),
        qc.invalidateQueries({ queryKey: ["pdf-diner"] }),
      ]);
      toast.success(ar ? "تم حفظ إعدادات المؤسسة والمظهر" : "Organization and appearance settings saved");
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setSaving(false);
    }
  }

  return <form onSubmit={save} className="space-y-5">
    <section className="qs-card overflow-hidden">
      <div className="qs-panel-header flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="font-display text-lg font-bold">{ar ? "إعدادات المؤسسة" : "Organization Settings"}</h2><p className="mt-1 text-xs text-muted-foreground">{ar ? "الشعارات وصورة الغلاف وهوية مساحة العمل الخاصة بهذا المطعم." : "Logos, cover image and workspace identity for this restaurant."}</p></div>
        <span className="inline-flex items-center gap-2 self-start rounded-full bg-emerald-500/10 px-3 py-1.5 text-[10px] font-bold text-emerald-600"><SlidersHorizontal className="size-3.5" />{ar ? "خاص بالمطعم" : "Restaurant scoped"}</span>
      </div>
      <div className="space-y-6 p-4 sm:p-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <ImageUploader restaurantId={restaurant.id} kind="logo" value={form.logo_url} onChange={(value) => field("logo_url", value)} label={ar ? "شعار المؤسسة" : "Organization logo"} />
            <label className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-muted/20 p-4"><span className="min-w-0"><strong className="block text-sm">{ar ? "استخدام شعار QuickServe" : "Use QuickServe logo"}</strong><span className="mt-1 block text-xs leading-5 text-muted-foreground">{ar ? "أوقفه لإظهار شعار المطعم في التطبيق عند توفره." : "Turn this off to use the restaurant logo in the workspace when available."}</span></span><Switch checked={brand.useQuickServeLogo} onCheckedChange={(value) => setBrand((current) => ({ ...current, useQuickServeLogo: value }))} /></label>
          </div>
          <ImageUploader restaurantId={restaurant.id} kind="logo" value={brand.menuLogo} onChange={(value) => setBrand((current) => ({ ...current, menuLogo: value }))} label={ar ? "شعار قائمة الضيف" : "Guest menu logo"} />
        </div>

        <div className="space-y-4 border-t border-border pt-6">
          <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-orange-500/10 text-[#ff5a0a]"><ImageIcon className="size-5" /></span><div><h3 className="text-sm font-bold">{ar ? "صورة الغلاف والرئيسية" : "Cover & home image"}</h3><p className="mt-0.5 text-[11px] text-muted-foreground">{ar ? "ارفع الصورة ثم اختر الجزء الظاهر وحجم التكبير." : "Upload the image, then choose the visible focal area and zoom."}</p></div></div>
          <ImageUploader restaurantId={restaurant.id} kind="cover" aspect="wide" value={form.cover_image_url} onChange={(value) => field("cover_image_url", value)} label={ar ? "صورة الغلاف" : "Cover image"} />
          {form.cover_image_url ? <CoverComposer ar={ar} url={form.cover_image_url} x={brand.coverPositionX} y={brand.coverPositionY} zoom={brand.coverZoom} onChange={(next) => setBrand((current) => ({ ...current, ...next }))} /> : null}
        </div>
      </div>
    </section>

    <section className="qs-card p-4 sm:p-6">
      <ApplicationColorStudio ar={ar} restaurantName={restaurant.name} brand={brand} setBrand={setBrand} primaryColor={form.primary_color} accentColor={form.accent_color} setPrimaryColor={(value) => field("primary_color", value)} setAccentColor={(value) => field("accent_color", value)} />
    </section>

    <div className="flex justify-end"><Button type="submit" disabled={saving} className="min-h-11 bg-[#ff5a0a] px-5 text-white hover:bg-[#e94f00]"><Save className="size-4" />{saving ? (ar ? "جارٍ الحفظ…" : "Saving…") : (ar ? "حفظ إعدادات المؤسسة" : "Save organization settings")}</Button></div>
  </form>;
}

function CoverComposer({ ar, url, x, y, zoom, onChange }: { ar: boolean; url: string; x: number; y: number; zoom: number; onChange: (value: { coverPositionX?: number; coverPositionY?: number; coverZoom?: number }) => void }) {
  const previewStyle = { objectPosition: `${x}% ${y}%`, transform: `scale(${zoom / 100})`, transformOrigin: `${x}% ${y}%` };
  const presets = [{ label: ar ? "أعلى" : "Top", x: 50, y: 18 }, { label: ar ? "وسط" : "Center", x: 50, y: 50 }, { label: ar ? "أسفل" : "Bottom", x: 50, y: 82 }];
  return <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(280px,.7fr)]">
    <div className="relative aspect-[16/6] overflow-hidden rounded-2xl border border-border bg-muted"><img src={url} alt="" className="h-full w-full object-cover transition-transform duration-200" style={previewStyle} /><div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-black/5" /><span className="absolute bottom-3 start-3 rounded-full bg-black/65 px-3 py-1 text-[10px] font-bold text-white backdrop-blur">{ar ? "معاينة الغلاف" : "Live cover preview"}</span></div>
    <div className="space-y-4 rounded-2xl border border-border bg-muted/15 p-4">
      <div className="flex items-center gap-2"><Move className="size-4 text-[#ff5a0a]" /><strong className="text-xs">{ar ? "موضع الصورة" : "Image position"}</strong></div>
      <Slider label={ar ? "أفقي" : "Horizontal"} value={x} min={0} max={100} suffix="%" onChange={(value) => onChange({ coverPositionX: value })} />
      <Slider label={ar ? "عمودي" : "Vertical"} value={y} min={0} max={100} suffix="%" onChange={(value) => onChange({ coverPositionY: value })} />
      <div className="flex items-center gap-2 pt-1"><Crop className="size-4 text-[#ff5a0a]" /><strong className="text-xs">{ar ? "حجم الصورة" : "Image zoom"}</strong></div>
      <Slider label={ar ? "تكبير" : "Zoom"} value={zoom} min={100} max={220} suffix="%" onChange={(value) => onChange({ coverZoom: value })} />
      <div className="grid grid-cols-3 gap-2">{presets.map((preset) => <button key={preset.label} type="button" onClick={() => onChange({ coverPositionX: preset.x, coverPositionY: preset.y })} className="rounded-xl border border-border bg-card px-2 py-2 text-[10px] font-bold transition hover:border-orange-300 hover:text-[#ff5a0a]">{preset.label}</button>)}</div>
      <button type="button" onClick={() => onChange({ coverPositionX: 50, coverPositionY: 50, coverZoom: 100 })} className="w-full rounded-xl border border-border bg-card px-3 py-2 text-[10px] font-bold text-muted-foreground transition hover:text-foreground">{ar ? "إعادة ضبط الغلاف" : "Reset cover framing"}</button>
    </div>
  </div>;
}

function Slider({ label, value, min, max, suffix, onChange }: { label: string; value: number; min: number; max: number; suffix: string; onChange: (value: number) => void }) {
  return <label className="block"><span className="mb-1.5 flex items-center justify-between text-[10px] font-semibold text-muted-foreground"><span>{label}</span><strong className="text-foreground">{Math.round(value)}{suffix}</strong></span><input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} className="h-2 w-full cursor-pointer accent-[#ff5a0a]" /></label>;
}
'''
write('src/components/profile/RestaurantProfileSettings.tsx',profile_settings)

# 3) Profile page: add organization + color settings beneath personal profile for admins.
p='src/routes/_authenticated/profile.tsx'
s=read(p)
s=once(s,'import { ProfileAvatarEditor } from "@/components/profile/ProfileAvatarEditor";\n','import { ProfileAvatarEditor } from "@/components/profile/ProfileAvatarEditor";\nimport { RestaurantProfileSettings } from "@/components/profile/RestaurantProfileSettings";\n','profile import')
needle='    </div>\n  </main></div>;'
repl='    </div>\n    {rid ? <RestaurantProfileSettings restaurantId={rid} /> : null}\n  </main></div>;'
s=once(s,needle,repl,'profile settings placement')
write(p,s)

# 4) Appearance page: remove Organization Settings + Application Colors (now profile), preserve other settings.
p='src/components/manage/RestaurantAppearance.tsx'
s=read(p)
s=s.replace('import { ImageUploader } from "@/components/media/ImageUploader";\n','').replace('import { ApplicationColorStudio } from "@/components/manage/ApplicationColorStudio";\n','').replace('import { Switch } from "@/components/ui/switch";\n','')
start=s.find('        <section className="panel space-y-6 p-4 sm:p-6">')
end=s.find('        <section className="panel space-y-5 p-4 sm:p-6"><h3 className="text-lg font-semibold">',start)
if start<0 or end<0: raise RuntimeError('appearance organization section boundaries not found')
s=s[:start]+s[end:]
write(p,s)

# 5) Dashboard: use typed router Links for metric cards, and apply saved cover framing.
p='src/routes/_authenticated/dashboard.tsx'
s=read(p)
if 'import { readAppearance } from "@/lib/restaurant-appearance";' not in s:
    s=once(s,'import { ROLE_LABELS } from "@/lib/permissions";\n','import { ROLE_LABELS } from "@/lib/permissions";\nimport { readAppearance } from "@/lib/restaurant-appearance";\n','dashboard appearance import')
hero_line='  const hero = restaurant.data?.cover_image_url || "/signin-restaurant.webp";'
s=once(s,hero_line,hero_line+'\n  const appearance = readAppearance(restaurant.data?.menu_theme);','dashboard appearance')
s=s.replace('<img src={hero} alt="" className="qs-hero-media" loading="eager" />','<img src={hero} alt="" className="qs-hero-media transition-transform duration-300" loading="eager" style={{ objectPosition: `${appearance.coverPositionX}% ${appearance.coverPositionY}%`, transform: `scale(${appearance.coverZoom / 100})`, transformOrigin: `${appearance.coverPositionX}% ${appearance.coverPositionY}%` }} />')
s=s.replace('<a href={`/dashboard/${id}`} key={id} className="qs-stat flex min-h-[116px] items-center gap-4 text-start transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/30">','<Link to="/dashboard/$metric" params={{ metric: id }} preload="intent" key={id} className="qs-stat flex min-h-[116px] items-center gap-4 text-start transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/30">')
s=s.replace('</span></div></a>)}</section>;','</span></div></Link>)}</section>;')
write(p,s)

# 6) Analytics top KPI cards: each gets a professional View details link.
p='src/components/manage/AnalyticsManagerPro.tsx'
s=read(p)
old='''    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Kpi label={ar ? "إجمالي الإيرادات" : "Total Revenue"} value={formatMoney(data.revenue, currency, lang)} /><Kpi label={ar ? "إجمالي الطلبات" : "Total Orders"} value={formatNumber(data.orders.length, lang)} /><Kpi label={ar ? "متوسط قيمة الطلب" : "Average Order Value"} value={formatMoney(data.aov, currency, lang)} /><Kpi label={ar ? "الطلبات المدفوعة" : "Paid Orders"} value={`${Math.round(data.paidRate)}%`} /></section>'''
new='''    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Kpi label={ar ? "إجمالي الإيرادات" : "Total Revenue"} value={formatMoney(data.revenue, currency, lang)} href={`/manage/${restaurantId}/analytics/revenue`} viewLabel={ar ? "عرض التفاصيل" : "View details"} /><Kpi label={ar ? "إجمالي الطلبات" : "Total Orders"} value={formatNumber(data.orders.length, lang)} href={`/manage/${restaurantId}/analytics/orders`} viewLabel={ar ? "عرض التفاصيل" : "View details"} /><Kpi label={ar ? "متوسط قيمة الطلب" : "Average Order Value"} value={formatMoney(data.aov, currency, lang)} href={`/manage/${restaurantId}/analytics/summary`} viewLabel={ar ? "عرض التفاصيل" : "View details"} /><Kpi label={ar ? "الطلبات المدفوعة" : "Paid Orders"} value={`${Math.round(data.paidRate)}%`} href={`/manage/${restaurantId}/analytics/paidProgress`} viewLabel={ar ? "عرض التفاصيل" : "View details"} /></section>'''
s=once(s,old,new,'analytics top KPI links')
s=once(s,'function Kpi({ label, value }: { label: string; value: string }) { return <article className="qs-stat p-4"><p className="text-[11px] font-semibold text-muted-foreground">{label}</p><p className="mt-2 truncate font-display text-2xl font-bold tracking-[-.035em]">{value}</p></article>; }','function Kpi({ label, value, href, viewLabel }: { label: string; value: string; href?: string; viewLabel?: string }) { return <article className="qs-stat group flex min-h-[124px] flex-col p-4"><p className="text-[11px] font-semibold text-muted-foreground">{label}</p><p className="mt-2 truncate font-display text-2xl font-bold tracking-[-.035em]">{value}</p>{href ? <a href={href} className="mt-auto pt-3 text-[10px] font-bold text-[#ff5a0a] transition group-hover:translate-x-0.5">{viewLabel ?? "View details"} →</a> : null}</article>; }','analytics Kpi component')
write(p,s)

# 7) Tables: count/filter zones by actual table center, not fallback membership. Persist zone as tables are moved.
p='src/components/manage/TablesManagerPro.tsx'
s=read(p)
insert='function zoneContaining(layout:Layout,zones:Zone[]){const x=layout.x/W*100;const y=layout.y/H*100;return zones.find(zone=>x>=zone.x&&x<=zone.x+zone.width&&y>=zone.y&&y<=zone.y+zone.height)??null;}\n'
s=once(s,'function slug(value:string,fallback:string){return value.toLowerCase().trim().replace(/[^a-z0-9\\u0600-\\u06ff]+/g,"-").replace(/^-|-$/g,"")||fallback;}\n','function slug(value:string,fallback:string){return value.toLowerCase().trim().replace(/[^a-z0-9\\u0600-\\u06ff]+/g,"-").replace(/^-|-$/g,"")||fallback;}\n'+insert,'zone geometry helper')
old='const currentFloor=floors.find(f=>f.id===activeFloor)??floors[0]??DEFAULT_FLOOR;const floorTables=useMemo(()=>(tables.data??[]).filter(row=>floorOf(row)===activeFloor),[tables.data,activeFloor]);const visibleTables=useMemo(()=>floorTables.filter(row=>activeZone==="all"||(row.zone||currentFloor.zones[0]?.id||"main")===activeZone),[floorTables,activeZone,currentFloor.zones]);'
new='const currentFloor=floors.find(f=>f.id===activeFloor)??floors[0]??DEFAULT_FLOOR;const floorTables=useMemo(()=>(tables.data??[]).filter(row=>floorOf(row)===activeFloor),[tables.data,activeFloor]);const visibleTables=useMemo(()=>floorTables.filter((row,index)=>activeZone==="all"||zoneContaining(draft[row.id]??layoutOf(row,index),currentFloor.zones)?.id===activeZone),[floorTables,activeZone,currentFloor.zones,draft]);'
s=once(s,old,new,'table visible zones')
old='async function persistTableLayout(id:string,layout:Layout,extra?:Record<string,unknown>){const row=(tables.data??[]).find(r=>r.id===id);if(!row)return;const raw=objectValue(row.layout);const{error}=await(supabase.from("restaurant_tables") as any).update({layout:{...raw,...layout,...extra}}).eq("id",id).eq("restaurant_id",restaurantId);if(error)toast.error(humanError(error,lang));}'
new='async function persistTableLayout(id:string,layout:Layout,extra?:Record<string,unknown>){const row=(tables.data??[]).find(r=>r.id===id);if(!row)return;const raw=objectValue(row.layout);const floor=floors.find(f=>f.id===floorOf(row))??currentFloor;const zoneId=zoneContaining(layout,floor.zones)?.id??null;const nextLayout={...raw,...layout,...extra};const{error}=await(supabase.from("restaurant_tables") as any).update({layout:nextLayout,zone:zoneId}).eq("id",id).eq("restaurant_id",restaurantId);if(error){toast.error(humanError(error,lang));return;}qc.setQueryData<FloorTable[]>(["platform","tables",restaurantId],current=>(current??[]).map(item=>item.id===id?{...item,zone:zoneId,layout:nextLayout}:item));}'
s=once(s,old,new,'persist table zone')
old='async function createTable(){setBusy(true);try{const index=floorTables.length;const slot=SLOTS[index%SLOTS.length]!;const floor=floors.find(f=>f.id===form.floor)??currentFloor;const zone=floor.zones.some(z=>z.id===form.zone)?form.zone:floor.zones[0]?.id??"main";const{data,error}=await(supabase.from("restaurant_tables") as any).insert({restaurant_id:restaurantId,table_number:form.number.trim()||String((tables.data??[]).length+1),table_name:form.name.trim()||null,qr_token:crypto.randomUUID().replace(/-/g,""),zone,capacity:clamp(Number(form.capacity)||4,1,30),shape:form.shape,is_active:form.active,layout:{x:slot[0],y:slot[1],rotation:0,scale:1,floor:form.floor,material:form.material}}).select("*").single();'
new='async function createTable(){setBusy(true);try{const index=floorTables.length;const slot=SLOTS[index%SLOTS.length]!;const floor=floors.find(f=>f.id===form.floor)??currentFloor;const targetZone=floor.zones.find(z=>z.id===form.zone)??floor.zones[0]??null;const zone=targetZone?.id??null;const startX=targetZone?(targetZone.x+targetZone.width/2)*10:slot[0];const startY=targetZone?(targetZone.y+targetZone.height/2)*7:slot[1];const{data,error}=await(supabase.from("restaurant_tables") as any).insert({restaurant_id:restaurantId,table_number:form.number.trim()||String((tables.data??[]).length+1),table_name:form.name.trim()||null,qr_token:crypto.randomUUID().replace(/-/g,""),zone,capacity:clamp(Number(form.capacity)||4,1,30),shape:form.shape,is_active:form.active,layout:{x:startX,y:startY,rotation:0,scale:1,floor:form.floor,material:form.material}}).select("*").single();'
s=once(s,old,new,'create table zone placement')
# Strict zone count in chips.
s=s.replace('{floorTables.filter(r=>(r.zone||currentFloor.zones[0]?.id)===z.id).length}','{floorTables.filter((r,index)=>zoneContaining(draft[r.id]??layoutOf(r,index),currentFloor.zones)?.id===z.id).length}')
# Delete-zone guard uses physical placement.
s=s.replace('if(floorTables.some(table=>(table.zone||currentFloor.zones[0]?.id)===zoneId))','if(floorTables.some((table,index)=>zoneContaining(draft[table.id]??layoutOf(table,index),currentFloor.zones)?.id===zoneId))')
# Saving a manually selected zone moves a table inside that zone if needed.
old='const zone=floor.zones.some(z=>z.id===form.zone)?form.zone:floor.zones[0]?.id??"main";const next={...current,rotation};'
new='const targetZone=floor.zones.find(z=>z.id===form.zone)??floor.zones[0]??null;const zone=targetZone?.id??null;const insideTarget=targetZone?zoneContaining(current,[targetZone])!==null:true;const next={...current,rotation,...(!insideTarget&&targetZone?{x:(targetZone.x+targetZone.width/2)*10,y:(targetZone.y+targetZone.height/2)*7}:{})};'
s=once(s,old,new,'save selected zone placement')
write(p,s)

print('QuickServe profile/details/zone/cover upgrade applied')
