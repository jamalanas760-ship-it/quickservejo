import { useState, type FormEvent } from "react";
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
