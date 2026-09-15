import { useState, type FormEvent, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Moon, RotateCcw, Save, Sun } from "lucide-react";
import { toast } from "sonner";
import { useRestaurant, type RestaurantRow } from "@/hooks/useSuperAdmin";
import { useAccess } from "@/hooks/useSession";
import { useI18n } from "@/lib/i18n";
import { guestMenuPaletteDefaults, readAppearance, type GuestMenuPalette } from "@/lib/restaurant-appearance";
import { humanError } from "@/lib/errors";
import { supabase } from "@/integrations/supabase/client";
import { ImageUploader } from "@/components/media/ImageUploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

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

  function resetWorkspaceTheme() {
    setBrand((prev) => ({ ...prev, lightBackground: "#ffffff", darkBackground: "#11171b" }));
    setForm((prev) => ({ ...prev, primary_color: "#ff5a0a", accent_color: "#111111", background_color: "#ffffff", text_color: "#111111" }));
  }

  function resetGuestMenu() {
    setBrand((prev) => ({
      ...prev,
      guestMenuMode: "light",
      guestMenuLight: { ...guestMenuPaletteDefaults.light },
      guestMenuDark: { ...guestMenuPaletteDefaults.dark },
    }));
  }

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
      const guest = brand.guestMenuMode === "dark" ? brand.guestMenuDark : brand.guestMenuLight;
      const menuTheme = {
        ...theme,
        ...guest,
        template: brand.guestMenuMode === "dark" ? "midnight" : "classic",
        bodyFont: "sans",
        headingFont: "sans",
        layout: "list",
        hero: "cover",
        radius: 16,
        showImages: true,
        imageShape: "rounded",
        showIcons: false,
        buttonStyle: "solid",
        cardStyle: "elevated",
        bgStyle: "solid",
        density: "comfortable",
        animation: "fade",
        texture: "none",
        decor: "none",
        sectionStyle: "plain",
        priceStyle: "right",
        columns: 1,
        upperTitles: false,
        scriptAccent: false,
        workspace: { ...brand },
      };

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
      toast.success(ar ? "تم حفظ إعدادات المؤسسة والقائمة" : "Organization and guest menu settings saved");
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setSaving(false);
    }
  }

  const activePalette = brand.guestMenuMode === "dark" ? brand.guestMenuDark : brand.guestMenuLight;
  const activeModeLabel = brand.guestMenuMode === "dark" ? (ar ? "الوضع الداكن" : "Dark mode") : (ar ? "الوضع الفاتح" : "Light mode");

  return (
    <form onSubmit={save} className="grid min-w-0 gap-6 2xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-6">
        <section className="panel space-y-6 p-4 sm:p-6">
          <div><h3 className="text-lg font-semibold">{ar ? "إعدادات المؤسسة" : "Organization Settings"}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{ar ? "خصص شعار وغلاف وهوية هذا المطعم فقط." : "Customize this restaurant's logo, cover, and identity only."}</p></div>
          <div className="grid gap-6 lg:grid-cols-2">
            <ImageUploader restaurantId={restaurant.id} kind="logo" value={form.logo_url} onChange={(v) => field("logo_url", v)} label={ar ? "شعار المؤسسة" : "Organization logo"} />
            <ImageUploader restaurantId={restaurant.id} kind="logo" value={brand.menuLogo} onChange={(v) => setBrand((p) => ({ ...p, menuLogo: v }))} label={ar ? "شعار قائمة الضيف" : "Guest menu logo"} />
            <div className="lg:col-span-2"><ImageUploader restaurantId={restaurant.id} kind="cover" aspect="wide" value={form.cover_image_url} onChange={(v) => field("cover_image_url", v)} label={ar ? "صورة الغلاف والرئيسية" : "Cover & home image"} /></div>
          </div>
        </section>

        <section className="panel space-y-6 p-4 sm:p-6">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
            <div className="min-w-0"><h3 className="text-lg font-semibold">{ar ? "هوية تطبيق المطعم" : "Restaurant App Appearance"}</h3><p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">{ar ? "خلفيات منفصلة للوضع الفاتح والداكن داخل تطبيق الفريق والإدارة." : "Separate light and dark backgrounds for the restaurant admin/staff experience."}</p></div>
            <Button type="button" variant="outline" size="sm" className="w-fit whitespace-nowrap" onClick={resetWorkspaceTheme}><RotateCcw className="size-4" />{ar ? "إعادة الافتراضي" : "Restore defaults"}</Button>
          </div>

          <div className="grid min-w-0 gap-4 xl:grid-cols-3">
            {([['primary_color','Primary','الأساسي'],['accent_color','Accent','التمييز'],['text_color','Text','النص']] as const).map(([key,en,arabic]) => <ColorField key={key} label={ar ? arabic : en} value={form[key]} onChange={(value) => field(key, value)} />)}
          </div>
          <div className="grid min-w-0 gap-4 xl:grid-cols-2">
            <ColorField label={ar ? "خلفية الوضع الفاتح" : "Light mode background"} value={brand.lightBackground} icon={<Sun className="size-4" />} onChange={(value) => setBrand((p) => ({ ...p, lightBackground: value }))} />
            <ColorField label={ar ? "خلفية الوضع الداكن" : "Dark mode background"} value={brand.darkBackground} icon={<Moon className="size-4" />} onChange={(value) => setBrand((p) => ({ ...p, darkBackground: value }))} />
          </div>
        </section>

        <section className="panel overflow-hidden p-0">
          <div className="border-b border-border p-4 sm:p-6">
            <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-semibold">{ar ? "مظهر قائمة الضيف" : "Guest Menu Appearance"}</h3><span className="shrink-0 rounded-full bg-orange-500/10 px-2.5 py-1 text-[11px] font-bold text-[#ff5a0a]">{activeModeLabel}</span></div>
                <p className="mt-2 max-w-2xl text-xs leading-5 text-muted-foreground">{ar ? "ألوان الوضع الفاتح والداكن محفوظة بشكل مستقل. اختر الوضع ثم عدّل ألوانه بدون التأثير على الوضع الآخر." : "Light and dark palettes are stored independently. Choose a mode, then edit its colors without affecting the other mode."}</p>
              </div>
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                <MenuModeSwitch value={brand.guestMenuMode} ar={ar} onChange={(mode) => setBrand((p) => ({ ...p, guestMenuMode: mode }))} />
                <Button type="button" variant="outline" size="sm" className="min-h-11 shrink-0 whitespace-nowrap" onClick={resetGuestMenu}><RotateCcw className="size-4" />{ar ? "إعادة الافتراضي" : "Reset"}</Button>
              </div>
            </div>
          </div>

          <div className="min-w-0 p-4 sm:p-6">
            <div className="mb-5"><h4 className="text-sm font-semibold">{ar ? `تخصيص ${activeModeLabel}` : `Customize ${activeModeLabel}`}</h4><p className="mt-1 max-w-2xl text-[11px] leading-5 text-muted-foreground">{ar ? "عدّل ألوان الوضع المحدد. يمكنك التبديل بين الوضعين في أي وقت بدون فقدان الإعدادات." : "Edit the selected palette. You can switch modes at any time without losing either set of colors."}</p></div>
            <PaletteEditor ar={ar} palette={activePalette} onChange={(next) => setBrand((p) => brand.guestMenuMode === "dark" ? ({ ...p, guestMenuDark: next }) : ({ ...p, guestMenuLight: next }))} />
          </div>
        </section>

        <section className="panel space-y-5 p-4 sm:p-6"><h3 className="text-lg font-semibold">{ar ? "الرئيسية ولوحة التحكم" : "Home & dashboard"}</h3><label className="block space-y-2 text-sm"><span>{ar ? "عنوان الرئيسية" : "Home heading"}</span><Input maxLength={100} value={brand.homeTitle} placeholder={restaurant.name} onChange={(e) => setBrand((p) => ({ ...p, homeTitle: e.target.value }))} /></label><label className="block space-y-2 text-sm"><span>{ar ? "عنوان لوحة التحكم" : "Dashboard heading"}</span><Input maxLength={100} value={brand.dashboardTitle} placeholder={restaurant.name} onChange={(e) => setBrand((p) => ({ ...p, dashboardTitle: e.target.value }))} /></label></section>
      </div>

      <aside className="min-w-0 space-y-5 2xl:sticky 2xl:top-24 2xl:self-start">
        <section className="panel space-y-4 p-5"><h3 className="font-semibold">{ar ? "نوع قائمة الضيف" : "Guest menu type"}</h3><p className="text-sm leading-6 text-muted-foreground">{ar ? "اختر القائمة العادية أو PDF. تبقى البيانات منفصلة ومحفوظة." : "Choose Standard Menu or Clickable PDF. Both data sets remain separate and preserved."}</p>{(['pdf','products'] as const).map((mode) => <label key={mode} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm"><input type="radio" name="menuMode" checked={brand.menuMode === mode} onChange={() => setBrand((p) => ({ ...p, menuMode: mode }))} /><span>{mode === 'pdf' ? (ar ? 'قائمة PDF التفاعلية' : 'Clickable PDF Menu') : (ar ? 'القائمة العادية' : 'Standard Menu')}</span></label>)}</section>
        <section className="panel space-y-4 p-5"><h3 className="font-semibold">{ar ? "الضرائب والخدمة" : "Tax & service"}</h3><label className="block space-y-2 text-sm"><span>{ar ? "الضريبة %" : "Tax %"}</span><Input required type="number" min="0" max="100" step="0.01" value={form.tax_rate} onChange={(e) => field('tax_rate', e.target.value)} /></label><label className="block space-y-2 text-sm"><span>{ar ? "الخدمة %" : "Service %"}</span><Input required type="number" min="0" max="100" step="0.01" value={form.service_charge} onChange={(e) => field('service_charge', e.target.value)} /></label></section>
        <div className="safe-bottom sticky bottom-0 z-20 -mx-1 rounded-2xl border border-border bg-background/95 p-2 shadow-lg backdrop-blur 2xl:static 2xl:mx-0 2xl:border-0 2xl:bg-transparent 2xl:p-0 2xl:shadow-none"><Button className="min-h-12 w-full whitespace-nowrap" disabled={saving}><Save className="size-4" />{saving ? (ar ? "جارٍ الحفظ…" : "Saving…") : (ar ? "حفظ الإعدادات" : "Save Settings")}</Button></div>
      </aside>
    </form>
  );
}

function ColorField({ label, value, onChange, icon }: { label: string; value: string; onChange: (value: string) => void; icon?: ReactNode }) {
  return (
    <label className="min-w-0 space-y-2 text-sm">
      <span className="flex min-h-5 items-center gap-2 font-semibold leading-5">{icon}{label}</span>
      <div className="grid min-w-0 grid-cols-[48px_minmax(0,1fr)] gap-2">
        <Input type="color" className="h-12 w-12 cursor-pointer p-1" value={value} onChange={(e) => onChange(e.target.value)} />
        <Input className="h-12 min-w-0 w-full font-mono text-sm" value={value} onChange={(e) => /^#[0-9a-fA-F]{0,6}$/.test(e.target.value) && onChange(e.target.value)} />
      </div>
    </label>
  );
}

function PaletteEditor({ ar, palette, onChange }: { ar: boolean; palette: GuestMenuPalette; onChange: (palette: GuestMenuPalette) => void }) {
  const fields: Array<[keyof GuestMenuPalette, string, string]> = [
    ["bg", "Page background", "خلفية الصفحة"],
    ["surface", "Cards / surface", "البطاقات"],
    ["text", "Heading / text", "العناوين والنص"],
    ["muted", "Muted text", "النص الثانوي"],
    ["primary", "Buttons / primary", "الأزرار واللون الأساسي"],
    ["accent", "Price / accent", "السعر والتمييز"],
  ];
  return <div className="grid min-w-0 gap-4 md:grid-cols-2">{fields.map(([key, en, arabic]) => <ColorField key={key} label={ar ? arabic : en} value={palette[key]} onChange={(value) => onChange({ ...palette, [key]: value })} />)}</div>;
}

function MenuModeSwitch({ value, ar, onChange }: { value: "light" | "dark"; ar: boolean; onChange: (mode: "light" | "dark") => void }) {
  return (
    <div className="grid min-h-11 min-w-0 flex-1 grid-cols-2 rounded-xl border border-border bg-muted/60 p-1 sm:min-w-[230px]" role="group" aria-label={ar ? "وضع قائمة الضيف" : "Guest menu color mode"}>
      <button type="button" aria-pressed={value === "light"} onClick={() => onChange("light")} className={cn("inline-flex min-w-0 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition-all", value === "light" ? "bg-white text-slate-950 shadow-sm ring-1 ring-black/5" : "text-muted-foreground hover:text-foreground")}><Sun className="size-4 shrink-0" /><span className="truncate">{ar ? "فاتح" : "Light"}</span>{value === "light" ? <Check className="size-3.5 shrink-0 text-[#ff5a0a]" /> : null}</button>
      <button type="button" aria-pressed={value === "dark"} onClick={() => onChange("dark")} className={cn("inline-flex min-w-0 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition-all", value === "dark" ? "bg-slate-950 text-white shadow-sm ring-1 ring-white/10" : "text-muted-foreground hover:text-foreground")}><Moon className="size-4 shrink-0" /><span className="truncate">{ar ? "داكن" : "Dark"}</span>{value === "dark" ? <Check className="size-3.5 shrink-0 text-[#ff5a0a]" /> : null}</button>
    </div>
  );
}