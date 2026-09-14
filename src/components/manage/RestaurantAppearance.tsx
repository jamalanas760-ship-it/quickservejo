import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Moon, RotateCcw, Save, Sun } from "lucide-react";
import { toast } from "sonner";
import { useRestaurant, type RestaurantRow } from "@/hooks/useSuperAdmin";
import { useAccess } from "@/hooks/useSession";
import { useI18n } from "@/lib/i18n";
import { readAppearance } from "@/lib/restaurant-appearance";
import { humanError } from "@/lib/errors";
import { supabase } from "@/integrations/supabase/client";
import { ImageUploader } from "@/components/media/ImageUploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export function RestaurantAppearance({ restaurantId }: { restaurantId: string }) {
  const restaurant = useRestaurant(restaurantId);
  const access = useAccess();
  if (restaurant.isPending || access.isPending) return <Skeleton className="h-80 rounded-2xl" />;
  if (!access.isSuperAdmin && access.membershipFor(restaurantId)?.role !== "restaurant_admin") return <p>Only restaurant administrators can change appearance.</p>;
  if (!restaurant.data) return <p>{humanError(restaurant.error)}</p>;
  return <AppearanceForm key={`${restaurantId}:${restaurant.data.updated_at}`} restaurant={restaurant.data} />;
}

