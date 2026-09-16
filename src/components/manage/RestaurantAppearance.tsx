import { useState, type FormEvent, type ReactNode } from "react";
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
  const { lang } = useI18n();
  const ar = lang === "ar";
  const qc = useQueryClient();
  const [brand, setBrand] = useState(() => readAppearance(restaurant.menu_theme));
  const [form, setForm] = useState({
    logo_url: restaurant.logo_url,
    cover_image_url: restaurant.cover_image_url,
    primary_color: restaurant.primary_color,
    accent_color: restaurant.accent_color,
    background_color: restaurant.background_color,
    text_color: restaurant.text_color,
    tax_rate: String(restaurant.tax_rate),
    service_charge: String(restaurant.service_charge),
  });
  const [saving, setSaving] = useState(false);
  const field = <K extends keyof typeof form>(key: K, value: typeof form[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const tax = Number(form.tax_rate);
      const service = Number(form.service_charge);
      if (![tax, service].every((n) => Number.isFinite(n) && n >= 0 && n <= 100)) throw new Error("Rates must be between 0 and 100%.");

      const current = await supabase.from("restaurants").select("menu_theme").eq("id", restaurant.id).single();
      if (current.error) throw current.error;
      const theme = current.data.menu_theme && typeof current.data.menu_theme === "object" && !Array.isArray(current.data.menu_theme)
        ? current.data.menu_theme as Record<string, unknown>
        : {};
      const existingWorkspace = theme.workspace && typeof theme.workspace === "object" && !Array.isArray(theme.workspace)
        ? theme.workspace as Record<string, unknown>
        : {};
      const menuTheme = { ...theme, workspace: { ...existingWorkspace, ...brand } };

      const { error, data } = await supabase.from("restaurants").update({
        ...form,
        background_color: brand.lightBackground,
        tax_rate: tax,
        service_charge: service,
        menu_theme: menuTheme,
      }).eq("id", restaurant.id).select("id").single();
      if (error || !data) throw error ?? new Error("Changes were not saved.");

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["platform"] }),
        qc.invalidateQueries({ queryKey: ["staff", "memberships"] }),
        qc.invalidateQueries({ queryKey: ["diner"] }),
        qc.invalidateQueries({ queryKey: ["pdf-diner"] }),
      ]);
      toast.success(ar ? "تم حفظ إعدادات المؤسسة" : "Organization settings saved");
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="grid min-w-0 gap-5 2xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-5">
        <section className="panel space-y-6 p-4 sm:p-6">
          <div><h3 className="text-lg font-semibold">{ar ? "إعدادات المؤسسة" : "Organization Settings"}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{ar ? "خصص شعار المطعم والغلاف وهوية مساحة العمل." : "Customize this restaurant's logo, cover, and workspace identity."}</p></div>
          <div className="grid gap-6 lg:grid-cols-2">
            <ImageUploader restaurantId={restaurant.id} kind="logo" value={form.logo_url} onChange={(v) => field("logo_url", v)} label={ar ? "شعار المؤسسة" : "Organization logo"} />
            <ImageUploader restaurantId={restaurant.id} kind="logo" value={brand.menuLogo} onChange={(v) => setBrand((p) => ({ ...p, menuLogo: v }))} label={ar ? "شعار قائمة الضيف" : "Guest menu logo"} />
            <div className="lg:col-span-2"><ImageUploader restaurantId={restaurant.id} kind="cover" aspect="wide" value={form.cover_image_url} onChange={(v) => field("cover_image_url", v)} label={ar ? "صورة الغلاف والرئيسية" : "Cover & home image"} /></div>
          </div>

          <div className="border-t border-border pt-6">
            <div className="mb-4"><h4 className="text-sm font-bold">{ar ? "ألوان التنقل" : "Navigation colors"}</h4><p className="mt-1 text-xs leading-5 text-muted-foreground">{ar ? "تطبق على الشريط العلوي والقائمة الجانبية لهذا المطعم فقط." : "Applied only to this restaurant's top navigation and left sidebar."}</p></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <ColorField label={ar ? "خلفية الشريط العلوي" : "Top navigation background"} value={brand.topNavBackground} onChange={(value) => setBrand((p) => ({ ...p, topNavBackground: value }))} />
              <ColorField label={ar ? "نص وأيقونات الشريط العلوي" : "Top navigation text & icons"} value={brand.topNavText} onChange={(value) => setBrand((p) => ({ ...p, topNavText: value }))} />
              <ColorField label={ar ? "خلفية القائمة الجانبية" : "Left sidebar background"} value={brand.sidebarBackground} onChange={(value) => setBrand((p) => ({ ...p, sidebarBackground: value }))} />
              <ColorField label={ar ? "نص وأيقونات القائمة الجانبية" : "Left sidebar text & icons"} value={brand.sidebarText} onChange={(value) => setBrand((p) => ({ ...p, sidebarText: value }))} />
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <ColorField label={ar ? "لون العلامة الأساسي" : "Primary brand color"} value={form.primary_color} onChange={(value) => field("primary_color", value)} />
              <ColorField label={ar ? "لون التمييز" : "Accent color"} value={form.accent_color} onChange={(value) => field("accent_color", value)} />
            </div>
          </div>
        </section>

        <section className="panel space-y-5 p-4 sm:p-6"><h3 className="text-lg font-semibold">{ar ? "الرئيسية ولوحة التحكم" : "Home & dashboard"}</h3><label className="block space-y-2 text-sm"><span>{ar ? "عنوان الرئيسية" : "Home heading"}</span><Input maxLength={100} value={brand.homeTitle} placeholder={restaurant.name} onChange={(e) => setBrand((p) => ({ ...p, homeTitle: e.target.value }))} /></label><label className="block space-y-2 text-sm"><span>{ar ? "عنوان لوحة التحكم" : "Dashboard heading"}</span><Input maxLength={100} value={brand.dashboardTitle} placeholder={restaurant.name} onChange={(e) => setBrand((p) => ({ ...p, dashboardTitle: e.target.value }))} /></label></section>
      </div>

      <aside className="min-w-0 space-y-4 2xl:sticky 2xl:top-24 2xl:self-start">
        <section className="panel space-y-4 p-5"><h3 className="font-semibold">{ar ? "نوع قائمة الضيف" : "Guest menu type"}</h3><p className="text-sm leading-6 text-muted-foreground">{ar ? "اختر القائمة العادية أو PDF. تبقى البيانات منفصلة ومحفوظة." : "Choose Standard Menu or Clickable PDF. Both data sets remain separate and preserved."}</p>{(["pdf","products"] as const).map((mode) => <label key={mode} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm"><input type="radio" name="menuMode" checked={brand.menuMode === mode} onChange={() => setBrand((p) => ({ ...p, menuMode: mode }))} /><span>{mode === "pdf" ? (ar ? "قائمة PDF التفاعلية" : "Clickable PDF Menu") : (ar ? "القائمة العادية" : "Standard Menu")}</span></label>)}</section>
        <section className="panel space-y-4 p-5"><h3 className="font-semibold">{ar ? "الضرائب والخدمة" : "Tax & service"}</h3><label className="block space-y-2 text-sm"><span>{ar ? "الضريبة %" : "Tax %"}</span><Input required type="number" min="0" max="100" step="0.01" value={form.tax_rate} onChange={(e) => field("tax_rate", e.target.value)} /></label><label className="block space-y-2 text-sm"><span>{ar ? "الخدمة %" : "Service %"}</span><Input required type="number" min="0" max="100" step="0.01" value={form.service_charge} onChange={(e) => field("service_charge", e.target.value)} /></label></section>
        <Button className="min-h-12 w-full bg-[#ff5a0a] text-white hover:bg-[#e94f00]" disabled={saving} type="submit"><Save className="size-4" />{saving ? (ar ? "جارٍ الحفظ…" : "Saving…") : (ar ? "حفظ إعدادات المؤسسة" : "Save Organization Settings")}</Button>
      </aside>
    </form>
  );
}

function ColorField({ label, value, onChange, icon }: { label: string; value: string; onChange: (value: string) => void; icon?: ReactNode }) {
  return <label className="min-w-0 space-y-2"><span className="flex items-center gap-2 text-xs font-semibold">{icon}{label}</span><span className="grid grid-cols-[46px_minmax(0,1fr)] gap-2"><Input type="color" value={value} onChange={(event) => onChange(event.target.value)} className="h-11 w-full p-1" /><Input value={value} onChange={(event) => onChange(event.target.value)} className="h-11 min-w-0 font-mono text-xs" /></span></label>;
}
