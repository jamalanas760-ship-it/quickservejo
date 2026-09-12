import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
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
  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true);
    try {
      const tax = Number(form.tax_rate), service = Number(form.service_charge);
      if (![tax, service].every(n => Number.isFinite(n) && n >= 0 && n <= 100)) throw new Error("Rates must be between 0 and 100%.");
      // Preserve unrelated menu styling. Updates remain subject to tenant RLS.
      const current = await supabase.from("restaurants").select("menu_theme").eq("id", restaurant.id).single();
      if (current.error) throw current.error;
      const theme = current.data.menu_theme && typeof current.data.menu_theme === "object" && !Array.isArray(current.data.menu_theme) ? current.data.menu_theme : {};
      const { error, data } = await supabase.from("restaurants").update({ ...form, tax_rate: tax, service_charge: service,
        menu_theme: { ...theme, workspace: { ...brand } } }).eq("id", restaurant.id).select("id").single();
      if (error || !data) throw error ?? new Error("Changes were not saved.");
      await Promise.all([qc.invalidateQueries({ queryKey: ["platform"] }), qc.invalidateQueries({ queryKey: ["staff", "memberships"] }), qc.invalidateQueries({ queryKey: ["diner"] }), qc.invalidateQueries({ queryKey: ["pdf-diner"] })]);
      toast.success(ar ? "تم حفظ الهوية والأسعار" : "Brand and pricing saved");
    } catch (error) { toast.error(humanError(error, lang)); } finally { setSaving(false); }
  }
  return <form onSubmit={save} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
    <div className="space-y-6">
      <section className="panel space-y-6 p-5 sm:p-6"><h3 className="text-lg font-semibold">{ar ? "هوية المطعم" : "Restaurant identity"}</h3>
        <div className="grid gap-6 sm:grid-cols-2">
          <ImageUploader restaurantId={restaurant.id} kind="logo" value={form.logo_url} onChange={v => field("logo_url", v)} label={ar ? "شعار المؤسسة" : "Organization logo"} />
          <ImageUploader restaurantId={restaurant.id} kind="logo" value={brand.menuLogo} onChange={v => setBrand(p => ({ ...p, menuLogo: v }))} label={ar ? "شعار القائمة" : "Menu logo"} />
          <div className="sm:col-span-2"><ImageUploader restaurantId={restaurant.id} kind="cover" aspect="wide" value={form.cover_image_url} onChange={v => field("cover_image_url", v)} label={ar ? "صورة الغلاف والرئيسية" : "Cover & home image"} /></div>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">{([['primary_color','Primary','الأساسي'],['accent_color','Accent','التمييز'],['background_color','Background','الخلفية'],['text_color','Text','النص']] as const).map(([key,en,arabic]) => <label key={key} className="space-y-2 text-sm"><span>{ar ? arabic : en}</span><Input type="color" className="h-12 cursor-pointer p-1" value={form[key]} onChange={e => field(key,e.target.value)} /></label>)}</div>
      </section>
      <section className="panel space-y-5 p-5 sm:p-6"><h3 className="text-lg font-semibold">{ar ? "الرئيسية ولوحة التحكم" : "Home & dashboard"}</h3>
        <label className="block space-y-2 text-sm"><span>{ar ? "عنوان الرئيسية" : "Home heading"}</span><Input maxLength={100} value={brand.homeTitle} placeholder={restaurant.name} onChange={e => setBrand(p => ({...p,homeTitle:e.target.value}))} /></label>
        <label className="block space-y-2 text-sm"><span>{ar ? "عنوان لوحة التحكم" : "Dashboard heading"}</span><Input maxLength={100} value={brand.dashboardTitle} placeholder={restaurant.name} onChange={e => setBrand(p => ({...p,dashboardTitle:e.target.value}))} /></label>
        <p className="text-xs text-muted-foreground">{ar ? "تطبق الألوان والشعارات على مساحة هذا المطعم فقط." : "Colors and logos apply to this restaurant's workspace only."}</p>
      </section>
    </div>
    <aside className="space-y-6">
      <section className="panel space-y-4 p-5"><h3 className="font-semibold">{ar ? "قائمة رمز QR" : "QR menu format"}</h3>
        <p className="text-sm text-muted-foreground">{ar ? "اختر ما يراه الضيف عند المسح. تبقى بيانات الخيارين محفوظة." : "Choose what guests see after scanning. Both editors keep their saved content."}</p>
        {(['pdf','products'] as const).map(mode => <label key={mode} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm"><input type="radio" name="menuMode" checked={brand.menuMode===mode} onChange={() => setBrand(p => ({...p,menuMode:mode}))} />{mode==='pdf' ? (ar ? 'القائمة الأصلية PDF' : 'Original PDF') : (ar ? 'كتالوج المنتجات' : 'Product catalog')}</label>)}
      </section>
      <section className="panel space-y-4 p-5"><h3 className="font-semibold">{ar ? "الضرائب والخدمة" : "Tax & service"}</h3>
        <p className="text-xs leading-5 text-muted-foreground">{ar ? "نسب موحدة لجميع الأصناف. تطبق الخدمة عند تفعيلها في إعدادات الطلبات." : "Restaurant-wide rates for all products. Service applies when enabled in ordering settings."}</p>
        <label className="block space-y-2 text-sm"><span>{ar ? "الضريبة %" : "Tax %"}</span><Input required type="number" min="0" max="100" step="0.01" value={form.tax_rate} onChange={e => field('tax_rate',e.target.value)} /></label>
        <label className="block space-y-2 text-sm"><span>{ar ? "الخدمة %" : "Service %"}</span><Input required type="number" min="0" max="100" step="0.01" value={form.service_charge} onChange={e => field('service_charge',e.target.value)} /></label>
      </section>
      <Button className="min-h-12 w-full" disabled={saving}><Save className="size-4" />{saving ? (ar ? "جارٍ الحفظ…" : "Saving…") : (ar ? "حفظ التغييرات" : "Save changes")}</Button>
    </aside>
  </form>;
}
