import { useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Image as ImageIcon, Minus, Move, Plus, RotateCcw, Save, SlidersHorizontal } from "lucide-react";
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
  const frameRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerId: number; clientX: number; clientY: number; x: number; y: number } | null>(null);
  const previewStyle = { objectPosition: `${x}% ${y}%`, transform: `scale(${zoom / 100})`, transformOrigin: `${x}% ${y}%` };
  const clampValue = (value: number) => Math.min(100, Math.max(0, value));
  const clampZoom = (value: number) => Math.min(220, Math.max(100, value));

  function beginDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest('button')) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, x, y };
  }

  function moveDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const rect = frameRef.current?.getBoundingClientRect();
    if (!drag || drag.pointerId !== event.pointerId || !rect) return;
    event.preventDefault();
    const dx = (event.clientX - drag.clientX) / rect.width * 100;
    const dy = (event.clientY - drag.clientY) / rect.height * 100;
    onChange({ coverPositionX: clampValue(drag.x - dx), coverPositionY: clampValue(drag.y - dy) });
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
    dragRef.current = null;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
  }

  return <div className="space-y-2">
    <div
      ref={frameRef}
      role="application"
      aria-label={ar ? "اسحب صورة الغلاف لتغيير الجزء الظاهر" : "Drag the cover image to change the visible area"}
      onPointerDown={beginDrag}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className="group relative aspect-[16/6] touch-none select-none overflow-hidden rounded-2xl border border-border bg-muted shadow-sm cursor-grab active:cursor-grabbing"
    >
      <img src={url} alt="" draggable={false} className="pointer-events-none h-full w-full object-cover transition-transform duration-150" style={previewStyle} />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-black/10" />
      <div className="pointer-events-none absolute inset-0 grid place-items-center opacity-0 transition group-hover:opacity-100">
        <span className="grid size-10 place-items-center rounded-full border border-white/70 bg-black/25 text-white backdrop-blur-sm"><Move className="size-4" /></span>
      </div>
      <div className="absolute start-3 top-3 flex items-center gap-1 rounded-xl border border-white/20 bg-black/55 p-1 text-white shadow-lg backdrop-blur-md">
        <button type="button" onClick={() => onChange({ coverZoom: clampZoom(zoom - 10) })} className="grid size-9 place-items-center rounded-lg transition hover:bg-white/15" aria-label={ar ? "تصغير" : "Zoom out"}><Minus className="size-4" /></button>
        <span className="min-w-12 text-center text-[10px] font-bold tabular-nums">{Math.round(zoom)}%</span>
        <button type="button" onClick={() => onChange({ coverZoom: clampZoom(zoom + 10) })} className="grid size-9 place-items-center rounded-lg transition hover:bg-white/15" aria-label={ar ? "تكبير" : "Zoom in"}><Plus className="size-4" /></button>
        <span className="mx-0.5 h-5 w-px bg-white/20" />
        <button type="button" onClick={() => onChange({ coverPositionX: 50, coverPositionY: 50, coverZoom: 100 })} className="grid size-9 place-items-center rounded-lg transition hover:bg-white/15" aria-label={ar ? "إعادة ضبط" : "Reset framing"}><RotateCcw className="size-4" /></button>
      </div>
      <div className="pointer-events-none absolute bottom-3 start-3 max-w-[78%] rounded-xl bg-black/55 px-3 py-2 text-[10px] font-semibold leading-4 text-white backdrop-blur-md">
        {ar ? "اسحب الصورة نفسها لاختيار الجزء الظاهر. استخدم + و− للتكبير والتصغير." : "Drag the image itself to choose what stays visible. Use + and − to zoom."}
      </div>
    </div>
    <p className="text-[10px] text-muted-foreground">{ar ? "يتم حفظ الموضع والتكبير عند حفظ إعدادات المؤسسة." : "The framing and zoom are saved with the organization settings."}</p>
  </div>;
}
