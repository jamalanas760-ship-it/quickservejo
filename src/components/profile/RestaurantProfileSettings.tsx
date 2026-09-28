import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BookOpenText, ChevronDown, ChevronUp, FileText, LayoutPanelLeft, Plus, RotateCcw, Save, SlidersHorizontal, X } from "lucide-react";
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

const SIDEBAR_TOOL_CHOICES = [
  { key: "orders", en: "Orders", ar: "الطلبات" },
  { key: "reservations", en: "Reservations", ar: "الحجوزات" },
  { key: "menu", en: "Menu", ar: "القائمة" },
  { key: "tables", en: "Tables", ar: "الطاولات" },
  { key: "my-work", en: "My Work", ar: "عملي" },
  { key: "shifts", en: "Shifts", ar: "الورديات" },
  { key: "automation", en: "Automation", ar: "الأتمتة" },
  { key: "erp", en: "ERP", ar: "ERP" },
  { key: "analytics", en: "Analytics", ar: "التحليلات" },
  { key: "daily-close", en: "Daily Close", ar: "إقفال اليوم" },
  { key: "team", en: "Team", ar: "الفريق" },
  { key: "guests", en: "Guests", ar: "الضيوف" },
  { key: "campaigns", en: "Campaigns", ar: "الحملات" },
  { key: "connect", en: "Connect", ar: "التكاملات" },
  { key: "devices", en: "Devices", ar: "الأجهزة" },
] as const;
const DEFAULT_SIDEBAR_TOOLS = ["orders","reservations","menu","team","analytics"] as const;

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
  const pinnedSidebarTools = brand.sidebarPinnedTools;
  const sidebarPool = SIDEBAR_TOOL_CHOICES.filter((item) => !pinnedSidebarTools.includes(item.key));
  const sidebarLabel = (key: string) => {
    const item = SIDEBAR_TOOL_CHOICES.find((choice) => choice.key === key);
    return item ? (ar ? item.ar : item.en) : key;
  };
  const setPinnedSidebarTools = (items: string[]) => setBrand((current) => ({ ...current, sidebarPinnedTools: items.slice(0, 5) }));
  const addSidebarTool = (key: string) => {
    if (pinnedSidebarTools.includes(key) || pinnedSidebarTools.length >= 5) return;
    setPinnedSidebarTools([...pinnedSidebarTools, key]);
  };
  const removeSidebarTool = (key: string) => setPinnedSidebarTools(pinnedSidebarTools.filter((item) => item !== key));
  const moveSidebarTool = (index: number, direction: -1 | 1) => {
    const next = [...pinnedSidebarTools];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    const currentValue = next[index];
    const targetValue = next[target];
    if (!currentValue || !targetValue) return;
    next[index] = targetValue;
    next[target] = currentValue;
    setPinnedSidebarTools(next);
  };

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
              <span className="qs-interface-card-swatch" style={brand.standardMenuCardImage ? { backgroundImage: `url(${brand.standardMenuCardImage})` } : undefined}><i className="qs-interface-card-system-icon"><BookOpenText className="size-4" strokeWidth={1.9} /></i></span>
              <span className="qs-interface-card-swatch" style={brand.pdfMenuCardImage ? { backgroundImage: `url(${brand.pdfMenuCardImage})` } : undefined}><i className="qs-interface-card-system-icon"><FileText className="size-4" strokeWidth={1.9} /></i></span>
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="qs-interface-upload-group">
              <div className="mb-2 flex items-center gap-2"><span className="qs-fixed-menu-icon"><BookOpenText className="size-4" strokeWidth={1.9} /></span><strong className="!mb-0">{ar ? "القائمة العادية" : "Standard Menu"}</strong></div>
              <ImageUploader restaurantId={restaurant.id} kind="cover" aspect="wide" value={brand.standardMenuCardImage} onChange={(value) => setBrand((current) => ({ ...current, standardMenuCardImage: value }))} label={ar ? "صورة البطاقة" : "Card image"} />
              <p className="mt-2 text-[9px] leading-4 text-muted-foreground">{ar ? "الأيقونة ثابتة من نظام QuickServe وتتبع لون النمط تلقائياً." : "The icon is fixed by QuickServe and automatically follows the active system color."}</p>
            </div>
            <div className="qs-interface-upload-group">
              <div className="mb-2 flex items-center gap-2"><span className="qs-fixed-menu-icon"><FileText className="size-4" strokeWidth={1.9} /></span><strong className="!mb-0">{ar ? "قائمة PDF" : "PDF Menu"}</strong></div>
              <ImageUploader restaurantId={restaurant.id} kind="cover" aspect="wide" value={brand.pdfMenuCardImage} onChange={(value) => setBrand((current) => ({ ...current, pdfMenuCardImage: value }))} label={ar ? "صورة البطاقة" : "Card image"} />
              <p className="mt-2 text-[9px] leading-4 text-muted-foreground">{ar ? "الأيقونة ثابتة من نظام QuickServe وتتبع لون النمط تلقائياً." : "The icon is fixed by QuickServe and automatically follows the active system color."}</p>
            </div>
          </div>
        </section>
      </div>

      <section className="qs-sidebar-customizer mt-4">
        <div className="qs-sidebar-customizer-head">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><LayoutPanelLeft className="size-4" /></span>
            <div>
              <strong>{ar ? "تخصيص التنقل" : "Customize navigation"}</strong>
              <p>{ar ? "الرئيسية تبقى دائماً أول عنصر. اختر حتى 5 أدوات للقائمة الجانبية؛ شريط الموبايل يعكس نفس الترتيب ويعرض أول 4 أدوات بعد الرئيسية، والباقي يبقى في All tools." : "Home always stays first. Choose up to 5 sidebar tools; mobile mirrors the same order and shows the first 4 after Home, while everything else stays in All tools."}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="qs-sidebar-count">{pinnedSidebarTools.length}/5</span>
            <button type="button" className="qs-sidebar-reset" onClick={() => setPinnedSidebarTools([...DEFAULT_SIDEBAR_TOOLS])}><RotateCcw className="size-3.5" />{ar ? "افتراضي ذكي" : "Smart default"}</button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="qs-sidebar-bucket">
            <div className="qs-sidebar-bucket-title"><span>{ar ? "في القائمة الجانبية" : "In sidebar"}</span><small>{ar ? "الترتيب الظاهر" : "Visible order"}</small></div>
            <div className="space-y-2">
              {pinnedSidebarTools.length ? pinnedSidebarTools.map((key, index) => <div key={key} className="qs-sidebar-tool-row is-pinned">
                <span className="qs-sidebar-tool-index">{index + 2}</span>
                <strong>{sidebarLabel(key)}</strong>
                <div className="ms-auto flex items-center gap-1">
                  <button type="button" aria-label={ar ? "تحريك للأعلى" : "Move up"} disabled={index === 0} onClick={() => moveSidebarTool(index, -1)}><ChevronUp className="size-3.5" /></button>
                  <button type="button" aria-label={ar ? "تحريك للأسفل" : "Move down"} disabled={index === pinnedSidebarTools.length - 1} onClick={() => moveSidebarTool(index, 1)}><ChevronDown className="size-3.5" /></button>
                  <button type="button" aria-label={ar ? "إزالة من القائمة الجانبية" : "Remove from sidebar"} onClick={() => removeSidebarTool(key)}><X className="size-3.5" /></button>
                </div>
              </div>) : <div className="qs-sidebar-empty">{ar ? "لم تختر أدوات بعد. ستستخدم QuickServe الترتيب الذكي الحالي حتى تختار." : "No custom tools selected yet. QuickServe keeps the current smart order until you choose."}</div>}
            </div>
          </div>

          <div className="qs-sidebar-bucket">
            <div className="qs-sidebar-bucket-title"><span>{ar ? "تبقى في All tools" : "Still in All tools"}</span><small>{ar ? "أضف أي أداة بنقرة" : "Add with one click"}</small></div>
            <div className="grid gap-2 sm:grid-cols-2">
              {sidebarPool.map((item) => <button key={item.key} type="button" className="qs-sidebar-pool-item" disabled={pinnedSidebarTools.length >= 5} onClick={() => addSidebarTool(item.key)}>
                <span>{ar ? item.ar : item.en}</span><Plus className="size-3.5" />
              </button>)}
            </div>
          </div>
        </div>

        <div className="qs-sidebar-preview-strip">
          <span className="qs-sidebar-preview-home">1 · {ar ? "الرئيسية" : "Home"}</span>
          {pinnedSidebarTools.map((key, index) => <span key={key}>{index + 2} · {sidebarLabel(key)}</span>)}
          <span className="qs-sidebar-preview-mobile">{ar ? "الموبايل: أول 4" : "Mobile: first 4"}</span>
          <span className="qs-sidebar-preview-more">{ar ? "الباقي → All tools" : "Rest → All tools"}</span>
        </div>
      </section>
    </section>

    <section className="qs-card p-4 sm:p-6">
      <ApplicationColorStudio ar={ar} restaurantName={restaurant.name} brand={brand} setBrand={setBrand} primaryColor={form.primary_color} accentColor={form.accent_color} setPrimaryColor={(value) => field("primary_color", value)} setAccentColor={(value) => field("accent_color", value)} />
    </section>

    <div className="qs-settings-savebar">
      <div><strong>{ar?"التغييرات تطبق على مساحة المطعم":"Changes apply to this restaurant workspace"}</strong><p>{ar?"راجع الشعار والألوان ثم احفظ مرة واحدة.":"Review the logo and colors, then save everything together."}</p></div>
      <Button type="submit" disabled={saving} className="min-h-11 bg-primary px-5 text-primary-foreground shadow-md hover:opacity-90"><Save className="size-4" />{saving ? (ar ? "جارٍ الحفظ…" : "Saving…") : (ar ? "حفظ إعدادات المؤسسة" : "Save organization settings")}</Button>
    </div>
  </form>;
}
