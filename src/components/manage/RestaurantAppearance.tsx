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
    <form onSubmit={save} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-6">
        <section className="panel space-y-6 p-4 sm:p-6">
          <div><h3 className="text-lg font-semibold">{ar ? "إعدادات المؤسسة" : "Organization Settings"}</h3><p className="mt-1 text-xs text-muted-foreground">{ar ? "خصص شعار وغلاف وهوية هذا المطعم فقط." : "Customize this restaurant's logo, cover, and identity only."}</p></div>
          <div className="grid gap-6 sm:grid-cols-2">
            <ImageUploader restaurantId={restaurant.id} kind="logo" value={form.logo_url} onChange={(v) => field("logo_url", v)} label={ar ? "شعار المؤسسة" : "Organization logo"} />
            <ImageUploader restaurantId={restaurant.id} kind="logo" value={brand.menuLogo} onChange={(v) => setBrand((p) => ({ ...p, menuLogo: v }))} label={ar ? "شعار قائمة الضيف" : "Guest menu logo"} />
            <div className="sm:col-span-2"><ImageUploader restaurantId={restaurant.id} kind="cover" aspect="wide" value={form.cover_image_url} onChange={(v) => field("cover_image_url", v)} label={ar ? "صورة الغلاف والرئيسية" : "Cover & home image"} /></div>
          </div>
        </section>

        <section className="panel space-y-5 p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h3 className="text-lg font-semibold">{ar ? "هوية تطبيق المطعم" : "Restaurant App Appearance"}</h3><p className="mt-1 text-xs text-muted-foreground">{ar ? "خلفيات منفصلة للوضع الفاتح والداكن داخل تطبيق الفريق والإدارة." : "Separate light and dark backgrounds for the restaurant admin/staff experience."}</p></div>
            <Button type="button" variant="outline" size="sm" onClick={resetWorkspaceTheme}><RotateCcw className="size-4" />{ar ? "إعادة الافتراضي" : "Restore defaults"}</Button>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">{([['primary_color','Primary','الأساسي'],['accent_color','Accent','التمييز'],['text_color','Text','النص']] as const).map(([key,en,arabic]) => <ColorField key={key} label={ar ? arabic : en} value={form[key]} onChange={(value) => field(key, value)} />)}</div>
          <div className="grid gap-4 md:grid-cols-2">
            <ColorField label={ar ? "خلفية الوضع الفاتح" : "Light mode background"} value={brand.lightBackground} icon={<Sun className="size-4" />} onChange={(value) => setBrand((p) => ({ ...p, lightBackground: value }))} />
            <ColorField label={ar ? "خلفية الوضع الداكن" : "Dark mode background"} value={brand.darkBackground} icon={<Moon className="size-4" />} onChange={(value) => setBrand((p) => ({ ...p, darkBackground: value }))} />
          </div>
        </section>

        <section className="panel overflow-hidden p-0">
          <div className="border-b border-border p-4 sm:p-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold">{ar ? "مظهر قائمة الضيف" : "Guest Menu Appearance"}</h3>
                  <span className="rounded-full bg-orange-500/10 px-2.5 py-1 text-[11px] font-bold text-[#ff5a0a]">{activeModeLabel}</span>
                </div>
                <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">{ar ? "بدّل بين الوضعين وشاهد النتيجة مباشرة. ألوان كل وضع محفوظة بشكل مستقل ولن تتغير عند تعديل الوضع الآخر." : "Switch modes and see the result instantly. Each mode keeps its own independent palette, so editing one never overwrites the other."}</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <MenuModeSwitch
                  value={brand.guestMenuMode}
                  ar={ar}
                  onChange={(mode) => setBrand((p) => ({ ...p, guestMenuMode: mode }))}
                />
                <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={resetGuestMenu}><RotateCcw className="size-4" />{ar ? "إعادة الافتراضي" : "Reset"}</Button>
              </div>
            </div>
          </div>

          <div className="grid gap-0 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,.75fr)]">
            <div className="border-b border-border bg-muted/20 p-4 sm:p-6 xl:border-b-0 xl:border-e">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div><p className="text-sm font-semibold">{ar ? "معاينة مباشرة" : "Live preview"}</p><p className="text-[11px] text-muted-foreground">{ar ? "هذه المعاينة تتغير فوراً مع الألوان المختارة." : "This preview updates immediately with your selected colors."}</p></div>
                <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold", brand.guestMenuMode === "dark" ? "bg-slate-900 text-white" : "border border-border bg-white text-slate-900")}>
                  {brand.guestMenuMode === "dark" ? <Moon className="size-3.5" /> : <Sun className="size-3.5" />}{activeModeLabel}
                </span>
              </div>
              <GuestMenuPreview
                mode={brand.guestMenuMode}
                palette={activePalette}
                logo={brand.menuLogo || form.logo_url}
                name={restaurant.name}
                ar={ar}
              />
            </div>

            <div className="space-y-5 p-4 sm:p-6">
              <div>
                <h4 className="text-sm font-semibold">{ar ? `تخصيص ${activeModeLabel}` : `Customize ${activeModeLabel}`}</h4>
                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{ar ? "عدّل ألوان الوضع المحدد فقط. يمكنك الانتقال للوضع الآخر في أي وقت بدون فقدان هذه الإعدادات." : "Edit only the selected mode. Switch to the other mode at any time without losing these settings."}</p>
              </div>
              <PaletteEditor
                ar={ar}
                palette={activePalette}
                onChange={(next) => setBrand((p) => brand.guestMenuMode === "dark" ? ({ ...p, guestMenuDark: next }) : ({ ...p, guestMenuLight: next }))}
              />
            </div>
          </div>
        </section>

        <section className="panel space-y-5 p-4 sm:p-6"><h3 className="text-lg font-semibold">{ar ? "الرئيسية ولوحة التحكم" : "Home & dashboard"}</h3>
          <label className="block space-y-2 text-sm"><span>{ar ? "عنوان الرئيسية" : "Home heading"}</span><Input maxLength={100} value={brand.homeTitle} placeholder={restaurant.name} onChange={(e) => setBrand((p) => ({ ...p, homeTitle: e.target.value }))} /></label>
          <label className="block space-y-2 text-sm"><span>{ar ? "عنوان لوحة التحكم" : "Dashboard heading"}</span><Input maxLength={100} value={brand.dashboardTitle} placeholder={restaurant.name} onChange={(e) => setBrand((p) => ({ ...p, dashboardTitle: e.target.value }))} /></label>
        </section>
      </div>

      <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
        <section className="panel space-y-4 p-5"><h3 className="font-semibold">{ar ? "نوع قائمة الضيف" : "Guest menu type"}</h3><p className="text-sm text-muted-foreground">{ar ? "اختر القائمة العادية أو PDF. تبقى البيانات منفصلة ومحفوظة." : "Choose Standard Menu or Clickable PDF. Both data sets remain separate and preserved."}</p>{(['pdf','products'] as const).map((mode) => <label key={mode} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm"><input type="radio" name="menuMode" checked={brand.menuMode === mode} onChange={() => setBrand((p) => ({ ...p, menuMode: mode }))} />{mode === 'pdf' ? (ar ? 'قائمة PDF التفاعلية' : 'Clickable PDF Menu') : (ar ? 'القائمة العادية' : 'Standard Menu')}</label>)}</section>
        <section className="panel space-y-4 p-5"><h3 className="font-semibold">{ar ? "الضرائب والخدمة" : "Tax & service"}</h3><label className="block space-y-2 text-sm"><span>{ar ? "الضريبة %" : "Tax %"}</span><Input required type="number" min="0" max="100" step="0.01" value={form.tax_rate} onChange={(e) => field('tax_rate', e.target.value)} /></label><label className="block space-y-2 text-sm"><span>{ar ? "الخدمة %" : "Service %"}</span><Input required type="number" min="0" max="100" step="0.01" value={form.service_charge} onChange={(e) => field('service_charge', e.target.value)} /></label></section>
        <div className="safe-bottom sticky bottom-0 z-20 -mx-1 rounded-2xl border border-border bg-background/95 p-2 shadow-lg backdrop-blur lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none"><Button className="min-h-12 w-full" disabled={saving}><Save className="size-4" />{saving ? (ar ? "جارٍ الحفظ…" : "Saving…") : (ar ? "حفظ الإعدادات" : "Save Settings")}</Button></div>
      </aside>
    </form>
  );
}

