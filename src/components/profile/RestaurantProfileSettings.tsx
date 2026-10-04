import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  BookOpenText,
  ChevronDown,
  ChevronUp,
  FileText,
  LayoutPanelLeft,
  Plus,
  RotateCcw,
  Save,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  AppearancePreferences,
  LanguagePreference,
} from "@/components/profile/AppearancePreferences";
import { ProfileSwitch } from "@/components/profile/NotificationSettings";
import { ApplicationColorStudio } from "@/components/manage/ApplicationColorStudio";
import { ImageUploader } from "@/components/media/ImageUploader";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
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
const DEFAULT_SIDEBAR_TOOLS = ["orders", "reservations", "menu", "team", "analytics"] as const;

export function RestaurantProfileSettings({ restaurantId }: { restaurantId: string }) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const access = useAccess();
  const restaurant = useRestaurant(restaurantId);
  const qc = useQueryClient();
  const canEdit =
    access.isSuperAdmin || access.membershipFor(restaurantId)?.role === "restaurant_admin";

  if (restaurant.isPending || access.isPending)
    return <Skeleton className="h-[520px] rounded-2xl" />;
  if (!canEdit || !restaurant.data) return null;

  const item = restaurant.data;
  return (
    <RestaurantProfileSettingsForm
      key={`${restaurantId}:${item.updated_at}`}
      restaurant={item}
      ar={ar}
      lang={lang}
      qc={qc}
    />
  );
}

