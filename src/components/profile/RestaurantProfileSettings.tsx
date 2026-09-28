import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Save, SlidersHorizontal } from "lucide-react";
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

  return <form onSubmit={save} className="qs-organization-settings space-y-5">
    <section className="qs-organization-overview grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,.8fr)]">
      <div className="qs-organization-cover-card" style={form.cover_image_url ? { backgroundImage: `linear-gradient(90deg,rgba(16,14,12,.25),rgba(16,14,12,.08)),url(${form.cover_image_url})` } : undefined}>
        <div className="qs-organization-cover-copy">
          <span>{ar ? "هوية المطعم" : "Restaurant identity"}</span>
          <strong>{restaurant.name}</strong>
          <small>{ar ? "نكهات أصيلة، تجربة عصرية" : "Authentic flavors, modern experience"}</small>
        </div>
      </div>
      <div className="qs-card p-4">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-[10px] font-black uppercase tracking-[.14em] text-muted-foreground">{ar ? "معلومات المطعم" : "Restaurant information"}</p><h2 className="mt-1 text-base font-bold">{restaurant.name}</h2></div>
          {form.logo_url ? <img src={form.logo_url} alt="" className="size-16 rounded-2xl border border-border bg-white object-contain p-2" /> : null}
        </div>
        <div className="mt-4 divide-y divide-border text-xs">
          <div className="flex items-center justify-between gap-4 py-2"><span className="text-muted-foreground">{ar ? "الاسم" : "Restaurant name"}</span><strong className="truncate">{restaurant.name}</strong></div>
          <div className="flex items-center justify-between gap-4 py-2"><span className="text-muted-foreground">{ar ? "العملة" : "Currency"}</span><strong>{restaurant.currency ?? "JOD"}</strong></div>
          <div className="flex items-center justify-between gap-4 py-2"><span className="text-muted-foreground">{ar ? "المنطقة الزمنية" : "Timezone"}</span><strong className="truncate">{restaurant.timezone ?? "Asia/Amman"}</strong></div>
          <div className="flex items-center justify-between gap-4 py-2"><span className="text-muted-foreground">{ar ? "الفئة" : "Category"}</span><strong>{ar ? "مطعم" : "Restaurant"}</strong></div>
        </div>
      </div>
    </section>

    <section className="qs-card overflow-hidden">
      <div className="qs-panel-header flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="font-display text-lg font-bold">{ar ? "إعدادات المؤسسة" : "Organization Settings"}</h2><p className="mt-1 text-xs text-muted-foreground">{ar ? "شعار المؤسسة وهوية مساحة العمل الخاصة بهذا المطعم." : "Organization logo and workspace identity for this restaurant."}</p></div>
        <span className="inline-flex items-center gap-2 self-start rounded-full bg-emerald-500/10 px-3 py-1.5 text-[10px] font-bold text-emerald-600"><SlidersHorizontal className="size-3.5" />{ar ? "خاص بالمطعم" : "Restaurant scoped"}</span>
      </div>
      <div className="space-y-6 p-4 sm:p-6">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,620px)]">
          <div className="qs-brand-card space-y-3">
            <div><p className="text-[10px] font-black uppercase tracking-[.14em] text-muted-foreground">{ar?"هوية مساحة العمل":"Workspace identity"}</p><h3 className="mt-1 text-sm font-bold">{ar?"شعار المؤسسة":"Organization logo"}</h3></div>
            <ImageUploader restaurantId={restaurant.id} kind="logo" value={form.logo_url} onChange={(value) => field("logo_url", value)} label={ar ? "شعار المؤسسة" : "Organization logo"} />
            <label className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-muted/20 p-4"><span className="min-w-0"><strong className="block text-sm">{ar ? "استخدام شعار QuickServe" : "Use QuickServe logo"}</strong><span className="mt-1 block text-xs leading-5 text-muted-foreground">{ar ? "أوقفه لإظهار شعار المطعم في التطبيق عند توفره." : "Turn this off to use the restaurant logo in the workspace when available."}</span></span><Switch checked={brand.useQuickServeLogo} onCheckedChange={(value) => setBrand((current) => ({ ...current, useQuickServeLogo: value }))} /></label>
          </div>
        </div>
      </div>
    </section>

    <section className="qs-interface-visuals qs-card p-4 sm:p-6">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="inline-flex items-center rounded-full bg-orange-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[.14em] text-[#e85d2a]">{ar ? "مرئيات الواجهة" : "Interface visuals"}</span>
          <h2 className="mt-3 font-display text-xl font-bold tracking-[-.03em]">{ar ? "خصص الصور والأيقونات" : "Customize images & icons"}</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">{ar ? "خصص لوحة أدوات مساحة العمل وبطاقات اختيار القائمة بدون تغيير شعار المطعم أو صورة الغلاف." : "Customize the Workspace Tools panel and Menu selector cards without changing the restaurant logo or cover image."}</p>
        </div>
        <span className="inline-flex items-center gap-2 self-start rounded-xl border border-border bg-card px-3 py-2 text-[10px] font-semibold text-muted-foreground"><SlidersHorizontal className="size-3.5 text-[#e85d2a]" />{ar ? "تخصيص مباشر" : "Live customization"}</span>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="qs-interface-asset-card">
          <div className="qs-interface-asset-head">
            <div><span>{ar ? "أدوات مساحة العمل" : "Workspace Tools"}</span><strong>{ar ? "لوحة الاختصارات" : "Launcher spotlight"}</strong></div>
            <div className="qs-interface-asset-mini qs-interface-asset-mini-tools" style={brand.workspaceToolsImage ? { backgroundImage: `linear-gradient(180deg,rgba(15,12,10,.08),rgba(15,12,10,.72)),url(${brand.workspaceToolsImage})` } : undefined}>
              {brand.workspaceToolsIcon ? <img src={brand.workspaceToolsIcon} alt="" /> : form.logo_url ? <img src={form.logo_url} alt="" /> : <span>Q</span>}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_150px]">
            <ImageUploader restaurantId={restaurant.id} kind="cover" aspect="wide" value={brand.workspaceToolsImage} onChange={(value) => setBrand((current) => ({ ...current, workspaceToolsImage: value }))} label={ar ? "صورة اللوحة" : "Panel image"} />
            <ImageUploader restaurantId={restaurant.id} kind="logo" value={brand.workspaceToolsIcon} onChange={(value) => setBrand((current) => ({ ...current, workspaceToolsIcon: value }))} label={ar ? "أيقونة اللوحة" : "Panel icon"} />
          </div>
        </section>

        <section className="qs-interface-asset-card">
          <div className="qs-interface-asset-head">
            <div><span>{ar ? "استوديو القائمة" : "Menu Studio"}</span><strong>{ar ? "بطاقات نوع القائمة" : "Menu type cards"}</strong></div>
            <div className="flex gap-1.5">
              <span className="qs-interface-card-swatch" style={brand.standardMenuCardImage ? { backgroundImage: `url(${brand.standardMenuCardImage})` } : undefined}>{brand.standardMenuCardIcon ? <img src={brand.standardMenuCardIcon} alt="" /> : "S"}</span>
              <span className="qs-interface-card-swatch" style={brand.pdfMenuCardImage ? { backgroundImage: `url(${brand.pdfMenuCardImage})` } : undefined}>{brand.pdfMenuCardIcon ? <img src={brand.pdfMenuCardIcon} alt="" /> : "P"}</span>
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="qs-interface-upload-group">
              <strong>{ar ? "القائمة العادية" : "Standard Menu"}</strong>
              <ImageUploader restaurantId={restaurant.id} kind="cover" aspect="wide" value={brand.standardMenuCardImage} onChange={(value) => setBrand((current) => ({ ...current, standardMenuCardImage: value }))} label={ar ? "صورة البطاقة" : "Card image"} />
              <ImageUploader restaurantId={restaurant.id} kind="logo" value={brand.standardMenuCardIcon} onChange={(value) => setBrand((current) => ({ ...current, standardMenuCardIcon: value }))} label={ar ? "أيقونة البطاقة" : "Card icon"} />
            </div>
            <div className="qs-interface-upload-group">
              <strong>{ar ? "قائمة PDF" : "PDF Menu"}</strong>
              <ImageUploader restaurantId={restaurant.id} kind="cover" aspect="wide" value={brand.pdfMenuCardImage} onChange={(value) => setBrand((current) => ({ ...current, pdfMenuCardImage: value }))} label={ar ? "صورة البطاقة" : "Card image"} />
              <ImageUploader restaurantId={restaurant.id} kind="logo" value={brand.pdfMenuCardIcon} onChange={(value) => setBrand((current) => ({ ...current, pdfMenuCardIcon: value }))} label={ar ? "أيقونة البطاقة" : "Card icon"} />
            </div>
          </div>
        </section>
      </div>
    </section>

    <section className="qs-card p-4 sm:p-6">
      <ApplicationColorStudio ar={ar} restaurantName={restaurant.name} brand={brand} setBrand={setBrand} primaryColor={form.primary_color} accentColor={form.accent_color} setPrimaryColor={(value) => field("primary_color", value)} setAccentColor={(value) => field("accent_color", value)} />
    </section>

    <div className="qs-settings-savebar">
      <div><strong>{ar?"التغييرات تطبق على مساحة المطعم":"Changes apply to this restaurant workspace"}</strong><p>{ar?"راجع الشعار والألوان ثم احفظ مرة واحدة.":"Review the logo and colors, then save everything together."}</p></div>
      <Button type="submit" disabled={saving} className="min-h-11 bg-[#e85d2a] px-5 text-white shadow-md hover:bg-[#e94f00]"><Save className="size-4" />{saving ? (ar ? "جارٍ الحفظ…" : "Saving…") : (ar ? "حفظ إعدادات المؤسسة" : "Save organization settings")}</Button>
    </div>
  </form>;
}