function ColorField({ label, value, onChange, icon }: { label: string; value: string; onChange: (value: string) => void; icon?: ReactNode }) {
  return <label className="space-y-2 text-sm"><span className="flex items-center gap-2 font-semibold">{icon}{label}</span><div className="flex gap-2"><Input type="color" className="h-12 w-16 cursor-pointer p-1" value={value} onChange={(e) => onChange(e.target.value)} /><Input value={value} onChange={(e) => /^#[0-9a-fA-F]{0,6}$/.test(e.target.value) && onChange(e.target.value)} /></div></label>;
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
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">{fields.map(([key, en, arabic]) => <ColorField key={key} label={ar ? arabic : en} value={palette[key]} onChange={(value) => onChange({ ...palette, [key]: value })} />)}</div>;
}

function MenuModeSwitch({ value, ar, onChange }: { value: "light" | "dark"; ar: boolean; onChange: (mode: "light" | "dark") => void }) {
  return (
    <div className="grid min-h-11 grid-cols-2 rounded-xl border border-border bg-muted/60 p-1" role="group" aria-label={ar ? "وضع قائمة الضيف" : "Guest menu color mode"}>
      <button
        type="button"
        aria-pressed={value === "light"}
        onClick={() => onChange("light")}
        className={cn("inline-flex min-w-[112px] items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition-all", value === "light" ? "bg-white text-slate-950 shadow-sm ring-1 ring-black/5" : "text-muted-foreground hover:text-foreground")}
      >
        <Sun className="size-4" />{ar ? "فاتح" : "Light"}{value === "light" ? <Check className="size-3.5 text-[#ff5a0a]" /> : null}
      </button>
      <button
        type="button"
        aria-pressed={value === "dark"}
        onClick={() => onChange("dark")}
        className={cn("inline-flex min-w-[112px] items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition-all", value === "dark" ? "bg-slate-950 text-white shadow-sm ring-1 ring-white/10" : "text-muted-foreground hover:text-foreground")}
      >
        <Moon className="size-4" />{ar ? "داكن" : "Dark"}{value === "dark" ? <Check className="size-3.5 text-[#ff5a0a]" /> : null}
      </button>
    </div>
  );
}

function GuestMenuPreview({ mode, palette, logo, name, ar }: { mode: "light" | "dark"; palette: GuestMenuPalette; logo: string | null; name: string; ar: boolean }) {
  return (
    <div className="mx-auto w-full max-w-[620px] overflow-hidden rounded-[26px] border border-black/10 shadow-[0_24px_60px_rgba(0,0,0,.16)] transition-colors duration-200" style={{ backgroundColor: palette.bg, color: palette.text }}>
      <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: `${palette.muted}28`, backgroundColor: palette.surface }}>
        <div className="flex min-w-0 items-center gap-3">
          {logo ? <img src={logo} alt="" className="size-11 shrink-0 rounded-xl bg-white object-contain p-1.5 shadow-sm" /> : <span className="grid size-11 shrink-0 place-items-center rounded-xl font-bold" style={{ backgroundColor: palette.primary, color: palette.primaryText }}>{name.slice(0, 1)}</span>}
          <div className="min-w-0"><strong className="block truncate text-sm">{name}</strong><span className="text-[11px]" style={{ color: palette.muted }}>{ar ? "قائمة الطعام" : "Guest Menu"}</span></div>
        </div>
        <span className="rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ backgroundColor: `${palette.primary}18`, color: palette.primary }}>{mode === "dark" ? (ar ? "داكن" : "Dark") : (ar ? "فاتح" : "Light")}</span>
      </div>

      <div className="p-4 sm:p-5">
        <div className="no-scrollbar flex gap-2 overflow-hidden">
          {[ar ? "الأكثر طلباً" : "Popular", ar ? "وجبات" : "Meals", ar ? "مشروبات" : "Drinks"].map((label, index) => <span key={label} className="shrink-0 rounded-full px-3 py-1.5 text-[10px] font-bold" style={index === 0 ? { backgroundColor: palette.primary, color: palette.primaryText } : { backgroundColor: palette.surface, color: palette.muted }}>{label}</span>)}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <PreviewDish palette={palette} title={ar ? "وجبة مميزة" : "Signature Meal"} subtitle={ar ? "وصف قصير وواضح للمنتج" : "A short, clear product description"} price="JOD 4.50" />
          <PreviewDish palette={palette} title={ar ? "اختيار الشيف" : "Chef's Choice"} subtitle={ar ? "طازج ومحضر عند الطلب" : "Fresh and made to order"} price="JOD 5.25" showButton />
        </div>

        <div className="mt-4 flex items-center justify-between rounded-2xl p-3" style={{ backgroundColor: palette.surface }}>
          <div><strong className="block text-xs">{ar ? "جاهز للطلب؟" : "Ready to order?"}</strong><span className="text-[10px]" style={{ color: palette.muted }}>{ar ? "أضف اختياراتك إلى السلة" : "Add your favorites to the cart"}</span></div>
          <button type="button" tabIndex={-1} className="rounded-xl px-3 py-2 text-[10px] font-bold" style={{ backgroundColor: palette.primary, color: palette.primaryText }}>{ar ? "عرض السلة" : "View cart"}</button>
        </div>
      </div>
    </div>
  );
}

function PreviewDish({ palette, title, subtitle, price, showButton = false }: { palette: GuestMenuPalette; title: string; subtitle: string; price: string; showButton?: boolean }) {
  return (
    <div className="overflow-hidden rounded-2xl" style={{ backgroundColor: palette.surface }}>
      <div className="h-24" style={{ background: `linear-gradient(135deg, ${palette.primary}24, ${palette.accent}45)` }} />
      <div className="p-3">
        <strong className="block text-xs">{title}</strong>
        <span className="mt-1 block text-[10px] leading-4" style={{ color: palette.muted }}>{subtitle}</span>
        <div className="mt-3 flex items-center justify-between gap-2"><span className="text-xs font-bold" style={{ color: palette.accent }}>{price}</span>{showButton ? <button type="button" tabIndex={-1} className="rounded-lg px-2.5 py-1.5 text-[9px] font-bold" style={{ backgroundColor: palette.primary, color: palette.primaryText }}>+</button> : null}</div>
      </div>
    </div>
  );
}