function RestaurantProfileSettingsForm({
  restaurant,
  ar,
  lang,
  qc,
}: {
  restaurant: any;
  ar: boolean;
  lang: "ar" | "en";
  qc: ReturnType<typeof useQueryClient>;
}) {
  const [brand, setBrand] = useState(() => readAppearance(restaurant.menu_theme));
  const [form, setForm] = useState({
    name: restaurant.name as string,
    timezone: restaurant.timezone as string,
    logo_url: restaurant.logo_url as string | null,
    cover_image_url: restaurant.cover_image_url as string | null,
    primary_color: restaurant.primary_color as string,
    accent_color: restaurant.accent_color as string,
  });
  const [saving, setSaving] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const field = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const pinnedSidebarTools = brand.sidebarPinnedTools;
  const sidebarPool = SIDEBAR_TOOL_CHOICES.filter((item) => !pinnedSidebarTools.includes(item.key));
  const sidebarLabel = (key: string) => {
    const item = SIDEBAR_TOOL_CHOICES.find((choice) => choice.key === key);
    return item ? (ar ? item.ar : item.en) : key;
  };
  const setPinnedSidebarTools = (items: string[]) =>
    setBrand((current) => ({ ...current, sidebarPinnedTools: items.slice(0, 5) }));
  const addSidebarTool = (key: string) => {
    if (pinnedSidebarTools.includes(key) || pinnedSidebarTools.length >= 5) return;
    setPinnedSidebarTools([...pinnedSidebarTools, key]);
  };
  const removeSidebarTool = (key: string) =>
    setPinnedSidebarTools(pinnedSidebarTools.filter((item) => item !== key));
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
      const current = await supabase
        .from("restaurants")
        .select("menu_theme")
        .eq("id", restaurant.id)
        .single();
      if (current.error) throw current.error;
      const theme =
        current.data.menu_theme &&
        typeof current.data.menu_theme === "object" &&
        !Array.isArray(current.data.menu_theme)
          ? (current.data.menu_theme as Record<string, unknown>)
          : {};
      const workspace =
        theme.workspace && typeof theme.workspace === "object" && !Array.isArray(theme.workspace)
          ? (theme.workspace as Record<string, unknown>)
          : {};
      const menuTheme = { ...theme, workspace: { ...workspace, ...brand } };
      const { data, error } = await supabase
        .from("restaurants")
        .update({
          name: form.name.trim(),
          timezone: form.timezone,
          logo_url: form.logo_url,
          cover_image_url: form.cover_image_url,
          primary_color: form.primary_color,
          accent_color: form.accent_color,
          background_color: brand.lightBackground,
          menu_theme: menuTheme,
        })
        .eq("id", restaurant.id)
        .select("id")
        .single();
      if (error) throw error;
      if (!data) throw new Error("No organization settings were updated");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["platform"] }),
        qc.invalidateQueries({ queryKey: ["staff", "memberships"] }),
        qc.invalidateQueries({ queryKey: ["diner"] }),
        qc.invalidateQueries({ queryKey: ["pdf-diner"] }),
      ]);
      toast.success(
        ar ? "تم حفظ إعدادات المؤسسة والمظهر" : "Organization and appearance settings saved",
      );
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setSaving(false);
    }
  }

  const colors = ["#ff5a1f", "#ef4444", "#287de8", "#16a56d", "#7c4dc4", "#e85a93"];
  const validColor = /^#[0-9a-f]{6}$/i.test(form.primary_color);
  const zones = Array.from(
    new Set([
      form.timezone,
      "Asia/Amman",
      "Asia/Riyadh",
      "Asia/Dubai",
      "Asia/Beirut",
      "Europe/London",
      "America/New_York",
      "UTC",
    ]),
  );
  return (
    <form
      id="organization-settings-form"
      onSubmit={save}
      className="ps-organization-form space-y-4"
    >
      <div className="ps-org-grid">
        <section className="ps-card ps-org-identity">
          <h2>{ar ? "تفاصيل المطعم" : "Restaurant details"}</h2>
          <div className="ps-upload-logo">
            <ImageUploader
              restaurantId={restaurant.id}
              kind="logo"
              value={form.logo_url}
              onChange={(value) => field("logo_url", value)}
              label={ar ? "شعار المطعم" : "Restaurant logo"}
              retainRemovedFile
            />
          </div>
          <label className="ps-field">
            {ar ? "اسم المطعم" : "Restaurant name"}
            <input
              required
              maxLength={120}
              value={form.name}
              onChange={(event) => field("name", event.target.value)}
            />
          </label>
          <div className="ps-upload-cover">
            <ImageUploader
              restaurantId={restaurant.id}
              kind="cover"
              aspect="wide"
              value={form.cover_image_url}
              onChange={(value) => field("cover_image_url", value)}
              label={ar ? "غلاف المطعم" : "Restaurant cover"}
              retainRemovedFile
            />
          </div>
          <div className="ps-preference !border-0 !p-0">
            <div>
              <strong>{ar ? "استخدام شعار المؤسسة" : "Use organization logo"}</strong>
              <p>
                {ar
                  ? "فعّله لإظهار شعار مطعمك في مساحة العمل."
                  : "Show your restaurant logo throughout the workspace."}
              </p>
            </div>
            <ProfileSwitch
              label={ar ? "استخدام شعار المؤسسة" : "Use organization logo"}
              checked={!brand.useQuickServeLogo}
              onChange={(value) =>
                setBrand((current) => ({ ...current, useQuickServeLogo: !value }))
              }
            />
          </div>
        </section>
        <div className="ps-org-right">
          <section className="ps-card">
            <h2>{ar ? "المظهر" : "Appearance"}</h2>
            <p className="mt-1">
              {ar
                ? "اختر مظهر التطبيق على هذا الجهاز."
                : "Choose how the app looks on this device."}
            </p>
            <AppearancePreferences ar={ar} />
            <h3>{ar ? "لون الهوية" : "Brand color"}</h3>
            <div className="ps-colors">
              {colors.map((color) => (
                <button
                  type="button"
                  className="ps-swatch"
                  key={color}
                  aria-label={`${ar ? "لون" : "Brand color"} ${color}`}
                  aria-pressed={form.primary_color.toLowerCase() === color}
                  style={{ background: color }}
                  onClick={() => field("primary_color", color)}
                />
              ))}
              <label className="ps-color-input">
                <input
                  type="color"
                  aria-label={ar ? "لون مخصص" : "Custom brand color"}
                  value={validColor ? form.primary_color : "#ff5a1f"}
                  onChange={(event) => field("primary_color", event.target.value)}
                />
                <input
                  type="text"
                  aria-label={ar ? "رمز اللون" : "Brand color hex"}
                  pattern="#[0-9a-fA-F]{6}"
                  required
                  value={form.primary_color}
                  onChange={(event) => field("primary_color", event.target.value)}
                  maxLength={7}
                />
              </label>
            </div>
          </section>
          <section className="ps-card">
            <h2>{ar ? "الإعدادات الإقليمية" : "Regional settings"}</h2>
            <div className="ps-regional">
              <LanguagePreference ar={ar} />
              <label className="ps-field">
                {ar ? "المنطقة الزمنية" : "Time zone"}
                <select
                  aria-label={ar ? "المنطقة الزمنية" : "Time zone"}
                  value={form.timezone}
                  onChange={(event) => field("timezone", event.target.value)}
                >
                  {zones.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>
        </div>
      </div>
      <button
        type="button"
        className="ps-advanced-trigger"
        aria-haspopup="dialog"
        onClick={() => setAdvancedOpen(true)}
      >
        <SlidersHorizontal />
        {ar ? "إعدادات مساحة العمل المتقدمة" : "Advanced workspace settings"}
        <ChevronDown />
      </button>
      <Dialog
        open={advancedOpen}
        onOpenChange={(open) => {
          if (!saving) setAdvancedOpen(open);
        }}
      >
        <DialogContent
          className="ps-page ps-advanced-dialog"
          dir={ar ? "rtl" : "ltr"}
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>
              {ar ? "إعدادات مساحة العمل المتقدمة" : "Advanced workspace settings"}
            </DialogTitle>
            <DialogDescription>
              {ar
                ? "خصص أدوات مساحة العمل والألوان والتنقل."
                : "Customize workspace tools, colors and navigation."}
            </DialogDescription>
          </DialogHeader>
          <div className="ps-advanced-body space-y-4">
            <section className="qs-interface-visuals qs-card p-4 sm:p-6">
              <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <span className="inline-flex items-center rounded-full bg-orange-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[.14em] text-[#e85d2a]">
                    {ar ? "مرئيات الواجهة" : "Interface visuals"}
                  </span>
                  <h2 className="mt-3 font-display text-xl font-bold tracking-[-.03em]">
                    {ar ? "خصص الصور والأيقونات" : "Customize images & icons"}
                  </h2>
                  <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
                    {ar
                      ? "خصص لوحة أدوات مساحة العمل وبطاقات اختيار القائمة بدون تغيير شعار المطعم أو صورة الغلاف."
                      : "Customize the Workspace Tools panel and Menu selector cards without changing the restaurant logo or cover image."}
                  </p>
                </div>
                <span className="inline-flex items-center gap-2 self-start rounded-xl border border-border bg-card px-3 py-2 text-[10px] font-semibold text-muted-foreground">
                  <SlidersHorizontal className="size-3.5 text-[#e85d2a]" />
                  {ar ? "تخصيص مباشر" : "Live customization"}
                </span>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <section className="qs-interface-asset-card">
                  <div className="qs-interface-asset-head">
                    <div>
                      <span>{ar ? "أدوات مساحة العمل" : "Workspace Tools"}</span>
                      <strong>{ar ? "لوحة الاختصارات" : "Launcher spotlight"}</strong>
                    </div>
                    <div
                      className="qs-interface-asset-mini qs-interface-asset-mini-tools"
                      style={
                        brand.workspaceToolsImage
                          ? {
                              backgroundImage: `linear-gradient(180deg,rgba(15,12,10,.08),rgba(15,12,10,.72)),url(${brand.workspaceToolsImage})`,
                            }
                          : undefined
                      }
                    >
                      {form.logo_url ? (
                        <img src={form.logo_url} alt="" />
                      ) : (
                        <span>Q</span>
                      )}
                    </div>
                  </div>
                  <div className="grid gap-4">
                    <ImageUploader
                      restaurantId={restaurant.id}
                      kind="cover"
                      aspect="wide"
                      value={brand.workspaceToolsImage}
                      onChange={(value) =>
                        setBrand((current) => ({ ...current, workspaceToolsImage: value }))
                      }
                      label={ar ? "صورة اللوحة" : "Panel image"}
                    />

                  </div>
                </section>

                <section className="qs-interface-asset-card">
                  <div className="qs-interface-asset-head">
                    <div>
                      <span>{ar ? "استوديو القائمة" : "Menu Studio"}</span>
                      <strong>{ar ? "بطاقات نوع القائمة" : "Menu type cards"}</strong>
                    </div>
                    <div className="flex gap-1.5">
                      <span
                        className="qs-interface-card-swatch"
                        style={
                          brand.standardMenuCardImage
                            ? { backgroundImage: `url(${brand.standardMenuCardImage})` }
                            : undefined
                        }
                      >
                        <i className="qs-interface-card-system-icon">
                          <BookOpenText className="size-4" strokeWidth={1.9} />
                        </i>
                      </span>
                      <span
                        className="qs-interface-card-swatch"
                        style={
                          brand.pdfMenuCardImage
                            ? { backgroundImage: `url(${brand.pdfMenuCardImage})` }
                            : undefined
                        }
                      >
                        <i className="qs-interface-card-system-icon">
                          <FileText className="size-4" strokeWidth={1.9} />
                        </i>
                      </span>
                    </div>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="qs-interface-upload-group">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="qs-fixed-menu-icon">
                          <BookOpenText className="size-4" strokeWidth={1.9} />
                        </span>
                        <strong className="!mb-0">
                          {ar ? "القائمة العادية" : "Standard Menu"}
                        </strong>
                      </div>
                      <ImageUploader
                        restaurantId={restaurant.id}
                        kind="cover"
                        aspect="wide"
                        value={brand.standardMenuCardImage}
                        onChange={(value) =>
                          setBrand((current) => ({ ...current, standardMenuCardImage: value }))
                        }
                        label={ar ? "صورة البطاقة" : "Card image"}
                      />
                      <p className="mt-2 text-[9px] leading-4 text-muted-foreground">
                        {ar
                          ? "الأيقونة ثابتة من نظام QuickServe وتتبع لون النمط تلقائياً."
                          : "The icon is fixed by QuickServe and automatically follows the active system color."}
                      </p>
                    </div>
                    <div className="qs-interface-upload-group">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="qs-fixed-menu-icon">
                          <FileText className="size-4" strokeWidth={1.9} />
                        </span>
                        <strong className="!mb-0">{ar ? "قائمة PDF" : "PDF Menu"}</strong>
                      </div>
                      <ImageUploader
                        restaurantId={restaurant.id}
                        kind="cover"
                        aspect="wide"
                        value={brand.pdfMenuCardImage}
                        onChange={(value) =>
                          setBrand((current) => ({ ...current, pdfMenuCardImage: value }))
                        }
                        label={ar ? "صورة البطاقة" : "Card image"}
                      />
                      <p className="mt-2 text-[9px] leading-4 text-muted-foreground">
                        {ar
                          ? "الأيقونة ثابتة من نظام QuickServe وتتبع لون النمط تلقائياً."
                          : "The icon is fixed by QuickServe and automatically follows the active system color."}
                      </p>
                    </div>
                  </div>
                </section>
              </div>

              <section className="qs-sidebar-customizer mt-4">
                <div className="qs-sidebar-customizer-head">
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                      <LayoutPanelLeft className="size-4" />
                    </span>
                    <div>
                      <strong>{ar ? "تخصيص التنقل" : "Customize navigation"}</strong>
                      <p>
                        {ar
                          ? "الرئيسية تبقى دائماً أول عنصر. اختر حتى 5 أدوات للقائمة الجانبية؛ شريط الموبايل يعكس نفس الترتيب ويعرض أول 3 أدوات بعد الرئيسية حتى يبقى مريحاً، والباقي يبقى في All tools."
                          : "Home always stays first. Choose up to 5 sidebar tools; mobile mirrors the same order and shows the first 3 after Home so the bottom bar stays comfortable, while everything else stays in All tools."}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="qs-sidebar-count">{pinnedSidebarTools.length}/5</span>
                    <button
                      type="button"
                      className="qs-sidebar-reset"
                      onClick={() => setPinnedSidebarTools([...DEFAULT_SIDEBAR_TOOLS])}
                    >
                      <RotateCcw className="size-3.5" />
                      {ar ? "افتراضي ذكي" : "Smart default"}
                    </button>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="qs-sidebar-bucket">
                    <div className="qs-sidebar-bucket-title">
                      <span>{ar ? "في القائمة الجانبية" : "In sidebar"}</span>
                      <small>{ar ? "الترتيب الظاهر" : "Visible order"}</small>
                    </div>
                    <div className="space-y-2">
                      {pinnedSidebarTools.length ? (
                        pinnedSidebarTools.map((key, index) => (
                          <div key={key} className="qs-sidebar-tool-row is-pinned">
                            <span className="qs-sidebar-tool-index">{index + 2}</span>
                            <strong>{sidebarLabel(key)}</strong>
                            <div className="ms-auto flex items-center gap-1">
                              <button
                                type="button"
                                aria-label={ar ? "تحريك للأعلى" : "Move up"}
                                disabled={index === 0}
                                onClick={() => moveSidebarTool(index, -1)}
                              >
                                <ChevronUp className="size-3.5" />
                              </button>
                              <button
                                type="button"
                                aria-label={ar ? "تحريك للأسفل" : "Move down"}
                                disabled={index === pinnedSidebarTools.length - 1}
                                onClick={() => moveSidebarTool(index, 1)}
                              >
                                <ChevronDown className="size-3.5" />
                              </button>
                              <button
                                type="button"
                                aria-label={
                                  ar ? "إزالة من القائمة الجانبية" : "Remove from sidebar"
                                }
                                onClick={() => removeSidebarTool(key)}
                              >
                                <X className="size-3.5" />
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="qs-sidebar-empty">
                          {ar
                            ? "لم تختر أدوات بعد. ستستخدم QuickServe الترتيب الذكي الحالي حتى تختار."
                            : "No custom tools selected yet. QuickServe keeps the current smart order until you choose."}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="qs-sidebar-bucket">
                    <div className="qs-sidebar-bucket-title">
                      <span>{ar ? "تبقى في All tools" : "Still in All tools"}</span>
                      <small>{ar ? "أضف أي أداة بنقرة" : "Add with one click"}</small>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {sidebarPool.map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          className="qs-sidebar-pool-item"
                          disabled={pinnedSidebarTools.length >= 5}
                          onClick={() => addSidebarTool(item.key)}
                        >
                          <span>{ar ? item.ar : item.en}</span>
                          <Plus className="size-3.5" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="qs-sidebar-preview-strip">
                  <span className="qs-sidebar-preview-home">1 · {ar ? "الرئيسية" : "Home"}</span>
                  {pinnedSidebarTools.map((key, index) => (
                    <span key={key}>
                      {index + 2} · {sidebarLabel(key)}
                    </span>
                  ))}
                  <span className="qs-sidebar-preview-mobile">
                    {ar ? "الموبايل: أول 3" : "Mobile: first 3"}
                  </span>
                  <span className="qs-sidebar-preview-more">
                    {ar ? "الباقي → All tools" : "Rest → All tools"}
                  </span>
                </div>
              </section>
            </section>

            <section className="qs-card p-4 sm:p-6">
              <ApplicationColorStudio
                ar={ar}
                restaurantName={restaurant.name}
                brand={brand}
                setBrand={setBrand}
                primaryColor={form.primary_color}
                accentColor={form.accent_color}
                setPrimaryColor={(value) => field("primary_color", value)}
                setAccentColor={(value) => field("accent_color", value)}
              />
            </section>
          </div>
          <div className="ps-advanced-footer">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => setAdvancedOpen(false)}
            >
              {ar ? "إغلاق" : "Close"}
            </Button>
            <Button
              type="submit"
              form="organization-settings-form"
              disabled={saving || !validColor || !form.name.trim()}
            >
              {saving ? (ar ? "جارٍ الحفظ…" : "Saving…") : ar ? "حفظ التغييرات" : "Save changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <div className="ps-actions">
        <small>
          {ar
            ? "تُطبق الهوية والألوان على مساحة هذا المطعم."
            : "Branding and colors apply to this restaurant workspace."}
        </small>
        <Button
          type="submit"
          disabled={saving || !validColor || !form.name.trim()}
          className="ps-button ps-primary"
        >
          <Save className="size-4" />
          {saving ? (ar ? "جارٍ الحفظ…" : "Saving…") : ar ? "حفظ التغييرات" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