function AppearanceForm({ restaurant }: { restaurant: RestaurantRow }) {
  const { lang } = useI18n(); const ar = lang === "ar";
  const qc = useQueryClient();
  const [brand, setBrand] = useState(() => readAppearance(restaurant.menu_theme));
  const [form, setForm] = useState({ logo_url: restaurant.logo_url, cover_image_url: restaurant.cover_image_url,
    primary_color: restaurant.primary_color, accent_color: restaurant.accent_color,
    background_color: restaurant.background_color, text_color: restaurant.text_color,
    tax_rate: String(restaurant.tax_rate), service_charge: String(restaurant.service_charge) });
  const [saving, setSaving] = useState(false);
  const field = <K extends keyof typeof form>(key: K, value: typeof form[K]) => setForm(prev => ({ ...prev, [key]: value }));

  function resetTheme() {
    setBrand(prev => ({ ...prev, lightBackground: "#ffffff", darkBackground: "#11171b" }));
    setForm(prev => ({ ...prev, primary_color: "#ff5a0a", accent_color: "#111111", background_color: "#ffffff", text_color: "#111111" }));
  }

  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true);
    try {
      const tax = Number(form.tax_rate), service = Number(form.service_charge);
      if (![tax, service].every(n => Number.isFinite(n) && n >= 0 && n <= 100)) throw new Error("Rates must be between 0 and 100%.");
      const current = await supabase.from("restaurants").select("menu_theme").eq("id", restaurant.id).single();
      if (current.error) throw current.error;
      const theme = current.data.menu_theme && typeof current.data.menu_theme === "object" && !Array.isArray(current.data.menu_theme) ? current.data.menu_theme : {};
      const { error, data } = await supabase.from("restaurants").update({ ...form, background_color: brand.lightBackground, tax_rate: tax, service_charge: service,
        menu_theme: { ...theme, workspace: { ...brand } } }).eq("id", restaurant.id).select("id").single();
      if (error || !data) throw error ?? new Error("Changes were not saved.");
      await Promise.all([qc.invalidateQueries({ queryKey: ["platform"] }), qc.invalidateQueries({ queryKey: ["staff", "memberships"] }), qc.invalidateQueries({ queryKey: ["diner"] }), qc.invalidateQueries({ queryKey: ["pdf-diner"] })]);
      toast.success(ar ? "تم حفظ إعدادات المؤسسة" : "Organization settings saved");
    } catch (error) { toast.error(humanError(error, lang)); } finally { setSaving(false); }
  }

  return <form onSubmit={save} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
    <div className="space-y-6">
      <section className="panel space-y-6 p-4 sm:p-6"><div><h3 className="text-lg font-semibold">{ar ? "إعدادات المؤسسة" : "Organization Settings"}</h3><p className="mt-1 text-xs text-muted-foreground">{ar ? "خصص شعار وغلاف وألوان هذا المطعم فقط." : "Customize this restaurant's logo, cover, and brand colors only."}</p></div>
        <div className="grid gap-6 sm:grid-cols-2">
          <ImageUploader restaurantId={restaurant.id} kind="logo" value={form.logo_url} onChange={v => field("logo_url", v)} label={ar ? "شعار المؤسسة" : "Organization logo"} />
          <ImageUploader restaurantId={restaurant.id} kind="logo" value={brand.menuLogo} onChange={v => setBrand(p => ({ ...p, menuLogo: v }))} label={ar ? "شعار قائمة الضيف" : "Guest menu logo"} />
          <div className="sm:col-span-2"><ImageUploader restaurantId={restaurant.id} kind="cover" aspect="wide" value={form.cover_image_url} onChange={v => field("cover_image_url", v)} label={ar ? "صورة الغلاف والرئيسية" : "Cover & home image"} /></div>
        </div>
      </section>

      <section className="panel space-y-5 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-semibold">{ar ? "الألوان والمظهر" : "Colors & Appearance"}</h3><p className="mt-1 text-xs text-muted-foreground">{ar ? "خلفية منفصلة للوضع الفاتح والداكن مع ألوان العلامة." : "Separate backgrounds for light and dark mode, plus brand colors."}</p></div><Button type="button" variant="outline" size="sm" onClick={resetTheme}><RotateCcw className="size-4" />{ar ? "إعادة الافتراضي" : "Restore defaults"}</Button></div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">{([['primary_color','Primary','الأساسي'],['accent_color','Accent','التمييز'],['text_color','Text','النص']] as const).map(([key,en,arabic]) => <label key={key} className="space-y-2 text-sm"><span>{ar ? arabic : en}</span><Input type="color" className="h-12 cursor-pointer p-1" value={form[key]} onChange={e => field(key,e.target.value)} /></label>)}</div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm"><span className="flex items-center gap-2 font-semibold"><Sun className="size-4" />{ar ? "خلفية الوضع الفاتح" : "Light mode background"}</span><div className="flex gap-2"><Input type="color" className="h-12 w-16 cursor-pointer p-1" value={brand.lightBackground} onChange={e => setBrand(p => ({...p, lightBackground:e.target.value}))} /><Input value={brand.lightBackground} onChange={e => /^#[0-9a-fA-F]{0,6}$/.test(e.target.value) && setBrand(p => ({...p, lightBackground:e.target.value}))} /></div></label>
          <label className="space-y-2 text-sm"><span className="flex items-center gap-2 font-semibold"><Moon className="size-4" />{ar ? "خلفية الوضع الداكن" : "Dark mode background"}</span><div className="flex gap-2"><Input type="color" className="h-12 w-16 cursor-pointer p-1" value={brand.darkBackground} onChange={e => setBrand(p => ({...p, darkBackground:e.target.value}))} /><Input value={brand.darkBackground} onChange={e => /^#[0-9a-fA-F]{0,6}$/.test(e.target.value) && setBrand(p => ({...p, darkBackground:e.target.value}))} /></div></label>
        </div>
        <div className="grid gap-3 md:grid-cols-2"><ThemePreview title={ar ? "معاينة فاتحة" : "Light preview"} background={brand.lightBackground} foreground="#111111" accent={form.primary_color} logo={form.logo_url || brand.menuLogo} cover={form.cover_image_url} name={restaurant.name} /><ThemePreview title={ar ? "معاينة داكنة" : "Dark preview"} background={brand.darkBackground} foreground="#ffffff" accent={form.primary_color} logo={form.logo_url || brand.menuLogo} cover={form.cover_image_url} name={restaurant.name} /></div>
      </section>

      <section className="panel space-y-5 p-4 sm:p-6"><h3 className="text-lg font-semibold">{ar ? "الرئيسية ولوحة التحكم" : "Home & dashboard"}</h3>
        <label className="block space-y-2 text-sm"><span>{ar ? "عنوان الرئيسية" : "Home heading"}</span><Input maxLength={100} value={brand.homeTitle} placeholder={restaurant.name} onChange={e => setBrand(p => ({...p,homeTitle:e.target.value}))} /></label>
        <label className="block space-y-2 text-sm"><span>{ar ? "عنوان لوحة التحكم" : "Dashboard heading"}</span><Input maxLength={100} value={brand.dashboardTitle} placeholder={restaurant.name} onChange={e => setBrand(p => ({...p,dashboardTitle:e.target.value}))} /></label>
      </section>
    </div>

    <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
      <section className="panel space-y-4 p-5"><h3 className="font-semibold">{ar ? "نوع قائمة الضيف" : "Guest menu type"}</h3><p className="text-sm text-muted-foreground">{ar ? "اختر أي تجربة تفتح للضيف. تبقى بيانات القائمة العادية وPDF منفصلة ومحفوظة." : "Choose the guest experience. Standard and PDF menu data remain separate and preserved."}</p>{(['pdf','products'] as const).map(mode => <label key={mode} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm"><input type="radio" name="menuMode" checked={brand.menuMode===mode} onChange={() => setBrand(p => ({...p,menuMode:mode}))} />{mode==='pdf' ? (ar ? 'قائمة PDF التفاعلية' : 'Clickable PDF Menu') : (ar ? 'القائمة العادية' : 'Standard Menu')}</label>)}</section>
      <section className="panel space-y-4 p-5"><h3 className="font-semibold">{ar ? "الضرائب والخدمة" : "Tax & service"}</h3><label className="block space-y-2 text-sm"><span>{ar ? "الضريبة %" : "Tax %"}</span><Input required type="number" min="0" max="100" step="0.01" value={form.tax_rate} onChange={e => field('tax_rate',e.target.value)} /></label><label className="block space-y-2 text-sm"><span>{ar ? "الخدمة %" : "Service %"}</span><Input required type="number" min="0" max="100" step="0.01" value={form.service_charge} onChange={e => field('service_charge',e.target.value)} /></label></section>
      <div className="safe-bottom sticky bottom-0 z-20 -mx-1 rounded-2xl border border-border bg-background/95 p-2 shadow-lg backdrop-blur lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none"><Button className="min-h-12 w-full" disabled={saving}><Save className="size-4" />{saving ? (ar ? "جارٍ الحفظ…" : "Saving…") : (ar ? "حفظ إعدادات المؤسسة" : "Save Organization Settings")}</Button></div>
    </aside>
  </form>;
}

function ThemePreview({ title, background, foreground, accent, logo, cover, name }: { title:string; background:string; foreground:string; accent:string; logo:string|null; cover:string|null; name:string }) {
  return <div className="overflow-hidden rounded-2xl border"><div className="px-3 py-2 text-xs font-semibold text-muted-foreground">{title}</div><div className="p-3" style={{ backgroundColor: background, color: foreground }}><div className="relative h-24 overflow-hidden rounded-xl bg-black/10">{cover ? <img src={cover} alt="" className="h-full w-full object-cover" /> : null}<div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" /><div className="absolute bottom-2 left-2 flex items-center gap-2">{logo ? <img src={logo} alt="" className="size-9 rounded-lg bg-white object-contain p-1" /> : null}<strong className="text-sm text-white">{name}</strong></div></div><div className="mt-3 h-9 rounded-lg" style={{ backgroundColor: accent }} /></div></div>;
}
